# Final SQLite Restore Safety Audit

## Verdict: PASS WITH FINDINGS

The reviewed implementation closes the reported post-commit data-loss path: the commit point follows verification, and cleanup exceptions are handled locally so they cannot reach rollback. No definite path was found where a post-commit cleanup error deletes the restored database. The pre-commit rollback preserves the displaced original files and avoids overwriting sidecars in normal and tested partial-move cases.

There are recovery-reporting and test-coverage gaps around failures that occur during rollback itself. Because these are precisely the paths where an operator must know where the original database and its matching sidecars remain, I would not call this ready for a controlled pilot until the rollback failure cases below are covered and the recovery ordering/reporting is tightened.

## Findings ranked by severity

### High — Sidecar rollback failure can leave an original DB paired with a candidate sidecar

`server/src/db/maintenance.js:187-205` attempts to remove promoted target sidecars and the promoted database independently. If removal of a promoted sidecar fails at lines 188-191, the code still attempts to remove the promoted database at line 192 and then restore the displaced original database at lines 194-198. When the target sidecar remains, displaced original sidecar restoration at lines 199-204 correctly refuses to overwrite it and reports both paths. However, the old database may now be at the target path next to a sidecar from the candidate restore. That mismatched pair is unsafe to open as a normal SQLite database until manually recovered. Prefer stopping DB restoration when a candidate sidecar cannot be removed, or otherwise ensure the original is restored only with its own sidecars and report a clear manual recovery state.

There is no test that injects a sidecar removal failure during rollback and checks which database/sidecars remain. The current rollback-failure test only fails moving the displaced database back (`maintenance.test.js:183-195`).

### Medium — Recovery path list omits a displaced file if it exists but its move-back fails

At `server/src/db/maintenance.js:197`, `attempt` is passed `displaced` as the recovery path, so the thrown error names it when rename throws. This is good for the database move failure. However, if restoring a displaced sidecar fails at line 203, the error names that source path, also good. In the branch where the destination already exists (lines 196 and 202), paths are reported. The code generally reports these cases correctly; the remaining gap is untested combined failures (e.g. database restore and one or both sidecar restores fail), so verify the aggregated message preserves every path and every rollback error rather than relying on one injected failure.

### Medium — Partial-sidecar test does not prove all original sidecars are recovered intact

The injected SHM move failure test (`maintenance.test.js:170-181`) checks the old database row, that the WAL rename was attempted, and that a target WAL path exists. It does not compare WAL/SHM bytes or inspect displaced sidecar paths, and it does not establish that an existing target SHM was restored/retained as the original. The fixture uses empty sidecars, which makes content-level preservation impossible to distinguish. Use distinct deterministic sentinel sidecar contents (or operation-level fixtures that do not pass non-empty sidecars through SQLite checkpoint) and assert exact contents and absence/presence at every original and displaced path.

### Low — Case folding is not a complete Windows same-file check

`server/src/db/maintenance.js:112-115` compares resolved paths case-insensitively on Windows, which handles ordinary drive/path case differences. It does not detect aliases such as hard links, short-name aliases, or some device/UNC path equivalences. This is a narrow path alias risk; consider `realpath`/file identity checks for existing files and Windows-specific tests. The staged copy and promotion happen in the target directory (`:129-167`), avoiding cross-volume rename for the target promotion. Safety backup publication uses `COPYFILE_EXCL` (`:74-76`), which avoids replacing an existing timestamped backup on Windows.

## Requirement review

1. **Commit point:** Correctly placed after `verify(target)` returns at `maintenance.js:169-170`.
2. **Post-commit cleanup:** Cleanup is outside the rollback-triggering behavior because each deletion is caught at `:173-176`; the target is not deleted in this path. Cleanup leftovers are returned in `recoveryFiles` at `:178`.
3. **Original DB and sidecars:** The target database is displaced before sidecars (`:162-166`); rollback restores it and then sidecars (`:194-204`). There is a transient ordering/mismatch risk noted above if candidate-sidecar deletion fails.
4. **Partial sidecar moves:** Existing sidecars move individually, and rollback checks destination presence before moving, avoiding overwrite (`:99-103`, `:199-204`). The usual partial-move path is covered, but sidecar content preservation and rollback-operation failures are not fully tested.
5. **Rollback failures:** Errors are accumulated with labels, recovery paths are deduplicated and appended, and the original operation error remains first (`:182-210`). Remaining staged artifacts are reported at `:207`. More combined failure injection is needed to validate complete path coverage.
6. **Safety backup:** The original is checkpointed, sidecar state checked, and `backupDatabase` awaited before displacement (`:145-160`, then `:162`). `backupDatabase` verifies its temporary SQLite backup before exclusive publication (`:71-76`); the restore tests verify the safety backup and its old row (`maintenance.test.js:105-126`, `:129-137`). There is no injected safety-backup publication/verification failure test, but the current ordering does not displace the original until that operation returns.
7. **Windows:** Same-directory staging/promotion avoids cross-volume rename; exclusive creation prevents overwriting staged and published files (`:139-143`, `:74-76`). The path comparison has the alias limitation above. Windows-specific sidecar lock/delete failures are not exercised by the tests.
8. **Test claims:** The tests use synthetic SQLite databases and deterministic injected `renameSync`, `rmSync`, and `verify` failures. They genuinely cover successful new/existing targets, pre-promotion failure, post-promotion verification failure, post-commit cleanup failure, a partial sidecar move, a DB rollback failure, and safety-backup validity. The combined rollback and sidecar-deletion failure scenario is missing.
9. **Only valid copy:** The success commit path does not delete the new DB on cleanup failure. Before commit, a displaced original is kept if restoration fails; if there is no displaced original, the promoted file is retained and listed (`:185-186`). The main residual concern is mismatched DB/sidecar state during a sidecar-removal rollback failure, not silent deletion of the sole DB file.

## Pilot assessment

**Not yet safe enough for a controlled pilot.** The core commit/cleanup behavior is sound, and no post-commit cleanup path deletes the restored database. Before pilot use, address or explicitly guard the rollback sidecar-removal failure ordering, and add deterministic tests for rollback sidecar deletion failure and multiple simultaneous rollback failures with exact recovery-path assertions.

## Read-only confirmation

This audit used source inspection only. No tests, migrations, production database operations, account creation, or data imports were run. No files were changed except this audit document. Nothing was staged, committed, or pushed.
