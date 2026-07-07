/**
 * network-detector.js — Network environment detection module.
 *
 * Detects whether the current network is an institutional IP (university/library),
 * a VPN/proxy, or a public network, and recommends the optimal access strategy.
 *
 * Module interface:
 *   detectNetworkType(page)                  — Classify network as institutional-ip / vpn / public
 *   isInstitutionalAccess(page, platform)    — Quick check for institutional IP access
 *   getRecommendedMode(networkType)          — Map network type to access mode
 *   canDownload(page, platform)              — Check current download permission
 *
 * Dependencies: playwright (Page), navigator (goto)
 *
 * Platform URLs:
 *   IEEE:  https://ieeexplore.ieee.org/
 *   Wanfang: https://www.wanfangdata.com.cn/
 *
 * Institution detection patterns:
 *   - Wanfang: body text matching "大学图书馆", institution name in page content
 *   - IEEE: "Access provided by" in page body
 */

// ─── Constants ────────────────────────────────────────────────────────────

/** @type {string} */
const IEEE_HOME = 'https://ieeexplore.ieee.org/';

/** @type {string} */
const WANFANG_HOME = 'https://www.wanfangdata.com.cn/';

/** @type {Readonly<{INSTITUTIONAL_IP: string, VPN: string, PUBLIC: string}>} */
const NETWORK_TYPES = Object.freeze({
  INSTITUTIONAL_IP: 'institutional-ip',
  VPN: 'vpn',
  PUBLIC: 'public',
});

/** @type {Readonly<{DIRECT: string, CDP: string, CREDENTIALS: string}>} */
const ACCESS_MODES = Object.freeze({
  DIRECT: 'direct',
  CDP: 'cdp',
  CREDENTIALS: 'credentials',
});

/** Navigation timeout for network detection probes (shorter than normal navigation). */
const PROBE_TIMEOUT = 15000;

// ─── Error class ──────────────────────────────────────────────────────────

export class NetworkDetectorError extends Error {
  /**
   * @param {'NET_DETECT_FAIL'|'NET_INVALID_PLATFORM'|'NET_NO_PAGE'} code
   * @param {string} message
   * @param {object} [details]
   */
  constructor(code, message, details) {
    super(`[${code}] ${message}`);
    this.name = 'NetworkDetectorError';
    this.code = code;
    this.details = details;
  }
}

// ─── Internal: platform configuration ─────────────────────────────────────

/**
 * Platform-specific addresses and detection selectors.
 */
const PLATFORMS = Object.freeze({
  ieee: {
    home: IEEE_HOME,
    /** CSS selector / text pattern for institution banner */
    institutionSelector: 'text=Access provided by',
    /** CSS selector for the institution badge element */
    institutionBadge: '[class*="institution"]',
    /** JS expression to extract institution name from page */
    extractInstitution: /* js */ `(() => {
      const el = document.querySelector('[class*="institution"], [class*="access-provided"], .header-institution');
      if (el) return el.textContent.trim();
      const body = document.body.textContent;
      const m = body.match(/Access provided by\\s+(.+?)(?:\\s*[\\n.]|$)/);
      return m ? m[1].trim() : null;
    })()`,
    /** JS expression to check download permission */
    canDownload: /* js */ `!!document.querySelector('a[href*="stampPDF"], a[href*="/document/"]')`,
  },
  wanfang: {
    home: WANFANG_HOME,
    /** CSS selector for institution indicator (e.g. FSSO login link absence implies direct access) */
    institutionSelector: 'a[href*="fsso.wanfangdata.com.cn"]',
    /** CSS selector for "欢迎" or institution name in page header */
    welcomeBanner: 'text=欢迎',
    /** JS expression to extract institution name — only from header/topbar, not whole body */
    extractInstitution: /* js */ `(() => {
      const headerEls = document.querySelectorAll('header, .header, .top, .topbar, .user-info, .nav, [class*=header], [class*=top], [class*=login]');
      const headerText = Array.from(headerEls).map(el => el.textContent).join(' ');
      // Only extract if page is logged in (no naked 登录/注册 in header)
      if (/登录|注册/.test(headerText) && !/退出登录/.test(headerText)) return null;
      const m = headerText.match(/([\\u4e00-\\u9fa5]{2,}(?:大学|学院|图书馆|研究所|研究院))/) ||
               headerText.match(/欢迎\\s*([\\u4e00-\\u9fa5]{2,}(?:大学|学院|图书馆))/);
      return m ? m[1].trim() : null;
    })()`,
    /** JS expression to check download permission (hasFull indicator) */
    canDownload: /* js */ `!!document.querySelector('[class*="hasFull"], [class*="download"], a[href*="download"])`,
  },
});

// ─── Internal helpers ─────────────────────────────────────────────────────

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Navigate to a URL with a short timeout for probing purposes.
 * Returns whether navigation succeeded (response received with HTTP status < 400).
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {string} url - URL to navigate to
 * @param {number} [timeout] - Navigation timeout in ms
 * @returns {Promise<{ok: boolean, status?: number, error?: string}>}
 */
async function probeUrl(page, url, timeout = PROBE_TIMEOUT) {
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    if (response) {
      // Check response.ok — it may be a function (Playwright Response) or boolean (simple mock)
      const ok = typeof response.ok === 'function' ? response.ok() : Boolean(response.ok);
      const status = typeof response.status === 'function' ? response.status() : response.status;
      return { ok, status };
    }
    // about:blank or no response object
    return { ok: false, status: 0, error: 'No response' };
  } catch (err) {
    const msg = err.message || '';
    return { ok: false, status: 0, error: msg };
  }
}

/**
 * Safely evaluate a JavaScript expression on the page.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {string} expression - JS expression to evaluate
 * @returns {Promise<*>} Evaluation result, or null on failure
 */
async function safeEval(page, expression) {
  try {
    return await page.evaluate(expression);
  } catch {
    return null;
  }
}

/**
 * Check if a Wanfang page shows institutional (CARSI/FSSO) access patterns.
 * FSSO link present → likely NOT institutional IP (needs federated login).
 * No FSSO link + page loaded → likely institutional IP.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<{isInstitutional: boolean, institutionName: string|null}>}
 */
async function checkWanfangInstitution(page) {
  // Check for FSSO link — presence means not direct institutional access
  const hasFSSO = await page.locator('a[href*="fsso.wanfangdata.com.cn"]').count().catch(() => 0);
  if (hasFSSO > 0) {
    // FSSO present → need federated login, not direct institutional IP
    return { isInstitutional: false, institutionName: null };
  }

  // Check header for logged-in indicators
  // "登录/注册" present → definitely NOT logged in (simplest, most reliable check)
  // "退出登录" present → logged in
  const headerCheck = await safeEval(page, /* js */ `(() => {
    const headerEls = document.querySelectorAll('header, .header, .top, .topbar, .user-info, .nav, [class*=header], [class*=top], [class*=login]');
    const text = Array.from(headerEls).map(el => el.textContent).join(' ');
    const hasLoginRegister = /登录|注册/.test(text);
    const hasLogout = /退出登录|退出|注销/.test(text);
    // Logged in only if: has logout and does NOT have naked login/register
    const isLoggedIn = hasLogout || (!hasLoginRegister && /(大学|学院|研究所|研究院)/.test(text));
    return { isLoggedIn };
  })()`);

  if (!headerCheck || !headerCheck.isLoggedIn) {
    return { isInstitutional: false, institutionName: null };
  }

  // Extract institution name from header only
  const institutionName = await safeEval(page, PLATFORMS.wanfang.extractInstitution);
  return {
    isInstitutional: !!institutionName,
    institutionName: institutionName || null,
  };
}

/**
 * Check if an IEEE page shows institutional access ("Access provided by").
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<{isInstitutional: boolean, institutionName: string|null}>}
 */
async function checkIEEEDetection(page) {
  const institutionName = await safeEval(page, PLATFORMS.ieee.extractInstitution);
  return {
    isInstitutional: !!institutionName,
    institutionName: institutionName || null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Detect and classify the current network environment.
 *
 * Navigates to Wanfang and IEEE homepages and analyzes the responses.
 * Determines whether the client is on an institutional IP, behind a VPN, or
 * on a public network.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<{type: string, details: {wanfangAccessible: boolean, ieeeAccessible: boolean, detectedInstitution: string|null}}>}
 * @throws {NetworkDetectorError} NET_NO_PAGE — if page is null/undefined
 */
export async function detectNetworkType(page) {
  if (!page) {
    throw new NetworkDetectorError('NET_NO_PAGE', 'A Playwright page object is required');
  }

  // ── Probe Wanfang ──
  const wfResult = await probeUrl(page, WANFANG_HOME);
  const wanfangAccessible = wfResult.ok;

  // Check for captcha redirect
  const currentUrl = page.url();
  if (/verify|captcha|challenge/i.test(currentUrl)) {
    return {
      type: 'captcha',
      details: {
        wanfangAccessible: false,
        ieeeAccessible: false,
        detectedInstitution: null,
      },
      message: '请手动完成验证码',
    };
  }

  /** @type {string|null} */
  let detectedInstitution = null;

  if (wanfangAccessible) {
    const wfInst = await checkWanfangInstitution(page);
    if (wfInst.isInstitutional) {
      detectedInstitution = wfInst.institutionName;
      return {
        type: NETWORK_TYPES.INSTITUTIONAL_IP,
        details: {
          wanfangAccessible: true,
          ieeeAccessible: true,   // will confirm below
          detectedInstitution,
        },
      };
    }
  }

  // ── Probe IEEE ──
  const ieeeResult = await probeUrl(page, IEEE_HOME);
  const ieeeAccessible = ieeeResult.ok;

  if (ieeeAccessible) {
    const ieeeInst = await checkIEEEDetection(page);
    if (ieeeInst.isInstitutional) {
      detectedInstitution = detectedInstitution || ieeeInst.institutionName;
      return {
        type: NETWORK_TYPES.INSTITUTIONAL_IP,
        details: {
          wanfangAccessible,
          ieeeAccessible: true,
          detectedInstitution,
        },
      };
    }
  }

  // ── Classify ──
  if (!wanfangAccessible && ieeeAccessible) {
    // Wanfang blocked but IEEE works — typical VPN interference pattern
    return {
      type: NETWORK_TYPES.VPN,
      details: {
        wanfangAccessible: false,
        ieeeAccessible: true,
        detectedInstitution: null,
      },
    };
  }

  // Both accessible w/out institution, or both blocked, or only Wanfang works
  return {
    type: NETWORK_TYPES.PUBLIC,
    details: {
      wanfangAccessible,
      ieeeAccessible,
      detectedInstitution: null,
    },
  };
}

/**
 * Quick check whether the current page or session has institutional access
 * to a specific academic platform.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {'ieee'|'wanfang'} platform - Target platform
 * @returns {Promise<boolean>} True if institutional IP access is detected
 * @throws {NetworkDetectorError} NET_NO_PAGE / NET_INVALID_PLATFORM
 */
export async function isInstitutionalAccess(page, platform) {
  if (!page) {
    throw new NetworkDetectorError('NET_NO_PAGE', 'A Playwright page object is required');
  }
  if (platform !== 'ieee' && platform !== 'wanfang') {
    throw new NetworkDetectorError(
      'NET_INVALID_PLATFORM',
      `Unknown platform: ${platform}. Supported: ieee, wanfang`,
    );
  }

  const config = PLATFORMS[platform];

  // Navigate to the platform homepage
  const navResult = await probeUrl(page, config.home);
  if (!navResult.ok) {
    return false;
  }

  // Check institution markers
  if (platform === 'wanfang') {
    const result = await checkWanfangInstitution(page);
    return result.isInstitutional;
  }

  // IEEE
  const result = await checkIEEEDetection(page);
  return result.isInstitutional;
}

/**
 * Get the recommended access mode based on the detected network type.
 *
 * Mapping:
 *   institutional-ip → 'direct'   (direct browser launch, no auth needed)
 *   vpn              → 'cdp'      (use CDP with user's existing browser session)
 *   public           → 'credentials' (use stored credentials for institutional login)
 *
 * @param {string} networkType - One of 'institutional-ip', 'vpn', 'public'
 * @returns {'direct'|'cdp'|'credentials'} Recommended access mode
 */
export function getRecommendedMode(networkType) {
  switch (networkType) {
    case NETWORK_TYPES.INSTITUTIONAL_IP:
      return ACCESS_MODES.DIRECT;
    case NETWORK_TYPES.VPN:
      return ACCESS_MODES.CDP;
    case NETWORK_TYPES.PUBLIC:
    default:
      return ACCESS_MODES.CREDENTIALS;
  }
}

/**
 * Check whether the current page has download permission for the given platform.
 *
 * For Wanfang: checks for "hasFull" class or download link presence.
 * For IEEE: checks for PDF stamp link or document link presence.
 *
 * @param {import('playwright').Page} page - Playwright page object (navigated to a paper/detail page)
 * @param {'ieee'|'wanfang'} platform - Target platform
 * @returns {Promise<boolean>} True if download appears to be permitted
 * @throws {NetworkDetectorError} NET_NO_PAGE / NET_INVALID_PLATFORM
 */
export async function canDownload(page, platform) {
  if (!page) {
    throw new NetworkDetectorError('NET_NO_PAGE', 'A Playwright page object is required');
  }
  if (platform !== 'ieee' && platform !== 'wanfang') {
    throw new NetworkDetectorError(
      'NET_INVALID_PLATFORM',
      `Unknown platform: ${platform}. Supported: ieee, wanfang`,
    );
  }

  const config = PLATFORMS[platform];
  const result = await safeEval(page, config.canDownload);
  return result === true;
}

// ─── Exported for testing ─────────────────────────────────────────────────

/**
 * Access platform constants for testing.
 * @returns {typeof PLATFORMS}
 */
export function getPlatforms() {
  return PLATFORMS;
}

/**
 * Access network type constants for testing.
 * @returns {typeof NETWORK_TYPES}
 */
export function getNetworkTypes() {
  return NETWORK_TYPES;
}
