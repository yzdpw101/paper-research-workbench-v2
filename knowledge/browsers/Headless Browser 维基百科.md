---
tags: [browsers, chrome, cdp]
source: https://en.wikipedia.org/wiki/Headless_browser
retrieved: 2025-07-18
---

# Headless Browser（维基百科）

## 定义

无头浏览器是没有图形用户界面的 Web 浏览器，通过命令行或网络通信进行自动化控制。

## 主要用途

- **Web 应用测试自动化**（最主要用途）
- 网页截图
- JavaScript 库自动化测试
- **网页抓取**（web scraping）
- Ajax 网站搜索引擎索引

## 恶意用途

- DDoS 攻击
- 广告欺诈
- 凭证填充（credential stuffing）

> 但 2018 年研究表明，恶意行为者并非偏好无头浏览器。

## 主要软件

| 软件 | 语言 | 支持浏览器 | 说明 |
|------|------|-----------|------|
| **Selenium WebDriver** | 多语言 | Chrome, Firefox, Edge, Safari | W3C 标准 |
| **Playwright** | Node.js, Python, Java, .NET | Chromium, Firefox, WebKit | Microsoft 开发 |
| **Puppeteer** | Node.js | Chrome, Firefox | Google 开发 |

## 浏览器原生支持

- **Chrome 59+**（2017）：原生 headless 模式
- **Firefox 56+**（2017）：原生 headless 模式

这使 PhantomJS 等旧方案被淘汰。

## 替代方案

- **jsdom**（Node.js）：模拟 DOM，不渲染，速度更快但不够真实
- **HtmlUnit**（Java）：Rhino 引擎提供 JS 支持

## 对我们的意义

- 我们的项目属于"网页抓取 + 自动化"场景
- Playwright 是当前最先进的方案（vs Selenium/Puppeteer）
- headless 模式适合机构 IP 认证（无需 GUI），但交互式登录需要 headed

## 相关笔记

- [[Playwright 概述]]
- [[Chrome DevTools Protocol]]
