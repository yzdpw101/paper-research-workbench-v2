# IEEE 图片下载 (Reasonix v2)

使用专用 `ieee-figures.js` 一步完成：导航到详情页 → 点击 Figures 标签 → 提取图片 URL → **并行下载**（context-pool.js）。

## 用法

```
node "${SKILL_DIR}/scripts/ieee-figures.js" \
  --arnumber <n> \
  --out-dir "<dir>" \
  --parallel 5
```

### 参数

|   参数 | 默认 | 说明   |
|  ------|------|------  |
|   `--arnumber` | **必填** | 论文 arnumber   |
|   `--out-dir` | **必填** | 输出目录   |
|   `--parallel` | `3` | 并行下载数   |

### 全局参数

|   参数 | 说明   |
|  ------|------  |
|   `--browser <firefox\|chrome\|msedge>` | 临时切换浏览器   |
|   `--no-kill` | 不杀残留进程   |
|   `--mode cdp` | CDP 连接已有浏览器   |
|   `--cdp-port <n>` | CDP 端口 (默认 9222)   |
|   `--debug` | 调试模式   |

## 示例

```
# 下载所有图片到桌面
node "${SKILL_DIR}/scripts/ieee-figures.js" \
  --arnumber 9134643 \
  --out-dir "~/Desktop/figs"

# 高并发模式（5 个并行任务）
node "${SKILL_DIR}/scripts/ieee-figures.js" \
  --arnumber 9134643 \
  --out-dir "~/Desktop/figs" \
  --parallel 5
```

## 返回值

```json
{
  "ok": true,
  "arnumber": "9134643",
  "figureCount": 8,
  "saved": 8,
  "failed": 0,
  "files": [
    {"name": "kedar1-p4-kedar.gif", "path": "~/Desktop/figs/kedar1-p4-kedar.gif", "size": 38217},
    ...
  ]
}
```

部分失败时 `failed > 0`，`files` 仍包含成功下载的文件。

## 内部流程

1. `browser-launcher.js` → 启动浏览器（headless 默认 true）
2. `navigator.js` → 导航到 `ieeexplore.ieee.org/document/<arnumber>/`
3. `auto-login.js` → `ensureLoggedIn` 检测/自动登录
4. 点击 Figures 标签 → 提取 `<img>` 的 `src`，优先选 `-large` 后缀版本
5. `context-pool.js` → 创建 N 个独立 context，并行 `fetch` 下载
6. 保存到 `--out-dir`，返回汇总 JSON

## 注意

- 只有论文详情页有 Figures 标签，搜索结果页没有
- 优先用 `-large` 版本图片
- IEEE 图片通常是 GIF 格式
- 下载前确保已登录机构账号（或 CDP 模式连接已登录浏览器）
- v2 并行下载：10 张图片从 ~30s 降至 ~8s（3x+ speedup）
- 非机构网络：Firefox 不行，用 Chrome/Edge + CDP
