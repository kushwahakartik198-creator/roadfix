# RoadFix SQLite Migration — Phase A Repository Audit

Audit date: 2026-11-10. Scope: read-only repository inspection plus this report. No migration or application code changes were made.

## 1. Current architecture

As implemented: React 19/Vite frontend calls a handwritten Node `http` REST server (`server/src/index.js`), which loads `server/data/store.json` into an in-memory `Store`, and rewrites the JSON snapshot after non-GET responses and on shutdown. Server binds `0.0.0.0:4000` by default. This differs from the intended React → Node REST API → local SQLite architecture. There is no server `package-lock`; server runtime declares zero dependencies. Root dependencies still include `@supabase/supabase-js`.

| Method | Path | Auth today | Request fields/query | Response fields | Frontend caller |
|---|---|---|---|---|---|
| GET | `/api/health` | none | — | `ok, service, port` | none found |
| GET | `/api/wards` | none | `q, active` | full ward rows, count | Report, Officer, Ward Explorer |
| GET | `/api/wards/:id` | none | — | full ward row | Ward Detail |
| GET | `/api/wards/:id/issues` | none | `status, severity, page, pageSize` | complete issue records and pagination | Ward Detail |
| POST | `/api/wards` | spoofable `X-Officer-Id`; any existing officer ID accepted | `name, code, description, lat, lng` | full ward | no caller found |
| GET | `/api/issues` | none | `wardId,status,severity,category,assignedOfficerId,q,page,pageSize,sort,dir` | complete issue records and pagination | Officer |
| GET | `/api/issues/:id` | none | — | complete issue record | no direct page caller found |
| GET | `/api/issues/:ref/track` | none | reference in path | complete issue record | Track |
| GET | `/api/issues/:id/history` | none | — | complete history including notes and actor IDs | Track |
| POST | `/api/issues` | none | JSON report fields `wardId,category,description,lat,lng`; optional `severity,title,locationDescription,reporterName,reporterContact,photo` | complete issue record | Report |
| PATCH | `/api/issues/:id` | spoofable `X-Officer-Id` | `status,severity,note` | complete issue record | Officer |
| POST | `/api/issues/:id/assign` | spoofable `X-Officer-Id`; role checked against data row | `officerId` | complete issue record | Officer |
| GET | `/api/officers` | none | `q,wardId,active` | full officer rows including email and phone | Officer |
| GET | `/api/officers/:id` | none | — | full officer row including email and phone | no direct page caller found |
| GET | `/api/stats` | none | — | total, status/severity counts, ward counts | Home data? Ward Explorer |
| GET | `/uploads/:filename` | none | filename path segment | raw image bytes | Browser via image URL; public |

All successful API responses use `{ok:true,data:...}` except paginated issue endpoints which additionally spread pagination fields. Error responses are `{ok:false,error}`. `server/src/index.js` includes request method/path in 404s and returns caught exception messages as 500 content. CORS is `*`.

## 2. Current data model

`server/data/store.json` has 8 wards, 6 officers, 10 issues and 6 history rows. Field names below come from the first object in each collection; values are intentionally omitted. Issues in the JSON file omit `reporterId` despite it being present on newly created reports.

- Ward: `id, code, name, description, lat, lng, active, wardNumber`. Ward IDs are random `Math.random`-derived strings. Ward code is checked for duplicate exact-uppercase value only in route logic.
- Officer: `id, name, email, phone, role, wardId, active, createdAt`. IDs are seeded/random strings. Role examples/logic include `senior_engineer`; there is no password or actual account/session relationship.
- Issue: `id, reference, title, description, category, status, severity, wardId, locationDescription, lat, lng, reporterName, reporterContact, assignedOfficerId, rejectionReason, resolutionNote, resolvedAt, photoUrl, createdAt, updatedAt`. Newly created rows also have `reporterId, assignedAt`. IDs use non-cryptographic `Math.random`. Reference uses `RF-AG-` plus 8 random picks from the Crockford-like 32-symbol alphabet, also `Math.random`; there is no collision retry or uniqueness check.
- History: `id, issueId, eventType, fromStatus, toStatus, actorId, actorRole, note, createdAt`. History IDs use `Math.random`; rows point to issue ID by convention, with no enforced relationship. Mutations append history for create/status/note/assignment; history endpoint sorts newest first.
- Photo: issue `photoUrl` string points at a file. No separate metadata entity in JSON. Upload filenames are generated but based on weak random IDs.

Wards relate to issues by `wardId`; issues relate to officers by `assignedOfficerId`; issue history refers to issue via `issueId`, and optionally actor by ID. No relation is enforced by the JSON store. Timestamps are ISO UTC strings.

## 3. Findings

Severity: Critical (unauthenticated access/control or broad sensitive disclosure), High (major security/data integrity issue), Medium (meaningful correctness/hardening issue), Low (maintenance/operability).

| Severity | Evidence | Finding and proposed fix |
|---|---|---|
| Critical | `server/src/routes/issues.js:25-62, 73-90`; `server/src/store.js:62-107` | Public issue list, detail, tracking, ward listing return full issue rows: reporter name/contact, exact lat/lng, descriptions, rejection/resolution internals and photo URL. Replace all public projections with field allowlists; tracking contract in §8. Restrict full views to backend-authorized roles. |
| Critical | `server/src/routes/officers.js:9-36` | Public officer listing/detail returns email and phone. Public projection should be limited to non-sensitive directory fields or remove public access; authenticated admin manages private contacts. |
| Critical | `server/src/routes/issues.js:188-207, 288-...`; `server/src/routes/wards.js:49-56`; `src/lib/api.ts:180-204` | `X-Officer-Id` is caller-selected and directly treated as identity. Any client can impersonate a stored officer, including a senior engineer. Replace with opaque server sessions, cookie validation and role middleware. |
| High | `server/src/index.js:54-59` | CORS allows every origin and arbitrary cross-origin mutation. Allow only configured local/deployment origins; for cookie auth enforce credentials and CSRF defenses. |
| High | `server/src/http.js:10-27` | Request body accumulates without byte cap, permitting memory exhaustion. Enforce streaming byte limits and return 413 before buffering further. |
| High | `server/src/http.js:55-102`; `server/src/routes/issues.js:381-404` | Multipart parser converts the entire binary body to UTF-8 and uses `indexOf(part)`/global last boundary, so binary corruption and incorrect offsets are possible; duplicate fields overwrite; malformed boundaries are weakly handled. Current report route actually accepts a data URL rather than this multipart object. Adopt a maintained streaming multipart parser or a small, rigorously tested bounded parser. |
| High | `server/src/routes/issues.js:381-404` | Photo checks only a permissive image data URL prefix, trusts declared extension, accepts arbitrary/oversize decoded content and weak base64, and writes without magic-byte validation. `createWriteStream`, `fileURLToPath`, and `execSync` imports are unused. Validate magic bytes, 5 MiB, strict base64, JPEG/PNG/WebP; enforce three report slots. |
| Critical | `server/src/routes/uploads.js:10-25`; `server/src/index.js:25-26` | Uploaded files are served unauthenticated at predictable public URLs. Although route regex disallows slash, path safety should use resolved-root containment; files expose reporter images. Store outside static tree, authorize each read, return non-cacheable/private response, use generated opaque names. |
| Critical | `server/src/routes/wards.js:48-88` | Ward creation comments say officer/admin but implementation accepts any ID present in `X-Officer-Id`; no privileged role validation, no active check. Require admin role, with validation and unique DB constraint. |
| High | `server/src/index.js:46-50, 66-73, 100-104`; `server/src/store.js` | Whole JSON snapshot is synchronously overwritten in place, with write errors silently discarded; no temp+rename, transaction, lock or cross-process coordination. Concurrent requests can race logically; crash can truncate/corrupt the only copy. SQLite transaction + backup and fail-closed error handling. |
| High | `server/src/index.js:33-40, 46-50` | Corrupt JSON silently falls back to seed then `persist(store)` overwrites original on startup. Stop and preserve corrupt source; require explicit recovery/import operation. |
| High | `server/src/routes/issues.js:98-130, 145-157`; `server/src/routes/wards.js:60-79` | Partial validation: title/location/reporter fields lengths/types unchecked; reporter contact not normalized; parsed may be null/non-object causing caught 400; ward coordinates default on zero/invalid values; ward name/code lengths and coordinate ranges not checked. Central schema validation and DB CHECK/UNIQUE constraints. |
| High | `server/src/routes/issues.js:227-242, 379-404` | Status `severity` update silently ignores invalid severity; transitions accept reopen to `reported` by any officer role and clear neither old rejection/resolution fields nor lifecycle timestamps. Align transition matrix with owner-approved six-status lifecycle and admin-only reopen. |
| Medium | `server/src/store.js:102-107` | Client-controlled `sort` keys accepted without allowlist; comparison on undefined fields gives unstable behavior. Whitelist sortable columns, validate pagination and filters. |
| Medium | `server/src/index.js:47-50, 87-95` | Persistence failure is swallowed and success still returned; error response leaks internal exception messages. Surface operational failure safely, log server-side with request ID, return generic 500. |
| Medium | `server/src/routes/issues.js:192-208` | Officer ward check has redundant/misleading `canAct` condition; `officer.assignedOfficerId === officer.id` tests a property not in officer schema. Authorize exact assigned officer or ward-scoped role with explicit matrix. |
| Medium | `server/src/routes/issues.js:45-62` | Public free-text issue search can enumerate descriptions/references, and unbounded `q` scans all records. Restrict public data/query and bound query length/rate. |
| Medium | `server/src/index.js:28, 52` | Binds all interfaces by default despite “local” server framing. Default loopback for local use; make remote exposure explicit. |

## 4. Reusable ideas from the old Supabase files

Useful candidates in `supabase/migrations/20261108100001_create_enums_and_tables.sql`, migration 2 and `docs/backend.md`: reference regex and unique constraint; reporter FK `ON DELETE SET NULL`; coordinate/description checks; separate image and append-only status history; report image slot unique index; indexes for status/date, assignment and history; explicit public column allowlists; role-oriented authorization; transactional mutations. Do not reuse Supabase auth/RLS/RPC/storage syntax or Postgres-only types/functions verbatim.

Reference format can remain `RF-AG-` plus 8 cryptographically selected characters from `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, but server must generate with `crypto.randomInt`/`randomBytes`, enforce UNIQUE and bounded collision retry. Append-only history remains suitable; enforce in service logic and optionally deny update/delete in repository layer. Image cap of 3 report images is a good product rule, but current JSON prototype supports only one `photoUrl`; owner should confirm whether repair evidence is in scope. Field-level privacy is essential because current API leaks whole rows.

Status mismatch requires an owner decision: current code/data uses `reported, verified, in_progress, resolved, rejected` and permits `resolved|rejected -> reported` reopening by staff. Target approved lifecycle is `submitted, under_review, verified, in_progress, resolved, rejected`; assignment remains separate and only admins reopen. Proposed migration mapping: `reported→submitted`; preserve the other four; no existing `under_review`. Decide whether seed prototype records should migrate as `submitted`; define how reopening history maps and whether `under_review` is operationally required. Do not silently invent transition history. Earlier design also specifies severity `low/medium/high`, while prototype includes `critical`; owner decision needed to retain or remove `critical`.

## 5. Proposed SQLite schema

Use ISO-8601 UTC text timestamps (`strftime('%Y-%m-%dT%H:%M:%fZ','now')` generated in application) for readable interchange; compare consistently in UTC. Enable `PRAGMA foreign_keys=ON` on every connection. WAL is recommended for reader/writer overlap, with documented `-wal/-shm` backup handling and checkpoint at clean shutdown; it does not solve multiple independent writers.

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
  reference TEXT NOT NULL UNIQUE CHECK(reference GLOB 'RF-AG-????????' AND length(reference)=14 AND substr(reference,7) NOT GLOB '*[^0123456789ABCDEFGHJKMNPQRSTVWXYZ]*'),
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

CREATE TABLE complaint_images (
  id TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK(kind IN ('report','repair_evidence')),
  slot INTEGER,
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  created_at TEXT NOT NULL,
  CHECK((kind='report' AND slot BETWEEN 1 AND 3) OR (kind='repair_evidence' AND slot IS NULL))
);
CREATE UNIQUE INDEX complaint_images_report_slot_uidx ON complaint_images(complaint_id,slot) WHERE kind='report';

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
CREATE INDEX complaint_images_complaint_idx ON complaint_images(complaint_id);
CREATE INDEX complaint_history_complaint_created_idx ON complaint_status_history(complaint_id,created_at);
CREATE INDEX audit_log_admin_created_idx ON audit_log(admin_id,created_at DESC);
```

SQLite `CHECK` for `reference` uses `GLOB` carefully; application must additionally assert the exact prefix/alphabet and unique collision behavior. `audit_log` is justified because admin-only access to reporter identity is sensitive and should be attributable. Keep notes out of public projections. Never cascade-delete complaints on user deletion; reporter is nullable SET NULL; complaint image/history use RESTRICT to preserve evidence/history.

## 6. Driver evaluation

Environment reported by local command: Node `v24.20.0`, npm `11.19.0`, Windows PowerShell. `node:sqlite` is built into Node 24 and exposes synchronous `DatabaseSync`, prepared statements, transactions can be composed in SQL/application, FK enforcement via PRAGMA, no package installation or native build. Node documentation classifies it as **Stability 1.2 — Release candidate** for current Node 24 documentation; the API may print an experimental warning depending on Node point release/flags. Direct runtime check was NOT VERIFIED in this audit. Licence: Node.js project licence (MIT); bundled with Node.

`better-sqlite3` is a mature synchronous API with transaction helpers and prepared statements; its library docs advertise prebuilt binaries for supported platform/Node combinations and fallback native compilation (node-gyp/toolchain) where unavailable. For Windows, it may download a prebuilt binary, but exact Node 24.20.0 ABI/prebuild availability was NOT VERIFIED; fallback requires native build tools. Licence: MIT, per project documentation, NOT VERIFIED against installed package because it is not installed. Both require `PRAGMA foreign_keys=ON` explicitly per connection. Both support transactions; better-sqlite3 offers a convenient transaction wrapper. No installation performed.

Recommendation: initially choose built-in `node:sqlite` to preserve the firm zero-dependency/local Windows install direction, provided a Phase B runtime smoke check confirms no unacceptable warning and API stability is accepted. Trade-off: release-candidate status and lower ecosystem maturity vs synchronous, simple built-in API. If owner requires a stable third-party API, evaluate better-sqlite3 on exact Windows/Node version and approve dependency installation first.

## 7. Authentication design proposal

Use `node:crypto.scrypt` with per-user cryptographically random salt (at least 16 bytes), stored parameters/version and constant-time derived-key comparison; tune cost on target Windows hardware (e.g. start N=2^15,r=8,p=1 with memory constraints, benchmark before release). Generate 256-bit random session token, store only SHA-256 hash; send raw token in `HttpOnly; SameSite=Lax; Path=/; Secure` cookie in production, HTTPS only in production. Set absolute expiry, revoke on logout/password change/admin disable, clean expired sessions. Use synchronizer CSRF token tied to session plus Origin checking for cookie-authenticated mutations; SameSite is defense-in-depth. Apply per-IP and per-account login rate limits with generic errors and bounded storage. Backend middleware resolves session and role; never trust role/identity request fields.

- Citizen: public complaint submission; own complaint details/history if logged in; public tracking projection without account may remain.
- Officer: read ward-authorized operational complaint fields; mutations limited to assigned complaint or explicitly ward-authorized operations; no user/role administration.
- Admin: all complaint fields, user/officer/ward management, reopen, access reporter details with audit log.
- First admin: documented local CLI provisioning that prompts securely / reads stdin; never a public route. Dev seeds use unmistakably fake credentials, printed only in dev and never committed as real secrets.

Endpoint roles proposal: health/public wards/stats and tracking are unauthenticated with reduced projections; POST issues public or citizen (owner decision on account requirement); issue list/history are authenticated officer/admin; full issue detail admin/officer with scope or citizen owner; PATCH transitions officer/admin; assignment senior officer/admin if retained; POST wards admin only; officer directory public safe subset, private details admin; uploads require authenticated reporter/officer/admin and per-complaint authorization.

## 8. API privacy contract

- Public `GET /api/issues/:reference/track`: only `reference,status,submittedAt,lastUpdatedAt,locationDescription`. No reporter identity/contact, exact coordinates, internal notes, private photos, full description unless specifically approved, nor rejection internals unless owner explicitly decides otherwise. Use uniform 404 and rate limiting to reduce reference enumeration.
- Public ward pages: ward public fields; issue cards only `id,reference,status,severity,category,title,locationDescription,submittedAt`; remove precise lat/lng and full description/contact fields.
- Public stats: aggregates only; no small-cell or reporter detail.
- Public officers: preferably omit endpoint or return `id,displayName,wardId`; never email/phone.
- Authenticated citizen: own complaint fields; contact only own record; image access only own complaint; precise coordinate to reporter only if policy allows.
- Officer: complaint operational fields in assigned/authorized wards; reporter contact only if owner says necessary; every access to reporter details audit logged.
- Admin: complete complaint record; reporter details read creates audit_log entry; all mutation/access scope verified server-side.
- Authenticated history: citizen sees status/time/assignment events only for own complaint, no internal notes; officer sees notes only within scope; admin sees complete append-only history.

## 9. Image storage design

Store under a configurable local data directory outside any public static directory. Accept JPEG, PNG and WebP only after magic-byte inspection (do not trust filename, MIME header or data URL); cap each file at 5 MiB and three report images per complaint. Generate random UUID/cryptographic filenames with server-chosen extension. Client never supplies a filesystem path. Resolve candidate path and verify it remains under the configured root. Serve only through authenticated, authorized endpoint with MIME, `X-Content-Type-Options: nosniff`, private/no-store cache policy. Store path, MIME, byte size, kind, slot, uploader and timestamps in `complaint_images`. Orphan cleanup is future work and must be safe/report-only before deletion. Current parser is inadequate (§3); recommend a maintained streaming multipart library as a new dependency after approval, or strict capped data URL upload initially with decoded-size checks. Never hold unlimited request bytes in memory.

## 10. Migration strategy

1. Phase B creates versioned SQL files and a migration runner that applies each migration plus version row transactionally, verifies schema, sets FK/WAL pragmas, and provides backup/restore documentation. Preserve existing JSON unchanged.
2. Before import, copy `server/data/store.json` to a timestamped backup and never delete that backup. One-time importer validates source, reports counts, maps IDs/references, imports wards/officers/complaints/history in a transaction, and is idempotent via import marker/source hash. Re-run must not duplicate; errors roll back and preserve both files. Back up SQLite with SQLite backup API or stopped-server copy, not by copying only a live DB file in WAL mode.
3. Phase C changes server persistence/repository and routes to SQLite while keeping existing request/response contract temporarily, with compatibility mapping for current UI statuses. Atomic complaint+history+image metadata writes occur in one transaction; filesystem image writes use temp file then rename with cleanup compensation.
4. Phase D adds auth/session and privacy projections. Update API client for cookies (`credentials: include`), CSRF token and changed public issue fields.
5. Phase E removes obsolete dependencies/files/docs, updates launcher/docs, runs full verification. Rollback: stop server, preserve SQLite and JSON backup, revert code/config through reviewed source control operation outside this audit; recovery procedure explicitly retains original JSON. Never auto-fallback from DB failure to seeded store.
6. Dev seed script creates fake records only and is separate from production/admin bootstrap.

Frontend contract changes required: TrackPage currently relies on full issue returned by track plus full history; update types and rendering for safe track projection and filtered public history. Ward Detail requires issue title/category/severity/status/location/reference/date; issue card projection can provide that allowlist. Officer needs authenticated richer list, safe officers directory and auth UI/session. Report needs updated status naming only in returned confirmation; creation input remains largely stable. Home/Ward Explorer continue aggregate API. Keep a stable JSON envelope if practical.

## 11. Windows launcher

`scripts/dev.mjs:12-16` spawns `node_modules\.bin\vite.cmd` directly on Windows with `spawn(viteBin, [], {cwd,...})`. `.cmd` is a shell script and Node's Windows spawn behavior after the CVE-2024-27980 fix rejects batch files unless shell execution is requested; this matches the observed `spawn EINVAL` failure mode. Small reliable fix: resolve Vite's JS CLI entry (e.g. `node_modules/vite/bin/vite.js`) and spawn `process.execPath` with that JS path, no shell; launch backend via `process.execPath` too. Keep both child processes and existing signal/exit handling. Do not set `shell:true` globally because quoting/argument injection risks and avoidable shell parsing. Not applied in Phase A.

## 12. Test plan

Phase B-E tests: empty DB initialization; ordered migration application, rollback on failed migration and repeat idempotence; FK enforcement on every opened connection; CHECK/UNIQUE bounds; complaint creation with initial history atomicity; reference format/collision retry; status/assignment/history atomicity and append-only behavior; scrypt login/session hashing/expiry/revocation/CSRF/rate limit; role middleware and ward scope; spoofed officer header ignored; unauthorized officer complaint/image access denied; public tracking allowlist regression (no PII/coordinates/notes); image MIME magic/size/count/filename/path traversal/unauthorized serving; ward-to-complaint FK and admin-only ward creation; persistence after process restart; import dry-run/idempotence/backup/failure rollback; DB unavailable returns safe error; launcher starts and stops both processes on Windows.

Existing root tools: Vitest 3 with jsdom/Testing Library supports frontend unit/component tests; ESLint, TypeScript and Vite build support static/build checks. No server test runner or server tests are present in the listed files. Built-in `node:test` is a dependency-free option. Supabase SQL tests use pgTAP and do not exercise the local Node server/SQLite.

## 13. Supabase removal inventory

Remove later after confirming no desired reference retention: root dependency `@supabase/supabase-js` and lockfile entries; `src/lib/supabase.ts`; `src/lib/env.ts` Supabase-specific URL/key validation; `.env.example` Supabase variables; README Supabase setup, dependency, source tree and client instructions; `src/test/supabase.test.ts`; Supabase-specific cases in `src/test/env.test.ts`; `supabase/config.toml`, all eight `supabase/migrations/*.sql`, and `supabase/tests/database/*.test.sql`; `docs/backend.md` Supabase claims/RLS/RPC semantics; any CI/deploy references (search found no GitHub workflow/CI files in `rg --files`; verify hidden/external deployment config later); Vercel config should be reviewed for obsolete hosted deployment assumption.

Frontend still has Supabase code and dependency in `src/lib/supabase.ts`, `src/lib/env.ts`, tests and env template, but current app page data calls use `src/lib/api.ts`; no `supabase` import was found in pages/components. Thus frontend bundle still has a compiled Supabase client module path but app's live features use local REST API.

Keep selected SQL/schema concepts as migration notes rather than executable Supabase artifacts: validation lengths, image limits, transition rules after owner decision, indexes, privacy allowlists, append-only status history and admin audit fields. Preserve the approved design document or extract neutral product requirements before deleting; do not retain misleading Supabase architecture claims.

## 14. Phased plan

| Phase | Files likely touched | Acceptance criteria | Risks |
|---|---|---|---|
| B — SQLite foundation | `server/src/db/*`, `server/migrations/*.sql`, server scripts/docs, server package only if driver approved | Driver decision recorded; DB file created only at runtime; migration ledger; FK/WAL verified; constraints/indexes; backup/restore and dev seeds; tests pass | Node 24 `node:sqlite` stability; Windows path/locking/backup behavior; user status decisions unresolved |
| C — API migration | `server/src/index.js`, store/repository, `server/src/routes/*`, new migration/import CLI, tests | Existing UI request contracts remain where safe; atomic transaction behavior; JSON import repeatable and backed up; no silent seed fallback | Legacy status mapping, currently leaking response expectations, orphan image management |
| D — auth and security | auth/session/CSRF middleware, login routes, API client and pages, privacy serializers, upload service | spoofed identity rejected; roles/ward scope enforced; tracking/privacy tests pass; images private; no sensitive fields in public responses | Account recovery, admin bootstrap, cross-origin cookie deployment |
| E — cleanup, launcher, docs, verification | `scripts/dev.mjs`, package/lock, env/docs/tests, Supabase files | npm-only setup works on Windows; both servers start/stop; no Supabase runtime references; full test/lint/typecheck/build/format; migration/recovery docs reviewed | Removing legacy reference prematurely; lockfile churn; Windows process cleanup |

## 15. Open decisions for the owner

1. Confirm exact target lifecycle and mapping of `reported` to `submitted`; add `under_review` behavior. Recommendation: use the six approved statuses; map prototype `reported→submitted`; transition into `under_review` before verification.
2. Confirm `critical` severity vs earlier `low/medium/high`. Recommendation: retain `critical` only if staff operationally need it and update approved schema consistently.
3. Require citizen accounts for submission/history, or allow anonymous reports with public reference tracking? Recommendation: allow anonymous submission only with carefully minimized public tracking and optional account linking; never return contact details publicly.
4. Exact public ward issue-card fields and whether rejection status/reason is public. Recommendation: show rejection status only, never reason by default.
5. May officers view reporter name/contact, and which subset? Recommendation: only assigned/ward-authorized staff, contact only for legitimate follow-up, every access audited.
6. Are repair-evidence uploads in initial SQLite scope, or only report photos? Recommendation: implement report images first (3 slots); defer repair evidence unless a current product requirement confirms it.
7. Should public stats include severity and ward counts, and any minimum aggregation thresholds? Recommendation: aggregate counts only; avoid low-volume sensitive categories.
8. Driver: accept release-candidate `node:sqlite` or require mature third-party package? Recommendation: smoke-test built-in first; request explicit package approval only if warning/stability is unacceptable.
9. Define supported deployment origins, TLS termination and production data directory/backup policy. Recommendation: local binds loopback; production origin allowlist and protected persistent volume.
10. Decide whether old JSON seed contacts/names are synthetic, and whether migration/import should retain them. Recommendation: inspect and classify before any import; treat as personal data until confirmed otherwise.

## 16. NOT VERIFIED items

- Baseline commands did not yield reliable exit codes. `npm` PowerShell shim was blocked by `AuthorizationManager`; retry through `npm.cmd` began `npm run lint` but remained running past 30 seconds and the polling session was aborted. Therefore lint, typecheck, test, build and format are all NOT VERIFIED; the project defines `format` but not `format:check`.
- `node:sqlite` module/API presence was checked (`typeof require('node:sqlite').DatabaseSync` returned `function`), but database/foreign-key runtime smoke test and exact warning behavior were not verified; the attempted inline smoke-test command failed at JavaScript parsing before opening a database.
- better-sqlite3 Windows prebuilt availability/ABI for Node 24.20.0 and licence were not verified against installed package; package intentionally not installed.
- Whether current data contacts are real or synthetic is unknown. This audit did not print their values.
- No live HTTP endpoint behavior was exercised; route findings are from source inspection.
- Deployment/CI outside files visible in this repository was not inspected.
- Existing uploads directory contents were not enumerated or opened; only source code and JSON structure were inspected.
