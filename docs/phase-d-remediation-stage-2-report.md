# RoadFix — Phase D Remediation Stage 2 Report

## Executive summary

Implemented M-2, L-1, and L-2 only. Logout now clears frontend authentication state only after the API confirms success; failure keeps the user signed in locally, displays a generic retryable message, and suppresses duplicate requests. Every authorized reporter-contact lookup is audited in the same transaction, including a missing private-contact row. Deployment security now validates mode, host, and exact CORS origins before the server opens its database; production requires HTTPS origins and secure cookies.

No new dependency was needed. Sharp remains pinned at 0.35.5. No production database, account, or imported data was touched. No files were staged, committed, or pushed.

## M-2 — Logout failure handling

`AuthProvider` now preserves the current user and CSRF state if `api.logout()` rejects. It shows a generic message that does not expose backend details, provides retry through the navigation logout control, and clears auth state only after the API returns success. An in-flight guard and disabled navigation buttons prevent duplicate concurrent logout requests. No redirect is triggered by a failed logout; after confirmed success, role navigation changes to the anonymous Staff login link.

Frontend tests cover confirmed logout, server/CSRF-style failure, network interruption followed by successful session bootstrap, retry after failure, repeated clicks, and pending-button disabling.

## L-1 — Reporter-contact read auditing

`readReporterContact` continues to authorize and perform the lookup inside one immediate SQLite transaction. It now inserts a `reporter_contact_read` audit row for every authorized lookup, whether the private row exists or not. The entry records the actor, action, complaint, nullable reporter user target, and ISO UTC timestamp. Unauthorized requests do not create audit rows. If audit insertion fails, the transaction fails and the API returns a generic error without contact data. Existing append-only audit triggers remain unchanged.

Backend coverage exercises contact retrieval and audit, absent contact and audit, unassigned and cross-ward officer denial, admin access, and audit-insert failure without disclosure.

## L-2 — Fail-closed security configuration

Added `server/src/security-config.js`. It accepts only `local` or `production` security modes; rejects wildcard, malformed, non-canonical, or path-bearing CORS entries; requires HTTPS origins in production; requires exact loopback-only origins and a loopback bind host in local mode; and rejects local mode when `NODE_ENV=production`. Production cookies are Secure. Cookie helpers and the auth service default to Secure unless the validated local configuration explicitly passes `secure: false`.

Startup validates configuration before opening SQLite. `NODE_ENV=production` selects production mode and requires `CORS_ORIGINS`; other nonstandard `NODE_ENV` values require an explicit `ROADFIX_SECURITY_MODE`. No code trusts `X-Forwarded-Proto`, `X-Forwarded-For`, or other forwarded identity headers.

To keep the approved local HTTP development flow working, the local server launcher explicitly supplies `ROADFIX_SECURITY_MODE=local` when no mode is supplied for an unset, development, or test `NODE_ENV`. Local mode still refuses non-loopback binds. Production-mode behavior is testable through an injected validated config using temporary test data; production environment variables are not required for those tests.

## Configuration required for future deployment

For production, set:

```text
ROADFIX_SECURITY_MODE=production
NODE_ENV=production
CORS_ORIGINS=https://your-exact-app-origin.example
```

Use comma-separated canonical HTTPS origins only when more than one exact origin is required; do not include paths or a wildcard. Terminate HTTPS at the reviewed reverse proxy and keep the API on a protected interface. The application does not infer HTTPS from forwarded headers. For local development, the launcher selects local mode and keeps the loopback bind and Vite proxy arrangement.

## Files changed for Stage 2

- `src/features/auth/AuthContext.tsx`
- `src/features/auth/auth-context.ts`
- `src/components/layout/Header.tsx`
- `src/test/phase-d-frontend.test.tsx`
- `server/src/db/repository.js`
- `server/src/api.js`
- `server/src/api.test.js`
- `server/src/auth/security.js`
- `server/src/auth/security.test.js`
- `server/src/auth/service.js`
- `server/src/security-config.js` (new)
- `server/src/index.js` (configuration validation before database open)
- `scripts/run-server.mjs` (new local-mode launcher)
- `scripts/dev.mjs` (routes local API startup through the mode-setting launcher)
- `package.json` and `server/package.json` (development script routing only; no dependency edits)
- `docs/phase-d-remediation-stage-2-report.md` (this report)

The worktree contained numerous pre-existing changes and untracked Phase A–D files. Those were preserved. Sharp remains at `0.35.5`; no dependencies or lockfiles were changed in Stage 2. The `server/data/roadfix.sqlite` production database remains absent.

## Verification results

Commands were run against the final Stage 2 implementation. Exit code **0** for each:

- `npm.cmd test --prefix server` — database/auth/import suite: **18 passed, 0 failed**; API suite: **12 passed, 0 failed**.
- `npm.cmd test -- --reporter=dot` — **8 test files passed; 44 tests passed, 0 failed**.
- `npm.cmd run lint` — **passed**.
- `npm.cmd run typecheck` — **passed**.
- `npm.cmd run build` — **passed**.
- `git diff --check` — **passed**.

The build emitted the existing warning that the minified JavaScript bundle exceeds 500 kB (about 633 kB). Frontend tests emitted existing React `act(...)` warnings and the retained missing-Supabase-environment diagnostic. Git printed line-ending normalization warnings for existing modified files; `git diff --check` reported no whitespace errors. No requested test was skipped.

## Remaining risks

- Logout can be committed by the server while the response is lost. The browser intentionally preserves its current state until the user retries or session bootstrap confirms the server state; protected API calls still enforce server-side session validity.
- The SQLite audit is append-only through normal application/database trigger paths, but a machine administrator with direct file access can still tamper with the database.
- Production still depends on correct HTTPS proxy, exact origin, persistent-storage ACL, and host configuration. No production deployment or real reverse-proxy browser test was performed.
- In-memory auth and tracking throttles remain process-local as reported earlier; deployment should add trusted edge rate limits.

## Final status and scope confirmation

Pre-existing modified and untracked workspace files remain present alongside the Stage 2 changes and this report. Nothing was staged, committed, or pushed. No production database or administrator account was created, no JSON data was imported, Supabase was not removed, and no dependency was added, removed, or updated. The only dependency references in the manifest remain as before Stage 2.
