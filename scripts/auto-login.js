/**
 * auto-login.js — Automatic login module for IEEE Xplore and Wanfang.
 *
 * @deprecated — 万方登录已迁移到 wf-carsi-login.js（导出 checkStatus / login）。
 *   wf-download.js 和 wf-search.js 不再依赖此模块。
 *   IEEE 登录逻辑暂留，待后续迁移到 ieee 专用模块后整体删除。
 *
 * Supports two login modes per platform:
 *   - Direct login: username + password form fill (for IEEE personal account)
 *   - CARSI/SSO login: multi-step institutional login via federation SSO
 *
 * CARSI flow (Wanfang):
 *   CARSI WAYF (ds.carsi.edu.cn) → resolve entityID → Shibboleth SSO → Institution SSO page
 *   → fill creds → submit → authorization page → Accept
 *
 * CARSI flow (IEEE):
 *   /signin → click "Institutional Sign In" → WAYF institution search → select
 *   → Institution SSO page → fill creds → submit → authorization → Accept
 *
 * Module interface:
 *   checkLoginStatus(page, platform) — Detect whether the user is logged in
 *   loginIEEE(page, credentials?)     — IEEE login (direct or CARSI)
 *   loginWanfang(page, credentials?)  — Wanfang login (direct or CARSI)
 *   ensureLoggedIn(page, platform)    — Ensure user is logged in; auto-login via vault if not
 *
 * Dependencies: navigator (smart navigation), credential-vault (credential storage)
 */

import { goto } from './navigator.js';
import { retrieve } from './credential-vault.js';
import { isSessionValid, loadSession, saveSession } from './session-manager.js';
import { get } from './config.js';
import { isInstitutionalAccess, canDownload as netCanDownload } from './network-detector.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Constants ──────────────────────────────────────────────────────────────

const IEEE_LOGIN_URL = 'https://ieeexplore.ieee.org/signin';
const WANFANG_LOGIN_URL = 'https://my.wanfangdata.com.cn/auth/user/alllogin.do?login_mode=AJAX&service=https://www.wanfangdata.com.cn/';
const WANFANG_HOME_URL = 'https://www.wanfangdata.com.cn/';

// ─── Wanfang selectors (confirmed via DOM exploration) ─────────────────────

const WANFANG_LOGIN_PAGE_SELECTORS = {
  // Username/password login tab (my.wanfangdata.com.cn/alllogin.do)
  username: '#txt_username',
  password: '#txt_password',
  submit: '#new_sub_tj',

  // "校外访问" link — empty <a> with href to fsso.wanfangdata.com.cn
  offCampusLink: 'a[href^="https://fsso.wanfangdata.com.cn"]',

  // Phone login (non-CARSI fallback)
  phoneNumber: '#login_phonenum',
  phoneCode: '#phonecode',
  phoneSubmit: '.get-phonenumber-valid',

  // Login form container
  form: '#myform',
};

// ─── FSSO / Institution search selectors (Wanfang) ─────────────────────────

const WANFANG_FSSO_SELECTORS = {
  // Institution search input field (fuzzy match)
  institutionSearch: 'input[type="text"], input:not([type="hidden"])',

  // Institution search results / dropdown
  institutionResult: '[class*="inst"], [class*="school"], li[role="option"], li[class*="item"], .autocomplete-suggestion',

  // "前往" / "Go" button
  institutionGo: 'button, input[type="submit"], a',

  // Wait for institution list after searching
  resultsContainer: '[class*="list"], [class*="result"], ul, [role="listbox"]',
};

// ─── IEEE selectors ────────────────────────────────────────────────────────

const IEEE_SELECTORS = {
  // Direct login form
  username: 'input[name="username"], input[type="email"], #username',
  password: 'input[name="password"], input[type="password"], #password',
  submit: 'button[type="submit"], input[type="submit"], .btn-signin',

  // Institutional sign-in link
  institutionalSignIn: 'a[href*="shibboleth"], a[href*="saml"], a[href*="wayf"], a[href*="institutional"], button:has-text("Institutional"), a:has-text("Institutional")',

  // WAYF / institution search (IEEE)
  institutionSearch: 'input[type="text"], input[placeholder*="institution"], input[placeholder*="search"]',
  institutionGo: 'button[type="submit"], input[type="submit"], button:has-text("Continue"), a:has-text("Continue")',
};

// ─── Generic SSO / authorization selectors ─────────────────────────────────

const SSO_SELECTORS = {
  // Institution SSO page — these are cross-domain so use generic fallbacks
  username: 'input[type="text"], input[type="email"], input[name="username"], input[name="j_username"], input[name="loginfmt"]',
  password: 'input[type="password"], input[name="password"], input[name="j_password"], input[name="passwd"]',
  submit: 'button[type="submit"], input[type="submit"], input[type="image"], button:has-text("登录"), button:has-text("Sign in"), button:has-text("Log in")',

  // Authorization consent page
  acceptButton: 'button:has-text("Accept"), input[value*="Accept"], a:has-text("Accept"), button:has-text("同意"), input[value*="同意"], #acceptButton, [class*="accept"]',
};

const LOGIN_RETRIES = 1; // initial + 1 retry

// ─── Error codes ───────────────────────────────────────────────────────────

export const Errors = Object.freeze({
  LOGIN_FORM_NOT_FOUND: 'LOGIN_FORM_NOT_FOUND',
  LOGIN_INVALID_CREDS: 'LOGIN_INVALID_CREDS',
  LOGIN_CAPTCHA: 'LOGIN_CAPTCHA',
  LOGIN_TIMEOUT: 'LOGIN_TIMEOUT',
  SSO_FAILED: 'SSO_FAILED',
  INSTITUTION_NOT_FOUND: 'INSTITUTION_NOT_FOUND',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  CARSI_STEP_FAILED: 'CARSI_STEP_FAILED',
});

// ─── Path helpers ───────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function getSessionFilePath(platform) {
  return path.join(projectRoot, '.state', 'sessions', `${platform}.json`);
}

// ─── Landing URLs for session verification ─────────────────────────────────

const LANDING_URLS = {
  ieee: 'https://ieeexplore.ieee.org/',
  wanfang: 'https://s.wanfangdata.com.cn/',
};

// ─── Page evaluation scripts (as strings for page.evaluate) ────────────────

function buildIeeeCheckScript() {
  return `
    (() => {
      const bodyText = document.body ? document.body.innerText || '' : '';
      const hasSignOut = /sign\\s*out/i.test(bodyText);
      var accessMatch = bodyText.match(/access\\s+provided\\s+by\\s+([^\\n]+)/i);

      if (hasSignOut) {
        var instEl = document.querySelector('.user-institution, .inst-name, [class*="institution"]');
        return { found: true, text: 'Sign Out', institution: instEl ? instEl.textContent.trim() : null };
      }
      if (accessMatch) {
        return { found: true, text: accessMatch[0], institution: (accessMatch[1] || '').trim() };
      }
      return { found: false, text: null, institution: null };
    })()
  `;
}

function buildWanfangCheckScript() {
  return `
    (() => {
      // Primary: check header/topbar for "退出登录" (most reliable signal)
      var headerEls = document.querySelectorAll('header, .header, .top, .topbar, .user-info, .nav, [class*=header], [class*=top], [class*=login]');
      var headerText = Array.from(headerEls).map(function(el) { return el.textContent; }).join(' ');
      var hasLogout = headerText.indexOf('\\u9000\\u51fa\\u767b\\u5f55') !== -1;
      var usernameEl = document.querySelector('.user-name, [class*="user"], [class*="username"]');

      // If "登录" or "注册" present in header → definitely NOT logged in
      if (/登录|注册/.test(headerText) && !/退出登录/.test(headerText)) {
        return { found: false, text: null, institution: null };
      }
      if (hasLogout) {
        return { found: true, text: '\\u9000\\u51fa\\u767b\\u5f55', institution: usernameEl ? usernameEl.textContent.trim() : null };
      }
      return { found: false, text: null, institution: null };
    })()
  `;
}

// ─── Login status detection ────────────────────────────────────────────────

export async function checkLoginStatus(page, platform) {
  if (platform !== 'ieee' && platform !== 'wanfang') {
    throw new Error(`[auto-login] Unknown platform: ${platform}. Supported: ieee, wanfang`);
  }

  try {
    const scriptSource = platform === 'ieee' ? buildIeeeCheckScript() : buildWanfangCheckScript();
    const result = await page.evaluate(scriptSource);

    return {
      loggedIn: result && result.found === true,
      institution: (result && result.institution) || undefined,
      username: (result && result.institution) || undefined,
    };
  } catch (err) {
    return {
      loggedIn: false,
      error: `Page evaluation failed: ${err.message}`,
    };
  }
}

// ─── Helper: sleep ─────────────────────────────────────────────────────────

/** @type {boolean} Test mode flag — minimal delays */
let _testMode = false;

/**
 * Enable/disable test mode (minimal delays for unit testing).
 * @param {boolean} enabled
 */
export function __setTestMode(enabled = true) {
  _testMode = enabled;
}

function sleep(ms) {
  const actual = _testMode ? Math.min(ms, 50) : ms;
  return new Promise((resolve) => setTimeout(resolve, actual));
}

// ─── Helper: nativeInputValueSetter fill (for Angular/React pages) ──────────

/**
 * Fill an input using nativeInputValueSetter (required for Angular/React pages).
 * Playwright's fill() doesn't trigger framework change detection.
 * Copied from wf-carsi-login.js — verified working with CDP CARSI flow.
 */
async function nativeFill(page, selector, value) {
  await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    ).set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { sel: selector, val: value });
}

// ─── Helper: wait for any of multiple selectors ────────────────────────────

/**
 * Wait for the first of several selectors to appear.
 * Returns the matching selector string, or null if all time out.
 */
async function waitForAnySelector(page, selectors, timeout = 10000) {
  const interval = 200;
  const maxIterations = Math.ceil(timeout / interval);
  for (let i = 0; i < maxIterations; i++) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el && (await el.isVisible())) return sel;
      } catch { /* continue */ }
    }
    await sleep(interval);
  }
  return null;
}

// ─── Retry helper ──────────────────────────────────────────────────────────

async function withLoginRetry(attemptFn) {
  let lastError;

  for (let attempt = 0; attempt <= LOGIN_RETRIES; attempt++) {
    try {
      return await attemptFn();
    } catch (err) {
      lastError = err;
      if (attempt < LOGIN_RETRIES && /timeout|network|NAV_TIMEOUT|NETWORK_ERROR/i.test(err.message)) {
        continue;
      }
      break;
    }
  }

  return {
    success: false,
    message: `${Errors.LOGIN_TIMEOUT}: ${lastError.message}`,
  };
}

// ─── Form filling helpers ──────────────────────────────────────────────────

async function fillField(page, selector, value, timeout = 10000) {
  try {
    // Use state:'attached' — form fields may have CSS that Playwright considers
    // not visible (e.g. opacity transitions, zero-size wrappers). 'attached'
    // only requires DOM presence, matching the old Playwright behavior.
    await page.waitForSelector(selector, { state: 'attached', timeout });
    // Clear field first for reliability
    await page.$eval(selector, (el) => { el.value = ''; });
    await page.fill(selector, value);
    return true;
  } catch {
    return false;
  }
}

async function clickAndWait(page, selector, timeout = 30000) {
  try {
    // Use state:'attached' — buttons may be rendered but not pass Playwright's
    // visibility check (zero-height wrappers, transparent overlays, etc.).
    await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
    // Try Playwright click first (respects actionability checks)
    try {
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout }).catch(() => {}),
        page.click(selector, { timeout: 5000 }),
      ]);
    } catch {
      // Fallback: click via evaluate (bypasses overlay/interception issues)
      await clickViaEvaluate(page, selector);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Click an element using page.evaluate (bypasses overlay/interception issues).
 * Useful when page.click() fails due to LayUI overlays or z-index issues.
 */
async function clickViaEvaluate(page, selector) {
  try {
    // Use state:'attached' — the element may have 0 height (image-only link) and
    // Playwright >= 1.48's waitForSelector defaults to state:'visible', which
    // would timeout for invisible elements. 'attached' only requires DOM presence.
    await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
    await page.$eval(selector, (el) => {
      if (el instanceof HTMLAnchorElement && el.href) {
        // For links, navigate directly
        window.location.href = el.href;
      } else {
        el.click();
      }
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Wait for navigation (page or iframe URL change) ───────────────────────

async function waitForUrlChange(page, currentUrl, timeout = 15000) {
  try {
    await page.waitForFunction(
      (url) => window.location.href !== url,
      currentUrl,
      { timeout },
    );
    return page.url();
  } catch {
    return currentUrl; // no change
  }
}

// ─── Generic SSO handler ───────────────────────────────────────────────────

/**
 * Handle an institution-specific SSO login page.
 * Uses generic selectors to find username/password fields and submit button.
 * Works for most SAML/OAuth SSO forms across different institutions.
 */
async function handleSsoLogin(page, username, password) {
  const currentUrl = page.url();
  console.log(`[auto-login] Handling SSO page: ${currentUrl}`);

  // Wait for page to stabilize (some SSO pages load fields dynamically)
  await sleep(3000);

  // Try to find username field
  const usernameSel = await waitForAnySelector(page, SSO_SELECTORS.username.split(', '), 15000);
  if (!usernameSel) {
    // Try broader: any visible text input
    const allInputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"])'))
        .filter(i => i.offsetParent !== null && (i.type === 'text' || i.type === 'email' || !i.type))
        .map(i => `#${i.id}`)
        .slice(0, 3);
    });
    if (allInputs.length === 0) {
      return { success: false, message: `${Errors.SSO_FAILED}: No username field found on SSO page` };
    }
    await fillField(page, allInputs[0], username);
  } else {
    await fillField(page, usernameSel, username);
  }

  // Find password field
  await sleep(1000);
  const passwordSel = await waitForAnySelector(page, [
    'input[type="password"]',
    ...SSO_SELECTORS.password.split(', '),
  ], 10000);

  if (!passwordSel) {
    return { success: false, message: `${Errors.SSO_FAILED}: No password field found on SSO page` };
  }
  await fillField(page, passwordSel, password);

  // Uncheck "donotcache" and "_shib_idp_revokeConsent" if checked
  await page.evaluate(() => {
    const cb1 = document.querySelector('#donotcache');
    if (cb1 && cb1.checked) cb1.checked = false;
    const cb2 = document.querySelector('#_shib_idp_revokeConsent');
    if (cb2 && cb2.checked) cb2.checked = false;
  });

  // Click submit
  await sleep(1000);
  const submitClicked = await clickAndWait(page, SSO_SELECTORS.submit, 30000);
  if (!submitClicked) {
    return { success: false, message: `${Errors.SSO_FAILED}: Submit button not found on SSO page` };
  }

  return { success: true };
}

// ─── Authorization consent handler ─────────────────────────────────────────

/**
 * Handle the authorization consent page.
 * Selects the "Do not ask me again" option, then clicks Accept.
 * If consent page not found (already accepted), returns silently.
 */
async function handleAuthorizationPage(page) {
  await sleep(3000);

  try {
    // Step A: Select the most permissive consent option ("Do not ask me again")
    // This is typically the last radio button on the Shibboleth consent page.
    // We try by label text first, then fall back to the last radio.
    await page.evaluate(() => {
      const radios = document.querySelectorAll('input[type="radio"]');
      if (radios.length === 0) return;
      // Try by value attribute first (Shibboleth uses doNotAsk values)
      let target = null;
      for (const r of radios) {
        const val = (r.value || '').toLowerCase();
        if (val.includes('donotask') || val.includes('do_not') || val.includes('global')) {
          target = r; break;
        }
      }
      if (!target) {
        // Try by label text
        for (const r of radios) {
          const label = r.parentElement?.textContent?.toLowerCase() || '';
          const nextLabel = (r.nextElementSibling?.textContent || '').toLowerCase();
          const combined = label + nextLabel;
          if (combined.includes('automatically') || combined.includes('any service') || combined.includes('do not ask') || combined.includes('不会在询问')) {
            target = r; break;
          }
        }
      }
      if (!target) {
        // Fallback: pick the last radio (most permissive option is usually last)
        target = radios[radios.length - 1];
      }
      target.click();
    });
    await sleep(1000);

    // Step B: Click Accept / 同意
    const acceptSel = await waitForAnySelector(page, SSO_SELECTORS.acceptButton.split(', '), 5000);
    if (acceptSel) {
      console.log('[auto-login] Authorization page detected, clicking Accept…');
      await page.click(acceptSel);
      await sleep(2000);
      try {
        await page.waitForLoadState('networkidle', { timeout: 30000 });
      } catch { /* navigation might have changed page */ }
      return true;
    }
  } catch {
    // No authorization page — already accepted previously
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CDP MODE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect whether the page is connected via CDP (Chrome DevTools Protocol).
 * Checks the config's browser.mode — set to 'cdp' when --connect-existing is used.
 */
function isCDPMode(_page) {
  try {
    return get('browser.mode') === 'cdp';
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  WANFANG CDP CARSI LOGIN (verified 5-step flow from wf-carsi-login.js)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wanfang CARSI CDP login — transplants the verified 5-step flow from
 * wf-carsi-login.js. Used when the browser is connected via CDP (system Chrome).
 *
 * Key differences from the generic performWanfangCarsiLogin:
 *   - Uses exact verified selectors and timing from wf-carsi-login.js
 *   - Clicks FSSO link in iframe with target=_top (not page.goto FSSO)
 *   - Uses simple #username/#password selectors (not compound selectors)
 *   - Does NOT close browser after login (CLI continues using it)
 *   - Throws on error (catch in caller: ensureLoggedIn)
 *
 * @param {import('playwright').Page} page — CDP-connected page
 * @param {{username:string, password:string, institution:string}} credentials
 * @returns {Promise<{success:boolean, message:string, sessionSaved?:boolean}>}
 */
async function performWanfangCarsiCDP(page, credentials) {
  const { username, password, institution } = credentials;
  console.log(`[auto-login] CDP CARSI: using institution: ${institution}`);

  // ════ Step 1: Wanfang Home → click 登录/注册 → find iframe ════
  console.log('[auto-login] CDP CARSI: Step 1 — Wanfang Home → login modal…');
  // Reset CDP tab first — first tab from system Chrome may be loading chrome://newtab
  await page.goto('about:blank', { waitUntil: 'load', timeout: 5000 }).catch(() => {});
  await page.goto('https://www.wanfangdata.com.cn/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await sleep(5000);

  const loginClicked = await page.evaluate(() => {
    const el = document.querySelector('.anxs-8qwe-login-all');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!loginClicked) {
    throw new Error('CARSI_STEP_FAILED: could not click 登录/注册');
  }
  await sleep(4000);

  // Find login iframe
  const loginFrame = page.frames().find(f =>
    (f.url() || '').includes('my.wanfangdata.com.cn/auth/user/alllogin')
  );
  if (!loginFrame) {
    throw new Error('CARSI_STEP_FAILED: login iframe not found');
  }
  console.log('[auto-login] CDP CARSI: ✅ Login iframe found');

  // ════ Step 2: In iframe → click 校外访问 (FSSO link) ════
  console.log('[auto-login] CDP CARSI: Step 2 — clicking 校外访问…');
  const fssoClicked = await loginFrame.evaluate(() => {
    const link = document.querySelector('a[href*="fsso.wanfangdata.com.cn"]');
    if (link) {
      link.setAttribute('target', '_top');
      link.click();
      return true;
    }
    return false;
  });
  if (!fssoClicked) {
    throw new Error('CARSI_STEP_FAILED: FSSO link not found in iframe');
  }
  console.log('[auto-login] CDP CARSI: ✅ Navigated to FSSO');

  // Wait for FSSO to load
  await sleep(5000);
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}

  // ════ Step 3: FSSO → search institution → click exact match ════
  console.log(`[auto-login] CDP CARSI: Step 3 — FSSO institution search for "${institution}"…`);
  await page.waitForSelector('#searchVal', { timeout: 15000 }).catch(() => {});
  await nativeFill(page, '#searchVal', institution);
  await sleep(3000);

  const instClicked = await page.evaluate((inst) => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if ((link.textContent || '').trim() === inst) {
        link.setAttribute('target', '_self');
        link.click();
        return true;
      }
    }
    return false;
  }, institution);
  if (!instClicked) {
    throw new Error(`CARSI_STEP_FAILED: institution "${institution}" not found in FSSO results`);
  }
  console.log('[auto-login] CDP CARSI: ✅ Clicked institution → redirecting to SSO…');
  await sleep(8000);
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}

  // ════ Step 4: NJUST SSO (e1s1) → fill credentials → submit ════
  console.log('[auto-login] CDP CARSI: Step 4 — awaiting SSO login page…');

  let ssoReady = false;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const curUrl = page.url();

    // Already back on Wanfang? Login complete (session still valid)
    // Use case-insensitive /login/ check — shibboleth.wanfangdata.com.cn/Shibboleth.sso/Login
    // also contains "wanfangdata.com.cn" but is NOT the Wanfang main site.
    if (curUrl.includes('wanfangdata.com.cn') && !/login/i.test(curUrl)) {
      console.log('[auto-login] CDP CARSI: ✅ Already logged in (session valid)');
      ssoReady = true;
      break;
    }

    const hasPasswordField = await page.$('input[type="password"]');
    if (!hasPasswordField) continue;

    console.log('[auto-login] CDP CARSI: SSO form detected, filling credentials…');

    // Fill username + password using native setter
    await page.evaluate(({ u, p }) => {
      const userEl = document.querySelector('#username');
      const passEl = document.querySelector('#password');
      if (userEl) {
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        s.call(userEl, u);
        userEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (passEl) {
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        s.call(passEl, p);
        passEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Uncheck donotcache and revoke consent
      const dc = document.querySelector('#donotcache');
      const rc = document.querySelector('#_shib_idp_revokeConsent');
      if (dc) dc.checked = false;
      if (rc) rc.checked = false;
    }, { u: username, p: password });

    await sleep(500);

    // Submit
    const submitted = await page.evaluate(() => {
      const btn = document.querySelector('button[name="_eventId_proceed"]');
      if (btn) { btn.click(); return 'proceed'; }
      const anyBtn = document.querySelector('button[type="submit"], input[type="submit"]');
      if (anyBtn) { anyBtn.click(); return 'fallback'; }
      const form = document.querySelector('form');
      if (form) { form.submit(); return 'form'; }
      return 'none';
    });
    console.log(`[auto-login] CDP CARSI: ✅ Submitted SSO form (${submitted})`);
    ssoReady = true;
    break;
  }

  if (!ssoReady) {
    throw new Error('CARSI_STEP_FAILED: could not reach SSO login page');
  }

  // Check if already logged in (back on Wanfang)
  // Use case-insensitive /login/ check — see note in polling loop above.
  if (page.url().includes('wanfangdata.com.cn') && !/login/i.test(page.url())) {
    console.log('[auto-login] CDP CARSI: ✅ Login complete (already on Wanfang)');
    const loginStatus = await checkLoginStatus(page, 'wanfang');
    if (loginStatus.loggedIn) {
      console.log(`[auto-login] CDP CARSI: ✅ SUCCESS — login verified (${loginStatus.institution || 'institutional'})`);
      return { success: true, message: 'Wanfang CDP CARSI login successful', sessionSaved: false };
    }
    console.log('[auto-login] CDP CARSI: ⚠️ Login not verified, continuing…');
  }

  // ════ Step 5: Authorization consent (e1s2, may be skipped) ════
  await sleep(5000);
  if (page.url().includes('execution=e1s2')) {
    console.log('[auto-login] CDP CARSI: Step 5 — authorization page → Accept…');
    await page.evaluate(() => {
      const radio = document.querySelector('#_shib_idp_globalConsent');
      if (radio) { radio.checked = true; radio.click(); }
    });
    await sleep(500);
    await page.evaluate(() => {
      const accept = document.querySelector('input[value="Accept"]');
      if (accept) accept.click();
    });
    console.log('[auto-login] CDP CARSI: ✅ Accept clicked');
    await sleep(5000);
    try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}
  } else {
    console.log('[auto-login] CDP CARSI: Step 5 — authorization skipped (already consented)');
  }

  // ════ Verify login with reliable header-restricted check ════
  await sleep(5000);
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}

  const finalUrl = page.url();
  console.log(`[auto-login] CDP CARSI: Final URL: ${finalUrl.slice(0, 100)}`);

  if (finalUrl.includes('/idp/') || finalUrl.includes('/sso/') || finalUrl.includes('Shibboleth')) {
    throw new Error('CARSI_STEP_FAILED: still on SSO page after login');
  }

  // Use checkLoginStatus (header-restricted, reliable) instead of body text search
  const loginStatus = await checkLoginStatus(page, 'wanfang');
  if (!loginStatus.loggedIn) {
    throw new Error('CARSI_STEP_FAILED: login could not be verified after CARSI flow');
  }
  console.log(`[auto-login] CDP CARSI: ✅ SUCCESS — login verified (${loginStatus.institution || 'institutional'})`);

  return { success: true, message: 'Wanfang CDP CARSI login successful', sessionSaved: false };
}

// ═══════════════════════════════════════════════════════════════════════════
//  WANFANG LOGIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wanfang CARSI login flow (CDP mode, verified selectors).
 *
 * T-020-final: Operates on the passed page directly (CDP connection).
 * Uses precise verified selectors from exploration-log.md:
 *
 * Steps:
 *   1. Wanfang Home → click .anxs-8qwe-login-all → find login iframe
 *   2. In iframe: find <a href="https://fsso.wanfangdata.com.cn/">,
 *      override target="_top", click → main page navigates to FSSO
 *   3. FSSO: #searchVal via nativeInputValueSetter, find exact institution
 *      match, override target="_self", click
 *   4. NJUST SSO: #username j_username + #password j_password,
 *      uncheck #donotcache & #_shib_idp_revokeConsent,
 *      submit via button[name="_eventId_proceed"]
 *   5. Authorization (e1s2): #_shib_idp_globalConsent + input[value="Accept"]
 *   6. Verify login → saveSession
 */
async function performWanfangCarsiLogin(page, credentials) {
  const { username, password, institution } = credentials;

  // ── Step 1: Home → click 登录 / 注册 → find iframe ──
  console.log(`[auto-login] Wanfang CARSI: navigating to Wanfang home…`);
  await page.goto(WANFANG_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  console.log(`[auto-login] Step 1: clicking 登录 / 注册…`);
  const loginClicked = await page.evaluate(() => {
    const el = document.querySelector('a.anxs-8qwe-login-all');
    if (el) { el.click(); return true; }
    const all = document.querySelectorAll('a, button, span');
    for (const e of all) {
      if ((e.textContent || '').trim() === '登录 / 注册') { e.click(); return true; }
    }
    return false;
  });
  if (!loginClicked) {
    return { success: false, message: `${Errors.LOGIN_FORM_NOT_FOUND}: Login/Register link not found` };
  }
  await sleep(3000);

  // Find the login iframe by scanning page.frames()
  const loginFrame = page.frames().find(f =>
    (f.url() || '').includes('my.wanfangdata.com.cn/auth/user/alllogin')
  );
  if (!loginFrame) {
    return { success: false, message: `${Errors.CARSI_STEP_FAILED}: Login iframe not found` };
  }
  console.log(`[auto-login] ✅ Found login iframe: ${loginFrame.url().slice(0, 80)}`);

  // ── Step 2: Navigate main page to FSSO directly ──
  console.log(`[auto-login] Step 2: navigating to FSSO…`);
  // Try 1: navigate via iframe (sets cookies/session from login modal)
  const navDone = await loginFrame.evaluate(() => {
    try {
      window.top.location.href = 'https://fsso.wanfangdata.com.cn/';
      return true;
    } catch { return false; }
  }).catch(() => false);
  if (!navDone) {
    // Try 2: navigate main page directly
    console.log(`[auto-login] iframe navigation blocked, using page.goto…`);
    await page.goto('https://fsso.wanfangdata.com.cn/', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
  }
  await sleep(5000);
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}
  console.log(`[auto-login] Current URL: ${page.url().slice(0, 100)}`);

  // ── Step 3: FSSO institution search ──
  console.log(`[auto-login] Step 3: FSSO institution search…`);
  const currentUrl = page.url();
  console.log(`[auto-login] Current URL: ${currentUrl.slice(0, 100)}`);

  if (currentUrl.includes('fsso.wanfangdata.com.cn')) {
    // Fill institution via nativeInputValueSetter (required for Angular reactivity)
    const filled = await page.evaluate((inst) => {
      const inp = document.querySelector('#searchVal');
      if (!inp) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(inp, inst);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, institution);
    if (!filled) {
      return { success: false, message: `${Errors.INSTITUTION_NOT_FOUND}: #searchVal input not found` };
    }
    console.log(`[auto-login] ✅ Filled institution via nativeInputValueSetter`);
    await sleep(3000);

    // Find exact institution match in search results and click
    const instClicked = await page.evaluate((inst) => {
      const items = document.querySelectorAll('a');
      for (const item of items) {
        if ((item.textContent || '').trim() === inst) {
          item.setAttribute('target', '_self');
          item.click();
          return true;
        }
      }
      return false;
    }, institution);
    if (!instClicked) {
      // Print all visible links for debugging
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => a.textContent.trim()).filter(t => t);
      });
      console.log(`[auto-login] ❌ Institution "${institution}" not found in results. Available: ${JSON.stringify(links.slice(0, 20))}`);
      return { success: false, message: `${Errors.INSTITUTION_NOT_FOUND}: Institution "${institution}" not in FSSO results` };
    }
    console.log(`[auto-login] ✅ Clicked exact institution match`);
    await sleep(5000);
    try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}
  }

  // ── Step 4: NJUST SSO (execution=e1s1) ──
  console.log(`[auto-login] Step 4: awaiting institution SSO page…`);
  let ssoHandled = false;
  for (let i = 0; i < 15 && !ssoHandled; i++) {
    await sleep(2000);
    const curUrl = page.url();
    console.log(`[auto-login] SSO wait (${i + 1}/15): ${curUrl.slice(0, 100)}`);

    // Back on Wanfang (not login page) → login complete
    // Use case-insensitive /login/ check — shibboleth.wanfangdata.com.cn/Shibboleth.sso/Login
    // matches "wanfangdata.com.cn" but is NOT the Wanfang main site.
    if (curUrl.includes('wanfangdata.com.cn') && !/login/i.test(curUrl)) {
      console.log(`[auto-login] Back on Wanfang! Login complete.`);
      ssoHandled = true; break;
    }

    // Detect SSO form by password field
    const hasPw = await page.$('input[type="password"]');
    if (hasPw) {
      console.log(`[auto-login] SSO page detected, filling credentials…`);
      await page.evaluate(({ u, p }) => {
        // Fill j_username using native setter
        const userEl = document.querySelector('input#username[name="j_username"], input[name="j_username"]');
        if (userEl) {
          const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          s.call(userEl, u);
          userEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // Fill j_password
        const passEl = document.querySelector('input#password[name="j_password"], input[name="j_password"]');
        if (passEl) {
          const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          s.call(passEl, p);
          passEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // Uncheck unwanted checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          if (cb.id === 'donotcache' || cb.id === '_shib_idp_revokeConsent') {
            cb.checked = false;
          }
        });
      }, { u: username, p: password });
      await sleep(500);

      // Click submit button by name (most reliable for Shibboleth SSO)
      const submitted = await page.evaluate(() => {
        const btn = document.querySelector('button[name="_eventId_proceed"], input[name="_eventId_proceed"]');
        if (btn) { btn.click(); return 'proceed'; }
        // Fallback: any submit button
        const anyBtn = document.querySelector('button[type="submit"], input[type="submit"]');
        if (anyBtn) { anyBtn.click(); return 'fallback'; }
        const form = document.querySelector('form');
        if (form) { form.submit(); return 'form'; }
        return 'none';
      });
      console.log(`[auto-login] ✅ Submitted SSO form: ${submitted}`);
      ssoHandled = true; break;
    }
  }

  if (!ssoHandled) {
    return { success: false, message: `${Errors.INSTITUTION_NOT_FOUND}: Could not reach SSO page for "${institution}"` };
  }

  // ── Step 5: Authorization consent (e1s2, may be skipped) ──
  await sleep(3000);
  const authUrl = page.url();
  if (authUrl.includes('execution=e1s2')) {
    console.log(`[auto-login] Step 5: authorization consent page detected`);
    await page.evaluate(() => {
      const radio = document.querySelector('input#_shib_idp_globalConsent[type="radio"]');
      if (radio) { radio.checked = true; }
    });
    await sleep(500);
    await page.evaluate(() => {
      const accept = document.querySelector('input[value="Accept"]');
      if (accept) { accept.click(); return true; }
      return false;
    });
    console.log(`[auto-login] ✅ Clicked Accept`);
    await sleep(3000);
    try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}
  } else {
    console.log(`[auto-login] Step 5: no authorization page, already consented`);
  }

  // ── Step 6: Verify login + save session ──
  await sleep(3000);
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}

  const finalUrl = page.url();
  console.log(`[auto-login] Final URL: ${finalUrl.slice(0, 100)}`);

  if (finalUrl.includes('/idp/') || finalUrl.includes('/sso/') || finalUrl.includes('Shibboleth')) {
    return { success: false, message: `${Errors.SSO_FAILED}: Still on SSO page after login attempt` };
  }

  // Verify login by checking for institution name in page text
  const loggedIn = await page.evaluate((inst) => {
    const t = document.body?.innerText || '';
    return {
      hasInstitution: t.includes(inst),
      snippet: t.slice(0, 200),
    };
  }, institution);
  console.log(`[auto-login] Login check — institution in text: ${loggedIn.hasInstitution}`);

  console.log(`[auto-login] Saving session…`);
  await saveSession('wanfang', page.context());
  return { success: true, message: 'Wanfang CARSI login successful', sessionSaved: true };
}





/**
 * Wanfang direct login (username + password, non-CARSI).
 * Note: The Wanfang login page includes a slider captcha that requires manual
 * intervention for direct logins.
 */
async function performWanfangDirectLogin(page, credentials) {
  const { username, password } = credentials;

  await goto(page, WANFANG_LOGIN_URL, {
    waitFor: WANFANG_LOGIN_PAGE_SELECTORS.form,
    timeout: 30000,
  });
  await sleep(2000);

  if (!await fillField(page, WANFANG_LOGIN_PAGE_SELECTORS.username, username)) {
    return { success: false, message: `${Errors.LOGIN_FORM_NOT_FOUND}: Username field not found` };
  }
  if (!await fillField(page, WANFANG_LOGIN_PAGE_SELECTORS.password, password)) {
    return { success: false, message: `${Errors.LOGIN_FORM_NOT_FOUND}: Password field not found` };
  }

  // Note: Wanfang direct login has a slider captcha.
  // The submit click may trigger captcha verification.
  const submitClicked = await clickAndWait(page, WANFANG_LOGIN_PAGE_SELECTORS.submit);
  if (!submitClicked) {
    return { success: false, message: `${Errors.LOGIN_FORM_NOT_FOUND}: Submit button not found` };
  }

  // Check if redirected away from login page
  if (page.url().includes('alllogin') || page.url().includes('login')) {
    return {
      success: false,
      message: `${Errors.LOGIN_CAPTCHA}: Login failed — still on login page. ` +
        `CARSI mode is recommended for automated login.`,
    };
  }

  return { success: true, message: 'Wanfang direct login successful' };
}

// ═══════════════════════════════════════════════════════════════════════════
//  IEEE LOGIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * IEEE CARSI login flow (institutional SSO).
 */
async function performIeeeCarsiLogin(page, credentials) {
  const { username, password, institution } = credentials;

  // Step 1: Navigate to IEEE signin page
  console.log(`[auto-login] IEEE CARSI: navigating to /signin…`);
  await goto(page, IEEE_LOGIN_URL, {
    waitFor: 'form, .signin-form, #signin, [class*="login"]',
    timeout: 30000,
  });
  await sleep(3000);

  // Step 2: Click "Institutional Sign In"
  console.log(`[auto-login] IEEE CARSI: clicking Institutional Sign In…`);
  const instClicked = await clickViaEvaluate(page, IEEE_SELECTORS.institutionalSignIn);
  if (!instClicked) {
    // Try by text content
    const textClicked = await page.evaluate(() => {
      const all = document.querySelectorAll('a, button, span');
      for (const el of all) {
        const t = (el.textContent || '').trim().toLowerCase();
        if (t.includes('institutional sign in') || t.includes('access through') || t === 'institutional login') {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (!textClicked) {
      return { success: false, message: `${Errors.LOGIN_FORM_NOT_FOUND}: Institutional Sign In link not found` };
    }
  }

  // Wait for WAYF / institution selection page
  await sleep(5000);
  console.log(`[auto-login] IEEE CARSI: awaiting WAYF page…`);

  // Step 3: Institution search and selection
  if (institution) {
    const searchInput = await waitForAnySelector(page, [
      'input[type="text"]',
      'input:not([type="hidden"])',
      '#institutionSearch',
      '[placeholder*="institution"]',
    ], 15000);

    if (searchInput) {
      console.log(`[auto-login] IEEE: searching institution "${institution}"…`);
      await page.click(searchInput);
      await page.fill(searchInput, '');
      await page.fill(searchInput, institution);
      await sleep(3000);

      // Click matching institution from results
      const clicked = await page.evaluate((instName) => {
        const items = document.querySelectorAll('li, [role="option"], [class*="result"], a, button');
        for (const item of items) {
          const text = (item.textContent || '').trim().toLowerCase();
          if (text.includes(instName.toLowerCase())) {
            item.click();
            return true;
          }
        }
        return false;
      }, institution);

      if (!clicked) {
        await page.keyboard.press('Enter');
      }
      await sleep(3000);
    } else {
      // Some IEEE WAYF pages use a dropdown select instead
      const selectEl = await page.$('select');
      if (selectEl) {
        await page.selectOption('select', institution);
        await sleep(1000);
      }
    }
  }

  // Step 4: Handle SSO page
  await sleep(3000);
  const hasPasswordField = await page.$('input[type="password"]');
  if (hasPasswordField) {
    console.log(`[auto-login] IEEE SSO page detected…`);
    const ssoResult = await handleSsoLogin(page, username, password);
    if (!ssoResult.success) return ssoResult;
  }

  // Step 5: Authorization consent
  await handleAuthorizationPage(page);

  // Step 6: Wait for redirect back to IEEE
  await sleep(5000);
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch { /* ok */ }

  const finalUrl = page.url();
  if (finalUrl.includes('signin')) {
    return { success: false, message: `${Errors.SSO_FAILED}: Still on Sign In page` };
  }

  return { success: true, message: 'IEEE CARSI login successful' };
}

/**
 * IEEE direct login (personal account).
 */
async function performIeeeDirectLogin(page, credentials) {
  const { username, password } = credentials;

  await goto(page, IEEE_LOGIN_URL, {
    waitFor: 'form, .signin-form, #signin, [class*="login"]',
    timeout: 30000,
  });

  if (!await fillField(page, IEEE_SELECTORS.username, username)) {
    return { success: false, message: `${Errors.LOGIN_FORM_NOT_FOUND}: Username field not found` };
  }
  if (!await fillField(page, IEEE_SELECTORS.password, password)) {
    return { success: false, message: `${Errors.LOGIN_FORM_NOT_FOUND}: Password field not found` };
  }

  await clickAndWait(page, IEEE_SELECTORS.submit);

  if (page.url().includes('/signin')) {
    return { success: false, message: `${Errors.LOGIN_INVALID_CREDS}: Login failed — still on signin page.` };
  }

  return { success: true, message: 'IEEE direct login successful' };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fill and submit the Wanfang login form.
 *
 * Auto-detects login mode:
 *   - If credentials include `institution` → CARSI/SSO flow
 *   - If only `username` + `password` → direct login flow
 *
 * @param {import('playwright').Page} page
 * @param {{username: string, password: string, institution?: string}} [credentials]
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function loginWanfang(page, credentials) {
  if (!credentials) {
    const vaultCreds = await retrieve('wanfang');
    if (!vaultCreds) {
      throw new Error(
        `[auto-login] No stored credentials for Wanfang. ` +
        `Run init-wizard to store credentials first.`,
      );
    }
    credentials = vaultCreds;
  }

  const isCarsi = !!(credentials.institution && credentials.institution.trim());

  return withLoginRetry(() =>
    isCarsi
      ? performWanfangCarsiLogin(page, credentials)
      : performWanfangDirectLogin(page, credentials),
  );
}

/**
 * Fill and submit the IEEE Xplore login form.
 *
 * Auto-detects login mode:
 *   - If credentials include `institution` → CARSI/SSO flow
 *   - If only `username` + `password` → direct login flow
 *
 * @param {import('playwright').Page} page
 * @param {{username: string, password: string, institution?: string}} [credentials]
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function loginIEEE(page, credentials) {
  if (!credentials) {
    const vaultCreds = await retrieve('ieee');
    if (!vaultCreds) {
      throw new Error(
        `[auto-login] No stored credentials for IEEE Xplore. ` +
        `Run init-wizard to store credentials first.`,
      );
    }
    credentials = vaultCreds;
  }

  const isCarsi = !!(credentials.institution && credentials.institution.trim());

  return withLoginRetry(() =>
    isCarsi
      ? performIeeeCarsiLogin(page, credentials)
      : performIeeeDirectLogin(page, credentials),
  );
}

/**
 * Ensure the user is logged in on a platform.
 *
 * Three-layer routing:
 *   1. Institutional network check → skip CARSI, return immediately
 *   2. Session cache check → restore and verify
 *   3. Credential-based login routing (CDP CARSI / direct form / error)
 *
 * @param {import('playwright').Page} page
 * @param {'ieee'|'wanfang'} platform
 * @returns {Promise<{loggedIn?: boolean, success?: boolean, message?: string, institution?: string, username?: string, error?: string}>}
 */
export async function ensureLoggedIn(page, platform) {
  if (platform !== 'ieee' && platform !== 'wanfang') {
    throw new Error(`[auto-login] Unknown platform: ${platform}. Supported: ieee, wanfang`);
  }

  // ════ Layer 1: Institutional network check ════
  // If the current network provides direct institutional IP access,
  // skip all login flows — the platform already grants access.
  try {
    const hasInstitutionalAccess = await isInstitutionalAccess(page, platform);
    if (hasInstitutionalAccess) {
      console.log(`[auto-login] ✅ Institutional IP access detected for ${platform} — no login needed`);
      return { loggedIn: true, message: `Institutional IP access for ${platform}` };
    }
  } catch (err) {
    // Non-critical: if network detection fails, fall through to session/credential flow
    console.warn(`[auto-login] Network detection warning: ${err.message}`);
  }

  // ════ Layer 2: Session cache ════
  if (isSessionValid(platform)) {
    const state = loadSession(platform);
    if (state) {
      await page.context().setStorageState(state);
    }
    // Verify session by navigating to platform and checking login status.
    // A TTL-valid session file may contain stale cookies (e.g. after browser switch).
    try {
      await goto(page, LANDING_URLS[platform], { timeout: 15000 }).catch(() => {});
      const verifyStatus = await checkLoginStatus(page, platform);
      if (verifyStatus.loggedIn) {
        return { loggedIn: true, message: `Session verified for ${platform}` };
      }
    } catch { /* verification failed — session stale */ }
    // Delete stale session and fall through to re-login
    try { fs.unlinkSync(getSessionFilePath(platform)); } catch { /* ignore */ }
  }

  // ════ Layer 3: Credential-based login ════
  const credentials = await retrieve(platform);
  if (!credentials) {
    throw new Error(
      `[auto-login] No stored credentials for ${platform}. ` +
      `Run init-wizard to store credentials first.`,
    );
  }

  const hasCarsiCreds = !!(credentials.institution && credentials.institution.trim());

  // Route 3a: CDP CARSI — has CARSI creds + CDP browser mode
  if (platform === 'wanfang' && hasCarsiCreds && isCDPMode(page)) {
    console.log('[auto-login] CDP CARSI mode detected, attempting CARSI login…');
    try {
      const cdpResult = await performWanfangCarsiCDP(page, credentials);
      if (cdpResult.success) {
        try { await saveSession('wanfang', page.context()); } catch { /* non-critical */ }
        return { loggedIn: true, success: true, message: cdpResult.message };
      }
    } catch (err) {
      console.error(`[auto-login] CDP CARSI error: ${err.message}`);
      // Fall through to next route
    }
  }

  // Route 3b: Direct login (subscription account — form fill)
  const loginFn = platform === 'ieee' ? loginIEEE : loginWanfang;
  const result = await loginFn(page, credentials);

  // Save session on success (CDP CARSI flows save internally; skip those)
  if (result.success && !result.sessionSaved) {
    try { await saveSession(platform, page.context()); } catch { /* non-critical */ }
  }

  // Normalize: ensure loggedIn is set on success (login functions may not include it)
  if (result.success && !result.loggedIn) {
    result.loggedIn = true;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DOWNLOAD PERMISSION & ACCESS REFRESH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check whether the current page has download permission for the given platform.
 *
 * Delegates to network-detector.canDownload() which checks for platform-specific
 * download markers (e.g. Wanfang "hasFull" class, IEEE "stampPDF" link).
 *
 * @param {import('playwright').Page} page — Navigated to a paper / detail page
 * @param {'ieee'|'wanfang'} platform
 * @returns {Promise<boolean>} True if download appears permitted
 */
export { netCanDownload as canDownload };

/**
 * Refresh access by re-navigating to the platform and re-checking.
 *
 * If the user is still logged in but access has expired (e.g. session timeout,
 * IP-range change), this re-checks login status and re-authenticates if needed.
 *
 * @param {import('playwright').Page} page
 * @param {'ieee'|'wanfang'} platform
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function refreshAccess(page, platform) {
  if (platform !== 'ieee' && platform !== 'wanfang') {
    throw new Error(`[auto-login] Unknown platform: ${platform}. Supported: ieee, wanfang`);
  }

  try {
    // Navigate to platform home to trigger fresh state
    await goto(page, LANDING_URLS[platform], { timeout: 20000 }).catch(() => {});

    // Check if still logged in
    const status = await checkLoginStatus(page, platform);
    if (status.loggedIn) {
      return { success: true, message: `Access refreshed for ${platform}` };
    }

    // Not logged in — re-authenticate
    console.log(`[auto-login] Session expired for ${platform}, re-authenticating…`);
    const loginResult = await ensureLoggedIn(page, platform);
    return {
      success: !!(loginResult.success || loginResult.loggedIn),
      message: loginResult.message || (loginResult.success ? 'Re-authenticated' : 'Re-auth failed'),
    };
  } catch (err) {
    return {
      success: false,
      message: `Access refresh failed for ${platform}: ${err.message}`,
    };
  }
}
