import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
if (!env.ROADFIX_SECURITY_MODE && (!env.NODE_ENV || env.NODE_ENV === "development" || env.NODE_ENV === "test")) {
  env.ROADFIX_SECURITY_MODE = "local";
}
if (!env.PORT) env.PORT = "4000";

const server = spawn(process.execPath, [resolve(projectRoot, "server/src/index.js")], { cwd: projectRoot, stdio: "inherit", env });
server.once("error", (error) => {
  console.error("RoadFix server could not be started", error);
  process.exitCode = 1;
});
server.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
