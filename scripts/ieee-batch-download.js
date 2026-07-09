/**
 * ieee-batch-download.js — IEEE Xplore batch PDF download (needs login)
 *
 * Usage:
 *   node ieee-batch-download.js --q "keyword" --ids "0,2,5" [--save-as <path>]
 *                               [--mode launch|cdp]
 *
 * Max 10 papers, 500MB total. Requires institutional login (IP or CARSI SSO).
 */
import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { get } from './config.js';
import { getCDPDownloadDir, waitForZip } from './cdp-download.js';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const idsArg = opt('--ids', '');
const saveAsPath = opt('--save-as', '');
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const browserType = opt('--browser', dlMode === 'cdp' ? 'chrome' : '');
const headless = !process.argv.includes('--show');

if (!keyword || !idsArg) {
  console.error('Usage: node ieee-batch-download.js --q <keyword> --ids "0,2,5" [--save-as <path>] [--mode launch|cdp]');
  process.exit(1);
}

const ids = parseIds(idsArg);
if (ids.length === 0) { console.error('Error: --ids must be valid numbers or ranges (e.g. "0,2,5-8")'); process.exit(1); }
if (ids.length > 10) { console.error('Error: max 10 papers'); process.exit(1); }
function parseIds(raw) {
  if (!raw) return [];
  const seen = new Set();
  const result = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (/^d+$/.test(trimmed)) {
      const n = parseInt(trimmed);
      if (!seen.has(n)) { seen.add(n); result.push(n); }
    } else if (/^(d+)-(d+)$/.test(trimmed)) {
      const a = parseInt(RegExp.$1), b = parseInt(RegExp.$2);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        if (!seen.has(i)) { seen.add(i); result.push(i); }
      }
    }
  }
  return result.sort((a, b) => a - b);
}

const searchUrl = 'https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=' + encodeURIComponent(keyword) + '&highlight=true&returnType=SEARCH&matchPubs=true&rowsPerPage=10';
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (browserType) launchOpts.browser = browserType;
  const { browser, page } = await launch(launchOpts);

  try {
    await goto(page, searchUrl, { timeout: 30000, waitFor: '.results-actions-selectall' });
    await new Promise(r => setTimeout(r, 5000));

    // Dismiss cookie/privacy popup if present (blocks download buttons in headless mode)
    try {
      for (const sel of ['button:has-text("Accept All")', 'a:has-text("Accept All")', 'button:has-text("Accept")', '.osano-cm-accept', 'button[class*=accept]']) {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0) {
          await btn.click({ force: true, timeout: 3000 });
          await new Promise(r => setTimeout(r, 1500));
          break;
        }
      }
    } catch { /* popup may not exist */ }
    // Fallback: try direct JS click if locator didn't work
    try {
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          if (b.textContent.trim() === 'Accept All' || b.textContent.trim() === 'Accept') {
            b.click(); return;
          }
        }
      });
      await new Promise(r => setTimeout(r, 1000));
    } catch {}

    // Clear any previous selections
    try { await page.locator("button:has-text(\"Clear\")").first().click({ force: true, timeout: 3000 }); await new Promise(r => setTimeout(r, 300)); } catch {}
    // Select specific papers by --ids
    const cbs = page.locator('input[aria-label="Select search result"]');
    for (const id of ids) {
      if (await cbs.nth(id).count() > 0) {
        await cbs.nth(id).click({ force: true });
      }
    }
    await new Promise(r => setTimeout(r, 500));

    // Click Download PDFs — use JS to bypass modal overlay
    // Launch mode: set up download listener
    let dlResolve;
    const dlPromise = dlMode !== 'cdp' ? new Promise(resolve => { dlResolve = resolve;
      const onDl = async (dl) => {
        const dest = saveAsPath || path.join(downloadDir, dl.suggestedFilename());
        const dd = path.dirname(dest);
        if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
        await dl.saveAs(dest)
        resolve({ status: 'ok', download: { name: dl.suggestedFilename(), path: dest, size: fs.statSync(dest).size, ids: ids.length } });
      };
      for (const p of browser.contexts()[0].pages()) p.on('download', onDl);
      browser.contexts()[0].on('page', p => p.on('download', onDl));
    }) : null;
    await page.evaluate(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.textContent.includes('Download PDFs')) { b.click(); break; } } });
    await new Promise(r => setTimeout(r, 2000));

    // Confirm Download in modal — use JS to click through overlay
    const startTime = Date.now();
    // Click Download in confirmation modal (use modal-scoped locator)
    const confirmModal = page.locator('ngb-modal-window.d-block, .modal.show').first();
    const dlBtn = confirmModal.locator('button:has-text("Download"):not(:has-text("PDFs"))').last();
    if (await dlBtn.count() > 0) await dlBtn.click({ force: true, timeout: 2000 });
    await new Promise(r => setTimeout(r, 1000));

    // CDP mode: poll for .zip
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
        console.log(JSON.stringify({ status: 'ok', download: { name: filename, path: dest, size: fs.statSync(dest).size, ids: ids.length } }, null, 2));
      } else {
        console.log(JSON.stringify({ status: 'error', error: 'ZIP not found' }, null, 2));
      }
    }
    // Launch mode: wait for download promise
    if (dlPromise) { const r = await Promise.race([dlPromise, new Promise(res => setTimeout(() => res({ status: "error", error: "download event not captured — file may be in browser default dir" }), 30000))]);
      console.log(JSON.stringify(r, null, 2));
    }
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', error: e.message }, null, 2));
  }

  // Cleanup
  try { await page.evaluate(() => { document.querySelectorAll('ngb-modal-window .close, .modal .close, [aria-label=Close]').forEach(b => b.click()); }); } catch {}
  if (dlMode === 'cdp') {
    try { browser.close(); } catch {}
    process.exit(0);
  } else {
    try { browser.close(); } catch {}; process.exit(0);
  }
})();
