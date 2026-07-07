# Paper Research Workbench v2

学术论文检索与下载工具。支持 IEEE Xplore 和万方数据平台，基于 Playwright 浏览器自动化。

## 架构

三层分离：
- **搜索** — Firefox headless（launch 模式），不需要登录
- **登录** — `wf-carsi-login.js`，仅 CDP 模式（Chrome）
- **下载** — `wf-download.js` / `ieee-download.js`，支持 `--mode launch|cdp`

## 脚本清单（25 个）

### 搜索（4 个，全部 launch + headless）

| 脚本 | 用途 |
|---|---|
| `wf-search.js` | 万方搜索，`--q` `--type` `--page` `--rows`(max20) |
| `ieee-search.js` | IEEE 搜索，`--q` `--type` `--year` `--rows`(max25) `--page` |
| `ieee-detail.js` | IEEE 详情，`--arnumber` |
| `ieee-figures.js` | IEEE 图片，`--arnumber --out-dir` |

### 下载（2 个，支持 launch/cdp）

| 脚本 | 用途 |
|---|---|
| `wf-download.js` | 万方下载，`--q --type --idx --save-as --mode` |
| `ieee-download.js` | IEEE 下载，`--arnumber --save-as --mode` |

### 登录（1 个，仅 CDP）

| 脚本 | 用途 |
|---|---|
| `wf-carsi-login.js` | 万方 CARSI SSO，导出 `checkStatus()` / `login()`，CLI: `node wf-carsi-login.js --port=9222` |

### 引用（3 个，仅 CDP）

| 脚本 | 用途 |
|---|---|
| `wf-cite.js` | 单篇引用，`--q --type --idx --format gb7714|mla|apa` |
| `wf-batch-cite.js` | 批量引用，`--q --type periodical --count` |
| `wf-batch-download.js` | 批量下载，`--q --type periodical --count --save-dir` |

### 并行（2 个）

| 脚本 | 用途 |
|---|---|
| `parallel-search.js` | 多关键词并行搜索 |
| `parallel-download.js` | IEEE 多 arnumber 并行下载 |

### 其他

| 脚本 | 用途 |
|---|---|
| `wf-chapter.js` | 万方分章下载 |
| `run.js` / `eval.js` | 通用 Playwright runner |
| `browser-launcher.js` | 浏览器生命周期 |
| `navigator.js` | 智能导航（重试、超时） |
| `config.js` | 配置中心（默认值 + PAPER_* 环境变量） |
| `network-detector.js` | 网络环境检测 |
| `cdp-connector.js` | CDP 连接管理 |
| `context-pool.js` | 浏览器上下文池 |
| `batch-runner.js` | 批量任务调度 |
| `credential-vault.js` | AES-256-GCM 凭据加密 |
| `session-manager.js` | 登录会话 24h TTL |
| `init-wizard.js` | 初始化向导 |

### @deprecated

| `auto-login.js` | 万方登录已迁移到 `wf-carsi-login.js`，IEEE 部分暂留 |

## 配置

无配置文件。只靠 `config.js` 默认值 + `PAPER_*` 环境变量：

| 变量 | 作用 |
|---|---|
| `PAPER_BROWSER_DEFAULT` | 浏览器（firefox/chrome/msedge），默认 firefox |
| `PAPER_MASTER_KEY` | 凭据加密主密钥 |

## 快速开始

### 搜索（任何网络）
```bash
node scripts/wf-search.js --q "关键词" --type thesis --page 1
node scripts/ieee-search.js --q "keyword" --type Journals --rows 10
```

### 下载 — 机构网络
```bash
node scripts/wf-download.js --q "关键词" --type thesis --idx 0 --save-as "paper.pdf"
node scripts/ieee-download.js --arnumber 1234567 --save-as "paper.pdf"
```

### 下载 — 非机构网络
```bash
# 1. 启动 CDP Chrome
scripts/open-chrome-cdp.bat
# 2. CARSI 登录
PAPER_MASTER_KEY=<key> node scripts/wf-carsi-login.js --port=9222
# 3. 下载
PAPER_MASTER_KEY=<key> node scripts/wf-download.js --mode cdp --q "关键词" --type thesis --idx 0 --save-as "paper.pdf"
```

## 状态

- 万方搜索/下载/引用/批量：✅ 全部完成
- IEEE 搜索/下载/图片/并行：✅ 全部完成
- 万方 CARSI 登录：✅ 两步优化
- 配置文件：❌ 已删除，改环境变量
- IEEE CARSI 登录：❌ 未实现（仅支持机构 IP）

## 项目文件

- `SKILL.md` — Agent 技能描述
- `wanfang/search-download.md` — 万方详细文档
- `wanfang/chapters.md` — 万方分章
- `ieee/search-download.md` — IEEE 详细文档
- `ieee/figures.md` — IEEE 图片
- `shared/setup.md` — 首次设置
- `shared/cross-agent.md` — 跨 Agent 适配
- `登录流程.md` — CARSI 登录流程详解
- `docs/planning/优化计划.md` — 优化计划
