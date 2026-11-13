# RoadFix — Phase E, Stage 2B Restore CLI Reporting

## Summary

Updated the restore CLI to surface `restoreDatabase()` cleanup leftovers clearly. A normal restore prints `restore successful`; a committed restore with leftovers prints `restore successful with leftover recovery files`, identifies cleanup as incomplete, warns the operator not to delete the files until checked, and prints every returned recovery path. Missing or empty `recoveryFiles` is treated as no leftovers. Restore errors still print the original restore/rollback details, including recovery paths and manual recovery instructions.

The restore algorithm, rollback ordering, migrations, schemas, and dependencies were not changed.

## Changed files

- `server/src/db/maintenance-cli.js` — extracted `runMaintenanceCli()` so CLI output can be exercised without starting a separate process; added explicit restore-success/leftover reporting. Backup and integrity output remains as before. Running the file directly still sets the process exit code based on the command result.
- `server/src/db/maintenance.test.js` — added focused CLI tests using temporary synthetic SQLite databases. The test harness injects restore results and filesystem failures deterministically and captures CLI output.
- `docs/phase-e-stage-2b-restore-cli-report.md` — this report.

## Exact behavior

- No leftovers: successful restore, database path, optional safety backup, and integrity are printed.
- One or more leftovers: a distinct successful-with-leftovers heading, `Cleanup incomplete` warning, the instruction “Do not delete these files until each has been checked,” and one `Recovery file: <path>` line for every entry returned.
- `recoveryFiles` missing, undefined, or an empty array: handled as a normal success without throwing or emitting a leftover warning.
- Restore failure: exit result is nonzero and the original error message is printed unchanged. Tests confirm recovery inventory, existing recovery paths, safety backup context as available, and manual recovery instructions remain visible.

## Validation results

| Check | Result |
| --- | --- |
| SQLite maintenance tests (`node --test src/db/maintenance.test.js`) | **31 passed, 0 failed** |
| Full backend tests (`npm test` in `server/`) | **61 passed, 0 failed**: 49 database/auth/import/maintenance tests and 12 API tests |
| Frontend tests (`npm test` in repository root) | **49 passed, 0 failed** across 9 files |
| TypeScript (`npm run typecheck`) | **Passed**, exit 0 |
| Lint (`npm run lint`) | **Passed**, exit 0 |
| Production build | **Passed**, 2,167 modules; isolated `vite build` output in a unique temporary directory, removed after completion. Existing bundle-size warning remains: JavaScript bundle 633.97 kB (gzip 190.01 kB), above Vite's 500 kB warning threshold. |
| `git diff --check` | **Passed**, exit 0. Git printed existing LF-to-CRLF normalization notices for workspace files; no whitespace errors. |

The focused CLI tests cover normal success, one leftover, multiple leftovers, missing/empty values, and failure output. Failure injection forces candidate promotion and original restoration failures against synthetic SQLite files; no real RoadFix database is used.

## Remaining risks

- The restore safety sign-off's operational limits remain: keep restore offline and serialized. This change only improves CLI reporting; it does not alter restore concurrency or rollback behavior.
- A real competing-process Windows SQLite sidecar lock test remains outstanding as documented in the prior restore sign-off. Existing deterministic tests inject filesystem-operation failures and do not emulate an external process holding a Windows file lock.
- Build passes with the existing large-chunk warning.

## Scope confirmation

No real database was opened or modified; no migration, bootstrap, account creation, restore, seed, reset, or JSON import was run. No dependency or application code outside the listed CLI and test file was changed. Existing unstaged and untracked work was preserved. Nothing was staged, committed, or pushed.