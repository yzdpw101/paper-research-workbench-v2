# Paper Research Workbench — 功能边界

## 网络环境

| 环境 | 浏览器 | 搜索 | 下载 | 登录 |
|------|--------|------|------|------|
| 机构网络（校园网/VPN） | Chrome headless | ✅ | ✅ 直接下载 | 不需要 |
| 非机构网络 | Chrome CDP | ✅ CDP | ✅ 需 CARSI | `wf-carsi-login.js` / `ieee-carsi-login.js` |

Chrome headless 反检测：伪装 Firefox UA + 移除 webdriver 标记 + 禁用自动化控制提示。

### CARSI 登录适用范围

SSO 自动填表逻辑（`wf-carsi-login.js` 中的 `ssoLogin()`）基于南京理工大学 SSO 页面编写，选择器为 `#username`、`#password`、`button[name="_eventId_proceed"]`。其他机构的 SSO 登录页可能存在差异——输入框的 `id`/`name` 不同、按钮文本不同、或流程步骤不同。切换机构时可能需要调整这些选择器。

## 平台能力矩阵

| 功能 | 万方 | IEEE |
|------|------|------|
| 搜索 | ✅ | ✅ |
| 单篇下载 | ✅ | ✅ |
| CARSI 登录 | ✅ 完整自动化 | ✅ 直达 SSO（`ieee-carsi-login.js`） |
| 分章下载 | ✅ 两步 | — |
| 引用提取 | ✅（需登录） | — |
| 批量引用 | ✅ | ✅（不需登录） |
| 批量下载 | ✅ | ✅（需登录，≤10篇） |
| 图表提取 | — | ✅ |

## CDP 模式须知

**启动**：bash shell 无法启动 GUI，需用户手动运行 `scripts\open-cdp.bat chrome`。

**下载检测**：CDP 模式 Playwright 无法拦截 Chrome 下载事件，脚本轮询文件系统：
1. 读取 `.state/profiles/chrome-cdp/Default/Preferences` 获取 Chrome 下载目录
2. 找不到时扫描所有 profile 目录
3. 都找不到时 fallback 到 `~/Downloads`

**常见问题**：
- 删除 `profiles/chrome-cdp` 后重建，Chrome 下载目录重置为系统默认
- 如果 Windows 下载文件夹被重定向（如 `E:\Downloads`），fallback 可能不对
- 调试工具：`node scripts/detect-cdp-download.mjs`
- 调试时加 `--show` 参数可显示浏览器窗口

**退出**：CDP 模式 `browser.close()` 只是断开连接。脚本打印结果后 3 秒兜底 `process.exit(0)`。

## 凭据安全

- 凭据经 AES-256-GCM 加密存储在 `.state/credentials.json.enc`
- 主密钥通过 `PAPER_MASTER_KEY` 环境变量提供，不存储在磁盘
- AI 全程只接触密文，明文凭据仅在 Playwright 浏览器内存中流转

## 不支持的功能

- CARSI 自动登录仅验证南京理工大学，其他机构 SSO 页面可能需调整选择器
- 万方分章下载的一步完成（必须两步：先 analyze 再 download）
- CDP 模式下自动启动 Chrome（需用户手动 `open-cdp.bat`）
- 批量下载前建议先跑 wf-detail.js 确认每篇论文的 download 字段（部分论文不支持下载）
