/**
 * cdp-download.js — Shared CDP download helpers
 *
 * Used by wf-download, ieee-download, wf-chapter, and batch scripts.
 * CDP mode: Playwright can't intercept Chrome downloads, so we poll filesystem.
 *
 * Module interface:
 *   getCDPDownloadDir(browserType)   — Read Chrome's download dir from profile
 *   pollDownloadDir(dir, known, ms)  — Poll dir for new files
 *   waitForZip(dirs, start, ms)      — Wait for .zip file newer than start time
 *   waitForFile(dirs, start, ext, ms)— Wait for any file with given extension
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { get } from './config.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

export function getCDPDownloadDir(browserType = 'chrome') {
  try {
    const stateDir = path.resolve(get('state.dir') || '.state');
    const profilesDir = path.join(stateDir, 'profiles');
    const candidates = [];
    const bp = (browserType || 'chrome') + '-cdp';
    candidates.push(path.join(profilesDir, bp, 'Default', 'Preferences'));
    if (fs.existsSync(profilesDir)) {
      for (const d of fs.readdirSync(profilesDir)) {
        const pp = path.join(profilesDir, d, 'Default', 'Preferences');
        if (!candidates.includes(pp)) candidates.push(pp);
      }
    }
    for (const pp of candidates) {
      if (!fs.existsSync(pp)) continue;
      const prefs = JSON.parse(fs.readFileSync(pp, 'utf-8'));
      const dd = prefs?.download?.default_directory || prefs?.savefile?.default_directory || null;
      if (dd) return dd;
    }
    return path.join(os.homedir(), 'Downloads');
  } catch { return path.join(os.homedir(), 'Downloads'); }
}

export async function pollDownloadDir(dir, knownFiles, timeout = 60000) {
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

export function waitForFile(dirs, startTime, extension, timeout = 120000) {
  return new Promise((resolve) => {
    const check = () => {
      if (Date.now() - startTime > timeout) { resolve(null); return; }
      for (const dir of dirs) {
        try {
          for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith(extension)) continue;
            const fp = path.join(dir, f);
            const stat = fs.statSync(fp);
            if (stat.mtimeMs > startTime - 3000 && stat.size > 1024) {
              setTimeout(() => resolve(fp), 1000);
              return;
            }
          }
        } catch {}
      }
      setTimeout(check, 500);
    };
    check();
  });
}

export function waitForZip(dirs, startTime, timeout = 120000) {
  return waitForFile(dirs, startTime, '.zip', timeout);
}

export function waitForTxt(dirs, startTime, timeout = 120000) {
  return waitForFile(dirs, startTime, '.txt', timeout);
}
