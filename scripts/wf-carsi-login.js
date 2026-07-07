/**
 * wf-carsi-login.js — Wanfang CARSI SSO login (CDP mode)
 *
 * Usage (CLI):
 *   node wf-carsi-login.js [--port 9222] [--timeout 60000]
 *
 * Usage (module):
 *   import { checkStatus, login } from './wf-carsi-login.js';
 *
 *   const status = await checkStatus(page);       // → { loggedIn, institution }
 *   const result = await login(page, creds, opts); // → { success, message }
 *
 * Dependencies: credential-vault, playwright (CLI only)
 */

import { retrieve, setMasterKey } from './credential-vault.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fill an input using nativeInputValueSetter (required for Angular/React pages).
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

// ─── Login status check ─────────────────────────────────────────────────────

/**
 * Check if the current Wanfang page shows logged-in state.
 * Only searches header/topbar elements — footer links to partner institutions
 * do NOT count as logged in.
 *
 * @param {import('playwright').Page} page — already navigated to a Wanfang page
 * @returns {Promise<{loggedIn: boolean, institution?: string}>}
 */
export async function checkStatus(page) {
  try {
    const result = await page.evaluate(() => {
      var headerEls = document.querySelectorAll('header, .header, .top, .topbar, .user-info, .nav, [class*=header], [class*=top]');
      var headerText = Array.from(headerEls).map(function(el) { return el.textContent; }).join(' ');
      // "退出登录" → definitely logged in
      if (headerText.indexOf('\u9000\u51fa\u767b\u5f55') !== -1) {
        return { found: true };
      }
      // "登录" or "注册" (but not "退出登录") → definitely NOT logged in
      if (/登录|注册/.test(headerText)) {
        return { found: false };
      }
      return { found: false };
    });
    return { loggedIn: !!(result && result.found === true) };
  } catch {
    return { loggedIn: false };
  }
}

// ─── CARSI login flow ───────────────────────────────────────────────────────

/**
 * Perform Wanfang CARSI SSO login on an already-connected CDP page.
 * If the page is already logged in, returns immediately.
 *
 * @param {import('playwright').Page} page — CDP page (Chrome already connected)
 * @param {{username: string, password: string, institution: string}} creds
 * @param {{timeout?: number}} [opts]
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function login(page, creds, opts = {}) {
  const { username, password, institution } = creds;
  const navTimeout = opts.timeout || 30000;
  console.log(`[wf-carsi] Using institution: ${institution}`);

  try {
    // ════ Step 1: Wanfang Home → click 登录/注册 → find iframe ════
    console.log('[wf-carsi] Step 1: Wanfang Home → login modal…');
    await page.goto('about:blank', { waitUntil: 'load', timeout: 5000 }).catch(() => {});
    await page.goto('https://www.wanfangdata.com.cn/', {
      waitUntil: 'domcontentloaded',
      timeout: navTimeout,
    });
    await sleep(5000);

    const loginClicked = await page.evaluate(() => {
      const el = document.querySelector('.anxs-8qwe-login-all');
      if (el) { el.click(); return true; }
      return false;
    });
    if (!loginClicked) {
      return { success: false, message: 'CARSI_STEP_FAILED: could not click 登录/注册' };
    }
    await sleep(4000);

    const loginFrame = page.frames().find(f =>
      (f.url() || '').includes('my.wanfangdata.com.cn/auth/user/alllogin')
    );
    if (!loginFrame) {
      return { success: false, message: 'CARSI_STEP_FAILED: login iframe not found' };
    }
    console.log('[wf-carsi] ✅ Login iframe found');

    // ════ Step 2: In iframe → click 校外访问 (FSSO link) ════
    console.log('[wf-carsi] Step 2: clicking 校外访问…');
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
      return { success: false, message: 'CARSI_STEP_FAILED: FSSO link not found in iframe' };
    }
    console.log('[wf-carsi] ✅ Navigated to FSSO');

    await sleep(5000);
    try { await page.waitForLoadState('networkidle', { timeout: navTimeout }); } catch {}

    // ════ Step 3: FSSO → search institution → click exact match ════
    console.log(`[wf-carsi] Step 3: FSSO institution search for "${institution}"…`);
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
      // FSSO page may not have loaded — SSO session may already be valid
      if (page.url().includes('wanfangdata.com.cn') && !/login/i.test(page.url())) {
        console.log('[wf-carsi] ✅ Already logged in (SSO session valid, FSSO skipped)');
        return { success: true, message: 'Already logged in via SSO session' };
      }
      return { success: false, message: `CARSI_STEP_FAILED: institution "${institution}" not found in FSSO results` };
    }
    console.log('[wf-carsi] ✅ Clicked institution → redirecting to SSO…');
    await sleep(8000);
    try { await page.waitForLoadState('networkidle', { timeout: navTimeout }); } catch {}

    // ════ Step 4: SSO login page → fill credentials → submit ════
    console.log('[wf-carsi] Step 4: awaiting SSO login page…');

    let ssoReady = false;
    for (let i = 0; i < 15; i++) {
      await sleep(2000);
      const url = page.url();

      if (url.includes('wanfangdata.com.cn') && !/login/i.test(url)) {
        console.log('[wf-carsi] ✅ Already logged in (session valid)');
        ssoReady = true;
        break;
      }

      const hasPasswordField = await page.$('input[type="password"]');
      if (!hasPasswordField) continue;

      console.log('[wf-carsi] SSO form detected, filling credentials…');
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
        const dc = document.querySelector('#donotcache');
        const rc = document.querySelector('#_shib_idp_revokeConsent');
        if (dc) dc.checked = false;
        if (rc) rc.checked = false;
      }, { u: username, p: password });

      await sleep(500);

      const submitted = await page.evaluate(() => {
        const btn = document.querySelector('button[name="_eventId_proceed"]');
        if (btn) { btn.click(); return 'proceed'; }
        const anyBtn = document.querySelector('button[type="submit"], input[type="submit"]');
        if (anyBtn) { anyBtn.click(); return 'fallback'; }
        const form = document.querySelector('form');
        if (form) { form.submit(); return 'form'; }
        return 'none';
      });
      console.log(`[wf-carsi] ✅ Submitted SSO form (${submitted})`);
      ssoReady = true;
      break;
    }

    if (!ssoReady) {
      return { success: false, message: 'CARSI_STEP_FAILED: could not reach SSO login page' };
    }

    // ════ Step 5: Authorization consent (e1s2, may be skipped) ════
    // If already on Wanfang, login is complete
    if (page.url().includes('wanfangdata.com.cn') && !/login/i.test(page.url())) {
      const status = await checkStatus(page);
      if (status.loggedIn) {
        console.log(`[wf-carsi] ✅ SUCCESS`);
        return { success: true, message: 'CARSI login successful' };
      }
    }

    await sleep(5000);
    if (page.url().includes('execution=e1s2')) {
      console.log('[wf-carsi] Step 5: authorization page → Accept…');
      await page.evaluate(() => {
        const radio = document.querySelector('#_shib_idp_globalConsent');
        if (radio) { radio.checked = true; radio.click(); }
      });
      await sleep(500);
      await page.evaluate(() => {
        const accept = document.querySelector('input[value="Accept"]');
        if (accept) accept.click();
      });
      console.log('[wf-carsi] ✅ Accept clicked');
      await sleep(5000);
      try { await page.waitForLoadState('networkidle', { timeout: navTimeout }); } catch {}
    } else {
      console.log('[wf-carsi] Step 5: authorization skipped');
    }

    // ════ Final verify ════
    await sleep(5000);
    try { await page.waitForLoadState('networkidle', { timeout: navTimeout }); } catch {}

    const finalUrl = page.url();
    console.log(`[wf-carsi] Final URL: ${finalUrl.slice(0, 100)}`);

    if (finalUrl.includes('/idp/') || finalUrl.includes('/sso/') || finalUrl.includes('Shibboleth')) {
      return { success: false, message: 'CARSI_STEP_FAILED: still on SSO page after login' };
    }

    const finalStatus = await checkStatus(page);
    if (!finalStatus.loggedIn) {
      return { success: false, message: 'CARSI_STEP_FAILED: login could not be verified' };
    }
    console.log(`[wf-carsi] ✅ SUCCESS`);
    return { success: true, message: 'CARSI login successful' };

  } catch (err) {
    return { success: false, message: `CARSI error: ${err.message}` };
  }
}

// ─── CLI entry ──────────────────────────────────────────────────────────────

async function main() {
  const CDP_PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '9222');
  const NAV_TIMEOUT = parseInt(process.argv.find(a => a.startsWith('--timeout='))?.split('=')[1] || '30000');
  const MASTER_KEY = process.env.PAPER_MASTER_KEY || '';

  const { chromium } = await import('playwright');

  console.log(`[wf-carsi] Connecting to Chrome CDP on port ${CDP_PORT}…`);
  const browser = await chromium.connectOverCDP({
    endpointURL: `http://127.0.0.1:${CDP_PORT}`,
    noDefaults: true,
  });
  const context = browser.contexts()[0];
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  if (MASTER_KEY) setMasterKey(MASTER_KEY);
  const creds = await retrieve('wanfang');
  if (!creds) {
    console.error('[wf-carsi] No Wanfang credentials in vault.');
    process.exit(1);
  }

  const result = await login(page, creds, { timeout: NAV_TIMEOUT });
  if (result.success) {
    console.log(`[wf-carsi] ✅ ${result.message}`);
  } else {
    console.error(`[wf-carsi] ❌ ${result.message}`);
    process.exit(1);
  }

  await browser.close();
}

// Run CLI if invoked directly
const isMain = process.argv[1] && (
  process.argv[1].endsWith('wf-carsi-login.js') ||
  process.argv[1].endsWith('wf-carsi-login')
);
if (isMain) main();
