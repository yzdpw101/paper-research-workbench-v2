/**
 * config.js — Centralized configuration management module.
 *
 * Two-layer merge: defaults → PAPER_* env vars.
 * No config file — everything via defaults or environment variables.
 *
 * Module interface:
 *   get(key)       — Read a config value by dot-notation key
 *   getAll()       — Return full merged config (deep-cloned)
 *   set(key, val)  — Override a value at runtime (highest priority)
 *
 * Dependencies: Node.js built-in modules only (fs, path)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Default configuration ──────────────────────────────────────────────────

const DEFAULTS = Object.freeze({
  version: 2,
  browser: {
    default: 'firefox',
    cdpPort: 9222,
  },
  navigation: {
    timeout: 30000,
    retries: 2,
    retryBackoffBase: 1000,
    networkIdleTimeout: 5000,
  },
  download: {
    dir: '.state/downloads',
    timeout: 120000,
  },
  parallel: {
    maxConcurrency: 3,
  },
  state: {
    dir: '.state',
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepClone(val) {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(deepClone);
  const copy = {};
  for (const key of Object.keys(val)) copy[key] = deepClone(val[key]);
  return copy;
}

function deepMerge(target, source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return source;
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function deepGet(obj, key) {
  if (!key) return undefined;
  const parts = key.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function deepSet(obj, key, value) {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function coerceEnvValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(raw) && raw.trim() !== '') {
    const num = Number(raw);
    if (!Number.isNaN(num)) return num;
  }
  return raw;
}

// ─── Env layer ──────────────────────────────────────────────────────────────

function getEnvLayer() {
  const overrides = {};
  const prefix = 'PAPER_';
  for (const [name, rawValue] of Object.entries(process.env)) {
    if (!name.startsWith(prefix) || rawValue === undefined || rawValue === null) continue;
    const suffix = name.slice(prefix.length);
    if (!suffix) continue;
    const val = coerceEnvValue(rawValue);
    const parts = suffix.toLowerCase().split('_');
    const section = parts[0];
    if (parts.length === 1) {
      overrides[section] = overrides[section] || {};
      overrides[section].default = val;
    } else {
      const camelKey = parts.slice(1).map((p, i) => i === 0 ? p : p[0].toUpperCase() + p.slice(1)).join('');
      overrides[section] = overrides[section] || {};
      overrides[section][camelKey] = val;
    }
  }
  return overrides;
}

// ─── Module state ────────────────────────────────────────────────────────────

const _fileLayer = {};
const _overrideLayer = {};

// ─── Public API ─────────────────────────────────────────────────────────────

export function get(key) {
  const overrideVal = deepGet(_overrideLayer, key);
  if (overrideVal !== undefined) return overrideVal;

  const envVal = deepGet(getEnvLayer(), key);
  if (envVal !== undefined) return envVal;

  const fileVal = deepGet(_fileLayer, key);
  if (fileVal !== undefined) return fileVal;

  return deepGet(DEFAULTS, key);
}

export function getAll() {
  const merged = deepClone(DEFAULTS);
  deepMerge(merged, _fileLayer);
  deepMerge(merged, getEnvLayer());
  deepMerge(merged, _overrideLayer);
  return merged;
}

export function set(key, value) {
  deepSet(_overrideLayer, key, value);
}

/**
 * Load and merge a JSON configuration file.
 * Silently ignored if file doesn't exist or is invalid.
 */
export function load(filePath) {
  try {
    const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
    const data = JSON.parse(content);
    deepMerge(_fileLayer, data);
  } catch {
    // silently ignore
  }
}

export function getProjectRoot() {
  if (process.env.SKILL_DIR) return path.resolve(process.env.SKILL_DIR);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, '..');
}
