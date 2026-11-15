/**
 * RoadFix development launcher.
 *
 * Runs the Vite frontend dev server and the local RoadFix Node.js server
 * concurrently so the whole app works with a single command:
 *
 *   npm run dev:full
 *
 * Press Ctrl+C to stop both processes.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const cwd = process.cwd();
const viteCli = resolve(cwd, "node_modules", "vite", "bin", "vite.js");

const vite = spawn(process.execPath, [viteCli], { cwd, stdio: "inherit", env: process.env });
const server = spawn(process.execPath, ["scripts/run-server.mjs"], {
  cwd,
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT || "4000" },
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[dev] Shutting down dev servers...");
  try { vite.kill("SIGTERM"); } catch {}
  try { server.kill("SIGTERM"); } catch {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

vite.on("exit", (code) => {
  console.log(`[dev] Vite exited with code ${code}`);
  server.kill("SIGTERM");
});
server.on("exit", (code) => {
  console.log(`[dev] Local server exited with code ${code}`);
  vite.kill("SIGTERM");
});
