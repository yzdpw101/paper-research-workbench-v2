#!/usr/bin/env node
/**
 * parallel-search.js — Parallel search CLI for IEEE Xplore and Wanfang.
 *
 * Usage:
 *   node parallel-search.js --q <keyword1,keyword2,...> --platform <ieee|wanfang>
 *   node parallel-search.js --queries <json-file> [--parallel <n>]
 *
 * --q         : Comma-separated list of search keywords (required unless --queries)
 * --platform  : Search platform: "ieee" or "wanfang" (default: "ieee")
 * --queries   : JSON file with { keyword, platform, options } objects
 * --parallel  : Max concurrency (default: from config)
 * --type      : Optional content type filter (e.g. "Journals" for IEEE, "thesis" for Wanfang)
 * --year      : Optional year range (IEEE only, e.g. "2023-2025")
 * --rows      : Results per page (IEEE only, default 25)
 * --expand    : Expand abstracts in results (IEEE only)
 * --no-snippet : Omit abstract text (Wanfang only)
 *
 * Output: JSON with aggregated search results per keyword.
 *
 * Dependencies: browser-launcher, batch-runner, navigator
 */

import { launch } from './browser-launcher.js';
import { runBatch } from './batch-runner.js';
import { goto } from './navigator.js';
import fs from 'node:fs';

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a comma-separated keyword string into an array.
 * Empty strings and whitespace-only entries are filtered out.
 *
 * @param {string} raw - Comma-separated keywords
 * @returns {string[]} Trimmed, non-empty keywords
 */
export function parseKeywords(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Load queries from a JSON file.
 * Expects an array of { keyword, platform?, options? } objects.
 *
 * @param {string} filePath - Path to JSON file
 * @returns {Array<{keyword: string, platform?: string, options?: object}>}
 */
export function loadQueriesFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Print usage information.
 */
export function showUsage() {
  console.error(`Usage:
  node parallel-search.js --q <keyword1,keyword2,...> --platform <ieee|wanfang>
  node parallel-search.js --queries <json-file> [--parallel <n>]

Options:
  --q            Comma-separated search keywords
  --platform     "ieee" or "wanfang" (default: "ieee")
  --queries      JSON file with { keyword, platform, options } objects
  --parallel     Max concurrency (default: from config)
  --type         Content type filter (e.g. "Journals", "thesis")
  --year         Year range, IEEE only (e.g. "2023-2025")
  --rows         Results per page, IEEE only (default 25)
  --expand       Expand abstracts, IEEE only
  --no-snippet   Omit abstract text, Wanfang only
`);
}

// ─── Search task factories ────────────────────────────────────────────────

/**
 * Create a search task function for IEEE Xplore.
 *
 * @param {string} keyword - Search keyword
 * @param {object} [opts] - Additional options
 * @param {string} [opts.type] - Content type filter
 * @param {string} [opts.year] - Year range
 * @param {string} [opts.rows] - Results per page
 * @param {string} [opts.page] - Page number
 * @param {boolean} [opts.expand] - Expand abstracts
 * @returns {Function} Task function (context, index) => Promise<object>
 */
function createIEEESearchTask(keyword, opts = {}) {
  return async (context, index) => {
    const page = await context.newPage();

    // Build search URL (same pattern as ieee-search.js)
    let url = 'https://ieeexplore.ieee.org/search/searchresult.jsp?queryText='
      + encodeURIComponent(keyword);
    if (opts.type) url += '&refinements=ContentType:' + encodeURIComponent(opts.type);
    if (opts.year) {
      const parts = opts.year.split('-');
      url += '&ranges=' + parts[0] + '_' + (parts[1] || parts[0]) + '_Year';
    }
    url += '&rowsPerPage=' + (opts.rows || '25') + '&pageNumber=' + (opts.page || '1');

    await goto(page, url, {
      timeout: 60000,
      waitFor: 'a[href*="/document/"]',
    });

    // Expand abstracts if requested
    if (opts.expand) {
      await page.evaluate(() => {
        document.querySelectorAll('.abstract-control').forEach(c => {
          if (c.querySelector('.fa-angle-down')) c.click();
        });
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const result = await page.evaluate(({ keyword, expand }) => {
      const text = (document.body.innerText || '').replace(/\s+/g, ' ');
      const hasSignOut = /\bSign Out\b/i.test(text);
      const accessProvided = /Access provided by/i.test(text);
      const signInMarkers = /Institutional Sign In|Personal Sign In/i.test(text);
      const denialMarkers = /Purchase PDF|Subscribe|Access Denied|Get Access|Sign in to access/i.test(text);
      const accessReady = hasSignOut || accessProvided;
      const needLogin = !accessReady && (signInMarkers || denialMarkers);
      const warning = !accessReady
        ? '未检测到登录态（可能是校园网IP认证，不影响使用）'
        : undefined;

      const noResults = /No results found|unable to find results/i.test(text);
      if (noResults) return { keyword, accessReady, needLogin, noResults: true, total: 0, items: [], warning };

      const items = [], seen = new Set();
      const body = (document.body?.innerText || '').replace(/\s+/g, ' ');
      document.querySelectorAll('a[href*="/document/"]').forEach(a => {
        const m = a.href.match(/\/document\/(\d+)/);
        const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
        if (m && title && !seen.has(m[1])) {
          seen.add(m[1]);
          const item = { arnumber: m[1], title, url: a.href };
          if (expand) {
            const idx = body.indexOf(title);
            item.snippet = idx >= 0
              ? body.slice(idx + title.length, idx + title.length + 400)
              : '';
          }
          items.push(item);
        }
      });

      const totalM = text.match(/Showing \d+-\d+ of ([\d,]+)/);
      const totalResults = totalM ? parseInt(totalM[1].replace(/,/g, '')) : items.length;

      return {
        keyword,
        platform: 'ieee',
        accessReady,
        needLogin,
        warning,
        noResults: false,
        totalResults,
        items: items.slice(0, 20),
      };
    }, { keyword, expand: opts.expand });

    return result;
  };
}

/**
 * Create a search task function for Wanfang.
 *
 * @param {string} keyword - Search keyword
 * @param {object} [opts] - Additional options
 * @param {string} [opts.type] - Resource type (default "paper")
 * @param {string} [opts.page] - Page number
 * @param {boolean} [opts.noSnippet] - Omit snippets
 * @returns {Function} Task function (context, index) => Promise<object>
 */
function createWanfangSearchTask(keyword, opts = {}) {
  return async (context, index) => {
    const page = await context.newPage();

    const wfType = opts.type || 'paper';
    const pageNum = opts.page || '1';
    const url = 'https://s.wanfangdata.com.cn/' + wfType
      + '?q=' + encodeURIComponent(keyword)
      + '&p=' + pageNum;

    await goto(page, url, {
      timeout: 60000,
      waitFor: 'div.normal-list',
    });

    const result = await page.evaluate(({ keyword, noSnippet }) => {
      const text = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 8000);
      const headerEl = document.querySelector('header,.header,.top,.topbar,.user-info,.nav,[class*=header],[class*=top],[class*=login]');
      const header = ((headerEl && headerEl.innerText) || text.slice(0, 1200)).replace(/\s+/g, ' ');
      const hasLogout = /退出登录|退出|注销/.test(header);
      const hasInstitution = /大学图书馆|图书馆/.test(header);
      const accessReady = hasLogout || hasInstitution;
      const denialMarkers = /无权限|购买|充值|机构权限|未订购|无法下载/.test(text);
      const needLogin = !accessReady && denialMarkers;
      const warning = !accessReady
        ? '未检测到登录态（可能是校园网IP认证，不影响使用）'
        : undefined;

      if (/没有检索到数据|没有找到您要的资源/.test(text)) {
        return { keyword, accessReady, needLogin, noResults: true, total: 0, items: [], warning };
      }

      const items = [], seen = new Set();
      const currentPage = new URL(location.href).searchParams.get('p') || '1';
      document.querySelectorAll('div.normal-list').forEach((el, i) => {
        if (items.length >= 20) return;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(\d+)\.(?:目录\s*)?(.+?)(文摘阅读|patent_|nstr_|cstad_|standard_)/);
        if (!m) return;
        const title = m[2].trim();
        if (title.length > 8 && !seen.has(title)) {
          seen.add(title);
          const typeM = t.match(/\[(硕士论文|博士论文|期刊论文|会议论文|专利|科技报告|成果|标准|法规)\]/);
          const btnContainer = el.querySelector('.button-list, [class*=button], [class*=btn]');
          const allBtns = btnContainer ? btnContainer.querySelectorAll('*') : [];
          let hasFull = false, hasDownload = false;
          allBtns.forEach(b => {
            const txt = (b.innerText || b.textContent || '').trim();
            if (txt === '整篇下载') hasFull = true;
            if (txt === '下载' || txt === '整篇下载') hasDownload = true;
          });
          const item = {
            idx: i,
            key: 'p' + currentPage + '#' + m[1],
            title,
            type: (typeM || [''])[0],
            hasFull,
            hasDownload,
          };
          if (!noSnippet) {
            const absStart = t.indexOf('摘要：');
            const absEnd = t.search(/在线阅读|整篇下载|分章下载|下载全文/);
            item.snippet = absStart > 0
              ? t.slice(absStart, absEnd > absStart ? absEnd : absStart + 300).trim().slice(0, 250)
              : '';
          }
          items.push(item);
        }
      });

      const totalM = text.match(/找到([\d,]+)条/);
      const totalResults = totalM ? parseInt(totalM[1].replace(/,/g, '')) : items.length;

      return {
        keyword,
        platform: 'wanfang',
        accessReady,
        needLogin,
        warning,
        noResults: false,
        totalResults,
        items: items.slice(0, 20),
      };
    }, { keyword, noSnippet: opts.noSnippet });

    return result;
  };
}

/**
 * Build an array of batch tasks from queries.
 *
 * @param {Array<{keyword: string, platform?: string, options?: object}>} queries
 * @returns {Array<{name: string, fn: Function}>}
 */
function buildTasks(queries) {
  return queries.map((q, i) => {
    const platform = (q.platform || 'ieee').toLowerCase();
    const keyword = q.keyword;
    const opts = q.options || {};

    let fn;
    if (platform === 'wanfang') {
      fn = createWanfangSearchTask(keyword, opts);
    } else {
      fn = createIEEESearchTask(keyword, opts);
    }

    return {
      name: `search-${platform}-${i + 1}: ${keyword}`,
      fn,
    };
  });
}

// ─── CLI argument parsing ──────────────────────────────────────────────

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const rawKeywords = opt('--q', '');
  const platform = opt('--platform', 'ieee').toLowerCase();
  const queriesFile = opt('--queries', '');
  const parallelArg = parseInt(opt('--parallel', ''));

  // Determine queries
  let queries = [];

  if (queriesFile) {
    // Load from JSON file
    queries = loadQueriesFile(queriesFile);
    if (!Array.isArray(queries) || queries.length === 0) {
      console.error('Error: queries file must contain a non-empty array');
      showUsage();
      process.exit(1);
    }
  } else if (rawKeywords) {
    // Parse comma-separated keywords
    const keywords = parseKeywords(rawKeywords);
    if (keywords.length === 0) {
      console.error('Error: no valid keywords found in --q argument');
      showUsage();
      process.exit(1);
    }

    // Build common options
    const commonOpts = {};
    const type = opt('--type', '');
    if (type) commonOpts.type = type;
    const year = opt('--year', '');
    if (year) commonOpts.year = year;
    const rows = opt('--rows', '');
    if (rows) commonOpts.rows = rows;
    if (hasFlag('--expand')) commonOpts.expand = true;
    if (hasFlag('--no-snippet')) commonOpts.noSnippet = true;

    queries = keywords.map((keyword) => ({
      keyword,
      platform,
      options: { ...commonOpts },
    }));
  } else {
    showUsage();
    process.exit(1);
  }

  // ── Launch browser and run batch ───────────────────────────────────────
  const dlMode = opt('--mode', 'launch');
  const cdpPort = parseInt(opt('--cdp-port', '9222'));
const headless = !process.argv.includes("--show");
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (dlMode === 'cdp') launchOpts.browser = 'chrome';
  const { browser } = await launch(launchOpts);
  const batchOptions = { browser };
  if (!isNaN(parallelArg) && parallelArg > 0) {
    batchOptions.parallel = parallelArg;
  }

  const tasks = buildTasks(queries);
  const summary = await runBatch(tasks, batchOptions);

  // ── Output aggregated results ──────────────────────────────────────────
  const output = {
    summary: {
      total: summary.total,
      success: summary.success,
      failed: summary.failed,
    },
    results: summary.results,
  };

  console.log(JSON.stringify(output, null, 2));
  if (dlMode === 'cdp') { try { browser.close(); } catch {}; setTimeout(() => process.exit(0), 3000); }
  else { await browser.close(); }
}

// Run when executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('parallel-search.js')
);
if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
