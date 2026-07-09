/**
 * ieee-parallel-detail.js — Parallel IEEE detail page extraction
 *
 * Usage:
 *   node ieee-parallel-detail.js --arnumbers "8876906,9665340,10495769" [--parallel 3] [--mode launch|cdp]
 *
 * Returns JSON array of detail results for all papers.
 */
import { launch } from './browser-launcher.js';
import { runBatch } from './batch-runner.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const arnumbers = opt('--arnumbers', '');
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const parallel = parseInt(opt('--parallel', '3'));

if (!arnumbers) {
  console.error('Usage: node ieee-parallel-detail.js --arnumbers "n1,n2,n3" [--parallel 3] [--mode launch|cdp]');
  process.exit(1);
}

const tasks = arnumbers.split(',').map(s => s.trim()).filter(Boolean).map((arn, idx) => ({ arnumber: arn, index: idx + 1 }));

async function ieeeTask(context, taskIndex) {
  const page = await context.newPage();
  const { arnumber } = tasks[taskIndex];
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
  return { ...result };
}

(async () => {
  const launchOpts = { headless: true, mode: dlMode, port: cdpPort };
  if (dlMode === 'cdp') launchOpts.browser = 'chrome';
  const { browser } = await launch(launchOpts);

  const results = await runBatch(ieeeTask, tasks, { browser, concurrency: Math.min(parallel, tasks.length) });

  const output = {
    total: tasks.length,
    results: results.map((r, i) => ({
      index: i + 1,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    })),
  };

  console.log(JSON.stringify(output, null, 2));

  if (dlMode === 'cdp') { try { browser.close(); } catch {}; process.exit(0); }
  else { await browser.close(); }
})();
