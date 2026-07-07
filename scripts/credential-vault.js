/**
 * credential-vault.js — Encrypted credential storage module.
 *
 * Implements AES-256-GCM authenticated encryption with PBKDF2 key derivation.
 * Credentials are stored per-service in a single vault file
 * (.state/credentials.json.enc by default).
 *
 * Each service gets its own salt/iv/authTag/data pair for independent encryption.
 * Tampering with one service does not affect others.
 *
 * Master key source priority:
 *   1. setMasterKey() — programmatic (for tests)
 *   2. process.env.PAPER_MASTER_KEY — environment variable
 *   3. (future) Windows DPAPI via win-dpapi native module
 *   4. (future) Interactive prompt callback
 *
 * Module interface:
 *   store(service, data)   — Encrypt and store credentials for a service
 *   retrieve(service)      — Decrypt and return credentials (or null)
 *   exists(service)        — Check if service credentials exist
 *   reset(service)         — Delete credentials for a service
 *   listServices()         — Return array of all stored service names
 *   deriveKey(pwd, salt)   — PBKDF2-SHA256 key derivation
 *   setMasterKey(key)      — Set master key programmatically (testing)
 *   setVaultPath(path)     — Override vault file path (testing)
 *
 * Dependencies: Node.js built-in modules (crypto, fs, path) + config
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get, getProjectRoot } from './config.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const KDF = 'pbkdf2';
const KDF_HASH = 'sha256';
const KDF_ITERATIONS = 100000;
const KEY_LENGTH = 32;   // 256 bits for AES-256
const SALT_LENGTH = 16;  // 128 bits
const IV_LENGTH = 12;    // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const VAULT_VERSION = 1;

// ─── Error classes ──────────────────────────────────────────────────────────

export class VaultError extends Error {
  /**
   * @param {'VAULT_NO_KEY'|'VAULT_CORRUPT'|'VAULT_DECRYPT_FAIL'|'VAULT_WRITE_FAIL'|'VAULT_ENCRYPT_FAIL'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = 'VaultError';
    this.code = code;
  }
}

// ─── Internal state ─────────────────────────────────────────────────────────

/** @type {string|null} Master key set programmatically */
let _masterKey = null;

/** @type {string|null} Override for vault file path */
let _vaultPath = null;

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * Get the vault file path.
 * Priority: setVaultPath() > config.credentials.vaultPath > default
 *
 * @returns {string}
 */
function getVaultPath() {
  if (_vaultPath) return _vaultPath;
  const configured = get('credentials.vaultPath');
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(getProjectRoot(), configured);
  }
  return path.resolve(getProjectRoot(), '.state/credentials.json.enc');
}

/**
 * Resolve the master key from available sources.
 *
 * @returns {string} The master key
 * @throws {VaultError} VAULT_NO_KEY — if no key source is available
 */
function resolveMasterKey() {
  if (_masterKey) return _masterKey;
  if (process.env.PAPER_MASTER_KEY) {
    _masterKey = process.env.PAPER_MASTER_KEY;
    return _masterKey;
  }
  throw new VaultError(
    'VAULT_NO_KEY',
    'No master key available. Set PAPER_MASTER_KEY environment variable, ' +
    'or call setMasterKey() before using the vault.',
  );
}

/**
 * Read and parse the vault file. Returns null if file does not exist.
 *
 * @returns {object|null}
 */
function readVault() {
  const vp = getVaultPath();
  try {
    const content = fs.readFileSync(vp, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write the vault object to disk.
 *
 * @param {object} data — The vault data object
 * @throws {VaultError} VAULT_WRITE_FAIL
 */
function writeVault(data) {
  const vp = getVaultPath();
  try {
    const dir = path.dirname(vp);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(vp, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    throw new VaultError(
      'VAULT_WRITE_FAIL',
      `Failed to write vault file: ${err.message}`,
    );
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Derive a 32-byte AES-256 key from a master password using PBKDF2-SHA256.
 *
 * @param {string} masterPassword — The master password
 * @param {Buffer} salt — Cryptographic salt
 * @returns {Promise<Buffer>} Derived key (32 bytes)
 */
export async function deriveKey(masterPassword, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      masterPassword,
      salt,
      KDF_ITERATIONS,
      KEY_LENGTH,
      KDF_HASH,
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
}

/**
 * Encrypt and store credentials for a service.
 *
 * Each service gets its own random salt, IV, and encryption.
 * The vault file stores a mapping of { serviceName → encryptedEntry }.
 *
 * @param {string} service — Service name (e.g. 'ieee', 'wanfang')
 * @param {object} data — Credential data object (institution, username, password, notes, updatedAt)
 * @returns {Promise<void>}
 * @throws {VaultError} VAULT_NO_KEY, VAULT_ENCRYPT_FAIL, VAULT_WRITE_FAIL
 */
export async function store(service, data) {
  if (!service || typeof service !== 'string') {
    throw new VaultError('VAULT_ENCRYPT_FAIL', 'Service name must be a non-empty string');
  }

  const masterKey = resolveMasterKey();

  // Generate random salt and IV for this service
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  try {
    // Derive encryption key from master password + this service's salt
    const encryptionKey = await deriveKey(masterKey, salt);

    // Encrypt the data
    const plaintext = JSON.stringify(data);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Build the encrypted entry
    const entry = {
      version: VAULT_VERSION,
      kdf: KDF,
      kdfParams: {
        iterations: KDF_ITERATIONS,
        hash: KDF_HASH,
      },
      cipher: ALGORITHM,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted.toString('base64'),
    };

    // Read existing vault, merge this service, write back
    const vault = readVault() || { version: VAULT_VERSION, services: {} };
    vault.services = vault.services || {};
    vault.services[service] = entry;
    writeVault(vault);
  } catch (err) {
    if (err instanceof VaultError) throw err;
    throw new VaultError(
      'VAULT_ENCRYPT_FAIL',
      `Encryption failed: ${err.message}`,
    );
  }
}

/**
 * Decrypt and return credentials for a service.
 *
 * @param {string} service — Service name to retrieve
 * @returns {Promise<object|null>} Decrypted credential data, or null if not found
 * @throws {VaultError} VAULT_NO_KEY, VAULT_CORRUPT, VAULT_DECRYPT_FAIL
 */
export async function retrieve(service) {
  if (!service || typeof service !== 'string') {
    throw new VaultError('VAULT_DECRYPT_FAIL', 'Service name must be a non-empty string');
  }

  const masterKey = resolveMasterKey();
  const vault = readVault();

  if (!vault || !vault.services || !vault.services[service]) {
    return null;
  }

  const entry = vault.services[service];

  try {
    // Parse base64 fields
    const salt = Buffer.from(entry.salt, 'base64');
    const iv = Buffer.from(entry.iv, 'base64');
    const authTag = Buffer.from(entry.authTag, 'base64');
    const encrypted = Buffer.from(entry.data, 'base64');

    // Derive the same encryption key
    const encryptionKey = await deriveKey(masterKey, salt);

    // Decrypt with GCM authentication (will fail if data was tampered)
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf-8'));
  } catch (err) {
    // GCM authentication failures (tag mismatch) or JSON parse errors
    throw new VaultError(
      'VAULT_CORRUPT',
      `Failed to decrypt credentials for '${service}': the vault may be corrupted or the master key has changed.`,
    );
  }
}

/**
 * Check if credentials exist for a service.
 *
 * @param {string} service — Service name
 * @returns {boolean} True if credentials exist
 */
export function exists(service) {
  const vault = readVault();
  if (!vault || !vault.services) return false;
  return Object.prototype.hasOwnProperty.call(vault.services, service);
}

/**
 * Delete credentials for a service.
 *
 * @param {string} service — Service name to remove
 */
export function reset(service) {
  const vault = readVault();
  if (!vault || !vault.services) return;
  if (Object.prototype.hasOwnProperty.call(vault.services, service)) {
    delete vault.services[service];
    writeVault(vault);
  }
}

/**
 * List all stored service names.
 *
 * @returns {string[]} Array of service names
 */
export function listServices() {
  const vault = readVault();
  if (!vault || !vault.services) return [];
  return Object.keys(vault.services);
}

// ─── Test helpers ───────────────────────────────────────────────────────────

/**
 * Override the master key programmatically.
 * Useful for testing; called by setMasterKey() before module import in tests.
 *
 * @param {string|null} key — Master key, or null to clear
 */
export function setMasterKey(key) {
  _masterKey = key;
}

/**
 * Override the vault file path.
 * Useful for testing to use a temporary file.
 *
 * @param {string|null} p — Path to vault file, or null to use default
 */
export function setVaultPath(p) {
  _vaultPath = p;
}
