---
name: paper-research-workbench-v2
description: >
  学术论文检索与下载工具，支持 IEEE Xplore 和万方数据平台。
  当用户需要搜索中英文学术论文、下载论文 PDF、提取参考文献引用、
  获取论文图表或批量处理文献时使用此 skill。
  基于 Playwright 浏览器自动化，支持机构网络 IP 认证与 CARSI SSO 登录。
---

# Paper Research Workbench

学术论文检索与下载的完整工作台，覆盖 **IEEE Xplore**（英文）和 **万方数据**（中文）两个主流平台。

## 为什么搜索和下载要分开

搜索和下载对网络和认证的需求完全不同：

- **搜索**在任何网络下都能工作，不需要登录。使用 headless Chrome，快速返回文献元数据。
- **下载**需要认证——机构网络通过 IP 自动识别，非机构网络需要 CARSI SSO 登录（仅万方支持）。

把两者分开意味着先搜后下，搜到确认要的论文再触发认证流程。这样避免了不必要的登录开销，也符合学术工作流的直觉：浏览 → 筛选 → 获取全文。

## 快速开始

### 搜索（任何网络，无需登录）

```bash
# 万方 — 中文论文
node ${SKILL_DIR}/scripts/wf-search.js --q "深度学习" --type thesis --page 1 --rows 20

# IEEE — 英文论文
node ${SKILL_DIR}/scripts/ieee-search.js --q "deep learning" --type Journals --year 2023-2025 --rows 25
```

搜索返回标题、作者、摘要等信息。翻页用 `--page`。万方 `--no-snippet` 可省略摘要以节省 token。

### 下载 — 机构网络（校园网 / 机构 VPN）

IP 自动认证，直接下载：

```bash
# 万方
node ${SKILL_DIR}/scripts/wf-download.js --q "关键词" --type thesis --idx 0 --save-as "paper.pdf"

# IEEE（用 arnumber，不是关键词）
node ${SKILL_DIR}/scripts/ieee-download.js --arnumber 1234567 --save-as "paper.pdf"
```

### 下载 — 非机构网络（需要 CARSI 登录）

非机构网络下通过 CARSI SSO 登录。三步流程：

```bash
# 1. 启动 CDP Chrome（带远程调试端口）
node ${SKILL_DIR}/scripts/launch-cdp.js chrome

# 2. CARSI 登录
PAPER_MASTER_KEY=<key> node ${SKILL_DIR}/scripts/wf-carsi-login.js --port=9222

# 3. 下载（--mode cdp 连接到已登录的 Chrome）
PAPER_MASTER_KEY=<key> node ${SKILL_DIR}/scripts/wf-download.js --mode cdp --q "关键词" --type thesis --idx 0 --save-as "paper.pdf"
```

> **下载前确认网络环境**：先问用户「你当前是什么网络？① 机构网络 ② 非机构网络 ③ 不确定」。流程详见 `references/download-flow.md`。

## 命令速查

所有脚本位于 `${SKILL_DIR}/scripts/`，通过 `node` 直接运行。

### Core — 搜索与下载

日常使用最频繁的入口。搜索不需要登录，下载前需确认认证方式。

| 脚本 | 用途 | 关键参数 |
|---|---|---|
| `wf-search.js` | 万方搜索 | `--q` `--type` `--year` `--page` `--rows`(≤20) `--no-snippet` |
| `wf-detail.js` | 万方详情页元数据提取 | `--url` `--mode launch|cdp` |
| `ieee-search.js` | IEEE 搜索 | `--q` `--type` `--year` `--rows`(≤25) `--page` `--no-snippet` |
| `ieee-detail.js` | IEEE 论文元数据 | `--arnumber`（作者、DOI、引用等） |
| `wf-download.js` | 万方下载 | `--q` `--type` `--year` `--idx` `--save-as` `--mode launch\|cdp` `--browser` |
| `ieee-download.js` | IEEE PDF 下载 | `--arnumber` `--save-as` `--mode launch\|cdp` `--browser` |
| `wf-carsi-login.js` | 万方 CARSI SSO | `--port=9222`（仅 CDP 模式） |
| `wf-chapter.js` | 万方学位论文分章下载（两步：`--action analyze` 查看树 → `--action download --ids "6,7"` 下载） | `--q` `--idx` `--ids` `--save-as` `--mode launch\|cdp` |
| `ieee-figures.js` | IEEE 图表提取 | `--arnumber` `--out-dir`（先读 `ieee/figures.md`） |
| `ieee-carsi-login.js` | IEEE CARSI SSO 登录 | `--port=9222`（仅 CDP 模式，直达 SSO 跳过 SeamlessAccess） |
| `ieee-batch-cite.js` | IEEE 批量引用导出（不需登录） | `--q` `--ids "0,2,5"` `--format bibtex\|plain\|ris\|refworks` `--save-as` `--mode launch\|cdp` |
| `ieee-batch-download.js` | IEEE 批量 PDF 下载（需登录，≤10篇） | `--q` `--ids "0,2,5"` `--save-as` `--mode launch\|cdp` |

### Core — 引用提取

从万方论文详情页提取格式化引用。仅 CDP 模式，**需要先完成 CARSI 登录**（运行 `wf-carsi-login.js`），因为点击引用按钮需要登录态。

| 脚本 | 用途 | 关键参数 |
|---|---|---|
| `wf-cite.js` | 单篇引用 | `--q` `--type` `--idx` `--format gb7714\|mla\|apa` |
| `wf-batch-cite.js` | 批量引用 | `--q` `--ids "0,2,5"` `--type` `--mode launch|cdp` |

### Parallel — 并发

多关键词或多论文并行处理，用 `context-pool.js` 管理浏览器上下文池。

| 脚本 | 用途 | 示例 |
|---|---|---|
| `parallel-search.js` | 多关键词并行搜索 | `--q "kw1,kw2" --platform ieee\|wanfang` `--mode launch\|cdp` |
| `parallel-download.js` | IEEE 多论文并行下载 | `--arnumbers "n1,n2" --save-dir "..."` |
| `wf-batch-download.js` | 万方期刊批量下载 | `--q` `--ids "0,2,5"` `--type periodical` `--save-dir` (CDP) |

### Utility — 底层模块

被 Core 脚本内部引用，通常不直接调用，但在定制场景中也可作为 CLI 入口。

| 模块 | 职责 |
|---|---|
| `config.js` | 配置中心：默认值 + `PAPER_*` 环境变量覆盖 |
| `browser-launcher.js` | 浏览器生命周期：launch / CDP 连接 / storageState 持久化 |
| `navigator.js` | 智能导航：指数退避重试、页面就绪检测、超时处理 |
| `network-detector.js` | 网络环境检测：判断机构 IP 还是公网、下载是否可行 |
| `credential-vault.js` | AES-256-GCM 凭据加密存储（PBKDF2 100K 迭代） |
| `session-manager.js` | 登录会话管理，24 小时 TTL 自动过期 |
| `cdp-connector.js` | Chrome DevTools Protocol 连接管理 |
| `context-pool.js` | 浏览器上下文池（parallel-* 脚本使用） |
| `batch-runner.js` | 批量任务调度与并发控制 |
| `init-wizard.js` | 首次设置向导（模块，非 CLI：`import { run }` 后调用 `run()`） |
| `credential-page.js` | 凭据输入表单 — 在浏览器中打开 HTML 页面供用户填写账号密码，加密存入 vault |
| `launch-cdp.js` | 启动 CDP Chrome/Edge，完全脱离父进程（AI shell 超时不影响 Chrome） |
| `detect-cdp-download.mjs` | 调试工具 — 检测 CDP 模式下 Chrome 的实际下载目录 |
| `run.js` / `eval.js` | 通用 Playwright runner / 任意 JavaScript 求值 |

### 凭据设置流程

非机构网络下下载和引用需要登录，登录需要凭据。`credential-page.js` 提供安全的凭据录入方式：

1. **设置主密钥**：`export PAPER_MASTER_KEY="你的密钥"`（只有你知道，AI 无法读取）
2. **打开凭据表单**：`node ${SKILL_DIR}/scripts/credential-page.js`，会在浏览器中打开一个 HTML 表单
3. **填写并保存**：在表单中选择平台、填写机构名和账号密码，点击保存
4. **自动加密**：凭据经 AES-256-GCM 加密后存入 `.state/credentials.json.enc`
5. **自动登录**：后续 `wf-carsi-login.js` 运行时自动读取并解密凭据，完成 CARSI SSO 登录

> AI 全程只接触密文。明文凭据仅在 Playwright 浏览器内存中流转，不会出现在日志或终端输出中。

## 浏览器策略

默认使用 Chrome headless（Playwright 自带 Chromium）。做过反检测处理：伪装 Firefox UA + 移除 webdriver 标记 + 去掉自动化控制提示。万方和 IEEE 均能正常访问。

| 场景 | 浏览器 | 原因 |
|---|---|---|
| 搜索（万方 + IEEE） | Chrome headless | 默认，反检测后可正常加载 |
| 下载（机构网络） | Chrome headless | IP 认证下网站不区分浏览器 |
| 下载（非机构网络） | Chrome CDP | 连接桌面 Chrome 共享真实浏览器指纹和登录状态 |
| CARSI 登录 | Chrome CDP | 仅 CDP 模式 |

> 批量连续运行多个脚本时加 `--no-kill`，避免互相杀掉浏览器进程。

所有 launch 模式脚本支持 `--show` 参数关闭 headless，用于调试时观察浏览器行为：`node scripts/wf-download.js ... --show`

## 平台差异

| | 万方 | IEEE |
|---|---|---|
| 语言 | 中文 | 英文 |
| 搜索模式 | 一步到位：搜索结果含完整摘要和下载入口 | 渐进式：标题列表 → 展开摘要 → 详情页 → 下载 |
| 下载认证 | 机构 IP 或 CARSI SSO | 机构 IP 或 CARSI SSO |
| Headless 兼容 | ✅ Chrome（反检测处理） | ✅ Chrome |

详细文档：
- `wanfang/search-download.md` — 万方搜索、下载、引用、分章完整流程
- `ieee/search-download.md` — IEEE 搜索、下载、图表提取流程
- `ieee/figures.md` — IEEE 图表提取细节
- `wanfang/chapters.md` — 万方学位论文分章下载细节
- `references/download-flow.md` — 下载前网络环境判断与认证流程

## 配置

不需要配置文件。所有配置通过 `config.js` 内置默认值 + 环境变量覆盖：

| 变量 | 作用 | 默认值 |
|---|---|---|
| `PAPER_BROWSER_DEFAULT` | 默认浏览器（`chrome` / `firefox` / `msedge`） | `chrome` |
| `PAPER_MASTER_KEY` | 凭据加密主密钥 | 无（使用凭据时必须设） |

凭据以 AES-256-GCM 加密存储在 `.state/credentials.json.enc`。主密钥经 PBKDF2（100K 迭代）派生，仅通过 PAPER_MASTER_KEY 环境变量提供，不会上传到任何服务器，不存储在磁盘文件中。

## 首次设置

如果 `.state/.setup-done` 不存在，引导用户完成：

1. 询问浏览器偏好，写入 `scripts/config.js` 的 `browser.default`（Chrome/Edge 推荐，Firefox 仅机构网络）
2. 安装依赖：`npm install playwright` + `npx playwright install chromium`
3. 创建 `.state/.setup-done` 标记

详见 `references/setup.md`。

## 注意事项

以下是从实际使用中积累的经验，了解它们可以避免踩坑：

- **登录态误判**：`network-detector.js` 曾经在整个页面 body 中搜索机构名（如「大学」「图书馆」）来判断是否已登录，但万方页脚的友情链接中含合作机构名，导致误报。已修复为仅检测 header/topbar 区域中的登录状态元素（「退出登录」按钮或机构标识）。
- **CDP 下载路径**：CDP 模式下 Playwright 无法拦截 Chrome 的下载事件，文件会存到 Chrome 默认下载目录。`wf-download.js` 会自动读取 Chrome Preferences 获取实际路径，然后将文件复制到 `--save-as` 目标位置。
- **批量任务**：多个脚本连续运行时加 `--no-kill`，否则后续脚本可能杀掉前一个脚本的浏览器进程。

更多已知问题与解决方案见 `references/troubleshooting.md`。

## 参考文件索引

| 文件 | 何时读取 |
|---|---|
| `references/setup.md` | 首次设置时 |
| `references/download-flow.md` | 用户要求下载时 |
| `references/troubleshooting.md` | 遇到异常行为时 |
| `wanfang/search-download.md` | 万方平台详细流程 |
| `ieee/search-download.md` | IEEE 平台详细流程 |
| `ieee/figures.md` | IEEE 图表提取 |
| `ieee/automation.md` | IEEE CARSI 登录、批量引用、批量下载 |
| `wanfang/chapters.md` | 万方分章下载 |
| `references/cross-agent.md` | 适配其他 AI Agent 时 |
| `references/boundaries.md` | 功能边界与限制 |
| `knowledge/知识库索引.md` | 需要底层知识（CDP、加密、认证等）时 |
