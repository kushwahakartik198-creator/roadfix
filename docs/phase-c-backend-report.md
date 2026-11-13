# RoadFix Phase C — Backend API Integration

Date: 2026-11-10

## 1. API routes migrated

The server now routes through `server/src/api.js` and reads/writes SQLite through `server/src/db/repository.js`.

| Route | Phase C behavior |
| --- | --- |
| `GET /api/health` | Checks SQLite and reports service, port and database status. |
| `GET /api/wards`, `GET /api/wards/:id` | SQLite reads with public ward fields. |
| `GET /api/wards/:id/issues` | Paginated privacy-safe issue cards. |
| `POST /api/wards` | Returns 401 until trusted authentication exists. |
| `GET /api/officers`, `GET /api/officers/:id` | Public directory fields only; no email, phone or role. |
| `GET /api/issues` | SQLite filters and pagination with an allowlisted projection. |
| `GET /api/issues/:id` | Public-safe complaint detail; excludes reporter data, precise coordinates, rejection reason and internal resolution note. |
| `GET /api/issues/:ref/track` | Reference lookup and the approved tracking allowlist: reference, status, submitted/updated times and location description. |
| `GET /api/issues/:id/history` | Status and assignment event type/status/time only; no notes or actor identity. |
| `POST /api/issues` | Anonymous report creation, optional private reporter fields and up to three validated report photos. |
| `PATCH /api/issues/:id` | Returns 401 until trusted authentication exists. |
| `POST /api/issues/:id/assign` | Returns 401 until trusted authentication exists. |
| `GET /api/stats` | Aggregate totals by status, severity and ward. |
| `GET /uploads/:filename` | Returns 401; private files are not publicly served. |

The old JSON route factories remain in the repository but are no longer called by the server entry point. No frontend files were changed.

## 2. Database integration architecture

- `server/src/index.js` opens the existing `openDatabase()` connection once at server startup and closes it on graceful shutdown. Its default host is `127.0.0.1`; deployments must configure allowed HTTPS origins and provide HTTPS at the deployment edge/reverse proxy.
- The default database remains `server/data/roadfix.sqlite`. Starting the server will create/open that database and apply the existing migrations. This Phase C task did **not** start the production server or create that database.
- `server/src/db/repository.js` owns the parameterized SQL and row projections. Route parsing, validation, authorization gates and response serialization live in `server/src/api.js`.
- Existing foreign-key, WAL and migration behavior comes from the Phase B database module; Phase C does not duplicate it. All application timestamps are ISO UTC strings.
- Complaint creation, its initial status-history event, optional private contact row and image metadata are committed in one immediate SQLite transaction. Status changes and assignments update the complaint and append history in one transaction. SQL errors are logged server-side and clients receive a generic 500 response.
- Photo files are written with generated UUID names outside the public route tree. If the related database transaction fails, the newly written files are removed; cleanup failures are logged for review. SQLite stores only photo metadata.

## 3. Complaint lifecycle

The service allows only the six approved statuses and three severity values. The forward sequence is `submitted → under_review → verified → in_progress → resolved`; rejection is allowed from the review/work states. Reopening a resolved or rejected complaint to `under_review` is only allowed when the service receives an administrator authorization flag. There is no trusted authentication middleware yet, so no HTTP caller can reach any status or assignment mutation. The API ignores `X-Officer-Id` as identity and returns 401 for those operations.

References use the existing `crypto.randomInt()` generator, bounded collision checks and the database uniqueness constraint. History writes share the mutation transaction, so a failed history write rolls back the complaint update.

## 4. Security and privacy protections

- Public serializers select columns explicitly. Reporter name/contact and rejection/resolution internals are never returned by public list, detail, tracking, ward or history responses. Reporter contact submitted with a report is stored only in `complaint_private`.
- Public officer responses omit email, phone and role.
- Ward creation, status changes, assignment and private file reads fail closed with 401. Client-supplied identity headers are not trusted. No reporter-contact read endpoint exists yet.
- Since no authorized contact read can currently occur, Phase C creates no reporter-contact audit entries. The existing `admin_audit_log` table remains ready for a future authenticated contact-access flow; Phase D must write an audit row in the same operation that returns private contact data.
- CORS defaults to the two local Vite origins. A production `CORS_ORIGINS` configuration is required to use HTTPS origins. There is no authentication, rate limiter or built-in TLS listener in this phase.
- Request bodies are capped at 22 MiB; invalid filters and pagination are bounded. Errors do not return SQL details.

## 5. Authentication limitations

Real authentication is not implemented. Consequently all officer/admin mutations, ward creation and private upload reads are unavailable and return 401. Public reads and anonymous report submission remain available. `Authorization` headers are accepted by CORS for future use but are not interpreted as credentials. No fake login or identity mechanism was added.

## 6. Upload implementation status

Report photos are limited to three per complaint, five MiB each, and JPEG/PNG/WebP data URLs. The server checks the declared type against file signatures/container structure, PNG chunk CRCs, size and base64 validity; it rejects common embedded EXIF/XMP/text metadata chunks and uses a generated path after containment validation. The upload API is disabled with 401 because access cannot be authorized without authentication. Files are private under `server/data/uploads`; no image URL is returned publicly.

The checks validate container structure and markers but do not fully decode raster pixels. There is no metadata stripping or image transformation. If stronger decode/re-encode validation is required, add a reviewed image-processing dependency in a separately approved change before serving uploads.

## 7. Tests and exact results

Commands and results:

- `npm.cmd test --prefix server` — exit 0; 13 database/import tests passed and 8 API integration subtests passed (21 total, 0 failed).
- `npm.cmd run lint` — exit 0.
- `npm.cmd run typecheck` — exit 0.
- `git diff --check` — exit 0; Git emitted only configured LF-to-CRLF normalization warnings.

API coverage includes health, ward reads and protected ward creation, officer privacy projections, report creation and distinct references, filters/pagination, tracking allowlist, public history, status transitions, transactional assignment/history and rollback, unauthorized officer mutations, aggregate statistics, generic SQL-error handling, image validation/size/count, traversal rejection, disabled file serving, and persistence after closing/reopening the temporary database.

The test environment denied loopback client connections with `EACCES`, so API tests invoke the same HTTP handler directly instead of making socket requests. The persistence test closed and reopened the temporary SQLite connection and reconstructed the handler; it did not restart a listening HTTP process. Tests used temporary databases and upload directories under `server/`, cleaned after the successful run. `server/data/roadfix.sqlite` was confirmed absent.

No production JSON import was run. `server/data/store.json` remains present and unchanged. No dependencies were installed or removed.

## 8. Files created and modified

Created:

- `server/src/api.js`
- `server/src/api.test.js`
- `server/src/db/repository.js`
- `docs/phase-c-backend-report.md`

Modified:

- `server/src/index.js` — SQLite startup/lifecycle and loopback default.
- `server/src/http.js` — bounded JSON body parsing and removal of the unsafe multipart parser.
- `server/package.json` — SQLite server description and API test scripts; existing `better-sqlite3@12.11.1` pin retained.

Pre-existing untracked audit, B1/B2 documentation, database files and B1 lockfile were preserved. `docs/frontend-audit-report.md` was also preserved.

## 9. Remaining issues

- Authentication/authorization must be implemented before enabling officer/admin actions, contact access or upload serving. Contact access must write `admin_audit_log` entries.
- Public tracking and search have no rate limiting; add it before public production exposure to reduce reference enumeration and bulk scraping.
- Configure production HTTPS termination, explicit HTTPS origins and protected persistent storage before deployment.
- Image validation does not fully decode/re-encode images. Uploads are not served until an authenticated access policy exists.
- The existing JSON source has withheld/unclassified records and invalid legacy values. It was not imported or altered; resolve the Phase B2 withholding review and seek separate production-import approval.
- The old JSON route modules and seed/store files remain present but disconnected from the active server. Supabase files remain untouched as requested.

## 10. Instructions for Phase D

After separate approval:

1. Implement real authentication backed by trusted server-side credentials/session validation and role/scope middleware. Do not rely on request identity headers.
2. Add officer/admin authorization for status changes, assignment and ward creation; enforce administrator-only reopen. Add tests using trusted test sessions.
3. Add a narrowly scoped private-contact endpoint that records the actor, action, complaint and UTC timestamp in `admin_audit_log` transactionally. Keep the public projections unchanged.
4. Decide and implement an authenticated photo retrieval policy; consider reviewed image decode/re-encode and metadata stripping before serving files.
5. Add rate limiting for reference tracking and public search, configure production origins/TLS/storage, and verify deployment backups.
6. Update the frontend only under Phase D authorization to handle authentication and the privacy-safe tracking/history contracts.
7. Treat production JSON import as a separate approval. Review the existing dry-run report, preserve a source backup, and do not apply until withheld records and mapping decisions are explicitly approved.

Useful verification commands after the next approved implementation:

```powershell
npm.cmd test --prefix server
npm.cmd run lint
npm.cmd run typecheck
```

Starting the server with `npm.cmd run dev --prefix server` initializes the configured SQLite database, so do not run it against the production data path before that deployment is intended.

## 11. Final Git status

Exact `git status --short` after Phase C:

```text
 M server/package.json
 M server/src/http.js
 M server/src/index.js
?? docs/frontend-audit-report.md
?? docs/phase-b-driver-test.md
?? docs/phase-b-implementation-report.md
?? docs/phase-b-preflight.md
?? docs/phase-c-backend-report.md
?? docs/sqlite-migration-audit.md
?? server/package-lock.json
?? server/src/api.js
?? server/src/api.test.js
?? server/src/db/
```

Nothing was staged, committed or pushed.
