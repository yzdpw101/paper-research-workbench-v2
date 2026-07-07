/**
 * credential-page.js — HTML form-based credential input module.
 *
 * Replaces CLI prompt-based credential collection from init-wizard.js
 * with a visual HTML form displayed in the user's browser.
 *
 * Module interface:
 *   generateFormHtml(filePath)  — Generate HTML form file
 *   getFormFields(platform)     — Get platform-specific form field config
 *   run(options)                — Full flow: form → browser → store → cleanup
 *
 * Dependencies: browser-launcher, credential-vault, fs, path, os
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

import { get as configGet } from './config.js';

// ─── Platform field config ─────────────────────────────────────────────────

/**
 * Field configuration for each supported platform.
 *
 * @type {Object<string, { platformLabel: string, institutionPlaceholder: string, institutionPattern: string|null }>}
 */
const PLATFORM_FIELDS = Object.freeze({
  ieee: {
    platformLabel: 'IEEE',
    institutionPlaceholder: '请输入英文机构名（如 Tsinghua University），大小写需与 CARSI 一致',
    institutionPattern: '[A-Za-z .\\-]+',
  },
  wanfang: {
    platformLabel: '万方',
    institutionPlaceholder: 'e.g. 清华大学',
    institutionPattern: null,
  },
});

// ─── HTML template ─────────────────────────────────────────────────────────

/**
 * Build the full HTML form document.
 *
 * @returns {string} HTML content
 */
function buildFormHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>凭据输入</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f5f7fa; display: flex; justify-content: center;
    align-items: center; min-height: 100vh; color: #333;
  }
  .container {
    background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1);
    padding: 40px; width: 440px; max-width: 90vw;
  }
  h1 { font-size: 22px; margin-bottom: 28px; color: #1a1a2e; text-align: center; }
  .form-group { margin-bottom: 20px; }
  label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; color: #555; }
  select, input {
    width: 100%; padding: 10px 14px; border: 1px solid #d0d5dd;
    border-radius: 8px; font-size: 15px; transition: border-color 0.2s;
    background: #fff; color: #333;
  }
  select:focus, input:focus { outline: none; border-color: #4a6cf7; box-shadow: 0 0 0 3px rgba(74,108,247,0.15); }
  button {
    width: 100%; padding: 12px; background: #4a6cf7; color: #fff;
    border: none; border-radius: 8px; font-size: 16px; font-weight: 600;
    cursor: pointer; transition: background 0.2s; margin-top: 8px;
  }
  button:hover { background: #3b5de7; }
  button:disabled { background: #a0aec0; cursor: not-allowed; }
  #result {
    margin-top: 20px; padding: 14px; background: #f0fff4; border: 1px solid #68d391;
    border-radius: 8px; font-size: 13px; word-break: break-all; display: none;
  }
  .hint { font-size: 12px; color: #888; margin-top: 4px; }
  .error { color: #e53e3e; font-size: 13px; margin-top: 4px; display: none; }
</style>
</head>
<body>
<div class="container">
  <h1>📋 凭据输入</h1>
  <form id="credentialForm" onsubmit="return false;">
    <div class="form-group">
      <label for="platform">平台</label>
      <select id="platform" onchange="onPlatformChange()">
        <option value="ieee">IEEE</option>
        <option value="wanfang">万方</option>
      </select>
    </div>
    <div class="form-group">
      <label for="institution">机构名称</label>
      <input type="text" id="institution"
        placeholder="请输入英文机构名（如 Tsinghua University）"
        pattern="[A-Za-z .\\-]+"
        title="请输入英文机构名称，大小写需与 CARSI 一致"
        required>
      <div class="hint" id="instHint">请输入英文机构名，大小写需与 CARSI 一致</div>
    </div>
    <div class="form-group">
      <label for="username">账号</label>
      <input type="text" id="username" placeholder="username / email" required>
    </div>
    <div class="form-group">
      <label for="password">密码</label>
      <input type="password" id="password" placeholder="••••••••" required>
    </div>
    <div id="errorMsg" class="error"></div>
    <button type="button" id="saveBtn" onclick="onSave()">保存</button>
    <button type="button" id="exitBtn" onclick="onExit()" style="background:#999;margin-top:10px;">退出</button>
  </form>
  <div id="result"></div>
</div>

<script>
  var PLATFORM_DATA = {
    ieee: { placeholder: '请输入英文机构名（如 Tsinghua University）', hint: '请输入英文机构名，大小写需与 CARSI 一致', pattern: '[A-Za-z .\\\\-]+' },
    wanfang: { placeholder: 'e.g. 清华大学', hint: '请输入中文机构名称', pattern: null },
  };

  function onPlatformChange() {
    var platform = document.getElementById('platform').value;
    var info = PLATFORM_DATA[platform] || PLATFORM_DATA.ieee;
    var instInput = document.getElementById('institution');
    var instHint = document.getElementById('instHint');

    instInput.placeholder = info.placeholder;
    instHint.textContent = info.hint;

    if (info.pattern) {
      instInput.pattern = info.pattern;
      instInput.title = '请输入英文机构名称';
    } else {
      instInput.removeAttribute('pattern');
      instInput.title = '';
    }
  }

  function onSave() {
    var platform = document.getElementById('platform').value;
    var institution = document.getElementById('institution').value.trim();
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;
    var errorEl = document.getElementById('errorMsg');
    var saveBtn = document.getElementById('saveBtn');
    var resultEl = document.getElementById('result');

    // Validate
    if (!username || !password) {
      errorEl.textContent = '账号和密码不能为空';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    // Disable button to prevent double-submit
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    var data = {
      platform: platform,
      institution: institution,
      username: username,
      password: password
    };

    var platformLabel = platform === 'ieee' ? 'IEEE' : '万方';

    if (typeof window.__saveCredentials === 'function') {
      window.__saveCredentials(data).then(function() {
        resultEl.textContent = '✓ ' + platformLabel + ' 凭据已保存';
        resultEl.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }).catch(function(e) {
        console.error('Save failed:', e);
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      });
    }
  }

  function onExit() {
    if (typeof window.__exitForm === 'function') {
      window.__exitForm();
    } else {
      window.close();
    }
  }
</script>
</body>
</html>`;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get form field configuration for a platform.
 *
 * @param {string} platform — 'ieee' or 'wanfang'
 * @returns {{ platformLabel: string, institutionPlaceholder: string, institutionPattern: string|null }}
 * @throws {Error} If platform is unknown
 */
export function getFormFields(platform) {
  const fields = PLATFORM_FIELDS[platform];
  if (!fields) {
    throw new Error(`Unknown platform: ${platform}. Supported: ${Object.keys(PLATFORM_FIELDS).join(', ')}`);
  }
  return { ...fields };
}

/**
 * Generate the credential input HTML form and write it to the given path.
 *
 * @param {string} filePath — Absolute path to write the HTML file
 * @returns {Promise<string>} The file path written
 */
export async function generateFormHtml(filePath) {
  const html = buildFormHtml();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, html, 'utf-8');
  return filePath;
}

/**
 * Run the credential input page flow.
 *
 * Steps:
 *   1. Configure credential vault (master key + path)
 *   2. Generate HTML form to a temporary directory
 *   3. Launch browser (headless: false) and navigate to the form
 *   4. Expose __saveCredentials + __exitForm functions
 *   5. Wait for user to close the browser (Exit button or window close)
 *   6. Print summary of all saved platforms
 *   7. Clean up: close browser, remove temp file
 *
 * @param {object} [options]
 * @param {string} [options.tmpDir] — Override temp directory (for testing)
 * @returns {Promise<{ success: boolean, platforms?: string[], error?: string }>}
 */
export async function run(options = {}) {
  // Resolve directories
  const stateDir = path.resolve(PROJECT_ROOT, '.state');
  const tmpDir = options.tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'cred-page-'));

  let htmlFilePath;
  let launchResult;

  try {
    // ─── Step 1: Configure credential vault ──────────────────────────────

    // ─── Resolve master key: env → .state/master-key → readline → error ──
    let masterKey = process.env.PAPER_MASTER_KEY;

    if (!masterKey) {
      const masterKeyPath = path.join(stateDir, 'master-key');
      if (fs.existsSync(masterKeyPath)) {
        masterKey = fs.readFileSync(masterKeyPath, 'utf-8').trim();
      }
    }

    if (!masterKey) {
      // Only prompt interactively when stdin is a TTY
      try {
        if (!process.stdin.isTTY) throw new Error('Not a TTY');
        const { createInterface } = await import('node:readline');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        masterKey = await new Promise((resolve) => {
          rl.question('请输入主密码 (PAPER_MASTER_KEY): ', (answer) => {
            resolve(answer.trim());
            rl.close();
          });
        });
      } catch { /* not interactive — fall through to error */ }
    }

    if (!masterKey) {
      return {
        success: false,
        error:
          'PAPER_MASTER_KEY 环境变量未设置。请通过以下方式设置：\n' +
          '  Linux/Mac:  export PAPER_MASTER_KEY="your-key"\n' +
          '  Windows:     set PAPER_MASTER_KEY=your-key\n' +
          '  PowerShell:  $env:PAPER_MASTER_KEY="your-key"\n' +
          '或者先运行 node scripts/init-wizard.js 完成初始化设置。',
      };
    }

    const { setMasterKey, setVaultPath, store } = await import('./credential-vault.js');
    setMasterKey(masterKey);
    const vaultFilePath = path.join(stateDir, 'credentials.json.enc');
    setVaultPath(vaultFilePath);

    // ─── Step 2: Generate HTML form ──────────────────────────────────────

    htmlFilePath = path.join(tmpDir, 'credential-form.html');
    await generateFormHtml(htmlFilePath);

    // Convert to file:// URL for browser navigation
    const fileUrl = 'file://' + htmlFilePath.replace(/\\/g, '/');

    // ─── Step 3: Launch browser ──────────────────────────────────────────

    const { launch } = await import('./browser-launcher.js');
    launchResult = await launch({
      browser: configGet('browser.default') || process.env.PAPER_BROWSER || 'firefox',
      headless: false,
      noKill: true,
    });

    const { browser, context, page } = launchResult;

    // ─── Step 4: Expose credential functions ────────────────────────────

    const savedPlatforms = [];

    await page.exposeFunction('__saveCredentials', async (data) => {
      const { platform, institution, username, password } = data;
      await store(platform, {
        institution: institution || '',
        username,
        password,
        notes: 'Set up via credential-page',
        updatedAt: new Date().toISOString(),
      });
      savedPlatforms.push(platform);
    });

    await page.exposeFunction('__exitForm', async () => {
      try { await page.close(); } catch { /* ignore */ }
    });

    // ─── Step 5: Navigate to form ────────────────────────────────────────

    await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 15000 });

    console.log('\n  ═══════════════════════════════════════════════════');
    console.log('  请在浏览器窗口中填写凭据，保存后自动关闭');
    console.log('  ═══════════════════════════════════════════════════\n');

    // ─── Step 6: Wait for user to close the browser ──────────────────────

    await new Promise((resolve) => {
      page.on('close', () => resolve());
    });

    // ─── Step 7: Print summary ───────────────────────────────────────────

    for (const p of savedPlatforms) {
      const label = p === 'ieee' ? 'IEEE' : '万方';
      console.log(`  ✓ ${label} credentials saved.`);
    }

    // ─── Step 8: Clean up ────────────────────────────────────────────────

    // Close context and browser
    try { await context.close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }

    // Remove temp HTML file
    if (htmlFilePath && fs.existsSync(htmlFilePath)) {
      fs.rmSync(htmlFilePath, { force: true });
    }

    // Remove tmpDir if we created it and it's empty
    if (!options.tmpDir && fs.existsSync(tmpDir)) {
      try {
        const remaining = fs.readdirSync(tmpDir);
        if (remaining.length === 0) {
          fs.rmdirSync(tmpDir);
        }
      } catch { /* ignore */ }
    }

    // ─── Step 9: Return result ───────────────────────────────────────────

    return {
      success: savedPlatforms.length > 0,
      platforms: savedPlatforms,
    };
  } catch (err) {
    // Clean up on error
    if (htmlFilePath && fs.existsSync(htmlFilePath)) {
      try { fs.rmSync(htmlFilePath, { force: true }); } catch { /* ignore */ }
    }
    if (!options.tmpDir && tmpDir && fs.existsSync(tmpDir)) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    // Close browser on error
    if (launchResult) {
      try { await launchResult.page.close(); } catch { /* ignore */ }
      try { await launchResult.context.close(); } catch { /* ignore */ }
      try { await launchResult.browser.close(); } catch { /* ignore */ }
    }

    return { success: false, error: err.message };
  }
}

// ─── CLI entry point ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && (process.argv[1] === __filename || path.resolve(process.argv[1]) === path.resolve(__filename))) {
  (async () => {
    try {
      const result = await run();
      console.log(JSON.stringify(result, null, 2));
      if (!result.success) process.exitCode = 1;
    } catch (err) {
      console.error('credential-page error:', err);
      process.exitCode = 1;
    }
  })();
}
