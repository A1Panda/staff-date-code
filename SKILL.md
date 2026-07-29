---
name: personnel-date-encoder
description: Use when encoding/decoding employee+date into shortest possible character codes (3-char base64), or when maintaining the personnel-date encoding web tool.
version: 1.0.0
author: 高晨翔
license: MIT
---

# 人员日期编码工具

将员工 + 月日压缩为最短字符编码（3字符），双向转换。

入口：`index.html`（纯前端单文件，双击浏览器打开）
参考实现：`encoder.py`（独立可运行的 Python 版本）
数据源：`人员名单.xlsx`（员工姓名）

## 编码规则

```
最终整数 = 员工索引(0~N-1) × 372 + (月-1)×31 + (日-1)
编码字符串 = base64(最终整数)
```

- 月日组合：12×31 = 372 种
- 字符集：`0-9 A-Z a-z - _` 共 64 个字符
- 37 人 → 编码 **3 字符**
- ≤11 人 → 2 字符，≤704 人 → 3 字符，≤45000 人 → 4 字符

### 示例

| 员工 | 日期 | 编码 | 说明 |
|------|------|------|------|
| #01 韩东昊 | 1月1日 | `0` | 索引0，月日值0 |
| #01 韩东昊 | 7月29日 | `3M` | 索引0，月日值209 |
| #29 高晨翔 | 7月29日 | `2gO` | 索引28，月日值209 |
| #37 谷美灵 | 12月31日 | `3N3` | 索引36，月日值371 |

### 编码/解码实现

```python
ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
BASE = 64

def to_b64(n: int) -> str:
    if n == 0: return ALPHABET[0]
    chars = []
    while n > 0:
        chars.append(ALPHABET[n % BASE])
        n //= BASE
    return "".join(reversed(chars))

def from_b64(s: str) -> int:
    n = 0
    for ch in s:
        n = n * BASE + ALPHABET.index(ch)
    return n

def encode(emp_idx: int, month: int, day: int) -> str:
    md = (month - 1) * 31 + (day - 1)
    return to_b64(emp_idx * 372 + md)

def decode(code: str) -> tuple[int, int, int]:
    n = from_b64(code)
    emp_idx = n // 372
    md = n % 372
    month = md // 31 + 1
    day = md % 31 + 1
    return emp_idx, month, day
```

## 员工名单

37 人，来自 `人员名单.xlsx`（Sheet: sheet1，列：序号、姓名）：

```
韩东昊,代志刚,张晓飞,刘晓鹏,吕培高,王新飞,张波,赵天良,
战为超,李忠俊,张春辉,徐俊强,赵华,刘益飞,常国辉,郭海洋,
刘成双,李沛桢,唐言鹏,刘壮,张倡盛,姜兴志,任玉亭,张伟涛,
李宁,刘恩骏,于英,李立娟,高晨翔,封景隆,杨鹏斐,李崇茂,
杨宜林,刘博,姜振涛,周海燕,谷美灵
```

## 前端功能

`index.html` 纯前端单文件，三栏布局，零外部依赖：

- **左栏**：人员列表（搜索 + 序号01-37，点击选中）
- **中栏**：编码（下拉选人 + 月日微调 → 3字符短码，点击直接复制）
- **右栏**：解码（粘贴短码自动解码，点击结果直接复制）
- **底部**：编码规则说明 + 示例

响应式布局（700px 断点适配手机）。

## 维护

### 增减人员
编辑 `index.html` 中的 `EMPLOYEES` 数组，保持顺序（编码依赖索引）。同时更新 `encoder.py` 中同名数组。

### 从 Excel 重新生成
`人员名单.xlsx`（Sheet: sheet1，列：序号、姓名）是数据源，可用以下 Python 代码提取并更新 HTML 中的数组：

```python
import openpyxl
wb = openpyxl.load_workbook('人员名单.xlsx')
ws = wb['sheet1']
names = [row[1] for row in ws.iter_rows(min_row=2, values_only=True) if row[1]]
print(', '.join(f'"{n}"' for n in names))
```

### 字符集变更
修改 `ALPHABET` 字符串即可，需保证 64 个唯一字符。注意 `-` 和 `_` 需放在末尾避免正则转义问题。

## 设计决策

1. **不用拼音首字母**：拼音编码（如 HDH0729）6-7 字符；纯短码仅 3 字符
2. **base64 而非 base36**：base36（36字符）37 人需 4 字符；base64（64字符）704 人以内只需 3 字符
3. **去掉剪贴板读取**：`readText()` 触发浏览器权限弹窗，改用 Ctrl+V 原生粘贴
4. **点击即复制**：编码和解码结果区点击直接复制（`writeText` 不弹权限）
