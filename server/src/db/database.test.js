import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { openDatabase, migrateDatabase, ROADFIX_APPLICATION_ID } from "./database.js";
import { generateReference, generateUniqueReference, REFERENCE_PATTERN } from "./references.js";

const SERVER_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function createTempDb(t) {
  const directory = mkdtempSync(join(SERVER_ROOT, ".roadfix-db-test-"));
  const dbPath = join(directory, "test.sqlite");
  const connections = new Set();
  const open = (options = {}) => {
    const db = openDatabase({ dbPath, ...options });
    connections.add(db);
    return db;
  };
  t.after(() => {
    for (const db of connections) if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, dbPath, open };
}

function insertWard(db, id = "ward-1") {
  db.prepare(
    `INSERT INTO wards(id,code,name,description,latitude,longitude,ward_number,active,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`
  ).run(id, "W001", "Test Ward", null, 27.18, 78.02, "1", 1, "2026-11-10T00:00:00.000Z");
}

function insertComplaint(
  db,
  {
    id = "issue-1",
    reference = "RF-AG-ABCDEFGH",
    status = "submitted",
    severity = "low",
    latitude = 27.18,
  } = {}
) {
  db.prepare(
    `INSERT INTO complaints(
    id,reference,title,description,category,status,severity,ward_id,latitude,longitude,
    status_updated_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    reference,
    "Test pothole",
    "A sufficiently detailed test description.",
    "pothole",
    status,
    severity,
    "ward-1",
    latitude,
    78.02,
    "2026-11-10T00:00:00.000Z",
    "2026-11-10T00:00:00.000Z",
    "2026-11-10T00:00:00.000Z"
  );
}

test("initializes DB, creates schema and records deterministic migrations", (t) => {
  const db = createTempDb(t).open();
  assert.equal(db.pragma("application_id", { simple: true }), ROADFIX_APPLICATION_ID);
  assert.deepEqual(
    db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((r) => r.version),
    ["001", "002", "003"]
  );
  assert.ok(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='complaints'").get()
  );
  assert.deepEqual(migrateDatabase(db), { applied: [], currentVersion: "003" });
  assert.equal(db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n, 3);
});

test("refuses to modify a non-RoadFix SQLite file", (t) => {
  const { dbPath } = createTempDb(t);
  const foreignDb = new Database(dbPath);
  foreignDb.exec("CREATE TABLE unrelated(value TEXT)");
  foreignDb.close();
  assert.throws(() => openDatabase({ dbPath }), /not marked as a RoadFix database/);
});

test("enables foreign keys and WAL on each initialized connection", (t) => {
  const fixture = createTempDb(t);
  const first = fixture.open();
  assert.equal(first.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(String(first.pragma("journal_mode", { simple: true })).toLowerCase(), "wal");
  first.close();
  const second = fixture.open();
  assert.equal(second.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(String(second.pragma("journal_mode", { simple: true })).toLowerCase(), "wal");
});

test("enforces status, severity, coordinates and unique complaint references", (t) => {
  const db = createTempDb(t).open();
  insertWard(db);
  insertComplaint(db);
  assert.throws(
    () =>
      insertComplaint(db, { id: "bad-status", reference: "RF-AG-ABCDEFGJ", status: "reported" }),
    /CHECK constraint failed/
  );
  assert.throws(
    () =>
      insertComplaint(db, {
        id: "bad-severity",
        reference: "RF-AG-ABCDEFGJ",
        severity: "critical",
      }),
    /CHECK constraint failed/
  );
  assert.throws(
    () => insertComplaint(db, { id: "bad-latitude", reference: "RF-AG-ABCDEFGJ", latitude: 91 }),
    /CHECK constraint failed/
  );
  assert.throws(
    () => insertComplaint(db, { id: "duplicate-reference", reference: "RF-AG-ABCDEFGH" }),
    /UNIQUE constraint failed/
  );
});

test("rolls back a multi-step write when an error is thrown", (t) => {
  const db = createTempDb(t).open();
  insertWard(db);
  const write = db.transaction(() => {
    insertComplaint(db);
    db.prepare(
      `INSERT INTO complaint_status_history(id,complaint_id,event_type,to_status,actor_role,created_at)
      VALUES('history-1','issue-1','created','submitted','system','2026-11-10T00:00:00.000Z')`
    ).run();
    throw new Error("force rollback");
  });
  assert.throws(() => write(), /force rollback/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM complaints").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM complaint_status_history").get().n, 0);
});

test("generates secure-format references and retries collisions", (t) => {
  const db = createTempDb(t).open();
  insertWard(db);
  for (let i = 0; i < 100; i += 1) assert.match(generateReference(), REFERENCE_PATTERN);
  insertComplaint(db, { reference: "RF-AG-ABCDEFGH" });
  const candidates = ["RF-AG-ABCDEFGH", "RF-AG-ABCDEFGJ"];
  assert.equal(
    generateUniqueReference(db, { generate: () => candidates.shift() }),
    "RF-AG-ABCDEFGJ"
  );
});

test("persists data after close and reopen", (t) => {
  const fixture = createTempDb(t);
  let db = fixture.open();
  insertWard(db);
  insertComplaint(db);
  db.close();
  db = fixture.open();
  assert.equal(
    db.prepare("SELECT reference FROM complaints WHERE id='issue-1'").get().reference,
    "RF-AG-ABCDEFGH"
  );
});

test("rolls back a failed migration and reports its version", (t) => {
  const fixture = createTempDb(t);
  const { directory } = fixture;
  const migrationDir = join(directory, "migrations");
  mkdirSync(migrationDir);
  writeFileSync(
    join(migrationDir, "001_broken.sql"),
    "CREATE TABLE broken(id INTEGER); INSERT INTO missing VALUES (1);"
  );
  const db = fixture.open({ migrationsDir: join(directory, "empty"), migrate: false });
  assert.throws(
    () => migrateDatabase(db, { migrationsDir: migrationDir }),
    /Migration 001 .* failed/
  );
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='broken'").get(),
    undefined
  );
  assert.equal(db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n, 0);
});
