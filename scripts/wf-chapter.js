/**
 * wf-chapter.js — Wanfang thesis chapter download (one-shot)
 *
 * Usage:
 *   node wf-chapter.js --q <keyword> [--idx <n>] [--page <n>]
 *                      [--expand <ch1,ch2>] [--check <sec1,sec2>]
 *                      [--save-as <path>] [--timeout 120000] [--no-close]
 *
 * --q        : Search keyword (required)
 * --idx      : 0-based result index (default: 0)
 * --page     : Search result page (default: 1)
 * --expand   : Chapter titles to expand (comma-separated)
 * --check    : Subsection titles to check (comma-separated), or "auto:2" for first 2
 * --save-as  : Final download path (default: .state/downloads/<auto-name>)
 * --no-close : Keep browser open
 *
 * Return: {status:"ok"|"error", download:{name,path,size}?, details:{tier,nodes,expanded,checked}}
 */

import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { get } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const keyword = opt('--q', '');
const targetIdx = parseInt(opt('--idx', '0'));
const pageNum = opt('--page', '1');
const expandArg = opt('--expand', '');
const checkArg = opt('--check', 'auto:2');
const saveAs = opt('--save-as', '');
const noClose = process.argv.includes('--no-close');
const dlTimeout = parseInt(opt('--timeout', '120000'));

if (!keyword) {
  console.error('Usage: node wf-chapter.js --q <keyword> [--idx 0] [--expand ch1,ch2] [--check sec1,sec2|auto:N] [--save-as path] [--timeout 120000] [--no-close]');
  process.exit(1);
}

const expandList = expandArg ? expandArg.split(',').map(s => s.trim()).filter(Boolean) : [];
const isAutoCheck = checkArg.startsWith('auto:');
const autoCheckCount = isAutoCheck ? parseInt(checkArg.split(':')[1] || '2') : 0;
const checkList = isAutoCheck ? [] : checkArg.split(',').map(s => s.trim()).filter(Boolean);

const searchUrl = 'https://s.wanfangdata.com.cn/thesis?q=' + encodeURIComponent(keyword) + '&p=' + pageNum;
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

(async () => {
  const { browser, context, page } = await launch();

  // Download promise
  const dlResult = await new Promise(resolve => {
    const t = setTimeout(() => resolve({ status: 'error', error: 'timeout' }), dlTimeout);

    function listen(p) {
      p.on('download', async (dl) => {
        const dest = saveAs || path.join(downloadDir, dl.suggestedFilename());
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        // Stream-based save — more reliable than saveAs on Windows
        try {
          const stream = await dl.createReadStream();
          const ws = fs.createWriteStream(dest);
          await new Promise((resolve, reject) => {
            stream.pipe(ws);
            ws.on('finish', resolve);
            ws.on('error', reject);
            stream.on('error', reject);
          });
        } catch (_) {
          await dl.saveAs(dest); // fallback
        }
        clearTimeout(t);
        resolve({ status: 'ok', download: { name: dl.suggestedFilename(), path: dest, size: fs.statSync(dest).size } });
      });
    }
    for (const p of context.pages()) listen(p);
    context.on('page', p => listen(p));

    // Main flow
    (async () => {
      // page already available from launch() — search + login + mark
      await goto(page, searchUrl, {
        timeout: 60000,
        waitFor: 'div.normal-list'
      });

      const loginCheck = await page.evaluate(() => {
        const text = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 8000);
        const headerEl = document.querySelector('header,.header,.top,.topbar,.user-info,.nav,[class*=header],[class*=top],[class*=login]');
        const header = ((headerEl && headerEl.innerText) || text.slice(0, 1200)).replace(/\s+/g, ' ');
        const hasLoginText = /登录|注册/.test(header);
        const hasLogout = /退出登录|退出|注销/.test(header);
        const hasInstitution = /大学图书馆|图书馆/.test(header);
        const noAccess = /无权限|购买|充值|机构权限|未订购|无法下载/.test(text);
        const logged = (hasLogout || hasInstitution || !hasLoginText) && !noAccess;
        return { logged, header: header.slice(0, 160) };
      });
      if (!loginCheck.logged) {
        if (noClose) {
          console.error('\n========================================');
          console.error('⚠️  Not logged in to Wanfang.');
          console.error('    → Firefox window is open.');
          console.error('    → Log in via CARSI (机构登录).');
          console.error('    → CLOSE the Firefox window when done.');
          console.error('    → Re-run without --no-close next time.');
          console.error('========================================\n');
          // Wait for browser to close
          context.on('close', () => { console.log('Browser closed. Run again without --no-close.'); process.exit(0); });
          await new Promise(() => {});
        }
        clearTimeout(t); resolve({ status: 'error', error: 'not logged in — use --no-close and log in manually' }); return;
      }

      // 2. Find & mark 分章下载 button
      const mark = await page.evaluate((idx) => {
        const items = [];
        document.querySelectorAll('div.normal-list').forEach((el, i) => {
          if (items.length > idx) return;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const m = t.match(/^(\d+)\.(?:目录\s*)?(.+?)(文摘阅读)/);
          if (!m) return;
          const title = m[2].trim();
          if (title.length > 8) {
            const spans = el.querySelectorAll('.button-list span');
            let chBtn = null;
            spans.forEach(s => { if ((s.innerText || '').trim() === '分章下载') chBtn = s; });
            items.push({ idx: i, title, hasChapter: !!chBtn });
          }
        });
        if (items[idx] && items[idx].hasChapter) {
          const el = document.querySelectorAll('div.normal-list')[items[idx].idx];
          const spans = el.querySelectorAll('.button-list span');
          document.querySelectorAll('[data-target="wf-ch"]').forEach(e => e.removeAttribute('data-target'));
          spans.forEach(s => { if ((s.innerText || '').trim() === '分章下载') s.setAttribute('data-target', 'wf-ch'); });
          return { ok: true, title: items[idx].title };
        }
        return { error: 'no chapter download for index ' + idx, available: items.slice(0, 5).map(x => x.title) };
      }, targetIdx);

      if (mark.error) { clearTimeout(t); resolve({ status: 'error', ...mark }); return; }

      // 3. Click 分章下载
      await page.click('[data-target="wf-ch"]');

      // 4. Switch to chapter page
      let chPage = null;
      let dlStart = Date.now(); while (Date.now() - dlStart < 20000) {
        for (const p of context.pages()) {
          if (p !== page && p.url().includes('part/thesis')) { chPage = p; break; }
        }
        if (chPage) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!chPage) { clearTimeout(t); resolve({ status: 'error', error: 'chapter page did not open' }); return; }

      await chPage.bringToFront();
      await chPage.waitForLoadState('domcontentloaded');
      // Wait for tree to render
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 5. Diagnose tree
      const diag = await chPage.evaluate(() => {
        const nodes = [];
        document.querySelectorAll('.ivu-tree li').forEach((li, i) => {
          const title = li.querySelector('.ivu-tree-title')?.textContent?.trim() || '';
          const hasArrow = !!li.querySelector('.ivu-tree-arrow i');
          nodes.push({ i, title, hasArrow });
        });
        const arrowCount = document.querySelectorAll('.ivu-tree-arrow i').length;
        const hasChapters = nodes.some(n => /^第.+章|^\d+\s/.test(n.title));
        const tier = arrowCount === 0 ? (hasChapters ? 'flat' : 'none') : 'nested';
        return { tier, totalNodes: nodes.length, nodes };
      });

      if (diag.tier === 'none') {
        clearTimeout(t);
        resolve({ status: 'error', error: 'no chapter bookmarks in PDF', details: { tier: 'none' } });
        return;
      }

      // 6. Expand & check
      let expanded = 0, checked = 0;

      // Auto-expand: if no explicit --expand but using auto check, expand chapters with children
      const effectiveExpand = expandList.length > 0 ? expandList
        : (autoCheckCount > 0 && diag.tier === 'nested') ? diag.nodes.filter(n => n.hasArrow && /^第.+章|^\d+\s/.test(n.title)).slice(0, autoCheckCount).map(n => n.title)
        : [];

      if (diag.tier === 'nested' && effectiveExpand.length > 0) {
        // Expand chapters
        const items = await chPage.locator('li').all();
        for (const item of items) {
          const titleEl = item.locator(':scope > .ivu-tree-arrow + label + .ivu-tree-title, :scope > label + .ivu-tree-title');
          if (await titleEl.count() === 0) continue;
          const txt = (await titleEl.first().textContent()) || '';
          for (const ch of effectiveExpand) {
            if (txt.includes(ch) && !/\d+[.．]\d+/.test(txt)) {
              const arrow = item.locator(':scope > .ivu-tree-arrow i');
              if (await arrow.count() > 0) { await arrow.click(); expanded++; await new Promise(resolve => setTimeout(resolve, 200)); }
              break;
            }
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Check subsections
      if (diag.tier === 'nested' && checkList.length > 0) {
        const labels = await chPage.locator('label.ivu-checkbox-wrapper').all();
        for (const label of labels) {
          if (checked >= checkList.length) break;
          const titleEl = label.locator('~ .ivu-tree-title');
          if (await titleEl.count() === 0) continue;
          const txt = (await titleEl.first().textContent()) || '';
          for (const s of checkList) {
            if (txt.trim().startsWith(s)) { await label.click(); checked++; break; }
          }
        }
      } else if (diag.tier === 'nested' && autoCheckCount > 0) {
        // Auto-check first N subsections
        const labels = await chPage.locator('label.ivu-checkbox-wrapper').all();
        for (const label of labels) {
          if (checked >= autoCheckCount) break;
          const titleEl = label.locator('~ .ivu-tree-title');
          if (await titleEl.count() === 0) continue;
          const txt = (await titleEl.first().textContent()) || '';
          if (/^\d+[.．]\d+/.test(txt)) { await label.click(); checked++; }
        }
      } else if (diag.tier === 'flat') {
        // Check first N leaf nodes
        const labels = await chPage.locator('label.ivu-checkbox-wrapper').all();
        const n = autoCheckCount || 2;
        for (const label of labels) {
          if (checked >= n) break;
          await label.click(); checked++;
        }
      }

      if (checked === 0) {
        clearTimeout(t);
        resolve({ status: 'error', error: 'no sections checked', details: { tier: diag.tier, expanded, checked, suggest: 'try --check "section title"' } });
        return;
      }

      // Wait for checkbox state to settle
      await new Promise(resolve => setTimeout(resolve, 300));

      // 7. Confirm download
      await chPage.locator('button').filter({ hasText: '确认下载' }).first().click();

      // Download will be captured by the listener
    })().catch(e => { clearTimeout(t); resolve({ status: 'error', error: e.message }); });
  });

  // Output
  if (dlResult.details && !dlResult.download) {
    // Also include node list for diagnostics
    dlResult.details.nodes = dlResult.details.nodes?.slice(0, 25).map(n => n.title);
  }
  console.log(JSON.stringify(dlResult, null, 2));

  if (!noClose) {
    await browser.close();
  } else {
    console.log('// Browser kept open (--no-close)');
  }
})();
