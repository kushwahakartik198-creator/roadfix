# RoadFix Frontend Audit Report

**Audit source:** `pasted-text.txt` (RoadFix Senior Frontend Engineer brief)
**Audit date:** 2026-11-10
**Scope:** Read-only frontend audit of the RoadFix repository at `C:\Users\kushw\roadfix`
**Mode:** Inspect + document only. No components, styles, config, endpoints, or packages were changed during this pass.

---

## 1. Frontend Architecture Overview

### Actual stack (brief assumptions corrected)

| Area | Actual state |
|---|---|
| UI library | React 19 + TypeScript, Vite 6 |
| Routing | `react-router-dom` v7 via `createBrowserRouter` (`src/app/router.tsx`) |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`, `@theme inline` in `src/index.css`) + shadcn-style components (cva variants, Radix Slot) |
| Notifications | `sonner` (custom Toaster wrapper in `src/components/ui/sonner.tsx`) |
| Icons | `lucide-react` |
| Maps | `leaflet` + `react-leaflet` v5, OpenStreetMap tiles, click-to-pin + geolocation |
| Backend client | `src/lib/api.ts` → local Node server (`server/src/index.js`, port 4000, JSON file store) |
| Backend SDK | `@supabase/supabase-js` installed and env-validated, but **not used by live pages**; `src/lib/api.ts` is the live data layer |

The brief's guesses (Node/SQLite/REST CRUD) were partially wrong: the frontend is a Vite SPA; data comes from a handwritten zero-dependency Node `http` server persisting to `server/data/store.json`; SQLite work is a separate in-flight phase (see `docs/sqlite-migration-audit.md`).

### Structure

- `src/app/` — `App.tsx`, `router.tsx`
- `src/pages/` — 7 pages (see §2)
- `src/components/` — `home/`, `layout/`, `ui/`
- `src/features/` — `auth`, `dashboard`, `map`, `reports` (only `.gitkeep` placeholders; real feature code lives in pages/components)
- `src/lib/` — `api.ts`, `env.ts`, `supabase.ts`, `tokens.ts`, `utils.ts`
- `src/types/` — minimal shared types (nav + status/severity/domain stubs)
- `src/test/` — 6 test files

### Architecture observations

- No state-management library; local `useState`/`useEffect` only.
- No route-level code splitting — single-page bundle.
- Design tokens centralized in `src/lib/tokens.ts` + CSS vars in `src/index.css` (dark civic theme, road orange `#F97316`).

## 2. Page and Component Inventory

| Route | Page | Purpose | Status |
|---|---|---|---|
| `/` | `HomePage.tsx` | Hero, HowItWorks, WhyRoadFix, AgraFocus, FinalCta | Complete |
| `/report` | `ReportPage.tsx` | 3-step civic report wizard (ward + map pin → details → review/submit) | Complete |
| `/track` | `TrackPage.tsx` | Public tracking by reference + audit history | Complete |
| `/wards` | `WardExplorerPage.tsx` | Ward cards + reported-issue counts + stats | Complete |
| `/wards/:wardId` | `WardDetailPage.tsx` | Ward issue list + filters | Complete (broken data path — §5.1) |
| `/officer` | `OfficerPage.tsx` | Officer picker, triage actions, assignment | Complete (broken data path — §5.1) |
| `*` | `NotFoundPage.tsx` | 404 | Complete |

Auth pages (`/login`, `/register`) do **not** exist — only report/track/wards/officer/home are wired.

## 3. UI/UX Audit

### 3.1 Report flow (`/report`)

- Step validation is sequential and sound (`validate(step)` before advancing).
- Description min-length enforced client-side (10) and server-side (10–1000); char counter present.
- Photo: optional, ≤5 MB client check, data-URL → server save; `accept="image/*"`; no client MIME whitelist.
- Map: Leaflet + OSM, click pin, geolocation via `navigator.geolocation` with toasts, pin marker + popup.
- Loading state for ward list; silent fallback to empty list on error.

### 3.2 Tracking flow (`/track`)

- Reference input uppercases; format hint `RF-AG-XXXXXXXX`; search + history timeline rendered.
- Shows status, category, severity, wardId (raw id, not ward name), location, photo, resolution/rejection notes, history.

### 3.3 Officer flow (`/officer`)

- Officer picker (select + cards), status quick-filters, transition actions (verify/reject/start/resolve/reopen) with severity/note requirements, assignment to ward officers.

### 3.4 Ward flows

- Explorer: search by name/code/description, per-ward counts from stats.
- Detail: ward fetch + issue list + status/severity/search filters + counts.

### UX issues found (severity rated)

- **Critical — post-submit UX (`src/pages/ReportPage.tsx`):** after successful submit, `setLastRef(...)` + `setStep(STEPS)` cause the success card **and** the step-3 review card to render together; user can re-submit.
- **High — public officer notes (`src/pages/TrackPage.tsx`):** `resolutionNote` / `rejectionReason` (internal officer notes) rendered on the public tracking view; brief flags this as a security/privacy risk.
- **Medium — ward id displayed raw (`src/pages/TrackPage.tsx`):** ward rendered as raw UUID instead of ward name.
- **Medium — silent failure rendering (`src/pages/WardDetailPage.tsx`):** if ward fetch fails, `ward` is null and the page renders nothing (no error/empty state).

## 4. API Integration Problems

### 4.1 Verified bug — paginated issue responses vs. frontend `PagedResult` contract (CRITICAL)

- Frontend expects: `{ ok: true, data: { data: T[], total, page, pageSize } }` (see `PagedResult` in `src/lib/api.ts:125-130`; `listIssues` `src/lib/api.ts:172-185`; `listWardIssues` `src/lib/api.ts:145-155`).
- Backend sends: `{ ok: true, data: <array>, total, page, pageSize }` (`server/src/routes/issues.js:54` and `:50` — `res.end(JSON.stringify({ ok: true, data: result.data, ...result }))`).
- Frontend `json()` unwraps once (`src/lib/api.ts:16-25`) → for list endpoints returns the **array**, dropping `total/page/pageSize`.
- Callers then access `.data` again → `undefined`.

**Verdict: GENUINE BUG.** The reported suspicion ("frontend unwraps the response once, then callers access .data again") is confirmed by source evidence. The envelope shape and the unwrap contract are inconsistent.

**Affected components:**
- `src/pages/OfficerPage.tsx:67-70` — `api.listIssues(params).then((res) => setIssues(res.data))`
- `src/pages/WardDetailPage.tsx:48-52` — `api.listWardIssues(wardId)` → `setIssues(issueResult.data)`

**Impact:** selecting an officer or opening a ward detail makes `issues` become `undefined`; render-time `issues.filter(...)` throws → officer dashboard and ward detail break.

**Fix direction:** make the backend list response carry the paged payload under `data` (`{ ok: true, data: result }`) **or** make the frontend treat list results consistently (array + pagination metadata); whichever side is changed must be coordinated. Frontend must also stop discarding `total/page/pageSize` after unwrap.

### 4.2 Other API observations

- `GET /api/wards`, `/api/officers` return `{ ok, data: [...], count }` — frontend unwrap yields arrays correctly.
- `GET /api/stats` returns `{ ok, data: { total, byStatus, bySeverity, byWard } }` — unwrap yields stats correctly.
- Pagination params (`page`, `pageSize`) exist server-side (cap 100) and `X-Total-Count` / `X-Page` / `X-Page-Size` headers are set, but the frontend never sends paginated requests and never reads the headers.
- No frontend caller uses `sort`/`dir` beyond defaults.

## 5. Verified Frontend Bugs

1. **CRITICAL — Paginated issues data contract mismatch** (§4.1). Breaks `/officer` and `/wards/:wardId` data paths.
2. **HIGH — Report submit success UX** (`src/pages/ReportPage.tsx:183-188, 586-609`): success card renders alongside step-3 review card; risk of duplicate submission.

## 6. Security and Privacy Concerns (frontend-relevant)

- Officer identity is client-supplied via spoofable `X-Officer-Id` header (`src/lib/api.ts:226-236`); client-side `canAct` gating is display-level only.
- Public endpoints return full issue rows (reporter contact, coordinates, notes) and officer emails/phones — see `docs/sqlite-migration-audit.md` §3 (Critical items) and §8 privacy contract.
- Frontend renders officer `resolutionNote`/`rejectionReason` publicly (`TrackPage`).
- File uploads: client data-URL ≤5 MB, server-side validation weak (magic-byte, MIME, size) — flagged in prior audit; frontend should enforce MIME allowlist client-side too.

## 7. Performance Issues

- No route-level code splitting (all pages bundled together).
- Photo submission sends full base64 data URL (up to ~5 MB → ~6.7 MB JSON) before server decode.
- Leaflet OSM tile loading; fonts self-hosted via Fontsource Variable.

## 8. Accessibility Issues

- **Medium — mobile nav:** `src/components/layout/Header.tsx:104` filters out `/officer` from the mobile menu (only desktop nav shows it); officer page effectively unreachable on mobile.
- **Medium — skip link target:** `src/components/layout/AppShell.tsx:14` sets `focus:outline-none` on `<main>`; skip-link focus visibility should be verified/handled.
- **Medium — form errors:** validation messages rendered as plain `<span>` without `aria-invalid`/`aria-describedby` wiring.
- **Medium — map a11y:** Leaflet click-pin interaction is not keyboard accessible by default.
- **Low — badges:** status badges are semantic-free `div`s.

## 9. Recommended Improvements

1. Fix paginated response contract (critical; see §4.1).
2. Fix post-submit success state rendering.
3. Apply public privacy allowlists (track projection, officer directory) before broader rollout.
4. Replace spoofable officer identity with real auth/session flow.
5. Add loading/error/empty states where missing.
6. Add route-level code splitting and image downscaling.

## 10. Prioritized Implementation Roadmap

| Priority | Item |
|---|---|
| P0 | Fix paged issues envelope bug (§4.1) + regression tests |
| P0 | Fix ReportPage post-submit double-render |
| P1 | Public privacy allowlists (officer notes, officer contacts, coordinates) |
| P1 | Officer auth/session (remove spoofable header trust) |
| P1 | WardDetail error state; ward name resolution on Track |
| P2 | A11y gaps (mobile officer nav, main focus, form aria, map keyboard) |
| P2 | Performance (lazy routes, image compression) |
| P2 | Test coverage for report/officer/ward flows (none exist today) |

---

## Verification performed in this pass

- Existing frontend test suite: **36/36 passing** (`vitest run`) — covers routes, navigation, responsive, contrast, env, supabase.
- `npm run typecheck` (`tsc --noEmit`): **passed** with no errors.
- Source inspection: router, AppShell, Header, Footer, all pages, home components, UI kit, `lib/api.ts`, `lib/env.ts`, `lib/supabase.ts`, tokens, CSS, server routes (`issues`, `wards`, `officers`, `stats`, `uploads`), `server/src/index.js`, `server/src/store.js`.
- Pagination mismatch verified by tracing: backend response shape (`server/src/routes/issues.js:54,50`) → frontend unwrap (`src/lib/api.ts:16-25`) → consumer expectations (`OfficerPage.tsx:70`, `WardDetailPage.tsx:52`).

## What could not be checked (read-only audit limits)

- No live HTTP calls were exercised (no server run) — findings are source-based.
- Lint (`eslint`) not re-verified in this pass (prior audit noted flaky npm shim on Windows).
- Visual/rendering behavior not executed.
- Whether existing uploads/`store.json` contents contain real personal data (see prior audit).

## Read-only pass side effects

- None to source files.
- Test run may have written Vitest cache under `node_modules/.vitest` / temp dirs.
