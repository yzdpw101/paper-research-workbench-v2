/**
 * wf-batch-download.js — Wanfang batch download (CDP mode)
 *
 * Usage:
 *   node wf-batch-download.js --q <keyword> [--type periodical] [--count <n>]
 *                             [--save-dir <dir>] [--port 9222]
 *
 * --q        : Search keyword (required)
 * --type     : paper|periodical|conference, default "periodical" (thesis NOT supported)
 * --count    : Number of items to select, default 3 (max 10)
 * --save-dir : Output directory, default ".state/downloads/"
 * --port     : CDP port, default 9222
 *
 * Flow:
 *   Search page → select checkboxes (force click) → click 批量下载
 *   → new tab /batchdownload → click 开始下载 → poll Chrome download dir → copy to save-dir
 *
 * Browser: CDP mode only.
 * Limits: max 10 items. Thesis type not supported. Only full-text journals.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const wfType = opt('--type', 'periodical');
const count = Math.min(parseInt(opt('--count', '3')), 10);
const saveDir = path.resolve(opt('--save-dir', '.state/downloads'));
const cdpPort = parseInt(opt('--port', '9222'));

if (!keyword) {
  console.error('Usage: node wf-batch-download.js --q <keyword> [--type periodical] [--count 3] [--save-dir .state/downloads/] [--port 9222]');
  process.exit(1);
}

fs.mkdirSync(saveDir, { recursive: true });

const searchUrl = 'https://s.wanfangdata.com.cn/' + wfType + '?q=' + encodeURIComponent(keyword);

function getCDPDownloadDir() {
  try {
    const stateDir = path.resolve('.state');
    const prefPath = path.join(stateDir, 'profiles', 'chrome-cdp', 'Default', 'Preferences');
    if (!fs.existsSync(prefPath)) return null;
    const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
    return prefs?.download?.default_directory || prefs?.savefile?.default_directory || null;
  } catch { return null; }
}

async function pollDownloadDir(dir, knownFiles, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const entries = fs.readdirSync(dir).filter(f =>
      !knownFiles.has(f) && !f.endsWith('.tmp') && !f.endsWith('.crdownload')
    );
    if (entries.length > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return path.join(dir, entries[entries.length - 1]);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

(async () => {
  const browser = await chromium.connectOverCDP({
    endpointURL: 'http://127.0.0.1:' + cdpPort,
    noDefaults: true,
  });
  const page = browser.contexts()[0].pages().length > 0
    ? browser.contexts()[0].pages()[0]
    : await browser.contexts()[0].newPage();

  try {
    // ── Navigate search page ──
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('div.normal-list', { timeout: 15000 });

    const totalItems = await page.locator('div.normal-list input.ivu-checkbox-input').count();
    const selectCount = Math.min(count, totalItems);
    if (selectCount === 0) {
      console.log(JSON.stringify({ error: 'no results found' }, null, 2));
      process.exit(0);
    }

    // ── Select checkboxes ──
    const cbs = page.locator('div.normal-list input.ivu-checkbox-input');
    for (let i = 0; i < selectCount; i++) {
      await cbs.nth(i).click({ force: true });
    }
    await new Promise(r => setTimeout(r, 1000));

    // ── Snapshot download dirs before triggering ──
    let preFiles = new Set();
    try { preFiles = new Set(fs.readdirSync(saveDir)); } catch {}
    const cdpDlDir = getCDPDownloadDir();
    let preCdpFiles = new Set();
    if (cdpDlDir) {
      try { preCdpFiles = new Set(fs.readdirSync(cdpDlDir)); } catch {}
    }

    // ── Click 批量下载 and capture new tab ──
    const ctx = browser.contexts()[0];
    const newPagePromise = ctx.waitForEvent('page', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const spans = document.querySelectorAll('span.export-btn');
      for (const s of spans) { if (s.innerText.trim() === '批量下载') { s.click(); break; } }
    });
    const dlTab = await newPagePromise.catch(() => null);
    if (!dlTab) {
      console.log(JSON.stringify({ error: 'batch download tab not opened' }, null, 2));
      process.exit(0);
    }

    await dlTab.waitForLoadState('domcontentloaded');
    await new Promise(r => setTimeout(r, 3000));

    // ── Check for error popup (thesis not supported) ──
    const popupText = await dlTab.evaluate(() => {
      // Check for iView modal with error message
      const modal = document.querySelector('.ivu-modal-body, .ivu-message-notice');
      return modal ? modal.textContent.trim() : '';
    });
    if (popupText.includes('不满足') || popupText.includes('批量下载条件')) {
      console.log(JSON.stringify({ error: popupText }, null, 2));
      await dlTab.close();
      process.exit(0);
    }

    // ── Click 开始下载 ──
    const startBtn = dlTab.locator('span, button, a', { hasText: '开始下载' }).first();
    if (await startBtn.count() === 0) {
      console.log(JSON.stringify({ error: '开始下载 button not found' }, null, 2));
      await dlTab.close();
      process.exit(0);
    }
    await startBtn.click({ force: true });
    console.log('[batch-dl] Download started, waiting for file...');

    // ── Poll for download ──
    const polls = [pollDownloadDir(saveDir, preFiles, 120000)];
    if (cdpDlDir) polls.push(pollDownloadDir(cdpDlDir, preCdpFiles, 120000));
    const downloadedFile = await Promise.race(polls);

    if (downloadedFile) {
      const filename = path.basename(downloadedFile);
      const dest = path.join(saveDir, filename);
      if (downloadedFile !== dest) {
        fs.copyFileSync(downloadedFile, dest);
      }
      console.log(JSON.stringify({
        ok: true,
        keyword,
        type: wfType,
        selected: selectCount,
        download: { name: filename, path: dest, size: fs.statSync(dest).size },
      }, null, 2));
    } else {
      console.log(JSON.stringify({ error: 'download timeout' }, null, 2));
    }

    await dlTab.close();
    process.exit(0);

  } catch (err) {
    console.log(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
})();
