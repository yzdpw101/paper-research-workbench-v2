/**
 * wf-parallel-detail.js — Parallel Wanfang detail page extraction
 *
 * Usage:
 *   node wf-parallel-detail.js --urls "url1,url2,url3" [--parallel 3] [--mode launch|cdp]
 *
 * Returns JSON array of detail results for all papers.
 */
import { launch } from './browser-launcher.js';
import { runBatch } from './batch-runner.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const urls = opt('--urls', '');
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const parallel = parseInt(opt('--parallel', '3'));

if (!urls) {
  console.error('Usage: node wf-parallel-detail.js --urls "url1,url2,url3" [--parallel 3] [--mode launch|cdp]');
  process.exit(1);
}

const tasks = urls.split(',').map(s => s.trim()).filter(Boolean).map((url, idx) => ({ url, index: idx + 1 }));

async function wanfangTask(context, taskIndex) {
  const page = await context.newPage();
  const { url } = tasks[taskIndex];
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(() => {
    const raw = (document.body?.innerText || '').replace(/\t/g, ' ');

    const doiM = raw.match(/DOI[：:]\s*(10\.\S+)/);
    const titleM = raw.match(/DOI[：:]\s*\S+\s*\n\s*([^\n]+)/);
    const absM = raw.match(/摘要[：:]\s*([\s\S]+?)(?:\n\s*(?:关键词|分类号|基金))/s);
    const kwM = raw.match(/关键词[：:]\s*(.+?)(?:\s*\n)/s);
    const clsM = raw.match(/分类号[：:]\s*(.+?)(?:\s*\n)/s);

    return {
      url: location.href,
      title: titleM ? titleM[1].trim() : '',
      doi: doiM ? doiM[1] : '',
      abstract: absM ? absM[1].trim().slice(0, 1500) : '',
      keywords: kwM ? kwM[1].trim() : '',
      classification: clsM ? clsM[1].trim() : '',
    };
  });

  await page.close();
  return { ...result };
}

(async () => {
  const launchOpts = { headless: true, mode: dlMode, port: cdpPort };
  if (dlMode === 'cdp') launchOpts.browser = 'chrome';
  const { browser } = await launch(launchOpts);

  const results = await runBatch(wanfangTask, tasks, { browser, concurrency: Math.min(parallel, tasks.length) });

  const output = {
    total: tasks.length,
    results: results.map((r, i) => ({
      index: i + 1,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    })),
  };

  console.log(JSON.stringify(output, null, 2));

  if (dlMode === 'cdp') { try { browser.close(); } catch {}; process.exit(0); }
  else { await browser.close(); process.exit(0); }
})();
