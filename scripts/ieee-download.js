/**
 * ieee-download.js — IEEE Xplore PDF download
 *
 * Usage:
 *   node ieee-download.js --arnumber <n> [--save-as <path>] [--timeout <ms>] [--mode launch|cdp]
 *
 * Only supports institutional network (IP authentication). No CARSI/login flow.
 */

import { launch } from './browser-launcher.js';
import { goto } from './navigator.js';
import { isInstitutionalAccess } from './network-detector.js';
import { get } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const arnumber = opt('--arnumber', '');
const saveAsPath = opt('--save-as', '');
const dlTimeout = parseInt(opt('--timeout', '60000'));
const dlMode = opt('--mode', 'launch');
const cdpPort = parseInt(opt('--cdp-port', '9222'));

if (!arnumber) {
  console.error('Usage: node ieee-download.js --arnumber <n> [--save-as <path>] [--timeout 60000] [--mode launch|cdp]');
  process.exit(1);
}

const stampPDF = 'https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=' + arnumber;
const downloadDir = path.resolve(get('download.dir') || '.state/downloads');

// ── CDP download helpers ─────────────────────────────────────────────────

function getCDPDownloadDir() {
  try {
    if (dlMode !== 'cdp') return null;
    const stateDir = path.resolve(get('state.dir') || '.state');
    const prefPath = path.join(stateDir, 'profiles', 'chrome-cdp', 'Default', 'Preferences');
    if (!fs.existsSync(prefPath)) return null;
    const raw = fs.readFileSync(prefPath, 'utf-8');
    const prefs = JSON.parse(raw);
    return prefs?.download?.default_directory || prefs?.savefile?.default_directory || null;
  } catch {
    return null;
  }
}

async function pollDownloadDir(dir, knownFiles, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const entries = fs.readdirSync(dir).filter(f =>
      !knownFiles.has(f) && !f.endsWith('.tmp') && !f.endsWith('.crdownload')
    );
    if (entries.length > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return path.join(dir, entries[entries.length - 1]);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────

(async () => {
  fs.mkdirSync(downloadDir, { recursive: true });

  const { browser, page } = await launch({ headless: true, mode: dlMode, port: cdpPort });

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
        setTimeout(() => {
          if (!fs.existsSync(filepath)) { resolve({ error: 'download file disappeared' }); return; }
          doFinalize(filepath, filename);
        }, 2000);
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
  await browser.close();
})();
