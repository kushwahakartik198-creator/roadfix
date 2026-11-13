# RoadFix — Phase D Independent Security Review

## Executive verdict: PASS WITH FINDINGS

The inspected implementation has meaningful protections in place: password hashes use scrypt, session tokens are random and stored as hashes, protected routes resolve identity from the server-side session, complaint access is scoped in repository code, and public tracking uses an explicit limited projection. The review found no direct client-supplied role or officer-ID trust in the inspected protected paths.

There are security gaps that should be addressed before production exposure. The most important is unrestricted anonymous complaint submission, which accepts large photo payloads and writes them to persistent storage. There is also a public history endpoint that bypasses the tracking limiter, and the frontend reports logout even if the server did not revoke the session.

This was a source and test inspection only. No tests, migrations, database creation, account bootstrap, or destructive actions were run.

## Findings

### Critical

None identified in the inspected code.

### High

#### H-1 — Anonymous complaint submissions can exhaust memory and upload storage

**Evidence:** [server/src/api.js](../server/src/api.js#L346) routes unauthenticated report creation without a rate limit. [server/src/api.js](../server/src/api.js#L360) reads a request of up to `MAX_REQUEST_BYTES`; [server/src/api.js](../server/src/api.js#L379) accepts up to three photos, and [server/src/api.js](../server/src/api.js#L383)–[server/src/api.js](../server/src/api.js#L393) writes them to persistent storage. There is no per-source submission limiter, concurrency bound, or storage quota in this route.

**Attack scenario and impact:** A remote visitor repeatedly submits valid-looking reports with maximum-size photos. Each request is buffered and stored. This can consume server memory, disk space, and database capacity, causing legitimate reporting and the local API to fail.

**Recommendation:** Before public deployment, add a bounded submission rate limit using the socket peer address unless a trusted proxy is explicitly configured, enforce request/body and concurrent upload limits at both the application and reverse proxy, and set an upload storage quota with monitoring and cleanup policy. Keep anonymous reporting available.

### Medium

#### M-1 — The legacy public history route bypasses public tracking rate limits

**Evidence:** Reference tracking and its history route consume the limiter at [server/src/api.js](../server/src/api.js#L259)–[server/src/api.js](../server/src/api.js#L273). The separate `/api/issues/:id/history` route at [server/src/api.js](../server/src/api.js#L275)–[server/src/api.js](../server/src/api.js#L279) has no limiter. The public ward issue listing returns complaint IDs through the `PUBLIC_COMPLAINT` projection at [server/src/db/repository.js](../server/src/db/repository.js#L8)–[server/src/db/repository.js](../server/src/db/repository.js#L10), and that list route is public at [server/src/api.js](../server/src/api.js#L185)–[server/src/api.js](../server/src/api.js#L189).

**Attack scenario and impact:** A client obtains IDs from the public ward list and repeatedly requests each complaint’s history using the unthrottled ID route. The history contains status events rather than contact details, but bulk scraping and request floods can consume API/database capacity and bypass the intended tracking limit.

**Recommendation:** Apply the same tracking limiter to every public history path, or remove the legacy ID-based route and use only reference-based tracking. Add a regression test proving the bypass is closed.

#### M-2 — Frontend clears authenticated state even when logout fails

**Evidence:** [src/features/auth/AuthContext.tsx](../src/features/auth/AuthContext.tsx#L33)–[src/features/auth/AuthContext.tsx](../src/features/auth/AuthContext.tsx#L38) clears local auth state in `finally`, regardless of whether `api.logout()` succeeds. The server checks Origin and CSRF before revocation at [server/src/api.js](../server/src/api.js#L165)–[server/src/api.js](../server/src/api.js#L174); on either failure it returns before clearing the cookie. The session cookie can remain valid for its configured lifetime at [server/src/auth/security.js](../server/src/auth/security.js#L136)–[server/src/auth/security.js](../server/src/auth/security.js#L145).

**Attack scenario and impact:** A logout request fails due to a network interruption, stale CSRF token, or origin mismatch. The UI appears logged out, while the browser still holds a valid session cookie. On reload, `/api/auth/session` can restore the session. On a shared device, the user may reasonably believe the session was ended when it was not.

**Recommendation:** Treat logout as successful only after a successful server response. On failure, retain or clearly mark the unresolved session and show a retryable error. Add a test covering failed logout followed by session bootstrap.

#### M-3 — Image validation checks file structure but does not fully decode image data

**Evidence:** [server/src/api.js](../server/src/api.js#L46)–[server/src/api.js](../server/src/api.js#L114) checks signatures, chunk/marker boundaries and some metadata markers, but does not decode pixels or enforce image dimensions/pixel count. The upload route persists accepted bytes at [server/src/api.js](../server/src/api.js#L379)–[server/src/api.js](../server/src/api.js#L393); staff can later retrieve them at [server/src/api.js](../server/src/api.js#L301)–[server/src/api.js](../server/src/api.js#L313). The Phase C report also identifies that validation does not fully decode images.

**Attack scenario and impact:** A crafted or malformed compressed image passes structural checks and is later opened by an officer’s browser or image viewer. A decoder bug or extreme image dimensions could consume excessive resources or expose the viewer to a parser vulnerability. Staff-only access lowers exposure but does not remove the risk.

**Recommendation:** Set strict dimension and decoded-pixel limits and use a maintained decoder to validate/re-encode images in a resource-bounded process before serving them. If an image-processing dependency is desired, obtain the separately required approval first. Add malformed and extreme-dimension fixtures to tests.

### Low

#### L-1 — Authorized contact endpoint can return success without recording an access audit

**Evidence:** [server/src/db/repository.js](../server/src/db/repository.js#L171)–[server/src/db/repository.js](../server/src/db/repository.js#L185) logs the contact read only when a `complaint_private` row exists. If no row exists, it returns `{ contact: null }` at line 178; [server/src/api.js](../server/src/api.js#L281)–[server/src/api.js](../server/src/api.js#L289) responds with HTTP 200 and `data: null`.

**Attack scenario and impact:** An authorized staff member requests contact details for a complaint with no private-contact row. The request is presented as a successful read but leaves no audit record. No contact data is disclosed in this branch, so this is an audit completeness issue rather than a direct confidentiality breach.

**Recommendation:** Record every authorized contact endpoint read transactionally, including an empty result, or return a non-success response when there is no contact record. Test both populated and absent contact rows.

#### L-2 — Production cookie and HTTPS protections depend on the exact `NODE_ENV` value

**Evidence:** [server/src/auth/security.js](../server/src/auth/security.js#L136)–[server/src/auth/security.js](../server/src/auth/security.js#L145) adds `Secure` only when `NODE_ENV === "production"`. [server/src/api.js](../server/src/api.js#L411)–[server/src/api.js](../server/src/api.js#L415) rejects non-HTTPS configured origins only under that same exact condition; otherwise local HTTP defaults are allowed.

**Attack scenario and impact:** If a publicly reachable deployment is started with a misspelled or non-production `NODE_ENV`, the session cookie may lack `Secure`, and HTTP origins are not rejected by this configuration check. This could expose session cookies if the service is reachable over unencrypted HTTP or an insecure origin is allowed.

**Recommendation:** Fail startup unless a deployment mode is explicitly selected, require HTTPS origins for every non-local deployment, and derive secure-cookie behavior from validated deployment configuration. Test the real production configuration behind its proxy before release.

#### L-3 — Session-expiry errors do not consistently return the user to a usable login flow

**Evidence:** [src/features/auth/AuthContext.tsx](../src/features/auth/AuthContext.tsx#L12)–[src/features/auth/AuthContext.tsx](../src/features/auth/AuthContext.tsx#L19) treats any session-bootstrap error as anonymous state, while [src/pages/OfficerPage.tsx](../src/pages/OfficerPage.tsx#L30)–[src/pages/OfficerPage.tsx](../src/pages/OfficerPage.tsx#L34) can show a session-expired message without a direct sign-in action. The source review did not find a shared API 401 handler that clears stale auth context and routes protected pages back to login.

**Attack scenario and impact:** A session expires while the officer dashboard is open. The API correctly rejects protected requests, but the page can remain in an error state and the header may continue to reflect stale auth state until navigation or a reload. This is primarily an availability and user-confusion issue; backend authorization still rejects expired sessions.

**Recommendation:** Handle protected API 401 responses centrally by refreshing/clearing auth state and presenting a login link while preserving a safe return destination. Add a frontend test for expiry while the dashboard is already mounted.

#### L-4 — Startup migrations have no enforced pre-migration backup or restore gate

**Evidence:** [server/src/db/database.js](../server/src/db/database.js#L115)–[server/src/db/database.js](../server/src/db/database.js#L149) opens the configured persistent file and applies migrations by default. The Phase D implementation report notes that a backup/restore procedure has not yet been established. Migration 003 is additive at [server/src/db/migrations/003_auth_sessions.sql](../server/src/db/migrations/003_auth_sessions.sql#L1)–[server/src/db/migrations/003_auth_sessions.sql](../server/src/db/migrations/003_auth_sessions.sql#L34), and migration execution is transactional, which reduces but does not eliminate operational recovery risk.

**Attack scenario and impact:** A deployment starts against the only copy of an existing database and a future migration or storage failure occurs. The additive migration is not designed to delete existing rows, but without a verified backup there may be no simple way to recover from filesystem, disk, or operator error.

**Recommendation:** Establish and rehearse an online SQLite backup and restore procedure before production migrations. Keep a dated backup outside the database directory, validate it can be opened, and retain the original file until health checks pass.

## Authentication and authorization review

- **Password handling:** `server/src/auth/security.js` uses Node `crypto.scrypt` with a random 16-byte salt and timing-safe comparison (lines 18–31 and 40 onward). Password length is bounded (lines 34–37). This is a sound baseline. No MFA or password reset mechanism is implemented, consistent with the reported remaining risks.
- **Sessions:** 32 random bytes are generated for the token, only its SHA-256 hash is stored, and session creation is transactional (`server/src/auth/security.js`, lines 77–99). Sessions use an 8-hour absolute and 30-minute idle expiry; inactive/expired sessions are rejected and revoked (`server/src/auth/security.js`, lines 101–123). Logout revokes the server record when Origin and CSRF validation succeed (`server/src/api.js`, lines 165–174).
- **Cookies, CSRF, and Origin:** Cookies are HttpOnly and SameSite=Lax; Secure is conditional on production mode (`server/src/auth/security.js`, lines 136–145). Mutating staff routes validate exact Origin and CSRF (`server/src/api.js`, lines 424–427); login and logout validate Origin. The CSRF token is random, associated with the server-side session, and compared timing-safely (`server/src/auth/security.js`, lines 125–130).
- **Login limiting:** Login has bounded in-memory limits of 20 attempts per socket IP and 5 per normalized email per 15 minutes (`server/src/api.js`, lines 139–150). The limiter is process-local (`server/src/api.js`, lines 120–122), so a restart resets it and multiple server processes do not share counts. `requestRemoteAddress` uses the socket peer; forwarded IP headers are not trusted by default. This is appropriate for the current single local server, but public multi-instance deployment needs a shared limiter or a trusted edge limit.
- **Authorization:** Protected endpoints derive identity from session lookup and require roles (`server/src/api.js`, lines 418–422); the reviewed routes do not use `X-Officer-Id` as identity. Complaint scope checks admin or an officer whose ward and assignment both match (`server/src/db/repository.js`, lines 163–168). Assignment requires admin role in the API and repository (`server/src/api.js`, lines 315–323; `server/src/db/repository.js`, lines 270 onward). Reopening is controlled by the admin flag passed from the server session into the status update function (`server/src/api.js`, lines 330–344; `server/src/db/repository.js`, lines 245 onward). Account creation/deactivation routes are admin-only in the API.
- **Photos:** Photo list/read routes require officer/admin role and complaint scope; responses set `private, no-store` and the binary response uses `nosniff` (`server/src/api.js`, lines 291–313). Paths are reduced to a basename and resolved through a containment helper before reading (lines 309–311). A public `/uploads/...` request is explicitly denied (line 348). The upload validation concern is described in M-3.

## Privacy review

Public complaint queries use an explicit column list at `server/src/db/repository.js`, lines 8–10. It excludes reporter contact, rejection reason, and resolution note. Reference tracking returns only reference, status, submission/update times, and a location description at `server/src/api.js`, lines 259–264. Public history returns status events (`server/src/api.js`, lines 266–273). The Track page displays these fields only at `src/pages/TrackPage.tsx`, lines 70–79. Ward issue listings do expose complaint title, ward/location description and internal ID, but not contact details or private notes. That exposure is consistent with the inspected public listing contract; IDs enable the rate-limit bypass finding M-1.

Contact access checks complaint scope and records a read in the same immediate transaction before returning a populated contact (`server/src/db/repository.js`, lines 171–185). The no-row case is the narrow audit gap in L-1. Rejection reasons and resolution notes are stored in internal history, not in the public projections reviewed.

## Database review

Migration 003 adds a default-inactive flag, credentials and sessions tables, indexes, and append-only audit triggers. It does not drop or rewrite existing complaint, ward, or user rows (`server/src/db/migrations/003_auth_sessions.sql`, lines 1–34). The open path enables and verifies foreign keys and WAL for each connection, configures a busy timeout, and runs migrations transactionally through the migration runner (`server/src/db/database.js`, lines 125–149). Sensitive contact reads and session creation use immediate transactions. Audit triggers block UPDATE and DELETE through ordinary SQL writes, though a local database owner with direct file access can still replace or alter the database; these triggers are not tamper-proof against a machine administrator. Existing database contents were not opened or changed during this review.

## Frontend and test coverage

Protected React routes improve navigation and user experience but are not relied upon as the security boundary; server-side `requireRole` and repository scope checks enforce access. Anonymous reporting remains available, reporter fields are optional, and the Track page uses safe fields. Existing tests include auth hashing/bootstrap/session behavior, role and ward checks, assignment/reopen restrictions, privacy-safe tracking, contact audit, photo authorization, login/tracking rate limits, and frontend protected routes/public tracking/pagination (`server/src/auth/security.test.js`, `server/src/api.test.js`, `src/test/phase-d-frontend.test.tsx`).

Important security test gaps found by inspection:

- Public anonymous report flood, upload concurrency, and storage-quota behavior (H-1).
- Rate limiting of `/api/issues/:id/history` and route removal/compatibility behavior (M-1).
- Failed logout due to bad CSRF, rejected Origin, or network failure, followed by session bootstrap (M-2).
- Contact endpoint behavior and audit record when private contact data is absent (L-1).
- Production cookie/CORS behavior with real production environment configuration and HTTPS reverse proxy (L-2).
- Malformed image payloads, extreme dimensions/pixel counts, and decode resource bounds (M-3).
- Session expiry while a protected frontend page remains mounted, including recovery back to login (L-3).
- Operational backup/restore rehearsal before migration against an existing database (L-4).

No tests were executed as part of this read-only audit.

## Recommended remediation priority

1. Add layered abuse controls and storage bounds to anonymous photo/report submission before public exposure (H-1).
2. Remove or rate-limit the ID-based public history path and add a regression test (M-1).
3. Correct frontend logout state so it reflects confirmed server revocation and supports retry (M-2).
4. Add bounded image decoding, dimension limits, and adversarial image tests (M-3).
5. Make production cookie/HTTPS configuration fail closed and verify it behind the intended proxy (L-2).
6. Log every authorized contact lookup, including an empty result, or return an explicit non-success response (L-1).
7. Improve session-expiry recovery UX and tests (L-3).
8. Document and rehearse SQLite backup/restore before production migration (L-4).

## Read-only confirmation

This audit was read-only with respect to the application and database: no application files, package files, migrations, SQLite files, accounts, or Supabase assets were changed; no tests or migrations were run; nothing was staged, committed, or pushed. The only intended new file is this security review document.
