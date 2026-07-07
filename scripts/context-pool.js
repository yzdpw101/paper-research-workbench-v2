/**
 * context-pool.js — Parallel task pool managing multiple independent browser contexts.
 *
 * Core Layer module that creates a fixed pool of browser contexts and dispatches
 * tasks to them with concurrency control, queuing, and error isolation.
 *
 * Module interface:
 *   createPool(browser, size) → Pool
 *   pool.execute(taskFn)      — Submit an async task, returns Promise for its result
 *   pool.drain()              — Wait for all tasks, close contexts, return results
 *   pool.status()             — { active, queued, completed, total, poolSize }
 *
 * Dependencies: config, playwright browser object
 */

/**
 * @typedef {object} PoolStatus
 * @property {number} active    - Number of tasks currently executing
 * @property {number} queued    - Number of tasks waiting in queue
 * @property {number} completed - Number of tasks that have finished (success or fail)
 * @property {number} total     - Total tasks submitted so far
 * @property {number} poolSize  - Maximum concurrent contexts
 */

/**
 * Create a pool of independent browser contexts.
 *
 * @param {object} browser - Playwright Browser instance (from browser-launcher.launch())
 * @param {number} size    - Maximum number of concurrent contexts (≥ 1)
 * @returns {Pool} Pool object with execute() / drain() / status()
 */
export async function createPool(browser, size) {
  // ── Validation ────────────────────────────────────────────────────────
  if (!browser || typeof browser.newContext !== 'function') {
    throw new Error(
      'createPool: browser argument must be a valid Playwright Browser with newContext()',
    );
  }
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`createPool: pool size must be a positive integer, got ${size}`);
  }

  // ── Internal state ────────────────────────────────────────────────────
  /** @type {Array<{ context: object, busy: boolean }>} */
  const contexts = [];
  const queue = [];       // FIFO queue of { taskFn, resolve, reject }
  const results = [];     // Collected results in submission order (for drain())
  const taskPromises = []; // All pending task promises (for drain() to await)
  let completedCount = 0;
  let totalSubmitted = 0;
  let draining = false;
  let drainFinished = false;
  let drainResolve = null; // resolve function for drain() promise

  // ── Helper: resolve next queued task ──────────────────────────────────

  /**
   * Find the first free context and assign it the next queued task.
   * If no free context or no queued tasks, does nothing.
   * After assigning, if draining and nothing left, completes drain.
   */
  function dequeue() {
    const freeSlot = contexts.find((c) => !c.busy);
    if (!freeSlot) return;
    const next = queue.shift();
    if (!next) {
      // Nothing queued — check if drain should complete
      if (draining) checkDrainComplete();
      return;
    }

    const { taskFn, resolve, reject } = next;
    freeSlot.busy = true;

    // Execute the task with its dedicated context
    const idx = contexts.indexOf(freeSlot);
    Promise.resolve()
      .then(() => taskFn(freeSlot.context, idx))
      .then(
        (result) => {
          freeSlot.busy = false;
          completedCount++;
          results.push({ status: 'fulfilled', value: result });
          resolve(result);
          dequeue();
        },
        (err) => {
          freeSlot.busy = false;
          completedCount++;
          results.push({ status: 'rejected', reason: err });
          reject(err);
          dequeue();
        },
      );
  }

  /** Check if all work is done while draining, and if so, finish. */
  function checkDrainComplete() {
    if (queue.length === 0 && contexts.every((c) => !c.busy)) {
      finishDrain();
    }
  }

  // ── Helper: finish drain ──────────────────────────────────────────────

  /** Close all contexts and resolve the drain promise (idempotent) */
  async function finishDrain() {
    if (drainFinished) return;
    drainFinished = true;
    await Promise.allSettled(contexts.map((c) => c.context.close()));
    if (drainResolve) {
      drainResolve();
      drainResolve = null;
    }
  }

  // ── Initialize contexts ───────────────────────────────────────────────

  for (let i = 0; i < size; i++) {
    const context = await browser.newContext();
    contexts.push({ context, busy: false });
  }

  // ── Pool object ───────────────────────────────────────────────────────

  const pool = {
    /**
     * Submit an async task function to the pool.
     * If a context is free, execution starts immediately.
     * Otherwise the task is queued (FIFO).
     *
     * @param {function} taskFn - Async function: (context, index) => Promise<any>
     * @returns {Promise<any>} Resolves with the task's return value,
     *   or rejects with the task's error.
     */
    execute(taskFn) {
      if (draining) {
        const err = new Error('Pool is draining: cannot submit new tasks');
        return Promise.reject(err);
      }

      const taskPromise = new Promise((resolve, reject) => {
        totalSubmitted++;
        queue.push({ taskFn, resolve, reject });
        dequeue();
      });

      // Prevent unhandled rejections when callers don't catch
      taskPromise.catch(() => {});
      taskPromises.push(taskPromise);
      return taskPromise;
    },

    /**
     * Wait for all submitted tasks to complete, then close all contexts.
     * Returns a shallow copy of task return values in submission order.
     * Rejected task results are replaced with { status: 'rejected', reason }.
     *
     * @returns {Promise<Array<any>>} Task results (fulfilled -> raw value, rejected -> error wrapper)
     */
    async drain() {
      draining = true;

      // Wait for all pending tasks to settle
      if (taskPromises.length > 0) {
        await Promise.allSettled(taskPromises);
      }

      // If after settling there are still busy contexts, set up a callback
      // so dequeue() can signal completion
      if (contexts.some((c) => c.busy)) {
        await new Promise((resolve) => {
          drainResolve = resolve;
        });
      }

      // All tasks done — close contexts and return results
      await finishDrain();

      // Unwrap: fulfilled -> raw value, rejected -> error wrapper
      const unwrapped = results.map((r) =>
        r.status === 'fulfilled' ? r.value : { status: 'rejected', reason: r.reason },
      );

      return unwrapped;
    },

    /**
     * Get current pool status.
     *
     * @returns {PoolStatus}
     */
    status() {
      const active = contexts.filter((c) => c.busy).length;
      return {
        active,
        queued: queue.length,
        completed: completedCount,
        total: totalSubmitted,
        poolSize: size,
      };
    },
  };

  return pool;
}
