/**
 * ieee-figures.js — IEEE Xplore figure extraction + parallel download
 *
 * Usage:
 *   node ieee-figures.js --arnumber <n> --out-dir <dir> [--parallel <n>]
 *
 * Navigates to detail page, clicks Figures tab, extracts large images,
 * downloads them in parallel via context-pool, saves to output directory.
 * Returns list of saved files.
 *
 * Exports:
 *   downloadFigure(page, url, name, outDir) — download a single figure
 *     (exported for testability)
 */

import { launch } from './browser-launcher.js';
import { goto, waitForNetworkIdle } from './navigator.js';
import { createPool } from './context-pool.js';
import fs from 'node:fs';
import path from 'node:path';

// ── CLI helper ──────────────────────────────────────────────────────────

function cliArg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// ── Figure download function (exported for testability) ──────────────────

/**
 * Download a single figure image using the page's request context.
 *
 * @param {object} page  - Playwright Page (its request context is used for fetch)
 * @param {string} url   - Full URL to the image
 * @param {string} name  - Base name (without extension)
 * @param {string} outDir- Output directory
 * @returns {Promise<{name: string, path: string, size: number}>}
 */
export async function downloadFigure(page, url, name, outDir) {
  const resp = await page.request.fetch(url);
  const buf = Buffer.from(await resp.body());
  const ext = url.match(/\.(\w+)(?:\?|$)/)?.[1] || 'gif';
  const filename = `${name}.${ext}`;
  const filepath = path.join(outDir, filename);
  fs.writeFileSync(filepath, buf);
  return { name: filename, path: filepath, size: buf.length };
}

// ── CLI entry point ─────────────────────────────────────────────────────

const arnumber = cliArg('--arnumber', '');
const outDir = cliArg('--out-dir', '');
const parallel = parseInt(cliArg('--parallel', '3'), 10);

if (!arnumber || !outDir) {
  console.error('Usage: node ieee-figures.js --arnumber <n> --out-dir <dir> [--parallel <n>]');
  process.exit(1);
}

(async () => {
  // Guard: if validation failed (e.g. process.exit mocked in tests), bail early
  if (!outDir) return;
  fs.mkdirSync(outDir, { recursive: true });

  const { browser, page } = await launch({ headless: true });

  // 1. Navigate to detail page
  const detailUrl = 'https://ieeexplore.ieee.org/document/' + arnumber + '/';
  await goto(page, detailUrl, { timeout: 60000, waitFor: 'h1' });

  // Wait for page to fully render tabs
  await waitForNetworkIdle(page, 5000);

  // 2. Click Figures tab (P0: primary selector = button[role="tab"] for React,
  //                        fallback = a.document-tab-link for backward compat)
  const tabResult = await page.evaluate(() => {
    // Primary: React-style tab buttons
    const tabs = document.querySelectorAll('button[role="tab"]');
    for (const tab of tabs) {
      const text = (tab.textContent || '').trim();
      if (text === 'Figures' || /^Figures\s*\(/.test(text)) {
        tab.click(); return { clicked: true };
      }
    }
    // Fallback: classic <a> document tabs (still live on IEEE as of 2025)
    const links = document.querySelectorAll('a.document-tab-link');
    for (const link of links) {
      if ((link.textContent || '').trim() === 'Figures') {
        link.click(); return { clicked: true, via: 'fallback' };
      }
    }
    return { clicked: false };
  });

  if (!tabResult || !tabResult.clicked) {
    console.log(JSON.stringify({ error: 'no Figures tab found', details: tabResult }));
    await browser.close(); return;
  }

  // Wait for figures panel to render (P1: wait for actual figure images to load)
  await page.waitForSelector('img[src*="mediastore/IEEE"], .document-tab-content img', { timeout: 15000 });

  // 3. Extract image URLs (P2: broadened to support mediastore/ and CDN)
  const figData = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    const urls = [], names = [];
    imgs.forEach(img => {
      if (img.src && (img.src.includes('mediastore.IEEE') || img.src.includes('/mediastore/') || img.src.match(/ieee.*mediastore/i))) {
        const src = img.src.includes('-large') ? img.src : img.src.replace('-small', '-large');
        if (!urls.includes(src)) {
          urls.push(src);
          const m = src.match(/\/([^/]+)-large\./);
          names.push(m ? m[1] : 'fig_' + urls.length);
        }
      }
    });
    return { urls, names, count: urls.length };
  });

  if (figData.count === 0) {
    console.log(JSON.stringify({ error: 'no figures found — click Figures tab first' }));
    await browser.close();
    return;
  }

  // 4. Download figures in parallel via context-pool
  const pool = await createPool(browser, parallel);
  for (let i = 0; i < figData.urls.length; i++) {
    pool.execute(() => downloadFigure(page, figData.urls[i], figData.names[i], outDir));
  }
  const poolResults = await pool.drain();

  // 5. Summarize results
  const saved = poolResults.filter(r => r.path);
  const failed = poolResults.filter(r => !r.path || r.status === 'rejected');

  console.log(JSON.stringify({
    ok: true,
    arnumber,
    figureCount: figData.count,
    saved: saved.length,
    failed: failed.length,
    files: poolResults,
  }, null, 2));

  await browser.close();
})();
