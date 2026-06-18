---
name: "panasonic-oneid-crypto"
description: "松下oneid CSV文件AES-256-CBC加解密。当用户需要加密或解密松下oneid相关的CSV文件时使用。"
---

# 松下OneID CSV文件加解密

## 加密算法
- **AES-256-CBC**，PKCS7填充
- 整个CSV文件内容作为一个整体进行加密，输出为单行base64字符串

## 密钥信息
- **Key (hex)**: `9D14FF7C7EC1613F70992330365DB36989C463E9D09E7B6669F97E9ACA5064C4`
- **IV (hex)**: `B6BFE5681476D3D21F3641A72B6667BC`

## 加密流程
1. 读取CSV文件全部内容（UTF-8编码）
2. 将文本转为UTF-8字节
3. 使用PKCS7填充至AES块大小（16字节）的整数倍
4. 使用AES-256-CBC加密
5. 将加密结果base64编码
6. 将base64字符串写入输出文件（单行，无换行）

## 解密流程
1. 读取加密文件（单行base64字符串）
2. base64解码为字节
3. 使用AES-256-CBC解密
4. 去除PKCS7填充
5. UTF-8解码为文本
6. 写入输出文件

## Python实现参考

```python
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

AES_KEY = bytes.fromhex('9D14FF7C7EC1613F70992330365DB36989C463E9D09E7B6669F97E9ACA5064C4')
AES_IV = bytes.fromhex('B6BFE5681476D3D21F3641A72B6667BC')

def encrypt_file(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        plaintext = f.read()
    plaintext_bytes = plaintext.encode('utf-8')
    padded = pad(plaintext_bytes, AES.block_size)
    cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_IV)
    encrypted = cipher.encrypt(padded)
    encrypted_b64 = base64.b64encode(encrypted).decode('utf-8')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(encrypted_b64)

def decrypt_file(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8-sig') as f:
        encrypted_b64 = f.read().strip()
    encrypted_bytes = base64.b64decode(encrypted_b64)
    cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_IV)
    decrypted_padded = cipher.decrypt(encrypted_bytes)
    decrypted = unpad(decrypted_padded, AES.block_size)
    plaintext = decrypted.decode('utf-8')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(plaintext)
```

## 使用场景
- 加密松下oneid增量标签CSV文件后上传至对方系统
- 解密松下oneid系统传来的加密CSV文件
