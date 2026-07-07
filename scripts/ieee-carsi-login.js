/**
 * ieee-carsi-login.js — IEEE Xplore CARSI SSO login (CDP mode)
 *
 * Usage:
 *   node ieee-carsi-login.js [--port 9222] [--timeout 60000]
 *
 * Reuses Wanfang's SSO login() — only differs in the entry URL.
 * IEEE uses a direct WAYF URL that skips SeamlessAccess and lands on e1s1.
 */
import { chromium } from 'playwright';
import { retrieve, setMasterKey } from './credential-vault.js';
import { ssoLogin } from './wf-carsi-login.js';

const CDP_PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '9222');
const NAV_TIMEOUT = parseInt(process.argv.find(a => a.startsWith('--timeout='))?.split('=')[1] || '30000');
const MASTER_KEY = process.env.PAPER_MASTER_KEY || '';

(async () => {
  console.log(`[ieee-carsi] Connecting to Chrome CDP on port ${CDP_PORT}...`);
  const browser = await chromium.connectOverCDP({
    endpointURL: `http://127.0.0.1:${CDP_PORT}`,
    timeout: 10000,
  });
  const context = browser.contexts()[0];
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  if (MASTER_KEY) setMasterKey(MASTER_KEY);
  const creds = await retrieve('ieee');
  if (!creds) {
    console.error('[ieee-carsi] No IEEE credentials in vault. Run credential-page.js first.');
    process.exit(1);
  }

  // Navigate directly to SSO (skip SeamlessAccess)
  const inst = creds.institution || 'Nanjing University of Science and Technology';
  console.log(`[ieee-carsi] Using institution: ${inst}`);
  console.log('[ieee-carsi] Navigating to IEEE institutional login...');

  // The WAYF URL redirects directly to e1s1
  await page.goto('https://ieeexplore.ieee.org/servlet/wayf.jsp?entityId=https://idp.njust.edu.cn/idp/shibboleth', {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  await new Promise(r => setTimeout(r, 3000));

  // Check if already logged in (SSO session valid, skipped to IEEE)
  if (page.url().includes('ieeexplore.ieee.org') && !page.url().includes('wayf')) {
    console.log('[ieee-carsi] Already logged in (SSO session valid)');
    await browser.close();
    process.exit(0);
  }

  // On e1s1 — reuse Wanfang's SSO login
  const result = await ssoLogin(page, creds, { timeout: NAV_TIMEOUT });
  if (result.success) {
    console.log(`[ieee-carsi] ${result.message}`);
    await browser.close();
    process.exit(0);
  } else {
    console.error(`[ieee-carsi] ${result.message}`);
    await browser.close();
    process.exit(1);
  }
})().catch(err => {
  console.error(`[ieee-carsi] Fatal: ${err.message}`);
  process.exit(1);
});
