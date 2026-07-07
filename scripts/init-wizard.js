/**
 * init-wizard.js — Interactive initialization wizard module.
 *
 * Guides the user through first-time configuration:
 *   Step 1: Check Node.js version + Playwright installation status
 *   Step 2: Detect system-installed browsers (Chrome, Edge, Firefox)
 *   Step 3: Detect Playwright-installed browser binaries
 *   Step 4: Interactive browser selection
 *   Step 5: Auto-download browser (if needed and user agrees)
 *   Step 6: Verify browser can start
 *   Step 7: (Optional) Store IEEE/万方 credentials
 *   Step 8: (Optional) Enable CDP connection mode
 *   Step 9: Write .state/config.json + markers
 *   Step 10: Bare-metal guidance (zero browsers)
 *
 * Module interface:
 *   checkEnvironment()         — Check Node.js + Playwright
 *   detectSystemBrowsers()     — Detect OS-installed browsers
 *   detectPlaywrightBrowsers() — Detect Playwright-installed browsers
 *   verifyBrowserStart(name)   — Test-launch a browser
 *   writeConfig(config, dir)   — Write config files + markers
 *   run({ rl, stateDir })      — Run the full wizard
 *
 * Dependencies: config (read), browser-launcher, credential-vault, readline
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const _require = createRequire(import.meta.url);
const IS_WIN32 = process.platform === 'win32';

// ─── Error classes ──────────────────────────────────────────────────────────

export class WizardError extends Error {
  /**
   * @param {'WIZARD_FAIL'|'BROWSER_NOT_FOUND'|'INSTALL_FAIL'|'VERIFY_FAIL'|'CONFIG_WRITE_FAIL'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = 'WizardError';
    this.code = code;
  }
}

// ─── Step 0: Check Node.js installation ─────────────────────────────────────

/**
 * Check Node.js CLi availability and version by running `node --version`.
 *
 * @returns {{ nodeInstalled: boolean, nodeVersion: string|null, errorMessage: string|null }}
 */
export function checkNodeInstallation() {
  try {
    const output = execSync('node --version', { stdio: 'pipe', timeout: 10000, encoding: 'utf-8' });
    const version = (output || '').trim().replace(/^v/i, '');
    const parts = version.split('.').map(Number);
    const major = parts[0] || 0;

    if (major < 18) {
      return {
        nodeInstalled: true,
        nodeVersion: version,
        errorMessage: `Node.js ${version} 版本过旧，请升级到 Node.js >= 18。下载地址：https://nodejs.org`,
      };
    }

    return { nodeInstalled: true, nodeVersion: version, errorMessage: null };
  } catch (err) {
    const isNotFound = err && (
      err.code === 'ENOENT' ||
      err.code === 127 ||
      (err.message && (err.message.includes('ENOENT') || err.message.includes('not found') || err.message.includes('not recognized')))
    );
    if (isNotFound) {
      return {
        nodeInstalled: false,
        nodeVersion: null,
        errorMessage: '未检测到 Node.js。请访问 https://nodejs.org 下载并安装 Node.js >= 18，然后重新运行此向导。',
      };
    }
    return {
      nodeInstalled: false,
      nodeVersion: null,
      errorMessage: `检测 Node.js 时出错：${err.message}。请访问 https://nodejs.org 下载安装。`,
    };
  }
}

// ─── Step 1: Check environment ──────────────────────────────────────────────

/**
 * Check Node.js version and Playwright availability.
 *
 * @returns {{ nodeVersion: string, nodeOk: boolean, playwrightInstalled: boolean }}
 */
export function checkEnvironment() {
  const versionParts = process.versions.node.split('.').map(Number);
  const nodeOk = versionParts[0] >= 18;

  let playwrightInstalled = false;
  try {
    _require.resolve('playwright');
    playwrightInstalled = true;
  } catch {
    playwrightInstalled = false;
  }

  return {
    nodeVersion: process.versions.node,
    nodeOk,
    playwrightInstalled,
  };
}

// ─── Step 2: Detect system browsers ─────────────────────────────────────────

/** Browser detection command builders for each platform */
function browserDetectCmds() {
  if (IS_WIN32) {
    return [
      { name: 'chrome',  cmd: 'where chrome' },
      { name: 'firefox', cmd: 'where firefox' },
      { name: 'msedge',  cmd: 'where msedge' },
    ];
  }
  // macOS / Linux
  return [
    { name: 'chrome',  cmd: 'which google-chrome || which chromium-browser || which chromium 2>/dev/null' },
    { name: 'firefox', cmd: 'which firefox 2>/dev/null' },
    { name: 'msedge',  cmd: 'which msedge || which microsoft-edge 2>/dev/null' },
  ];
}

/**
 * Detect browsers installed on the system (OS-level).
 *
 * @returns {string[]} Array of browser names found ('chrome', 'firefox', 'msedge')
 */
export function detectSystemBrowsers() {
  const found = [];
  for (const { name, cmd } of browserDetectCmds()) {
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 5000, encoding: 'utf-8' });
      found.push(name);
    } catch {
      // Browser not found — skip
    }
  }
  return found;
}

// ─── Step 3: Detect Playwright browsers ─────────────────────────────────────

/**
 * Parse `npx playwright install --list` output to find installed browsers.
 *
 * @returns {string[]} Array of browser names ('chrome', 'firefox', 'msedge')
 */
export function detectPlaywrightBrowsers() {
  try {
    const output = execSync('npx playwright install --list', {
      stdio: 'pipe',
      timeout: 15000,
      encoding: 'utf-8',
    });

    if (!output || typeof output !== 'string') return [];

    const lines = output.trim().split('\n').filter(Boolean);
    const browsers = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      // Line format: "  chromium  v1100  channels  C:\ms-playwright\chromium"
      if (parts.length < 2) continue;
      const name = parts[0].toLowerCase();
      if (name === 'chromium') browsers.push('chrome');
      else if (name === 'firefox') browsers.push('firefox');
      else if (name === 'msedge') browsers.push('msedge');
    }

    return browsers;
  } catch {
    return [];
  }
}

// ─── Step 6: Verify browser start ─────────────────────────────────────────

/**
 * Test that a browser can launch and close successfully.
 *
 * @param {string} browserName - Browser to verify
 * @param {string} [stateDir] - State directory for storage
 * @returns {Promise<boolean>} True if browser starts and closes
 */
export async function verifyBrowserStart(browserName, stateDir, inject) {
  try {
    const launchFn = inject?.launch || (await import('./browser-launcher.js')).launch;
    const { browser, context, page } = await launchFn({
      browser: browserName,
      headless: true,
      noKill: true,
    });

    // Navigate to about:blank to confirm it works
    await page.goto('about:blank', { timeout: 10000 }).catch(() => {});

    // Close everything
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    if (browser) {
      await browser.close().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Step 9: Write config files ──────────────────────────────────────────

/**
 * Write wizard results to config files.
 * Creates .state/config.json, .state/.setup-done, and .state/.browser.
 *
 * @param {object} config - Configuration object to write
 * @param {string} stateDir - Path to .state directory
 */
export async function writeConfig(config, stateDir) {
  // Ensure state directory exists
  fs.mkdirSync(stateDir, { recursive: true });

  // Write config.json (merge with existing if present)
  const configPath = path.join(stateDir, 'config.json');
  let existing = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      existing = JSON.parse(raw);
    }
  } catch {
    // Corrupted or empty — start fresh
  }

  const merged = { ...existing, ...config };
  // Deep merge browser sub-object
  if (config.browser && existing.browser) {
    merged.browser = { ...existing.browser, ...config.browser };
  }
  if (config.credentials && existing.credentials) {
    merged.credentials = { ...existing.credentials, ...config.credentials };
  }

  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');

  // Write .setup-done marker
  const markerPath = path.join(stateDir, '.setup-done');
  const marker = JSON.stringify({
    setupComplete: true,
    completedAt: new Date().toISOString(),
    version: 2,
  }, null, 2);
  fs.writeFileSync(markerPath, marker, 'utf-8');

  // Write .browser marker (legacy compatibility)
  if (config.browser && config.browser.default) {
    const browserPath = path.join(stateDir, '.browser');
    fs.writeFileSync(browserPath, config.browser.default, 'utf-8');
  }
}

// ─── Prompt helpers ─────────────────────────────────────────────────────────

/**
 * Prompt user with a Yes/No question.
 *
 * @param {object} rl - Readline interface
 * @param {string} message - Question text
 * @param {boolean} [defaultVal=true] - Default answer
 * @returns {Promise<boolean>}
 */
async function promptConfirm(rl, message, defaultVal = true) {
  const hint = defaultVal ? '[Y/n]' : '[y/N]';
  const answer = await rl.question(`${message} ${hint}: `);
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === '') return defaultVal;
  return trimmed === 'y' || trimmed === 'yes';
}

/**
 * Prompt user for text input.
 *
 * @param {object} rl - Readline interface
 * @param {string} message - Prompt text
 * @param {string} [defaultVal] - Default value
 * @returns {Promise<string>}
 */
async function promptInput(rl, message, defaultVal) {
  const hint = defaultVal ? ` [${defaultVal}]` : '';
  const answer = await rl.question(`${message}${hint}: `);
  return answer.trim() || defaultVal || '';
}

// ─── Step 2.5: Print browser detection info ──────────────────────────────────

/**
 * Print detected browser information to the user.
 * Shows all available browsers and their sources (system vs Playwright).
 *
 * @param {string[]} systemBrowsers - OS-installed browser names
 * @param {string[]} pwBrowsers - Playwright-installed browser names
 */
function printBrowserInfo(systemBrowsers, pwBrowsers) {
  const allDetected = [...new Set([...systemBrowsers, ...pwBrowsers])];
  console.log('\n  Current browser environment:');
  if (allDetected.length === 0) {
    console.log('    No browsers detected on your system.');
    console.log('    The wizard can install one via Playwright.');
    return;
  }
  allDetected.forEach(b => {
    const sources = [];
    if (systemBrowsers.includes(b)) sources.push('system');
    if (pwBrowsers.includes(b)) sources.push('Playwright');
    console.log(`    ${b} (${sources.join(', ')})`);
  });
}

// ─── Step 1.5: Check and install npm dependencies ──────────────────────────

/**
 * Check if Playwright npm package is installed; if not, prompt to auto-install.
 *
 * @param {object} rl - Readline interface
 * @returns {Promise<boolean>} True if playwright is available after the step
 */
async function checkAndInstallPlaywright(rl) {
  let available = false;
  try {
    const _require = createRequire(import.meta.url);
    _require.resolve('playwright');
    available = true;
  } catch {
    available = false;
  }

  if (available) {
    console.log('    Playwright — ✓ installed');
    return true;
  }

  console.log('    Playwright — ✗ not installed');
  const confirmInstall = await promptConfirm(rl,
    '  Playwright npm package not found. Run "npm install" to install dependencies?', true);

  if (!confirmInstall) {
    console.log('  ⚠  Playwright is required. Run "npm install" manually later.');
    return false;
  }

  console.log('  Installing npm dependencies... (this may take a moment)');
  try {
    execSync('npm install', { cwd: PROJECT_ROOT, stdio: 'inherit', timeout: 120000 });
    console.log('  ✓ npm dependencies installed.');
    return true;
  } catch (err) {
    console.error('  ✗ npm install failed:', err.message);
    console.log('  Please run "npm install" manually in the project directory.');
    return false;
  }
}

// ─── Step 3: Network environment questionnaire ─────────────────────────────

/**
 * Ask the user whether they are on an institutional network.
 *
 * @param {object} rl - Readline interface
 * @returns {Promise<boolean>} True if institutional network
 */
export async function askNetworkEnvironment(rl) {
  return promptConfirm(rl, '\n  Are you on an institutional network (school/org IP)?');
}

// ─── Account type question ─────────────────────────────────────────────────

/**
 * Ask the user about their account type (when no stored credentials exist).
 *
 * @param {object} rl - Readline interface
 * @returns {Promise<'A'|'B'|'C'>} A=CARSI, B=Personal sub, C=None
 */
export async function askAccountType(rl) {
  console.log('\n  ── Account Type ──');
  console.log('  Do you have an institutional account?');
  console.log('    A. Yes, I have a CARSI institutional account');
  console.log('    B. Yes, I have a personal IEEE/Wanfang subscription');
  console.log('    C. No');
  const answer = await promptInput(rl, '  Select [A/B/C]', 'A');
  const upper = answer.trim().toUpperCase();
  if (upper === 'B') return 'B';
  if (upper === 'C') return 'C';
  return 'A';
}

// ─── Credential collection helper ──────────────────────────────────────────

/**
 * Collect and store credentials for specified platforms.
 *
 * @param {object} rl - Readline interface
 * @param {string} masterKey - Master key for credential vault
 * @param {string} stateDir - State directory path
 * @param {{ ieee?: boolean, wanfang?: boolean }} platforms - Platforms to collect
 */
async function collectAndStoreCredentials(rl, masterKey, stateDir, platforms) {
  // ── Print security notice before collecting credentials ──────────────
  console.log('\n  ── Security Notice ──');
  console.log('  你的凭据将用 AES-256-GCM 加密存储在当前设备。');
  console.log('  主密码不会上传到任何服务器。');
  console.log('  ─────────────────────\n');

  const { setMasterKey, setVaultPath, store } = await import('./credential-vault.js');
  setMasterKey(masterKey);
  setVaultPath(path.join(stateDir, 'credentials.json.enc'));

  if (platforms.ieee) {
    console.log('\n  ── IEEE Credentials ──');
    const username = await promptInput(rl, '  IEEE username/email');
    const password = await promptInput(rl, '  IEEE password');
    const inst = await promptInput(rl, '  IEEE institution');
    if (username && password) {
      await store('ieee', {
        institution: inst || '',
        username,
        password,
        notes: 'Set up via init-wizard',
        updatedAt: new Date().toISOString(),
      });
      console.log('  ✓ IEEE credentials saved.');
    }
  }

  if (platforms.wanfang) {
    console.log('\n  ── Wanfang Credentials ──');
    const username = await promptInput(rl, '  Wanfang username/email');
    const password = await promptInput(rl, '  Wanfang password');
    const inst = await promptInput(rl, '  Wanfang institution');
    if (username && password) {
      await store('wanfang', {
        institution: inst || '',
        username,
        password,
        notes: 'Set up via init-wizard',
        updatedAt: new Date().toISOString(),
      });
      console.log('  ✓ Wanfang credentials saved.');
    }
  }
}

// ─── Credential checking helper ────────────────────────────────────────────

/**
 * Check which platforms already have stored credentials.
 *
 * @param {string} masterKey - Master key for credential vault
 * @param {string} stateDir - State directory path
 * @returns {Promise<{ ieee: boolean, wanfang: boolean }>}
 */
async function checkExistingCredentials(masterKey, stateDir) {
  try {
    const vault = await import('./credential-vault.js');
    vault.setMasterKey(masterKey);
    vault.setVaultPath(path.join(stateDir, 'credentials.json.enc'));
    return {
      ieee: vault.exists('ieee'),
      wanfang: vault.exists('wanfang'),
    };
  } catch {
    return { ieee: false, wanfang: false };
  }
}

/**
 * Run the network environment questionnaire and return configuration settings.
 *
 * Q1: Are you on an institutional network? Yes/No
 *   - Yes → networkMode='institutional', skip Q2
 *   - No  → check existing credentials, then ask Q2
 * Q2: Account type (only if no stored credentials)
 *
 * @param {object} rl - Readline interface
 * @param {string} selectedBrowser - The browser the user selected
 * @param {string} stateDir - State directory path
 * @param {string} masterKey - Master key for credential vault
 * @returns {Promise<{ networkMode: string, cdpEnabled: boolean }>}
 */
export async function handleNetworkQuestionnaire(rl, selectedBrowser, stateDir, masterKey) {
  // Q1: Are you on an institutional network?
  const isInstitutional = await askNetworkEnvironment(rl);

  if (isInstitutional) {
    console.log('  → Institutional network. Direct access available.');
    return { networkMode: 'institutional', cdpEnabled: false };
  }

  // Non-institutional — check existing credentials
  console.log('\n  ── Account Status ──');
  const existing = await checkExistingCredentials(masterKey, stateDir);

  if (existing.ieee && existing.wanfang) {
    console.log('  ✓ Detected stored credentials for IEEE and Wanfang.');
    console.log('  No additional account setup needed.');
    return { networkMode: 'non-institutional', cdpEnabled: false };
  }

  if (existing.ieee || existing.wanfang) {
    // Some platforms already have credentials
    const have = [];
    if (existing.ieee) have.push('IEEE');
    if (existing.wanfang) have.push('Wanfang');
    console.log(`  ✓ Detected stored credentials: ${have.join(', ')}.`);

    const need = {};
    if (!existing.ieee) need.ieee = true;
    if (!existing.wanfang) need.wanfang = true;
    const needNames = [];
    if (need.ieee) needNames.push('IEEE');
    if (need.wanfang) needNames.push('Wanfang');

    const supplement = await promptConfirm(rl,
      `  Add credentials for ${needNames.join(' and ')}?`, false);
    if (supplement) {
      await collectAndStoreCredentials(rl, masterKey, stateDir, need);
    }
    return { networkMode: 'non-institutional', cdpEnabled: false };
  }

  // No stored credentials at all — ask account type
  const accountType = await askAccountType(rl);

  if (accountType === 'A') {
    // CARSI — suggest CDP + Chrome/Edge + store creds
    console.log('\n  CARSI enables federated login via your browser session.');

    if (selectedBrowser === 'firefox') {
      console.log('  💡 Tip: CARSI login works best with Chrome or Edge.');
      console.log('  Consider using Chrome/Edge for CDP mode.');
    }

    const useCdp = await promptConfirm(rl, '  Enable CDP mode for CARSI login?', true);
    if (useCdp) {
      const port = await promptInput(rl, '  CDP port', '9222');
      process.env.PAPER_BROWSER_CDP_PORT = parseInt(port, 10) || 9222;
      process.env.PAPER_BROWSER_MODE = 'cdp';
      console.log('  CDP mode enabled.');
    }

    const saveCreds = await promptConfirm(rl, '  Save institution account credentials?', true);
    if (saveCreds) {
      await collectAndStoreCredentials(rl, masterKey, stateDir, { ieee: true, wanfang: true });
    }
    return { networkMode: 'non-institutional', cdpEnabled: useCdp };
  }

  if (accountType === 'B') {
    // Personal subscription — guide to store
    console.log('\n  You can log in directly on the platform with your personal subscription.');
    const saveCreds = await promptConfirm(rl, '  Save login credentials?', true);
    if (saveCreds) {
      await collectAndStoreCredentials(rl, masterKey, stateDir, { ieee: true, wanfang: true });
    }
    return { networkMode: 'non-institutional', cdpEnabled: false };
  }

  // None
  console.log('\n  ⚠  You can search for papers but may not be able to download full text.');
  return { networkMode: 'non-institutional', cdpEnabled: false };
}

// ─── Step 4: Browser selection ──────────────────────────────────────────────

/**
 * Present a list of detected browsers and let the user pick one.
 *
 * @param {object} rl - Readline interface
 * @param {object} detected - { systemBrowsers: string[], pwBrowsers: string[] }
 * @returns {Promise<string>} Selected browser name
 */
async function selectBrowser(rl, detected) {
  // Combine system + Playwright browsers, deduplicate
  const allDetected = [...new Set([...detected.systemBrowsers, ...detected.pwBrowsers])];

  if (allDetected.length === 0) {
    // Bare-metal: prompt user to install one
    console.log('\n  No browsers detected on your system.');
    console.log('  The wizard can install a browser for you via Playwright.\n');
    return installAndSelectBrowser(rl);
  }

  console.log('\n  Detected browsers:');
  const options = ['firefox', 'chrome', 'msedge'];
  const available = options.filter(b => allDetected.includes(b));

  available.forEach((b, i) => {
    const sys = detected.systemBrowsers.includes(b) ? ' (system)' : '';
    const pw = detected.pwBrowsers.includes(b) ? ' (Playwright)' : '';
    console.log(`    ${i + 1}. ${b}${sys}${pw}`);
  });

  // Add install option
  const installIdx = available.length + 1;
  console.log(`    ${installIdx}. Install a different browser via Playwright`);

  const choice = await promptInput(rl, `\n  Select browser [1-${installIdx}]`, '1');
  const idx = parseInt(choice, 10) - 1;

  if (idx >= 0 && idx < available.length) {
    return available[idx];
  }

  // User chose to install
  return installAndSelectBrowser(rl);
}

/**
 * Guide user through installing a Playwright browser.
 *
 * @param {object} rl - Readline interface
 * @returns {Promise<string>} Installed browser name
 */
async function installAndSelectBrowser(rl) {
  console.log('\n  Available browsers to install:');
  const options = ['firefox', 'chrome', 'msedge'];
  options.forEach((b, i) => {
    console.log(`    ${i + 1}. ${b}`);
  });

  const choice = await promptInput(rl, `\n  Choose browser to install [1-${options.length}]`, '1');
  const idx = Math.min(Math.max(parseInt(choice, 10) - 1, 0), options.length - 1);
  const selected = options[idx];

  const confirm = await promptConfirm(rl, `  Install ${selected} via Playwright?`, true);
  if (!confirm) {
    console.log('  Setup cancelled. Run the wizard again when ready.');
    throw new WizardError('WIZARD_FAIL', 'User cancelled browser installation');
  }

  console.log(`\n  Installing ${selected}...`);
  try {
    execSync(`npx playwright install ${selected}`, {
      stdio: 'inherit',
      timeout: 300000, // 5 minutes
    });
    console.log(`  ${selected} installed successfully.`);
    return selected;
  } catch {
    throw new WizardError('INSTALL_FAIL', `Failed to install ${selected}`);
  }
}

// ─── Step 7: Credential collection ──────────────────────────────────────────

/**
 * Optionally collect and store credentials for IEEE / 万方.
 *
 * @param {object} rl - Readline interface
 * @param {string} masterKey - Master key for credential vault
 * @param {string} stateDir - State directory path
 */
async function handleCredentials(rl, masterKey, stateDir) {
  const shouldStore = await promptConfirm(rl, '\n  Store IEEE/万方 credentials?', false);
  if (!shouldStore) return;

  // ── Print security notice before collecting credentials ──────────────
  console.log('\n  ── Security Notice ──');
  console.log('  你的凭据将用 AES-256-GCM 加密存储在当前设备。');
  console.log('  主密码不会上传到任何服务器。');
  console.log('  ─────────────────────\n');

  const { setMasterKey, setVaultPath, store } = await import('./credential-vault.js');

  // Configure vault
  setMasterKey(masterKey);
  const vaultFilePath = path.join(stateDir, 'credentials.json.enc');
  setVaultPath(vaultFilePath);

  // Collect IEEE credentials
  const ieeeUsername = await promptInput(rl, '  IEEE username/email');
  const ieeePassword = await promptInput(rl, '  IEEE password');
  const ieeeInst = await promptInput(rl, '  IEEE institution');
  if (ieeeUsername && ieeePassword) {
    await store('ieee', {
      institution: ieeeInst || '',
      username: ieeeUsername,
      password: ieeePassword,
      notes: 'Set up via init-wizard',
      updatedAt: new Date().toISOString(),
    });
    console.log('  IEEE credentials saved securely.');
  }

  // Collect 万方 credentials
  const wfUsername = await promptInput(rl, '  万方 username/email');
  const wfPassword = await promptInput(rl, '  万方 password');
  const wfInst = await promptInput(rl, '  万方 institution');
  if (wfUsername && wfPassword) {
    await store('wanfang', {
      institution: wfInst || '',
      username: wfUsername,
      password: wfPassword,
      notes: 'Set up via init-wizard',
      updatedAt: new Date().toISOString(),
    });
    console.log('  万方 credentials saved securely.');
  }
}

// ─── Step 8: CDP mode ───────────────────────────────────────────────────────

/**
 * Ask user if they want to enable CDP connection mode.
 *
 * @param {object} rl - Readline interface
 * @param {string} selectedBrowser - The chosen browser name
 * @returns {Promise<{ cdpEnabled: boolean, browser: string }>}
 */
async function askCDPMode(rl, selectedBrowser) {
  const enable = await promptConfirm(rl, '\n  Enable CDP connection mode? (requires Chrome/Edge)', false);
  if (!enable) return { cdpEnabled: false, browser: selectedBrowser };

  // CDP is only supported on Chromium-based browsers
  if (selectedBrowser === 'firefox') {
    console.log('  ⚠  CDP mode does not support Firefox. Switching to Chrome...');
    const switchBrowser = 'chrome';
    const confirm = await promptConfirm(rl,
      `  Switch default browser to ${switchBrowser} for CDP mode?`, true);
    if (!confirm) {
      console.log('  CDP mode cancelled. Keeping Firefox for normal launch mode.');
      return { cdpEnabled: false, browser: selectedBrowser };
    }
    const port = await promptInput(rl, '  CDP port', '9222');
    process.env.PAPER_BROWSER_CDP_PORT = parseInt(port, 10) || 9222;
    process.env.PAPER_BROWSER_MODE = 'cdp';
    return { cdpEnabled: true, browser: switchBrowser };
  }

  const port = await promptInput(rl, '  CDP port', '9222');
  process.env.PAPER_BROWSER_CDP_PORT = parseInt(port, 10) || 9222;
  process.env.PAPER_BROWSER_MODE = 'cdp';
  return { cdpEnabled: true, browser: selectedBrowser };
}

// ─── Download directory prompt ──────────────────────────────────────────────

/**
 * Ask user for download directory preference.
 *
 * @param {object} rl - Readline interface
 * @param {string} defaultDir - Default download directory
 * @returns {Promise<string>} Chosen download directory path
 */
async function askDownloadDir(rl, defaultDir) {
  return promptInput(rl, '  Download directory for saved papers', defaultDir);
}

// ─── Run: Full wizard orchestration ─────────────────────────────────────────

/**
 * Run the full initialization wizard.
 *
 * @param {object} options
 * @param {object} [options.rl] - Readline interface (created if omitted)
 * @param {string} [options.stateDir] - State directory (default: PROJECT_ROOT/.state)
 * @returns {Promise<{ success: boolean, config: object }>}
 */
export async function run(options = {}) {
  const rl = options.rl || readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const stateDir = options.stateDir || path.join(PROJECT_ROOT, '.state');
  const createdRl = !options.rl;

  try {
    // Ensure state dir exists early
    fs.mkdirSync(stateDir, { recursive: true });

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   Paper Research Workbench — Setup      ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // ── Step 0: Check Node.js installation ────────────────────────────────
    console.log('  [0/10] Checking Node.js installation...');
    const nodeCheck = checkNodeInstallation();
    if (!nodeCheck.nodeInstalled) {
      console.error(`\n  ✗ ${nodeCheck.errorMessage}\n`);
      return { success: false, config: null, error: 'NODE_NOT_FOUND' };
    }
    if (nodeCheck.errorMessage) {
      console.error(`\n  ✗ ${nodeCheck.errorMessage}\n`);
      return { success: false, config: null, error: 'NODE_VERSION_TOO_OLD' };
    }
    console.log(`    Node.js v${nodeCheck.nodeVersion} — ✓`);

    // ── Step 1: Environment check ─────────────────────────────────────────
    console.log('  [1/10] Checking environment...');
    const env = checkEnvironment();
    console.log(`    Node.js ${env.nodeVersion} — ${env.nodeOk ? '✓' : '✗ (need >= 18)'}`);
    console.log(`    Playwright — ${env.playwrightInstalled ? '✓ installed' : '✗ not installed'}`);

    // ── Step 1.5: Check npm dependencies ──────────────────────────────────
    console.log('  [2/10] Checking npm dependencies...');
    const pwAvailable = await checkAndInstallPlaywright(rl);
    if (!pwAvailable) {
      console.log('  ⚠  Continuing without Playwright. Some features may not work.');
    }

    // ── Step 2: Detect browsers (system + Playwright) ─────────────────────
    console.log('  [3/10] Detecting browsers...');
    const systemBrowsers = detectSystemBrowsers();
    const pwBrowsers = detectPlaywrightBrowsers();
    const allDetected = [...new Set([...systemBrowsers, ...pwBrowsers])];
    console.log(`    System: ${systemBrowsers.join(', ') || 'none'}`);
    console.log(`    Playwright: ${pwBrowsers.join(', ') || 'none'}`);

    // ── Step 4: Browser detection info ────────────────────────────────────
    console.log('  [4/10] Inspecting browser environment...');
    printBrowserInfo(systemBrowsers, pwBrowsers);

    // ── Step 5: Browser selection ─────────────────────────────────────────
    console.log('\n  [5/10] Selecting default browser...');
    const selectedBrowser = await selectBrowser(rl, { systemBrowsers, pwBrowsers });

    // ── Prepare/confirm master key ────────────────────────────────────────
    let masterKey = process.env.PAPER_MASTER_KEY;

    // Try to read existing master-key file
    if (!masterKey) {
      const mkPath = path.join(stateDir, 'master-key');
      if (fs.existsSync(mkPath)) {
        masterKey = fs.readFileSync(mkPath, 'utf-8').trim();
      }
    }

    // If still no key, ask user to set one with confirmation
    if (!masterKey) {
      console.log('\n  ── Master Password Setup ──');
      console.log('  Please set a master password for encrypting stored credentials.');
      console.log('  This password will be stored locally in your .state/ directory.');
      console.log('  ⚠  Do not lose this password — it cannot be recovered!');

      const mk1 = await promptInput(rl, '  Enter master password', '');
      if (!mk1) {
        // User provided empty — auto-generate
        masterKey = `mk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        console.log(`  Auto-generated master key: ${masterKey}`);
        console.log('  (Save this key if you need to access credentials from another tool.)');
      } else {
        const mk2 = await promptInput(rl, '  Confirm master password', '');
        if (mk1 !== mk2) {
          console.log('  ⚠  Passwords do not match. Auto-generating a master key instead.');
          masterKey = `mk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          console.log(`  Auto-generated master key: ${masterKey}`);
        } else {
          masterKey = mk1;
          console.log('  ✓ Master password confirmed.');
        }
      }

      // Save to .state/master-key for future sessions
      const mkPath = path.join(stateDir, 'master-key');
      fs.writeFileSync(mkPath, masterKey, 'utf-8');
      console.log(`  Master key saved to ${path.relative(PROJECT_ROOT, mkPath)}`);
    } else {
      console.log(`  Using master key from ${process.env.PAPER_MASTER_KEY ? 'environment' : '.state/master-key'}`);
    }

    process.env.PAPER_MASTER_KEY = masterKey;

    // ── Step 6: Network environment questionnaire ─────────────────────────
    console.log('\n  [6/10] Network environment...');
    const { networkMode, cdpEnabled: netCdpEnabled } = await handleNetworkQuestionnaire(rl, selectedBrowser, stateDir, masterKey);

    // ── Step 7: Install browser if needed ────────────────────────────────
    if (!allDetected.includes(selectedBrowser)) {
      console.log('  [7/10] Installing browser...');
      const confirm = await promptConfirm(rl,
        `  ${selectedBrowser} is not installed. Install via Playwright?`, true);
      if (confirm) {
        execSync(`npx playwright install ${selectedBrowser}`, {
          stdio: 'inherit',
          timeout: 300000,
        });
        console.log(`  ${selectedBrowser} installed.`);
      }
    } else {
      console.log(`  [7/10] ${selectedBrowser} is already available — skipping install.`);
    }

    // ── Step 8: Verify browser start ─────────────────────────────────────
    console.log('  [8/10] Verifying browser can start...');
    const verified = await verifyBrowserStart(selectedBrowser, stateDir);
    console.log(`    Browser start: ${verified ? '✓' : '⚠  skipped (headless may not work)'}`);

    // ── Step 9: Optional configuration ───────────────────────────────────
    console.log('  [9/10] Optional configuration...');
    await handleCredentials(rl, masterKey, stateDir);
    console.log('  ── Credential Security ──');
    console.log('  你的凭据将用 AES-256-GCM 加密存储在当前设备。');
    console.log('  主密码不会上传到任何服务器。');

    // Download directory
    const downloadDir = await askDownloadDir(rl, '.state/downloads');
    console.log(`    Download directory: ${downloadDir}`);

    // Step 9 (cont): CDP mode — skip if already enabled via network questionnaire
    let cdpEnabled = netCdpEnabled;
    let finalBrowser = selectedBrowser;

    if (!cdpEnabled) {
      const cdpResult = await askCDPMode(rl, selectedBrowser);
      cdpEnabled = cdpResult.cdpEnabled;
      finalBrowser = cdpResult.browser;
    }

    // ── Step 10: Write complete config template ──────────────────────────
    console.log('  [10/10] Writing configuration...');

    const config = {
      // ── General ──
      version: 2,

      // ── Browser settings ──
      browser: {
        default: finalBrowser,          // Default browser: 'firefox', 'chrome', or 'msedge'
        mode: cdpEnabled ? 'cdp' : 'launch',   // 'launch' = auto-start, 'cdp' = connect to running browser
        cdpPort: 9222,                  // CDP debug port (used when mode='cdp')
        headless: true,                 // Run browser in headless mode (no GUI window)
        networkMode,                    // 'institutional' or 'non-institutional'
        profiles: {},                   // Browser profile overrides per platform
      },

      // ── Navigation settings ──
      navigation: {
        timeout: 30000,                 // Page navigation timeout in ms
        retries: 2,                     // Max retries on navigation failure
        retryBackoffBase: 1000,         // Initial backoff in ms (doubles each retry)
        networkIdleTimeout: 5000,       // Wait for network idle before continuing
      },

      // ── Download settings ──
      download: {
        dir: downloadDir,               // Download directory (relative to project root)
        overwrite: false,               // Overwrite existing files
        timeout: 120000,                // Download timeout in ms (including polling)
      },

      // ── Parallel processing ──
      parallel: {
        maxConcurrency: 3,              // Max number of concurrent downloads
        enabled: false,                 // Enable parallel downloading
      },

      // ── Credential vault ──
      credentials: {
        vaultPath: '.state/credentials.json.enc',  // Encrypted credential storage path
        services: [],                   // Active credential services (e.g. ['ieee', 'wanfang'])
      },

      // ── State management ──
      state: {
        dir: '.state',                  // State directory (relative to project root)
        autoSaveStorageState: true,     // Persist browser storage state for session reuse
      },
    };

    await writeConfig(config, stateDir);

    console.log('\n  ✓ Setup complete! Configuration saved.\n');
    return { success: true, config };
  } catch (err) {
    if (err instanceof WizardError) {
      console.error(`\n  ✗ ${err.message}\n`);
      return { success: false, config: null, error: err.code };
    }
    console.error(`\n  ✗ Unexpected error: ${err.message}\n`);
    return { success: false, config: null, error: 'UNKNOWN' };
  } finally {
    if (createdRl) {
      rl.close();
    }
  }
}

// Run as CLI if invoked directly
const isMain = process.argv[1] && (
  process.argv[1].endsWith('init-wizard.js') ||
  process.argv[1].endsWith('init-wizard')
);
if (isMain) run();
