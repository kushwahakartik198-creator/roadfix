# RoadFix Phase D Implementation Report

**Scope:** Authentication, authorization, private contact/photo access, and frontend integration. Phase D only; no production deployment, production import, or Supabase cleanup was performed.

## 1. Authentication architecture

- Added an additive version `003_auth_sessions.sql` migration. It deactivates legacy users by default, adds `user_credentials` and `sessions`, adds supporting indexes, and makes audit rows append-only.
- Passwords use Node's built-in `crypto.scrypt` (`N=32768`, `r=8`, `p=1`, 64-byte output, random 16-byte salt). The verifier compares derived values with `timingSafeEqual`.
- Login creates a 256-bit random opaque session token. The browser receives it only in a host-only `HttpOnly`, `SameSite=Lax`, `Path=/` cookie. The database stores only its SHA-256 hash. Production cookies set `Secure`.
- A separate random CSRF token is returned by authenticated login/session responses and required on state-changing browser requests. Login, logout, and mutations validate the exact `Origin`; credentialed CORS is restricted to configured origins.
- Each protected request resolves the session and re-reads the active account and officer profile from SQLite. Session lifetime is eight hours absolute and 30 minutes idle. Logout, deactivation, ward reassignment, expiry, and session limits revoke sessions.
- There is no public registration. The one-time initial administrator command is `npm run auth:bootstrap-admin --prefix server`; it is interactive, hides the password, requires confirmation, accepts no account/password command-line arguments, and is guarded against a second bootstrap. The bootstrap implementation was exercised against temporary test databases; the CLI was not launched and no production account was created.
- Login errors are generic. Login attempts are bounded by IP and normalized email; public tracking is rate limited. Remote address comes from the socket, not forwarded headers.

## 2. Database migrations and lifecycle

- The live database remains `server/data/roadfix.sqlite`; `openDatabase()` creates the connection, turns on and verifies foreign keys, enables WAL, sets the busy timeout, and applies checksum-verified migrations. Those settings are applied per opened connection.
- Migration 003 adds `users.active` with default `0` so pre-existing users do not become login-capable without an explicit credential and activation. `user_credentials` stores scrypt hash, salt, parameters, and timestamp. `sessions` stores session ID, hashed token, CSRF token, lifecycle timestamps, and revocation timestamp.
- `admin_audit_log` update/delete triggers preserve append-only audit records. Account creation, activation/deactivation, ward changes, assignment, bootstrap, and successful reporter-contact reads are recorded.
- The complaint schema and API use only `submitted`, `under_review`, `verified`, `in_progress`, `resolved`, `rejected`; severity uses only `low`, `medium`, `high`. Timestamps are ISO UTC strings. No production DB was opened or created; `server/data/roadfix.sqlite` remains absent.
- Writes that affect multiple rows use SQLite transactions. Contact authorization, audit insertion, and contact selection run in one immediate transaction, and the API sends contact data only after that transaction succeeds. Database failures return generic API errors rather than SQL details.

## 3. Authorization rules

- Administrators can create staff accounts, create wards, assign complaints, view the admin audit log, and reopen resolved/rejected complaints to `under_review`.
- Officers receive operational complaint lists for their own ward. They can change a complaint only when it is assigned to their officer profile. The dashboard hides management actions, contact, and photo controls when the officer is not the assignee.
- Assignment is admin-only. No dispatcher role or capability was introduced.
- Reporter contact access is allowed only to administrators or the officer assigned to that complaint in their own ward. Successful reads are audited before the response. Client identity and role headers, including `X-Officer-Id`, are not used.
- Frontend route guards improve navigation; the API independently enforces every role and scope check.

## 4. Frontend changes

- Added an auth provider, session bootstrap, login page, role-protected officer/admin routes, logout controls, and role-aware mobile and desktop navigation.
- Replaced the officer picker and identity header model with the server session identity and ward. The admin dashboard supports staff provisioning/deactivation, officer ward changes, ward creation with coordinates, assignment, reopening, and audit review.
- The API client now sends cookie credentials and CSRF headers and uses the backend's nested pagination contract. Shared status and severity types match the approved values.
- Anonymous reporting remains available; reporter name and contact are optional. Report photo selection supports up to three photos, at most 5 MB each.
- Public tracking uses the complaint reference and displays status, dates, location description, and safe status history only. It does not render reporter information, photos, rejection reasons, or resolution notes. Public ward issue cards and public statistics remain limited to safe complaint fields and aggregate counts.
- Added loading, login, access-denied, not-found, retry/rate-limit, and connection/server error messaging across login, tracking, and staff dashboards.
- Vite development now binds to `127.0.0.1:5173` and proxies `/api` to the loopback server at `127.0.0.1:4000`, keeping the browser on one origin for cookie and CSRF behavior.

## 5. Photo and contact privacy

- Uploaded report photos stay under the private upload store. The public upload path is denied; staff retrieve photos through authenticated complaint-scoped endpoints. Responses use `private, no-store` and `X-Content-Type-Options: nosniff`; the frontend fetches bytes with cookie credentials and creates local blob URLs.
- Server validation accepts only JPEG, PNG, or WebP, limits each image to 5 MB, and enforces three images per complaint. Repair evidence and image processing were not added.
- Public serializers and history omit reporter fields, rejection reasons, resolution notes, history notes, and photo URLs. Contact responses are private/no-store and cannot be returned unless the transactional audit insert succeeds.

## 6. Rate limiting

- Login: 20 attempts per remote IP and 5 attempts per normalized email per 15-minute window, with `429` and `Retry-After`.
- Public track and history: 30 requests per socket remote address per minute, with `429` and `Retry-After`.
- The bounded in-process limiter evicts expired keys and ignores `X-Forwarded-For`. No trusted proxy was configured.

## 7. Tests and exact results

- `npm.cmd test --prefix server` — **passed**. Database/auth/import suite: 18 passed, 0 failed. API integration suite: 10 passed, 0 failed. The import suite exercises only synthetic temporary fixtures/dry runs; no production JSON import ran.
- `npm.cmd test -- --reporter=dot` — **passed**. 8 frontend test files, 39 tests passed, 0 failed. Added coverage for cookie/CSRF API transport, protected routes, safe public tracking, anonymous-input shape, and nested pagination; backend API tests cover anonymous report creation and server pagination/privacy contracts.
- `npm.cmd run typecheck` — **passed**, exit code 0.
- `npm.cmd run lint` — **passed**, exit code 0, no ESLint findings.
- `npm.cmd run build` — **passed**, exit code 0.
- Non-failing warnings: frontend tests print React `act(...)` warnings from asynchronous page/provider effects and a missing-Supabase-environment diagnostic from the retained Phase 0 test. Vite reports the minified JavaScript bundle exceeds 500 kB (about 632 kB); code splitting can be considered separately.
- All database/API tests use temporary SQLite files and test accounts. The confirmed leftover temporary test file from an interrupted earlier run was removed after verifying the directory contained only `test.sqlite`. No production database, account, or JSON import was created.

## 8. Files changed

Files touched during Phase D:

- `server/package.json` (test and bootstrap scripts; no dependency installation or unrelated dependency change)
- `server/src/api.js`, `server/src/api.test.js`, `server/src/db/repository.js`, `server/src/db/database.test.js`
- `server/src/auth/accounts.js`, `bootstrap-admin.js`, `rate-limit.js`, `security.js`, `security.test.js`, `service.js`
- `server/src/db/migrations/003_auth_sessions.sql`
- `src/app/App.tsx`, `src/app/router.tsx`, `src/components/layout/Header.tsx`, `src/lib/api.ts`
- `src/features/auth/AuthContext.tsx`, `auth-context.ts`, `RequireAuth.tsx`, `useAuth.ts`
- `src/pages/AdminPage.tsx`, `LoginPage.tsx`, `OfficerPage.tsx`, `ReportPage.tsx`, `TrackPage.tsx`, `WardDetailPage.tsx`, `WardExplorerPage.tsx`
- `src/types/index.ts`, `vite.config.ts`
- `src/test/api-client.test.ts`, `phase-d-frontend.test.tsx`, and updates to `navigation.test.tsx`, `responsive.test.tsx`, `routes.test.tsx`

The worktree also contained pre-existing Phase A–C documentation, `server/package-lock.json`, `server/src/http.js`, and `server/src/index.js` changes at the start of Phase D. Those audit documents and unrelated existing changes were preserved. `server/data/store.json` was not modified. Supabase dependencies/files were not removed.

## 9. Remaining risks and mitigations

- The rate limiter is process-local: restarting the server resets counters, and multiple instances do not share them. Keep the local deployment single-process; enforce an additional limit at a trusted production reverse proxy. Continue ignoring forwarded IP headers unless the proxy is explicitly configured to strip client-supplied values.
- Production requires HTTPS termination, exact HTTPS origins in `CORS_ORIGINS`, and ACL-protected persistent storage for the SQLite file and upload directory. These settings were not production-tested.
- There is no implemented SQLite backup/restore command in this phase. Before live data, add and rehearse a `better-sqlite3` online backup/restore workflow; do not copy a live WAL database as a lone file.
- The initial administrator bootstrap opens the default DB path. Run it only from the intended local environment after backup and access review; its one-time guard prevents a second bootstrap but does not replace operating-system access controls.
- There is no self-service password reset or MFA in this phase. Define a reviewed credential recovery process before a larger staff rollout.
- Browser tests are component/contract tests, not a real-browser deployment test. Verify cookie behavior through the chosen HTTPS reverse proxy before production.

## 10. Phase E recommendations

1. Obtain a separate approval and plan before any production JSON import; review/withhold unclassified names, contact data, free-text personal information, and unsupported legacy values.
2. Implement and rehearse online backup, restore, integrity checking, and a documented recovery objective before production data is entered.
3. Configure HTTPS reverse proxy, exact origin allowlist, persistent-storage ACLs, proxy-level rate limits, and operational logging; validate cookie and proxy behavior in a production-like environment.
4. Review account recovery, password rotation, and whether MFA is required for administrators.
5. Perform an independent privacy/security review of public projections, private upload storage, contact audit retention, and authorization behavior.
6. Plan Supabase cleanup as a separately approved task after confirming no remaining references are required; this phase intentionally left them intact.

## 11. Final Git status

Exact `git status --short` after Phase D (all changes remain unstaged; none committed or pushed):

```text
 M server/package.json
 M server/src/http.js
 M server/src/index.js
 M src/app/App.tsx
 M src/app/router.tsx
 M src/components/layout/Header.tsx
 M src/lib/api.ts
 M src/pages/OfficerPage.tsx
 M src/pages/ReportPage.tsx
 M src/pages/TrackPage.tsx
 M src/pages/WardDetailPage.tsx
 M src/pages/WardExplorerPage.tsx
 M src/test/navigation.test.tsx
 M src/test/responsive.test.tsx
 M src/test/routes.test.tsx
 M src/types/index.ts
 M vite.config.ts
?? docs/frontend-audit-report.md
?? docs/phase-b-driver-test.md
?? docs/phase-b-implementation-report.md
?? docs/phase-b-preflight.md
?? docs/phase-c-backend-report.md
?? docs/phase-d-implementation-report.md
?? docs/phase-d-preflight.md
?? docs/roadfix-engineering-review.md
?? docs/sqlite-migration-audit.md
?? server/package-lock.json
?? server/src/api.js
?? server/src/api.test.js
?? server/src/auth/
?? server/src/db/
?? src/features/auth/AuthContext.tsx
?? src/features/auth/RequireAuth.tsx
?? src/features/auth/auth-context.ts
?? src/features/auth/useAuth.ts
?? src/pages/AdminPage.tsx
?? src/pages/LoginPage.tsx
?? src/test/api-client.test.ts
?? src/test/phase-d-frontend.test.tsx
```
