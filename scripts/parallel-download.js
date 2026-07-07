#!/usr/bin/env node
/**
 * parallel-download.js — Parallel IEEE Xplore PDF download CLI.
 *
 * Usage:
 *   node parallel-download.js --arnumbers <n1,n2,...> --save-dir <dir>
 *   node parallel-download.js --arnumbers-file <json-file> --save-dir <dir>
 *                            [--parallel <n>] [--timeout <ms>]
 *
 * --arnumbers      : Comma-separated IEEE article numbers (required unless --arnumbers-file)
 * --arnumbers-file : JSON file containing arnumbers array or { arnumbers: [...] }
 * --save-dir       : Directory to save downloaded PDFs (required)
 * --parallel       : Max concurrent downloads (default: from config)
 * --timeout        : Download timeout per file in ms (default: 60000)
 *
 * Output: JSON with per-file download results.
 *
 * Dependencies: browser-launcher, batch-runner, navigator, config
 */

import { launch } from './browser-launcher.js';
import { runBatch } from './batch-runner.js';
import { goto } from './navigator.js';
import { get as getConfig } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a comma-separated arnumber string into an array.
 * Empty strings and whitespace-only entries are filtered out.
 *
 * @param {string} raw - Comma-separated arnumbers
 * @returns {string[]} Trimmed, non-empty arnumbers
 */
export function parseArn(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Load arnumbers from a JSON file.
 * Supports both array format [n1, n2, ...] and object format { arnumbers: [...] }.
 *
 * @param {string} filePath - Path to JSON file
 * @returns {string[]} Array of arnumber strings
 */
export function loadArnFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  if (Array.isArray(data)) {
    return data.map(String);
  }
  if (data && Array.isArray(data.arnumbers)) {
    return data.arnumbers.map(String);
  }
  throw new Error(
    'ARNumbers file must contain an array or { arnumbers: [...] } object',
  );
}

/**
 * Print usage information.
 */
export function showUsage() {
  console.error(`Usage:
  node parallel-download.js --arnumbers <n1,n2,...> --save-dir <dir>
  node parallel-download.js --arnumbers-file <json-file> --save-dir <dir>

Options:
  --arnumbers      Comma-separated IEEE article numbers
  --arnumbers-file JSON file (array or { arnumbers: [...] })
  --save-dir       Directory to save downloaded PDFs (required)
  --parallel       Max concurrent downloads (default: from config)
  --timeout        Download timeout per file in ms (default: 60000)
`);
}

/**
 * Download a single IEEE PDF using a browser context from the pool.
 *
 * @param {object} context - Playwright BrowserContext from the pool
 * @param {string} arnumber - IEEE article number
 * @param {string} saveDir - Directory to save the downloaded file
 * @param {number} timeout - Download timeout in ms
 * @returns {Promise<object>} { arnumber, ok, download?, error? }
 */
async function downloadOne(context, arnumber, saveDir, timeout) {
  const page = await context.newPage();
  const stampPDF = 'https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=' + arnumber;

  // Ensure saveDir exists
  fs.mkdirSync(saveDir, { recursive: true });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ arnumber, error: 'download timeout' });
    }, timeout);

    page.on('download', async (dl) => {
      const filename = path.basename(dl.suggestedFilename());
      const dest = path.join(saveDir, filename);
      const dd = path.dirname(dest);
      if (!fs.existsSync(dd)) fs.mkdirSync(dd, { recursive: true });

      try {
        const stream = await dl.createReadStream();
        const ws = fs.createWriteStream(dest);
        await new Promise((res, rej) => {
          stream.pipe(ws);
          ws.on('finish', res);
          ws.on('error', rej);
          stream.on('error', rej);
        });
        clearTimeout(timer);
        resolve({
          arnumber,
          ok: true,
          download: {
            name: filename,
            path: dest,
            size: fs.statSync(dest).size,
          },
        });
      } catch (e) {
        // Fallback: try saveAs
        try {
          await dl.saveAs(dest);
          clearTimeout(timer);
          resolve({
            arnumber,
            ok: true,
            download: {
              name: filename,
              path: dest,
              size: fs.statSync(dest).size,
            },
          });
        } catch (e2) {
          clearTimeout(timer);
          resolve({ arnumber, error: 'save failed: ' + e.message });
        }
      }
    });

    // Navigate to trigger the download
    goto(page, stampPDF, { timeout }).catch(() => {});
  });
}

/**
 * Build an array of batch download tasks.
 *
 * @param {string[]} arnumbers - List of IEEE article numbers
 * @param {string} saveDir - Download directory
 * @param {number} timeout - Download timeout per file
 * @returns {Array<{name: string, fn: Function}>}
 */
function buildDownloadTasks(arnumbers, saveDir, timeout) {
  return arnumbers.map((arn) => ({
    name: `download-${arn}`,
    fn: (context) => downloadOne(context, arn, saveDir, timeout),
  }));
}

// ─── CLI argument parsing ──────────────────────────────────────────────

function opt(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const rawArn = opt('--arnumbers', '');
  const arnFile = opt('--arnumbers-file', '');
  const saveDir = opt('--save-dir', '');
  const parallelArg = parseInt(opt('--parallel', ''));
  const dlTimeout = parseInt(opt('--timeout', '60000'));

  // Validate save-dir
  if (!saveDir) {
    console.error('Error: --save-dir is required');
    showUsage();
    process.exit(1);
  }

  // Resolve arnumbers
  let arnumbers = [];

  if (arnFile) {
    arnumbers = loadArnFile(arnFile);
  } else if (rawArn) {
    arnumbers = parseArn(rawArn);
  } else {
    showUsage();
    process.exit(1);
  }

  if (arnumbers.length === 0) {
    console.error('Error: no arnumbers provided');
    process.exit(1);
  }

  // Resolve save directory
  const resolvedSaveDir = path.resolve(saveDir);

  // ── Launch browser and run batch ───────────────────────────────────────
  const { browser } = await launch();
  const batchOptions = { browser };
  if (!isNaN(parallelArg) && parallelArg > 0) {
    batchOptions.parallel = parallelArg;
  }

  const tasks = buildDownloadTasks(arnumbers, resolvedSaveDir, dlTimeout);
  const summary = await runBatch(tasks, batchOptions);

  // ── Output aggregated results ──────────────────────────────────────────
  const output = {
    saveDir: resolvedSaveDir,
    summary: {
      total: summary.total,
      success: summary.success,
      failed: summary.failed,
    },
    results: summary.results,
  };

  console.log(JSON.stringify(output, null, 2));
  await browser.close();
}

// Run when executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('parallel-download.js')
);
if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
