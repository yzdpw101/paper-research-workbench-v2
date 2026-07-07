# Wanfang — 搜索与下载 (Reasonix v2)

## 设计原则

- **搜索不需要登录**，`wf-search.js` 不包含任何登录逻辑
- **下载自管登录**，`wf-download.js` 内部通过 `wf-carsi-login.js` 完成 CARSI 认证
- 机构网络（校园网/VPN）：IP 直接认证，可直接下载
- 非机构网络：需要 CDP Chrome + 已存凭据 + `PAPER_MASTER_KEY`

## Preflight

v2 uses `browser-launcher.js` + `config.js`. `${SKILL_DIR}` resolves automatically. Run `init-wizard.js` once if `.state/.setup-done` is missing.

## Search flow

Wanfang search page contains full abstracts and metadata. Two steps:

```
1. Search → wf-search.js (one-shot) → display (title + type + download availability)
2. User selects → wf-download.js (click + new-tab + download) → file to .state/downloads
```bash

**Display**: Directly output the returned JSON. Do not analyze or recommend.

## Search — one-shot CLI

```bash
node "${SKILL_DIR}/scripts/wf-search.js" \
  --q "<keyword>" \
  --type thesis \
  --page 1 \
  --no-snippet
```bash

- `--q` : Search keyword (**required**)
- `--type` : Resource type — paper | periodical | thesis | conference | patent | nstr | cstad | standard | law (default "paper")
- `--page` : Page number, default 1
- `--no-snippet` : Omit abstract text from results (smaller output)

**Output JSON fields**: `logged`, `totalResults`, `perPage`, `totalPages`, `items[]` (each with `idx`, `key`, `title`, `type`, `hasFull`, `hasDownload`), `activeFilters[]`.

**Decision flow**:

- `logged=false` → warn but continue (may succeed with IP auth)
- `noResults=true` → tell user to change keywords
- Normal → show items, let user pick

## Download

```
node "${SKILL_DIR}/scripts/wf-download.js" \
  --q "<keyword>" \
  --type thesis \
  --idx 0 \
  --save-as "<output-path>.pdf" \
  --timeout 120000
```bash

- `--q` : Search keyword (**required**)
- `--type` : Resource type (**required**)
- `--idx` : 0-based result index (default 0)
- `--page` : Search result page (default 1)
- `--save-as` : Output PDF path
- `--timeout` : Download timeout in ms, default 120000

**环境变量**：非机构网络需设 `PAPER_MASTER_KEY=<key>`。

**Internal flow**:

1. `browser-launcher.js` → launch / connect to browser
2. **Login** (CDP mode): `wf-carsi-login.js` → `checkStatus()` → 已登录则跳过 → `login(page, creds)` 走 CARSI
3. `navigator.js` → navigate to search results
4. Evaluate → mark button with `data-target="wf-dl"`
5. Click `[data-target="wf-dl"]`
6. **Thesis flow**: new tab opens (`f.wanfangdata.com.cn`) → countdown → click "点击此处" → download triggers
7. **Periodical/conference**: download triggers directly
8. CDP fallback: polls Chrome 的下载目录 + 项目下载目录，找到后复制到 `--save-as`

## Type table

|  Type | URL path | Download button  |
| ------|----------|----------------- |
|  All | `paper` | 下载  |
|  Periodical | `periodical` | 下载  |
|  Thesis | `thesis` | 整篇下载 / 分章下载  |
|  Conference | `conference` | 下载  |
|  Patent | `patent` | Some have download  |
|  Sci-tech report | `nstr` | —  |
|  Achievement | `cstad` | —  |
|  Standard | `standard` | Some have download  |
|  Regulation | `law` | —  |

## Pagination

URL `p=<N>` does **not** work — SPA resets to p=1. Use bottom-pagination clicks via evaluate:

```bash
node "${SKILL_DIR}/scripts/eval.js" \
  --url "https://s.wanfangdata.com.cn/<type>?q=<encoded>&p=<N>" \
  --wait 1000 \
  --code "()=>{const btn=document.querySelector('.bottom-pagination .next');if(btn)btn.click();return{advanced:true};}"
```

After page change, re-run `wf-search.js` to get new results.

## Filters (client-side checkboxes)

### Step 1: Query available filters

```
node "${SKILL_DIR}/scripts/eval.js" \
  --url "https://s.wanfangdata.com.cn/<type>?q=<encoded>" \
  --wait 2000 \
  --code "()=>{document.querySelectorAll('.facet-list-box .title, [class*=facet] h3').forEach(h=>h.click());const v=[];document.querySelectorAll('label.ivu-checkbox-wrapper .words').forEach(w=>{const t=(w.textContent| |'').trim();if(t&&t.length<50)v.push(t);});return[...new Set(v)];}"
```bash

### Step 2: Check desired filters + confirm

```bash
node "${SKILL_DIR}/scripts/run.js" --code-file /tmp/wf-filter.js
```bash

Where `/tmp/wf-filter.js`:

```js
const CHECKS=['2024','2023','硕士'];
await page.goto('URL',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2000);
const allLabels=await page.locator('label.ivu-checkbox-wrapper').all();
let toggled=0;
for(const label of allLabels){
  const w=label.locator('.words');if(await w.count()===0)continue;
  const val=(await w.first().textContent())?.trim()| |'';
  const isChecked=await label.evaluate(el=>el.className.includes('ivu-checkbox-wrapper-checked'));
  for(const c of CHECKS){if(val.includes(c)&&!isChecked){await label.evaluate(el=>el.click());toggled++;break;}}
}
await page.waitForTimeout(500);
const btn=page.locator('span.fixed-btn-submit:has-text("确定")');
if(await btn.count()>0){await btn.first().click();await page.waitForTimeout(1000);}
return {toggled};
```bash

After applying filters, re-run `wf-search.js` for filtered results.

## Parallel search (multi-keyword)

```bash
node "${SKILL_DIR}/scripts/parallel-search.js" \
  --q "keyword1,keyword2,keyword3" \
  --platform wanfang \
  --parallel 3 \
  --no-snippet
```bash

- `--q` : Comma-separated keywords (**required** unless `--queries`)
- `--platform` : `ieee` or `wanfang` (default: `ieee`)
- `--queries` : JSON file with `[{keyword, platform, options}]` objects
- `--parallel` : Max concurrency (default: from config)
- `--no-snippet` : Omit abstract text (Wanfang only)

## Login

`wf-download.js` 在 CDP 模式下自动调用 `wf-carsi-login.js`：

1. `retrieve('wanfang')` → 从加密保险库读取凭据
2. `checkStatus(page)` → 检测当前页面是否已登录（header 限制检测，不搜全 body）
3. 未登录 → `login(page, creds)` → 走完整 CARSI SSO 流程（Step 1-5）
4. 已登录 → 直接跳过

**CARSI 登录独立 CLI**（首次登录或重新认证）：

```
PAPER_MASTER_KEY=<key> node "${SKILL_DIR}/scripts/wf-carsi-login.js" --port=9222 --timeout=60000
```

**凭据管理**：存在 `.state/credentials.json.enc`（AES-256-GCM 加密），需 `PAPER_MASTER_KEY` 解密。key 通过 PAPER_MASTER_KEY 环境变量提供。

## Citation（CDP 模式）

每条搜索结果有"引用"按钮（`div.wf-button-quote`），点击弹出"导出题录"模态框，提供多种引用格式。

```bash
node "${SKILL_DIR}/scripts/wf-cite.js" --q "关键词" --type thesis --idx 0 --format gb7714
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--q` | **必填** | 搜索关键词 |
| `--type` | `paper` | 资源类型 |
| `--idx` | `0` | 第几条结果 |
| `--format` | `gb7714` | gb7714 / mla / apa |
| `--port` | `9222` | CDP 端口 |

**DOM 结构**：
- 按钮：`div.wf-button-quote`（每条结果一个）
- 模态框：`div.ivu-modal` → 标题"导出题录"
- GB/T 7714：`p.export-reference-title` → `div.export-reference span`
- 关闭：`a.ivu-modal-close`

**注意**：必须 CDP 模式（Vue 组件依赖已渲染的页面状态），不支持 launch 模式。

## Wanfang don'ts

- Never `request.fetch` / `route.fetch` / `page.goto` for downloads — only real click → download capture
- Never click the same button twice without checking result
- Login expired: thesis buttons degrade from 整篇下载/分章下载 to bare 下载 → stop
- URL `p=<N>` never works for pagination — SPA resets, use element clicks
- Never assume `hasChapter=true` means hierarchical bookmarks — diagnose tier first

## 批量操作（CDP 模式，待实现脚本）

### 勾选机制

每条结果左侧有勾选框，结构为 `label.ivu-checkbox-wrapper > input.ivu-checkbox-input`（input 被 CSS 隐藏）。

```js
// 必须用 force:true，input 被 CSS 隐藏
page.locator('div.normal-list input.ivu-checkbox-input').nth(0).click({force:true});
```

选中后工具栏显示"已选择 N 条"，旁有**全选/全不选**勾选框和三个按钮：清除 / 批量引用 / 批量下载。

### 批量引用

点击"批量引用" → **新标签页**打开 `https://www.wanfangdata.com.cn/export`。
页面按 GB/T 7714 列出所有已选文献的引用，提供"复制"按钮和多种格式切换（MLA、APA、NoteExpress、EndNote 等）。

### 批量下载

点击"批量下载" → **新标签页**打开 `https://s.wanfangdata.com.cn/batchdownload`。
页面列出可下载文献，点击"开始下载"触发打包下载。

**限制**：
- 仅支持期刊文献（有全文），学位论文不支持（弹窗"所选论文均不满足批量下载条件"）
- 单次最多 10 篇
- 下载过程勿关闭页面

### 实现要点

- **必须 CDP 模式**：勾选依赖 Vue 组件状态，跨标签页操作需同一 Chrome 实例
- 勾选用 `{force:true}` 点击隐藏的 checkbox input
- 批量引用/下载按钮通过 `span.export-btn` 定位
- 操作后需切换标签页：`browser.contexts()[0].pages()` 遍历找到目标 URL
