# Final SQLite Restore Safety Sign-off

## Verdict: PASS WITH FINDINGS

The latest rollback correction resolves the earlier high-severity database/sidecar pairing problem. After a failed promotion or verification, candidate WAL and SHM files are quarantined first, followed by the candidate database. Only after candidate paths are cleared does rollback restore displaced original sidecars, with the original database restored last. A failed candidate or original sidecar move prevents database restoration. No reviewed path deletes the only valid database copy before commit.

**Controlled pilot: Yes, with offline and serialized operation.** Stop RoadFix and all other SQLite clients, use a verified backup on the same target volume, and do not run concurrent restores or writers. If the operation reports rollback errors, do not restart until following its recovery instructions and verifying integrity. This sign-off does not certify unattended or concurrent restore use.

## Findings ranked by severity

### Medium — Windows lock behavior is simulated, not exercised with a real competing process

Production moves use `copyFileSync(..., COPYFILE_EXCL)` and then `unlinkSync` (`server/src/db/maintenance.js:119-125`). If copy fails, the source remains; if unlink fails after the exclusive copy succeeded, both source and recovery copy remain. Rollback treats this as a failure and does not restore the original database while a candidate sidecar may remain (`maintenance.js:204-245`). This is a safe failure mode by inspection.

The fault-injection tests exercise rename, copy, and unlink failures (`maintenance.test.js:208-248`, `:256-293`, `:301-340`), but they do not hold a real SQLite WAL/SHM handle from another Windows process. File-sharing and antivirus behavior may differ from the injected errors. Keep the offline, single-writer restriction for the pilot.

### Low — A target created concurrently with promotion may be quarantined

`promotionAttempted` is set immediately before installing the staged file (`maintenance.js:186-188`). If `COPYFILE_EXCL` encounters a target created concurrently, rollback conservatively inventories and tries to quarantine files at the target (`maintenance.js:204-217`) before it can restore the displaced original. This avoids overwriting the concurrent file or putting the original database beside unknown sidecars, but it can move that concurrent file into a recovery path. Its target and recovery paths are included in the error inventory (`maintenance.js:270-275`).

The tests cover collisions with an existing recovery destination (`maintenance.test.js:301-312`) and a partially completed promotion (`:314-340`), but not an external process creating the target between initial inspection and promotion. Serializing restore and stopping all writers avoids this case.

### Low — Windows path identity check covers ordinary case differences only

Backup/target equality uses resolved path strings and lowercases them on Windows (`maintenance.js:128-133`). It does not detect hard-link, short-name, or every device/UNC alias. The staged and recovery files are created beside the target (`maintenance.js:147-151`), and exclusive destination creation prevents overwriting ordinary existing paths. This alias limitation is low risk for a controlled pilot using explicitly distinct, canonical paths.

## Requirement review

- **Candidate quarantine ordering:** Target WAL and SHM are processed before the candidate database (`maintenance.js:204-217`). Quarantine names include a per-restore UUID and an additional UUID (`:147`, `:111-116`). Each destination is checked before move (`:106-109`), and production copy uses `COPYFILE_EXCL` (`:120-124`). Candidate move failures stop original restoration while retaining and reporting the remaining files (`:212-217`, `:270-275`).
- **Original rollback order:** Displaced original sidecars are restored first. The original database is restored only after sidecar restoration succeeds (`:219-245`). A candidate sidecar left at target blocks restoration of the original sidecar and database.
- **Partial promotion:** `promotionAttempted` ensures a target produced by a copy whose source unlink failed is treated as a possible candidate even though `promoted` was not set (`:154`, `:186-188`, `:204-217`). The deterministic test covers staged unlink failure and successful quarantine (`maintenance.test.js:314-324`), plus quarantine failure (`:326-339`).
- **Original/candidate preservation:** Displacement and recovery moves copy exclusively before unlinking. An unlink failure leaves both copies; a rollback failure records the paths and keeps the original database displaced (`maintenance.js:120-125`, `:209-245`). Sentinel-content assertions exercise candidate WAL/SHM and original WAL/SHM preservation (`maintenance.test.js:211-254`, `:256-279`).
- **Post-commit cleanup:** The commit point is after target verification (`maintenance.js:187-190`). Cleanup is caught per displaced file and returns leftovers; it does not enter rollback or delete the restored target (`:191-198`). A deterministic cleanup failure test checks the restored row and extant recovery paths (`maintenance.test.js:159-168`).
- **Safety backup:** Checkpointing, sidecar-state validation, and `backupDatabase` complete before displacement (`maintenance.js:164-184`). Existing-target tests verify the safety backup integrity and old row (`maintenance.test.js:118-137`).
- **Error reporting and manual recovery:** The original operation error is retained as the thrown error's message and cause; rollback errors are appended. The inventory names backup, target sidecars, staged, displaced, candidate, and recovery paths, with explicit manual recovery instructions when rollback itself fails (`maintenance.js:199-275`).
- **Test claims:** The correction report's deterministic coverage is borne out by the test source. The test file includes synthetic DB fixtures, candidate WAL/SHM/database quarantine failures, multiple failures, original DB/WAL/SHM restoration failures, recovery path checks, successful restores, recovery-destination collision, partial promotion, and post-commit cleanup (`maintenance.test.js:33-44`, `:208-340`). The reported suite counts were not rerun as part of this read-only audit.

## Remaining risks

- Real Windows file-lock behavior has not been exercised with another process holding a sidecar open.
- Exclusive copying requires enough free disk space for a second copy. A failed unlink may leave both the source and destination, which must be handled using the reported paths.
- A concurrent target creator may have its file moved to recovery quarantine; serialize restore and stop writers.
- Windows path aliases beyond ordinary case differences are not detected.

## Read-only confirmation

This sign-off used source and report inspection only. No tests, database commands, migrations, or production database operations were run. No application files were changed. Only this sign-off document was created; nothing was staged, committed, or pushed.
