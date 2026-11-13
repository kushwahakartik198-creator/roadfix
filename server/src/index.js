import http from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openDatabase } from "./db/database.js";
import { createApiHandler } from "./api.js";
import { createSecurityConfig } from "./security-config.js";

export function createRoadFixServer({ db, host = process.env.HOST || "127.0.0.1", port = Number(process.env.PORT) || 4000, uploadsRoot, securityConfig } = {}) {
  const security = createSecurityConfig({
    mode: securityConfig?.mode,
    corsOrigins: securityConfig?.origins?.join(","),
    host: securityConfig?.host ?? host,
  });
  const connection = db ?? openDatabase();
  const server = http.createServer(createApiHandler({ db: connection, uploadsRoot, securityConfig: security }));
  return {
    server,
    db: connection,
    host,
    port,
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          console.log(`[RoadFix] SQLite API running at http://${host}:${port}`);
          resolve(server);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          try { connection.close(); } catch (closeError) { reject(closeError); return; }
          if (error) reject(error); else resolve();
        });
      });
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  let app;
  try {
    app = createRoadFixServer();
    await app.listen();
  } catch (error) {
    console.error("RoadFix server startup failed", error);
    process.exitCode = 1;
  }
  if (app) {
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.close().then(() => process.exit(0), (error) => {
        console.error("RoadFix shutdown failed", error);
        process.exit(1);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
