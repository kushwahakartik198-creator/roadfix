# RoadFix Hackathon Hybrid Demo Readiness

**Assessment:** Prepared for a manual rehearsal; the complete Chrome and disconnected workflows are **not verified**. Do not describe either workflow as passed until the manual checks below are completed.

## Environment and isolation

- The demo has a dedicated SQLite database at `server/data/hackathon-demo/roadfix-demo.sqlite` and a dedicated upload directory at `server/data/hackathon-demo/uploads/`.
- The default application path is `server/data/roadfix.sqlite` (`server/src/db/database.js:8`). It was absent when checked. The demo launcher explicitly selects its separate path and refuses to serve the default path (`server/scripts/hackathon-demo-server.js:8-25`).
- The existing `server/data/uploads/` directory was not used; its files were not opened, copied, or changed.
- The preparation script refuses to reuse an existing demo folder (`server/scripts/hackathon-demo-prepare.js:17-24`). **Do not run it again**; the synthetic database already exists.
- The demo contains fictional accounts and complaints only. The generated synthetic image is a graphic labelled as synthetic, not a resident photograph.
- The demo directory is ignored by Git (`.gitignore:55`). The current host showed an inherited read permission for a sandbox group on the directory. The account passwords are therefore stored in a Windows DPAPI CurrentUser-protected file, rather than relying on that ACL to protect them. The credentials file was round-trip verified under the current Windows user. Keep it on this Windows profile and do not share it.

## Current synthetic data

One fictional ward, “Synthetic Agra Demo Ward” (code `DEMO-AGRA`), uses the generic demo center coordinates 27.18, 78.02. Those coordinates are not claimed to identify any particular road or municipal boundary. The five seeded pothole complaints are:

| Fictional location label | Severity | Seeded status | Assigned to demo officer |
| --- | --- | --- | --- |
| Fictional Demo Road Alpha | High | Submitted | No |
| Fictional Demo Road Bravo | Medium | Under review | Yes |
| Fictional Demo Road Charlie | High | Verified | Yes |
| Fictional Demo Road Delta | Low | In progress | Yes |
| Fictional Demo Road Echo | Medium | Resolved | Yes |

The seed uses no reporter name, contact number, email address, or personal image. Synthetic timestamps are generated when the preparation script runs. The preparation script creates separate administrator and officer accounts using RoadFix's existing credential provisioning and password hashing (`server/scripts/hackathon-demo-prepare.js:39-53`). Their passwords are not included in this report; use the local DPAPI credential instructions in the runbook.

## What was verified

- The four task changes were inspected: `.gitignore`, `src/pages/ReportPage.tsx`, `server/scripts/hackathon-demo-prepare.js`, and `server/scripts/hackathon-demo-server.js`.
- The isolated database returned `integrity_check = ok`; `foreign_key_check` returned no violations. The five complaint statuses each had one seeded record.
- Both demo scripts passed `node --check`.
- Root frontend tests: **50 passed across 9 files**.
- Backend tests: **70 passed** (58 database/auth/maintenance tests and 12 API tests).
- TypeScript check (`npx tsc --noEmit`): passed.
- Lint (`npm run lint`): passed.
- Production build (`npm run build`): passed. Vite emitted its existing large-chunk warning (main JS chunk about 635 kB before gzip); this did not fail the build.
- The demo API and Vite processes each announced successful startup once. No Chrome user journey or HTTP workflow was completed.
- The OSM tile connectivity probe failed DNS resolution for `a.tile.openstreetmap.org` in this environment. This is not evidence that tomorrow's connection will fail, but connected map tiles are currently unverified.

## What remains unverified

- Chrome loading the citizen page and completing the report form.
- Live upload and storage of the synthetic PNG through the UI.
- Public tracking of the resulting reference.
- Admin login, assignment, officer login, status update, and post-update public tracking.
- Dashboard counts in the browser after the new report.
- A real Wi-Fi-disconnected test. The local fallback has not been manually exercised.
- Live OSM map tiles on an available internet connection.
- Geolocation success. Browser/OS location services are optional and may depend on external services or permission; do not rely on this feature for the demo.

## Connected and disconnected behavior

The frontend uses a same-origin API client (`src/lib/api.ts:3`) and Vite proxies `/api` to the loopback API (`vite.config.ts:9`). The dedicated API binds to `127.0.0.1:4000`; Vite binds to `127.0.0.1:5173`. SQLite, the API, local image processing/storage, authentication, complaint tracking and staff workflows are intended to run locally. They still require both local processes to be running.

The report page's background tiles come from OpenStreetMap (`src/pages/ReportPage.tsx:322`) and require internet. The page now displays a tile error notice and provides manual latitude/longitude fields when tiles are unavailable (`src/pages/ReportPage.tsx:324,341-365`). This preserves location input; it does not provide offline map tiles. The optional browser geolocation button may also fail without an available location provider. Fonts are bundled from local packages (`src/index.css:1-2`), icons are package-bundled, and inspected UI graphics are inline SVG. No geocoding API was found in the inspected runtime paths. Supabase-related package/legacy environment references exist in the repository, but the inspected RoadFix authentication and complaint API path uses the local server and SQLite; no active Supabase data call was found in that path.

## Manual gate before presenting

Follow the runbook without rerunning the preparation script. Complete one full connected Chrome rehearsal, including assignment and status change. Then, if time permits, disconnect Wi-Fi using Windows Quick Settings and repeat the essential local flow with the synthetic image. Restore Wi-Fi afterward. Record the generated reference locally, not in a public slide. If connected map tiles remain unavailable, present the honest offline map message and location text/coordinates; do not imply an online map is loaded.

**Readiness decision:** the isolated local assets and automated checks are ready for manual rehearsal. A live demonstration is not yet verified until a presenter completes the connected flow and confirms the essential local flow in Chrome. Map tiles require working internet; the rest of the core workflow is designed to remain local.
