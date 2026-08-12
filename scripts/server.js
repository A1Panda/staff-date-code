#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3100;
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const EMPLOYEES_FILE = path.join(PROJECT_ROOT, "data", "employees.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

// 与 scripts/cli.js、public/app.js 保持一致的 56 字符集编码（剔除易混淆字符）
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const BASE = 56n;

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

// 第1位=人员，第2位=月，第3位=日，固定3位
function encode(codeIndex, month, day) {
  return toBase64(BigInt(codeIndex)) + toBase64(BigInt(month - 1)) + toBase64(BigInt(day - 1));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(text);
}

function normalizeStore(rawStore) {
  const employees = Array.isArray(rawStore && rawStore.employees) ? rawStore.employees : [];
  const normalized = employees
    .map((employee) => ({
      codeIndex: Number(employee.codeIndex),
      name: String(employee.name || "").trim(),
      active: employee.active !== false
    }))
    .filter((employee) => Number.isInteger(employee.codeIndex) && employee.codeIndex >= 0 && employee.name)
    .sort((a, b) => a.codeIndex - b.codeIndex);

  const used = new Set();
  normalized.forEach((employee, index) => {
    if (used.has(employee.codeIndex)) {
      employee.codeIndex = index === 0 ? 0 : normalized[index - 1].codeIndex + 1;
    }
    used.add(employee.codeIndex);
  });

  return {
    version: Number(rawStore && rawStore.version) || 1,
    employees: normalized
  };
}

function readEmployeesStore() {
  const rawText = fs.readFileSync(EMPLOYEES_FILE, "utf8");
  return normalizeStore(JSON.parse(rawText));
}

function writeEmployeesStore(store) {
  const normalized = normalizeStore(store);
  fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  return normalized;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("请求体过大"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function getSafeFilePath(urlPathname) {
  const pathname = urlPathname === "/" ? "/index.html" : urlPathname;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    return null;
  }
  return resolvedPath;
}

function serveStaticFile(response, urlPathname) {
  const filePath = getSafeFilePath(urlPathname);
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not Found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  sendText(response, 200, fs.readFileSync(filePath), contentType);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${request.method} ${requestUrl.pathname}`);

  if (requestUrl.pathname === "/api/date") {
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "GET") {
      const now = new Date();
      const payload = { month: now.getMonth() + 1, day: now.getDate() };
      console.log(`[api/date] ${now.toISOString()} -> ${JSON.stringify(payload)}`);
      sendJson(response, 200, payload);
      return;
    }
    sendJson(response, 405, { error: "Method Not Allowed" });
    return;
  }

  if (requestUrl.pathname === "/api/employees") {
    response.setHeader("Cache-Control", "no-store");
    try {
      if (request.method === "GET") {
        sendJson(response, 200, readEmployeesStore());
        return;
      }
      if (request.method === "PUT") {
        const body = await readRequestBody(request);
        const saved = writeEmployeesStore(JSON.parse(body || "{}"));
        sendJson(response, 200, saved);
        return;
      }
      sendJson(response, 405, { error: "Method Not Allowed" });
      return;
    } catch (error) {
      sendJson(response, 400, { error: error.message || "请求失败" });
      return;
    }
  }

  if (requestUrl.pathname === "/api/daily") {
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method Not Allowed" });
      return;
    }

    try {
      // 缺省使用服务器当天日期，也可通过 ?month=8&day=12 指定
      const monthParam = requestUrl.searchParams.get("month");
      const dayParam = requestUrl.searchParams.get("day");
      let month;
      let day;
      if (monthParam === null && dayParam === null) {
        const now = new Date();
        month = now.getMonth() + 1;
        day = now.getDate();
      } else {
        month = Number(monthParam);
        day = Number(dayParam);
        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
          sendJson(response, 400, { error: "month 必须在 1-12，day 必须在 1-31" });
          return;
        }
      }

      const store = readEmployeesStore();
      const employees = store.employees
        .filter((item) => item.active)
        .sort((a, b) => a.codeIndex - b.codeIndex)
        .map((item) => ({
          codeIndex: item.codeIndex,
          index: item.codeIndex + 1,
          name: item.name,
          code: encode(item.codeIndex, month, day)
        }));

      sendJson(response, 200, {
        date: { month, day },
        total: employees.length,
        employees
      });
    } catch (error) {
      sendJson(response, 500, { error: error.message || "服务器错误" });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method Not Allowed" });
    return;
  }

  serveStaticFile(response, requestUrl.pathname);
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other server or set a different PORT.`);
    process.exit(1);
  }
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
});
