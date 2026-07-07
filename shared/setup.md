# First-time Setup (v2)

检查 `.state/.setup-done` 是否存在。存在 → 跳过。不存在 → 按以下步骤引导，完成后创建该文件。

## Quick start (recommended)

Interactive wizard handles everything — browser detection, installation, configuration, network questionnaire:

```
node "${SKILL_DIR}/scripts/init-wizard.js"
```

The wizard will:
1. Check Node.js version + Playwright installation
2. Detect system browsers (Chrome registry, Edge registry, Firefox path)
3. Detect Playwright browsers (`npx playwright install --list`)
4. Interactive browser selection (shows only detected + installable options)
5. Auto-install browser if needed (`npx playwright install <browser>`)
6. Launch test to verify browser works
7. Network questionnaire: institutional network? → `networkMode='institutional'`; non-institutional → recommends CDP mode
8. Optional: store IEEE/Wanfang credentials (encrypted via AES-256-GCM)
9. Optional: enable CDP connection mode (Chrome/Edge only)
10. Write `.state/config.json` (full template with all fields + comments) + `.state/.browser` + `.state/.setup-done`

> **Master key**: First run asks you to set a master key (entered twice for confirmation). Stored locally in `.state/master-key`. Subsequent sessions read automatically — no need to re-enter.

## Manual setup (if wizard unavailable)

### Step 1: Install dependencies

```
npm install playwright
```

> `npm install playwright` installs the Node.js package. Browser binaries need separate install:
> ```bash
> npx playwright install firefox    # Firefox only
> npx playwright install chromium   # Chromium (optional — Chrome/Edge use system installs)
> ```

### Step 2: Configure default browser

Edit `.state/config.json` (created automatically on first run):

```json
{
  "version": 2,
  "browser": {
    "default": "firefox",
    "mode": "launch",
    "cdpPort": 9222,
    "headless": true,
    "networkMode": "institutional",
    "allowNonInstitutionalFirefox": false
  }
}
```

Or create `.state/.browser` with a single line: `firefox`, `chrome`, or `msedge`.

### Step 3: Verify environment

```
node "${SKILL_DIR}/scripts/eval.js" \
  --url "https://ieeexplore.ieee.org" \
  --code "document.title" \
  --timeout 15000
```

Should return `{"success":true,...,"result":"IEEE Xplore"}`.

### Step 4: Login (if needed)

If on institutional network (IP auth): no login needed — access is automatic.

If on non-institutional network:
1. Open Chrome/Edge with CDP: `"${SKILL_DIR}/scripts/open-chrome-cdp.bat" 9222`
2. Log into IEEE/Wanfang manually in the opened browser
3. All subsequent commands use `--connect-existing --cdp-port 9222` to reuse the session

### Step 5: Mark setup complete

```
echo "" > ".state/.setup-done"
```

## CDP mode (non-institutional network)

CDP (Chrome DevTools Protocol) allows connecting to a user's already-running browser, sharing login state, proxy/VPN settings.

### Launch browser with CDP

```
# Chrome
"${SKILL_DIR}/scripts/open-chrome-cdp.bat" 9222

# Edge
"${SKILL_DIR}/scripts/open-edge-cdp.bat" 9222

# Custom user data dir (optional)
"${SKILL_DIR}/scripts/open-chrome-cdp.bat" 9222 "C:\path\to\custom\profile"
```

### Use CDP in commands

Add `--connect-existing --cdp-port 9222` to any command:

```
node "${SKILL_DIR}/scripts/ieee-search.js" --q "machine learning" --connect-existing --cdp-port 9222
node "${SKILL_DIR}/scripts/wf-download.js" --q "人工智能" --type thesis --idx 0 --connect-existing
```

> **Note**: CDP only works with Chrome/Edge. Firefox does not support CDP. On non-institutional networks with Firefox, you'll get a clear error message suggesting to switch browsers.

## Network modes

|  Mode | Typical scenario | Recommended browser | Auth method  |
| ------|-----------------|---------------------|------------- |
|  `institutional` | On campus / IP-authenticated | Firefox, Chrome, Edge | IP auto-auth  |
|  `non-institutional` | Home / VPN / public WiFi | Chrome, Edge | CDP + manual login  |

Change network mode in `.state/config.json` (`browser.networkMode`) or via environment variable:
```
# Force institutional mode
PAPER_BROWSER_NETWORK_MODE=institutional node "${SKILL_DIR}/scripts/ieee-search.js" --q "..."

# Force non-institutional mode
PAPER_BROWSER_NETWORK_MODE=non-institutional node "${SKILL_DIR}/scripts/wf-search.js" --q "..."
```

## Switching default browser

Edit `.state/config.json` → `browser.default` → `"chrome"` / `"firefox"` / `"msedge"`

Or temporarily override on any command:
```
node "${SKILL_DIR}/scripts/ieee-search.js" --browser chrome --q "..."
node "${SKILL_DIR}/scripts/wf-search.js" --browser msedge --q "..."
```

## Key paths

|  Path | Purpose  |
| ------|--------- |
|  `.state/config.json` | Master configuration (full template with comments)  |
|  `.state/.browser` | Default browser (legacy, overwritten by config)  |
|  `.state/.setup-done` | Setup sentinel  |
|  `.state/master-key` | Cached master key hash  |
|  `.state/downloads` | Download directory  |
|  `.state/profiles/<browser>/` | Persistent browser profiles  |
|  `.state/credentials.json.enc` | Encrypted credentials (AES-256-GCM)  |
|  `.state/sessions/<platform>.json` | Login sessions with 24h TTL  |

## Credential security

All credentials are encrypted with **AES-256-GCM** using PBKDF2 (100,000 iterations). Each service has an independent salt. The master key is stored locally in `.state/master-key` and never uploaded to any server.

Before credential storage, the wizard prints:
> "你的凭据将用 AES-256-GCM 加密存储在当前设备。主密码不会上传到任何服务器。"

## Troubleshooting

|  Symptom | Likely cause | Action  |
| ---------|-------------|-------- |
|  `Error: Cannot find module 'playwright'` | Dependencies not installed | `npm install playwright`  |
|  `Firefox not found` | Browser binary not downloaded | `npx playwright install firefox`  |
|  Login state lost | Cookie expired | Delete `.state/profiles/<browser>/` and re-login  |
|  Chrome launch failed | System Chrome not installed | Install Chrome or use `--browser firefox`  |
|  `Firefox not supported on non-institutional network` | Using Firefox outside campus | Switch to Chrome/Edge + CDP mode  |
|  CDP connection refused | CDP browser not running | Run `open-chrome-cdp.bat` or `open-edge-cdp.bat` first  |
|  SSL certificate error (Firefox + CARSI) | Firefox blocks self-signed certs | Switch to Chrome/Edge for CARSI login  |
|  `network-detector` returns `public` but on campus | Network detection heuristics failed | Set `networkMode: "institutional"` manually  |
|  Page redirected to `verify?ip=` | Captcha challenge | `network-detector` returns `captcha` type — user must complete manually  |
|  Node.js not installed | Missing runtime | Install from https://nodejs.org (v18+ required)  |
|  Script fails with `ERR_CONNECTION_CLOSED` / `ERR_TIMED_OUT` | Network instability | `navigator.js` auto-retries once after 3s  |

**Core principle**: one failure = diagnose + communicate, never retry endlessly.

## After setup — downloading papers

Setup 完成后，下载论文的流程取决于网络环境：

### 机构网络（校园网/VPN）
直接下载，无需额外步骤：
```
node "${SKILL_DIR}/scripts/wf-download.js" --q "关键词" --type thesis --idx 0 --save-as "./paper.pdf"
```

### 非机构网络
需要 CDP Chrome + CARSI 凭据登录：
1. 启动 CDP Chrome：`scripts/open-chrome-cdp.bat`
2. 设 master key：`PAPER_MASTER_KEY=<从 .state/master-key 读取>`
3. 下载（脚本自动完成 CARSI 登录）：
```
PAPER_MASTER_KEY=<key> node "${SKILL_DIR}/scripts/wf-download.js" --q "关键词" --type thesis --idx 0 --save-as "./paper.pdf"
```

> **搜索不需要登录**。`wf-search.js` 无登录逻辑，任何网络环境直接可用。
