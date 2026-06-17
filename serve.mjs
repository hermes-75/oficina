import { createServer } from "node:http";
import { readFileSync, statSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT ?? 5174);
const BRIDGE_PORT = Number(process.env.HERMES_BRIDGE_PORT ?? 8787);
const DIST = resolve("dist");

// ── Static file server ──────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".map":  "application/json",
};

const server = createServer((req, res) => {
  let path = req.url === "/" ? "/index.html" : req.url.split("?")[0];

  // SPA fallback: if the file doesn't exist, serve index.html
  let filePath = join(DIST, path);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, "index.html");
  }

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`[Oficina] Frontend sirviendo en http://0.0.0.0:${PORT}`);
});

// ── Bridge ──────────────────────────────────────────────────────────────

const bridge = spawn("node", ["server/hermes-bridge.mjs"], {
  stdio: "inherit",
  env: { ...process.env, HERMES_BRIDGE_PORT: String(BRIDGE_PORT) },
});

// ── Graceful shutdown ──────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[Oficina] Recibido ${signal}, cerrando...`);
  bridge.kill(signal);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

bridge.on("exit", (code) => {
  console.log(`[Oficina] Bridge terminado con codigo ${code}`);
  process.exit(code ?? 0);
});
