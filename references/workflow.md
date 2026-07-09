# 标准工作流

## 核心流程

```
搜索 → 筛选 → 详读 → 下载/引用
```

每一步都是独立脚本，不合并调用。

## 机构网络

```bash
# 1. 搜索（不需要登录）
node scripts/wf-search.js --q "关键词" --type thesis --rows 5
node scripts/ieee-search.js --q "keyword" --type Journals --year 2023-2025 --rows 5

# 2. 查看详情（获取完整摘要、作者、DOI 等）
node scripts/wf-detail.js --url "<搜索结果中的URL>"
node scripts/ieee-detail.js --arnumber <N>

# 3. 下载（机构网络直接下）
node scripts/wf-download.js --q "关键词" --type thesis --idx 0 --save-as "paper.pdf"
node scripts/ieee-download.js --arnumber <N> --save-as "paper.pdf"

# 4. 批量引用/下载
node scripts/ieee-batch-cite.js --q "keyword" --ids "0-4" --format bibtex --save-as "cite.txt"
node scripts/ieee-batch-download.js --q "keyword" --ids "0-2" --save-as "papers.zip"
```

## 非机构网络

```bash
# 0. 启动 CDP Chrome（用户手动）
scripts\open-cdp.bat chrome

# 1. CARSI 登录
$env:PAPER_MASTER_KEY="your-key"
node scripts/wf-carsi-login.js --port=9222
node scripts/ieee-carsi-login.js --port=9222

# 2-4. 同上，所有命令加 --mode cdp
node scripts/wf-download.js --mode cdp --q "..." --idx 0 --save-as "..."
```

## 分章下载

```bash
# 1. 分析（展开全部章节树）
node scripts/wf-chapter.js --action analyze --q "关键词" --idx 0

# 2. 下载（按 ID 选择）
node scripts/wf-chapter.js --action download --q "关键词" --idx 0 --ids "6-10" --save-as "chapters.zip"
```

## 注意事项

- `--no-snippet` 省略摘要，默认行为是**包含摘要**。想省 token 才加
- 搜索结果中的 snippet 是**截断的**，不能当作完整文本分析
- 下载前**先问用户网络环境**（机构/非机构/不确定）
- IEEE 详情页可能出现 "Access not detected" 提示——不影响搜索，只影响下载
- 万方分章下载的 `--ids` 来自 analyze 输出的节点编号
