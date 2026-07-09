# IEEE Xplore 自动化

## IEEE CARSI 登录

IEEE 使用 SeamlessAccess 弹窗（`service.seamlessaccess.org`），但可通过直达 URL 跳过：

```
https://ieeexplore.ieee.org/servlet/wayf.jsp?entityId=https://idp.njust.edu.cn/idp/shibboleth
```

直接重定向到机构 SSO 登录页（`e1s1`），后续流程和万方完全一致：

1. e1s1 → 填账号密码 → 登录
2. e1s2 → Accept
3. 回到 IEEE Xplore

**脚本**：`ieee-carsi-login.js`，复用 `wf-carsi-login.js` 的 `login()` 函数，仅入口 URL 不同。

## 批量引用导出（无需登录）

**流程**：
1. 搜索论文
2. 勾选目标论文（或点击 "Select All on Page"）
3. 点击 "Export" → 弹出内部弹窗
4. 选择 "Citations" 标签 → 选格式 → 点击 "Download"
5. 下载 `.txt` 文件

**关键 DOM**：
- Select All: `label.results-actions-selectall` → 内含 checkbox
- 单篇勾选: `input[aria-label="Select search result"]`
- Export 按钮: `li.export-filter` 或 `button:has-text("Export")`
- 弹窗中 Citations 标签
- 格式选项: Plain Text / BibTeX / RIS / RefWorks
- Download 按钮

**脚本**：`ieee-batch-cite.js --q "..." --ids "0-4" --format bibtex`

## 批量 PDF 下载（需要登录）

**流程**：
1. 先完成 CARSI 登录（`ieee-carsi-login.js`）
2. 搜索论文
3. 勾选目标论文（最多 10 篇，500MB 上限）
4. 点击 "Download PDFs"
5. 弹出确认弹窗 → 点击 "Download"
6. 弹出"Download Confirmation" → 关闭
7. 下载 `.zip` 文件

**关键 DOM**：
- Download PDFs 按钮（勾选后出现）
- 确认弹窗中的 Download 按钮
- Download Confirmation 弹窗的关闭按钮

**脚本**：`ieee-batch-download.js --q "..." --ids "0-4" --save-as "..." --mode cdp`
