---
tags: [browsers, chrome, cdp]
---

# Chrome DevTools Protocol (CDP)

## 是什么

Chrome DevTools Protocol 是 Chrome/Edge 暴露的调试协议，允许外部工具（如 Playwright、Puppeteer、VS Code）通过 WebSocket 与浏览器通信。

## 核心概念

- **端口：** 浏览器通过 `--remote-debugging-port=<port>` 开启 CDP
- **端点：** `http://localhost:<port>/json/version` 返回浏览器信息
- **WebSocket：** 实际通信通过 `ws://localhost:<port>/devtools/browser/<id>`

## 常用端点

| 端点 | 返回 |
|------|------|
| `GET /json/version` | 浏览器版本信息 + webSocketDebuggerUrl |
| `GET /json/list` | 所有打开的标签页列表 |
| `GET /json/new?url=<url>` | 打开新标签页 |
| `GET /json/close/<id>` | 关闭标签页 |

## Playwright 中的使用

```javascript
// connectOverCDP 内部步骤：
// 1. GET /json/version → 获取 webSocketDebuggerUrl
// 2. WebSocket 连接 → 发送 CDP 命令
// 3. 建立 Browser 对象

const browser = await chromium.connectOverCDP('http://localhost:9222');
```

## 安全考虑

> ⚠️ 任何能访问 CDP 端口的进程都能完全控制浏览器。

- 默认绑定 `127.0.0.1`（仅本机访问）
- 不要绑定 `0.0.0.0`（网络可达）
- 使用随机端口降低风险

## Chrome 自动化限制

从 Chrome 115+ 开始：
- 自动化默认 profile 受到限制
- 需要创建独立 userDataDir
- 详见：https://developer.chrome.com/blog/remote-debugging-port

## 对我们的意义

- CDP 是连接用户浏览器的唯一方式（Chrome/Edge）
- 探测 CDP 端口可达性判断是否可以连接
- 提供脚本帮用户启动带 CDP 的浏览器

## 相关笔记

- [[Playwright connectOverCDP]]
- [[Headless Browser 维基百科]]
