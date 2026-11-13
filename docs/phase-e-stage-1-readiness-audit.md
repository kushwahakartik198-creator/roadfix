# RoadFix Phase E, Stage 1 — Controlled Pilot Readiness Audit

## Executive verdict: NOT READY

The core workflows are implemented against local SQLite and the existing automated checks pass. I do not recommend starting the Agra pilot yet. Resolve or formally assess the recorded high-severity dependency advisory, protect reporter data and backups with an approved storage and retention plan, correct the restore CLI's missing recovery-file output, and settle least-privilege access to unassigned complaints. The repository also lacks a trustworthy current operator guide and has no pilot database or ward configuration.

This is a read-only repository audit. All eight requested Phase B–D reports were present. No real database was created/opened, no migrations were run against real data, no admin was bootstrapped, and `store.json` was not imported. Automated suites used temporary synthetic databases and accounts, which their fixtures remove.

## Repository and environment overview

- Frontend: React 19, TypeScript, Vite, React Router. The current routes are public home/report/tracking/ward pages and protected `/officer` and `/admin` pages (`src/app/router.tsx:13-34`).
- Backend: Node HTTP API, `better-sqlite3@12.11.1`, `sharp@0.35.5`; server engine requirement is Node 20+ (`server/package.json:1-22`). The active server creates a SQLite connection and passes it to the API (`server/src/index.js:1-18`).
- Database default: `server/data/roadfix.sqlite`; opening the server creates/opens this file, enables foreign keys and WAL, and applies migrations (`server/src/db/database.js:8-10,115-145`; `server/src/index.js:45-47`). The file is absent in the inspected worktree. `server/data/store.json` remains present but disconnected from the current API; it was not read/imported as application data. No schema, wards, or staff accounts are provisioned in the absent pilot database.
- Supabase: No current app module imports `src/lib/supabase.ts`; API calls use the local `/api` client (`src/lib/api.ts:1-5`). The app does not depend on Supabase for current data or authentication. The Supabase package, helper, tests, and Supabase-only `.env.example` remain (`package.json:10-14`, `src/lib/supabase.ts:1-48`, `.env.example:1-15`). Tests emit a missing-Supabase-credentials diagnostic; this is not an active data-path dependency, but the leftover files and example config are misleading.
- Local security mode binds to loopback and allows only local origins. Production mode requires exact HTTPS CORS origins and secure cookies (`server/src/security-config.js:1-31`). `scripts/run-server.mjs` selects local mode for the ordinary development/test environment (`scripts/run-server.mjs:1-16`). Production TLS termination, reverse proxy, persistent storage ACLs, and trusted edge rate limits are deployment responsibilities, not configured in this repository.
- Commands: Root `npm run server` and `npm run dev:full` use the local launcher (`package.json:6-13`, `scripts/dev.mjs:1-38`). `server/package.json` provides database backup/restore/integrity, auth bootstrap, tests, and a `reset` script pointing to `server/src/reset.js`, which is absent (`server/package.json:8-17`). I did not run bootstrap, reset, seed, or server startup.
- Documentation drift: `server/README.md:1-39` still describes the old JSON store, unauthenticated `X-Officer-Id` auth, and a `server:dev` command that is not present in the current root scripts. `.env.example:1-15` is also Supabase-era configuration rather than current RoadFix setup instructions. This is an operational hazard.

## Workflow-by-workflow assessment

| # | Workflow and status | Frontend, endpoints, data, authorization and evidence |
| --- | --- | --- |
| 1 | **PASS** — anonymous citizen submits a complaint | `src/pages/ReportPage.tsx:107-132,164-205` loads wards and submits report fields/photos. `POST /api/issues` validates ward, category, location, description, reporter fields, photos, size, rate and quota (`server/src/api.js:393-439`). Writes use `wards`, `complaints`, optional `complaint_private`, `complaint_images`, and initial `complaint_status_history` in one transaction (`server/src/db/repository.js:203-238`; migrations `001_core.sql:10-104`). No login is required by design. API integration coverage is in `server/src/api.test.js:159-183,281-307`.
| 2 | **PASS** — citizen tracks by reference | `src/pages/TrackPage.tsx:8-37,64-87` requests tracking then public history. `GET /api/issues/:ref/track` and `/track/history` return allowlisted status/date/location and event/status/time data, rate-limited by socket peer (`server/src/api.js:276-291`). Reads `complaints` and `complaint_status_history`; no authentication. Coverage: `api.test.js:159-183,309-323`.
| 3 | **PASS** — admin login and officer account management | `src/pages/LoginPage.tsx:13-48`; `src/pages/AdminPage.tsx:15-60,83-155,227-275`. `POST /api/auth/login`, `GET /api/auth/session`, `POST/PATCH /api/admin/accounts`; tables `users`, `user_credentials`, `sessions`, `officers`, `admin_audit_log` (`server/src/api.js:156-192,223-256`; `server/src/auth/accounts.js:20-72`). Session cookie, CSRF, exact Origin and admin role checks apply. API tests provision only fixture accounts and cover admin account/ward setup (`api.test.js:18-31,123-157`). **Setup condition:** no pilot database or initial admin exists; approved operator setup is still required.
| 4 | **PASS** — admin assigns complaint | Admin page assignment control (`src/pages/AdminPage.tsx:277-324`) calls `POST /api/issues/:id/assign`. Admin role, CSRF, and Origin are checked; repository confirms active officer belongs to complaint ward and atomically writes assignment/history (`server/src/api.js:335-343`; `server/src/db/repository.js:269-287`). Tables: `complaints`, `officers`, `complaint_status_history`. Coverage: `api.test.js:185-207`.
| 5 | **PASS WITH FINDING** — officer views assigned complaints in own ward | `src/pages/OfficerPage.tsx:23-44,138-158` requests protected `GET /api/issues`, shows ward complaints and management only for assigned rows. API filters officers to their session ward (`server/src/api.js:268-274`; `repository.js:115-133`). Tests cover same-ward assignment, wrong-ward denial and unassigned mutation denial (`api.test.js:185-207`). **Privacy finding:** the endpoint and UI return/render full description, exact coordinates, rejection reason and resolution note for every complaint in the officer's ward, including unassigned complaints (`repository.js:115-133`; `OfficerPage.tsx:138-158`). Contact and photo controls are narrower, but the text/location disclosure is not. Confirm that ward-wide access is an approved need or restrict sensitive fields/unassigned rows before pilot.
| 6 | **PASS** — officer updates complaint status | Officer controls (`OfficerPage.tsx:45-66,159-211`) call `PATCH /api/issues/:id`. API requires staff role, mutation Origin/CSRF, and assigned officer plus matching ward; repository enforces the lifecycle and records status history in a transaction (`server/src/api.js:349-363`; `repository.js:239-267`). Admin reopen is separately allowed. Coverage: `api.test.js:185-207`.
| 7 | **PASS** — admin/authorized officer accesses private information | Contact and photo controls are in `OfficerPage.tsx:68-97,212-243`. `GET /reporter-contact`, `/photos`, and `/photos/:photoId` require an authenticated staff session; repository grants admin or assigned officer in the same ward (`server/src/api.js:300-333`; `repository.js:164-201`). Authorized contact reads are audited transactionally; private responses use `private, no-store`. Tables: `complaint_private`, `complaint_images`, `complaints`, `admin_audit_log`. Coverage includes admin, assigned/unassigned/wrong-ward access and audit failure (`api.test.js:209-248`).
| 8 | **PASS** — unauthorized users denied protected operations | Backend re-reads session/account from SQLite and checks role/scope; caller identity headers are not trusted. Mutations also require Origin/CSRF (`api.js:156-192,213-256,335-363,487-503`; `auth/security.js:99-115`). Tests cover unauthenticated mutations, spoofed identity, missing CSRF, wrong ward and non-admin assignment (`api.test.js:113-120,185-207`). Frontend guards are supplementary (`src/features/auth/RequireAuth.tsx:4-21`).
| 9 | **PASS** — private images inaccessible to anonymous users | Uploads are decoded/re-encoded with Sharp, metadata is stripped, and output/path/size are bounded (`server/src/api.js:393-439,444-457`). Files are written outside public assets with exclusive create (`api.js:426-429`); complaint-scoped authenticated retrieval uses `nosniff`, `private, no-store`, and cookie variation (`api.js:320-333`). Legacy `/uploads/:filename` is denied (`api.js:379`). Tests cover unauthenticated access, wrong officer and valid assigned access (`api.test.js:249-279`).
| 10 | **PASS (implementation/tests only)** — operator backup and integrity verification | CLI commands are `npm run db:backup` and `npm run db:integrity` (`server/package.json:12-14`; `server/src/db/maintenance-cli.js:13-27`). Backup uses SQLite online backup, verifies integrity and foreign keys, and publishes exclusively; restore has an offline confirmation path. Relevant tables/files are the whole SQLite database, including migration ledger, complaints and private data. `maintenance.test.js` uses temporary synthetic DBs and covers backup, collision and integrity (`server/src/db/maintenance.test.js:46-72,341-357`). No pilot DB exists, and no manual backup was made. **Finding:** the CLI prints success/path/integrity but omits `result.recoveryFiles` (`maintenance-cli.js:31-34`), although restore returns cleanup leftovers (`maintenance.js:190-198`). A committed restore can therefore leave old files without clearly reporting them to the operator. Surface those paths before using restore in a pilot.

## Test and safe-check results

| Check | Result |
| --- | --- |
| Backend (`npm test` in `server`) | **54 passed, 0 failed**: 42 database/auth/import/maintenance tests and 12 API integration tests. Test fixtures use temporary databases and synthetic accounts; SQLite migrations/integrity are exercised only on those fixtures. |
| Frontend (`npm test`) | **49 passed, 0 failed** across 9 files. React `act(...)` warnings occurred; the Supabase helper test printed the documented missing-credentials diagnostic. |
| TypeScript (`npm run typecheck`) | **Passed**. |
| Lint (`npm run lint`) | **Passed**. |
| Production bundle | **Passed** using `npx vite build --outDir <unique temp directory>`; 2,167 modules transformed. Output was outside the repository and removed afterward to preserve existing `dist`. The JS bundle is 633.97 kB (gzip 190.01 kB), above Vite's 500 kB warning threshold. TypeScript was checked separately. |
| SQLite integrity | Included in the backend maintenance tests; only disposable test databases were checked. No real database integrity command was run. |
| Production migration/bootstrap/restore/import | **Not run**, by instruction. The default SQLite file is absent. |

Backend API tests dispatch directly to the handler rather than binding a live TCP server; prior Phase C reporting documents loopback bind `EACCES` in that environment (`docs/phase-c-backend-report.md`, §7). The current API tests still verify handler/session/SQLite behavior, but do not validate an actual proxy, socket, browser-cookie, or production-origin path.

## Security and privacy assessment

### Strengths verified in code

- SQLite is the current application data/auth store; prepared queries and transactions are used. Migrations are checksum-verified and refuse unrecognized SQLite files (`server/src/db/database.js:36-95,97-145`).
- Staff authentication uses scrypt, random opaque sessions stored as token hashes, HttpOnly/SameSite cookies, CSRF tokens, absolute/idle expiry and session revocation (`server/src/auth/security.js:5-12,15-59,72-146`).
- Public tracking projections omit reporter contacts, exact coordinates, rejection/resolution notes and photo URLs. Private image and contact routes require scope and are tested.
- Image processing, request-size, per-report image count, upload quota, login/tracking/submission throttles provide useful bounds (`server/src/api.js:16-21,156-175,276-295,393-468`).

### Material gaps

- **Dependency audit remains unresolved.** Stage 1 recorded one high-severity npm audit finding; the registry advisory endpoint returned `getaddrinfo ENOTFOUND registry.npmjs.org`. The later dependency report updated Sharp to `0.35.5` but explicitly says `npm audit --omit=dev --json` still could not fetch advisory details and no audit fix was run (`docs/phase-d-remediation-stage-1-report.md`, verification/risks; `docs/phase-d-remediation-dependency-fix-report.md`, Security audit). Do not treat the updated Sharp pin as resolving the unknown advisory. Re-run and triage against the reachable registry before pilot.
- **Backup protection is unspecified.** Backups are not encrypted or pruned; reports leave encryption, retention and off-machine copies to the operator (`docs/phase-d-remediation-stage-3-report.md:87-92`). Reporter contact data and images make OS access controls, full-disk/backup encryption, a retention schedule and a separate protected backup location pilot prerequisites.
- **Restore CLI hides successful-cleanup leftovers.** `restoreDatabase` returns `recoveryFiles`, but CLI output ignores them. Keep restores offline/serialized as required by `docs/phase-d-final-signoff.md`; correct the output before relying on operational restore.
- **Ward-wide operational disclosure:** officers can read unassigned complaint descriptions, precise coordinates and internal resolution/rejection fields. Decide and document whether this is within the pilot's least-privilege policy; otherwise reduce the projection/list scope before collecting real complaints.
- **Privacy notice and retention:** the inspected route set has no privacy/retention page or citizen-facing explanation of optional contact/photo handling. Establish a short local-language notice, purpose/access description and deletion/retention policy before collecting resident contact data.
- **Monitoring/logging:** API errors and orphan-upload cleanup failures go to process `console.error` (`server/src/api.js:385,436`); startup/shutdown errors also use console logging (`server/src/index.js:49-62`). There is no repository-configured durable log sink, request/correlation IDs, metrics, disk/quota alerting, or incident runbook. Admin audit events cover selected staff/contact actions, not operations monitoring. For a small pilot, a named operator, protected log collection, daily DB/upload free-space check and escalation contact could suffice; external monitoring can wait.
- **Rate limits are per-process memory.** They reset on restart and do not coordinate across instances (`server/src/api.js:136-142`; `server/src/auth/rate-limit.js:1-43`). Keep one process and enforce edge limits if exposed through a proxy.
- **Operator documentation is stale.** `server/README.md:1-39` describes JSON storage, `X-Officer-Id`, and a nonexistent `server:dev` command. The example env file documents only Supabase (`.env.example:1-15`). Incorrect setup instructions could lead to failed startup or unsafe assumptions.
- **Windows restore lock test remains absent.** Final sign-off explicitly records that real competing-process WAL/SHM locks have not been tested (`docs/phase-d-final-signoff.md`, Medium finding). Preserve the approved offline, serialized restore limit; arrange a real Windows lock rehearsal before any pilot restore involving live records.
- **Recovery instructions:** The correction report's sequence is coherent for a database operator (stop all clients, preserve all files, clear candidate artifacts, restore original sidecars then DB, verify). It is not a novice runbook: it lacks copy/paste Windows commands, a named escalation owner, decision steps for duplicate source/recovery copies after unlink failure, and an evidence/backup checklist. Train the designated operator and rehearse on synthetic files before pilot.

## Findings ranked by severity

### High — Unresolved reported high-severity dependency advisory

The advisory identity and affected package were unavailable due registry DNS failure; the later audit retry also failed. Without advisory details or a successful current audit, exposure cannot be determined. Resolve this before public pilot traffic (`docs/phase-d-remediation-stage-1-report.md`; `docs/phase-d-remediation-dependency-fix-report.md`).

### High — Pilot personal data lacks an approved backup/retention protection plan

The database and default backup files contain optional reporter names/contacts; uploads contain resident-submitted images. Application-level backups are unencrypted and never pruned. Set ACLs, encryption, retention, protected backup location and recovery owner before accepting real complaints (`maintenance.js:60-84`; Stage 3 report `:87-92`).

### High — Restore cleanup leftovers are not surfaced by the operator CLI

The restore function returns paths in `recoveryFiles` after commit, but the CLI prints only database, safety backup and integrity (`maintenance.js:190-198`; `maintenance-cli.js:31-34`). This does not delete the restored database, but it hides an operational recovery condition. Fix before using restore in the pilot.

### Medium — Ward officers receive full details for unassigned complaints

`repository.js:115-133` selects full operational records for the whole session ward; `OfficerPage.tsx:138-158` renders descriptions regardless of assignment. Backend write/contact/photo checks are stricter, but this read scope may reveal resident-supplied personal information and precise location. Approve explicitly or narrow it before pilot.

### Medium — Deployment and operator documentation contradict active architecture

`server/README.md:1-39`, `.env.example:1-15`, and `server/package.json:11` (reset target is absent) do not describe current SQLite/session setup. Replace with tested startup, environment, bootstrap, backup, integrity, restore, and incident steps before staff training.

### Medium — Actual network/proxy behavior and durable monitoring are unverified

API tests invoke the handler directly. There is no production-like browser/proxy smoke test, durable log/alert setup, or actual Windows competing-file-lock test. Use one process, loopback API behind a reviewed proxy, and keep restore offline. Schedule a production-like smoke test before inviting citizens.

## Required before a controlled pilot

1. Re-run `npm audit --omit=dev` when registry DNS works; identify and resolve or explicitly disposition the reported high-severity advisory.
2. Approve storage controls for SQLite, uploads and backups: least-privilege OS ACLs, full-disk and backup encryption, off-machine protected backup, retention/deletion policy, free-space threshold and a named owner.
3. Fix `maintenance-cli.js` to print every returned recovery file; rehearse backup/integrity and restore recovery on disposable data. Keep restore stopped, offline and serialized; do not run a restore with RoadFix clients connected.
4. Decide whether same-ward officers may view unassigned descriptions/precise coordinates/internal notes; narrow the data if not. Add this decision to staff access rules.
5. Publish a resident-facing privacy notice and retention/contact/photo handling terms, preferably in the languages used by the pilot community. Give residents a way to retain their reference, since tracking relies on the on-screen reference and there is no SMS/email delivery.
6. Replace stale server README and `.env.example`; document that the DB is SQLite, how the approved local/production config works, how to provision the first admin, which commands are safe, and that the reset target does not exist. Set up verified Agra ward records and officer assignments in the intentionally provisioned pilot database.
7. Name an operator and backup contact; provide protected logs, daily disk/upload checks, and incident/escalation steps. Run a browser/API smoke test through the intended proxy/origin before citizen access.

## Can safely wait until after a tightly controlled pilot

- Real competing-process Windows sidecar-lock testing can wait only if no live restore will be attempted during the pilot; preserve the offline, serialized restore rule and rehearse after pilot with synthetic data.
- Shared/distributed rate limiting, autoscaling, advanced metrics, MFA, self-service password reset and automated citizen notifications can wait for a larger rollout if the pilot remains single-process, staff accounts are provisioned and recovered by a named admin, and citizens receive/save references manually.
- Bundle code splitting can wait; the build passes despite the 633.97 kB warning.
- Supabase dependency/helper cleanup can wait; the current app does not import it. Do not remove files/dependencies as part of this audit.

## Recommended next stage

Phase E Stage 2 should be a pre-pilot hardening and operations stage: resolve the audit advisory, close the restore CLI reporting gap, approve least-privilege and resident-data policies, correct operator docs, define encrypted backup/retention and logs, then perform a production-like single-process/proxy smoke test and a synthetic Windows recovery drill. Only after those exit criteria pass should a small Agra pilot database be provisioned and staff/citizens onboarded.

## Read-only and scope confirmation

Safe checks ran only against local temporary test fixtures and a unique temporary production-bundle output directory, which was removed after the build. The repository's `dist` directory and build metadata were not overwritten. No production database, migration, restore, bootstrap, seed, reset, JSON import, or real account operation was run. No application source, dependency, or existing report was modified. Only this audit report is created; nothing was staged, committed, or pushed.
