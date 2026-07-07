/**
 * launch-cdp.js — Launch Chrome/Edge with CDP in a fully detached process.
 *
 * Unlike .bat files, this uses child_process.spawn with detached+unref so
 * Chrome survives even if the parent shell/Node process exits or times out.
 *
 * Usage:
 *   node launch-cdp.js [chrome|edge] [port] [user-data-dir]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const browserType = (process.argv[2] || 'chrome').toLowerCase();
const port = process.argv[3] || '9222';
const userDataDir = process.argv[4] || path.resolve(__dirname, '..', '.state', 'profiles', browserType + '-cdp');

if (!['chrome', 'edge'].includes(browserType)) {
  console.error('Usage: node launch-cdp.js [chrome|edge] [port] [user-data-dir]');
  process.exit(1);
}

// Resolve browser executable
const exeName = browserType === 'chrome' ? 'chrome.exe' : 'msedge.exe';
const envVar = browserType === 'chrome'
  ? 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'
  : 'PLAYWRIGHT_EDGE_EXECUTABLE_PATH';

let exePath = process.env[envVar];

if (!exePath) {
  const searchPaths = browserType === 'chrome'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      ]
    : [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
      ];
  for (const p of searchPaths) {
    if (fs.existsSync(p)) { exePath = p; break; }
  }
}

if (!exePath) {
  console.error(`[launch-cdp] ${browserType === 'chrome' ? 'Chrome' : 'Edge'} not found.`);
  console.error(`Set ${envVar} environment variable or install the browser.`);
  process.exit(1);
}

// Ensure user data dir exists
fs.mkdirSync(userDataDir, { recursive: true });

// Launch fully detached — survives parent process exit/timeout
const args = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
];

const child = spawn(exePath, args, {
  detached: true,
  stdio: 'ignore',
  windowsHide: false, // show window so user can interact
});

child.unref();

console.log(`[launch-cdp] ${browserType === 'chrome' ? 'Chrome' : 'Edge'} launched (PID ${child.pid})`);
console.log(`[launch-cdp] Port: ${port}, User data dir: ${userDataDir}`);
console.log(`[launch-cdp] Connect via CDP on ws://localhost:${port}`);

// Exit immediately — Chrome keeps running
process.exit(0);
