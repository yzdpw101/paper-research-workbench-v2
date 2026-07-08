/**
 * set-browser.js — Set the default browser for launch mode
 *
 * Usage: node set-browser.js [chrome|edge|firefox]
 *
 * Modifies scripts/config.js browser.default. If Firefox, warns about CDP limitation.
 * CDP mode always defaults to Chrome regardless (scripts handle this internally).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const browser = (process.argv[2] || '').toLowerCase();
if (!['chrome', 'edge', 'msedge', 'firefox'].includes(browser)) {
  console.error('Usage: node set-browser.js [chrome|edge|firefox]');
  process.exit(1);
}

const normalized = browser === 'msedge' ? 'edge' : browser;
const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'config.js');

if (!fs.existsSync(configPath)) {
  console.error('config.js not found at', configPath);
  process.exit(1);
}

let content = fs.readFileSync(configPath, 'utf-8');
content = content.replace(
  /default:\s*'[^']*'/,
  `default: '${normalized}'`
);
fs.writeFileSync(configPath, content, 'utf-8');

console.log(`[setup] Default browser set to: ${normalized}`);

if (normalized === 'firefox') {
  console.log('[setup] ⚠️  Firefox only supports institutional network (no CDP/CARSI).');
} else {
  console.log(`[setup] ✅ ${normalized} full support: launch + CDP modes.`);
  console.log('[setup]    For CDP mode, manually run scripts/open-cdp.bat or node scripts/launch-cdp.js.');
}
