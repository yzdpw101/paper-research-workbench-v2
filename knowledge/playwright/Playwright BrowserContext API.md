---
tags: [playwright, api, browser-context]
source: https://playwright.dev/docs/api/class-browsercontext
retrieved: 2025-07-18
---

# Playwright BrowserContext API

## 核心概念

BrowserContext 提供隔离的浏览器会话，类似无痕窗口。每个 context 有独立的 cookies、localStorage、IndexedDB。

## 关键方法

### storageState（保存认证状态）

```javascript
// 保存到文件
await context.storageState({ path: 'state.json' });

// 包含 IndexedDB（Firebase Auth 等）
await context.storageState({ path: 'state.json', indexedDB: true });
```

### setStorageState（设置认证状态）⭐ v1.59+

```javascript
// 清除现有状态并设置新状态
await context.setStorageState('state.json');
```

> **重要性：** 无需创建新 context 即可替换认证状态，比 `newContext({ storageState })` 更高效。

### addCookies / cookies / clearCookies

```javascript
await context.addCookies([
  { name: 'session', value: 'abc', domain: 'example.com', path: '/' }
]);
const cookies = await context.cookies('https://example.com');
await context.clearCookies();
```

### addInitScript

```javascript
// 在所有页面加载前注入脚本
await context.addInitScript(() => {
  // 覆盖 navigator 属性
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
```

### route（网络拦截）

```javascript
// 拦截所有图片请求
await context.route('**/*.{png,jpg,jpeg}', route => route.abort());

// 修改响应
await context.route('**/api/**', route => {
  route.fulfill({ body: JSON.stringify({ mock: true }) });
});
```

### request（API 测试）

```javascript
// 使用 context 的 cookies 发 HTTP 请求
const response = await context.request.get('https://api.example.com/data');
const data = await response.json();
```

### setExtraHTTPHeaders

```javascript
await context.setExtraHTTPHeaders({
  'X-Custom-Header': 'value'
});
```

### setDefaultTimeout / setDefaultNavigationTimeout

```javascript
context.setDefaultTimeout(30000);           // 所有操作默认超时
context.setDefaultNavigationTimeout(60000);  // 导航默认超时
```

## 重要事件

| 事件 | 触发时机 |
|------|---------|
| `page` | 新页面创建（含 popup） |
| `close` | Context 关闭 |
| `download` | 下载开始 ⭐ v1.60+ |
| `dialog` | alert/confirm/prompt |
| `request` / `response` | 网络请求/响应 |
| `console` | console.log 等调用 |

## Context 隔离

```javascript
// 两个完全隔离的 session
const ctx1 = await browser.newContext();
const ctx2 = await browser.newContext();

const page1 = await ctx1.newPage();
const page2 = await ctx2.newPage();

// page1 和 page2 的 cookies/localStorage 完全独立
```

## 对我们的意义

- `storageState()` + `setStorageState()` = 登录态管理的核心
- `addInitScript()` = 反检测（隐藏 webdriver 标记）
- `route()` = 可拦截广告/追踪，加速页面加载
- `on('download')` = IEEE PDF 下载监控
- `request` = 直接 HTTP 请求替代页面导航

## 相关笔记

- [[Playwright Authentication]]
- [[Playwright BrowserType API]]
- [[Playwright launchPersistentContext]]
