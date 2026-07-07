---
tags: [windows, security, crypto, dpapi]
---

# DPAPI — Windows 数据保护 API

## 是什么

DPAPI (Data Protection API) 是 Windows 内置的加密服务，提供**无需管理密钥**的数据加密/解密。密钥由 Windows 自动管理，绑定到用户账户（或机器）。

## 两种模式

| 模式 | 范围 | 使用场景 |
|------|------|---------|
| `CurrentUser` | 当前用户 | 用户个人数据（推荐） |
| `LocalMachine` | 本机所有用户 | 服务/共享数据 |

## Node.js 集成方案

### 方案 1：`win-dpapi` 原生模块（推荐 ✅）

```javascript
const dpapi = require('win-dpapi');

// 加密
const encrypted = dpapi.protectData(
  Buffer.from('my secret'),
  null,                     // optional entropy
  'CurrentUser'
);

// 解密
const decrypted = dpapi.unprotectData(encrypted, null, 'CurrentUser');
console.log(decrypted.toString());  // 'my secret'
```

**优点：** 直接调用 Windows API，性能好，安全
**缺点：** 需要编译原生模块（node-gyp），Windows 专有

### 方案 2：PowerShell 桥接

```javascript
const { execSync } = require('child_process');

function protectViaPowerShell(plaintext) {
  const cmd = `powershell -NoProfile -Command "ConvertTo-SecureString '${plaintext}' -AsPlainText -Force | ConvertFrom-SecureString"`;
  return execSync(cmd).toString().trim();
}

function unprotectViaPowerShell(encrypted) {
  const cmd = `powershell -NoProfile -Command "(ConvertTo-SecureString '${encrypted}' | ConvertFrom-SecureString -AsPlainText)"`;
  // 注意：此方式仅在加密的同一用户账户下有效
}
```

**优点：** 无需编译，Windows 自带
**缺点：** 较慢（启动 PowerShell），特殊字符转义风险

## 推荐策略

```
主密钥来源优先级：
1. win-dpapi (DPAPI CurrentUser)    ← 最佳（推荐）
2. 环境变量 PAPER_MASTER_KEY        ← CI/自动化
3. 交互式输入主密码                  ← fallback
```

## 安全考虑

- DPAPI 密钥绑定到 Windows 用户密码 → 换用户/重装系统后失效
- `CurrentUser` 模式同一用户的进程可解密 → 进程隔离不是问题
- 不提供跨设备/跨用户可移植性（如需可移植，用户应用环境变量方案）

## 对我们的意义

- `credential-vault.js` 优先使用 DPAPI 保护主密钥
- 降级方案：环境变量 → 交互密码
- 如果无法安装 `win-dpapi`，使用 PowerShell 桥接

## 相关笔记

- [[AES-256-GCM 加密]]
