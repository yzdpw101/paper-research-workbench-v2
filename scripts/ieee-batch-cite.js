/**
 * ieee-batch-cite.js — IEEE Xplore batch citation export (no login needed)
 *
 * Usage:
 *   node ieee-batch-cite.js --q "keyword" --ids "0,2,5" [--format bibtex|plain|ris|refworks]
 *                          [--save-as <path>] [--mode launch|cdp]
 */
import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { get } from './config.js';
import { getCDPDownloadDir, waitForTxt } from './cdp-download.js';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const idsArg = opt('--ids', '');
const format = opt('--format', 'bibtex');
const saveAsPath = opt('--save-as', '');
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const browserType = opt('--browser', dlMode === 'cdp' ? 'chrome' : '');
const headless = !process.argv.includes("--show");

if (!keyword || !idsArg) {
  console.error('Usage: node ieee-batch-cite.js --q <keyword> --ids "0,2,5" [--format bibtex|plain|ris|refworks] [--save-as <path>] [--mode launch|cdp]');
  process.exit(1);
}

const ids = parseIds(idsArg);
if (ids.length === 0) { console.error('Error: --ids must be valid numbers or ranges (e.g. "0,2,5-8")'); process.exit(1); }

const searchUrl = 'https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=' + encodeURIComponent(keyword) + '&highlight=true&returnType=SEARCH&matchPubs=true&rowsPerPage=' + Math.max(...ids, 10);
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (browserType) launchOpts.browser = browserType;
  const { browser, page } = await launch(launchOpts);

  try {
    await goto(page, searchUrl, { timeout: 30000, waitFor: '.results-actions-selectall' });
    await new Promise(r => setTimeout(r, 3000));

    // Dismiss cookie/privacy popup if present
    try {
      for (const sel of ['button:has-text("Accept All")', 'a:has-text("Accept All")', 'button:has-text("Accept")', '.osano-cm-accept']) {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0) {
          await btn.click({ force: true, timeout: 3000 });
          await new Promise(r => setTimeout(r, 1500));
          break;
        }
      }
    } catch { /* popup may not exist */ }

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

    // Click Export
    await page.locator('button.xpl-btn-primary:has-text("Export")').first().click();
    await new Promise(r => setTimeout(r, 2000));

    // Select Citations tab (use JS, modal might block Playwright click)
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('[role=tab], .nav-link');
      for (const t of tabs) {
        if (t.textContent.trim() === 'Citations') { t.click(); break; }
      }
    });
    await new Promise(r => setTimeout(r, 1000));

    // Select format radio
    const fmtMap = { bibtex: 'BibTeX', plain: 'Plain Text', ris: 'RIS', refworks: 'RefWorks' };
    const fmtLabel = fmtMap[format] || 'BibTeX';
    const formatRadio = page.locator(`label:has-text("${fmtLabel}")`).first();
    if (await formatRadio.count() > 0) {
      await formatRadio.click();
      await new Promise(r => setTimeout(r, 500));
    }

    // Click Download — use specific class selector with force click
    const startTime = Date.now();

    // Launch mode: set up download listener
    let dlResolve;
    const dlPromise = dlMode !== 'cdp' ? new Promise(resolve => { dlResolve = resolve;
      const onDl = async (dl) => {
        const dest = saveAsPath || path.join(downloadDir, dl.suggestedFilename());
        const dd = path.dirname(dest);
        if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
        await dl.saveAs(dest)
        resolve({ status: 'ok', download: { name: dl.suggestedFilename(), path: dest, size: fs.statSync(dest).size, format } });
      };
      for (const p of browser.contexts()[0].pages()) p.on('download', onDl);
      browser.contexts()[0].on('page', p => p.on('download', onDl));
    }) : null;

    await page.locator('button.stats-SearchResults_Citation_Download').first().click({ force: true, timeout: 10000 });

    // CDP mode: poll for .txt
    if (dlMode === 'cdp') {
      const cdpDir = getCDPDownloadDir(browserType || 'chrome');
      const dirs = [downloadDir];
      if (cdpDir && cdpDir !== downloadDir) dirs.push(cdpDir);
      const txtPath = await waitForTxt(dirs, startTime, 30000);
      if (txtPath) {
        const filename = path.basename(txtPath);
        const dest = saveAsPath || path.join(downloadDir, filename);
        const dd = path.dirname(dest);
        if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
        if (txtPath !== dest) fs.copyFileSync(txtPath, dest);
        console.log(JSON.stringify({ status: 'ok', download: { name: filename, path: dest, size: fs.statSync(dest).size, format } }, null, 2));
      } else {
        console.log(JSON.stringify({ status: 'error', error: 'citation file not found' }, null, 2));
      }
    }
    // Launch mode: wait for download promise
    if (dlPromise) { const r = await Promise.race([dlPromise, new Promise(res => setTimeout(() => res({ status: "error", error: "download event not captured" }), 30000))]);
      console.log(JSON.stringify(r, null, 2));
    }
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', error: e.message }, null, 2));
  }

  try { await page.evaluate(() => { document.querySelectorAll('ngb-modal-window .close, .modal .close, [aria-label=Close]').forEach(b => b.click()); }); } catch {}
  if (dlMode === 'cdp') {
    try { browser.close(); } catch {}
    process.exit(0);
  } else {
    try { browser.close(); } catch {}; process.exit(0);
  }
})();
