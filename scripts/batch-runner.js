/**
 * batch-runner.js — Batch task scheduler for multi-paper / multi-operation scenarios.
 *
 * Core Layer module that takes a list of tasks and dispatches them through a
 * context-pool for parallel execution with progress tracking and result aggregation.
 *
 * Module interface:
 *   runBatch(tasks, options) → { total, success, failed, results }
 *
 * Task format: { name, fn } where fn is (context, index) => Promise<any>
 * Options:     { parallel, progress }
 *
 * Dependencies: context-pool, config
 */

import fs from 'node:fs';
import { createPool } from './context-pool.js';
import { get as getConfig } from './config.js';

/**
 * @typedef {object} BatchTask
 * @property {string} [name]    - Human-readable task name (optional but recommended)
 * @property {function} fn      - Async function: (context, index) => Promise<any>
 *
 * @typedef {object} BatchOptions
 * @property {number} [parallel]   - Max concurrency (default: config parallel.maxConcurrency)
 * @property {function} [progress] - Progress callback: ({ completed, total, name }) => void
 *
 * @typedef {object} BatchResult
 * @property {string} status  - 'fulfilled' | 'rejected'
 * @property {string} name    - Task name
 * @property {*}      [value] - Fulfilled return value (only when status === 'fulfilled')
 * @property {object}  [reason] - Rejection reason (only when status === 'rejected')
 *
 * @typedef {object} BatchSummary
 * @property {number} total        - Total number of tasks
 * @property {number} success      - Number of fulfilled tasks
 * @property {number} failed       - Number of rejected tasks
 * @property {BatchResult[]} results - Individual task results in submission order
 */

/**
 * Run a batch of tasks with optional concurrency control and progress tracking.
 *
 * @param {BatchTask[]} tasks - Array of { name, fn } objects
 * @param {BatchOptions} [options] - { parallel, progress }
 * @returns {Promise<BatchSummary>} Summary with total/success/failed/results
 */
export async function runBatch(tasks, options = {}) {
  // ── Validate inputs ───────────────────────────────────────────────────
  if (!Array.isArray(tasks)) {
    throw new Error('runBatch: tasks must be an array');
  }

  // ── Resolve pool size ─────────────────────────────────────────────────
  const poolSize = resolvePoolSize(options);

  // ── Handle empty task list early ──────────────────────────────────────
  if (tasks.length === 0) {
    return { total: 0, success: 0, failed: 0, results: [] };
  }

  // ── Create pool from browser option ──────────────────────────────────
  const browser = options.browser;
  if (!browser || typeof browser.newContext !== 'function') {
    throw new Error(
      'runBatch: a browser object with newContext() is required via options.browser. ' +
      'Create one with browser-launcher.launch() and pass it in.',
    );
  }
  const pool = await createPool(browser, poolSize);

  // ── Submit all tasks ──────────────────────────────────────────────────
  const namedTasks = tasks.map((t, i) => ({
    name: t.name || `task-${i + 1}`,
    fn: t.fn,
  }));

  // We track completed count for progress reporting using the pool's own
  // drainage — we submit all tasks, then drain. Progress is reported
  // asynchronously as tasks settle.
  let completedCount = 0;
  const totalCount = namedTasks.length;

  const submissionPromises = namedTasks.map(({ name, fn }) =>
    pool.execute(fn).then(
      (value) => {
        completedCount++;
        if (options.progress) {
          options.progress({ completed: completedCount, total: totalCount, name });
        }
        return { status: 'fulfilled', name, value };
      },
      (reason) => {
        completedCount++;
        if (options.progress) {
          options.progress({ completed: completedCount, total: totalCount, name });
        }
        // Error 的 message/stack/name 是 non-enumerable，JSON.stringify 会丢失
        // 转为普通对象以保证序列化正确
        const serializableReason = reason instanceof Error
          ? { message: reason.message, stack: reason.stack, name: reason.name }
          : reason;
        return { status: 'rejected', name, reason: serializableReason };
      },
    ),
  );

  // ── Drain and collect ─────────────────────────────────────────────────
  await pool.drain();

  // Wait for all settled results
  const settled = await Promise.allSettled(submissionPromises);

  // Unwrap the results (each promise resolves to a BatchResult)
  const results = settled.map((r) =>
    r.status === 'fulfilled' ? r.value : (() => {
      const fallbackReason = r.reason instanceof Error
        ? { message: r.reason.message, stack: r.reason.stack, name: r.reason.name }
        : r.reason;
      return { status: 'rejected', name: 'unknown', reason: fallbackReason };
    })()
  );

  // ── Build summary ─────────────────────────────────────────────────────
  const success = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return {
    total: results.length,
    success,
    failed,
    results,
  };
}

/**
 * Resolve the pool size from options or config, with validation.
 *
 * @param {BatchOptions} options
 * @returns {number} Positive integer pool size
 */
function resolvePoolSize(options) {
  if (options.parallel !== undefined) {
    if (!Number.isInteger(options.parallel) || options.parallel < 1) {
      throw new Error(
        `runBatch: parallel option must be a positive integer, got ${options.parallel}`,
      );
    }
    return options.parallel;
  }

  // Fall back to config
  const configured = getConfig('parallel.maxConcurrency');
  if (configured !== undefined && configured !== null) {
    return configured;
  }

  // Hard default
  return 3;
}

// ─── CLI entry point ──────────────────────────────────────────────────────

/**
 * Show CLI usage information.
 */
function showCLIUsage() {
  console.error(`Usage: node scripts/batch-runner.js --tasks <json-file> [--parallel <n>]

Run a batch of tasks from a JSON file.

Task file format:
  [
    { "name": "task-1", "code": "async (context) => { return await context.newPage(); }" },
    ...
  ]

Options:
  --tasks     Path to a JSON file containing the task array (required)
  --parallel  Max concurrency (default: from config)
`);
}

/**
 * Load tasks from a JSON file.
 * Each task should have { name?, code } where code is an eval-able async function body.
 *
 * @param {string} filePath
 * @returns {Array<{name: string, fn: Function}>}
 */
function loadTasksFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('Tasks file must contain a JSON array');
  }
  return data.map((t, i) => {
    const name = t.name || `task-${i + 1}`;
    if (typeof t.code !== 'string') {
      throw new Error(`Task "${name}" is missing a "code" field (async function body as string)`);
    }
    // Create an async function from the code string
    const fn = eval(`(async (context) => { ${t.code} })`);
    return { name, fn };
  });
}

// ─── CLI main ─────────────────────────────────────────────────────────────

async function cliMain() {
  const tasksFile = (() => {
    const i = process.argv.indexOf('--tasks');
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '';
  })();
  const parallelOpt = (() => {
    const i = process.argv.indexOf('--parallel');
    return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1]) : NaN;
  })();

  if (!tasksFile) {
    showCLIUsage();
    process.exit(1);
  }

  const tasks = loadTasksFile(tasksFile);

  // Launch browser using browser-launcher
  const { browser } = await launchBrowser();

  const options = { browser };
  if (!isNaN(parallelOpt) && parallelOpt > 0) {
    options.parallel = parallelOpt;
  }

  const summary = await runBatch(tasks, options);

  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}

/**
 * Launch a browser instance using browser-launcher.
 * @returns {Promise<{browser: object}>}
 */
async function launchBrowser() {
  const { launch } = await import('./browser-launcher.js');
  const { browser } = await launch();
  return { browser };
}

// Run when executed directly
if (process.argv[1] && (
  process.argv[1].endsWith('batch-runner.js')
)) {
  cliMain().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
