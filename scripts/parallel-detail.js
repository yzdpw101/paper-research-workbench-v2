/**
 * parallel-detail.js — Parallel detail page extraction (IEEE + Wanfang)
 *
 * Usage:
 *   # IEEE: multiple arnumbers
 *   node parallel-detail.js --platform ieee --arnumbers "8876906,9665340" [--mode launch|cdp]
 *
 *   # Wanfang: multiple URLs
 *   node parallel-detail.js --platform wanfang --urls "url1,url2" [--mode launch|cdp]
 *
 * Returns JSON array of detail results for all papers.
 */
import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { runBatch } from './batch-runner.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const platform = opt('--platform', 'ieee').toLowerCase();
const arnumbers = opt('--arnumbers', '');
const urls = opt('--urls', '');
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const parallel = parseInt(opt('--parallel', '3'));

if (!['ieee', 'wanfang'].includes(platform)) {
  console.error('Usage: node parallel-detail.js --platform ieee|wanfang --arnumbers "n1,n2" OR --urls "url1,url2" [--mode launch|cdp] [--parallel 3]');
  process.exit(1);
}

let targets = [];
if (platform === 'ieee') {
  targets = arnumbers.split(',').map(s => s.trim()).filter(Boolean);
} else {
  targets = urls.split(',').map(s => s.trim()).filter(Boolean);
}
if (targets.length === 0) {
  console.error('Error: --arnumbers or --urls required');
  process.exit(1);
}

// Build task list
const tasks = targets.map((target, index) => ({
  keyword: target,
  index: index + 1,
}));

// IEEE detail task
async function ieeeTask(context, taskIndex) {
  const page = await context.newPage();
  const arnumber = tasks[taskIndex].keyword;
  await page.goto(`https://ieeexplore.ieee.org/document/${arnumber}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(() => {
    const raw = (document.body?.innerText || '').replace(/\t/g, ' ');
    const b = raw.replace(/[\s]+/g, ' ');

    const title = (document.querySelector('h1')?.textContent || '').trim().replace(/\s+/g, ' ');
    const am = b.match(/Cite This\s*PDF\s+(.+?)All Authors/);
    const authors = am ? am[1].trim().split(';').map(s => s.trim()).filter(s => s.length > 2) : [];
    const absM = b.match(/Abstract:\s*([\s\S]+?)(?:Published in:|Date of Conference:|DOI:|Publisher:|Show More)/i);
    const abstract = absM ? absM[1].trim() : '';
    const doiM = b.match(/DOI:\s*(10\.\S+)/);
    const citedM = b.match(/Cited by:\s*(\d+)/i);
    const kwM = b.match(/Author Keywords\s*\n(.*?)(?:\n\s*\n)/s);

    return {
      arnumber: (new URL(location.href)).pathname.match(/\/document\/(\d+)/)?.[1] || '',
      title, authors: authors.slice(0, 5),
      abstract: abstract.slice(0, 1500),
      doi: doiM ? doiM[1] : '',
      citedBy: citedM ? parseInt(citedM[1]) : 0,
      keywords: kwM ? kwM[1].trim() : '',
    };
  });

  await page.close();
  return { status: 'ok', index: taskIndex + 1, arnumber, ...result };
}

// Wanfang detail task
async function wanfangTask(context, taskIndex) {
  const page = await context.newPage();
  const url = tasks[taskIndex].keyword;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(() => {
    const raw = (document.body?.innerText || '').replace(/\t/g, ' ');

    const doiM = raw.match(/DOI[：:]\s*(10\.\S+)/);
    const titleM = raw.match(/DOI[：:]\s*\S+\s*\n\s*([^\n]+)/);
    const absM = raw.match(/摘要[：:]\s*([\s\S]+?)(?:\n\s*(?:关键词|分类号|基金))/s);
    const kwM = raw.match(/关键词[：:]\s*(.+?)(?:\s*\n)/s);
    const clsM = raw.match(/分类号[：:]\s*(.+?)(?:\s*\n)/);

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
  return { status: 'ok', index: taskIndex + 1, ...result };
}

(async () => {
  const launchOpts = { headless: true, mode: dlMode, port: cdpPort };
  if (dlMode === 'cdp') launchOpts.browser = 'chrome';
  const { browser } = await launch(launchOpts);

  const taskFn = platform === 'ieee' ? ieeeTask : wanfangTask;
  const results = await runBatch(taskFn, tasks, { browser, concurrency: Math.min(parallel, tasks.length) });

  const output = {
    platform,
    total: tasks.length,
    results: results.map((r, i) => ({
      index: i + 1,
      status: r.status === 'fulfilled' ? 'ok' : 'error',
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    })),
  };

  console.log(JSON.stringify(output, null, 2));

  if (dlMode === 'cdp') { try { browser.close(); } catch {}; process.exit(0); }
  else { await browser.close(); }
})();
