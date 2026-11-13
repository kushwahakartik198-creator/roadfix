# RoadFix Engineering Review — Consolidated

**Date:** 2026-11-10
**Sources:** `docs/frontend-audit-report.md`, `docs/sqlite-migration-audit.md`, `docs/phase-c-backend-report.md`, `docs/backend.md`, `docs/phase-b-preflight.md`, `docs/phase-b-driver-test.md`, `docs/phase-b-implementation-report.md`
**Verification pass:** independent source re-check of critical findings against `server/src/**` and `src/**` (read-only; no source file was changed, no package installed, no database created, no Supabase introduced).
**Mode:** inspection and documentation only.

---

## 1. Actual current architecture (verified from source)

| Layer | Actual state |
|---|---|
| Frontend | React 19 + TypeScript + Vite 6 SPA; `react-router-dom` v7 (`src/app/router.tsx`); Tailwind v4 + shadcn-style UI; Leaflet maps; `sonner` toasts; `src/lib/api.ts` is the **live** data layer (`src/lib/supabase.ts` dormant). No state lib, no route-level code splitting. |
| Backend live path | `server/src/index.js` → `createApiHandler` (`server/src/api.js`) → `createRepository` (`server/src/db/repository.js`) → better-sqlite3 via `server/src/db/database.js` + migrations in `server/src/db/migrations/`. No auth yet; mutating gates fail closed with 401. Binds default host `127.0.0.1` (`server/src/index.js:7`). |
| Backend legacy (unwired) | `server/src/store.js`, `server/src/routes/*` (incl. leaky handlers), `server/src/seed.js`, `server/data/store.json`. No live module imports were found for the store or route factories. |
| Storage | better-sqlite3 pinned `12.11.1` (B1 authorized install, runtime-verified); DB path `server/data/roadfix.sqlite` (not created); JSON store preserved. |

## 2. Critical findings — independent verification verdicts

| # | Finding | Source | Verdict |
|---|---|---|---|
| C1 | Paginated issues envelope mismatch breaks `/officer` and `/wards/:wardId` | `server/src/api.js:241-244` (`sendPaged` → `{ ok: true, data: result.data, ...result }`); `src/lib/api.ts:16-25` (unwrap once → array, typed as `PagedResult`); consumers `src/pages/OfficerPage.tsx:70`, `src/pages/WardDetailPage.tsx:52` (`res.data`) | **CONFIRMED GENUINE AND STILL LIVE.** Backend now sends `{ ok, data: [<array>], total, page, pageSize }`; frontend unwrap yields the array, so `res.data` is `undefined` and `issues.filter` throws. Backend's own tests (`server/src/api.test.js:69-73`) codified the flat shape, so the bug is test-engrained and no frontend↔backend contract test exists. |
| C2 | Report submit success UX renders success card + step-3 review together (duplicate-submit risk) | `src/pages/ReportPage.tsx:184-185, 516, 586-609` | **CONFIRMED LIVE.** `setLastRef` + `setStep(STEPS)` drive independent conditionals (`{step === 3 && …}`, `{lastRef && …}`). |
| C3 | Frontend/backend data-contract drift after Phase C privacy allowlists (tracking + officer flows) | `server/src/db/repository.js:8-10` (`PUBLIC_COMPLAINT`), `server/src/api.js:166-176` (track/history allowlists); `src/lib/api.ts:75-111` (full `Issue` type incl. reporter/lat/lng/notes); `src/pages/TrackPage.tsx:43-44, 134-204`; `src/pages/OfficerPage.tsx:160-169` (uses `o.name`/`o.role` absent from public officer projection `server/src/db/repository.js:32-44`) | **CONFIRMED.** Tracking now receives an allowlist without `id`, breaking history lookup; officer UI expects fields the public projection omits. |
| C4 | Status vocabulary drift (`reported` vs approved lifecycle) | `src/lib/api.ts:75` (`IssueStatus = "reported" | …`), `src/pages/*` labels; `server/src/db/repository.js:4` (`STATUSES = submitted…`), `server/src/db/migrations/001_core.sql:45-47` | **CONFIRMED DISAGREEMENT.** Blocks clean frontend/backend alignment. |
| C5 | Security findings from Phase A already fixed in live Phase C path | Full public rows (`server/src/db/repository.js:8-10` allowlist; `api.test.js:67-68` asserts no reporter/coords/notes); officer PII (`repository.js:32-44`; `api.test.js:82-86`); `X-Officer-Id` spoof (`api.js:178,184,187` → 401; `api.test.js:88-90`); uploads (`api.js:187` → 401; `api.test.js:92`); CORS (`api.js:116-124`, allowlist + 403); body cap/content-type/JSON (`server/src/http.js:7-44`, 413/415/400; `api.js:11` 22 MiB cap); photo magic-byte/base64/size (`api.js:24-40`); ward creation 401 (`api.js:150`) | **CONFIRMED FIXED at the live gate.** Legacy `server/src/routes/*` retain old behavior but are unwired; treat as dead code pending Phase E cleanup. |

## 3. Common findings and disagreements

- Both audits flagged missing integration/regression tests; source check confirms **none exist** for the frontend API client (no fetch/mock/paged tests in `src/test/**` — only `supabase.test.ts` mocks console.warn).
- Phase A audit vs Phase C report disagreed on live code; source check resolves it: `server/src/index.js` now mounts `createApiHandler`; Phase C report was accurate.
- `docs/backend.md` (approved design) vs Phase C implementation disagree on reopen semantics (`backend.md:52-58` propose `resolved→in_progress`, `rejected→submitted`; Phase C `server/src/db/repository.js:116-128` implement `resolved/rejected → under_review`, admin-only).
- Severity vocabulary: backend `SEVERITIES = low/medium/high` vs frontend `low/medium/high/critical` vs Phase B dry-run withheld `critical` complaints (`docs/phase-b-implementation-report.md:54-58`).
- API contract: backend tests cemented a flat paged shape while the frontend expects a nested page object — the live bug (C1).

## 4. Unified security and privacy remediation plan

- Immediate (pre-pilot exposure): fix C1 contract + regression tests; fix C2 submit UX; reconcile tracking/officer contracts (C3); align status vocab (C4).
- Phase D (auth & authorization): sessions (scrypt + SHA-256 token hash, HttpOnly/SameSite/Secure cookie, expiry/revocation, CSRF), role middleware (citizen/officer/admin), officer ward scoping, admin-only reopen, private-contact read endpoint with transactional `admin_audit_log` write, authenticated+authorized upload serving with reviewed decode, rate limits (tracking/search/login), production TLS/origins/storage backup (`docs/phase-c-backend-report.md:103-114`).

## 5. Unified API response contract (proposed)

- Errors: `{ ok: false, error: <safe message> }`.
- Success: `{ ok: true, data: <payload> }`.
- Single resource / aggregate: `data` = object.
- Collections: `data` = array.
- **Paged: canonical `{ ok: true, data: { data: T[], total, page, pageSize } }` with `X-Total-Count` / `X-Page` / `X-Page-Size` headers** (frontend `PagedResult` shape; requires backend `sendPaged` correction + test updates).

## 6. Authentication and server-side authorization plan

- Phase D sequence: trusted credential/session validation → role + ward-scope middleware → officer/admin mutations → contact access + audit → upload serving policy → rate limiting → frontend session wiring. No request-identity header may be trusted (Phase C already rejects `X-Officer-Id` for mutations).

## 7. SQLite migration readiness

- Phase A audit → Phase B (driver `better-sqlite3@12.11.1` installed & runtime-verified; schema/migrations/db tests pass) → Phase C (API migrated onto SQLite; fail-closed; allowlists; tests pass) → **Phase D pending**.
- Readiness for SQLite-backed API: **HIGH**. Remaining gating items: owner approval for production DB init/import, Phase D auth/authorization/privacy rollout, deploy TLS/backup.

## 8. Missing integration and regression tests

- Frontend↔backend contract tests (paged envelope, tracking, privacy) — **missing**, the C1 gap.
- End-to-end report→track→history flow tests; officer ward-scope authorization tests; migration/rollback tests (present for DB layer).

## 9. Ordered implementation roadmap (dependencies)

1. **P0:** Fix paged envelope (`server/src/api.js` `sendPaged`) + backend tests; frontend consumers then align. *Blocks:* officer + ward detail.
2. **P0:** Fix ReportPage post-submit success state; add regression test.
3. **P1:** Reconcile status vocabulary (frontend vs backend); owner decision on `critical` severity + reopen semantics.
4. **P1:** Reconcile tracking contract (add non-sensitive fields to allowlist/use reference) and officer directory projection vs UI.
5. **P1:** WardDetail error state; ward-name resolution on Track.
6. **P1:** Mobile nav include `/officer` (incl. `src/test/responsive.test.tsx:36` expectation of 4 links).
7. **P2:** A11y, performance, legacy cleanup (Phase E).

## 10. Decision

**APPROVE WITH CONDITIONS.**

Conditions: fix C1 + C2 before release; complete Phase D before any public mutation/upload/contact exposure; owner decisions on lifecycle semantics, `critical` severity, and anonymous submission policy before Phase D frontend work.

## 11. What could not be checked / side effects

- Could not run live HTTP or visual checks; findings are source-based.
- Could not check deployment/CI beyond visible files.
- Read-only pass wrote no source changes; no temp files were created by this pass. Phase C test temp dirs were cleaned per their report.
