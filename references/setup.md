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
10. Write `.state/.setup-done`

> **Master key**: First run asks you to set a master key (entered twice for confirmation). Only provided via PAPER_MASTER_KEY env var. Not stored on disk.

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

Set via environment variables (no config file needed):

```bash
# Default browser (firefox / chrome / msedge)
export PAPER_BROWSER_DEFAULT=firefox      # Linux/Mac
set PAPER_BROWSER_DEFAULT=firefox          # Windows CMD
$env:PAPER_BROWSER_DEFAULT="firefox"      # PowerShell
```

Or override per-command with `--browser`: `node scripts/wf-download.js --browser chrome ...`

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
1. Open Chrome/Edge with CDP: `"${SKILL_DIR}/scripts/launch-cdp.js" chrome 9222`
2. Log into IEEE/Wanfang manually in the opened browser
3. All subsequent commands use `--mode cdp` to reuse the session

### Step 5: Mark setup complete

```
echo "" > ".state/.setup-done"
```

## CDP mode (non-institutional network)

CDP (Chrome DevTools Protocol) allows connecting to a user's already-running browser, sharing login state, proxy/VPN settings.

### Launch browser with CDP

```
# Chrome
"${SKILL_DIR}/scripts/launch-cdp.js" chrome 9222

# Edge
"${SKILL_DIR}/scripts/launch-cdp.js" edge 9222

# Custom user data dir (optional)
"${SKILL_DIR}/scripts/launch-cdp.js" chrome 9222 "C:\path\to\custom\profile"
```

### Use CDP in commands

Add `--mode cdp` to any command:

```
node "${SKILL_DIR}/scripts/ieee-search.js" --q "machine learning" --mode cdp
node "${SKILL_DIR}/scripts/wf-download.js" --q "人工智能" --type thesis --idx 0 --mode cdp
```

> **Note**: CDP only works with Chrome/Edge. Firefox does not support CDP. On non-institutional networks with Firefox, you'll get a clear error message suggesting to switch browsers.

## Network modes

|  Mode | Typical scenario | Recommended browser | Auth method  |
| ------|-----------------|---------------------|------------- |
|  `institutional` | On campus / IP-authenticated | Firefox, Chrome, Edge | IP auto-auth  |
|  `non-institutional` | Home / VPN / public WiFi | Chrome, Edge | CDP + manual login  |

Change network mode via environment variable:
```
# Force institutional mode
PAPER_BROWSER_NETWORK_MODE=institutional node "${SKILL_DIR}/scripts/ieee-search.js" --q "..."

# Force non-institutional mode
PAPER_BROWSER_NETWORK_MODE=non-institutional node "${SKILL_DIR}/scripts/wf-search.js" --q "..."
```

## Switching default browser

Set `PAPER_BROWSER_DEFAULT` env var to `chrome`, `firefox`, or `msedge`

Or temporarily override on any command:
```
node "${SKILL_DIR}/scripts/ieee-search.js" --browser chrome --q "..."
node "${SKILL_DIR}/scripts/wf-search.js" --browser msedge --q "..."
```

## Key paths

|  Path | Purpose  |
| ------|--------- |

|  `.state/.browser` | Default browser (legacy, overwritten by config)  |
|  `.state/.setup-done` | Setup sentinel  |

|  `.state/downloads` | Download directory  |
|  `.state/profiles/<browser>/` | Persistent browser profiles  |
|  `.state/credentials.json.enc` | Encrypted credentials (AES-256-GCM)  |
|  `.state/sessions/<platform>.json` | Login sessions with 24h TTL  |

## Credential security

All credentials are encrypted with **AES-256-GCM** using PBKDF2 (100,000 iterations). Each service has an independent salt. The master key is only provided via PAPER_MASTER_KEY env var and never stored on disk.

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
|  CDP connection refused | CDP browser not running | Run `launch-cdp.js chrome` or `launch-cdp.js edge` first  |
|  SSL certificate error (Firefox + CARSI) | Firefox blocks self-signed certs | Switch to Chrome/Edge for CARSI login  |
|  `network-detector` returns `public` but on campus | Network detection heuristics failed | Set `networkMode: "institutional"` manually  |
|  Page redirected to `verify?ip=` | Captcha challenge | `network-detector` returns `captcha` type — user must complete manually  |
|  Node.js not installed | Missing runtime | Install from https://nodejs.org (v18+ required)  |
|  Script fails with `ERR_CONNECTION_CLOSED` / `ERR_TIMED_OUT` | Network instability | `navigator.js` auto-retries once after 3s  |

