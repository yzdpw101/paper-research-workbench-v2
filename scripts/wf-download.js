/**
 * wf-download.js — Wanfang paper download (one-shot)
 *
 * Usage:
 *   node wf-download.js --q <keyword> --type <paper|periodical|thesis|conference|...>
 *                       [--idx <n>] [--page <n>] [--save-as <path>] [--timeout <ms>]
 *
 * Handles both thesis (整篇下载→新标签→倒计时→点击此处) and periodical (下载→直接触发) flows.
 */

import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { get } from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { getCDPDownloadDir, pollDownloadDir } from './cdp-download.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const wfType = opt('--type', 'paper');
const targetIdx = parseInt(opt('--idx', '0'));
const pageNum = opt('--page', '1');
const saveAsPath = opt('--save-as', '');
const dlMode = opt('--mode', 'launch');
const dlTimeout = parseInt(opt('--timeout', dlMode === 'cdp' ? '120000' : '120000'));
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const browserType = opt('--browser', dlMode === 'cdp' ? 'chrome' : '');

if (!keyword) {
  console.error('Usage: node wf-download.js --q <keyword> --type <paper|thesis|periodical|...> [--idx 0] [--save-as <path>] [--mode launch|cdp] [--browser chrome|firefox]');
  process.exit(1);
}

const searchUrl = 'https://s.wanfangdata.com.cn/' + wfType + '?q=' + encodeURIComponent(keyword) + '&p=' + pageNum;
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });
const headless = !process.argv.includes("--show");
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (browserType) launchOpts.browser = browserType;
  const { browser, context, page } = await launch(launchOpts);

  const result = await new Promise(resolve => {
    const t = setTimeout(() => resolve({ error: 'download timeout' }), dlTimeout);
    let resolved = false;

    function finalize(filepath, filename) {
      if (resolved) return;
      resolved = true;
      clearTimeout(t);
      // Chrome renames .crdownload -> final filename; poll until it appears
      if (!fs.existsSync(filepath)) {
        (async () => {
          const fDeadline = Date.now() + 5000;
          while (Date.now() < fDeadline) {
            await new Promise(r => setTimeout(r, 200));
            if (fs.existsSync(filepath)) { _doFinalize(filepath, filename); return; }
          }
          resolve({ error: 'download file disappeared' });
        })();
        return;
      }
      _doFinalize(filepath, filename);
    }

    function _doFinalize(filepath, filename) {
      let dest;
      if (saveAsPath) {
        if ((fs.existsSync(saveAsPath) && fs.statSync(saveAsPath).isDirectory()) || !path.extname(saveAsPath)) {
          dest = path.join(saveAsPath, filename);
        } else {
          dest = saveAsPath;
        }
      } else {
        dest = path.join(downloadDir, filename);
      }
      const dd = path.dirname(dest);
      if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
      // If the file is not already at dest, copy it
      if (filepath !== dest) {
        fs.copyFileSync(filepath, dest);
      }
      resolve({ ok: true, title: _title, download: { name: filename, path: dest, size: fs.statSync(dest).size } });
    }

    // ── Event-based download listener (works in normal launch mode) ──────
    function listen(p) {
      p.on('download', async (dl) => {
        const filename = path.basename(dl.suggestedFilename());
        const dd = path.dirname(path.join(downloadDir, filename));
        if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
        let tempPath;
        try {
          const stream = await dl.createReadStream();
          const dest = path.join(downloadDir, filename);
          const ws = fs.createWriteStream(dest);
          await new Promise((res, rej) => { stream.pipe(ws); ws.on('finish', res); ws.on('error', rej); stream.on('error', rej); });
          tempPath = dest;
        } catch (_) {
          await dl.saveAs(path.join(downloadDir, filename));
          tempPath = path.join(downloadDir, filename);
        }
        finalize(tempPath, filename);
      });
    }
    for (const p of context.pages()) listen(p);
    context.on('page', p => listen(p));

    // ── Filesystem poll fallback (works in CDP mode) ─────────────────────
    let startPoll = null; // set after click

    let _title = '';

    (async () => {
      await goto(page, searchUrl, {
        timeout: parseInt(opt('--nav-timeout', '60000')),
        waitFor: 'div.normal-list'
      });

      const mark = await page.evaluate((idx) => {
        const text = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 8000);
        const headerEl = document.querySelector('header,.header,.top,.topbar,.user-info,.nav,[class*=header],[class*=top],[class*=login]');
        const header = ((headerEl && headerEl.innerText) || text.slice(0, 1200)).replace(/\s+/g, ' ');
        const accessReady = /退出登录|退出|注销/.test(header) || /大学图书馆|图书馆/.test(header);
        if (!accessReady) console.warn('未检测到登录态（可能是校园网IP认证，不影响使用），仍继续尝试下载');

        const items = [];
        document.querySelectorAll('div.normal-list').forEach((el, i) => {
          if (items.length > idx) return;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          // Match: "N.目录<TITLE>文摘阅读..." — title ends before 文摘阅读
          const m = t.match(/^(\d+)\.(?:目录\s*)?(.+?)(?=\s*(?:文摘阅读|在线阅读|$))/);
          if (!m) return;
          const title = m[2].trim();
          if (title.length > 8) {
            const btns = el.querySelectorAll('.wf-list-button, .button-list span, [class*=button] span, span');
            let dlBtn = null;
            btns.forEach(s => { const txt = (s.innerText || '').trim(); if (txt === '整篇下载' || txt === '下载') dlBtn = s; });
            items.push({ idx: i, title, hasBtn: !!dlBtn });
          }
        });
        if (items[idx] && items[idx].hasBtn) {
          const el = document.querySelectorAll('div.normal-list')[items[idx].idx];
          const btns = el.querySelectorAll('.wf-list-button, .button-list span, [class*=button] span, span');
          document.querySelectorAll('[data-target="wf-dl"]').forEach(e => e.removeAttribute('data-target'));
          btns.forEach(s => { const txt = (s.innerText || '').trim(); if (txt === '整篇下载' || txt === '下载') s.setAttribute('data-target', 'wf-dl'); });
          return { ok: true, title: items[idx].title };
        }
        return { error: 'no download button for index ' + idx };
      }, targetIdx);

      if (mark.error) { clearTimeout(t); resolve(mark); return; }
      _title = mark.title;

      // Snapshot download dir before triggering download (for poll fallback)
      let preFiles;
      try { preFiles = new Set(fs.readdirSync(downloadDir)); } catch { preFiles = new Set(); }
      // CDP mode: also snapshot Chrome's actual download directory
      const cdpDlDir = getCDPDownloadDir();
      let preCdpFiles;
      if (cdpDlDir) {
        try { preCdpFiles = new Set(fs.readdirSync(cdpDlDir)); } catch { preCdpFiles = new Set(); }
      }

      // Register page listener BEFORE click (for thesis download page detection)
      const newPagePromise = context.waitForEvent('page', {
        predicate: p => p.url().includes('f.wanfangdata.com.cn'),
        timeout: 15000
      }).catch(() => null);

      await page.$eval('[data-target="wf-dl"]', el => el.click());

      // Start poll fallback after click — poll both project dir and CDP dir
      const polls = [pollDownloadDir(downloadDir, preFiles, dlTimeout)];
      if (cdpDlDir) {
        polls.push(pollDownloadDir(cdpDlDir, preCdpFiles, dlTimeout));
      }
      startPoll = Promise.race(polls).then(p => {
        if (p && !resolved) {
          const filename = path.basename(p);
          finalize(p, filename);
        }
      });

      // Wait for thesis download page (event-driven, no polling)
      const dlPage = await newPagePromise;
      if (dlPage) {
        await dlPage.bringToFront();
        await dlPage.waitForLoadState('domcontentloaded');
        try {
          const clickHere = dlPage.locator('a:has-text("点击此处")');
          await clickHere.waitFor({ timeout: 30000 });
          await clickHere.click();
        } catch {
          // "点击此处" may not appear (periodical or already triggered download)
        }
      }
    })().catch(e => { clearTimeout(t); resolve({ error: e.message }); });
  });

  console.log(JSON.stringify(result, null, 2));
  // CDP mode: disconnect fast, force exit if it hangs (result already printed)
  if (dlMode === 'cdp') {
    try { browser.close(); } catch {}
    setTimeout(() => process.exit(0), 3000);
  } else { await browser.close(); }
})();
