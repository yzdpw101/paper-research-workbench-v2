---
tags: [playwright, overview]
source: https://playwright.dev/docs/intro
retrieved: 2025-07-18
---

# Playwright 概述

## 是什么

Playwright 是 Microsoft 开发的端到端测试框架，支持 Chromium、Firefox、WebKit 三大浏览器引擎，提供统一的 API 进行浏览器自动化。

## 核心特性

- **跨浏览器**: Chromium、Firefox、WebKit
- **跨平台**: Windows、Linux、macOS
- **多语言**: JavaScript/TypeScript、Python、Java、.NET
- **移动模拟**: Chrome (Android) 和 Mobile Safari
- **headless/headed**: 支持无头和有头模式
- **自动等待**: 内置 auto-waiting，不需要手动 `sleep()`
- **并行执行**: 内置测试并行，支持多 worker
- **隔离环境**: Browser Context 提供独立 session，类似无痕窗口

## 安装

```bash
npm init playwright@latest   # 新建项目
npm install playwright        # 已有项目添加依赖
npx playwright install        # 下载浏览器二进制
```

## 系统要求

- Node.js: 22.x, 24.x, 26.x
- Windows 11+, Windows Server 2019+, WSL
- macOS 14+
- Debian 12/13, Ubuntu 22.04/24.04/26.04

## 对我们的意义

我们使用 Playwright **Library**（非 Test Runner），直接调用其 Node.js API 来控制浏览器完成学术论文检索/下载。核心用到：

- `chromium.launch()` / `firefox.launch()` → 启动浏览器
- `browser.newContext()` / `browser.newPage()` → 创建页面
- `page.goto()` / `page.evaluate()` → 导航和 DOM 操作
- `context.storageState()` → 保存认证状态
- `context.request.fetch()` → 直接 HTTP 请求（下载文件）

## 相关笔记

- [[Playwright Browser 管理]]
- [[Playwright Authentication]]
- [[Playwright BrowserContext API]]
- [[Playwright BrowserType API]]
- [[Playwright connectOverCDP]]
- [[Playwright launchPersistentContext]]
