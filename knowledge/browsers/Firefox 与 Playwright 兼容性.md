---
tags: [browsers, firefox]
---

# Firefox 与 Playwright 兼容性

## 关键事实

- Playwright 的 Firefox 基于 Firefox Stable，但包含 **Playwright 专用补丁**
- **不支持**连接系统安装的 Firefox（因为需要补丁）
- 必须通过 `npx playwright install firefox` 安装 Playwright 专用版

## Firefox 的限制

### 不支持 CDP

Firefox 使用自己的远程调试协议（非 CDP），因此：
- ❌ `connectOverCDP()` — 不支持
- ❌ CDP 端口探测 — 不适用
- ✅ `launchServer()` + `connect()` — 替代方案（Playwright 协议）

### Firefox 连接方案

```javascript
// 服务端 — 启动 Playwright Firefox Server
const browserServer = await firefox.launchServer({
  headless: false,
  port: 3000
});
console.log(browserServer.wsEndpoint());

// 客户端 — 连接到 Server
const browser = await firefox.connect(browserServer.wsEndpoint());
```

> ⚠️ `connect()` 要求 Playwright 版本匹配（主版本.次版本）

### 不支持的特性

- ❌ Chrome Extensions（仅 Chromium 支持）
- ❌ CDP Session（`browserContext.newCDPSession()`）
- ❌ Service Workers 事件
- ⚠️ `isMobile` 选项不支持
- ⚠️ 媒体编解码器因平台而异

## Firefox 的优势

- ✅ 隐私保护更严格（减少追踪）
- ✅ 对学术网站可能更友好（反自动化检测较弱）
- ✅ 支持 `launchPersistentContext`（持久化 profile）
- ✅ 支持 `storageState`（与 Chromium 一致）

## 对我们项目的建议

1. **主推 Chrome/Edge** — CDP 连接用户浏览器
2. **Firefox 作为备选** — 使用 `launchPersistentContext` 独立模式
3. 暂不为 Firefox 实现用户浏览器连接功能
4. 如果用户偏好 Firefox，使用持久化 profile + storageState

## 相关笔记

- [[Playwright connectOverCDP]]
- [[Playwright launchPersistentContext]]
- [[Playwright Browser 管理]]
