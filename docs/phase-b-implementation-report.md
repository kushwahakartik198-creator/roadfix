# RoadFix Phase B2 — SQLite Database Foundation

Date: 2026-11-10

## 1. Database architecture implemented

- Added a single-connection factory in `server/src/db/database.js`. Its default path is resolved from the module location to `server/data/roadfix.sqlite`, independent of the process working directory. It creates the containing directory if needed.
- The database opens only when a caller explicitly calls `openDatabase()` or invokes the import CLI with `--apply`. The server entry point and API routes were not changed, and no production database was created.
- Each opened connection verifies the RoadFix SQLite `application_id`, enables and checks `foreign_keys=ON`, sets a 5-second busy timeout, enables and verifies WAL, then applies migrations. A non-RoadFix SQLite file with existing tables is rejected before persistent pragmas are changed.
- The returned connection is owned by its caller and must be closed by that caller. Database and migration errors are thrown with migration context; nothing is silently swallowed. API routes are not connected to this module, so public error serialization remains Phase C work.
- Prepared statements are used for data import and reference lookups. Migration application and all import writes use immediate transactions. Transactions are synchronous and intended to remain short.

## 2. Exact schema and constraints

The authoritative SQL is in [`001_core.sql`](../server/src/db/migrations/001_core.sql) and [`002_indexes.sql`](../server/src/db/migrations/002_indexes.sql). `database.js` creates the migration ledger before applying the first SQL migration.

| Table                      | Columns and rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_migrations`        | `version` primary key, `name`, SHA-256 `checksum`, ISO UTC `applied_at`; detects changed/missing migration files.                                                                                                                                                                                                                                                                                                                                                                                        |
| `users`                    | `id` primary key; optional unique case-insensitive `email`; role constrained to `citizen/officer/admin`; optional display name; created/updated UTC timestamps. No credentials or sessions are introduced in B2; auth remains Phase D.                                                                                                                                                                                                                                                                   |
| `wards`                    | `id` primary key; unique bounded `code`; bounded `name`, optional description; latitude/longitude range checks; ward number; boolean active check; created timestamp.                                                                                                                                                                                                                                                                                                                                    |
| `officers`                 | `id` primary key; optional unique `user_id` FK to users (`SET NULL`); optional ward FK (`SET NULL`); optional display name/phone; boolean active and timestamp. Legacy officers are not imported while their names/contact fields are unclassified.                                                                                                                                                                                                                                                      |
| `complaints`               | `id` primary key; unique `RF-AG-XXXXXXXX` reference constrained to the Crockford alphabet; nullable reporter FK to users (`SET NULL`); bounded title/description/location; category enum; the six approved statuses; severity `low/medium/high`; ward FK (`RESTRICT`); coordinate range checks; optional officer assignment FK (`SET NULL`); assignment, rejection, resolution and ISO UTC timestamps/notes. Resolved records require resolution note/time; rejected records require a rejection reason. |
| `complaint_private`        | One row per complaint; separate optional reporter name/contact fields; complaint FK cascades only this private row on complaint deletion. No legacy contact data is imported. Access control is not implemented in routes during B2.                                                                                                                                                                                                                                                                     |
| `complaint_images`         | Metadata only: ID, complaint FK (`RESTRICT`), slot 1–3, unique storage path, JPEG/PNG/WebP MIME, size 1–5 MiB, timestamp; unique `(complaint_id, slot)` enforces the three report-photo cap. No repair-evidence kind or image blob column exists.                                                                                                                                                                                                                                                        |
| `complaint_status_history` | ID, complaint FK (`RESTRICT`), event type, nullable from/to status constrained to the approved lifecycle, nullable assignee/actor FKs (`SET NULL`), constrained actor role, optional bounded note and timestamp. Mutations must append history in the same transaction in Phase C.                                                                                                                                                                                                                       |
| `admin_audit_log`          | Actor FK (`SET NULL`), actor role `officer/admin/system`, bounded action, nullable target complaint/user FKs (`SET NULL`), timestamp. This supports later logging of admin actions and authorized reporter-contact reads; no access route is enabled yet.                                                                                                                                                                                                                                                |

Indexes cover user role/date, officer ward/active, complaint ward/status/date, status/date, assigned officer/status, reporter/date, complaint images, complaint history order and audit actor/complaint history. The exact SQL includes coordinate ranges, lengths, enums, unique keys, image slots and deliberate delete behavior. Physical complaint deletion is otherwise constrained by image/history references; reporter deletion never deletes a complaint.

## 3. Migration system

- Versioned SQL files live in `server/src/db/migrations/` and are sorted by zero-padded version: `001_core.sql`, then `002_indexes.sql`.
- The runner records version, filename, checksum and applied time. Each migration and its ledger row commit together with `BEGIN IMMEDIATE` semantics through better-sqlite3’s transaction wrapper.
- Reruns skip unchanged applied migrations. Changed checksums, unknown applied versions, duplicate/invalid filenames and SQL failures stop with a clear error. Failed migration work rolls back; prior migrations and data remain. Migration SQL uses `IF NOT EXISTS` and no reset/drop commands.
- `server/package.json` now has `test:db` for the database test files. No API route imports the database module yet.

## 4. Reference generation

`server/src/db/references.js` uses `node:crypto` `randomInt()` to choose eight characters from `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. It exports the format regex, a one-reference generator and a bounded lookup helper (`generateUniqueReference`, five attempts by default). The database also enforces reference uniqueness and format. Phase C must catch a unique constraint race on insert and retry within a bounded transaction policy; checking first alone cannot prevent concurrent collisions.

## 5. JSON import behavior

`server/src/db/import-json.js` is a separate CLI; it is never invoked by server startup:

```powershell
node server/src/db/import-json.js --dry-run
node server/src/db/import-json.js --apply
```

Dry-run is the default and does not open/create a database or write a backup. `--apply` makes an exclusive timestamped backup of the source JSON first, then migrates/opens the selected database and writes the planned rows in one transaction. `--source` and `--db` allow explicit source/database paths. Repeat runs detect identical existing rows and skip them; conflicting rows abort and roll back the entire data batch. The source JSON is never edited or deleted.

The real-source dry-run was executed, **not applied**:

- Source counts: 8 wards, 6 officers, 10 complaints, 6 history rows.
- Planned: 8 wards, 4 complaints, 0 history rows.
- Withheld: all 6 officer records; 6 complaint records; all 6 history records.
- Reasons: officer names/contact are unclassified personal data; five complaint references do not match the approved alphabet; one complaint uses the unapproved `critical` severity; history either belongs to a withheld complaint or records a transition outside the approved lifecycle.
- Legacy `reported` maps to `submitted`; other approved statuses are retained. No history is invented. Reporter names/contact, officer IDs/assignment links, actor IDs, history notes and legacy photo paths are not copied. Free text matching likely phone/email patterns causes a complaint to be withheld for review. Legacy wards without a valid creation timestamp receive the current UTC import time, reported as a dry-run warning.
- The summary identifies withheld record IDs/references and reasons but does not print personal names, emails or phone values. The source hash is included for repeatability.

This dry-run shows the current JSON is not ready for a lossless import. Review withheld rows and approve a separate production import before running `--apply`. The importer does not inventory or copy upload files.

## 6. Personal-data handling

- Reporter name/contact fields are absent from import mappings; the `complaint_private` table is reserved for future authorized storage.
- Legacy officer records are all withheld until names and contact information are classified. Therefore legacy complaint assignments and history actors become null if an approved complaint is later imported.
- History notes and actor IDs are omitted. Free-text complaint fields are checked for likely phone/email strings; this is a safety heuristic, not a complete PII detector.
- No existing names/contact values were printed, imported or altered. `server/data/store.json` remains unchanged.

## 7. Tests and exact results

Command: `npm.cmd run test:db --prefix server` — **exit code 0**, 13 tests passed, 0 failed. Coverage includes:

- Database initialization, schema creation, application marker, migration tracking/rerun and rollback on a failed migration.
- Refusal to modify a foreign SQLite file; foreign keys enabled on each connection; WAL mode.
- Status/severity/coordinate/reference constraints; transaction rollback; secure reference format and collision retry.
- JSON dry-run mapping/privacy/unmappable records; transactional import, repeat-run duplicate handling and batch rollback on conflict; exclusive backup behavior.
- Data persistence after close/reopen.

Other checks:

- `npm.cmd run lint` — exit 0.
- `npm.cmd run typecheck` — exit 0.
- `node server/src/db/import-json.js --dry-run` — exit 0; summary above.
- Scoped Prettier check on the new JavaScript files and `server/package.json` — exit 0.
- `npm.cmd run format` — exit 1 because Prettier reports 28 files across the existing repository as unformatted, including unrelated pre-existing files. New JavaScript files and `server/package.json` were formatted; unrelated files were not changed.
- `server/data/roadfix.sqlite` — confirmed absent after tests and dry-run. Test databases were under unique `.roadfix-*` directories inside `server/`, outside `server/data/`, and test cleanup removed those directories.

No full frontend test or build was run; Phase B2 tests are database-specific and API/frontend code was left untouched.

## 8. Files created and modified

Created:

- `server/src/db/database.js`
- `server/src/db/references.js`
- `server/src/db/import-json.js`
- `server/src/db/migrations/001_core.sql`
- `server/src/db/migrations/002_indexes.sql`
- `server/src/db/database.test.js`
- `server/src/db/import-json.test.js`
- `docs/phase-b-implementation-report.md` (this report)

Modified during B2:

- `server/package.json` — added `test:db`; the exact better-sqlite3 dependency was already added in the authorized B1 installation test.

`server/package-lock.json` remains the B1 installation lockfile and was not edited during B2. The Phase A audit, preflight and driver-test reports remain preserved and unmodified during B2. No route, frontend, Supabase, JSON store, upload, or production DB file was changed.

## 9. Remaining risks

- The existing HTTP server still reads/writes JSON and still binds all interfaces. Route migration, loopback default, auth, authorization, privacy serializers and generic public errors remain future work.
- The B2 schema is not used by the REST API yet. No production DB file exists.
- Existing source data has invalid references, an unapproved severity and incompatible history; importing as-is would withhold over half the complaints and all history. Human review is required.
- Contact detection in free text is heuristic and can miss personal information. Review source fields before an import; do not treat the dry-run as privacy certification.
- `better-sqlite3` is synchronous and can block the event loop during slow queries/long transactions. Keep operations short and indexes aligned with queries.
- npm previously warned that `prebuild-install` is deprecated and the package install script was not covered by npm's `allowScripts` approval list. The native module passed B1 tests, but future clean installs should be checked.
- The schema allows future user/officer display names and private contacts; Phase D/C must implement backend authorization before those values are exposed. The database alone does not provide row-level authorization.

## 10. Instructions for Phase C

After separate owner approval, Phase C can add repositories and convert API routes to this database layer. Before doing so:

1. Review the 8/4/0 dry-run counts and decide how to handle five invalid references, one `critical` severity and six historical events; do not silently regenerate references or invent statuses.
2. Obtain approval for a fresh dry-run and explicit production `--apply`; ensure a JSON backup is made first. Never import unclassified names/contacts.
3. Implement complaint creation, reference collision retry, status/assignment/history writes in short transactions. Enforce forward lifecycle transitions in service logic and preserve history.
4. Keep public tracking and ward projections allowlisted; do not return reporter contacts or rejection reasons. Require authorized officer scope and record reporter-contact reads in the audit log.
5. Keep uploads out of the DB; Phase C can store metadata only after file validation/storage policy is separately implemented.
6. Connect the server to `openDatabase()` only after review. Server startup will initialize the default `server/data/roadfix.sqlite`; this was intentionally not done in B2.

Do not perform authentication, frontend, Supabase cleanup or image-serving work as part of Phase C unless separately authorized; those are later phases.

## 11. Final Git status

Initial `git status --short` before B2 work:

```text
 M server/package.json
?? docs/phase-b-driver-test.md
?? docs/phase-b-preflight.md
?? docs/sqlite-migration-audit.md
?? server/package-lock.json
```

Final `git status --short` after B2 work:

```text
 M server/package.json
?? docs/frontend-audit-report.md
?? docs/phase-b-driver-test.md
?? docs/phase-b-implementation-report.md
?? docs/phase-b-preflight.md
?? docs/sqlite-migration-audit.md
?? server/package-lock.json
?? server/src/db/
```

`docs/frontend-audit-report.md` was not in the initial status and appeared during this task; it was not created or modified as part of B2. No files were staged, committed or pushed.
