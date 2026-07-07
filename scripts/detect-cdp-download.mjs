/**
 * detect-cdp-download.js — Detect Chrome CDP default download directory
 *
 * Usage: node detect-cdp-download.js [--port 9222]
 *
 * Scans .state/profiles/ (all subdirs) Default/Preferences to find download.default_directory.
 * No browser navigation needed — reads filesystem only.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const cdpPort = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '9222');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateDir = path.resolve(__dirname, '..', '.state');
const profilesDir = path.join(stateDir, 'profiles');

(async () => {
  console.log(`[detect] Port: ${cdpPort}`);
  console.log(`[detect] Profiles dir: ${profilesDir}`);

  if (!fs.existsSync(profilesDir)) {
    console.log('[detect] No profiles directory. Fallback: ~/Downloads');
    const fallback = path.join(os.homedir(), 'Downloads');
    console.log(JSON.stringify({ downloadDir: fallback, source: 'fallback' }));
    return;
  }

  const dirs = fs.readdirSync(profilesDir);
  console.log(`[detect] Found: ${dirs.join(', ')}`);

  for (const d of dirs) {
    const prefPath = path.join(profilesDir, d, 'Default', 'Preferences');
    if (!fs.existsSync(prefPath)) continue;
    try {
      const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
      const dl = prefs?.download?.default_directory;
      if (dl) {
        console.log(`[detect] -> ${d} = ${dl}`);
        console.log(JSON.stringify({ downloadDir: dl, source: d, exists: fs.existsSync(dl) }));
        return;
      }
    } catch {}
  }

  // Fallback
  const fallback = path.join(os.homedir(), 'Downloads');
  console.log(`[detect] No custom download dir. Fallback: ${fallback}`);
  console.log(JSON.stringify({ downloadDir: fallback, source: 'fallback', exists: fs.existsSync(fallback) }));
})();
