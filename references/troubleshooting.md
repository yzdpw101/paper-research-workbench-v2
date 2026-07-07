# 已知问题与解决方案

以下是从实际使用中积累的已知问题，按症状分类。

## 浏览器兼容

### Chrome headless 被万方屏蔽

**症状**：万方搜索返回空白页或 `SELECTOR_NOT_FOUND`

**原因**：万方对 Chrome headless 的检测较严，会返回空白页或屏蔽请求。

**解决**：搜索默认使用 Firefox headless（`PAPER_BROWSER_DEFAULT=firefox`）。Firefox headless 的浏览器指纹更友好，不容易触发屏蔽。

### IEEE Error 418

**症状**：IEEE 返回 `Error 418: Unusual Traffic Detected`

**原因**：IEEE 检测到 headless 浏览器流量特征。

**解决**：切换到 CDP 模式（连接真实桌面 Chrome），或尝试 Firefox headless。

### Firefox + 非机构网络不支持

**症状**：`Firefox not supported on non-institutional network`

**原因**：Firefox 不支持 CDP（Chrome DevTools Protocol），非机构网络下无法共享登录状态。

**解决**：切换到 Chrome 或 Edge + CDP 模式。

## 登录

### 登录态误报（已修复）

**症状**：搜索结果正常但下载失败，显示"需要登录"

**原因**：`network-detector.js` 的旧版本在整个 body 中用正则搜索机构名（如「大学」「图书馆」），万方页脚的合作机构链接导致误判为「已登录」。搜索结果 `accessReady: false` 即表示未真正登录。

**修复**：`extractInstitution` 改为只搜索 header/topbar 元素，同时增加「退出登录」按钮检测作为登录态验证。

### SSO 授权页跳过

**症状**：首次 CARSI 登录需要经过 e1s2 授权页，后续登录不需要

**说明**：南京理工等机构的 SSO 在初次授权后缓存授权决定，后续登录自动跳过 e1s2。`wf-carsi-login.js` 已处理此情况：页面 URL 含 `execution=e1s2` 时走授权流程，否则跳过。

### SSO 会话过期

**症状**：CARSI 登录需要重新输入账号密码

**原因**：机构 SSO 服务器端会话有效期约数小时，过期后需重新认证。

**解决**：重新运行 `wf-carsi-login.js`，脚本会自动处理完整流程。

## 下载

### CDP 模式下载文件找不到

**症状**：下载脚本超时，但文件实际已在 Chrome 默认下载目录中

**原因**：CDP 模式下 Playwright 连接已有 Chrome，无法拦截下载事件。Chrome 将文件存到自己的默认下载目录。

**修复**：`wf-download.js` 的 `getCDPDownloadDir()` 会读取 Chrome Preferences 获取实际下载目录，CDP 模式下同时轮询该目录和项目下载目录，找到文件后自动复制到 `--save-as` 路径。

### 万方下载按钮退化

**症状**：按钮从「整篇下载」变为普通文本

**原因**：登录会话过期或 IP 认证失效。

**解决**：重新登录（机构网络重新连接 VPN，非机构网络重新运行 CARSI 登录）。

## 环境

### Playwright 未安装

**症状**：`Error: Cannot find module 'playwright'`

**解决**：`npm install playwright`

### 浏览器二进制未下载

**症状**：`Firefox not found` 或 `Chromium not found`

**解决**：
```bash
npx playwright install firefox    # Firefox
npx playwright install chromium   # Chromium（Chrome/Edge 用系统安装）
```

### CDP 连接被拒绝

**症状**：`CDP connection refused`

**解决**：先运行 `scripts/launch-cdp.js chrome` 启动带 CDP 端口的 Chrome。

### SSL 证书错误（Firefox + CARSI）

**症状**：Firefox 下 CARSI 登录报 SSL 错误

**原因**：Firefox 对某些机构自签名证书比较严格。

**解决**：切换到 Chrome/Edge 进行 CARSI 登录。

## CDP 下载目录

CDP 模式下脚本无法拦截 Chrome 下载事件，需要知道 Chrome 把文件下到哪个目录才能轮询检测。

**探测逻辑**（`getCDPDownloadDir()`）：
1. 读取 `.state/profiles/<browser>-cdp/Default/Preferences`
2. 提取 `download.default_directory` 或 `savefile.default_directory`
3. 都找不到时 fallback 到 `~/Downloads`

**常见问题**：删除了 `.state/profiles/chrome-cdp/` 后重建，新 Chrome profile 没有自定义下载目录，使用系统默认（Windows 的"下载"文件夹）。如果用户改了 Windows 下载文件夹位置（如 `E:\Downloads`），fallback `~/Downloads` 指向的是 `C:\Users\<name>\Downloads`，可能不对。

**验证方法**：运行 `node scripts/detect-cdp-download.mjs` 查看实际读取到的下载目录。或手动检查：
- 打开 CDP Chrome → 设置 → 下载内容 → 位置
- 或查看 `chrome://version/` 中的 Profile Path → 同目录下的 `Preferences` 文件
