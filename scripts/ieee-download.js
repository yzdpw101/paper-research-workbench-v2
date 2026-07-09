/**
 * ieee-download.js — IEEE Xplore PDF download
 *
 * Usage:
 *   node ieee-download.js --arnumber <n> [--save-as <path>] [--timeout <ms>] [--mode launch|cdp] [--browser chrome|firefox|msedge]|[--browser chrome|firefox|msedge]
 *
 * Only supports institutional network (IP authentication). No CARSI/login flow.
 */

import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { isInstitutionalAccess } from './network-detector.js';
import { get } from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { getCDPDownloadDir, pollDownloadDir } from './cdp-download.js';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const arnumber = opt('--arnumber', '');
const saveAsPath = opt('--save-as', '');
const dlMode = opt('--mode', 'launch');
const dlTimeout = parseInt(opt('--timeout', dlMode === 'cdp' ? '120000' : '60000'));
const cdpPort = parseInt(opt('--cdp-port', '9222'));
const browserType = opt('--browser', dlMode === 'cdp' ? 'chrome' : '');

if (!arnumber) {
  console.error('Usage: node ieee-download.js --arnumber <n> [--save-as <path>] [--timeout <ms>] [--mode launch|cdp] [--browser chrome|firefox|msedge]|[--browser chrome|firefox|msedge]');
  process.exit(1);
}

const stampPDF = 'https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=' + arnumber;
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

// ── Main ─────────────────────────────────────────────────────────────────

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });

const headless = !process.argv.includes("--show");
  const launchOpts = { headless, mode: dlMode, port: cdpPort };
  if (browserType) launchOpts.browser = browserType;
  const { browser, page } = await launch(launchOpts);

  // IEEE only supports institutional IP access
  try {
    const hasAccess = await isInstitutionalAccess(page, 'ieee');
    if (!hasAccess) {
      console.warn('[ieee] ⚠️ Not on institutional network. Download may fail.');
    }
  } catch (err) {
    console.warn(`[ieee] Access check skipped: ${err.message}`);
  }

  const result = await new Promise(resolve => {
    const t = setTimeout(() => resolve({ error: 'download timeout' }), dlTimeout);
    let resolved = false;

    function finalize(filepath, filename) {
      if (resolved) return;
      resolved = true;
      clearTimeout(t);
      if (!fs.existsSync(filepath)) {
        (async () => {
          const fDeadline = Date.now() + 5000;
          while (Date.now() < fDeadline) {
            await new Promise(r => setTimeout(r, 200));
            if (fs.existsSync(filepath)) { doFinalize(filepath, filename); return; }
          }
          resolve({ error: 'download file disappeared' });
        })();
        return;
      }
      doFinalize(filepath, filename);
    }

    function doFinalize(filepath, filename) {
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
      if (filepath !== dest) {
        fs.copyFileSync(filepath, dest);
      }
      resolve({ ok: true, arnumber, download: { name: filename, path: dest, size: fs.statSync(dest).size } });
    }

    // ── Event listener (launch mode) ──
    page.on('download', async (dl) => {
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

    // ── CDP poll fallback ──
    const cdpDlDir = getCDPDownloadDir();

    (async () => {
      let preFiles, preCdpFiles;
      try { preFiles = new Set(fs.readdirSync(downloadDir)); } catch { preFiles = new Set(); }
      if (cdpDlDir) {
        try { preCdpFiles = new Set(fs.readdirSync(cdpDlDir)); } catch { preCdpFiles = new Set(); }
      }

      await goto(page, stampPDF, { timeout: dlTimeout }).catch(() => {});

      const polls = [pollDownloadDir(downloadDir, preFiles, dlTimeout)];
      if (cdpDlDir) polls.push(pollDownloadDir(cdpDlDir, preCdpFiles, dlTimeout));
      const filepath = await Promise.race(polls);
      if (filepath && !resolved) {
        const filename = path.basename(filepath);
        finalize(filepath, filename);
      }
    })();
  });

  console.log(JSON.stringify(result, null, 2));
  if (dlMode === 'cdp') { try { browser.close(); } catch {}; process.exit(0); }
  else { await browser.close(); }
})();
