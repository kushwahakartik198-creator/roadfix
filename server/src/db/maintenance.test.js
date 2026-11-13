import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import Database from "better-sqlite3";
import { openDatabase } from "./database.js";
import { backupDatabase, backupSet, integrityCheck, restoreDatabase, verifyBackupSet, verifyDatabase } from "./maintenance.js";
import { runMaintenanceCli } from "./maintenance-cli.js";

function tempDir(t) {
  const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
  const path = mkdtempSync(join(serverRoot, ".roadfix-maintenance-test-"));
  const connections = new Set();
  t.after(() => {
    for (const db of connections) if (db.open) db.close();
    rmSync(path, { recursive: true, force: true });
  });
  return { path, connections };
}

function roadfixDb(fixture, path) {
  const db = openDatabase({ dbPath: path });
  db.exec("CREATE TABLE IF NOT EXISTS synthetic_items(id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
  fixture.connections.add(db);
  return db;
}

function put(db, value) {
  db.prepare("INSERT INTO synthetic_items(value) VALUES (?)").run(value);
}

async function restoreFixture(t) {
  const fixture = tempDir(t); const root = fixture.path;
  const sourcePath = join(root, "source.sqlite"); const source = roadfixDb(fixture, sourcePath); put(source, "candidate"); source.close();
  const backup = await backupDatabase({ sourcePath, directory: join(root, "backups") });
  const target = join(root, "target.sqlite"); const original = roadfixDb(fixture, target); put(original, "original"); original.close();
  return { root, target, backupPath: backup.path };
}

function valueAt(path) {
  const db = new Database(path, { readonly: true });
  try { return db.prepare("SELECT value FROM synthetic_items").get().value; } finally { db.close(); }
}

async function backupSetFixture(t, now = new Date("2026-11-11T12:00:00.000Z")) {
  const fixture = tempDir(t); const root = fixture.path;
  const sourcePath = join(root, "source.sqlite"); const db = roadfixDb(fixture, sourcePath); put(db, "synthetic backup set row"); db.close();
  const uploadsPath = join(root, "uploads"); mkdirSync(uploadsPath);
  const destination = join(root, "protected-backups");
  return { ...fixture, sourcePath, uploadsPath, destination, now };
}

test("backup set creates a verified database, upload tree, and SHA-256 manifest", async (t) => {
  const fixture = await backupSetFixture(t);
  writeFileSync(join(fixture.uploadsPath, "photo-a.png"), Buffer.from("synthetic image A"));
  mkdirSync(join(fixture.uploadsPath, "nested"));
  writeFileSync(join(fixture.uploadsPath, "nested", "photo-b.webp"), Buffer.from("synthetic image B"));
  const result = await backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination, confirmServerStopped: true, now: fixture.now });
  assert.equal(valueAt(result.databasePath), "synthetic backup set row");
  assert.deepEqual(result.manifest.uploads.files.map((file) => file.path), ["nested/photo-b.webp", "photo-a.png"]);
  assert.equal(result.manifest.uploads.fileCount, 2);
  assert.equal(result.manifest.uploads.totalBytes, Buffer.byteLength("synthetic image A") + Buffer.byteLength("synthetic image B"));
  assert.equal(result.manifest.database.sha256.length, 64);
  assert.equal(result.manifest.database.filename, `database/${result.databasePath.split(/[\\/]/).at(-1)}`);
  assert.equal((await verifyBackupSet(result.path)).fileCount, 2);
});

test("backup set supports an empty uploads directory", async (t) => {
  const fixture = await backupSetFixture(t);
  const result = await backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination, confirmServerStopped: true, now: fixture.now });
  assert.deepEqual(result.manifest.uploads, { files: [], fileCount: 0, totalBytes: 0 });
  assert.equal((await verifyBackupSet(result.path)).totalBytes, 0);
});

test("backup set rejects an existing timestamped destination without overwriting it", async (t) => {
  const fixture = await backupSetFixture(t);
  const existing = join(fixture.destination, "roadfix-backup-set-20261111T120000Z");
  mkdirSync(existing, { recursive: true }); writeFileSync(join(existing, "sentinel.txt"), "keep me");
  await assert.rejects(backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination, confirmServerStopped: true, now: fixture.now }), /no existing set was overwritten/);
  assert.equal(readFileSync(join(existing, "sentinel.txt"), "utf8"), "keep me");
});

test("backup set requires explicit stop attestation and destination outside application data", async (t) => {
  const fixture = await backupSetFixture(t);
  await assert.rejects(backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination }), /operator attestation required/);
  const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
  await assert.rejects(backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: join(serverRoot, "data", "backups"), confirmServerStopped: true }), /outside application writable data directory/);
});

test("backup set verifies bytes against manifest and detects changed uploads", async (t) => {
  const fixture = await backupSetFixture(t);
  writeFileSync(join(fixture.uploadsPath, "photo.png"), "synthetic image bytes");
  const result = await backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination, confirmServerStopped: true, now: fixture.now });
  writeFileSync(join(result.path, "uploads", "photo.png"), "tampered image bytes");
  await assert.rejects(verifyBackupSet(result.path), /size mismatch|SHA-256 mismatch/);
});

test("backup-set verification detects database hash changes", async (t) => {
  const fixture = await backupSetFixture(t);
  const result = await backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination, confirmServerStopped: true, now: fixture.now });
  writeFileSync(result.databasePath, "tampered synthetic database");
  await assert.rejects(verifyBackupSet(result.path), /Database SHA-256 mismatch/);
});

test("backup set copy failure preserves source files and reports the partial set", async (t) => {
  const fixture = await backupSetFixture(t);
  writeFileSync(join(fixture.uploadsPath, "photo.png"), "original upload sentinel");
  const partial = join(fixture.destination, "roadfix-backup-set-20261111T120000Z");
  await assert.rejects(backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination, confirmServerStopped: true, now: fixture.now,
    fileOps: { copyFileSync(from, to, flags) { if (from === join(fixture.uploadsPath, "photo.png")) throw new Error("injected upload copy failure"); return copyFileSync(from, to, flags); } },
  }), (error) => error.message.includes("injected upload copy failure") && error.message.includes(partial) && error.message.includes(join(partial, "uploads")) && error.message.includes(join(partial, "database", "roadfix-20261111T120000Z.sqlite")));
  assert.equal(readFileSync(join(fixture.uploadsPath, "photo.png"), "utf8"), "original upload sentinel");
  assert.ok(existsSync(join(partial, "database")));
  assert.ok(existsSync(join(partial, "uploads")));
});

test("backup set verification failure keeps manifest and all partial files for review", async (t) => {
  const fixture = await backupSetFixture(t);
  writeFileSync(join(fixture.uploadsPath, "photo.png"), "synthetic image");
  const partial = join(fixture.destination, "roadfix-backup-set-20261111T120000Z");
  await assert.rejects(backupSet({ sourcePath: fixture.sourcePath, uploadsPath: fixture.uploadsPath, directory: fixture.destination, confirmServerStopped: true, now: fixture.now,
    verify() { throw new Error("injected manifest verification failure"); },
  }), (error) => error.message.includes("injected manifest verification failure") && error.message.includes(partial) && error.message.includes(join(partial, "uploads", "photo.png")) && error.message.includes(join(partial, "manifest.json")));
  assert.ok(existsSync(join(partial, "manifest.json")));
  assert.ok(existsSync(join(partial, "database")));
  assert.equal(readFileSync(join(fixture.uploadsPath, "photo.png"), "utf8"), "synthetic image");
});

test("backup-set CLI requires stop attestation and reports the verified set", async (t) => {
  const fixture = await backupSetFixture(t);
  const noAttestation = await captureCli(undefined, ["backup-set", "--database", fixture.sourcePath, "--uploads", fixture.uploadsPath, "--directory", fixture.destination]);
  assert.equal(noAttestation.exitCode, 1);
  assert.match(noAttestation.stderr, /operator attestation required/);
  const output = await captureCli(undefined, ["backup-set", "--database", fixture.sourcePath, "--uploads", fixture.uploadsPath, "--directory", fixture.destination, "--confirm-server-stopped"]);
  assert.equal(output.exitCode, 0);
  assert.match(output.stdout, /backup set created and verified/);
  assert.match(output.stdout, /not automatic process detection/);
  assert.match(output.stdout, /Upload files: 0/);
  assert.match(output.stdout, /Manifest:/);
  assert.match(output.stdout, /Integrity: ok/);
});

async function captureCli(restore, argv) {
  const stdout = []; const stderr = [];
  const exitCode = await runMaintenanceCli({ argv, restore, log: (line) => stdout.push(line), reportError: (line) => stderr.push(line) });
  return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

test("restore CLI reports a normal successful restore when cleanup has no leftovers", async (t) => {
  const fixture = await restoreFixture(t);
  const output = await captureCli(restoreDatabase, ["restore", fixture.backupPath, "--database", fixture.target, "--confirm-overwrite"]);
  assert.equal(output.exitCode, 0);
  assert.match(output.stdout, /^restore successful/m);
  assert.doesNotMatch(output.stdout, /leftover recovery files|Cleanup incomplete|Recovery file:/);
  assert.match(output.stdout, /Integrity: ok/);
  assert.equal(valueAt(fixture.target), "candidate");
});

test("restore CLI lists one recovery file and warns the operator to inspect it", async (t) => {
  const fixture = await restoreFixture(t);
  const recoveryPath = join(fixture.root, "leftover.previous");
  const output = await captureCli(async (options) => ({ ...(await restoreDatabase(options)), recoveryFiles: [recoveryPath] }), ["restore", fixture.backupPath, "--database", fixture.target, "--confirm-overwrite"]);
  assert.equal(output.exitCode, 0);
  assert.match(output.stdout, /restore successful with leftover recovery files/);
  assert.match(output.stdout, /Cleanup incomplete/);
  assert.match(output.stdout, /Do not delete these files until each has been checked/);
  assert.match(output.stdout, new RegExp(`Recovery file: ${recoveryPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.doesNotMatch(output.stdout, /cleanup complete/i);
  assert.equal(valueAt(fixture.target), "candidate");
});

test("restore CLI lists every recovery file when cleanup leaves multiple files", async (t) => {
  const fixture = await restoreFixture(t);
  const paths = [join(fixture.root, "leftover-one"), join(fixture.root, "leftover-two")];
  const output = await captureCli(async (options) => ({ ...(await restoreDatabase(options)), recoveryFiles: paths }), ["restore", fixture.backupPath, "--database", fixture.target, "--confirm-overwrite"]);
  assert.equal(output.exitCode, 0);
  for (const path of paths) assert.ok(output.stdout.includes(`Recovery file: ${path}`));
  assert.equal(output.stdout.match(/^Recovery file:/gm)?.length, 2);
  assert.equal(valueAt(fixture.target), "candidate");
});

test("restore CLI accepts missing and empty recoveryFiles", async (t) => {
  for (const recoveryFiles of [undefined, []]) {
    await t.test(recoveryFiles === undefined ? "missing property" : "empty list", async (st) => {
      const fixture = await restoreFixture(st);
      const output = await captureCli(async (options) => {
        const result = await restoreDatabase(options);
        return recoveryFiles === undefined ? (({ recoveryFiles: _ignored, ...withoutRecoveryFiles }) => withoutRecoveryFiles)(result) : { ...result, recoveryFiles };
      }, ["restore", fixture.backupPath, "--database", fixture.target, "--confirm-overwrite"]);
      assert.equal(output.exitCode, 0);
      assert.match(output.stdout, /^restore successful/m);
      assert.doesNotMatch(output.stdout, /leftover recovery files|Cleanup incomplete|Recovery file:/);
      assert.equal(valueAt(fixture.target), "candidate");
    });
  }
});

test("restore CLI preserves restore error and manual recovery details", async (t) => {
  const fixture = await restoreFixture(t);
  const output = await captureCli((options) => restoreDatabase({
    ...options,
    fileOps: {
      renameSync(from, to) {
        if (from.endsWith(".restore.tmp") && to === fixture.target) throw new Error("injected promotion failure");
        if (from.endsWith(".previous") && to === fixture.target) throw new Error("injected original restoration failure");
        renameSync(from, to);
      },
    },
  }), ["restore", fixture.backupPath, "--database", fixture.target, "--confirm-overwrite"]);
  assert.equal(output.exitCode, 1);
  assert.match(output.stderr, /restore failed: injected promotion failure/);
  assert.match(output.stderr, /injected original restoration failure/);
  assert.match(output.stderr, /restore recovery paths:/);
  assert.match(output.stderr, /existing recovery files:/);
  assert.match(output.stderr, /Manual recovery: stop RoadFix/);
  assert.ok(output.stderr.includes(fixture.backupPath));
});

test("online backup captures a consistent database and passes integrity verification", async (t) => {
  const fixture = tempDir(t);
  const root = fixture.path;
  const source = join(root, "source.sqlite");
  const db = roadfixDb(fixture, source);
  put(db, "synthetic WAL row");
  assert.equal(String(db.pragma("journal_mode", { simple: true })).toLowerCase(), "wal");
  const result = await backupDatabase({ sourcePath: source, directory: join(root, "backups"), now: new Date("2026-11-11T12:34:56.000Z") });
  assert.equal(result.verification.integrity, "ok");
  assert.equal(verifyDatabase(result.path).foreignKeyViolations, 0);
  const copy = new Database(result.path, { readonly: true, fileMustExist: true });
  assert.equal(copy.prepare("SELECT value FROM synthetic_items").get().value, "synthetic WAL row");
  copy.close();
});

test("backup destination collisions never overwrite existing files", async (t) => {
  const fixture = tempDir(t);
  const root = fixture.path;
  const source = join(root, "source.sqlite");
  roadfixDb(fixture, source);
  const directory = join(root, "backups");
  const now = new Date("2026-11-11T12:34:56.000Z");
  const first = await backupDatabase({ sourcePath: source, directory, now });
  const original = readFileSync(first.path);
  await assert.rejects(backupDatabase({ sourcePath: source, directory, now }), /EEXIST/);
  assert.deepEqual(readFileSync(first.path), original);
});

test("restore validates then installs a backup into a new destination", async (t) => {
  const fixture = tempDir(t);
  const root = fixture.path;
  const source = join(root, "source.sqlite");
  const db = roadfixDb(fixture, source);
  put(db, "restored synthetic row");
  db.close();
  const backup = await backupDatabase({ sourcePath: source, directory: join(root, "backups") });
  const target = join(root, "restored.sqlite");
  const result = await restoreDatabase({ backupPath: backup.path, targetPath: target });
  assert.equal(result.verification.integrity, "ok");
  const restored = new Database(target, { readonly: true });
  assert.equal(restored.prepare("SELECT value FROM synthetic_items").get().value, "restored synthetic row");
  restored.close();
});

test("rejects invalid backup without changing an existing destination", async (t) => {
  const fixture = tempDir(t);
  const root = fixture.path;
  const badBackup = join(root, "corrupt.sqlite");
  const target = join(root, "target.sqlite");
  writeFileSync(badBackup, "not a sqlite database");
  const db = roadfixDb(fixture, target);
  put(db, "original remains usable");
  db.close();
  await assert.rejects(restoreDatabase({ backupPath: badBackup, targetPath: target, confirmOverwrite: true }));
  const original = new Database(target, { readonly: true });
  assert.equal(original.prepare("SELECT value FROM synthetic_items").get().value, "original remains usable");
  original.close();
});

test("refuses to install over orphaned WAL or SHM sidecars", async (t) => {
  const fixture = tempDir(t);
  const root = fixture.path;
  const source = join(root, "source.sqlite");
  roadfixDb(fixture, source).close();
  const backup = await backupDatabase({ sourcePath: source, directory: join(root, "backups") });
  const target = join(root, "target.sqlite");
  writeFileSync(`${target}-wal`, "preserve unknown WAL");
  await assert.rejects(restoreDatabase({ backupPath: backup.path, targetPath: target }), /sidecar exists/);
  assert.equal(readFileSync(`${target}-wal`, "utf8"), "preserve unknown WAL");
  assert.equal(false, existsSync(target));
});

test("protects existing targets unless overwrite is explicit and creates a safety backup before replacement", async (t) => {
  const fixture = tempDir(t);
  const root = fixture.path;
  const source = join(root, "source.sqlite");
  const sourceDb = roadfixDb(fixture, source);
  put(sourceDb, "replacement value");
  sourceDb.close();
  const backup = await backupDatabase({ sourcePath: source, directory: join(root, "backups") });
  const target = join(root, "target.sqlite");
  const targetDb = roadfixDb(fixture, target);
  put(targetDb, "pre-restore value");
  targetDb.close();
  await assert.rejects(restoreDatabase({ backupPath: backup.path, targetPath: target }), /confirm-overwrite/);
  const result = await restoreDatabase({ backupPath: backup.path, targetPath: target, confirmOverwrite: true });
  assert.ok(result.safetyBackup);
  assert.equal(verifyDatabase(result.safetyBackup).integrity, "ok");
  const safe = new Database(result.safetyBackup, { readonly: true });
  assert.equal(safe.prepare("SELECT value FROM synthetic_items").get().value, "pre-restore value");
  safe.close();
  const replaced = new Database(target, { readonly: true });
  assert.equal(replaced.prepare("SELECT value FROM synthetic_items").get().value, "replacement value");
  replaced.close();
});

test("restore with existing target commits replacement and keeps safety backup valid", async (t) => {
  const fixture = tempDir(t); const root = fixture.path;
  const source = roadfixDb(fixture, join(root, "source.sqlite")); put(source, "new"); source.close();
  const backup = await backupDatabase({ sourcePath: join(root, "source.sqlite"), directory: join(root, "backups") });
  const target = join(root, "target.sqlite"); const old = roadfixDb(fixture, target); put(old, "old"); old.close();
  const result = await restoreDatabase({ backupPath: backup.path, targetPath: target, confirmOverwrite: true });
  const installed = new Database(target, { readonly: true }); assert.equal(installed.prepare("SELECT value FROM synthetic_items").get().value, "new"); installed.close();
  assert.equal(verifyDatabase(result.safetyBackup).integrity, "ok");
});

test("failure before promotion restores original and reports rollback paths on rollback failure", async (t) => {
  const fixture = tempDir(t); const root = fixture.path;
  const source = roadfixDb(fixture, join(root, "source.sqlite")); put(source, "new"); source.close();
  const backup = await backupDatabase({ sourcePath: join(root, "source.sqlite"), directory: join(root, "backups") });
  const target = join(root, "target.sqlite"); const old = roadfixDb(fixture, target); put(old, "old"); old.close();
  const originalRename = renameSync;
  await assert.rejects(restoreDatabase({ backupPath: backup.path, targetPath: target, confirmOverwrite: true, fileOps: { renameSync(from, to) { if (from.endsWith(".restore.tmp")) throw new Error("promotion blocked"); originalRename(from, to); } } }), /promotion blocked/);
  const current = new Database(target, { readonly: true }); assert.equal(current.prepare("SELECT value FROM synthetic_items").get().value, "old"); current.close();
});

test("verification failure after promotion restores original", async (t) => {
  const fixture = tempDir(t); const root = fixture.path;
  const source = roadfixDb(fixture, join(root, "source.sqlite")); put(source, "new"); source.close();
  const backup = await backupDatabase({ sourcePath: join(root, "source.sqlite"), directory: join(root, "backups") });
  const target = join(root, "target.sqlite"); const old = roadfixDb(fixture, target); put(old, "old"); old.close();
  let targetChecks = 0;
  await assert.rejects(restoreDatabase({ backupPath: backup.path, targetPath: target, confirmOverwrite: true, verify(path) { if (path === target && ++targetChecks > 0) throw new Error("verification injected"); return verifyDatabase(path); } }), /verification injected/);
  const current = new Database(target, { readonly: true }); assert.equal(current.prepare("SELECT value FROM synthetic_items").get().value, "old"); current.close();
});

test("cleanup failure after commit preserves restored database and names leftover recovery files", async (t) => {
  const fixture = tempDir(t); const root = fixture.path;
  const source = roadfixDb(fixture, join(root, "source.sqlite")); put(source, "new"); source.close();
  const backup = await backupDatabase({ sourcePath: join(root, "source.sqlite"), directory: join(root, "backups") });
  const target = join(root, "target.sqlite"); const old = roadfixDb(fixture, target); put(old, "old"); old.close();
  const result = await restoreDatabase({ backupPath: backup.path, targetPath: target, confirmOverwrite: true, fileOps: { rmSync(path, options) { if (path.endsWith(".previous")) throw new Error("cleanup blocked"); return rmSync(path, options); } } });
  assert.ok(result.recoveryFiles.length >= 1);
  assert.ok(result.recoveryFiles.every((path) => existsSync(path)));
  const current = new Database(target, { readonly: true }); assert.equal(current.prepare("SELECT value FROM synthetic_items").get().value, "new"); current.close();
});

test("partial sidecar movement rolls database and already moved sidecars back without overwriting", async (t) => {
  const fixture = tempDir(t); const root = fixture.path;
  const source = roadfixDb(fixture, join(root, "source.sqlite")); put(source, "new"); source.close();
  const backup = await backupDatabase({ sourcePath: join(root, "source.sqlite"), directory: join(root, "backups") });
  const target = join(root, "target.sqlite"); const old = roadfixDb(fixture, target); put(old, "old"); old.close();
  writeFileSync(`${target}-wal`, ""); writeFileSync(`${target}-shm`, "");
  let sidecarMoves = 0;
  await assert.rejects(restoreDatabase({ backupPath: backup.path, targetPath: target, confirmOverwrite: true, fileOps: { renameSync(from, to) { if (from === `${target}-shm`) throw new Error("SHM movement injected"); if (from === `${target}-wal`) sidecarMoves += 1; return renameSync(from, to); } } }), /SHM movement injected/);
  const current = new Database(target, { readonly: true }); assert.equal(current.prepare("SELECT value FROM synthetic_items").get().value, "old"); current.close();
  assert.equal(sidecarMoves, 1);
  assert.equal(existsSync(`${target}-wal`), true);
});

test("rollback failure reports exact displaced recovery paths and retains files", async (t) => {
  const fixture = tempDir(t); const root = fixture.path;
  const source = roadfixDb(fixture, join(root, "source.sqlite")); put(source, "new"); source.close();
  const backup = await backupDatabase({ sourcePath: join(root, "source.sqlite"), directory: join(root, "backups") });
  const target = join(root, "target.sqlite"); const old = roadfixDb(fixture, target); put(old, "old"); old.close();
  let displacedPath;
  await assert.rejects(restoreDatabase({ backupPath: backup.path, targetPath: target, confirmOverwrite: true,
    verify(path) { if (path === target) throw new Error("verification injected"); return verifyDatabase(path); },
    fileOps: { renameSync(from, to) { if (from === target && to.endsWith(".previous")) displacedPath = to; if (to === target && from === displacedPath) throw new Error("rollback blocked"); return renameSync(from, to); } },
  }), (error) => error.message.includes("rollback blocked") && error.message.includes(displacedPath));
  assert.ok(displacedPath && existsSync(displacedPath));
  assert.equal(existsSync(target), false);
});

for (const suffix of ["-wal", "-shm", ""]) {
  test(`candidate ${suffix || "database"} quarantine failure leaves original displaced and reports paths`, async (t) => {
    const { target, backupPath } = await restoreFixture(t);
    const candidateWal = `${target}-wal`; const candidateShm = `${target}-shm`;
    const candidateWalBytes = "candidate WAL sentinel"; const candidateShmBytes = "candidate SHM sentinel";
    let displacedPath;
    const quarantinePaths = [];
    await assert.rejects(restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true,
      verify(path) {
        if (path === target) { writeFileSync(candidateWal, candidateWalBytes); writeFileSync(candidateShm, candidateShmBytes); throw new Error("candidate verification injected"); }
        return verifyDatabase(path);
      },
      fileOps: { renameSync(from, to) {
        if (from === target && to.endsWith(".previous")) { displacedPath = to; return renameSync(from, to); }
        if ((from === candidateWal || from === candidateShm || from === target) && to.includes("failed-candidate")) {
          quarantinePaths.push(to);
          if (from === `${target}${suffix}`) throw new Error(`locked candidate ${suffix || "database"}`);
        }
        return renameSync(from, to);
      } },
    }), (error) => error.message.includes("candidate verification injected") && error.message.includes(`locked candidate ${suffix || "database"}`) && error.message.includes(displacedPath) && error.message.includes(target) && quarantinePaths.every((path) => error.message.includes(path)));
    assert.ok(existsSync(displacedPath)); assert.equal(valueAt(displacedPath), "original");
    const candidateDatabase = suffix === "" ? target : quarantinePaths.find((path) => path.endsWith(".sqlite"));
    assert.ok(candidateDatabase && existsSync(candidateDatabase));
    assert.equal(valueAt(candidateDatabase), "candidate");
    if (suffix === "-wal") assert.equal(readFileSync(candidateWal, "utf8"), candidateWalBytes);
    if (suffix === "-shm") assert.equal(readFileSync(candidateShm, "utf8"), candidateShmBytes);
    for (const path of quarantinePaths) if (existsSync(path)) assert.ok(readFileSync(path).length > 0);
  });
}

test("multiple candidate sidecar failures stop original restoration and report every error and path", async (t) => {
  const { target, backupPath } = await restoreFixture(t); let displacedPath;
  const wal = `${target}-wal`; const shm = `${target}-shm`;
  await assert.rejects(restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true,
    verify(path) { if (path === target) { writeFileSync(wal, "candidate wal"); writeFileSync(shm, "candidate shm"); throw new Error("verify failed first"); } return verifyDatabase(path); },
    fileOps: { renameSync(from, to) {
      if (from === target && to.endsWith(".previous")) { displacedPath = to; return renameSync(from, to); }
      if ((from === wal || from === shm) && to.includes("failed-candidate")) throw new Error(`locked ${from}`);
      return renameSync(from, to);
    } },
  }), (error) => error.message.includes("verify failed first") && error.message.includes(`locked ${wal}`) && error.message.includes(`locked ${shm}`) && error.message.includes(displacedPath) && error.message.includes(wal) && error.message.includes(shm));
  assert.equal(valueAt(displacedPath), "original");
  assert.equal(readFileSync(wal, "utf8"), "candidate wal"); assert.equal(readFileSync(shm, "utf8"), "candidate shm");
});

for (const suffix of ["-wal", "-shm"]) {
  test(`original ${suffix} restoration failure keeps original database displaced`, async (t) => {
    const { target, backupPath } = await restoreFixture(t); const wal = `${target}-wal`; const shm = `${target}-shm`;
    let displacedDb; const originalSidecars = new Map();
    const sentinels = new Map([[wal, "original WAL sentinel"], [shm, "original SHM sentinel"]]);
    await assert.rejects(restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true,
      verify(path) { if (path === target) throw new Error("verification fails"); return verifyDatabase(path); },
      fileOps: { renameSync(from, to) {
        if (from === target && to.endsWith(".previous")) {
          displacedDb = to; writeFileSync(wal, sentinels.get(wal)); writeFileSync(shm, sentinels.get(shm)); return renameSync(from, to);
        }
        if ((from === wal || from === shm) && to.endsWith(".previous")) { originalSidecars.set(from, to); return renameSync(from, to); }
        if (from === originalSidecars.get(`${target}${suffix}`) && to === `${target}${suffix}`) throw new Error(`locked original ${suffix}`);
        return renameSync(from, to);
      } },
    }), (error) => error.message.includes(`locked original ${suffix}`) && error.message.includes(originalSidecars.get(`${target}${suffix}`)) && error.message.includes(displacedDb));
    assert.equal(valueAt(displacedDb), "original");
    for (const [originalPath, sentinel] of sentinels) {
      const recovery = originalSidecars.get(originalPath);
      const location = existsSync(recovery) ? recovery : originalPath;
      assert.equal(readFileSync(location, "utf8"), sentinel);
    }
    assert.equal(existsSync(target), false);
  });
}

test("original database restoration failure preserves displaced original and reports both paths", async (t) => {
  const { target, backupPath } = await restoreFixture(t); let displacedDb;
  await assert.rejects(restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true,
    verify(path) { if (path === target) throw new Error("verification fails"); return verifyDatabase(path); },
    fileOps: { renameSync(from, to) {
      if (from === target && to.endsWith(".previous")) { displacedDb = to; return renameSync(from, to); }
      if (from === displacedDb && to === target) throw new Error("original database locked");
      return renameSync(from, to);
    } },
  }), (error) => error.message.includes("verification fails") && error.message.includes("original database locked") && error.message.includes(displacedDb) && error.message.includes(target));
  assert.equal(valueAt(displacedDb), "original"); assert.equal(existsSync(target), false);
});

test("successful restore remains correct after rollback quarantine changes", async (t) => {
  const { target, backupPath } = await restoreFixture(t);
  await restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true });
  assert.equal(valueAt(target), "candidate");
});

test("exclusive recovery copy refuses an existing destination without overwriting it", async (t) => {
  const { target, backupPath } = await restoreFixture(t); let collisionPath;
  const sentinel = "pre-existing recovery file";
  await assert.rejects(restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true,
    fileOps: { copyFileSync(from, to, flags) {
      if (from === target && to.endsWith(".previous")) { collisionPath = to; writeFileSync(to, sentinel); }
      return copyFileSync(from, to, flags);
    } },
  }), (error) => error.cause?.code === "EEXIST" && error.message.includes(collisionPath) && error.message.includes(target));
  assert.equal(valueAt(target), "original");
  assert.equal(readFileSync(collisionPath, "utf8"), sentinel);
});

test("promotion unlink failure quarantines the copied candidate before restoring original", async (t) => {
  const { target, backupPath } = await restoreFixture(t); let candidatePath;
  await assert.rejects(restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true,
    fileOps: { unlinkSync(path) { if (path.endsWith(".restore.tmp")) throw new Error("staged candidate locked"); return rmSync(path); } },
  }), (error) => {
    candidatePath = error.message.split("restore recovery paths: ")[1]?.split(";")[0]?.split(", ").find((path) => path.includes(".failed-candidate-") && path.endsWith(".sqlite"));
    return error.message.includes("staged candidate locked") && error.message.includes(target);
  });
  assert.equal(valueAt(target), "original");
  assert.ok(candidatePath && existsSync(candidatePath));
});

test("failed partial-promotion quarantine leaves original displaced and candidate sidecar-free", async (t) => {
  const { target, backupPath } = await restoreFixture(t); let displacedPath;
  await assert.rejects(restoreDatabase({ backupPath, targetPath: target, confirmOverwrite: true,
    fileOps: {
      copyFileSync(from, to, flags) {
        if (from === target && to.endsWith(".previous")) displacedPath = to;
        if (from === target && to.includes("failed-candidate")) throw new Error("candidate quarantine locked");
        return copyFileSync(from, to, flags);
      },
      unlinkSync(path) { if (path.endsWith(".restore.tmp")) throw new Error("staged candidate locked"); return rmSync(path); },
    },
  }), (error) => error.message.includes("staged candidate locked") && error.message.includes("candidate quarantine locked") && error.message.includes(displacedPath));
  assert.equal(valueAt(displacedPath), "original"); assert.equal(valueAt(target), "candidate");
});

test("integrity command accepts valid files and detects corrupt files", (t) => {
  const fixture = tempDir(t);
  const root = fixture.path;
  const valid = join(root, "valid.sqlite");
  roadfixDb(fixture, valid).close();
  assert.equal(integrityCheck(valid).integrity, "ok");
  const invalid = join(root, "invalid.sqlite");
  writeFileSync(invalid, "corrupt synthetic file");
  assert.throws(() => integrityCheck(invalid));
  const cli = fileURLToPath(new URL("./maintenance-cli.js", import.meta.url));
  const validCommand = spawnSync(process.execPath, [cli, "integrity", valid], { encoding: "utf8" });
  const invalidCommand = spawnSync(process.execPath, [cli, "integrity", invalid], { encoding: "utf8" });
  assert.equal(validCommand.status, 0, validCommand.stderr);
  assert.match(validCommand.stdout, /Integrity: ok/);
  assert.equal(invalidCommand.status, 1);
  assert.match(invalidCommand.stderr, /integrity failed/);
});
