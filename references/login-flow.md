# 万方 CARSI 登录流程

脚本实现在 `scripts/wf-carsi-login.js`，导出 `login(page, creds)` 和 `checkStatus(page)`。

## 完整流程（无任何会话 Cookie）

```
Step 1: 万方首页 → 点击"登录 / 注册" → 找到登录 iframe
Step 2: iframe 内点击"校外访问" → 跳转 FSSO (fsso.wanfangdata.com.cn)
Step 3: FSSO 搜机构名（如"南京理工大学"）→ 点击 → 跳转 SSO (idp.njust.edu.cn/e1s1)
Step 4: SSO 页填账号密码 → 点击"登录" → 提交
Step 5: 授权页 (e1s2) → 勾选 + Accept → 跳回万方
```

耗时约 60-90 秒。

## SSO 会话有效（已提交过凭据，但 Chrome 无 Cookie）

Chrome 重启后，SSO 会话在南京理工服务器端仍有效。流程缩短：

```
Step 1: 万方首页 → 点击"登录 / 注册" → 找到 iframe
Step 2: iframe 内点击"校外访问" → FSSO 跳转 → 秒回万方（SSO 会话有效）
Step 3: FSSO 搜机构 → 发现已回到万方 → 直接返回成功 ✅
```

Step 3~5 全部跳过。耗时约 20-30 秒。

## Chrome Cookie 有效（已完整登录过）

Chrome CDP profile 中有万方的登录 Cookie。此时：

```
Step 1: 万方首页 → "登录 / 注册" 按钮可能已被机构名替代
         → 点击登录 → 可能找不到登录按钮（已登录状态）
         → 需要 `checkStatus()` 前置检测
```

如果 `checkStatus` 检测到"退出登录"则直接跳过全流程。

## 第 7~8 步可能跳过

南京理工的 SSO 在初次授权后，后续登录不显示 e1s2 授权页。脚本在 Step 5 做判断：
- 页面 URL 含 `execution=e1s2` → 走授权流程
- 否则 → 跳过（"authorization skipped"）

## 登录入口不限于主页

脚本当前从万方首页发起登录（`goto https://www.wanfangdata.com.cn/`），但实际上：

- 搜索页、论文详情页也有"登录 / 注册"入口
- 登录完成后会**跳回当前页面**（万方 CARSI 的 RelayState 机制）
- 未来可优化：在搜索页发起登录，节省一次导航

## 检测登录状态

`checkStatus(page)` 在 header/topbar 区域检测：

| header 内容 | 判定 |
|---|---|
| 有"退出登录" | 已登录 |
| 有"登录"或"注册"（且无"退出登录"） | 未登录 |
| 都没有 | 未登录 |

不再用正则匹配机构名（容易误判）。

# IEEE 登录流程

IEEE 仅支持机构网络 IP 认证，无 CARSI/CDP 登录。

## 机构网络

1. 页面自动显示 "Access provided by XXX University"
2. 搜索/下载均可用

## 非机构网络

`ieee-download.js` 调用 `network-detector.isInstitutionalAccess()` 检测，非机构网络时仅警告不阻塞。下载需要用户自行连接校园网/VPN。

# 注意事项

1. 首次 CARSI 登录后 e1s2 授权页只出现一次，后续不出现
2. SSO 会话有效期约数小时，过期后需重新填账号密码
3. 测试前检查 Chrome 是否已登录：看右上角是"登录 / 注册"还是机构名
4. 已登录时建议清除 Cookie 后再测试，避免假通过
