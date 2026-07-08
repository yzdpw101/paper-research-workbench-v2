/**
 * wf-chapter.js — Wanfang thesis chapter download (two-step)
 *
 * Step 1 — Analyze:
 *   node wf-chapter.js --action analyze --q "..." --idx 0 [--mode launch|cdp]
 *   → opens chapter page, expands ALL nodes, prints flat tree JSON, exits
 *
 * Step 2 — Download:
 *   node wf-chapter.js --action download --q "..." --idx 0 --ids "2,5,8"
 *                      --save-as "..." [--mode launch|cdp]
 *   → opens chapter page, checks nodes by ID, confirms download, waits for ZIP
 */
import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { get } from './config.js';
import { checkStatus } from './wf-carsi-login.js';
import fs from 'node:fs';
import path from 'node:path';
import { getCDPDownloadDir, waitForZip } from './cdp-download.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const action = opt('--action', 'analyze');
const keyword = opt('--q', '');
const targetIdx = parseInt(opt('--idx', '0'));
const pageNum = opt('--page', '1');
const saveAsPath = opt('--save-as', '');
const idsArg = opt('--ids', '');
const dlMode = opt('--mode', 'launch');
const dlTimeout = parseInt(opt('--timeout', dlMode === 'cdp' ? '120000' : '120000'));
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const browserType = opt('--browser', dlMode === 'cdp' ? 'chrome' : '');

if (!keyword) {
  console.error('Usage: node wf-chapter.js --action analyze|download --q <keyword> [--idx 0] [--ids "2,5,8"] [--save-as <path>] [--mode launch|cdp]');
  process.exit(1);
}

const searchUrl = 'https://s.wanfangdata.com.cn/thesis?q=' + encodeURIComponent(keyword) + '&p=' + pageNum;
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

// ── CDP download helpers ────────────────────────────────────────────────────

// ── Chapter page helpers ────────────────────────────────────────────────────

async function openChapterPage(context, page) {
  await goto(page, searchUrl, { timeout: 60000, waitFor: 'div.normal-list' });

  const loginStatus = await checkStatus(page);
  if (!loginStatus.loggedIn) {
    throw new Error('not logged in — please run wf-carsi-login.js first');
  }

  // Find & click 分章下载
  const hasChapter = await page.evaluate((idx) => {
    const items = [];
    document.querySelectorAll('div.normal-list').forEach((el, i) => {
      if (items.length > idx) return;
      const spans = el.querySelectorAll('.button-list span');
      let chBtn = null;
      spans.forEach(s => { if ((s.innerText || '').trim() === '分章下载') chBtn = s; });
      if (chBtn) items.push({ idx: i, ok: true });
    });
    if (items[idx] && items[idx].ok) {
      const spans = document.querySelectorAll('div.normal-list')[items[idx].idx].querySelectorAll('.button-list span');
      document.querySelectorAll('[data-target="wf-ch"]').forEach(e => e.removeAttribute('data-target'));
      spans.forEach(s => { if ((s.innerText || '').trim() === '分章下载') s.setAttribute('data-target', 'wf-ch'); });
      return true;
    }
    return false;
  }, targetIdx);

  if (!hasChapter) throw new Error('no chapter download button for index ' + targetIdx);

  const [chPage] = await Promise.all([
    context.waitForEvent('page', { predicate: p => /part\/thesis|chapter/i.test(p.url()), timeout: 20000 }),
    page.$eval('[data-target="wf-ch"]', el => el.click())
  ]);

  if (!chPage) throw new Error('chapter page did not open — try CDP mode (--mode cdp)');
  await chPage.bringToFront();
  await chPage.waitForLoadState('domcontentloaded');
  await new Promise(r => setTimeout(r, 2000));
  return chPage;
}

async function expandAllNodes(chPage) {
  // BFS: click all collapsed arrows per round, then re-scan
  let round = 0;
  while (round < 10) {
    const before = await chPage.evaluate(() => document.querySelectorAll('.ivu-tree li').length);
    // Click all arrows that are NOT already open (collapsed = has <i> child, open = class ivu-tree-arrow-open)
    await chPage.evaluate(() => {
      document.querySelectorAll('.ivu-tree-arrow').forEach(a => {
        if (!a.classList.contains('ivu-tree-arrow-open') && a.querySelector('i')) {
          a.click();
        }
      });
    });
    await new Promise(r => setTimeout(r, 800));
    const after = await chPage.evaluate(() => document.querySelectorAll('.ivu-tree li').length);
    if (after === before) break;
    round++;
  }
}

async function getNodeList(chPage) {
  return chPage.evaluate(() => {
    return Array.from(document.querySelectorAll('.ivu-tree li')).map((li, i) => {
      const title = li.querySelector('.ivu-tree-title')?.textContent?.trim() || '';
      const hasArrow = !!li.querySelector('.ivu-tree-arrow');
      return { id: i, title, hasArrow };
    });
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });
const headless = !process.argv.includes("--show");
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (browserType) launchOpts.browser = browserType;
  const { browser, context, page } = await launch(launchOpts);

  try {
    const chPage = await openChapterPage(context, page);

    if (action === 'analyze') {
      console.log('[analyze] Expanding all nodes...');
      await expandAllNodes(chPage);
      const nodes = await getNodeList(chPage);
      console.log(JSON.stringify({ action: 'analyze', totalNodes: nodes.length, nodes }, null, 2));

    } else if (action === 'download') {
      const ids = idsArg.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      if (ids.length === 0) throw new Error('--ids required for download (e.g. --ids "2,5,8")');

      // Expand all first to surface the checkboxes
      await expandAllNodes(chPage);

      // Get all checkbox labels
      const labels = await chPage.locator('label.ivu-checkbox-wrapper').all();
      let checked = 0;
      for (const id of ids) {
        if (id < labels.length) {
          await chPage.evaluate(i => { document.querySelectorAll("label.ivu-checkbox-wrapper")[i]?.click(); }, id);
          checked++;
        }
      }
      await new Promise(r => setTimeout(r, 300));

      if (checked === 0) throw new Error('no nodes checked — check --ids values against analyze output');

      // Snapshot for CDP poll
      const startTime = Date.now();
      const cdpDlDir = getCDPDownloadDir();

      // Launch mode: set up download listener before clicking confirm
      let dlResolve;
      const dlPromise = dlMode !== 'cdp' ? new Promise(resolve => {
        dlResolve = resolve;
        const onDownload = async (dl) => {
          const dest = saveAsPath || path.join(downloadDir, dl.suggestedFilename());
          const dd = path.dirname(dest);
          if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
          try {
            const stream = await dl.createReadStream();
            const ws = fs.createWriteStream(dest);
            await new Promise((res, rej) => { stream.pipe(ws); ws.on('finish', res); ws.on('error', rej); stream.on('error', rej); });
          } catch (_) { await dl.saveAs(dest); }
          resolve({ status: 'ok', download: { name: dl.suggestedFilename(), path: dest, size: fs.statSync(dest).size } });
        };
        // Bind to all pages — download event may fire on any page in the context
        for (const p of context.pages()) p.on('download', onDownload);
        context.on('page', p => p.on('download', onDownload));
      }) : null;

      // Click confirm
      await chPage.locator('button:has-text("确认下载")').first().click();

      // Wait for ZIP
      if (dlMode === 'cdp') {
        const dirs = [downloadDir];
        if (cdpDlDir) dirs.push(cdpDlDir);
        const zipPath = await waitForZip(dirs, startTime, dlTimeout);
        if (zipPath) {
          const filename = path.basename(zipPath);
          const dest = saveAsPath || path.join(downloadDir, filename);
          const dd = path.dirname(dest);
          if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });
          if (zipPath !== dest) fs.copyFileSync(zipPath, dest);
          console.log(JSON.stringify({ status: 'ok', download: { name: filename, path: dest, size: fs.statSync(dest).size } }, null, 2));
        } else {
          console.log(JSON.stringify({ status: 'error', error: 'ZIP not found — download may have failed' }, null, 2));
        }
      }
      // Launch mode: wait for Playwright download event
      if (dlMode !== 'cdp' && dlPromise) {
        const r = await dlPromise;
        console.log(JSON.stringify(r, null, 2));
      }
    }

  } catch (e) {
    console.log(JSON.stringify({ status: 'error', error: e.message }, null, 2));
  }

  if (dlMode === 'cdp') {
    try { browser.close(); } catch {}
    setTimeout(() => process.exit(0), 3000);
  } else {
    await browser.close();
  }
})();
