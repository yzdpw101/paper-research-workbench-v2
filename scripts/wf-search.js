/**
 * wf-search.js — Wanfang search
 *
 * Usage:
 *   node wf-search.js --q <keyword> [--type <type>] [--page <n>] [--rows <n>] [--no-snippet]
 *
 * --q          : Search keyword (required)
 * --type       : paper|periodical|thesis|conference|patent|standard|law, default "paper"
 * --page       : Page number, default 1 (SPA pagination via click, not URL)
 * --rows       : Results per page, default 20 (max 20)
 * --no-snippet : Omit abstract text from results (smaller output)
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
const wfType = opt('--type', 'paper');
const pageNum = opt('--page', '1');
const rows = Math.min(parseInt(opt('--rows', '20')), 20);
const yearFilter = opt('--year', '');
const noSnippet = process.argv.includes('--no-snippet');

if (!keyword) {
  console.error('Usage: node wf-search.js --q <keyword> [--type thesis] [--page 1] [--rows 20] [--no-snippet]');
  process.exit(1);
}

// Map type to year facet field name and title
const YEAR_FACET = {
  paper: ['Year','年份'], periodical: ['Year','年份'], thesis: ['DegreeYear','学位年度'],
  conference: ['ConferenceYear','会议年份'], patent: ['OpenYear','公开公告年份'],
  cstad: ['IdentifyYear','鉴定年份'], standard: ['PublishYear','发布年份'],
  claw: ['PublishYear','颁布年份']
};

let url = 'https://s.wanfangdata.com.cn/' + wfType + '?q=' + encodeURIComponent(keyword) + '&p=' + pageNum;

// Build year facet filter in URL (instead of clicking sidebar)
if (yearFilter && YEAR_FACET[wfType]) {
  const [field, title] = YEAR_FACET[wfType];
  const years = yearFilter.split('-');
  const facet = [{ [field]: { label: years, title, value: years } }];
  url += '&facet=' + encodeURIComponent(JSON.stringify(facet));
}

(async () => {
  const headless = !process.argv.includes("--show");
  const browserArg = opt('--browser', '');
  const { browser, page } = await launch({ headless, browser: browserArg || undefined });

  await goto(page, url, {
    timeout: parseInt(opt('--nav-timeout', '60000')),
    waitFor: 'div.normal-list'
  });

  // Pagination: click through pages (Wanfang SPA ignores URL p= parameter)
  if (pageNum > 1) {
    const bottomPager = await page.$('.bottom-pagination, .pagination, [class*=pagination]');
    if (bottomPager) {
      for (let p = 1; p < pageNum; p++) {
        const clicked = await page.evaluate(() => {
          const btns = document.querySelectorAll('.bottom-pagination .next, .pagination .next, [class*=pagination] .next, .bottom-pagination a:not(.disabled), .pagination a:not(.disabled)');
          for (const btn of btns) {
            const t = (btn.textContent || '').trim();
            if (t === '>' || t === '下一页' || t === 'next' || /\d+/.test(t)) {
              btn.click(); return true;
            }
          }
          return false;
        });
        if (!clicked) break;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  const result = await page.evaluate((opts) => {
    const TARGET_INDEX = null;
    const text = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 8000);

    if (/没有检索到数据|没有找到您要的资源/.test(text)) return { noResults: true, total: 0, items: [] };

    const items = [], seen = new Set();
    const currentPage = new URL(location.href).searchParams.get('p') || '1';
    const resultEls = document.querySelectorAll('div.normal-list.thesis-list, div.normal-list');
    resultEls.forEach((el, i) => {
      if (items.length >= 20) return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      // Match: "1.目录标题文摘阅读..." — title ends before 文摘阅读/在线阅读
      let m = t.match(/^(\d+)\.(?:目录\s*)?(.+?)(?=\s*(?:文摘阅读|在线阅读|$))/);
      if (!m) return;
      const title = m[2].trim();
      const typeM = t.match(/\[(硕士论文|博士论文|期刊论文|会议论文)\]/);
      const typeVal = typeM ? typeM[1] : '';
      if (title.length > 8 && !seen.has(title)) {
        seen.add(title);
        // Check for download buttons inside this result item
        const btnContainer = el.querySelector('.button-list, [class*=button]');
        const allBtns = btnContainer ? btnContainer.querySelectorAll('*') : [];
        let hasFull = false, hasDownload = false;
        allBtns.forEach(b => {
          const style = window.getComputedStyle(b);
          if (style.display === 'none' || style.visibility === 'hidden') return;
          let parent = b.parentElement;
          while (parent && parent !== document.body) {
            if (window.getComputedStyle(parent).display === 'none') return;
            parent = parent.parentElement;
          }
          const txt = (b.innerText || b.textContent || '').trim();
          if (txt === '整篇下载') hasFull = true;
          if (txt === '下载' || txt === '整篇下载') hasDownload = true;
        });
        const item = { idx: i, key: 'p' + currentPage + '#' + m[1], title, type: '[' + typeVal + ']', hasFull, hasDownload };
        if (!opts.noSnippet) {
          const absStart = t.indexOf('摘要：');
          const absEnd = t.search(/在线阅读|整篇下载|分章下载|下载全文/);
          item.snippet = absStart > 0 ? t.slice(absStart, absEnd > absStart ? absEnd : absStart + 300).trim().slice(0, 250) : '';
        }
        items.push(item);
      }
    });

    const activeFilters = [];
    document.querySelectorAll('label.ivu-checkbox-wrapper-checked .words').forEach(w => {
      const v = (w.textContent || '').trim();
      if (v && v.length < 50) activeFilters.push(v);
    });

    const dl = x => x.hasFull ? '[整篇]' : x.hasDownload ? '[下载]' : '[无]';
    const totalM = text.match(/找到([\d,]+)条/);
    const totalResults = totalM ? parseInt(totalM[1].replace(/,/g, '')) : items.length;
    const perPageM = text.match(/每页\s*(\d+)\s*条/);
    const perPage = perPageM ? parseInt(perPageM[1]) : 20;
    const totalPages = Math.ceil(totalResults / perPage);
    const hdr = '找到' + totalResults + '条  p' + currentPage + '/' + totalPages + '  每页' + perPage + '条';
    const limit = Math.min(opts.rows, items.length);
    const list = items.slice(0, limit).map((x, i) => '#' + (i + 1) + '  ' + (x.type || '-') + '  ' + dl(x) + '  ' + x.title).join('\n');
    return { page: currentPage, totalResults, totalPages, perPage, items: items.slice(0, limit), activeFilters, display: hdr + '\n' + list };
  }, { noSnippet, rows });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
