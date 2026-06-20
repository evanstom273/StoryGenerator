const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 7777;
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.resolve(__dirname);
const SESSION_ID = "archive-pdf-no-op";
const LOG_PATH = path.resolve(OUT_DIR, `trae-debug-log-${SESSION_ID}.ndjson`);
const ENV_PATH = path.resolve(OUT_DIR, `${SESSION_ID}.env`);

function writeEnv() {
  const lines = [
    `DEBUG_SESSION_ID=${SESSION_ID}`,
    `DEBUG_PORT=${PORT}`,
    `DEBUG_URL=http://127.0.0.1:${PORT}/event`,
    `DEBUG_LOG=${LOG_PATH}`,
  ].join("\n");
  fs.writeFileSync(ENV_PATH, lines, "utf8");
}

function appendNdjson(obj) {
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(obj)}\n`, "utf8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

writeEnv();

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessionId: SESSION_ID, logPath: LOG_PATH }));
    return;
  }

  if (req.method === "DELETE" && url === "/logs") {
    try {
      fs.writeFileSync(LOG_PATH, "", "utf8");
    } catch {}
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && url === "/logs") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    try {
      res.end(fs.readFileSync(LOG_PATH, "utf8"));
    } catch {
      res.end("");
    }
    return;
  }

  if (req.method === "POST" && url === "/event") {
    try {
      const raw = await readBody(req);
      const json = raw ? JSON.parse(raw) : {};
      appendNdjson({
        ...json,
        _serverTs: Date.now(),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  const line = `[debug-server] session=${SESSION_ID} port=${PORT} log=${LOG_PATH}`;
  process.stdout.write(`${line}\n`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

