---
name: paper-research-workbench-v2
description: 学术论文检索与下载工具 — 支持 IEEE Xplore 和万方数据平台，基于 Playwright 浏览器自动化，支持机构网络(IP认证)/CDP Chrome CARSI 登录/并行搜索下载。
---

# Paper Research Workbench

## ⚠️ Route first — 执行前必读

**CDP 铁律**：CDP 模式需要先启动带 `--remote-debugging-port=9222` 的 Chrome（运行 `scripts/open-chrome-cdp.bat`），下载脚本加 `--mode cdp` 连接。

> 搜索脚本永远 launch 模式（headless），不连 CDP。下载脚本通过 `--mode launch|cdp` 切换。

**搜索 ≠ 下载**：搜索只查不下载，下载只下不查，命令分开。说"检索/搜/找"→搜索；说"下/保存"→下载。

**只有下载需要登录，搜索不需要**。万方和 IEEE 都是：搜索脚本无登录逻辑，下载前需单独处理登录。
- 万方登录 → `wf-carsi-login.js`（CDP 模式，需 PAPER_MASTER_KEY）
- 万方下载 → `wf-download.js --mode launch|cdp`
- IEEE 下载 → `ieee-download.js`（仅机构网络 IP 认证）

**下载前必须确认**：用户说"下载"时，先问：
> 你当前是什么网络环境？① 机构网络（校园网/机构 VPN，IP 直接认证）② 非机构网络（已存凭据 + CDP Chrome）③ 不确定

- ① → 直接跑下载脚本 `--mode launch`
- ② → 1) 启动 CDP Chrome  2) 跑 `wf-carsi-login.js` 登录  3) 跑下载脚本 `--mode cdp`
- ③ → 先跑搜索看能否正常返回结果，能就按②流程

> **凭据**：存在 `.state/credentials.json.enc`（AES-256-GCM 加密），需 `PAPER_MASTER_KEY` 环境变量解密。key 存储在 `.state/master-key`。

**Headless 默认**：默认 headless。若被网站屏蔽（万方 `fault filter abort`、IEEE `Error 418`），换 CDP 模式或 Firefox。

**首次设置**：`.state/.setup-done` 不存在 → 读 `shared/setup.md` 执行首次设置。

## 意图 → 命令

|  意图 | 命令 | 注意  |
| ---|---|--- |
|  ⚠️ 首次设置 | 读 `shared/setup.md` | `.state/.setup-done` 不存在时必须先做  |
|  万方搜索 | `node ${SKILL_DIR}/scripts/wf-search.js --q "..." --type thesis --page 1 --rows 20` | 翻页用 `--page`，`--no-snippet` 省 token  |
|  万方下载 | `node ${SKILL_DIR}/scripts/wf-download.js --q "..." --type thesis --idx 0 --save-as "..."` | 机构直接下；非机构需 CARSI 登录后 `--mode cdp`  |
|  万方引用 | `node ${SKILL_DIR}/scripts/wf-cite.js --q "..." --type thesis --idx 0` | CDP 模式，`--format gb7714|mla|apa` |
|  万方批量引用 | `node ${SKILL_DIR}/scripts/wf-batch-cite.js --q "..." --type periodical --count 3` | CDP 模式，最多10篇 |
|  万方批量下载 | `node ${SKILL_DIR}/scripts/wf-batch-download.js --q "..." --type periodical --count 3 --save-dir "..."` | CDP 模式，期刊全文 |
|  万方分章下载 | `node ${SKILL_DIR}/scripts/wf-chapter.js --q "..." --idx 0 --save-as "..."` | 先看 `wanfang/chapters.md`  |
|  万方并行搜索 | `node ${SKILL_DIR}/scripts/parallel-search.js --q "kw1,kw2" --platform wanfang` | 多关键词并发  |
|  IEEE 搜索 | `node ${SKILL_DIR}/scripts/ieee-search.js --q "..." --type Journals --year 2023-2025 --rows 25 --page 1` | `--expand` 展开摘要  |
|  IEEE 详情 | `node ${SKILL_DIR}/scripts/ieee-detail.js --arnumber <n>` | 作者、DOI、引用等  |
|  IEEE 下载 | `node ${SKILL_DIR}/scripts/ieee-download.js --arnumber <n> --save-as "..."` | 用 arnumber，不是关键词  |
|  IEEE 图表 | `node ${SKILL_DIR}/scripts/ieee-figures.js --arnumber <n> --out-dir "..."` | 先读 `ieee/figures.md`  |
|  IEEE 并行搜索 | `node ${SKILL_DIR}/scripts/parallel-search.js --q "kw1,kw2" --platform ieee` |  |
|  IEEE 并行下载 | `node ${SKILL_DIR}/scripts/parallel-download.js --arnumbers "n1,n2" --save-dir "..."` |  |
|  万方 CARSI 登录 | `node ${SKILL_DIR}/scripts/wf-carsi-login.js` | **仅 CDP 模式**，需先启动 CDP 浏览器  |
|  自定义 eval | `node ${SKILL_DIR}/scripts/eval.js --url "..." --code "..."` |  |
|  自定义 run | `node ${SKILL_DIR}/scripts/run.js --code-file /tmp/code.js` | 通用 Playwright runner  |

> **IEEE 渐进式**：标题→摘要→详情→下载，每步按需。**万方一步到位**：搜索页已有完整摘要和下载入口。说"检索"不跳到下载。

## Scripts

所有脚本在 `${SKILL_DIR}/scripts/` 下。运行方式：`node "${SKILL_DIR}/scripts/<name>.js" [options]`。

### CLI 入口

|  脚本 | 用途  |
| ---|--- |
|  `wf-search.js` | 万方搜索 — `--q` `--type` `--page` `--rows`(max20) `--no-snippet`  |
|  `wf-download.js` | 万方下载 — `--q` + `--type` + `--idx`（0-based），论文流（整篇下载→新标签→倒计时→点击此处）和期刊流（直接触发）  |
|  `wf-batch-cite.js` | 万方批量引用 — `--q` `--type` `--count`，CDP 模式 |
|  `wf-batch-download.js` | 万方批量下载 — `--q` `--type` `--count` `--save-dir`，CDP 模式，期刊全文 |
|  `wf-cite.js` | 万方引用提取 — `--q` `--type` `--idx` `--format`(gb7714|mla|apa)，CDP 模式 |
|  `wf-chapter.js` | 万方论文分章下载 — 书签树展开、选章、ZIP  |
|  `wf-carsi-login.js` | 万方 CARSI SSO 登录 — 导出 `checkStatus(page)` 和 `login(page, creds, opts)`，CLI：`node wf-carsi-login.js --port=9222`  |
|  `ieee-search.js` | IEEE 搜索 — `--q` `--type` `--year` `--rows`(max25) `--page` `--expand`  |
|  `ieee-detail.js` | IEEE 元数据 — 作者、DOI、摘要、关键词、引用  |
|  `ieee-download.js` | IEEE PDF 下载 — `--arnumber`，通过 stampPDF + CDP 轮询  |
|  `ieee-figures.js` | IEEE 图表提取 — 详情页→Figures 标签→并行下载  |
|  `eval.js` | 通用 evaluate — 导航 URL + 执行 JS → JSON  |
|  `run.js` | 通用 Playwright runner — 执行 JS，可选下载捕获  |
|  `parallel-search.js` | 多关键词并行搜索 — `--q "kw1,kw2" --platform ieee|wanfang`  |
|  `parallel-download.js` | 批量 IEEE 下载 — `--arnumbers "n1,n2" --save-dir "..."`  |

### 核心模块（import 使用，非 CLI）

|  模块 | 用途 | 关键导出  |
| ---|---|--- |
|  `config.js` | 配置中心 — 默认值 + PAPER_* 环境变量 | `get(key)`, `getAll()`  |
|  `browser-launcher.js` | 浏览器生命周期 — launch/CDP/storageState | `launch()`, `connectExisting()`  |
|  `navigator.js` | 智能导航 — 指数退避重试、就绪检测 | `goto()`, `retry()`  |
|  `credential-vault.js` | AES-256-GCM 加密凭据 | `store()`, `retrieve()`  |
|  `session-manager.js` | 登录会话 24h TTL | `saveSession()`, `isSessionValid()`  |
|  `network-detector.js` | 网络环境检测 | `isInstitutionalAccess()`, `canDownload()`  |
|  `context-pool.js` | 浏览器上下文池 | `createPool()`  |
|  `cdp-connector.js` | CDP 连接管理 | `connect()`, `isCDPAvailable()`  |
|  `batch-runner.js` | 批量任务调度 | `runBatch()`  |
|  `init-wizard.js` | **模块**，非 CLI — 需 `import { run }` 后调用 `run()` | `run()`, `checkEnvironment()`  |

### 辅助文件

|  文件 | 用途  |
| ---|--- |
|  `open-chrome-cdp.bat` | 启动 Chrome + `--remote-debugging-port=9222`  |
|  `open-edge-cdp.bat` | 启动 Edge + `--remote-debugging-port=9222`  |
|  `credential-page.js` | 浏览器内凭据输入表单  |

## 配置

### 优先级

1. **环境变量** `PAPER_*`（如 `PAPER_BROWSER_DEFAULT=firefox`）
2. `config.js` 内置默认值

### 关键环境变量

|  变量 | 作用  |
| ---|--- |
|  `PAPER_BROWSER_DEFAULT=firefox` | 切换默认浏览器（firefox/chrome/msedge）  |
|  `PAPER_MASTER_KEY` | 凭据加密主密钥  |

## 已知陷阱（实测验证）

### 1. Chrome headless 被万方屏蔽
搜索用 Chrome headless 可能被万方返回空白页或 `SELECTOR_NOT_FOUND`。
- 修复：搜索默认用 Firefox headless（设 `PAPER_BROWSER_DEFAULT=firefox`），下载用 CDP Chrome

### 2. 登录态检测误报（已修复）
`network-detector.js` 的 `checkWanfangInstitution()` 原先在**整个 body** 中用正则匹配机构名（如"大学""图书馆"），万方首页底部有合作机构链接（如"北京大学图书馆"），导致误报 `"Institutional IP access detected"`。搜索可返回结果但 `accessReady: false`，下载时页面显示"需要登录"。

- **已修复**：`extractInstitution` 改为只搜索 header/topbar 元素（`header, .header, .top, .user-info` 等），不再搜索整个 body。同时 `checkWanfangInstitution` 增加了 header 中的登录状态验证（需有"退出登录"按钮或机构标识才判定为已登录）。
- 症状：搜索成功但下载超时失败
- 判断：搜索结果的 `accessReady` 字段，`false` = 未真正登录
- 相关文件：`scripts/network-detector.js` — `checkWanfangInstitution()` 和 `PLATFORMS.wanfang.extractInstitution`

### 3. 万方/IEEE 屏蔽 headless
非机构网络下：
- 万方：`fault filter abort` 或连接关闭
- IEEE：Error 418 `Unusual Traffic Detected`
- 症状：`SELECTOR_NOT_FOUND`（导航到替换页面）
- 方案：CDP 模式（真实浏览器），或 Firefox headless


### 4. CDP 模式下载目录不一致（已修复 `wf-download.js`）
CDP 模式下 Playwright 连接已有 Chrome，**无法拦截下载事件**。Chrome 把文件存到自己的默认下载目录（从 `.state/profiles/chrome-cdp/Default/Preferences` 中读取，如 `E:\Downloads`），而非脚本的 `download.dir` 或 `--save-as`。

- **已修复**：`wf-download.js` 新增 `getCDPDownloadDir()` 读取 Chrome Preferences 获取实际下载目录，CDP 模式下同时轮询该目录 + 项目下载目录，找到文件后自动复制到 `--save-as` 路径
- 症状：下载脚本超时但文件实际已在 Chrome 下载目录中
- 非 CDP 模式（`PAPER_BROWSER_MODE=launch`）：Playwright 可直接控制下载路径，`--save-as` 正常生效

## 硬规则

### 搜索 vs 下载
- "检索/找/搜" → 只搜索，不下载
- "下载/下/保存" → 只下载，不重新搜索
- 禁止一步到位（搜索+下载合并调用）

### 登录
- 不做登录预检：先搜再说。大学 IP 认证不产生持久 cookie
- 万方登录失败只是警告，继续执行
- 登录过期：按钮从"整篇下载"退化→通知用户

### 浏览器
- 串行执行（除 parallel-* 脚本用 context-pool）
- Firefox + 非机构网络：不支持
- 批量连续跑：加 `--no-kill` 避免互相杀进程

### 输出
- 最小化：平台、标题、最终路径、下一步
- 无结果：`noResults=true` → 建议换关键词
- 一次失败就停：诊断 + 通知用户
