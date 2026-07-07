---
tags: [crypto, aes, security]
---

# AES-256-GCM 加密

## 算法简介

AES-256-GCM 是一种**认证加密**（AEAD）算法，同时提供：
- **机密性**：AES-256 加密（256 位密钥）
- **完整性/认证**：Galois/Counter Mode (GCM) 的认证标签

## 选择理由

| 特性 | AES-256-GCM | AES-256-CBC + HMAC | ChaCha20-Poly1305 |
|------|:---:|:---:|:---:|
| 认证加密 | ✅ 内置 | ❌ 需额外 HMAC | ✅ 内置 |
| Node.js 支持 | ✅ `crypto` | ✅ `crypto` | ✅ (v10+) |
| 性能 | 快（硬件加速） | 慢（需两次遍历） | 中 |
| 标准化 | NIST SP 800-38D | NIST SP 800-38A | RFC 8439 |

→ **AES-256-GCM 是 Node.js 加密凭据的最佳选择。**

## Node.js 实现

```javascript
const crypto = require('crypto');

// 加密
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);  // GCM 推荐 12 字节 IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted
  };
}

// 解密
function decrypt(encryptedData, key, iv, authTag) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  
  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');  // 验证 authTag
  return decrypted;
}
```

## 重要安全细节

1. **IV 必须唯一** — 每个加密操作使用新的随机 IV（`crypto.randomBytes(12)`）
2. **Auth Tag 验证** — `decipher.final()` 会自动验证，篡改会抛异常
3. **密钥管理** — 256 位密钥不能硬编码，需通过 KDF 派生

## 密钥派生 (PBKDF2)

```javascript
const crypto = require('crypto');

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(
    password,
    salt,
    100000,   // iterations（OWASP 推荐 ≥ 100,000）
    32,       // key length = 256 bits
    'sha256'
  );
}
```

## 对我们的意义

- `credential-vault.js` 使用 AES-256-GCM 加密凭据
- 主密钥通过 PBKDF2 从用户密码 / DPAPI / 环境变量派生
- IV + Auth Tag 确保完整性和防篡改

## 相关笔记

- [[DPAPI Windows 数据保护]]
