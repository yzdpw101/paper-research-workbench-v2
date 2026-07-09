# First-time Setup

首次使用需完成以下步骤，完成后创建 `.state/.setup-done` 标记。

## 需要安装

| 组件 | 命令 | 说明 |
|------|------|------|
| Node.js | https://nodejs.org | v18+（已安装跳过） |
| Playwright | `npm install playwright` | 推荐装到 `%USERPROFILE%`，全局共享 |
| Chromium | `npx playwright install chromium` | 默认浏览器 |
| Firefox（可选） | `npx playwright install firefox` | 仅机构网络 |

> Edge 不需要安装——使用系统自带。
>
> **关于 node_modules**：本项目不携带 `node_modules/`。Playwright 可以装到用户家目录（`cd %USERPROFILE% && npm install playwright`），Node.js 会向上查找自动解析。多个 skill 项目共享一份安装。

## AI 引导设置

AI 检测到 `.state/.setup-done` 不存在时：

1. **询问浏览器**：「你用什么浏览器？① Chrome ② Edge ③ Firefox」
   - 运行：`node scripts/set-browser.js chrome`（或 `edge` / `firefox`）
   - Firefox 会自动提示 ⚠️ 仅机构网络
2. **安装依赖**：`npm install playwright` + `npx playwright install chromium`
3. **标记完成**：创建 `.state/.setup-done`

## 手动设置

```bash
npm install playwright
npx playwright install chromium
node scripts/set-browser.js chrome
echo "" > .state/.setup-done
```

## 后续：凭据设置（非机构网络需要）

```bash
$env:PAPER_MASTER_KEY="your-secret-key"
node scripts/credential-page.js   # 在浏览器中填写凭据
```

## CDP 模式（非机构网络）

需要系统 Chrome（非 Playwright Chromium），用户手动启动：

```bash
scripts\open-cdp.bat chrome
# 或
node scripts/launch-cdp.js chrome
```

## 验证环境

```bash
node scripts/wf-search.js --q "test" --rows 1 --no-snippet
```
