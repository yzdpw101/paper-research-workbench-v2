/**
 * wf-batch-download.js — Wanfang batch download
 *
 * Usage:
 *   node wf-batch-download.js --q <keyword> --ids "0,2,5" [--type periodical]
 *                             [--save-dir <dir>] [--mode launch|cdp]
 *
 * Flow:
 *   Search → select checkboxes → click 批量下载 → new tab → click 开始下载 → download ZIP
 */
import { launch } from './browser-launcher.js';
import { getCDPDownloadDir, waitForZip } from './cdp-download.js';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const wfType = opt('--type', 'periodical');
const idsArg = opt('--ids', '');
const saveDir = path.resolve(opt('--save-dir', '.state/downloads'));
const dlMode = opt('--mode', 'cdp');
const cdpPort = parseInt(opt('--port', '9222'));

if (!keyword || !idsArg) {
  console.error('Usage: node wf-batch-download.js --q <keyword> --ids "0,2,5" [--type periodical] [--save-dir .state/downloads/] [--mode launch|cdp]');
  process.exit(1);
}

const ids = idsArg.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
if (ids.length === 0) { console.error('Error: --ids must be comma-separated numbers'); process.exit(1); }
if (ids.length > 10) { console.error('Error: max 10 items'); process.exit(1); }

fs.mkdirSync(saveDir, { recursive: true });
const searchUrl = 'https://s.wanfangdata.com.cn/' + wfType + '?q=' + encodeURIComponent(keyword);

(async () => {
  const headless = !process.argv.includes('--show');
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (dlMode === 'cdp') launchOpts.browser = 'chrome';
  const { browser, page } = await launch(launchOpts);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForSelector('div.normal-list', { timeout: 15000 });
    } catch {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('div.normal-list', { timeout: 15000 });
    }

    // Select checkboxes — same logic as batch-cite
    await page.evaluate(() => {
      const clearBtn = document.querySelector('span.clear-btn');
      if (clearBtn) clearBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    await page.evaluate((ids) => {
      const labels = document.querySelectorAll('div.normal-list label.ivu-checkbox-wrapper');
      for (const id of ids) {
        if (labels[id]) labels[id].click();
      }
    }, ids);
    await new Promise(r => setTimeout(r, 1000));

    // Launch mode: set up download listener
    let dlResolve;
    const dlPromise = dlMode !== 'cdp' ? new Promise(resolve => {
      dlResolve = resolve;
      const onDl = async (dl) => {
        const dest = path.join(saveDir, dl.suggestedFilename());
        try {
          const s = await dl.createReadStream();
          const ws = fs.createWriteStream(dest);
          await new Promise((res, rej) => { s.pipe(ws); ws.on('finish', res); ws.on('error', rej); s.on('error', rej); });
        } catch { await dl.saveAs(dest); }
        resolve({ status: 'ok', download: { name: dl.suggestedFilename(), path: dest, size: fs.statSync(dest).size, selected: ids.length } });
      };
      for (const p of browser.contexts()[0].pages()) p.on('download', onDl);
      browser.contexts()[0].on('page', p => p.on('download', onDl));
    }) : null;

    // Snapshot for CDP poll
    const startTime = Date.now();
    const cdpDlDir = getCDPDownloadDir(dlMode === 'cdp' ? 'chrome' : '');

    // Click 批量下载
    const ctx = browser.contexts()[0];
    const newPageP = ctx.waitForEvent('page', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const spans = document.querySelectorAll('span.export-btn');
      for (const s of spans) { if (s.innerText.trim() === '批量下载') { s.click(); break; } }
    });

    const batchPage = await newPageP.catch(() => null);
    if (!batchPage) {
      console.log(JSON.stringify({ error: 'batch download page did not open' }, null, 2));
      process.exit(0);
    }
    await batchPage.waitForLoadState('domcontentloaded');
    await new Promise(r => setTimeout(r, 2000));

    // Click 开始下载
    const startBtn = batchPage.locator('button:has-text("开始下载"), span:has-text("开始下载"), a:has-text("开始下载")').first();
    if (await startBtn.count() === 0) {
      console.log(JSON.stringify({ error: '开始下载 not found on batch page' }, null, 2));
      process.exit(0);
    }
    await startBtn.click({ force: true });

    // CDP: poll filesystem; launch: wait for download event
    if (dlMode === 'cdp') {
      const dirs = [saveDir];
      if (cdpDlDir && cdpDlDir !== saveDir) dirs.push(cdpDlDir);
      const zipPath = await waitForZip(dirs, startTime, 120000);
      if (zipPath) {
        const filename = path.basename(zipPath);
        const dest = path.join(saveDir, filename);
        if (zipPath !== dest) fs.copyFileSync(zipPath, dest);
        console.log(JSON.stringify({ status: 'ok', download: { name: filename, path: dest, size: fs.statSync(dest).size, selected: ids.length } }, null, 2));
      } else {
        console.log(JSON.stringify({ error: 'ZIP not found' }, null, 2));
      }
    } else {
      const r = await Promise.race([dlPromise, new Promise(res => setTimeout(() => res({ status: 'error', error: 'download event not captured' }), 60000))]);
      console.log(JSON.stringify(r, null, 2));
    }
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }, null, 2));
  }

  if (dlMode === 'cdp') { try { browser.close(); } catch {}; process.exit(0); }
  else { try { browser.close(); } catch {}; process.exit(0); }
})();
