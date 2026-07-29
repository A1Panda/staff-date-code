#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// 不含易混淆字符: 0 O o 1 I l，不含特殊符号 _ -（共56个字符）
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const BASE = 56n;
const MAX_EMPLOYEE = 55; // 第1位编码最多支持 56 人（0-55）
const DEFAULT_DATA_FILE = path.join(__dirname, "..", "data", "employees.json");

function printHelp() {
  const text = [
    "Personnel Date Encoder CLI",
    "",
    "Usage:",
    "  node scripts/cli.js encode --employee 高晨翔 --month 7 --day 29",
    "  node scripts/cli.js encode --index 29 --month 7 --day 29",
    "  node scripts/cli.js decode --code 2c6",
    "  node scripts/cli.js list",
    "  node scripts/cli.js employee list",
    "  node scripts/cli.js employee add --name 新员工",
    "  node scripts/cli.js employee disable --index 29",
    "  node scripts/cli.js employee enable --employee 高晨翔",
    "",
    "Options:",
    "  --employee <name>     Employee name",
    "  --index <number>      1-based code index",
    "  --month <number>      Month, 1-12",
    "  --day <number>        Day, 1-31",
    "  --code <value>        Encoded string",
    "  --name <value>        New employee name",
    "  --active-only         Only list active employees",
    "  --include-inactive    Allow inactive employees in encode lookup",
    "  --data-file <path>    Override employees.json path",
    "  --pretty              Pretty-print JSON",
    "  --text                Output text instead of JSON",
    "  --help                Show help",
    "",
    "Examples:",
    "  node scripts/cli.js encode --employee 高晨翔 --month 7 --day 29 --pretty",
    "  node scripts/cli.js decode --code 2c6 --text",
    "  node scripts/cli.js employee add --name 新员工",
    "  node scripts/cli.js employee disable --index 29"
  ].join("\n");
  process.stdout.write(`${text}\n`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      args._.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
      continue;
    }

    args[key] = true;
  }
  return args;
}

function createCliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toSuccessPayload(action, data) {
  return { success: true, action, data };
}

function toErrorPayload(error) {
  return {
    success: false,
    error: error.message,
    code: error.code || "CLI_ERROR"
  };
}

function writeOutput(payload, args, textFormatter) {
  if (args.text) {
    process.stdout.write(`${textFormatter(payload)}\n`);
    return;
  }

  const spacing = args.pretty ? 2 : 0;
  process.stdout.write(`${JSON.stringify(payload, null, spacing)}\n`);
}

function parseIntStrict(value, fieldName) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw createCliError("INVALID_ARGUMENT", `${fieldName} 必须是正整数`);
  }
  return Number.parseInt(value, 10);
}

function requireValidMonth(month) {
  if (month < 1 || month > 12) {
    throw createCliError("INVALID_ARGUMENT", "month 必须在 1 到 12 之间");
  }
}

function requireValidDay(day) {
  if (day < 1 || day > 31) {
    throw createCliError("INVALID_ARGUMENT", "day 必须在 1 到 31 之间");
  }
}

function getDataFilePath(args) {
  if (!args["data-file"]) {
    return DEFAULT_DATA_FILE;
  }
  return path.resolve(process.cwd(), args["data-file"]);
}

function loadStore(args) {
  const filePath = getDataFilePath(args);
  if (!fs.existsSync(filePath)) {
    throw createCliError("DATA_FILE_NOT_FOUND", `未找到数据文件: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const store = JSON.parse(raw);
  validateStore(store, filePath);

  return { store, filePath };
}

function validateStore(store, filePath) {
  if (!store || !Array.isArray(store.employees)) {
    throw createCliError("INVALID_DATA_FILE", `数据文件格式无效: ${filePath}`);
  }

  const seenCodeIndex = new Set();
  for (const employee of store.employees) {
    if (!Number.isInteger(employee.codeIndex) || employee.codeIndex < 0) {
      throw createCliError("INVALID_DATA_FILE", "codeIndex 必须是从 0 开始的整数");
    }
    if (seenCodeIndex.has(employee.codeIndex)) {
      throw createCliError("INVALID_DATA_FILE", `存在重复 codeIndex: ${employee.codeIndex}`);
    }
    seenCodeIndex.add(employee.codeIndex);
    if (typeof employee.name !== "string" || !employee.name.trim()) {
      throw createCliError("INVALID_DATA_FILE", `codeIndex=${employee.codeIndex} 的姓名无效`);
    }
    if (typeof employee.active !== "boolean") {
      throw createCliError("INVALID_DATA_FILE", `codeIndex=${employee.codeIndex} 的 active 无效`);
    }
  }
}

function sortEmployees(employees) {
  return [...employees].sort((left, right) => left.codeIndex - right.codeIndex);
}

function getEmployees(store, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const employees = sortEmployees(store.employees);
  return includeInactive ? employees : employees.filter((item) => item.active);
}

function getEmployeeByCodeIndex(store, codeIndex) {
  return store.employees.find((item) => item.codeIndex === codeIndex) || null;
}

function getEmployeeByOneBasedIndex(store, args) {
  if (!args.index) {
    return null;
  }

  const oneBasedIndex = parseIntStrict(args.index, "index");
  const codeIndex = oneBasedIndex - 1;
  const employee = getEmployeeByCodeIndex(store, codeIndex);
  if (!employee) {
    throw createCliError(
      "EMPLOYEE_NOT_FOUND",
      `未找到 codeIndex=${codeIndex} 的人员（命令行 index 为 ${oneBasedIndex}）`
    );
  }
  return employee;
}

function getEmployeeByName(store, name, options = {}) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    return null;
  }

  const candidates = getEmployees(store, { includeInactive: Boolean(options.includeInactive) })
    .filter((item) => item.name === normalizedName);

  if (candidates.length > 1) {
    throw createCliError("DUPLICATE_EMPLOYEE_NAME", `存在重名人员: ${normalizedName}，请改用 --index`);
  }

  return candidates[0] || null;
}

function resolveEmployeeForEncode(store, args) {
  if (args.employee) {
    const employee = getEmployeeByName(store, args.employee, {
      includeInactive: Boolean(args["include-inactive"])
    });
    if (!employee) {
      throw createCliError("EMPLOYEE_NOT_FOUND", `未找到人员: ${args.employee}`);
    }
    if (!employee.active && !args["include-inactive"]) {
      throw createCliError("EMPLOYEE_INACTIVE", `人员已停用: ${args.employee}`);
    }
    return employee;
  }

  const employeeByIndex = getEmployeeByOneBasedIndex(store, args);
  if (employeeByIndex) {
    return employeeByIndex;
  }

  throw createCliError("MISSING_ARGUMENT", "encode 需要 --employee 或 --index");
}

function resolveEmployeeForMutation(store, args) {
  if (args.employee) {
    const employee = getEmployeeByName(store, args.employee, { includeInactive: true });
    if (!employee) {
      throw createCliError("EMPLOYEE_NOT_FOUND", `未找到人员: ${args.employee}`);
    }
    return employee;
  }

  const employeeByIndex = getEmployeeByOneBasedIndex(store, args);
  if (employeeByIndex) {
    return employeeByIndex;
  }

  throw createCliError("MISSING_ARGUMENT", "需要 --employee 或 --index");
}

function monthDayToInt(month, day) {
  return (month - 1) * 31 + (day - 1);
}

function intToMonthDay(value) {
  return {
    month: Math.floor(value / 31) + 1,
    day: (value % 31) + 1
  };
}

function toBase64(value) {
  if (value === 0n) {
    return ALPHABET[0];
  }

  let remaining = value;
  const chars = [];
  while (remaining > 0n) {
    chars.push(ALPHABET[Number(remaining % BASE)]);
    remaining /= BASE;
  }
  return chars.reverse().join("");
}

function padBase64(n, length) {
  return toBase64(BigInt(n)).padStart(length, ALPHABET[0]);
}

function fromBase64(text) {
  let value = 0n;
  for (const ch of text) {
    const index = ALPHABET.indexOf(ch);
    if (index === -1) {
      throw createCliError("INVALID_CODE", `编码包含非法字符: ${ch}`);
    }
    value = value * BASE + BigInt(index);
  }
  return value;
}

function encode(codeIndex, month, day) {
  return toBase64(BigInt(codeIndex)) + padBase64(monthDayToInt(month, day), 2);
}

function decode(code) {
  const ei = Number(fromBase64(code[0]));
  const md = Number(fromBase64(code.slice(1)));
  const { month, day } = intToMonthDay(md);
  return { codeIndex: ei, month, day };
}

function serializeStore(store) {
  return `${JSON.stringify({
    version: store.version || 1,
    employees: sortEmployees(store.employees).map((item) => ({
      codeIndex: item.codeIndex,
      name: item.name,
      active: item.active
    }))
  }, null, 2)}\n`;
}

function persistStore(store, filePath) {
  fs.writeFileSync(filePath, serializeStore(store), "utf8");
}

function toEmployeeView(employee) {
  return {
    codeIndex: employee.codeIndex,
    index: employee.codeIndex + 1,
    name: employee.name,
    active: employee.active
  };
}

function handleEncode(args) {
  const { store } = loadStore(args);
  const employee = resolveEmployeeForEncode(store, args);
  const month = parseIntStrict(String(args.month || ""), "month");
  const day = parseIntStrict(String(args.day || ""), "day");

  requireValidMonth(month);
  requireValidDay(day);

  return toSuccessPayload("encode", {
    code: encode(employee.codeIndex, month, day),
    employee: employee.name,
    employeeIndex: employee.codeIndex,
    displayIndex: employee.codeIndex + 1,
    active: employee.active,
    month,
    day
  });
}

function handleDecode(args) {
  const { store } = loadStore(args);
  const rawCode = typeof args.code === "string" ? args.code.trim() : "";
  if (!rawCode) {
    throw createCliError("MISSING_ARGUMENT", "decode 需要 --code");
  }

  const decoded = decode(rawCode);
  const employee = getEmployeeByCodeIndex(store, decoded.codeIndex);
  if (!employee) {
    throw createCliError(
      "EMPLOYEE_OUT_OF_RANGE",
      `编码解析出的人员序号超出名单范围: ${decoded.codeIndex + 1}`
    );
  }

  return toSuccessPayload("decode", {
    code: rawCode,
    employee: employee.name,
    employeeIndex: employee.codeIndex,
    displayIndex: employee.codeIndex + 1,
    active: employee.active,
    month: decoded.month,
    day: decoded.day
  });
}

function handleList(args) {
  const { store } = loadStore(args);
  const employees = getEmployees(store, {
    includeInactive: !args["active-only"]
  }).map(toEmployeeView);

  return toSuccessPayload("list", {
    total: store.employees.length,
    activeTotal: store.employees.filter((item) => item.active).length,
    employees
  });
}

function handleEmployeeList(args) {
  const payload = handleList(args);
  payload.action = "employee_list";
  return payload;
}

function handleEmployeeAdd(args) {
  const { store, filePath } = loadStore(args);
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!name) {
    throw createCliError("MISSING_ARGUMENT", "employee add 需要 --name");
  }

  const duplicate = store.employees.find((item) => item.name === name);
  if (duplicate) {
    throw createCliError(
      "EMPLOYEE_ALREADY_EXISTS",
      `人员已存在: ${name}（codeIndex=${duplicate.codeIndex}）`
    );
  }

  const nextCodeIndex = store.employees.length === 0
    ? 0
    : Math.max(...store.employees.map((item) => item.codeIndex)) + 1;

  if (nextCodeIndex > MAX_EMPLOYEE) {
    throw createCliError(
      "EMPLOYEE_LIMIT",
      `已达到最大人员数（${MAX_EMPLOYEE + 1}），编码第1位只能表示0-${MAX_EMPLOYEE}`
    );
  }

  const employee = { codeIndex: nextCodeIndex, name, active: true };
  store.employees.push(employee);
  persistStore(store, filePath);

  return toSuccessPayload("employee_add", {
    employee: toEmployeeView(employee),
    total: store.employees.length,
    activeTotal: store.employees.filter((item) => item.active).length,
    dataFile: filePath
  });
}

function setEmployeeActive(args, active) {
  const { store, filePath } = loadStore(args);
  const employee = resolveEmployeeForMutation(store, args);
  if (employee.active === active) {
    throw createCliError(
      active ? "EMPLOYEE_ALREADY_ACTIVE" : "EMPLOYEE_ALREADY_INACTIVE",
      active ? `人员已经是启用状态: ${employee.name}` : `人员已经是停用状态: ${employee.name}`
    );
  }

  employee.active = active;
  persistStore(store, filePath);

  return toSuccessPayload(active ? "employee_enable" : "employee_disable", {
    employee: toEmployeeView(employee),
    total: store.employees.length,
    activeTotal: store.employees.filter((item) => item.active).length,
    dataFile: filePath
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const subcommand = args._[1];

  if (!command || args.help) {
    printHelp();
    process.exit(0);
  }

  try {
    let payload;
    let formatter;

    if (command === "encode") {
      payload = handleEncode(args);
      formatter = (result) =>
        `${result.data.employee} · ${result.data.month}月${result.data.day}日 → ${result.data.code}`;
    } else if (command === "decode") {
      payload = handleDecode(args);
      formatter = (result) => {
        const suffix = result.data.active ? "" : "（已停用）";
        return `${result.data.code} → ${result.data.employee}${suffix} · ${result.data.month}月${result.data.day}日`;
      };
    } else if (command === "list") {
      payload = handleList(args);
      formatter = (result) => result.data.employees
        .map((item) => `${String(item.index).padStart(2, "0")} ${item.name}${item.active ? "" : " [停用]"}`)
        .join("\n");
    } else if (command === "employee" && subcommand === "list") {
      payload = handleEmployeeList(args);
      formatter = (result) => result.data.employees
        .map((item) => `${String(item.index).padStart(2, "0")} ${item.name}${item.active ? "" : " [停用]"}`)
        .join("\n");
    } else if (command === "employee" && subcommand === "add") {
      payload = handleEmployeeAdd(args);
      formatter = (result) =>
        `已新增 ${result.data.employee.name}，编码序号 ${result.data.employee.index}`;
    } else if (command === "employee" && subcommand === "disable") {
      payload = setEmployeeActive(args, false);
      formatter = (result) =>
        `已停用 ${result.data.employee.name}，编码序号 ${result.data.employee.index}`;
    } else if (command === "employee" && subcommand === "enable") {
      payload = setEmployeeActive(args, true);
      formatter = (result) =>
        `已启用 ${result.data.employee.name}，编码序号 ${result.data.employee.index}`;
    } else {
      throw createCliError("UNKNOWN_COMMAND", `未知命令: ${args._.join(" ")}`);
    }

    writeOutput(payload, args, formatter);
    process.exit(0);
  } catch (error) {
    const payload = toErrorPayload(error);
    writeOutput(payload, args, () => `${payload.code}: ${payload.error}`);
    process.exit(1);
  }
}

main();
