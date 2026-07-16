/**
 * ieee-search.js — IEEE Xplore search
 *
 * Usage:
 *   node ieee-search.js --q <keyword> [--type <type>] [--year <YYYY-YYYY>]
 *                       [--rows <n>] [--page <n>] [--no-snippet (omit abstracts)]
 *
 * --q       : Search keyword (required)
 * --type    : Journals|Conferences|Magazines|Books|Early Access Articles|Standards
 * --year    : Year range, e.g. "2023-2025" or "2024"
 * --rows    : Results per page, default 25 (max 25)
 * --page    : Page number, default 1
 * --no-snippet : Omit abstracts from results (smaller output)
 *
 * Browser: launch mode (headless), default Firefox. PAPER_BROWSER_DEFAULT env to switch.
 * No login — search works without authentication on any network.
 */

import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const type = opt('--type', '');
const year = opt('--year', '');
const rows = Math.min(parseInt(opt('--rows', '25')), 25);
const pageNum = opt('--page', '1');
const noSnippet = process.argv.includes('--no-snippet');

if (!keyword) {
  console.error('Usage: node ieee-search.js --q <keyword> [--type Journals] [--year 2023-2025] [--rows 25] [--page 1] [--no-snippet (omit abstracts)]');
  process.exit(1);
}

let url = 'https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=' + encodeURIComponent(keyword);
if (type) url += '&refinements=ContentType:' + encodeURIComponent(type);
if (year) { const parts = year.split('-'); url += '&ranges=' + parts[0] + '_' + (parts[1] || parts[0]) + '_Year'; }
url += '&rowsPerPage=' + rows + '&pageNumber=' + pageNum;

(async () => {
  const headless = !process.argv.includes("--show");
  const browserArg = opt("--browser", ""); const { browser, page } = await launch({ headless, browser: browserArg || undefined });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Try to wait for results; if the selector never appears, treat as no results
  try {
    await goto(page, url, {
      timeout: 30000,
      waitFor: 'a[href*="/document/"]',
    });
  } catch (err) {
    if (err.message && err.message.includes('SELECTOR_NOT_FOUND')) {
      // Also do a quick check for no-results text patterns
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
      if (/no results|0 results|unable to find|did not match|not found|returned 0/i.test(bodyText)) {
        console.log(JSON.stringify({ totalResults: 0, perPage: 0, totalPages: 0, items: [] }, null, 2));
        await page.close();
        process.exit(0);
      }
    }
    throw err;
  }

  // Expand all abstracts if requested
  if (!noSnippet) {
    await page.evaluate(() => {
      document.querySelectorAll('.abstract-control').forEach(c => {
        if (c.querySelector('.fa-angle-down')) c.click();
      });
    });
    // Short wait for renders — no waitForTimeout, just a tick
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  const result = await page.evaluate((opts) => {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ');
    const noResults = /No results found|unable to find results/i.test(text);
    if (noResults) return { noResults: true, total: 0, items: [] };

    const out = [], seen = new Set();
    const body = (document.body?.innerText || '').replace(/\s+/g, ' ');

    document.querySelectorAll('a[href*="/document/"]').forEach(a => {
      const m = a.href.match(/\/document\/(\d+)/);
      const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
      if (m && title && !seen.has(m[1])) {
        seen.add(m[1]);
        const item = { arnumber: m[1], title, url: a.href };
        if (!opts.noSnippet) {
          const idx = body.indexOf(title);
          item.snippet = idx >= 0 ? body.slice(idx + title.length, idx + title.length + 400) : '';
        }
        out.push(item);
      }
    });

    const list = out.map((x, i) => '#' + (i + 1) + '  ' + x.arnumber + '  ' + x.title).join('\n');
    const totalM = text.match(/Showing \d+-\d+ of ([\d,]+)/);
    const totalResults = totalM ? parseInt(totalM[1].replace(/,/g, '')) : out.length;
    const perPage = parseInt(new URL(location.href).searchParams.get('rowsPerPage') || '25');
    const totalPages = Math.ceil(totalResults / perPage);
    return {
      totalResults, perPage, totalPages,
      items: out.slice(0, 20),
      display: 'Showing ' + out.length + ' of ' + totalResults + '  p' + (new URL(location.href).searchParams.get('pageNumber') || '1') + '/' + totalPages + '  ' + perPage + ' rows/page\n' + list
    };
  }, { noSnippet });

  console.log(JSON.stringify(result, null, 2));
  await browser.close(); process.exit(0);
})();
