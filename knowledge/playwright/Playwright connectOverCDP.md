---
tags: [playwright, cdp, chrome, edge]
source: https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
retrieved: 2025-07-18
---

# Playwright connectOverCDP

## 是什么

`connectOverCDP` 通过 Chrome DevTools Protocol (CDP) 连接到**已经运行**的浏览器实例。这意味着可以连接到用户正在使用的 Chrome/Edge，而不是启动新实例。

> ⚠️ **仅 Chromium 系浏览器**支持 CDP。Firefox 不支持。

## 基本用法

```javascript
const { chromium } = require('playwright');

// 连接到运行在 localhost:9222 的浏览器
const browser = await chromium.connectOverCDP('http://localhost:9222');

// 获取默认 context（用户的浏览器 session）
const defaultContext = browser.contexts()[0];
const page = defaultContext.pages()[0];  // 用户已打开的标签页

// 或者创建新页面
const newPage = await defaultContext.newPage();
```

## 启动带 CDP 的浏览器

用户需要以 `--remote-debugging-port=<port>` 参数启动浏览器：

### Chrome
```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

### Edge
```bash
# Windows
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
```

## 重要选项

### noDefaults (v1.60+) ⭐

```javascript
const browser = await chromium.connectOverCDP('http://localhost:9222', {
  noDefaults: true  // 不改变用户浏览器状态！
});
```

**`noDefaults: true` 的作用：**
- 不修改下载行为（`acceptDownloads` 保持浏览器设置）
- 不启用焦点模拟
- 不修改媒体模拟选项（`colorScheme`, `reducedMotion`, `forcedColors`, `contrast`）

> ❗ **这是连接用户日常浏览器的关键选项**，避免干扰用户现有状态。

### isLocal (v1.58+)

```javascript
const browser = await chromium.connectOverCDP('http://localhost:9222', {
  isLocal: true  // 告诉 Playwright 运行在同一台机器上，启用文件系统优化
});
```

### 其他选项

```javascript
const browser = await chromium.connectOverCDP('http://localhost:9222', {
  slowMo: 100,           // 减慢 100ms
  timeout: 30000,        // 连接超时
  headers: { ... }       // WebSocket 握手额外头
});
```

## CDP 端口探测

```javascript
// 检查 CDP 是否可用
async function isCDPAvailable(port = 9222) {
  try {
    const resp = await fetch(`http://localhost:${port}/json/version`);
    const data = await resp.json();
    return !!data.webSocketDebuggerUrl;
  } catch (e) {
    return false;
  }
}
```

`http://localhost:<port>/json/version` 返回：
```json
{
  "Browser": "Chrome/149.0.0.0",
  "Protocol-Version": "1.3",
  "User-Agent": "Mozilla/5.0 ...",
  "V8-Version": "...",
  "WebKit-Version": "...",
  "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/<id>"
}
```

## 限制与注意事项

### Chrome 政策限制 ⚠️

> 由于 Chrome 安全政策变化，**不能自动化默认 Chrome profile**。指向 Chrome 主 User Data 目录可能导致页面无法加载或浏览器退出。

**解决方案：**
- 创建独立的自动化 profile 目录
- 或使用用户现有的非默认 profile
- 参考：https://developer.chrome.com/blog/remote-debugging-port

### 与 connect() 的区别

| 特性 | `connectOverCDP` | `connect` (Playwright 协议) |
|------|:---:|:---:|
| 协议 | CDP | Playwright 自定义协议 |
| 浏览器 | 仅 Chromium | 全部 |
| 保真度 | 低 | 高 |
| 连接目标 | 任意运行的浏览器 | Playwright Server |
| 版本要求 | 无 | 主/次版本必须匹配 |

> `connectOverCDP` 保真度更低，但能连接任意浏览器；`connect` 保真度高，但需要 Playwright Server 且版本匹配。

## 对我们项目的意义 ⭐

1. **最佳用户体验方案：** 用户正常使用 Chrome，skill 通过 CDP 连接复用其登录态
2. `noDefaults: true` 确保不干扰用户
3. Chrome 政策限制 → 建议用户创建专用自动化 profile（不影响日常浏览）
4. 需要提供辅助脚本自动启动带 CDP 的浏览器

## 相关笔记

- [[Playwright BrowserType API]]
- [[Playwright launchPersistentContext]]
- [[Chrome DevTools Protocol]]
