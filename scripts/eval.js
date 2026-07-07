/**
 * eval.js — Navigate + evaluate + return JSON (generic fallback)
 *
 * Usage:
 *   node eval.js --url <url> (--code <js> | --code-file <path> | --stdin)
 *                  [--timeout <ms>] [--browser <firefox|chrome|msedge>]
 */

import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import fs from 'node:fs';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const url = opt('--url', '');
let code = opt('--code', '');
const codeFile = opt('--code-file', '');
const useStdin = process.argv.includes('--stdin');
const timeout = parseInt(opt('--timeout', '30000'));

if (codeFile) { code = fs.readFileSync(codeFile, 'utf8').trim(); }
else if (useStdin) { code = fs.readFileSync(0, 'utf8').trim(); }

if (!url || !code) {
  console.error('Usage: node eval.js --url <url> (--code <js> | --code-file <path> | --stdin)');
  process.exit(1);
}

(async () => {
  const { browser, page } = await launch();

  let result;
  try {
    await goto(page, url, { timeout });
    const fn = eval('(' + code + ')');
    result = await page.evaluate(fn);
  } catch (e) {
    result = { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join('\n') };
  }

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
