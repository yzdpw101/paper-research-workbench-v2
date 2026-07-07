---
tags: [playwright, browsers]
source: https://playwright.dev/docs/browsers
retrieved: 2025-07-18
---

# Playwright Browser 管理

## 浏览器安装

```bash
npx playwright install              # 安装默认浏览器 (Chromium, Firefox, WebKit)
npx playwright install chromium     # 只装 Chromium
npx playwright install firefox      # 只装 Firefox
npx playwright install msedge       # 安装 Microsoft Edge
npx playwright install chrome       # 安装 Google Chrome
npx playwright install --with-deps  # 含系统依赖
```

## 浏览器类型

| 浏览器 | Playwright 引擎 | channel 参数 | 安装方式 |
|--------|:---:|------|------|
| Chromium | `chromium` | `'chromium'` (新 headless) | `npx playwright install chromium` |
| Google Chrome | `chromium` | `'chrome'` | 系统自带或 `npx playwright install chrome` |
| Microsoft Edge | `chromium` | `'msedge'` | Windows 自带或 `npx playwright install msedge` |
| Firefox | `firefox` | — | `npx playwright install firefox` |
| WebKit | `webkit` | — | `npx playwright install webkit` |

## 关键差异

### Chromium vs Chrome

- Playwright 默认使用开源 Chromium（版本领先 Chrome 几周）
- 使用 `channel: 'chrome'` 使用系统安装的 Google Chrome
- Chrome/Edge 有专有媒体编解码器（H.264, AAC），Chromium 没有
- Chrome/Edge 受企业策略影响

### Firefox

- Playwright 的 Firefox 基于 Firefox Stable，但包含 Playwright 补丁
- **不支持** 系统安装的品牌 Firefox（因为需要补丁）
- 使用 `npx playwright install firefox` 安装 Playwright 专用版

### WebKit

- Playwright 的 WebKit 版本领先 Safari
- 在 Linux CI 上运行最经济，但 macOS 上最接近 Safari 体验

## Headless 模式

```javascript
// headless: true (默认)
const browser = await chromium.launch();

// headed 模式
const browser = await chromium.launch({ headless: false });

// Chromium 新 headless 模式（更接近真实浏览器）
const browser = await chromium.launch({ channel: 'chromium' });
```

> **注意：** Playwright 1.60+ 支持 `channel: 'chromium'` 使用 Chromium 的新 headless 模式。

## 浏览器缓存路径

- Windows: `%USERPROFILE%\AppData\Local\ms-playwright`
- macOS: `~/Library/Caches/ms-playwright`
- Linux: `~/.cache/ms-playwright`

可通过环境变量 `PLAYWRIGHT_BROWSERS_PATH` 自定义。

## 代理安装

```bash
HTTPS_PROXY=https://proxy:8080 npx playwright install
PLAYWRIGHT_DOWNLOAD_HOST=http://mirror.local npx playwright install
```

## 对我们的意义

- 使用 `channel: 'chrome'` 和 `channel: 'msedge'` 利用系统自带浏览器
- 使用 `channel: 'chromium'` 获得新 headless 模式支持 Chrome Extensions
- Firefox 必须用 Playwright 专用版（`npx playwright install firefox`）
- 非机构网络用户：headless 模式不可用（需要交互式登录），保留 headed

## 相关笔记

- [[Playwright 概述]]
- [[Playwright connectOverCDP]]
- [[Playwright launchPersistentContext]]
- [[Chrome DevTools Protocol]]
- [[Firefox 与 Playwright 兼容性]]
