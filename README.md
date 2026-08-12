# Personnel Date Encoder

将“人员 + 月日”压缩为尽可能短的字符编码，并支持双向解码。

这个项目适合用于需要快速记录“人员 + 日期”组合的场景，比如质检标记、流转记录、工序追溯等。当前员工名单为 35 人时，编码固定为 `3` 个字符。

项目同时提供：

- `public/index.html`：适合人工操作的网页工具
- `scripts/cli.js`：适合 OpenClaw 或其他自动化流程调用的 Node.js CLI
- `data/employees.json`：人员名单单一数据源

## 功能特点

- 前端页面读取单一数据源 `data/employees.json`
- 前端支持人员管理，可新增、停用、启用、导入、导出
- 提供 Node.js CLI，适合脚本化调用
- 支持人员 + 日期编码
- 支持短码反向解码
- 使用 56 进制字符集（剔除易混淆字符），编码固定 3 位

## 快速开始

### 网页版

前端人员管理依赖服务端接口，请直接启动项目自带的 Node 服务：

```bash
npm start
```

Windows 下也可以直接双击：

```text
start.bat
```

然后访问：

```text
http://127.0.0.1:3100
```

1. 打开网页首页
2. 在左侧选择人员
3. 在中间选择日期并生成编码
4. 在右侧输入或粘贴编码，可自动解码
5. 点击右上角“人员管理”可维护人员名单

### CLI 版

确保本机已安装 Node.js，然后执行：

```bash
node scripts/cli.js encode --employee 高晨翔 --month 7 --day 29
node scripts/cli.js decode --code W8W
node scripts/cli.js list
node scripts/cli.js employee add --name 新员工
```

安装为全局命令后，也可以直接调用：

```bash
npm install -g .
personnel-date-encoder encode --employee 高晨翔 --month 7 --day 29
```

## OpenClaw 调用建议

CLI 默认输出 JSON，方便 OpenClaw、shell 脚本或其他自动化流程直接解析。

### 编码

```bash
node scripts/cli.js encode --employee 高晨翔 --month 7 --day 29 --pretty
```

示例返回：

```json
{
  "success": true,
  "action": "encode",
  "data": {
    "code": "W8W",
    "employee": "高晨翔",
    "employeeIndex": 28,
    "displayIndex": 29,
    "active": true,
    "month": 7,
    "day": 29
  }
}
```

### 解码

```bash
node scripts/cli.js decode --code W8W --pretty
```

示例返回：

```json
{
  "success": true,
  "action": "decode",
  "data": {
    "code": "W8W",
    "employee": "高晨翔",
    "employeeIndex": 28,
    "displayIndex": 29,
    "active": true,
    "month": 7,
    "day": 29
  }
}
```

### 文本输出

如果只需要人类可读结果，可以加 `--text`：

```bash
node scripts/cli.js decode --code W8W --text
```

## 名单维护方案

现在人员名单已经从代码里抽离到 `data/employees.json`，后续维护遵循这套规则：

- 每个人有固定的 `codeIndex`
- 新人只追加，不插队、不重排
- 离职人员不删除，只改成 `active: false`

这样可以保证历史编码始终稳定，旧码不会因为名单变动而解到别人身上。

## 编码规则

核心公式：

```text
编码字符串 = toBase56(人员codeIndex) + toBase56(月-1) + toBase56(日-1)
```

- 第 1 位：人员序号（`codeIndex`，从 0 开始）
- 第 2 位：月份（0-11）
- 第 3 位：日期（0-30）
- 编码固定 `3` 个字符，不随人数变化

说明：

- 字符集为 `23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz`，共 56 个字符
- 刻意剔除易混淆字符 `0 O o 1 I l` 和特殊符号 `- _`
- 第 1 位可表示 56 人（`codeIndex` 0-55），当前 35 人，编码长度为 `3` 字符

### 示例

| 人员 | 日期 | 编码 |
| --- | --- | --- |
| 韩东昊 | 1月1日 | `222` |
| 韩东昊 | 7月29日 | `28W` |
| 高晨翔 | 7月29日 | `W8W` |
| 姜振涛 | 12月31日 | `cDY` |

## 项目结构

```text
.
├─ data/
│  ├─ employees.json   # 人员名单单一数据源
│  └─ 人员名单.xlsx     # 员工数据来源
├─ public/
│  └─ index.html       # 前端页面
├─ scripts/
│  ├─ cli.js           # Node.js CLI
│  └─ server.js        # 本地服务和 API
├─ package.json
├─ start.bat
├─ README.md
└─ SKILL.md
```

## 前端界面说明

- 左栏：人员列表，可搜索和点击选中
- 中栏：编码区域，可选择人员与日期并生成短码
- 右栏：解码区域，输入编码后自动解析
- 右上角：人员管理弹窗，可新增、停用、启用、导入 JSON、导出数据文件
- 支持点击编码结果直接复制
- 支持点击解码结果直接复制

## 前端人员管理

前端版现在支持直接管理人员名单，适合不想跑 CLI 的场景。

- 页面会通过服务端 API 直接读写服务器上的 `data/employees.json`
- 可导入本地 `employees.json`，并直接覆盖服务器当前数据
- 可导出新的 `employees.json`
- 新增 / 停用 / 启用人员后，会直接写入服务器文件

## HTTP 接口

服务由 `scripts/server.js` 提供，端口默认 `3100`。

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/employees` | GET | 读取人员名单 |
| `/api/employees` | PUT | 覆盖写入人员名单 |
| `/api/date` | GET | 获取服务器当天日期 `{month, day}` |
| `/api/daily` | GET | 获取指定日期所有启用人员及编码 |

### `/api/daily`

获取某天所有启用人员及其 3 位编码，编码规则与 CLI / 前端完全一致。

```bash
# 指定日期
curl "http://127.0.0.1:3100/api/daily?month=8&day=12"
# 不传参数时默认服务器当天日期
curl "http://127.0.0.1:3100/api/daily"
```

返回示例：

```json
{
  "date": { "month": 8, "day": 12 },
  "total": 35,
  "employees": [
    { "codeIndex": 0, "index": 1, "name": "韩东昊", "code": "29D" },
    { "codeIndex": 1, "index": 2, "name": "代志刚", "code": "39D" }
  ]
}
```

- `month` 取值 1-12，`day` 取值 1-31，非法参数返回 `400`
- 只包含启用人员（`active: true`），按 `codeIndex` 升序

## CLI 参数说明

### `encode`

- `--employee <姓名>`：按姓名编码
- `--index <序号>`：按人员序号编码，使用 1 开始的序号
- `--month <1-12>`
- `--day <1-31>`

### `decode`

- `--code <短码>`

### `employee list`

- 列出人员名单
- 默认返回全部人员和启用状态
- 可加 `--active-only` 只看启用人员

### `employee add`

- `--name <姓名>`：新增人员

### `employee disable`

- `--employee <姓名>` 或 `--index <序号>`：停用人员

### `employee enable`

- `--employee <姓名>` 或 `--index <序号>`：重新启用人员

### 通用参数

- `--pretty`：格式化 JSON 输出
- `--text`：输出简洁文本
- `--help`：查看帮助
- `--data-file`：指定自定义数据文件路径，适合测试或临时演练

## 数据维护

### 修改人员名单

当前人员名单维护在：

- `data/employees.json`：正式数据源

日常只需要改 `data/employees.json`，或者直接用 CLI 命令维护。

### 从 Excel 更新名单

`data/人员名单.xlsx` 为原始数据源。更新时建议按下面方式处理：

1. 用 `node scripts/cli.js employee add --name 姓名` 逐个追加新人
2. 对离职人员执行 `node scripts/cli.js employee disable --employee 姓名`

不要手动重排 `codeIndex`，否则历史编码会错位。

## 设计说明

- 选择短码方案而不是拼音缩写，是为了尽可能减少字符长度
- 采用 56 进制字符集（而非 64 进制），剔除易混淆字符 `0 O o 1 I l` 和 `- _`，避免人工抄录/口播时出错
- 第 1 位单独表示人员、后 2 位表示月日，解码无需整体换算，人员增减（只追加不重排）也不会影响既有编码
- 网页版去掉了主动读取剪贴板，减少浏览器权限提示

## 适用范围

这个方案按「人员 1 位 + 月 1 位 + 日 1 位」编码，月份取值 1-12、日期取值 1-31，即允许每个月都映射到 31 天。  
它适合做“编码压缩”和“快速记录”，但不会校验真实日历日期，例如 2 月 31 日在编码上仍然是可表示的。

如果后续需要，也可以扩展为“只允许真实日期”的版本。

## License

MIT
