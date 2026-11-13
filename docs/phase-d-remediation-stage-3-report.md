# RoadFix — Phase D Remediation Stage 3 Report

## Scope and result

Implemented L-3 session-expiry recovery and L-4 SQLite backup, restore, and integrity commands. No dependency or lockfile changes were made. Testing used synthetic data in temporary SQLite files under `server/`; no production database or account was used. The production database path `server/data/roadfix.sqlite` remains absent.

## L-3 — Session expiration and frontend recovery

The API client now identifies requests that require a staff session. A `401` from those endpoints notifies the mounted `AuthProvider`, which clears the stale user and CSRF token, records the expired-session state, and lets the protected route redirect to `/login`. Other statuses, including `403` and `500`, and fetch/network errors do not clear authenticated state. Public tracking, public issue reads, anonymous submissions, login, and logout do not trigger the expiry handler.

The login page displays “Your session expired. Sign in again to continue.” and keeps the protected destination, including its query and fragment. It accepts only same-origin, root-relative destinations; unsafe destinations fall back to the role’s dashboard. After login, the user returns to the saved destination. The authenticated guard removes the protected page from the render tree, so a late request failure cannot produce a redirect loop. Existing Stage 2 logout semantics remain intact.

Coverage added: mounted officer page with protected `401`, login redirect and message, saved return path and successful return, no repeated bootstrap/redirect loop, network failure and `500` preserve the signed-in page, unsafe return URL rejected, and public tracking plus anonymous submission leave expiry handling untouched.

## L-4 — SQLite backup, restore, and integrity

Added `server/src/db/maintenance.js` using the installed `better-sqlite3` online `backup()` API. Backup reads a consistent SQLite snapshot, verifies the closed snapshot with `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, then copies it to a timestamped destination using exclusive-create semantics. An existing destination is never overwritten. The default backup directory is `server/data/backups`.

Restore requires an explicit backup path. It validates the source before interacting with the destination. An existing target is refused unless `--confirm-overwrite` is supplied. For a confirmed replacement, the workflow checkpoints WAL, creates and verifies an online safety backup, stages and revalidates the restore file beside the target, then swaps files. It preserves existing WAL/SHM sidecars with the displaced database and restores them if the replacement verification fails. The restored database is integrity-checked before success is reported. Startup does not invoke restore or maintenance commands.

The integrity command checks that the file is a RoadFix database, has migration metadata, passes SQLite integrity checking, and has no foreign-key violations. No migration is run by maintenance commands.

### Command examples

Run from the `server` directory. Back up the configured RoadFix database to the default backup folder:

```powershell
npm run db:backup
```

Choose explicit source and backup paths:

```powershell
npm run db:backup -- --database "C:\RoadFix\server\data\roadfix.sqlite" --directory "C:\RoadFix\server\data\backups"
```

Check an existing database or backup:

```powershell
npm run db:integrity -- "C:\RoadFix\server\data\backups\roadfix-20261111T120000Z.sqlite"
```

Restore into a new destination (no overwrite confirmation needed):

```powershell
npm run db:restore -- "C:\RoadFix\server\data\backups\roadfix-20261111T120000Z.sqlite" --database "C:\RoadFix\server\data\roadfix-recovered.sqlite"
```

Replace an existing database only after stopping every RoadFix server process and reviewing the selected backup:

```powershell
npm run db:restore -- "C:\RoadFix\server\data\backups\roadfix-20261111T120000Z.sqlite" --database "C:\RoadFix\server\data\roadfix.sqlite" --confirm-overwrite
```

When replacing an existing database, the command prints the safety-backup path. Keep that file until the restored application has been checked. Do not run restore while the application is using the target. Keep database and backup directories on protected persistent storage with enough free space for the staged restore and safety backup.

## Files changed for Stage 3

- `src/lib/api.ts`
- `src/features/auth/AuthContext.tsx`
- `src/features/auth/auth-context.ts`
- `src/features/auth/RequireAuth.tsx`
- `src/pages/LoginPage.tsx`
- `src/test/phase-d-frontend.test.tsx` (mock updated for the session-expiry callback)
- `src/test/session-expiry.test.tsx` (new)
- `server/package.json` (maintenance command and database test scripts only; existing manifest changes preserved)
- `server/src/db/maintenance.js` (new)
- `server/src/db/maintenance-cli.js` (new)
- `server/src/db/maintenance.test.js` (new)
- `docs/phase-d-remediation-stage-3-report.md` (this report)

No files were staged, committed, or pushed. No package installation or unrelated dependency change occurred. Existing workspace changes and untracked audit/report files were preserved.

## Verification results

| Command | Result |
| --- | --- |
| `npm.cmd test --prefix server` | Exit 0; database/auth/import/maintenance: 25 passed, 0 failed; API: 12 passed, 0 failed (37 total) |
| `npm.cmd test -- --reporter=dot` | Exit 0; 9 test files passed; 49 tests passed, 0 failed |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run build` | Exit 0 |
| `git diff --check` | Exit 0; no whitespace errors |

The production build emitted the existing warning that the minified JavaScript bundle is larger than 500 kB. Frontend tests printed the existing missing-Supabase-environment diagnostic and React `act(...)` warnings; the tests passed. Git also printed existing LF-to-CRLF normalization warnings during diff checking.

## Remaining risks

- Restore is an offline operational procedure. Stop every RoadFix process first; SQLite checkpoint and filesystem replacement checks are additional safeguards, not a substitute for stopping the application. The command refuses orphaned WAL/SHM sidecars rather than guessing whether they contain recoverable changes.
- A power loss or filesystem failure at the instant of file replacement can require manual recovery. Keep the printed safety backup and verify it before starting RoadFix again.
- Backups are not encrypted or automatically pruned. Filesystem access controls, off-machine copies, retention, and periodic restore drills remain operator responsibilities.
- The command does not automatically migrate or import data during restore. Normal server startup will run the existing migration runner after a restored database is selected.

## Data and workspace confirmation

Only temporary synthetic SQLite databases were used for backup, restore, collision, integrity, and failure tests; test directories were removed after execution. No production database was created, opened, backed up, restored, or modified. No production data, JSON import, or account bootstrap was used. Supabase files and dependencies were not removed. No changes were staged, committed, or pushed.
