import { lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../src/db/database.js";
import { createRoadFixServer } from "../src/index.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = resolve(serverRoot, "data", "hackathon-demo");
const databasePath = resolve(demoRoot, "roadfix-demo.sqlite");
const uploadsRoot = resolve(demoRoot, "uploads");
const defaultDatabasePath = resolve(serverRoot, "data", "roadfix.sqlite");
if (databasePath === defaultDatabasePath) throw new Error("Refusing to serve the default RoadFix database as the demo database");
for (const [path, kind] of [[demoRoot, "directory"], [databasePath, "file"], [uploadsRoot, "directory"]]) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (kind === "file" ? !stat.isFile() : !stat.isDirectory())) {
    throw new Error(`Demo ${kind} is missing or unsafe: ${path}`);
  }
}

process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";
process.env.PORT = "4000";
process.env.ROADFIX_SECURITY_MODE = "local";
const db = openDatabase({ dbPath: databasePath, migrate: false });
const app = createRoadFixServer({
  db,
  uploadsRoot,
  host: "127.0.0.1",
  port: 4000,
  securityConfig: { mode: "local", origins: ["http://127.0.0.1:5173"], host: "127.0.0.1" },
});
await app.listen();
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  try {
    await app.close();
    console.log("RoadFix demo server stopped cleanly.");
  } catch (error) {
    console.error("RoadFix demo server shutdown failed", error);
    process.exitCode = 1;
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
