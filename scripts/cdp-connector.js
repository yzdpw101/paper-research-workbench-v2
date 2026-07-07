/**
 * cdp-connector.js — CDP connection module for Chrome/Edge.
 *
 * Implements connecting to user's running Chrome/Edge browser via Chrome DevTools Protocol.
 *
 * Module interface:
 *   isCDPAvailable(port)    — Probe CDP endpoint on localhost:<port>/json/version
 *   getCDPEndpoint(port)    — Return ws://localhost:<port> endpoint URL
 *   connect(port, options)  — Connect via chromium.connectOverCDP with noDefaults:true
 *   launchWithCDP(browserPath, port, options) — Launch browser with --remote-debugging-port
 *
 * Dependencies: playwright (chromium), node:http, node:child_process, config
 */

import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { get } from './config.js';

// ─── Constants ────────────────────────────────────────────────────────────

const CDP_ERROR_CODES = Object.freeze({
  CDP_CONNECT_FAILED: 'CDP_CONNECT_FAILED',
  CDP_VERSION_MISMATCH: 'CDP_VERSION_MISMATCH',
  CDP_INVALID_PORT: 'CDP_INVALID_PORT',
  CDP_BROWSER_NOT_FOUND: 'CDP_BROWSER_NOT_FOUND',
  CDP_LAUNCH_FAILED: 'CDP_LAUNCH_FAILED',
  CDP_ENDPOINT_UNREACHABLE: 'CDP_ENDPOINT_UNREACHABLE',
});

const DEFAULT_CDP_PORT = 9222;

// ─── Error helper ─────────────────────────────────────────────────────────

class CDPError extends Error {
  /**
   * @param {string} code - Error code from CDP_ERROR_CODES
   * @param {string} message - Human-readable message
   * @param {object} [details] - Optional additional context
   */
  constructor(code, message, details) {
    super(`[${code}] ${message}`);
    this.name = 'CDPError';
    this.code = code;
    this.details = details;
  }
}

// ─── Port validation ──────────────────────────────────────────────────────

/**
 * Validate a port number.
 * @param {number|string} port
 * @returns {boolean}
 */
function isValidPort(port) {
  const num = typeof port === 'string' ? Number(port) : port;
  return Number.isInteger(num) && num > 0 && num <= 65535;
}

/**
 * Normalize port to a number.
 * @param {number|string} port
 * @returns {number}
 */
function normalizePort(port) {
  if (typeof port === 'string') return Number(port);
  return port;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Check whether a CDP endpoint is available on the given port.
 * Sends an HTTP GET to http://localhost:<port>/json/version.
 *
 * @param {number|string} port - CDP debugging port (default: 9222)
 * @returns {Promise<boolean>} true if the endpoint responds with HTTP 200
 */
export async function isCDPAvailable(port = DEFAULT_CDP_PORT) {
  if (!isValidPort(port)) {
    return false;
  }

  const effectivePort = normalizePort(port);

  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${effectivePort}/json/version`, (res) => {
      // Consume response data to free memory
      res.on('data', () => {});
      res.on('end', () => {
        resolve(res.statusCode === 200);
      });
      res.resume();
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Get the WebSocket debug endpoint URL for a given CDP port.
 *
 * @param {number|string} port - CDP debugging port
 * @returns {string} ws://localhost:<port>
 */
export function getCDPEndpoint(port = DEFAULT_CDP_PORT) {
  const effectivePort = normalizePort(port);
  return `http://127.0.0.1:${effectivePort}`;
}

/**
 * Connect to a running browser via CDP.
 * Uses chromium.connectOverCDP with noDefaults:true to avoid modifying
 * the user's browser state.
 *
 * @param {number|string} port - CDP debugging port
 * @param {object} [options] - Additional options passed to connectOverCDP
 * @param {number} [options.timeout] - Connection timeout in ms
 * @returns {Promise<object>} Connected browser instance
 * @throws {CDPError} CDP_INVALID_PORT / CDP_CONNECT_FAILED / CDP_VERSION_MISMATCH
 */
export async function connect(port = DEFAULT_CDP_PORT, options = {}) {
  if (!isValidPort(port)) {
    throw new CDPError(
      CDP_ERROR_CODES.CDP_INVALID_PORT,
      `Invalid CDP port: ${port}. Must be a number between 1 and 65535.`,
      { port }
    );
  }

  const endpointURL = getCDPEndpoint(port);
  const connectOptions = {
    endpointURL,
    noDefaults: true,
    ...options,
  };

  try {
    const browser = await chromium.connectOverCDP(connectOptions);
    return browser;
  } catch (err) {
    const errMsg = err.message || '';
    if (errMsg.includes('Version mismatch') || errMsg.includes('protocol version')) {
      throw new CDPError(
        CDP_ERROR_CODES.CDP_VERSION_MISMATCH,
        `CDP version mismatch on port ${port}. Ensure the browser is up to date.`,
        { port, originalError: errMsg }
      );
    }
    throw new CDPError(
      CDP_ERROR_CODES.CDP_CONNECT_FAILED,
      `Failed to connect to CDP on port ${port}: ${errMsg}`,
      { port, originalError: errMsg }
    );
  }
}

/**
 * Launch a browser with CDP remote debugging enabled and connect to it.
 *
 * @param {string} browserPath - Full path to the browser executable
 * @param {number|string} port - CDP debugging port
 * @param {object} [options] - Additional launch options
 * @param {string} [options.userDataDir] - Custom user data directory path
 * @returns {Promise<{process: object, browser: object}>} The child process and connected browser
 * @throws {CDPError} CDP_BROWSER_NOT_FOUND / CDP_LAUNCH_FAILED
 */
export async function launchWithCDP(browserPath, port = DEFAULT_CDP_PORT, options = {}) {
  // Validate browser path
  if (!browserPath || !fs.existsSync(browserPath)) {
    throw new CDPError(
      CDP_ERROR_CODES.CDP_BROWSER_NOT_FOUND,
      `Browser executable not found at: ${browserPath}`,
      { browserPath }
    );
  }

  const effectivePort = normalizePort(port);

  // Build arguments
  const args = [
    `--remote-debugging-port=${effectivePort}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (options.userDataDir) {
    args.push(`--user-data-dir="${options.userDataDir}"`);
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const child = execFile(browserPath, args, (err) => {
      // Called when the process exits
      if (!settled) {
        settled = true;
        reject(new CDPError(
          CDP_ERROR_CODES.CDP_LAUNCH_FAILED,
          `Browser exited unexpectedly: ${err ? err.message : 'unknown error'}`,
          { browserPath, port: effectivePort }
        ));
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new CDPError(
          CDP_ERROR_CODES.CDP_LAUNCH_FAILED,
          `Failed to launch browser: ${err.message}`,
          { browserPath, port: effectivePort, originalError: err.message }
        ));
      }
    });

    // Give the browser a moment to start, then try to connect via CDP
    const connectDelay = 1500;
    setTimeout(async () => {
      if (settled) return;

      try {
        const browser = await connect(effectivePort);
        settled = true;
        resolve({ process: child, browser });
      } catch (connectErr) {
        settled = true;
        // Kill the spawned process since we can't connect
        if (!child.killed) {
          child.kill();
        }
        reject(new CDPError(
          CDP_ERROR_CODES.CDP_LAUNCH_FAILED,
          `Browser launched but CDP connection failed: ${connectErr.message}`,
          { browserPath, port: effectivePort, originalError: connectErr.message }
        ));
      }
    }, connectDelay);
  });
}
