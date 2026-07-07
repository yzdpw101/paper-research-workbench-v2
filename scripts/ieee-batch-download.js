/**
 * ieee-batch-download.js — IEEE Xplore batch PDF download (needs CARSI login)
 *
 * Usage:
 *   node ieee-batch-download.js --q "keyword" [--count 3] [--save-as <path>]
 *                               [--mode launch|cdp]
 *
 * Max 10 papers, 500MB total. Requires institutional login (IP or CARSI SSO).
 *
 * Flow:
 *   Search → Select All / check N results → Download PDFs → confirm → Download → .zip
 */
import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { get } from './config.js';
import { getCDPDownloadDir, waitForZip } from './cdp-download.js';
import { checkStatus } from './wf-carsi-login.js';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const count = Math.min(parseInt(opt('--count', '3')), 10);
const saveAsPath = opt('--save-as', '');
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const browserType = opt('--browser', dlMode === 'cdp' ? 'chrome' : '');

if (!keyword) {
  console.error('Usage: node ieee-batch-download.js --q <keyword> [--count 3] [--save-as <path>] [--mode launch|cdp]');
  process.exit(1);
}

const searchUrl = 'https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=' + encodeURIComponent(keyword) + '&highlight=true&returnType=SEARCH&matchPubs=true&rowsPerPage=10';
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });
  const launchOpts = { headless: true, mode: dlMode, port: cdpPort };
  if (browserType) launchOpts.browser = browserType;
  const { browser, page } = await launch(launchOpts);

  try {
    await goto(page, searchUrl, { timeout: 60000, waitFor: '.results-actions-selectall' });
    await new Promise(r => setTimeout(r, 3000));

    // Check login (only for CDP mode where we can detect it)
    if (dlMode === 'cdp') {
      const loginStatus = await checkStatus(page);
      // IEEE header check — look for institution name or access indicator
      const hasAccess = await page.evaluate(() => {
        const body = (document.body?.innerText || '').slice(0, 2000);
        return /access provided by|institutional access|institution/i.test(body);
      });
      if (!hasAccess && !loginStatus.loggedIn) {
        console.log(JSON.stringify({ status: 'error', error: 'not logged in — run ieee-carsi-login.js first or use institutional network' }, null, 2));
        await browser.close();
        return;
      }
    }

    // Select results
    await page.locator('label.results-actions-selectall').first().click();
    await new Promise(r => setTimeout(r, 500));

    // Click Download PDFs
    const dlPdfBtn = page.locator('button:has-text("Download PDFs"), a:has-text("Download PDFs")').first();
    if (await dlPdfBtn.count() === 0) {
      console.log(JSON.stringify({ status: 'error', error: 'Download PDFs button not found — may need login or different page layout' }, null, 2));
      await browser.close();
      return;
    }
    await page.locator("button.xpl-btn-primary:has-text(\\"Download PDFs\\")").first().click({ force: true });
    await new Promise(r => setTimeout(r, 2000));

    // Confirm download in modal
    const confirmBtn = page.locator('button:has-text("Download")').first();
    if (await confirmBtn.count() > 0) {
      await page.evaluate(() => { const modal = document.querySelector("ngb-modal-window.d-block, .modal.show, [role=dialog]"); if (modal) { const btns = modal.querySelectorAll("button"); for (const b of btns) { if (b.textContent.trim() === "Download" && !b.textContent.includes("PDFs")) { b.click(); return; } } } });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Close the "Download Confirmation" dialog
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      const modals = document.querySelectorAll('.modal.show, [role=dialog]');
      for (const m of modals) {
        const closeBtn = m.querySelector('.close, [aria-label=Close], button:last-child');
        if (closeBtn && closeBtn.textContent?.trim().length <= 2) { closeBtn.click(); return; }
      }
      // Fallback: click any button with just "×" or "X"
      const allBtns = document.querySelectorAll('.modal.show button');
      for (const b of allBtns) { if (b.textContent.trim() === '×' || b.textContent.trim() === 'X') { b.click(); return; } }
    });



    // CDP mode: poll for .zip
    const startTime = Date.now();
    if (dlMode === 'cdp') {
      const cdpDir = getCDPDownloadDir(browserType || 'chrome');
      const dirs = [downloadDir];
      if (cdpDir && cdpDir !== downloadDir) dirs.push(cdpDir);
      const zipPath = await waitForZip(dirs, startTime, 120000);
      if (zipPath) {
        const filename = path.basename(zipPath);
        const dest = saveAsPath || path.join(downloadDir, filename);
        const dd = path.dirname(dest);
        if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
        if (zipPath !== dest) fs.copyFileSync(zipPath, dest);
        console.log(JSON.stringify({ status: 'ok', download: { name: filename, path: dest, size: fs.statSync(dest).size, count } }, null, 2));
      } else {
        console.log(JSON.stringify({ status: 'error', error: 'ZIP not found — download may have failed' }, null, 2));
      }
    } else {
      console.log(JSON.stringify({ status: 'ok', note: 'check download directory for batch ZIP' }, null, 2));
    }
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', error: e.message }, null, 2));
  }

  if (dlMode === 'cdp') {
    try { browser.close(); } catch {}
    setTimeout(() => process.exit(0), 3000);
  } else {
    await browser.close();
  }
})();
