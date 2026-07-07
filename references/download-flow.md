# 下载前网络环境判断

## 为什么要先确认网络

下载需要认证，但认证方式取决于网络环境：

- **机构网络**（校园网/机构 VPN）：IP 自动认证，直接下载即可
- **非机构网络**：需要通过 CARSI SSO 登录（仅万方支持），且必须使用 CDP 模式连接桌面 Chrome

如果网络环境不匹配，下载会静默失败——页面可能显示"需要登录"而非 PDF。

## 判断流程

用户说"下载"时，先问：

> 你当前是什么网络环境？
> ① 机构网络（校园网/机构 VPN，IP 直接认证）
> ② 非机构网络（已存凭据 + CDP Chrome）
> ③ 不确定

### ① 机构网络 → 直接下载

```bash
node ${SKILL_DIR}/scripts/wf-download.js --q "..." --type thesis --idx 0 --save-as "..."
node ${SKILL_DIR}/scripts/ieee-download.js --arnumber 1234567 --save-as "..."
```

`--mode` 默认 `launch`，headless 浏览器直接工作。不需要额外参数。

### ② 非机构网络 → CDP 三步

```bash
# Step 1: 启动 CDP Chrome
scripts/launch-cdp.js chrome

# Step 2: CARSI 登录（仅万方）
PAPER_MASTER_KEY=<key> node ${SKILL_DIR}/scripts/wf-carsi-login.js --port=9222

# Step 3: 下载（--mode cdp）
PAPER_MASTER_KEY=<key> node ${SKILL_DIR}/scripts/wf-download.js --mode cdp --q "..." --type thesis --idx 0 --save-as "..."
```

> **IEEE + 非机构网络**：IEEE 不支持 CARSI，仅支持机构 IP。非机构网络下 `ieee-download.js` 会警告但不会阻塞——用户需自行连接校园网/VPN。

### ③ 不确定 → 先搜索验证

搜索不需要登录。先跑搜索看能否正常返回结果：

```bash
node ${SKILL_DIR}/scripts/wf-search.js --q "测试关键词" --type thesis --page 1 --rows 5
```

- 搜索返回正常结果 → 说明网络连通，但还需确认是否有下载权限。按 ② 非机构网络流程走。
- 搜索结果 `accessReady: false` → 当前不是机构网络，按 ② 流程走。

## 登录状态检测

`network-detector.js` 的 `checkWanfangInstitution()` 在 header/topbar 区域检测登录状态：

| 检测到 | 判定 |
|---|---|
| 「退出登录」按钮 | 已登录 ✅ |
| 「登录」或「注册」（且无「退出登录」） | 未登录 |
| 都没有 | 未登录 |

不再在整个 body 中搜索机构名（之前因此误判过——万方页脚友情链接中含合作机构名）。

## 凭据存储

凭据以 AES-256-GCM 加密存储在 `.state/credentials.json.enc`。需要 `PAPER_MASTER_KEY` 环境变量才能解密。AI 只能看到密文，明文凭据仅在浏览器内存中流转。
