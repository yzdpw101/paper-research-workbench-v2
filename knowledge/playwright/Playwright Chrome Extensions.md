---
tags: [playwright, chrome-extensions]
source: https://playwright.dev/docs/chrome-extensions
retrieved: 2025-07-18
---

# Playwright Chrome Extensions

## 是什么

Playwright 支持在 **Chromium** 中加载自定义 Chrome 扩展进行测试。这使用 `launchPersistentContext` + `--load-extension` 参数。

> ❌ **这不是** Playwright 安装一个扩展到用户浏览器。
> ✅ **这是** 加载你自己的扩展（如正在开发的插件）到 Playwright 控制的 Chromium 中。

## 关键限制

- **仅 Chromium** 支持（使用 `channel: 'chromium'`）
- **必须使用持久化 context**（`launchPersistentContext`）
- Google Chrome 和 Edge 已**移除**侧载扩展的命令行参数（安全原因）
- 仅 Playwright 捆绑的 Chromium 可用（`channel: 'chromium'`）

## 用法示例

```javascript
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',  // 必须用 Playwright 的 Chromium
  args: [
    `--disable-extensions-except=${pathToExtension}`,
    `--load-extension=${pathToExtension}`
  ]
});

// 访问扩展的 service worker
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');

// 打开扩展弹窗
const page = await context.newPage();
await page.goto(`chrome-extension://${extensionId}/popup.html`);
```

## MV3 Service Worker 空闲挂起

Chrome MV3 扩展的 service worker 在 ~30 秒无活动后自动挂起。Playwright 透明处理重启。

## 对我们的意义

> **结论：Playwright Chrome Extensions 功能对我们没有帮助。**

原因：
1. 我们的目标不是测试扩展，而是复用用户浏览器的登录态
2. `connectOverCDP` 已经可以连接用户浏览器
3. Playwright 没有官方扩展用于"增强权限"
4. 用户提到的"Chrome 里的 Playwright 扩展"可能是误解

如果用户确实安装了某个 Playwright 相关的 Chrome 扩展：
- 这可能是 Playwright MCP 或 Playwright Test 的扩展
- 这些扩展用于测试辅助（选择器生成等），不增加浏览器控制权限
- 不影响我们的架构设计

## 相关笔记

- [[Playwright connectOverCDP]]
- [[Playwright launchPersistentContext]]
- [[Playwright Browser 管理]]
