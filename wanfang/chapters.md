# 万方分章节下载

仅限硕博论文。两步完成：先分析章节树，再按 ID 下载。

## Step 1: 分析

```bash
node "${SKILL_DIR}/scripts/wf-chapter.js" \
  --action analyze \
  --q "<关键词>" --idx 0 [--mode launch|cdp]
```

展开全部章节树，输出 JSON。例如 `--mode cdp`（非机构网络，需先启动 CDP Chrome + CARSI 登录）。

输出示例：
```json
{
  "action": "analyze",
  "totalNodes": 43,
  "nodes": [
    {"id": 5, "title": "第一章 绪论10-10页"},
    {"id": 6, "title": "1.1 研究工作的背景与意义10-11页"},
    {"id": 7, "title": "1.2 国内外研究历史与现状11-16页"},
    ...
  ]
}
```

## Step 2: 下载

```bash
node "${SKILL_DIR}/scripts/wf-chapter.js" \
  --action download \
  --q "<关键词>" --idx 0 \
  --ids "6,7,11,12" \
  --save-as "<输出路径>.zip" [--mode cdp]
```

`--ids` 为 Step 1 输出中要下载的节点 ID（逗号分隔）。勾选后点击"确认下载"，等待 ZIP 完成并复制到 `--save-as`。

## 参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--action` | `analyze` | `analyze` 展开全树输出 JSON；`download` 按 ID 下载 |
| `--q` | **必填** | 搜索关键词 |
| `--idx` | `0` | 第几篇（0-based） |
| `--ids` | — | 要下载的节点 ID，逗号分隔（仅 download） |
| `--save-as` | 自动命名 | 输出路径 `.zip`（仅 download） |
| `--timeout` | `120000` | 超时毫秒数 |
| `--mode` | `launch` | `launch` 或 `cdp` |
| `--browser` | `chrome`(cdp) | 浏览器类型 |
| `--cdp-port` | `9222` | CDP 端口 |

## 内部流程

1. 搜索关键词 → 获取结果列表
2. 点击第 `--idx` 项的「分章下载」
3. 等待分章页打开（`part/thesis` 或 `chapter` URL）
4. **analyze**: 递归展开所有 `.ivu-tree-arrow` → 输出完整节点列表
5. **download**: 展开全树 → 按 `--ids` 勾选 checkbox → 点击「确认下载」→ CDP 模式轮询文件系统 → 复制 ZIP 到目标路径
