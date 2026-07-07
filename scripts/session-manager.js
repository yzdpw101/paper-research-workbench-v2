/**
 * session-manager.js — Login session lifecycle manager.
 *
 * Manages Playwright storageState persistence with TTL (time-to-live).
 * Allows sessions to be reused across runs without re-login.
 *
 * Module interface:
 *   saveSession(platform, context)   — Save storageState + metadata to disk
 *   loadSession(platform)            — Read storageState, check TTL, return state or null
 *   isSessionValid(platform)         — Check if a non-expired session file exists
 *
 * Storage format (.state/sessions/<platform>.json):
 *   { storageState: { ... }, platform, createdAt, expiresAt }
 *
 * Dependencies: config (TTL), Node.js fs/path
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get as configGet, getProjectRoot } from './config.js';

// ─── Internal state ─────────────────────────────────────────────────────────

const projectRoot = getProjectRoot();

// Default TTL: 24 hours (in milliseconds)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the session directory path.
 */
function getSessionDir() {
  return path.join(projectRoot, '.state', 'sessions');
}

/**
 * Resolve the session file path for a platform.
 *
 * @param {'ieee'|'wanfang'} platform
 * @returns {string} Absolute path to the session file
 */
function getSessionPath(platform) {
  return path.join(getSessionDir(), `${platform}.json`);
}

/**
 * Get the configured session TTL in milliseconds.
 * Falls back to 24h if config is not set.
 *
 * @returns {number} TTL in milliseconds
 */
function getTTL() {
  const ttl = configGet('session.ttl');
  if (typeof ttl === 'number' && ttl > 0) return ttl;
  return DEFAULT_TTL_MS;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Save the current browser context's storage state as a session.
 *
 * Creates the session directory if it doesn't exist, then writes
 * the storage state along with platform name and timestamps.
 *
 * @param {'ieee'|'wanfang'} platform - Platform identifier
 * @param {import('playwright').BrowserContext} context - Playwright browser context
 * @returns {Promise<{platform: string, storageState: object, createdAt: string, expiresAt: string}>}
 *   The saved session object
 */
export async function saveSession(platform, context) {
  const stateDir = getSessionDir();
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const storageState = await context.storageState();
  const now = Date.now();
  const ttl = getTTL();

  const session = {
    platform,
    storageState,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  };

  fs.writeFileSync(getSessionPath(platform), JSON.stringify(session, null, 2));
  return session;
}

/**
 * Load a session's storage state if it exists and has not expired.
 *
 * @param {'ieee'|'wanfang'} platform - Platform identifier
 * @returns {object|null} The storage state object, or null if missing/expired/corrupted
 */
export function loadSession(platform) {
  const filePath = getSessionPath(platform);

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const session = JSON.parse(raw);

    if (!session || !session.expiresAt) return null;

    const expiresAt = new Date(session.expiresAt).getTime();
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) return null;

    return session.storageState || null;
  } catch {
    return null;
  }
}

/**
 * Check whether a non-expired session file exists for a platform.
 *
 * @param {'ieee'|'wanfang'} platform - Platform identifier
 * @returns {boolean} True if a valid session exists
 */
export function isSessionValid(platform) {
  return loadSession(platform) !== null;
}
