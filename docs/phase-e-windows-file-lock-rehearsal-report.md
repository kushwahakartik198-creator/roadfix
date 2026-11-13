# Phase E Launch Gate 1 — Real Windows SQLite File-Lock Rehearsal

## Verdict: PASS WITH FINDINGS

A genuine separate Node process held a synthetic RoadFix-format SQLite database open in WAL mode. A second process successfully made an online backup while the first held a read transaction. With a separate process holding `BEGIN IMMEDIATE` and an uncommitted write, `restoreDatabase()` failed at its WAL checkpoint gate before displacing the original. The original DB/WAL/SHM paths remained present; after releasing the writer, SQLite integrity and foreign-key checks passed and the original committed rows remained. A subsequent restore succeeded after the lock was released.

Finding: the failed restore leaves a verified staged candidate database and its `-wal`/`-shm` temporary sidecars in the target directory. The error identifies them under `existing recovery files`; operators must preserve and inspect those paths. The test also does not exercise a Windows sharing violation at the later copy/unlink stage, because the real SQLite writer caused restore to abort before displacement. Keep restore offline and serialized.

## Platform and versions

- Windows registry reports: **Windows 10 Home Single Language**, DisplayVersion **25H2**, build **26200**, UBR **9974**, client installation.
- Runtime platform: `win32` (`Microsoft Windows 10.0.26200`). A CIM query was denied by the environment, so edition/build were read from `HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion` instead.
- Node.js: **v24.20.0**.
- npm: **11.19.0**.

The Home Single Language edition was recorded as observed; this rehearsal did not configure or verify BitLocker capability/status.

## Inspection and test design

Inspected `server/src/db/maintenance.js`, `docs/phase-d-final-signoff.md`, and `docs/phase-d-final-restore-correction-report.md`. The production restore implementation uses the real SQLite `wal_checkpoint(TRUNCATE)` before displacing an existing target (`maintenance.js:329-344`), and moves files using exclusive copy then unlink. The final sign-off required a real competing-process rehearsal because earlier tests injected filesystem failures only.

The complete successful run used a fresh `os.tmpdir()` directory:

`C:\Users\kushw\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{213c1404-d0e2-4efb-ba58-662a974d3210}\Temp\roadfix-win-lock-rehearsal-nbTkTL`

It contained only synthetic files and was recursively removed by the harness after both child processes were released and final integrity checks completed (`TEMP_SYNTHETIC_DIRECTORY_REMOVED=true`). The target was `target.sqlite`; no default RoadFix DB path was supplied to either maintenance function.

Synthetic schema and seed:

- Created a SQLite database with `journal_mode=WAL`, `foreign_keys=ON`, and RoadFix application ID `0x52444658` so the existing verifier could check it.
- Created a synthetic `schema_migrations` table/row, a `records` table, and a `references_to_records` table with a foreign key.
- Seeded `records` with `original-sentinel` and the corresponding foreign-key row.
- Made the restore candidate with `backupDatabase({ sourcePath: target, directory: candidateDir })` before starting the lock processes.

The harness ran from `C:\Users\kushw\roadfix\server` using an inline Node ESM script piped to `node --input-type=module`. It launched the competing processes with:

```js
spawn(process.execPath, ["--input-type=module", "-e", childSource, target, mode], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
});
```

The child source opened the target with `better-sqlite3`, set WAL mode, then used one of these real SQLite lock states and stayed alive until it received `release` on stdin:

```js
// Reader process: create a committed WAL record, then hold a read transaction.
db.prepare("INSERT INTO records(label) VALUES (?)").run("committed-by-reader-process");
db.exec("BEGIN");
db.prepare("SELECT count(*) AS n FROM records").get();

// Writer process: hold SQLite's write transaction/lock with an uncommitted row.
db.exec("BEGIN IMMEDIATE");
db.prepare("INSERT INTO records(label) VALUES (?)").run("uncommitted-writer-sentinel");
```

The parent process performed the actual maintenance calls:

```js
await backupDatabase({ sourcePath: target, directory: duringReadDir });
await restoreDatabase({ backupPath: candidate.path, targetPath: target, confirmOverwrite: true });
// After releasing the writer:
await restoreDatabase({ backupPath: candidate.path, targetPath: target, confirmOverwrite: true });
integrityCheck(target);
```

The restore call while the writer was active was expected to throw; the harness captured its error and checked file existence/inventory before releasing the process. Both competing processes were then sent `release`; the child rolled back any active transaction, closed its SQLite connection, and exited with code 0. The full successful run completed once. A preliminary harness attempt stopped when its own `readFileSync` tried to hash the live SHM and received Windows `EBUSY`; the harness was adjusted to record path metadata/errors while handles were live and verify DB contents after release. No maintenance operation ran in that preliminary attempt, and a process check found no surviving Node locker.

## Observed results

### Backup during a second-process read lock

Reader process PID **13184** reported `READY pid=13184 mode=reader`. While it remained open with a read transaction, all three paths existed:

| File | Size | SHA-256 while reader held it |
| --- | ---: | --- |
| `target.sqlite` | 20,480 bytes | `55543a4d5807b621fa253fc57d2766a7758842c132751bf53e04c638f2e310a2` |
| `target.sqlite-wal` | 4,152 bytes | `3a279da9e0d844796da3a46f12dfd066c2aba8c97f62924b6d6e90b8779f651d` |
| `target.sqlite-shm` | 32,768 bytes | `50563b00edceb8c19c6052503511a5c760f2943a91a334a26a063a70f0a56d7e` |

`backupDatabase()` completed while that other process held SQLite handles. `integrityCheck()` on the resulting backup returned `integrity: "ok"` and `foreignKeyViolations: 0`. This demonstrates the online backup path can complete with a competing reader; it does not justify backing up while writers are active. The documented stop-all-writers attestation remains required to keep the DB/uploads pair consistent.

### Restore during a second-process writer lock

Writer process PID **15348** reported `READY pid=15348 mode=writer` after `BEGIN IMMEDIATE` and an uncommitted synthetic insert. All target paths existed while it held the connection. The DB hash and empty WAL hash were the same immediately before and after the restore attempt; the 32,768-byte SHM remained present but Windows denied direct hash reading with `EBUSY: resource busy or locked, read` while the writer held it.

The actual restore call failed with:

> `Could not checkpoint database WAL; stop all RoadFix server processes and retry`

This is the implementation's busy-checkpoint guard. Restore did not reach original displacement or candidate promotion. The target directory contained no `.previous` displaced-original files. It did contain the staged, verified candidate and its sidecars from the attempt:

- `C:\Users\kushw\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{213c1404-d0e2-4efb-ba58-662a974d3210}\Temp\roadfix-win-lock-rehearsal-nbTkTL\.target.sqlite.d296f38a-78ce-446e-acb2-3f6361d29ed2.restore.tmp`
- `C:\Users\kushw\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{213c1404-d0e2-4efb-ba58-662a974d3210}\Temp\roadfix-win-lock-rehearsal-nbTkTL\.target.sqlite.d296f38a-78ce-446e-acb2-3f6361d29ed2.restore.tmp-wal`
- `C:\Users\kushw\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{213c1404-d0e2-4efb-ba58-662a974d3210}\Temp\roadfix-win-lock-rehearsal-nbTkTL\.target.sqlite.d296f38a-78ce-446e-acb2-3f6361d29ed2.restore.tmp-shm`

The error's recovery inventory also named the candidate, target, sidecars, and planned displaced paths; its `existing recovery files` list identified the staged DB/WAL/SHM files above. After releasing the writer cleanly, `integrityCheck(target)` returned `integrity: "ok"` and `foreignKeyViolations: 0`. The original committed rows were `original-sentinel` and `committed-by-reader-process`; the uncommitted writer sentinel was absent. Thus the original database and committed reader-process row remained recoverable after the failed restore.

### Restore after lock release

With all child handles closed, the same real `restoreDatabase()` call succeeded against the synthetic target. Its returned verification was `integrity: "ok"`, with no leftover cleanup files. A final `integrityCheck()` returned `integrity: "ok"`, `foreignKeyViolations: 0`, and the restored candidate contained only `original-sentinel`. The temporary directory, including leftover staged files from the failed attempt, was then removed as test-owned synthetic data.

## Findings and follow-up

1. **Safe lock response observed:** a real competing SQLite writer made checkpoint fail before original DB/WAL/SHM displacement. The original remained readable and passed integrity/foreign-key checks after lock release.
2. **Staged recovery artifacts remain on failed pre-displacement restore:** the failed attempt leaves a verified restore-temp DB plus `-wal` and `-shm`; the error reports their exact paths as existing recovery files. Preserve and inspect these after an operational error. Do not delete them merely because the original still exists.
3. **No Windows move/unlink sharing failure was exercised:** the writer lock stopped restore at checkpoint before `COPYFILE_EXCL`/unlink moves. This rehearsal verifies a genuine competing SQLite lock and the checkpoint fail-safe, but does not prove how Windows behaves if a separate non-SQLite handle blocks a later file move. The offline, serialized restore rule remains mandatory.
4. **Backup read-lock scope is limited:** the successful backup was made under a reader, not a competing writer. It does not test consistent pairing of DB and uploads under concurrent submissions; stop all writers before creating backup sets.
5. **Host protections remain unverified:** this test did not check or enable BitLocker, NTFS ACLs, production hosting, or the production browser/API proxy.

## Safety confirmation

All target and backup paths were under the new synthetic temp directory. The default `server/data/roadfix.sqlite` path and any existing RoadFix data were not passed to maintenance commands or opened. The child processes were released, their transactions rolled back where applicable, and both exited cleanly. Synthetic DB integrity and foreign-key checks passed before final cleanup. No source, package, or existing report was changed; nothing was staged, committed, or pushed.
