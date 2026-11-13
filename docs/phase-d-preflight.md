# RoadFix Phase D — Authentication and Frontend Preflight

Date: 2026-11-10

**Scope:** read-only repository and report inspection. This document is the only file created for this preflight. No dependencies were installed, no application code or package files were edited, no database was opened or created, no JSON data was imported, and no Supabase files were removed.

## 1. Current state inspected

### Frontend and workflows

- RoadFix is a React 19/TypeScript Vite SPA using `react-router-dom` v7, with `createBrowserRouter` in `src/app/router.tsx` and an `AppShell` layout.
- Existing pages are Home, Report, Track, Ward Explorer, Ward Detail, Officer and Not Found. There is no Login page, Admin page, authentication provider, or protected route.
- The `/officer` page lets a user choose an officer from a public directory and treats that selection as the acting identity. It offers triage, rejection, assignment and reopen actions. This is a UI selector, not authentication.
- The Report wizard accepts a photo data URL and currently requires a reporter contact number in client validation. The server permits that field to be omitted. The workflow must continue to allow anonymous reports; contact must become optional in the UI.
- The Track page searches by reference, then fetches history using a complaint ID. It renders photo URLs, resolution notes and rejection reasons. Phase C’s public tracking result intentionally omits complaint ID, photos and private notes, and its history projection omits note and actor fields. The page therefore needs a privacy-safe contract and presentation update.
- The Ward Detail page consumes paginated issue data. The Phase C server returns `data` as an array with pagination fields at the top level, while `src/lib/api.ts` unwraps `data` and consumers expect a `PagedResult` object containing `.data`. This existing mismatch must be corrected as part of frontend integration.
- The API client in `src/lib/api.ts` sends JSON requests without `credentials: "include"`; status and assignment calls send `X-Officer-Id`. Its status/severity and issue types still include legacy values (`reported`, `critical`) and fields that the public API no longer returns.
- No page imports Supabase auth. `src/lib/supabase.ts` creates a Supabase client, but the live pages use `src/lib/api.ts`. Phase D should not use Supabase as the identity or data layer.

### Backend and SQLite state

- The active server opens the existing `openDatabase()` module at startup. The configured file is `server/data/roadfix.sqlite`; read-only inspection found that file absent at preflight time. The existing `server/data/store.json` remains present and is not a Phase D source of imported accounts.
- Phase C keeps public issue, ward and stats projections allowlisted. Complaint tracking returns reference, status, submitted/updated times and location description. Public history returns event/status/time fields only. Public APIs omit reporter contact, rejection reasons, exact complaint coordinates and private image paths.
- `POST /api/issues` remains anonymous. `POST /api/wards`, complaint `PATCH`, assignment `POST`, and private upload reads return 401 until real authentication exists. The server does not accept `X-Officer-Id` as identity.
- Current SQLite migrations define `users` (`email`, `role`, optional display name and timestamps), `officers` (optional `user_id`, `ward_id`, display name, phone and `active`), `complaint_private`, `complaint_images`, `complaint_status_history`, and `admin_audit_log`. User roles are constrained to `citizen`, `officer`, and `admin`. The officer table has an active flag and ward link but no permission/rank field.
- The current schema has **no password credential table and no sessions table**. `admin_audit_log` records actor user/role, action, complaint/user target and timestamp; it is not yet used by an authenticated contact-read route. New auth schema must be added by versioned, additive migration(s), preserving every existing SQLite row.
- No production JSON import is part of Phase D. The Phase B2 dry run withheld unclassified officer records and complaint/history records with invalid legacy values; keep that source untouched until separate import approval.

## 2. Recommended authentication architecture

### Passwords and account provisioning

- Use Node’s built-in asynchronous `node:crypto` `scrypt`; this avoids another dependency and native-build risk on Windows. Generate a random salt of at least 16 bytes per account, store the algorithm/version and work parameters with the derived hash, and compare equal-length hashes with `timingSafeEqual`. Benchmark/tune parameters on the target Windows machine before deployment; do not claim a parameter is production-tuned before measuring it.
- Use normalized email as the staff login identifier. Require a password of at least 12 characters and cap input length to bound hashing work. Never log passwords, hashes, raw session tokens, or reporter contacts. Use a dummy scrypt operation for unknown accounts and identical login errors to reduce account enumeration.
- Do not add public registration. Provide an out-of-band local CLI for initial administrator creation: prompt for email/password without echoing or placing the password in process arguments; refuse to create a second bootstrap admin if one is already active. Subsequent officer/admin creation and deactivation should require an authenticated administrator. Keep any break-glass recovery as a separate local maintenance command with explicit backup and audit handling.
- Existing `users` rows have no credential. Do not invent passwords or auto-link unclassified seed people. Accounts without an explicit credential remain unable to log in until deliberately provisioned.

### Additive SQLite migration

Add a new versioned SQL migration; do not edit the applied Phase B migration files or rebuild existing tables. Recommended additions:

- A `user_credentials` table keyed by `user_id`, with encoded scrypt hash/parameters, credential version and `changed_at`.
- A `sessions` table with a unique SHA-256 hash of the opaque session token, `user_id`, CSRF verifier/token, `created_at`, `last_seen_at`, `expires_at` and `revoked_at`; add indexes for token lookup and user/expiry lookup. Never store the raw session cookie value.
- A `users.active` flag added with a fail-closed default for pre-existing rows. Explicit provisioning activates an account. Keep the existing `officers.active` flag and require both the user and officer profile to be active for officer access.
- If the owner approves designated dispatchers, add an explicit `can_assign` capability to `officers`, default false. Do not infer it from client data or legacy officer names/roles.

Run migrations only after a SQLite backup using the database backup API or while the server is stopped; never copy only the main file while WAL is live. Migration tests should snapshot representative pre-existing rows, apply the new migration, and prove all complaint, private-contact, history, officer, ward, image metadata and audit rows remain unchanged.

### Sessions, cookies, CSRF and logout

- On login, generate a 256-bit random opaque token. Send it only in a host-only, `HttpOnly`, `SameSite=Lax`, `Path=/` cookie; set `Secure` in production. Do not use localStorage, URL parameters, or a client identity header for credentials. Prefer a same-origin production reverse proxy so the SPA and API share an origin.
- Store only the token hash in SQLite. Recommended default expiry is 8 hours absolute and 30 minutes idle, configurable after owner review. Rotate at login; revoke on logout, password reset, account deactivation and role/ward permission changes. Check account and officer active state from SQLite on protected requests so revocation takes effect promptly.
- Return only safe identity data (`id`, display name, role and, for officers, ward/capabilities) from `GET /api/auth/session`. Keep a session-bound CSRF token in the session record and return it to the authenticated SPA; the token is not a login credential. Require it in a custom header for cookie-authenticated mutations. Also verify the exact `Origin` against the configured allowlist and use `SameSite` as defense-in-depth. Login should require JSON and a permitted Origin; logout requires a valid session and CSRF token, revokes the session, and expires the cookie.
- Add exact-origin CORS credentials support (`Access-Control-Allow-Credentials: true`) and allow only the CSRF header. Do not combine credentialed cookies with wildcard CORS. In local development use a consistent host spelling between Vite and API; the current frontend defaults to `localhost` while the server binds `127.0.0.1`, so verify cookie and origin behavior. Production should terminate HTTPS and serve both under one site.
- Suggested endpoints: `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`. `GET /session` returns 401 when there is no valid session; the SPA treats that as anonymous. No public login bypass or fake identity fallback.

### Authorization and officer-to-ward scope

- Resolve every protected request from the session cookie to a current `users` row and, for officers, the linked active `officers` row. Ignore `X-Officer-Id`, role fields, officer IDs and ward IDs supplied as proof of identity. IDs in request bodies can name a target only; the server validates the target against the actor’s current scope.
- Admins may manage users/officers/wards, read authorized complaint operations, assign work and reopen resolved/rejected complaints. Only a server-side `admin` role can reopen.
- Recommended least-privilege default: an active officer can read operational complaints for their own ward; can change status only on complaints assigned to their own officer profile; cannot act across wards; and cannot create wards or reopen. A designated dispatcher (`can_assign`) or admin can assign active officers only within the relevant ward. The assignee must belong to that ward. Require assignment before work starts/resolves according to the approved lifecycle.
- Keep the public `/api/issues/:ref/track` projection separate from officer operational details. Require a session and ward/assignment check for operational fields and notes. Keep all public paths free of reporter contact and rejection reason.
- Add a dedicated contact access path for authorized staff (recommended: the assigned officer for that complaint and admins only). Fetch the private row and insert an `admin_audit_log` row in one transaction; do not return contact if audit insertion fails. Log actor, action, complaint and UTC time, never the contact value or session token. Restrict response caching. Add an append-only policy for audit rows through repository controls and, preferably, migration triggers.

### Login and public tracking rate limits

- Add bounded per-IP and per-normalized-account login throttles with generic errors and `Retry-After`; avoid permanent account lockout that attackers could use to deny service. Add a public tracking limiter keyed by the socket peer address and return 429 with `Retry-After`. Keep track misses uniform and avoid returning whether a malformed or unknown reference differed.
- The existing server is a single Node process, so an in-memory limiter is acceptable for a first local deployment only if its map is bounded and expired keys are evicted. Enforce a second limit at the production reverse proxy. Do not trust `X-Forwarded-For` unless a specifically configured trusted proxy strips client-supplied forwarding headers.

## 3. Frontend integration plan

### Authentication pages and navigation

- Add `/login` with email/password, loading, generic credential failure, lockout/rate-limit and server-unavailable states. Preserve a validated return path for post-login redirect; never accept an arbitrary external redirect URL.
- Add an `AuthProvider`/context that loads `GET /api/auth/session` on startup, exposes `loading`, `user`, `role`, `ward/capabilities`, `csrfToken`, `refresh` and `logout`, and clears state on session expiry. Do not persist the session token in browser storage.
- Add route guards around `/officer` and `/admin`; client guards improve navigation only. The API remains the authorization boundary. Handle initial loading, 401 redirect to login, 403 access-denied view, offline/server errors and session expiry without infinite redirects.
- Update desktop/mobile navigation to show Login while anonymous and the correct dashboards/logout when authenticated. The current mobile menu excludes `/officer`; correct that as part of integration.

### Officer and admin workflows

- Replace the officer picker/“acting officer” selector with the verified session identity; remove `X-Officer-Id` from all API client methods. Show the authenticated ward and permitted actions.
- Update workflow labels and filters to the approved lifecycle: `submitted`, `under_review`, `verified`, `in_progress`, `resolved`, `rejected`. Add a review/assign flow compatible with the sequential lifecycle; show rejection reason only inside authorized staff screens. Reopen controls appear only for admins and server authorization still decides.
- Add a new `/admin` dashboard for account/officer provisioning, ward assignment, activation/deactivation, dispatcher permission (if approved), cross-ward complaint management, administrator-only reopen, and audit history. Require confirmation for deactivation/reopen and display success/error states.
- Add an explicit “view reporter contact” action, hidden unless the session has permission. Explain the operational purpose before revealing it; each successful read is logged server-side. Never include contact in issue-list payloads or preload it into page state.

### Anonymous reporting, tracking and photos

- Preserve `/report` without login. Make reporter contact optional; if provided, describe that it is private and staff access is restricted/logged. Keep the reference confirmation and public tracking usable without an account.
- Update API types to distinguish public tracking/card data from authorized operational complaint data instead of using one `Issue` type containing private fields. Replace legacy statuses/severity. Fix the paginated response envelope mismatch before wiring the officer and ward lists.
- Rework Track to request a reference-based safe tracking response and safe public history (prefer a `/api/issues/:ref/track/history` endpoint so the public UI does not need a database ID). Display only approved status/time/location fields. Remove photo, rejection reason, resolution note, reporter identity/contact, precise coordinates and internal notes from public rendering. Map ward ID to a public ward name only if needed.
- Keep photos out of public tracking and public URLs. Until an approved reporter-ownership mechanism exists, allow image reads only to the assigned officer/admin with complaint scope checks; return bytes through a private endpoint with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. If authenticated image display uses a cross-origin API, fetch as a credentialed blob and revoke object URLs. Anonymous reporters should not retrieve photos using the public reference alone. Optional account linking or a separate high-entropy claim secret requires owner approval before enabling reporter image access.
- Improve loading, empty, validation, 401, 403, 404, 429, offline and 500 states. Keep report submission usable when the auth endpoint is down; anonymous report creation must not wait on auth bootstrap.

## 4. Decisions to confirm before implementation

| Decision | Recommended default | Trade-off |
| --- | --- | --- |
| Officer actions and assignment authority | Officers read their own ward and mutate only assigned complaints; admin or explicitly enabled `can_assign` dispatchers assign within that ward. | Safer scope and separation of duties; adds an account permission to manage. |
| Existing “senior engineer” role in the UI | Replace with an explicit server-side `can_assign` capability; do not infer it from old JSON rows. | Flexible permissions; requires admin setup for dispatchers. |
| Reporter contact access | Assigned officer and admins only; every successful read is logged transactionally. | Strong privacy and clear accountability; ward peers cannot see contact by default. |
| Anonymous reporter photo access | No public photo access; staff-only until a separate claim-token/account-link flow is approved. | Avoids treating a track reference as a photo password; anonymous reporters cannot retrieve their photo later in this first iteration. |
| Staff login ID | Normalized email; no public registration. | Simple to operate; needs a secure out-of-band account/password setup process. |
| Session lifetime | 8-hour absolute, 30-minute idle; revoke immediately on logout, reset or disable. | Limits stolen-session exposure; officers may need to sign in again during long shifts. |
| Initial administrator | One-time local CLI bootstrap, no public route; later account changes require an admin session. | Secure first setup; recovery depends on controlled local machine access. |
| Production origin/cookie topology | Same-origin HTTPS reverse proxy; local dev uses one consistent loopback hostname and exact CORS allowlist. | Simplifies cookies/CSRF; requires proxy configuration for deployment. |

These defaults are recommendations for owner review, not implemented decisions.

## 5. Dependencies, risks and mitigations

- **New runtime dependencies:** none recommended for the first implementation. Node `crypto.scrypt`, `randomBytes`, `createHash`/HMAC, SQLite prepared statements and a small tested cookie parser cover the design. Any Argon2 or image decode/re-encode package should be a separate dependency review; image transformation is not needed to begin cookie/session auth.
- **Credential/session schema changes:** additive migration only, SQLite backup first, foreign keys enabled on each connection, WAL preserved. Do not alter old migrations or discard user/officer/complaint/history/audit rows.
- **Session theft/CSRF:** HttpOnly cookie, Secure in production, SameSite, hashed opaque token, CSRF header, exact Origin checks, short expiry, revocation and no browser token storage.
- **Privilege escalation:** server-side role/profile lookup on each protected request; validate active state, ward, assignment and target officer; ignore identity headers; admin-only reopen. UI role checks are not security controls.
- **Contact/photo disclosure:** separate public and operational DTOs; dedicated narrowly scoped endpoints; audit contact reads; no rejection reason publicly; no photo serving before authorization.
- **Reference enumeration and brute force:** login and tracking throttles, generic failures, bounded limiter storage, production proxy rate limiting, and no raw IP/contact values in logs.
- **Account/bootstrap lockout:** exercise the CLI on a temporary DB before production, verify one-admin creation and recovery procedure, and back up before schema/account changes.
- **Compatibility risk:** API status names, public tracking fields/history, paginated response shape and officer response types changed in Phase C while frontend types remain legacy. Update API types and UI together with contract tests; do not temporarily restore private fields to make the old UI render.
- **SQLite contention:** keep scrypt asynchronous and outside transactions; use short transactions for session creation/revocation and audit/contact reads. Avoid rewriting `last_seen_at` on every request; throttle idle-expiry updates.
- **Proxy identity risk:** use the socket peer address unless the configured trusted proxy is explicit and strips user-supplied forwarding headers.

## 6. Proposed implementation sequence

1. Confirm the decisions in §4; inspect the target SQLite file read-only and create a verified SQLite backup before any migration. Keep JSON import out of this phase.
2. Add an additive auth migration for credentials, sessions, account active state and (if approved) dispatcher capability. Add indexes and append-only audit protections. Verify foreign-key behavior and preserve all old row counts/values on a synthetic database.
3. Implement scrypt password helpers, session creation/lookup/revocation, cookie helpers, CSRF/Origin checks, bounded login/tracking rate limiters, and a one-time CLI admin bootstrap. Unit-test these modules before wiring routes.
4. Add login/session/logout routes and authentication/role/ward middleware. Protect assignment, status, ward, admin, contact and photo routes. Add audit-before-disclosure behavior and verify `X-Officer-Id` has no effect.
5. Define explicit public, officer and admin API contracts; add the reference-based safe history route, fix paginated envelopes, and add contract tests for absence of contact/rejection details.
6. Update `src/lib/api.ts` types, credential/CSRF handling and errors; build auth context/route guards/login; replace the officer picker; add admin dashboard; update report/tracking workflows and mobile navigation.
7. Implement role/scope and lifecycle UI, private contact reveal, and private photo access only after server policy is approved. Keep public tracking photos disabled.
8. Run database/API security tests, frontend Vitest, lint, typecheck and Vite build. Exercise migration and restart tests on temporary DBs. Review a database backup/restore procedure before production use.
9. Deliver Phase D report and stop. Do not perform Phase E Supabase cleanup or production JSON import without separate authorization.

## 7. Planned tests

### Backend and SQLite (`node:test`)

- Additive migration preserves existing SQLite data, FK checks, WAL mode, unique email/session hash, credential constraints and schema version/checksum.
- scrypt success/failure, salt uniqueness, parameters/versioning, timing-safe comparison, generic unknown-user response, account inactive and officer inactive behavior.
- Login throttling by IP/account, bounded cleanup, track rate limit/429/`Retry-After`, and safe behavior behind configured trusted proxy.
- Session cookie flags per environment, no raw session token in DB/log/API, expiry/idle timeout, rotation, logout revocation, password reset and user/role/ward deactivation revocation.
- CSRF missing/incorrect token, Origin mismatch, credentialed CORS preflight, cookie-authenticated mutation, login CSRF protections and no wildcard CORS.
- Spoofed `X-Officer-Id`/body actor/role ignored; officer cannot cross wards or mutate unassigned issues; inactive officer blocked; dispatcher assignment constrained to ward; admin-only ward create and reopen.
- Reporter-contact endpoint limited to allowed actor, audit row committed before response, no contact value in audit/log, and audit write failure denies access. Public list/detail/tracking/stats/history never contain private contact or rejection reason.
- Anonymous report and reference tracking still work with no session; tracking responses/history allowlists and uniform missing-reference behavior; no public photo route.
- Authorized photo scope, MIME/container/size/count/path traversal, non-cacheable headers, and denial to unauthorized officer/citizen. Use generated temporary files and remove only test files.
- Persistence after closing/reopening a temporary DB/server process; transaction rollback for complaint, assignment, audit and session mutations; safe generic DB errors.

### Frontend (Vitest/Testing Library)

- Login validation/loading/error/rate-limit; session bootstrap; logged-out redirect/return path; role-guarded Officer/Admin routes; 401 expiry, 403, logout and offline states.
- Officer identity comes from session, never from an officer picker/header. Admin-only reopen and assignment controls reflect capabilities while API remains authoritative.
- Anonymous submission without contact; optional contact privacy copy; success confirmation; session outage does not block reporting.
- Public track/history render only allowlisted fields and never render rejection reason, resolution notes, contact, photo or exact coordinates. Safe status mapping and pagination response shape.
- Contact reveal only after authorized response and UI state clears on navigation/logout; private photo requests include cookies and never create a public URL.
- Desktop/mobile login/dashboard navigation and access-denied/loading states.

Do not run these tests during this read-only preflight. No test commands were executed in this phase.

## 8. Final Git status

Exact `git status --short` before writing this preflight:

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

Exact `git status --short` after writing this preflight:

```text
 M server/package.json
 M server/src/http.js
 M server/src/index.js
?? docs/frontend-audit-report.md
?? docs/phase-b-driver-test.md
?? docs/phase-b-implementation-report.md
?? docs/phase-b-preflight.md
?? docs/phase-c-backend-report.md
?? docs/phase-d-preflight.md
?? docs/sqlite-migration-audit.md
?? server/package-lock.json
?? server/src/api.js
?? server/src/api.test.js
?? server/src/db/
```

All listed modifications/untracked files other than `docs/phase-d-preflight.md` existed before this preflight. Nothing was staged, committed or pushed.
