/**
 * navigator.js — Intelligent navigation module.
 *
 * Replaces hardcoded `waitForTimeout(3000)` with smart waiting and auto-retry.
 * Provides exponential backoff retry, page-ready detection, and unified error handling.
 *
 * Module interface:
 *   goto(page, url, options)           — Navigate to URL and wait for readiness
 *   waitForReady(page, {selector, timeout}) — Wait for selector to appear
 *   retry(fn, {maxRetries, baseDelay, maxDelay}) — Exponential backoff retry
 *   waitForNetworkIdle(page, timeout)  — Wait for network to be idle
 *   isPageReady(page)                  — Check if page is interactive
 *
 * Dependencies: config (for navigation timeouts and retry params)
 */

import { get } from './config.js';

// ─── Error codes ─────────────────────────────────────────────────────────

export const Errors = Object.freeze({
  NAV_TIMEOUT: 'NAV_TIMEOUT',
  SELECTOR_NOT_FOUND: 'SELECTOR_NOT_FOUND',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NAV_BLOCKED: 'NAV_BLOCKED',
});

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply random jitter: ±25% of the delay value.
 * @param {number} delay
 * @returns {number}
 */
function jitter(delay) {
  const range = delay * 0.25;
  return Math.round(delay - range + Math.random() * range * 2);
}

/**
 * Determine whether an error is a timeout-related error.
 * @param {Error} err
 * @returns {boolean}
 */
function isTimeoutError(err) {
  const msg = (err && err.message) || '';
  return /timeout|timed\s*out/i.test(msg);
}

/**
 * Determine whether an error is an unstable-network error (connection closed / timed out).
 * These get a short delay before a single retry.
 * @param {Error} err
 * @returns {boolean}
 */
function isUnstableNetworkError(err) {
  const msg = (err && err.message) || '';
  return /err_connection_closed|err_timed_out/i.test(msg);
}

/**
 * Determine whether an error is a network-level error.
 * @param {Error} err
 * @returns {boolean}
 */
function isNetworkError(err) {
  const msg = (err && err.message) || '';
  return /net::err_|dns|refused|econnreset|econnrefused|enotfound|network|interrupted by another navigation/i.test(msg);
}

// ─── Retry with exponential backoff ───────────────────────────────────────

/**
 * Retry an async function with exponential backoff.
 *
 * The delay follows: delay_n = min(baseDelay * 2^n, maxDelay)
 * Each delay gets ±25% random jitter.
 *
 * @param {Function} fn - Async function to retry
 * @param {object} [options]
 * @param {number} [options.maxRetries] - Maximum retry attempts (default: from config, 3)
 * @param {number} [options.baseDelay] - Base delay in ms (default: from config, 1000)
 * @param {number} [options.maxDelay] - Maximum delay cap in ms (default: 30000)
 * @returns {Promise<*>} The result of fn
 * @throws The last error thrown by fn
 */
export async function retry(fn, { maxRetries, baseDelay, maxDelay } = {}) {
  const retries = maxRetries ?? get('navigation.retries') ?? 3;
  const base = baseDelay ?? get('navigation.retryBackoffBase') ?? 1000;
  const cap = maxDelay ?? 30000;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = jitter(Math.min(base * Math.pow(2, attempt), cap));
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ─── Network idle detection ──────────────────────────────────────────────

/**
 * Wait for network to be idle.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {number} [timeout] - Timeout in ms (default: from config, 5000)
 * @returns {Promise<boolean>} true if idle, false if timed out
 */
export async function waitForNetworkIdle(page, timeout) {
  const idleTimeout = timeout ?? get('navigation.networkIdleTimeout') ?? 5000;
  try {
    await page.waitForLoadState('networkidle', { timeout: idleTimeout });
    return true;
  } catch {
    return false;
  }
}

// ─── Page ready check ────────────────────────────────────────────────────

/**
 * Check whether the page's DOM is fully loaded and interactive.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<boolean>} true if readyState is 'complete'
 */
export async function isPageReady(page) {
  try {
    const state = await page.evaluate('document.readyState');
    return state === 'complete';
  } catch {
    return false;
  }
}

// ─── Wait for selector ──────────────────────────────────────────────────

/**
 * Wait for a CSS selector to appear on the page.
 *
 * If the selector is found, returns `{ ready: true }`.
 * If the selector times out, returns `{ ready: false, reason: 'SELECTOR_NOT_FOUND', selector }`.
 * If no selector is provided, resolves immediately.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {object} [options]
 * @param {string} [options.selector] - CSS selector to wait for
 * @param {number} [options.timeout] - Timeout in ms (default: config navigation.timeout)
 * @returns {Promise<{ready: boolean, reason?: string, selector?: string}>}
 */
export async function waitForReady(page, { selector, timeout } = {}) {
  if (!selector) {
    return { ready: true };
  }

  const ms = timeout ?? get('navigation.timeout') ?? 60000;

  try {
    await page.waitForSelector(selector, { timeout: ms });
    return { ready: true };
  } catch {
    return { ready: false, reason: Errors.SELECTOR_NOT_FOUND, selector };
  }
}

// ─── Page goto with retry ────────────────────────────────────────────────

/**
 * Navigate to a URL and wait for the page to be ready.
 *
 * Flow:
 *   1. page.goto(url, { waitUntil: 'networkidle', timeout })
 *   2. If options.waitFor is set → waitForSelector(selector, timeout)
 *   3. If options.waitForNetworkIdle is true → waitForNetworkIdle(timeout)
 *   4. On failure → retry with exponential backoff
 *
 * Timeout errors (NAV_TIMEOUT) are retried up to `options.retries` times.
 * Network errors (NETWORK_ERROR) are retried once.
 * After retry exhaustion, throws an error with the error code prefixed in the message.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {string} url - Target URL
 * @param {object} [options]
 * @param {number} [options.timeout] - Navigation timeout in ms (default: config navigation.timeout)
 * @param {number} [options.retries] - Max retry count (default: config navigation.retries)
 * @param {number} [options.baseDelay] - Base retry delay in ms (default: config navigation.retryBackoffBase)
 * @param {string} [options.waitFor] - CSS selector to wait for after navigation
 * @param {boolean} [options.waitForNetworkIdle] - Whether to wait for network idle
 * @returns {Promise<void>}
 * @throws {Error} With prefix NAV_TIMEOUT, NETWORK_ERROR, or NAV_BLOCKED
 */
export async function goto(page, url, options = {}) {
  const timeout = options.timeout ?? get('navigation.timeout') ?? 60000;
  const maxRetries = options.retries ?? get('navigation.retries') ?? 3;
  const baseDelay = options.baseDelay ?? get('navigation.retryBackoffBase') ?? 1000;

  /** Inner navigation call — throws on error responses. */
  const go = async () => {
    const response = await page.goto(url, {
      waitUntil: options.waitUntil || 'domcontentloaded',
      timeout,
    });

    // Handle null response (e.g. about:blank)
    if (response && !response.ok()) {
      const status = response.status();
      if (status >= 500) {
        throw new Error(`HTTP ${status}: Server error for ${url}`);
      }
    }
  };

  // Retry loop: timeout errors → exponential backoff (up to maxRetries),
  // unstable network errors (ERR_CONNECTION_CLOSED, ERR_TIMED_OUT) → 3s delay + 1 retry,
  // other network errors → retry once immediately,
  // others → throw immediately.
  for (let attempt = 0; ; attempt++) {
    try {
      await go();
      break;
    } catch (err) {
      // Unstable network errors: 3s delay before single retry
      if (isUnstableNetworkError(err)) {
        if (attempt < 1) {
          await sleep(3000);
          continue;
        }
        throw new Error(`${Errors.NETWORK_ERROR}: ${url} — ${err.message}`);
      }
      if (isTimeoutError(err)) {
        if (attempt < maxRetries) {
          const delay = jitter(Math.min(baseDelay * Math.pow(2, attempt), 30000));
          await sleep(delay);
          continue;
        }
        throw new Error(`${Errors.NAV_TIMEOUT}: ${url}`);
      }
      if (isNetworkError(err)) {
        if (attempt < 1) {
          // No backoff for other network errors, just retry once
          continue;
        }
        throw new Error(`${Errors.NETWORK_ERROR}: ${url} — ${err.message}`);
      }
      // Non-retryable error (e.g. blocked, malformed URL)
      throw new Error(`${Errors.NAV_BLOCKED}: ${url} — ${err.message}`);
    }
  }

  // Wait for optional selector — throw if selector not found
  if (options.waitFor) {
    const ready = await waitForReady(page, { selector: options.waitFor, timeout });
    if (!ready.ready) {
      throw new Error(`${Errors.SELECTOR_NOT_FOUND}: selector "${options.waitFor}" not found after navigation to ${url}`);
    }
  }

  // Wait for optional network idle
  if (options.waitForNetworkIdle) {
    await waitForNetworkIdle(page);
  }
}
