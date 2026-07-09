# Paper Research Workbench v2

学术论文检索与下载工具，支持 IEEE Xplore 和万方数据平台。基于 Playwright 浏览器自动化。

## 快速开始

```bash
# 安装依赖
npm install playwright
npx playwright install chromium

# 运行首次设置
node scripts/set-browser.js chrome

# 或手动设置
# 1. 选择浏览器：编辑 scripts/config.js 中的 browser.default
# 2. 创建 .state/.setup-done（空文件即可）
```

## 浏览器选择

首次使用会询问浏览器偏好：

| 浏览器 | launch 模式 | CDP 模式 | 下载能力 |
|--------|:--:|:--:|------|
| **Chrome / Edge** | ✅ 全功能 | ✅ 全功能 | 机构网络 + CARSI |
| **Firefox** | ✅ 仅机构网络 | ❌ 不支持 | 仅机构网络 |

> **推荐 Chrome**。Firefox 用户只能在校园网/VPN 下使用，无法在非机构网络下登录和下载。

## 网络环境

- **机构网络**（校园网/VPN）：直接下载，无需登录
- **非机构网络**（家庭/公共 WiFi）：需要 CDP Chrome + CARSI 登录

## 详细文档

- `SKILL.md` — 完整命令参考
- `references/boundaries.md` — 功能边界与限制
- `references/setup.md` — 首次设置详解
- `ieee/automation.md` — IEEE 自动化指南
