---
name: personnel-date-encoder
description: Use when encoding/decoding employee+date into fixed 3-char codes (person+month+day, 56-char set), or when maintaining the personnel-date encoding web tool.
version: 1.0.0
author: 高晨翔
license: MIT
---

# 人员日期编码工具

将员工 + 月日压缩为最短字符编码（3字符），双向转换。

入口：`public/index.html`（前端页面，通过 `scripts/server.js` 提供的服务端接口读写数据）
服务：`scripts/server.js`（提供静态页面和 `/api/employees` 读写接口）
CLI：`scripts/cli.js`（Node.js 命令行工具，适合 OpenClaw 调用）
数据源：`data/employees.json`（人员名单单一数据源）
原始名单：`data/人员名单.xlsx`（员工姓名）

## 编码规则

```
编码字符串 = toBase56(人员codeIndex) + toBase56(月-1) + toBase56(日-1)
```

- 第 1 位：人员序号（`codeIndex`，0-55）
- 第 2 位：月份（0-11），第 3 位：日期（0-30）
- 字符集：`23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz` 共 56 个字符
- 剔除易混淆字符 `0 O o 1 I l` 和 `- _`
- 编码固定 **3 字符**，上限 56 人（当前 35 人）

### 示例

| 员工 | 日期 | 编码 | 说明 |
|------|------|------|------|
| #01 韩东昊 | 1月1日 | `222` | 首位0，月0，日0 |
| #01 韩东昊 | 7月29日 | `28W` | 首位0，月6，日28 |
| #29 高晨翔 | 7月29日 | `W8W` | 首位28，月6，日28 |
| #35 姜振涛 | 12月31日 | `cDY` | 首位34，月11，日30 |

### ⚠️ 操作铁律（每次解码/编码必须执行）

1. **必须跑脚本验证** — 任何编码/解码操作都要用 `public/index.html` 或 `node scripts/cli.js` 算出结果再报，不准凭记忆或心算嘴答
2. **第一次说了不算** — 算出来的结果用文字读一遍，如果发现有误立刻重跑校验，不要凭感觉修正
3. **只报结果，不废话** — 收到编码/解码请求后，直接输出「编码 → 人员 · X月X日」或「人员 · X月X日 → 编码」

## 员工名单

35 人，来自 `data/employees.json`（原始来源 `人员名单.xlsx`，Sheet: sheet1，列：序号、姓名）：

```
韩东昊,代志刚,张晓飞,刘晓鹏,吕培高,王新飞,张波,赵天良,
战为超,李忠俊,张春辉,徐俊强,赵华,刘益飞,常国辉,郭海洋,
刘成双,李沛桢,唐言鹏,刘壮,张倡盛,姜兴志,任玉亭,张伟涛,
李宁,刘恩骏,于英,李立娟,高晨翔,封景隆,杨鹏斐,李崇茂,
杨宜林,刘博,姜振涛
```

## 前端功能

`public/index.html` 为前端页面，配合 `scripts/server.js` 使用：

- **左栏**：人员列表（搜索 + 序号01-37，点击选中）
- **中栏**：编码（下拉选人 + 月日微调 → 3字符短码，点击直接复制）
- **右栏**：解码（粘贴短码自动解码，点击结果直接复制）
- **底部**：编码规则说明 + 示例
- **人员管理**：通过 `/api/employees` 直接读写服务器上的 `data/employees.json`

响应式布局（700px 断点适配手机）。

## CLI 功能

`scripts/cli.js` 支持以下命令：

- `node scripts/cli.js encode --employee 高晨翔 --month 7 --day 29`
- `node scripts/cli.js encode --index 29 --month 7 --day 29`
- `node scripts/cli.js decode --code W8W`
- `node scripts/cli.js list`
- `node scripts/cli.js employee add --name 新员工`
- `node scripts/cli.js employee disable --index 29`
- `node scripts/cli.js employee enable --employee 高晨翔`

默认输出 JSON，适合 OpenClaw 或其他自动化流程解析；加 `--text` 可输出纯文本。

## 维护

### 增减人员
优先使用 CLI：

- 新增：`node scripts/cli.js employee add --name 新员工`
- 停用：`node scripts/cli.js employee disable --employee 姓名`
- 启用：`node scripts/cli.js employee enable --employee 姓名`

如需手动维护，只改 `data/employees.json`。

### 从 Excel 重新生成
`data/人员名单.xlsx`（Sheet: sheet1，列：序号、姓名）是原始名单来源。同步时只追加新人，不重排既有 `codeIndex`。

### 稳定性约束

1. `codeIndex` 一旦分配就不能改
2. 离职人员只停用，不删除
3. 新人只追加到末尾

### 字符集变更
修改 `ALPHABET` 字符串即可，需保证 56 个唯一字符，不要包含易混淆字符 `0 O o 1 I l` 和 `- _`（避免抄录出错及正则转义问题）。`BASE` 常量需同步保持 56。

## 设计决策

1. **不用拼音首字母**：拼音编码（如 HDH0729）6-7 字符；纯短码仅 3 字符
2. **56 进制而非 64 进制**：56 字符剔除易混淆字符后，第 1 位仍可表示 56 人（0-55），满足现有 35 人且编码固定 3 位；人数超过 56 才需扩容
3. **去掉剪贴板读取**：`readText()` 触发浏览器权限弹窗，改用 Ctrl+V 原生粘贴
4. **点击即复制**：编码和解码结果区点击直接复制（`writeText` 不弹权限）
