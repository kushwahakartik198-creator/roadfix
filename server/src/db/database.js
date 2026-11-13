import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const SERVER_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_DATABASE_PATH = resolve(SERVER_ROOT, "data", "roadfix.sqlite");
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));
export const ROADFIX_APPLICATION_ID = 0x52444658;
export const DEFAULT_BUSY_TIMEOUT_MS = 5000;

function getMigrationFiles(migrationsDir) {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  const migrations = files.map((name) => {
    const match = name.match(/^(\d{3,})_([a-z0-9_-]+)\.sql$/);
    if (!match) throw new Error(`Invalid migration filename: ${name}`);
    return {
      version: match[1],
      name,
      sql: readFileSync(join(migrationsDir, name), "utf8"),
    };
  });

  for (let i = 1; i < migrations.length; i += 1) {
    if (migrations[i - 1].version === migrations[i].version) {
      throw new Error(`Duplicate migration version: ${migrations[i].version}`);
    }
  }
  return migrations;
}

export function migrateDatabase(db, { migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const migrations = getMigrationFiles(migrationsDir);
  if (!migrations.length) throw new Error(`No SQL migrations found in ${migrationsDir}`);

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL CHECK(length(checksum) = 64),
    applied_at TEXT NOT NULL
  )`);

  const migrationRows = db
    .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
    .all();
  const knownVersions = new Set(migrations.map((migration) => migration.version));
  for (const applied of migrationRows) {
    if (!knownVersions.has(applied.version)) {
      throw new Error(
        `Applied migration ${applied.version} (${applied.name}) has no matching SQL file`
      );
    }
  }

  const getApplied = db.prepare("SELECT name, checksum FROM schema_migrations WHERE version = ?");
  const recordApplied = db.prepare(
    "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)"
  );
  const appliedNow = [];

  for (const migration of migrations) {
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    const previous = getApplied.get(migration.version);
    if (previous) {
      if (previous.name !== migration.name || previous.checksum !== checksum) {
        throw new Error(
          `Applied migration ${migration.version} has changed; add a new migration instead`
        );
      }
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      recordApplied.run(migration.version, migration.name, checksum, new Date().toISOString());
    });
    try {
      apply.immediate();
      appliedNow.push(migration.version);
    } catch (error) {
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${error.message}`,
        {
          cause: error,
        }
      );
    }
  }

  return { applied: appliedNow, currentVersion: migrations.at(-1).version };
}

function assertRoadFixDatabase(db, existedBeforeOpen) {
  const applicationId = db.pragma("application_id", { simple: true });
  if (applicationId !== 0 && applicationId !== ROADFIX_APPLICATION_ID) {
    throw new Error("Database belongs to a different application; refusing to modify it");
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);
  if (applicationId === 0 && existedBeforeOpen && tables.length > 0) {
    throw new Error(
      "Existing SQLite file is not marked as a RoadFix database; refusing to modify it"
    );
  }
  if (applicationId === 0) db.pragma(`application_id = ${ROADFIX_APPLICATION_ID}`);
}

export function openDatabase({
  dbPath = DEFAULT_DATABASE_PATH,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  migrate = true,
  busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS,
} = {}) {
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 120000) {
    throw new RangeError("busyTimeoutMs must be an integer between 0 and 120000");
  }

  const resolvedPath = resolve(dbPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const existedBeforeOpen = existsSync(resolvedPath);
  const db = new Database(resolvedPath, { timeout: busyTimeoutMs });

  try {
    // Check the application marker before changing any persistent SQLite pragma.
    assertRoadFixDatabase(db, existedBeforeOpen);
    db.pragma("foreign_keys = ON");
    if (db.pragma("foreign_keys", { simple: true }) !== 1) {
      throw new Error("SQLite foreign-key enforcement could not be enabled");
    }
    db.pragma(`busy_timeout = ${busyTimeoutMs}`);
    const journalMode = db.pragma("journal_mode = WAL", { simple: true });
    if (String(journalMode).toLowerCase() !== "wal") {
      throw new Error(`SQLite WAL mode could not be enabled (reported ${journalMode})`);
    }

    if (migrate) migrateDatabase(db, { migrationsDir });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
