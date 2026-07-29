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
