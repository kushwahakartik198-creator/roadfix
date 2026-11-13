# RoadFix — Phase E, Stage 2C Officer Privacy Hardening

## Summary

Implemented the approved officer read policy in the backend operational complaint projection. Officers receive full operational complaint details only when the complaint is assigned to their own officer account. All other complaints in their ward are returned with exactly five complaint fields: `reference`, `status`, `category`, `wardId`, and `submittedAt`. Officers without an assigned ward receive no complaint rows.

The officer list also no longer filters on hidden title/location text or severity for officers, preventing query results and counts from becoming a side channel for restricted data. The dashboard renders the limited records as restricted summaries and does not render descriptions, operational controls, reporter contacts, or photos for them. Admin access, assigned officer workflows, authorization/session/CSRF/Origin checks, auditing, and public tracking/reporting behavior remain intact.

## Changed files

- `server/src/db/repository.js` — filters officer results to their own ward, suppresses severity filtering and hidden-field text search for officers, and applies per-row output projection before API serialization.
- `src/lib/api.ts` — added restricted-officer response typing and a dedicated typed client call for the officer list.
- `src/pages/OfficerPage.tsx` — uses the officer response type, renders safe summary fields for restricted complaints, and shows operational controls/details only for assigned records.
- `server/src/api.test.js` — added assertions for exact restricted keys, hidden-field search/filter side channels, assigned/admin detail access, private access denial, assigned-only status updates, wrong-ward denial, and unchanged public tracking.
- `src/test/phase-d-frontend.test.tsx` — added a UI test confirming a restricted record renders as a summary without management, contact, or photo controls.
- `docs/phase-e-stage-2c-officer-privacy-report.md` — this report.

No schema, migration, dependency, authentication architecture, or restore logic changed. Existing session, CSRF, Origin, audit, and role checks were retained.

## Access behavior

| Actor and record | Result |
| --- | --- |
| Officer, complaint in own ward not assigned to that officer | Only reference, status, category, ward ID, and submission date are included. No description/title, coordinates, location description, assignment metadata, contact, rejection/resolution notes, or image metadata/URLs. |
| Officer, complaint assigned to that officer | Existing operational projection remains available; private contacts/photos remain behind their existing scoped endpoints. Status updates still pass the existing assigned-officer check. |
| Officer, complaint outside own ward | Ward-filtered list cannot return it; explicit different-ward list request is denied. Private endpoints remain scope checked. |
| Admin | Existing full operational list access and authorized private endpoints remain available. |
| Anonymous public user | Public report and tracking projections are unchanged. Tracking response fields and values are asserted by API tests. |

The implementation returns `wardId` as the existing ward identifier. Complaint description, title, exact coordinates, private notes, contact data, and image information are not included for non-assigned rows in the officer list response.

## Validation results

| Check | Result |
| --- | --- |
| Full backend (`npm test` in `server/`) | **61 passed, 0 failed**: 49 database/auth/import/maintenance tests and 12 API test groups. |
| Frontend (`npm test`) | **50 passed, 0 failed** across 9 files. Existing React `act(...)` warnings and the Supabase helper's missing-credentials diagnostic were printed; tests passed. |
| TypeScript (`npm run typecheck`) | **Passed**, exit 0. |
| Lint (`npm run lint`) | **Passed**, exit 0. |
| Production build | **Passed**, 2,167 modules transformed. Built to a unique temporary directory and removed afterward. Existing warning remains: JavaScript bundle is 634.29 kB (gzip 190.13 kB), above Vite's 500 kB warning threshold. |
| `git diff --check` | **Passed**, exit 0; Git emitted existing LF-to-CRLF normalization notices for workspace files. |

The backend tests use temporary synthetic SQLite fixtures and fixture accounts; no production database was accessed.

## Remaining risks

- The build still emits the existing large JavaScript chunk warning; splitting can be scheduled separately.
- Frontend test runs continue to emit existing React `act(...)` warnings and the inactive Supabase helper diagnostic.
- Existing pilot risks documented in Phase E Stage 1 (dependency audit network uncertainty, backup/retention controls, deployment monitoring, and real Windows file-lock rehearsal) are outside this privacy change and remain open.

## Scope confirmation

No real SQLite database was created, modified, migrated, or restored. No admin was bootstrapped, no account was created outside temporary test fixtures, and no JSON import was run. Dependencies were unchanged. Existing unstaged and untracked work was preserved; nothing was staged, committed, or pushed.