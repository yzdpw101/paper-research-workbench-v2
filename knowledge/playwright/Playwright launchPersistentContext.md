---
tags: [playwright, persistence, profile]
source: https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
retrieved: 2025-07-18
---

# Playwright launchPersistentContext

## 是什么

`launchPersistentContext` 启动一个**使用持久化存储**的浏览器。不像 `launch()` + `newContext()` 那样每次创建全新的临时 profile，而是使用指定的 `userDataDir` 目录持久化 cookies、localStorage、扩展等。

> 关闭 context 时**自动关闭浏览器**。这是与 `launch()` 的另一个区别。

## 基本用法

```javascript
const { chromium } = require('playwright');

// 使用持久化 userDataDir
const context = await chromium.launchPersistentContext('./my-profile', {
  headless: false
});

const page = await context.newPage();
// ... 登录、操作 ...

await context.storageState({ path: 'auth.json' });  // 额外保存
await context.close();  // 同时关闭浏览器
```

## userDataDir 参数

```javascript
// 空字符串 = 临时目录（行为类似 launch+newContext）
const context = await chromium.launchPersistentContext('');

// 指定目录 = 持久化
const context = await chromium.launchPersistentContext('./.browser-data');
```

## 关键选项

| 选项 | 说明 | 默认值 |
|------|------|:---:|
| `headless` | 无头模式 | `true` |
| `channel` | 浏览器通道（'chrome', 'msedge', 'chromium'） | — |
| `viewport` | 视口大小 | `{ width: 1280, height: 720 }` |
| `userAgent` | 自定义 UA | 浏览器默认 |
| `locale` | 语言/地区 | 系统默认 |
| `timezoneId` | 时区 | 系统默认 |
| `permissions` | 权限授予 | 无 |
| `geolocation` | 地理位置 | 无 |
| `extraHTTPHeaders` | 额外 HTTP 头 | 无 |
| `proxy` | 代理设置 | 无 |
| `storageState` | 初始认证状态文件 | 无 |
| `args` | 浏览器启动参数 | — |

## 完整示例

```javascript
const context = await chromium.launchPersistentContext(
  './.state/profiles/chrome-work',
  {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    args: [
      '--disable-blink-features=AutomationControlled',  // 反检测
    ],
    // 加载已有的认证状态
    storageState: './.state/storageState-chrome.json'
  }
);
```

## 与 launch() + newContext() 的区别

| 特性 | `launch` + `newContext` | `launchPersistentContext` |
|------|:---:|:---:|
| Profile | 临时（内存） | 持久化（磁盘） |
| Cookies 持久化 | 手动 storageState | 自动（浏览器原生） |
| Extensions | 不支持 | 支持 |
| 多 context | 支持 | 仅一个 |
| 关闭浏览器 | 手动 `browser.close()` | `context.close()` 自动关闭 |
| 磁盘占用 | 无 | 每个 profile ~100-500MB |

## 重要警告 ⚠️

### Chrome 政策限制

> **不能** 使用 Chrome 的默认 User Data 目录作为 `userDataDir`。
> 
> 原因：Chrome 安全政策禁止自动化默认 profile。
> 
> 解决：**创建并使用独立目录**（如 `./.state/profiles/chrome-work`）。

### 不能同时运行多个实例

两个进程不能使用同一个 `userDataDir`。如果目录被锁定，会启动失败。

### Firefox 支持

Firefox 也支持 `launchPersistentContext`，但行为与 Chromium 有差异：
- Firefox 没有 "profile 锁定" 问题（但不要同时访问同一 profile）
- 不支持 Extensions（`args` 中不能用 `--load-extension`）

## 对我们的意义 ⭐

1. **替代手动 storageState 管理** — 浏览器自动持久化 cookies
2. 结合 `storageState` 选项 → 首次登录后永久有效
3. 独立 profile 目录避免 Chrome 政策问题
4. 每个浏览器类型一个 profile（`chrome-work`, `firefox-work` 等）
5. 用户可选择 profile 名称（`--profile work` vs `--profile personal`）

## 相关笔记

- [[Playwright BrowserContext API]]
- [[Playwright Authentication]]
- [[Playwright connectOverCDP]]
- [[Playwright Browser 管理]]
