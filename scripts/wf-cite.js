/**
 * wf-cite.js — Wanfang citation extraction (CDP mode)
 *
 * Usage:
 *   node wf-cite.js --q <keyword> [--type thesis] [--idx <n>] [--format gb7714|mla|apa] [--port 9222]
 *
 * --q        : Search keyword (required)
 * --type     : paper|periodical|thesis|conference|patent|standard|law, default "paper"
 * --idx      : 0-based result index, default 0
 * --format   : gb7714 (GB/T 7714-2025) | mla | apa, default gb7714
 * --port     : CDP port, default 9222
 *
 * Flow:
 *   Search page → click .wf-button-quote → 导出题录 modal → extract citation → Escape close
 *
 * Browser: CDP mode only (Vue iView modal component). Chrome on port 9222.
 * Search: works without login (same as wf-search.js).
 */

import { chromium } from 'playwright';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const wfType = opt('--type', 'paper');
const targetIdx = parseInt(opt('--idx', '0'));
const format = opt('--format', 'gb7714');
const cdpPort = parseInt(opt('--port', '9222'));

if (!keyword) {
  console.error('Usage: node wf-cite.js --q <keyword> [--type thesis] [--idx 0] [--format gb7714|mla|apa] [--port 9222]');
  process.exit(1);
}

const FORMAT_SELECTORS = {
  gb7714: '.export-reference span',
  mla:     '.export-reference-MLA span',
  apa:     '.export-reference-APA span',
};

const searchUrl = 'https://s.wanfangdata.com.cn/' + wfType + '?q=' + encodeURIComponent(keyword);

(async () => {
  const browser = await chromium.connectOverCDP({
    endpointURL: 'http://127.0.0.1:' + cdpPort,
    noDefaults: true,
  });
  const page = browser.contexts()[0].pages().length > 0
    ? browser.contexts()[0].pages()[0]
    : await browser.contexts()[0].newPage();

  try {
    // Navigate to search, wait for results
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('div.normal-list', { timeout: 15000 });

    // Get result info
    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.normal-list')).map((el, i) => {
        const t = el.textContent.replace(/\s+/g, ' ');
        const m = t.match(/^(\d+)\.(?:目录\s*)?(.+?)(?=\s*(?:文摘阅读|在线阅读|$))/);
        return {
          idx: i,
          title: m ? m[2].trim() : '',
          hasCite: !!el.querySelector('.wf-button-quote'),
        };
      });
    });

    if (targetIdx >= items.length) {
      console.log(JSON.stringify({ error: 'index out of range, max ' + (items.length - 1) }, null, 2));
      process.exit(0);  // ← 加这行
      return;
    }

    const item = items[targetIdx];
    if (!item.hasCite) {
      console.log(JSON.stringify({ error: 'no citation button for index ' + targetIdx, title: item.title }, null, 2));
      process.exit(0);
      return;
    }

    // 改成
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    // Click the citation button for the target item
    const clicked = await page.evaluate((idx) => {
      const btns = document.querySelectorAll('.wf-button-quote');
      if (btns[idx]) {
        btns[idx].click();
        return true;
      }
      return false;
    }, targetIdx);

    if (!clicked) {
      console.log(JSON.stringify({ error: 'could not click citation button' }, null, 2));
      return;
    }

    await page.waitForSelector('.export-reference span', { timeout: 10000 });

    // Extract citation text
    const selector = FORMAT_SELECTORS[format] || FORMAT_SELECTORS.gb7714;
    const citeText = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.trim() : '';
    }, selector);

    // Also extract all available formats
    const allFormats = await page.evaluate(() => {
      const extract = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim() : null;
      };
      return {
        gb7714: extract('.export-reference span'),
        mla: extract('.export-reference-MLA span'),
        apa: extract('.export-reference-APA span'),
      };
    });

    // Close modal via Escape key (Vue iView standard close behavior)
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    const result = {
      title: item.title,
      format: format,
      citation: citeText,
      allFormats: allFormats,
    };

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);

  } catch (err) {
    console.log(JSON.stringify({ error: err.message }, null, 2));
  }
})();
