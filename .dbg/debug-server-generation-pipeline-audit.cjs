const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    args[key.slice(2)] = value && !value.startsWith("--") ? value : "true";
    if (args[key.slice(2)] !== "true") i += 1;
  }
  return args;
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

function tryListen(server, host, port, retries) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (retries > 0 && (err.code === "EADDRINUSE" || err.code === "EACCES")) {
        server.removeListener("error", onError);
        resolve(tryListen(server, host, port + 1, retries - 1));
      } else {
        reject(err);
      }
    };
    server.once("error", onError);
    server.listen(port, host, () => resolve(port));
  });
}

const args = parseArgs(process.argv);
const sessionId = args.session;
if (!sessionId || sessionId === "true") {
  process.stderr.write("Missing required --session argument\n");
  process.exit(1);
}

const outdir = path.resolve(process.cwd(), args.outdir && args.outdir !== "true" ? args.outdir : ".dbg");
const clean = args.clean === "true";
const idleSeconds = args.idle && args.idle !== "true" ? Number(args.idle) : 0;
const remote = args.remote === "true";
const host = remote ? "0.0.0.0" : "127.0.0.1";
const displayHost = remote ? getLocalIp() : "127.0.0.1";
const startPort = args.port && args.port !== "true" ? Number(args.port) : 7777;

fs.mkdirSync(outdir, { recursive: true });

const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`);
if (clean && fs.existsSync(logFile)) {
  fs.writeFileSync(logFile, "", "utf8");
}

let lastActivity = Date.now();
const startedAt = Date.now();

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readLogs() {
  if (!fs.existsSync(logFile)) return [];
  return fs
    .readFileSync(logFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parseError: true, line };
      }
    });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    const logs = readLogs();
    cors(res);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        sessionId,
        uptimeMs: Date.now() - startedAt,
        logCount: logs.length,
      }),
    );
    return;
  }

  if (url.pathname === "/logs") {
    cors(res);
    if (req.method === "GET") {
      let logs = readLogs();
      const runId = url.searchParams.get("runId");
      const hypothesisId = url.searchParams.get("hypothesisId");
      const last = Number(url.searchParams.get("last") || "0");
      if (runId) logs = logs.filter((entry) => entry.runId === runId);
      if (hypothesisId) logs = logs.filter((entry) => entry.hypothesisId === hypothesisId);
      if (last > 0) logs = logs.slice(-last);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(logs));
      return;
    }
    if (req.method === "DELETE") {
      fs.writeFileSync(logFile, "", "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(405);
    res.end("method not allowed");
    return;
  }

  if (url.pathname !== "/event") {
    cors(res);
    res.writeHead(404);
    res.end("not found");
    return;
  }

  if (req.method !== "POST") {
    cors(res);
    res.writeHead(405);
    res.end("method not allowed");
    return;
  }

  lastActivity = Date.now();
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    cors(res);
    try {
      const event = JSON.parse(body || "{}");
      if (!event.ts) {
        event.ts = Date.now();
      }
      if (!event.sessionId) {
        event.sessionId = sessionId;
      }
      fs.appendFileSync(logFile, `${JSON.stringify(event)}\n`, "utf8");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("bad json");
    }
  });
});

void (async () => {
  const port = await tryListen(server, host, startPort, 10);
  const apiUrl = `http://${displayHost}:${port}/event`;
  const envFile = path.join(outdir, `${sessionId}.env`);
  fs.writeFileSync(envFile, `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`, "utf8");

  const info = {
    api_url: apiUrl,
    session_id: sessionId,
    log_dir: outdir,
    log_file: logFile,
    env_file: envFile,
  };

  process.stdout.write("@@DEBUG_SERVER_INFO\n");
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
  process.stdout.write("@@END_DEBUG_SERVER_INFO\n");

  if (idleSeconds > 0) {
    const timer = setInterval(() => {
      if (Date.now() - lastActivity > idleSeconds * 1000) {
        clearInterval(timer);
        server.close(() => process.exit(0));
      }
    }, 1000);
  }
})().catch((err) => {
  process.stderr.write(`${String(err?.message || err)}\n`);
  process.exit(1);
});
