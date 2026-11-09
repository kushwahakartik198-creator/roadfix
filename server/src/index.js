/**
 * RoadFix Local Server — HTTP layer
 *
 * Zero-dependency Node.js server backed by a file-based store.
 * Powers the fully-working user-facing features of RoadFix:
 * ward-aware reporting, ward-based issue listing, officer triage, and public tracking.
 */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";

import { Store } from "./store.js";
import { createWardRouter } from "./routes/wards.js";
import { createIssueRouter } from "./routes/issues.js";
import { createOfficerRouter } from "./routes/officers.js";
import { createUploadsRouter } from "./routes/uploads.js";
import { createStatsRouter } from "./routes/stats.js";
import { seedStore } from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const STORE_PATH = join(DATA_DIR, "store.json");
const UPLOADS_DIR = join(DATA_DIR, "uploads");

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
}

function loadStore() {
  if (existsSync(STORE_PATH)) {
    try {
      const raw = readFileSync(STORE_PATH, "utf-8");
      return JSON.parse(raw);
    } catch {
      // Fall back to seed on corrupt store
    }
  }
  return seedStore();
}

function persist(store) {
  writeFileSync(STORE_PATH, JSON.stringify(store.snapshot(), null, 2));
}

function main() {
  ensureDirs();
  const store = new Store(loadStore());
  persist(store);

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Officer-Id, Authorization");
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, X-Page, X-Page-Size");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    const persistAndRespond = (status, body) => {
      // GET requests must not update store.json. Vite watches this workspace,
      // so rewriting the file for every read would trigger a page reload and
      // create a request/reload loop.
      if (req.method !== "GET" && req.method !== "OPTIONS") {
        try {
          persist(store);
        } catch {
          /* ignore */
        }
      }
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };

    // Health
    if (url.pathname === "/api/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, service: "roadfix-local-server", port: PORT }));
      return;
    }

    try {
      const matchers = [
        createWardRouter(store, persistAndRespond),
        createStatsRouter(store, persistAndRespond),
        createOfficerRouter(store, persistAndRespond),
        createIssueRouter(store, persistAndRespond),
        createUploadsRouter(store, persistAndRespond, UPLOADS_DIR),
      ];

      for (const matcher of matchers) {
        const handled = await matcher(req, res, url);
        if (handled) return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: `Not found: ${req.method} ${url.pathname}` }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[RoadFix] Local server running at http://${HOST}:${PORT}`);
    console.log(`[RoadFix] Store file: ${STORE_PATH}`);
    console.log(`[RoadFix] Uploads dir: ${UPLOADS_DIR}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    try {
      persist(store);
    } catch {
      /* ignore */
    }
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
