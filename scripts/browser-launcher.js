/**
 * browser-launcher.js — Browser lifecycle management module.
 *
 * Core Layer module that handles browser launch, persistent context,
 * storageState management, zombie cleanup, and browser resolution.
 *
 * Module interface:
 *   launch(options)       — Main entry: launches browser, returns { browser, context, page }
 *   launchPersistent(opt) — Persistent mode using chromium.launchPersistentContext
 *   connectExisting(port) — Connect to user's browser via CDP
 *   saveStorageState(ctx) — Save storage state to file
 *   loadStorageState(name) — Load storage state from file
 *   resolveBrowser()     — Resolve default browser name from config
 *   killZombies(name)    — Clean up leftover browser processes
 *
 * Dependencies: config, playwright (chromium / firefox), cdp-connector
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright';
import { get } from './config.js';
import { connect as cdpConnect, isCDPAvailable } from './cdp-connector.js';

// ─── Constants ───────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const BROWSER_MAP = Object.freeze({
  firefox: { launch: (opt) => firefox.launch(opt) },
  chrome:  { launch: (opt) => chromium.launch(opt) },
  msedge:  { launch: (opt) => chromium.launch(opt) },
});

const ZOMBIE_KILL_COMMANDS = Object.freeze({
  firefox: process.platform === 'win32'
    ? 'taskkill /f /im firefox.exe 2>nul'
    : 'pkill -f firefox 2>/dev/null',
  chrome: process.platform === 'win32'
    ? 'taskkill /f /im chrome.exe 2>nul'
    : 'pkill -f chrome 2>/dev/null',
  msedge: process.platform === 'win32'
    ? 'taskkill /f /im msedge.exe 2>nul'
    : 'pkill -f msedge 2>/dev/null',
});

// ─── Internal helpers ────────────────────────────────────────────────────

/**
 * Resolve the storage state file path for a given browser name.
 * @param {string} browserName
 * @returns {string}
 */
function storageStatePath(browserName) {
  const stateDir = get('state.dir') || '.state';
  const resolvedDir = path.resolve(PROJECT_ROOT, stateDir);
  return path.join(resolvedDir, `${browserName}-storageState.json`);
}

/**
 * Resolve the default user data directory for persistent profiles.
 * @param {string} browserName
 * @returns {string}
 */
function defaultUserDataDir(browserName) {
  const stateDir = get('state.dir') || '.state';
  const resolvedDir = path.resolve(PROJECT_ROOT, stateDir);
  const profileDir = path.join(resolvedDir, 'profiles', browserName);
  // Ensure directory exists
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Resolve the default browser name from config.
 * Priority: CLI override → env var → config default
 * @returns {string} Browser name: 'firefox', 'chrome', or 'msedge'
 */
export function resolveBrowser() {
  return get('browser.default') || 'firefox';
}

/**
 * Main entry point: launch a browser based on the configured mode.
 *
 * Mode selection:
 *   - 'persistent' → launchPersistent() using chromium.launchPersistentContext
 *   - 'cdp'        → connectExisting() via CDP (Chrome/Edge only)
 *   - 'launch'     → normal launch() (default, backwards-compatible)
 *
 * Network mode ('networkMode'):
 *   - 'institutional'    — IP-authenticated institutional access (default)
 *   - 'non-institutional' — Non-IP-authenticated network (Firefox not supported)
 *
 * @param {object} [options={}] - Launch options
 * @param {string} [options.browser] - Override browser name
 * @param {boolean} [options.headless] - Override headless mode
 * @param {boolean} [options.noKill] - Skip zombie cleanup
 * @param {number} [options.port] - CDP port (used when mode=cdp, default 9222)
 * @param {string} [options.networkMode] - 'institutional' | 'non-institutional'
 * @returns {Promise<{ browser: object, context: object, page: object }>}
 */
export async function launch(options = {}) {
  const mode = options.mode || 'launch';

  if (mode === 'persistent') {
    return launchPersistent(options);
  }

  if (mode === 'cdp') {
    const port = options.port || get('browser.cdpPort') || 9222;
    return connectExisting(port, options.browser || resolveBrowser());
  }

  // ── Normal launch mode (default) ──────────────────────────────────────

  const browserName = options.browser || resolveBrowser();
  const headless = options.headless !== undefined ? options.headless : true;

  const browserEntry = BROWSER_MAP[browserName];
  if (!browserEntry) {
    throw new Error(
      `Unsupported browser: "${browserName}". Supported: ${Object.keys(BROWSER_MAP).join(', ')}`,
    );
  }

  const launchOptions = { headless };

  const browser = await browserEntry.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();

  return { browser, context, page };
}

/**
 * Launch a persistent browser context using chromium.launchPersistentContext.
 *
 * @param {object} [options={}]
 * @param {string} [options.userDataDir] - Path to user data directory (default: .state/profiles/<browser>)
 * @param {string} [options.browser] - Browser name (default: resolved from config)
 * @param {boolean} [options.headless] - Override headless mode
 * @returns {Promise<{ browser: null, context: object, page: object }>}
 */
export async function launchPersistent(options = {}) {
  const browserName = options.browser || resolveBrowser();
  const userDataDir = options.userDataDir || defaultUserDataDir(browserName);
  const headless = options.headless !== undefined
    ? options.headless
    : get('browser.headless');

  // Only chromium supports launchPersistentContext
  if (browserName !== 'chrome' && browserName !== 'msedge') {
    throw new Error(
      `Persistent mode is only supported on Chromium-based browsers (chrome, msedge). ` +
      `Got "${browserName}". Use launch() for Firefox.`,
    );
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    // Accept default viewport and other settings
  });

  // Reuse existing page or create a new one
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { browser: null, context, page };
}

/**
 * Connect to a user's running browser via Chrome DevTools Protocol (CDP).
 *
 * Only Chrome and Edge (Chromium-based) support CDP.
 * Firefox is not supported and will throw an error.
 *
 * @param {number} [port=9222] - CDP debugging port
 * @param {string} [browserType='chrome'] - Browser type ('chrome' or 'msedge')
 * @returns {Promise<{ browser: object, context: object, page: object }>}
 * @throws {Error} When browserType is 'firefox' (CDP not supported)
 * @throws {Error} When CDP port is not available
 */
export async function connectExisting(port = 9222, browserType = 'chrome') {
  // Firefox does not support CDP
  if (browserType === 'firefox') {
    throw new Error(
      'CDP mode is not supported for Firefox. Use Chrome or Edge instead.',
    );
  }

  // Probe the CDP endpoint
  const available = await isCDPAvailable(port);
  if (!available) {
    throw new Error(
      `CDP endpoint on port ${port} is not available. ` +
      `Make sure your browser is running with --remote-debugging-port=${port}.`,
    );
  }

  // Connect via CDP
  const browser = await cdpConnect(port);

  // Obtain a context and page from the connected browser
  const contexts = browser.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { browser, context, page };
}

/**
 * Save the current storage state of a context to disk.
 *
 * @param {object} context - Playwright BrowserContext
 * @param {object} [stateOptions] - Options override
 * @param {string} [stateOptions.path] - Custom file path (default: .state/<browser>-storageState.json)
 * @returns {Promise<object|null>} The storage state object, or null on failure
 */
export async function saveStorageState(context, stateOptions = {}) {
  try {
    const browserName = resolveBrowser();
    const filePath = stateOptions.path || storageStatePath(browserName);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const result = await context.storageState({ path: filePath });
    return result;
  } catch {
    // Storage state save errors are non-fatal (e.g., context already closed)
    return null;
  }
}

/**
 * Load a previously saved storage state from disk.
 *
 * @param {string} browserName - Browser name to load state for
 * @returns {Promise<object|null>} The storage state object, or null on failure
 */
export async function loadStorageState(browserName) {
  try {
    const filePath = storageStatePath(browserName);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Corrupted or missing file → return null (caller handles gracefully)
    return null;
  }
}

/**
 * Kill leftover browser processes (zombies).
 * Uses taskkill (Windows) or pkill (Unix).
 *
 * @param {string} browserName - 'firefox', 'chrome', or 'msedge'
 */
export function killZombies(browserName) {
  const cmd = ZOMBIE_KILL_COMMANDS[browserName];
  if (!cmd) return;
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 5000 });
  } catch {
    // No matching processes found — not an error
  }
}
