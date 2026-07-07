---
tags: [playwright, auth, security]
source: https://playwright.dev/docs/auth
retrieved: 2025-07-18
---

# Playwright Authentication

## 核心概念

Playwright 在隔离的 **Browser Context** 中执行操作。认证状态（cookies、localStorage、IndexedDB）可以保存为 **storageState** 文件，后续测试复用。

## 基本用法：共享账号

```javascript
// 1. 认证并保存状态
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://example.com/login');
await page.fill('#username', 'user');
await page.fill('#password', 'pass');
await page.click('#login');
await page.waitForURL('https://example.com/dashboard');

// 保存认证状态
await context.storageState({ path: 'auth.json' });

// 2. 后续使用已认证的 context
const context = await browser.newContext({
  storageState: 'auth.json'
});
const page = await context.newPage();
// page 已经处于登录状态
```

## 重要警告

> **storageState 文件包含敏感 cookies**，可以用于冒充用户。不应提交到版本控制。

## 多种认证策略

### 1. API 请求认证（推荐用于简单场景）

```javascript
const context = await request.newContext();
await context.post('https://example.com/api/login', {
  data: { username: 'user', password: 'pass' }
});
await context.storageState({ path: 'auth.json' });
```

### 2. 每个 Worker 一个账号

适用于测试会修改服务器状态的场景：

```javascript
// fixtures.ts
const id = test.info().parallelIndex;  // 区分不同 worker
const account = await acquireAccount(id);
```

### 3. 多角色

```javascript
const adminContext = await browser.newContext({
  storageState: 'admin-auth.json'
});
const userContext = await browser.newContext({
  storageState: 'user-auth.json'
});
```

### 4. Session Storage

```javascript
// 保存
const sessionStorage = await page.evaluate(() =>
  JSON.stringify(sessionStorage));
fs.writeFileSync('session.json', sessionStorage);

// 恢复
const sessionStorage = JSON.parse(fs.readFileSync('session.json'));
await context.addInitScript(storage => {
  for (const [key, value] of Object.entries(storage))
    window.sessionStorage.setItem(key, value);
}, sessionStorage);
```

## 避免认证

```javascript
// 重置 storage state（未登录状态）
test.use({ storageState: { cookies: [], origins: [] } });
```

## 存储目录

```
playwright/.auth/          ← 推荐目录
├── user.json
├── admin.json
└── .gitkeep
```

建议 `.gitignore` 中忽略 `playwright/.auth/`。

## 对我们的意义

- **storageState 是解决登录态丢失的核心方案**
- 每次操作后自动调用 `context.storageState({ path })` 保存
- 启动时通过 `storageState` 选项加载
- 非机构网络凭据登录后保存 storageState，后续无需重新登录
- API 请求认证可用于 IEEE/万方的机构登录（CARSI）

## 相关笔记

- [[Playwright BrowserContext API]]
- [[Playwright launchPersistentContext]]
- [[学术数据库认证机制]]
