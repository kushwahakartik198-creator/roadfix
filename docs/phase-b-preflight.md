# RoadFix Phase B — SQLite Preflight

Prepared: 2026-11-10. This is a planning document only. No dependency was installed, no database was created, and no application or package file was changed.

## 1. Actual environment and repository

- OS/runtime platform: Windows (`win32`), x64.
- Node.js: `v24.20.0`; `process.versions.modules` is `137` (Node native addon ABI).
- npm: `11.19.0`.
- Repository: React 19/Vite frontend; zero-dependency Node `http` REST server in `server/src`; JSON store at `server/data/store.json`; no SQLite module or database-related application code exists yet.
- Root package has frontend dependencies and `@supabase/supabase-js`; root lockfile is npm lockfile version 3. `server/package.json` declares zero runtime dependencies, Node `>=20`, and no server package lock was present.
- `node_modules` exists at the root; `server/node_modules` does not. Therefore local npm/Node are installed, but we did not test package download, lifecycle scripts, or native addon loading.
- Current Supabase references exist in the root package and lockfile, `src/lib/supabase.ts`, `src/lib/env.ts`, tests, `.env.example`, README, `docs/backend.md`, and `supabase/` config/migrations/tests. They are not removed during Phase B preflight or foundation work.
- Current server is not SQLite-backed: it loads the entire JSON file into memory, mutates that object, and writes it back after non-GET responses and at shutdown. It currently listens on `0.0.0.0:4000`; approved local target is loopback.
- `git status --short` before this document: `?? docs/sqlite-migration-audit.md`. That existing audit is preserved.

The Phase A audit was read in full. Key constraints carried forward: Agra pilot; six approved statuses; three severities; anonymous reports; public privacy allowlists; limited officer access with audit; report photos only, maximum three; ISO UTC timestamps; FK enforcement for every connection; WAL; and no hosted database/Supabase.

## 2. better-sqlite3 compatibility findings

### Node ABI and prebuilt binary

The running Node reports ABI `137`, and Windows architecture is `x64`. The better-sqlite3 12.x line publishes an exact Windows x64/Node 24 ABI prebuild, for example the v12.12.0 release asset named `better-sqlite3-v12.12.0-node-v137-win32-x64.tar.gz`. This matches this runtime. The official v12.12.0 release has 147 assets, and the project’s official build workflow includes Windows x64 and Node 24. The project’s compatibility troubleshooting says to use a currently supported Node version; Node 24 is in the project’s build matrix. The v12.12.0 release and build workflow are linked below. [v12.12.0 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.12.0) · [official build workflow](https://github.com/WiseLibs/better-sqlite3/blob/master/.github/workflows/build.yml)

This is strong compatibility evidence for an exact `better-sqlite3@12.12.0` pin on Windows x64 / Node 24.20.0. We did not download the archive, install the package, or load its native module, so compatibility is **not yet locally tested**. The prebuilt binary must still be fetched from the package/release source during install; network access to npm and GitHub was not tested from npm.

### npm and native build tools

- `npm 11.19.0` and a root `node_modules` directory are present. Current npm configuration for ignored scripts and registry could not be reliably read in this environment; package lifecycle behavior is therefore **not verified**.
- Python is found at `C:\Users\kushw\AppData\Local\Programs\Python\Python314\python.exe` (plus the Windows Python launcher). `cl` and `msbuild` were not found on the current `PATH`. This does not prove Visual Studio Build Tools are absent from the machine; only that those commands are not available on the current PATH.
- With a matching v12 prebuild and normal install script execution, Python/MSVC should not be needed. If npm cannot fetch/use the prebuild and falls back to `node-gyp`, a working Python and Visual Studio C++ build toolchain are needed. Python is present; Visual Studio C++ tooling is not confirmed.
- Do not choose v13 for this first installation without a focused lockfile-install check. v13 moved to bundled Node-API prebuilds, but reports against npm 11.19.0 describe `npm install`/`npm ci` invoking `node-gyp rebuild` despite the prebuild being present and `gypfile:false`. The report contains reproduction on Node 24.19.0/npm 11.17.0 and Node 26/npm 11.19.0; the upstream issue remains a relevant warning for this npm version. [Upstream issue #1503](https://github.com/WiseLibs/better-sqlite3/issues/1503)

Recommendation for install test: use exact v12.12.0, whose older install/prebuild path avoids the reported v13 npm implicit-gypfile issue, and capture full install output. Do not silently fall back to compiling. If prebuild resolution fails, stop and ask whether to install/locate Visual Studio Build Tools or reconsider the driver.

## 3. Comparison with built-in `node:sqlite`

| Area | better-sqlite3 12.12.0 | Node `node:sqlite` in 24.20.0 |
|---|---|---|
| Availability | New server dependency; matching Windows x64 ABI 137 prebuild is published. Requires npm install and a usable prebuild download. | Built into the installed Node runtime; no package/native build step. Module presence was verified in Phase A. |
| API | Synchronous; simple prepared statements and explicit `.transaction()` wrapper. | Synchronous `DatabaseSync`; prepared statements. Transactions can be issued explicitly with SQL. |
| Foreign keys | Standard SQLite pragma; explicitly set and verify `PRAGMA foreign_keys=ON` for each connection. | Enabled by default in `DatabaseSync` unless disabled, and can be explicitly enabled/verified. Still set and check it in our connection factory. |
| WAL | `db.pragma('journal_mode = WAL')`; verify returned mode. | `db.exec('PRAGMA journal_mode=WAL')`; verify returned mode. |
| Stability | Mature third-party project, MIT. Native binary/package installation is an extra moving part. | Node 24.20.0 docs classify it as Stability 1.2, Release candidate (since Node 24.15.0). No install dependency, but API may still change before stable. [Node 24.20 SQLite docs](https://nodejs.org/download/release/v24.20.0/docs/api/sqlite.html) |
| Transaction support | Built-in wrapper commits on success and rolls back thrown errors; supports nesting/savepoints. | SQLite transactions supported through explicit `BEGIN`/`COMMIT`/`ROLLBACK`; wrap carefully with `try/finally` and rollback on errors. |
| Fit here | Aligns with approved decision to evaluate this first; exact v12 prebuild exists for current OS/ABI. | Lowest install friction, but owner chose to evaluate better-sqlite3 first and RC status is a trade-off. |

Both APIs are synchronous: keep database work short and indexed; never perform network or asynchronous file work inside a transaction. For filesystem image writes, write a validated temp file before transaction, commit metadata transaction, then rename/compensate safely (or use a carefully documented staging design); do not hold a SQL transaction open while awaiting I/O.

## 4. Recommended driver

Recommend **pin `better-sqlite3@12.12.0` exactly in `server/package.json`**, then validate install and runtime on this machine before implementing against it. It has a known matching `node-v137-win32-x64` prebuild, synchronous prepared statements, concise transaction wrappers, explicit WAL support and MIT license. This follows the owner’s approved request to evaluate it first.

Trade-offs: a native dependency adds install/network/ABI concerns and increases package management work. Pinning v12 avoids the reported npm 11 v13 install-script issue, but means updates need deliberate compatibility review. The prebuild install path and runtime have not yet been exercised locally. `node:sqlite` remains a fallback if installing the matching prebuild fails or the owner prefers zero added packages; its Node 24 API is release candidate.

## 5. Proposed SQLite architecture and connection lifecycle

- Database path is resolved from server module location, not current working directory: `<repo>/server/data/roadfix.sqlite`. It must not depend on where PowerShell launched the process.
- Add a small server database module, proposed `server/src/db/connection.js`, that creates the data directory if necessary, opens one process-owned connection, applies and verifies connection pragmas, and returns it to the server.
- One connection for the current single-process HTTP server is sufficient. Do not open/close around every query. Close once on graceful shutdown after stopping request acceptance and finishing in-flight requests; on close failure log a safe diagnostic. Do not call `process.exit()` before close callback completes.
- On each connection, execute/verify `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL`, and a bounded `busy_timeout` (recommend 5000 ms initially). Check returned values and fail startup if critical PRAGMAs did not take effect. Configure defensive options where supported. Do not expose database paths or SQL details in API errors.
- `WAL` creates `roadfix.sqlite-wal` and `roadfix.sqlite-shm` alongside the DB while active. These are SQLite-managed files. Do not delete them manually. Use SQLite's online backup API or stop the server and copy the database as a consistent backup; document restore with the server stopped.
- Server binds to `127.0.0.1` by default for local development. Production must explicitly configure host/origins, HTTPS termination and a protected persistent data directory. SQLite remains a local file; no cloud DB service is introduced.

## 6. Exact schema and migration plan

Use numbered immutable migrations under `server/migrations/`, for example:

1. `001_core.sql`: `schema_migrations`, `users`, `sessions`, `wards`, `officers`, `complaints`, private reporter data, report image metadata, status history, admin audit log, and constraints.
2. `002_indexes.sql`: query indexes and unique report-image slot index.

Migration runner at `server/src/db/migrate.js` reads only known ordered `.sql` files. It opens one DB connection, enables/verifies FKs, starts a transaction per migration, executes SQL, inserts `(version,name,applied_at)` in the same transaction, and commits. On failure, roll back that migration, preserve prior applied migrations, print the migration ID plus safe error context, and exit nonzero. Never mark a failed migration applied, edit an applied migration, or auto-reset a DB. For future schema changes, add a new migration.

Proposed exact core schema. Text timestamps are UTC ISO 8601 strings produced by one server helper (`new Date().toISOString()`); IDs are opaque UUIDs generated by `crypto.randomUUID()`. Statuses/severity are the approved six/three values. The schema deliberately has no repair-evidence image kind. Private reporter fields are separate from normal complaint reads so API serializers can deny access by default. Anonymous reports have `reporter_id=NULL`; private contact is optional.

```sql
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(email)) BETWEEN 3 AND 254),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('citizen','officer','admin')),
  display_name TEXT CHECK(display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  csrf_token_hash TEXT NOT NULL CHECK(length(csrf_token_hash)=64),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE wards (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK(length(trim(code)) BETWEEN 1 AND 16),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  description TEXT CHECK(description IS NULL OR length(description)<=500),
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  ward_number TEXT NOT NULL CHECK(length(trim(ward_number)) BETWEEN 1 AND 20),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE officers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  ward_id TEXT REFERENCES wards(id) ON DELETE SET NULL,
  phone TEXT CHECK(phone IS NULL OR length(phone)<=32),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE complaints (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE
    CHECK(length(reference)=14 AND substr(reference,1,6)='RF-AG-'
      AND substr(reference,7,8) NOT GLOB '*[^0123456789ABCDEFGHJKMNPQRSTVWXYZ]*'),
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 1000),
  category TEXT NOT NULL CHECK(category IN ('pothole','waterlogging','open_manhole','streetlight','garbage','erosion','water_pipe_leak','damaged_sign','other')),
  status TEXT NOT NULL CHECK(status IN ('submitted','under_review','verified','in_progress','resolved','rejected')),
  severity TEXT CHECK(severity IS NULL OR severity IN ('low','medium','high')),
  ward_id TEXT NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
  location_description TEXT CHECK(location_description IS NULL OR length(location_description)<=150),
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  assigned_officer_id TEXT REFERENCES officers(user_id) ON DELETE SET NULL,
  assigned_at TEXT,
  rejection_reason TEXT CHECK(rejection_reason IS NULL OR length(rejection_reason)<=1000),
  resolution_note TEXT CHECK(resolution_note IS NULL OR length(resolution_note)<=1000),
  resolved_at TEXT,
  status_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status <> 'resolved' OR (resolution_note IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK(status <> 'rejected' OR rejection_reason IS NOT NULL)
);

CREATE TABLE complaint_private (
  complaint_id TEXT PRIMARY KEY REFERENCES complaints(id) ON DELETE CASCADE,
  reporter_name TEXT CHECK(reporter_name IS NULL OR length(trim(reporter_name)) BETWEEN 1 AND 120),
  reporter_contact TEXT CHECK(reporter_contact IS NULL OR length(trim(reporter_contact)) BETWEEN 1 AND 254),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE complaint_images (
  id TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  created_at TEXT NOT NULL,
  UNIQUE(complaint_id,slot)
);

CREATE TABLE complaint_status_history (
  id INTEGER PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','status_change','assignment','reopened','note')),
  from_status TEXT CHECK(from_status IS NULL OR from_status IN ('submitted','under_review','verified','in_progress','resolved','rejected')),
  to_status TEXT CHECK(to_status IS NULL OR to_status IN ('submitted','under_review','verified','in_progress','resolved','rejected')),
  assignee_id TEXT REFERENCES officers(user_id) ON DELETE SET NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('citizen','officer','admin')),
  note TEXT CHECK(note IS NULL OR length(note)<=1000),
  created_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(length(trim(action)) BETWEEN 3 AND 100),
  target_complaint_id TEXT REFERENCES complaints(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX sessions_user_expiry_idx ON sessions(user_id,expires_at);
CREATE INDEX complaints_ward_status_created_idx ON complaints(ward_id,status,created_at DESC);
CREATE INDEX complaints_status_created_idx ON complaints(status,created_at DESC);
CREATE INDEX complaints_assigned_status_idx ON complaints(assigned_officer_id,status) WHERE assigned_officer_id IS NOT NULL;
CREATE INDEX complaints_reporter_created_idx ON complaints(reporter_id,created_at DESC);
CREATE INDEX complaint_private_access_idx ON complaint_private(complaint_id);
CREATE INDEX complaint_images_complaint_idx ON complaint_images(complaint_id);
CREATE INDEX complaint_history_complaint_created_idx ON complaint_status_history(complaint_id,created_at);
CREATE INDEX audit_log_admin_created_idx ON audit_log(admin_id,created_at DESC);
```

`complaint_private` exists to isolate name/contact fields. Every access to it must go through an authorization-aware service function; officer access must check assignment/ward scope and add an `audit_log` row in the same DB transaction. Public serializers must never select it. Admin access is also audited. The FK from `complaints.reporter_id` is nullable `ON DELETE SET NULL`; deleting a user never deletes a complaint. Ward deletion is RESTRICT while complaints refer to it; assigned officer deletion sets assignment null; history and complaint image references use RESTRICT so evidence/history cannot disappear with a complaint. Session rows cascade with user deletion. Private per-complaint contact data can cascade with deletion of a complaint, but complaints are not physically deleted through normal APIs.

Indexes cover session expiry, common ward/status/date issue listings, status/date filters, assigned officer queues, reporter-owned history, image lookup, complaint history ordering, and admin audit history. Unique reference and image slot constraints are enforced by schema. Business transition rules remain in a service function: only listed forward transitions; only admin may reopen `resolved` or `rejected`; assignment remains a separate field. Every status/assignment mutation and matching history append happens in one synchronous transaction.

The `reference` CHECK validates exact prefix, length and allowed suffix alphabet; application generation uses `crypto.randomInt` over `0123456789ABCDEFGHJKMNPQRSTVWXYZ` for eight suffix characters, with a bounded collision retry on `SQLITE_CONSTRAINT_UNIQUE`. The reference is not an identity/authentication secret. IDs use `crypto.randomUUID()`.

## 7. Data import and privacy strategy

- Never automatically import on server startup. Provide a separate import CLI with `--dry-run` first, a summary by collection, validation errors and counts of records withheld by reason. Require an explicit `--apply` command after reviewing the report.
- Before any apply/import, make a timestamped byte-for-byte backup of `server/data/store.json`; preserve the original and backup permanently unless a separate owner-approved retention policy says otherwise. Never use the JSON importer to replace or rewrite the source.
- Existing names and contact data are classified as personal until confirmed synthetic. Exclude those fields from all import by default. Also do not import officer identities/contact rows until classified and accounts are created through an approved admin provisioning path. Do not create password-bearing user accounts from legacy officer records.
- Import only reviewed, allowlisted fields. For complaint rows, require a check of free-text descriptions, titles and location descriptions for personal details before inclusion; otherwise withhold the complete row for owner review. Public ward metadata may be importable after field validation. For rows approved for import, set `reporter_id=NULL`, store no private contact unless specifically approved, map `reported→submitted`, preserve `verified/in_progress/resolved/rejected`, and flag legacy history/transition ambiguities for review. There is no legacy `under_review` state to invent.
- Import wards before complaints, then approved complaint rows, images metadata only if image files are independently validated, and history last. Since legacy files have no enforced FK, validate all references and report orphan rows. Use one DB transaction for the import data set and an `import_runs` ledger/source hash (or equivalent migration metadata) so repeat attempts are detectable and cannot duplicate rows. On any error, roll back the DB import and preserve source/backup.
- Use the audit log only for actual access events, not to duplicate PII. Do not copy `server/data/uploads` blindly; inventory and privacy review it separately in the later image phase.

## 8. Backup, recovery and rollback

- Before first migration/import, ensure the DB path is unused; never overwrite any pre-existing `server/data/roadfix.sqlite`. If one already exists, stop and ask for owner review. This preflight did not find or create a DB.
- Back up the JSON file before import. Keep an untouched copy outside operational writes and document its path/hash in the import report (avoid printing its personal values).
- Create SQLite backups using `better-sqlite3` backup API (online backup) or stop the server and copy DB after checkpoint/close. Never copy just the main file while WAL is active; that can omit committed changes still in `-wal`.
- Restore only with the server stopped: retain a copy of the failed DB and its WAL files for diagnosis; restore a verified backup using a temporary destination then an atomic rename on the same volume. Verify migration version, integrity check, FK check and expected row counts before reopening service.
- Roll back a code release by stopping server and restoring the previous reviewed application version. Do not downgrade schema automatically or delete data. If a migration has committed, add a forward repair migration; do not edit applied migration files. JSON remains preserved as the independent recovery source.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Native prebuild download blocked or install lifecycle behaves differently under npm 11 | Pin v12.12.0, capture install output, verify module load and ABI; stop on compile fallback; ask before toolchain installation. |
| Node ABI or architecture mismatch | Confirm `process.versions.modules`, platform and arch at startup diagnostics; test clean install on target Windows x64. |
| Blocking synchronous DB work | Keep transactions short, prepare/reuse statements, use indexes, avoid async work in transaction, watch lock timeout errors. |
| WAL files mishandled | Use SQLite backup API or stopped-server backup; never delete sidecar files manually. |
| Sensitive legacy records enter DB | Dry-run and allowlist fields; classify names/contact/text; no import by default for unclassified content. |
| Partial mutation/history mismatch | Wrap complaint, status history and audit insert in same transaction; throw to force rollback. |
| Migration incompatible with approved lifecycle | Schema CHECK permits only six approved statuses and three severity values; map `reported→submitted`; admin-only reopen stays service-enforced. |
| Confusion between DB foundation and API/auth work | Phase B creates schema and DB module only; do not change frontend or perform Phase C/D endpoint/auth migration. |

## 10. Commands planned for implementation (not run)

After owner approval to install and implement, proposed PowerShell commands (run sequentially and inspect each result):

1. Confirm baseline again: `git status --short`, `node --version`, `npm --version`, and `node -p "process.platform + ' ' + process.arch + ' ABI=' + process.versions.modules"`.
2. Install exact server dependency: `npm install --prefix server --save-exact better-sqlite3@12.12.0`. Stop if the log falls back to `node-gyp` or asks for unavailable build tools. Inspect the resulting `server/package.json` and `server/package-lock.json` diff before any further work.
3. Native binding smoke test using only an in-memory DB: `node -e "const Database=require('./server/node_modules/better-sqlite3'); const db=new Database(':memory:'); console.log(db.prepare('select sqlite_version() as version').get()); db.close();"`.
4. Implement migration/schema module; initial schema check uses only `:memory:` or a temporary test DB path outside `server/data/roadfix.sqlite` until verified.
5. Once safe, initialize the persistent DB explicitly with a documented command (not server startup), verify pragmas/migration ledger, then add tests for migration idempotency, rollback, FK checks, constraints, reference uniqueness and WAL.
6. Planned project checks after implementation: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run format`. Record exact exit codes; do not claim results unless run successfully.

No command above was executed except read-only environment and repository inspection. In particular, no install, package change, database creation or application edit has occurred.

## 11. Approval required before installation or implementation

The ten product/security choices are recorded as approved in the user’s Phase B instruction. Separate approval is still required before the next write actions:

1. **Dependency installation:** approve adding the exact `better-sqlite3@12.12.0` dependency and creating/updating `server/package-lock.json` with npm. Installation may access npm/GitHub and runs package lifecycle scripts. If the prebuilt is unavailable, do not proceed to compile or install Build Tools without asking.
2. **Phase B implementation:** approve creation of the planned database module, migration SQL/runner, safe initialization/backup documentation, and tests. No persistent `server/data/roadfix.sqlite` should be created until the schema/module review is complete and you explicitly approve database initialization.
3. **Import:** not part of preflight or automatic Phase B startup. Require a separate reviewed dry-run and explicit owner approval before importing any records, because existing names, contacts and free text have not been confirmed synthetic.

### References

- [better-sqlite3 v12.12.0 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.12.0)
- [better-sqlite3 official build workflow](https://github.com/WiseLibs/better-sqlite3/blob/master/.github/workflows/build.yml)
- [better-sqlite3 API documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [better-sqlite3 v13/npm install issue #1503](https://github.com/WiseLibs/better-sqlite3/issues/1503)
- [Node.js 24.20.0 SQLite documentation](https://nodejs.org/download/release/v24.20.0/docs/api/sqlite.html)
