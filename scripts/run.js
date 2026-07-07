/**
 * run.js — Run arbitrary Playwright code (generic fallback)
 *
 * Usage:
 *   node run.js (--code <js-body> | --code-file <path> | --stdin)
 *                  [--expect-download] [--save-as <path> | --download-dir <dir>]
 *                  [--no-close] [--browser <firefox|chrome|msedge>] [--timeout <ms>]
 */

import { launch } from './browser-launcher.js';
import { get } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

let code = opt('--code', '');
const codeFile = opt('--code-file', '');
const useStdin = process.argv.includes('--stdin');
const expectDownload = process.argv.includes('--expect-download');
const saveAsPath = opt('--save-as', '');
const downloadDir = opt('--download-dir', path.resolve(get('download.dir') || '.state/downloads'));
const noClose = process.argv.includes('--no-close');
const dlTimeout = parseInt(opt('--timeout', '120000'));

if (codeFile) { code = fs.readFileSync(codeFile, 'utf8').trim(); }
else if (useStdin) { code = fs.readFileSync(0, 'utf8').trim(); }

if (!code) {
  console.error('Usage: node run.js (--code <js-body> | --code-file <path> | --stdin) [--expect-download] [--save-as <path>] [--no-close] [--browser <browser>]');
  process.exit(1);
}

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });

  const { browser, context, page: mainPage } = await launch();

  let downloadResult = null;
  const downloadPromise = expectDownload
    ? new Promise(resolve => {
        const t = setTimeout(() => resolve(null), dlTimeout);

        function listen(p) {
          p.on('download', async (download) => {
            const filename = download.suggestedFilename();
            const dest = saveAsPath || path.join(downloadDir, filename);
            const ddir = path.dirname(dest);
            if (!fs.existsSync(ddir)) fs.mkdirSync(ddir, { recursive: true });
            try {
              const stream = await download.createReadStream();
              const ws = fs.createWriteStream(dest);
              await new Promise((res, rej) => { stream.pipe(ws); ws.on('finish', res); ws.on('error', rej); stream.on('error', rej); });
              const st = fs.statSync(dest);
              clearTimeout(t); resolve({ filename, path: dest, size: st.size });
            } catch (e) {
              try { await download.saveAs(dest); const st = fs.statSync(dest); clearTimeout(t); resolve({ filename, path: dest, size: st.size }); }
              catch (e2) { clearTimeout(t); resolve({ error: 'download failed: ' + e.message + ' | saveAs: ' + e2.message, filename }); }
            }
          });
        }
        for (const p of context.pages()) listen(p);
        context.on('page', p => listen(p));
      })
    : Promise.resolve(null);

  let result;
  try {
    const fn = eval('(async (page, context) => { ' + code + ' })');
    result = await fn(mainPage, context);
  } catch (e) {
    result = { error: e.message, stack: e.stack?.split('\n').slice(0, 4).join('\n') };
  }

  if (expectDownload) {
    const dl = await downloadPromise;
    result = { ...(result || {}), download: dl };
  }

  console.log(JSON.stringify(result, null, 2));

  if (!noClose) { await browser.close(); }
  else { console.log('// Browser kept open (--no-close)'); }
})();
