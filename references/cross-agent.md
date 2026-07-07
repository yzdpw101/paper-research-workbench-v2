# 适配其他 AI Agent

本 skill 所有脚本是标准 Node.js，任何能执行 `node` 的 Agent 都可以用。

## 直接可用的部分

|  组件 | 原因  |
| ------|------ |
|  所有 `scripts/*.js` | 纯命令行调用，与 Agent 无关  |
|  所有 `scripts/*.bat` | Windows 批处理，与 Agent 无关  |
|  `storageState` / `profiles/` | 文件持久化，跨 Agent 共享  |
|  `.state/.setup-done` | 文件持久化  |
|  浏览器引擎 | Playwright 控制，不依赖 Agent  |

## 需要适配的部分

|  组件 | Reasonix | 其他 Agent  |
| ------|---------|----------- |
|  Skill 格式 | SKILL.md frontmatter | 同格式或平台对应格式  |
|  `${SKILL_DIR}` | 自动设为 skill 根目录 | **不支持** → 改绝对路径  |
|  Agent 指令 | Markdown code block | 该平台的 task routing 方式  |

## 快速适配清单

1. 将所有 `${SKILL_DIR}` 替换为 skill 根目录的绝对路径
2. 确认目标 Agent 能执行 `node` 命令
3. 确认 Playwright 已安装：`npm install playwright`
4. 确认浏览器已安装：`npx playwright install firefox`（仅 Firefox；Chrome/Edge 用系统自带）

## 前提条件

目标 Agent 必须：
1. 能执行 `node` 命令（运行脚本）
2. 能读写文件（写 code 文件到 temp、读 JSON 输出）

## v2 额外注意

|  事项 | 说明  |
| ------|------ |
|  26 个脚本 | v1 只有 15 个，v2 新增 Core/Browser Layer 模块  |
|  `config.js` | 纯代码，无配置文件，默认值 + PAPER_* 环境变量 |
|  `init-wizard.js` | 替代 v1 的 `init.js` + `set-browser.js`  |
|  Headless 默认 true | 如需可视化，设 `PAPER_BROWSER_HEADLESS=false`  |
|  Firefox 限制 | 仅支持机构网络；非机构网络需 Chrome/Edge + CDP  |
|  CDP 模式 | Chrome/Edge 需手动启动带 `--remote-debugging-port`，然后 `--mode cdp`  |
|  凭据加密 | AES-256-GCM，主密钥优先用 Windows DPAPI  |

## 浏览器支持

|  浏览器 | v2 状态 | 说明  |
| --------|---------|------ |
|  Firefox | ✅ 机构网络完整支持 | 非机构网络会报错  |
|  Chrome | ✅ 完整支持 | CDP + persistent + launch 三种模式  |
|  Edge | ⚠️ 代码已支持 | Chrome 的 Edge 等价物，未全面实机测试  |
