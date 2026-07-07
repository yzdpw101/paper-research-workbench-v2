---
tags: [playwright, browser-type, api]
source: https://playwright.dev/docs/api/class-browsertype
retrieved: 2025-07-18
---

# Playwright BrowserType API

## 核心方法

### `launch(options)` — 启动浏览器

```javascript
const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',        // 使用系统 Chrome
  slowMo: 100,
  args: ['--no-sandbox']
});
// 返回 Browser 实例
```

### `launchPersistentContext(userDataDir, options)` — 持久化启动

→ 详见 [[Playwright launchPersistentContext]]

### `connectOverCDP(endpointURL, options)` — CDP 连接

→ 详见 [[Playwright connectOverCDP]]

### `connect(wsEndpoint)` — Playwright 协议连接

```javascript
const browserServer = await chromium.launchServer();
const wsEndpoint = browserServer.wsEndpoint();
// ... 稍后连接 ...
const browser = await chromium.connect(wsEndpoint);
```

> 要求 Playwright 版本匹配（1.2.3 ↔ 1.2.x）

### `launchServer(options)` — 启动浏览器服务

```javascript
const browserServer = await chromium.launchServer({
  headless: false,
  port: 3000
});
console.log(browserServer.wsEndpoint());
// → ws://127.0.0.1:3000/xxx
```

### `executablePath()` — 浏览器可执行文件路径

```javascript
console.log(chromium.executablePath());
// → C:\Users\...\AppData\Local\ms-playwright\chromium-1194\chrome-win\chrome.exe
```

### `name()` — 浏览器名称

```javascript
console.log(chromium.name());  // → 'chromium'
```

## 启动选项速查

| 选项 | 类型 | 用途 |
|------|------|------|
| `headless` | boolean | 无头模式 |
| `channel` | string | 使用系统浏览器 |
| `executablePath` | string | 自定义浏览器路径 |
| `args` | string[] | 浏览器启动参数 |
| `proxy` | object | 代理设置 |
| `downloadsPath` | string | 下载目录 |
| `slowMo` | number | 操作延迟（调试用） |
| `timeout` | number | 启动超时（默认 30s） |
| `firefoxUserPrefs` | object | Firefox about:config 偏好 |
| `env` | object | 环境变量 |

## 对我们项目的意义

- `launch()` + `launchPersistentContext()` + `connectOverCDP()` 三选一
- `executablePath()` 用于检测浏览器是否安装
- `launchServer()` + `connect()` = Firefox 的 CDP 替代方案

## 相关笔记

- [[Playwright 概述]]
- [[Playwright Browser 管理]]
- [[Playwright connectOverCDP]]
- [[Playwright launchPersistentContext]]
