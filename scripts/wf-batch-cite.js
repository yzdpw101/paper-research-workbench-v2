/**
 * wf-batch-cite.js — Wanfang batch citation extraction (CDP mode)
 *
 * Usage:
 *   node wf-batch-cite.js --q <keyword> --ids "0,2,5" [--type periodical] [--port 9222] [--mode launch|cdp]
 *
 * --q      : Search keyword (required)
 * --ids    : Result indices to cite, comma-separated, 0-based, max 10
 * --type   : paper|periodical|conference, default "periodical" (thesis not supported for batch)
 * --port   : CDP port, default 9222
 * --mode   : launch|cdp, default cdp (launch works on institutional network)
 *
 * Flow:
 *   Search page → select checkboxes by ids → click 批量引用
 *   → new tab /export → extract GB/T 7714 citations → close tab
 *
 * Browser: launch or CDP mode. Requires CARSI login for CDP (wf-carsi-login.js).
 * Limit: max 10 items. Thesis type not supported (no batch ops).
 */

import { launch } from './browser-launcher.js';
import { checkStatus } from './wf-carsi-login.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const wfType = opt('--type', 'periodical');
const idsArg = opt('--ids', '');
const cdpPort = parseInt(opt('--port', '9222'));
const dlMode = opt('--mode', 'cdp');

if (!keyword || !idsArg) {
  console.error('Usage: node wf-batch-cite.js --q <keyword> --ids "0,2,5" [--type periodical] [--port 9222] [--mode launch|cdp]');
  process.exit(1);
}

const ids = parseIds(idsArg);
if (ids.length === 0) { console.error('Error: --ids must be valid numbers or ranges (e.g. "0,2,5-8")'); process.exit(1); }
if (ids.length > 10) { console.error('Error: max 10 items'); process.exit(1); }
function parseIds(raw) {
  if (!raw) return [];
  const seen = new Set();
  const result = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = parseInt(trimmed);
      if (!seen.has(n)) { seen.add(n); result.push(n); }
    } else if (/^(\d+)-(\d+)$/.test(trimmed)) {
      const a = parseInt(RegExp.$1), b = parseInt(RegExp.$2);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        if (!seen.has(i)) { seen.add(i); result.push(i); }
      }
    }
  }
  return result.sort((a, b) => a - b);
}

const searchUrl = 'https://s.wanfangdata.com.cn/' + wfType + '?q=' + encodeURIComponent(keyword);

(async () => {
  const launchOpts = { headless: true, mode: dlMode, port: cdpPort };
  if (dlMode === 'cdp') launchOpts.browser = 'chrome';
  const { browser, page } = await launch(launchOpts);

  try {
    // ── Navigate search page (with retry for Wanfang instability) ──
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForSelector('div.normal-list', { timeout: 15000 });
    } catch {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('div.normal-list', { timeout: 15000 });
    }

    // Batch citation extraction requires CARSI login
    const loginStatus = await checkStatus(page);
    if (!loginStatus.loggedIn) {
      console.log(JSON.stringify({ error: "not logged in - please run wf-carsi-login.js first" }, null, 2));
      process.exit(0);
      return;
    }


    // Clear and select — use label click instead of JS checked to avoid Vue reactivity issues
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

    // ── Click 批量引用 and capture new tab ──
    const ctx = browser.contexts()[0];
    const newPagePromise = ctx.waitForEvent('page', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const spans = document.querySelectorAll('span.export-btn');
      for (const s of spans) { if (s.innerText.trim() === '批量引用') { s.click(); break; } }
    });
    const exportTab = await newPagePromise.catch(() => null);
    if (!exportTab) {
      console.log(JSON.stringify({ error: 'export tab not opened' }, null, 2));
      process.exit(0);
    }

    await exportTab.waitForLoadState('domcontentloaded');
    await exportTab.waitForSelector('.reference-list', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));

    // ── Extract citations: [N] on one line, citation text on next ──
    const citations = await exportTab.evaluate(() => {
      const refs = [];
      const lines = document.body.innerText.split(/\n/);
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\[(\d+)\]$/);
        if (m && i + 1 < lines.length) {
          const citeLine = lines[i + 1].trim();
          if (citeLine.length > 20) refs.push({ index: '[' + m[1] + ']', citation: citeLine });
        }
      }
      return refs;
    });

    await exportTab.close();

    console.log(JSON.stringify({ keyword, type: wfType, selected: ids.length, citations }, null, 2));
    process.exit(0);

  } catch (err) {
    console.log(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
})();
