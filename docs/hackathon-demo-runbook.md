# RoadFix Hackathon Demo Runbook

Use this runbook with the already-prepared synthetic demo. It is isolated from the default database. **Do not rerun the preparation script**: it intentionally refuses to reuse the existing demo folder.

## Before starting

1. Open PowerShell in the repository root: `C:\Users\kushw\roadfix`.
2. Use the same Windows account that prepared the demo. The random demo passwords are protected with Windows DPAPI for that account.
   - Administrator email: `demo-admin@roadfix-demo.invalid`
   - Officer email: `demo-officer@roadfix-demo.invalid`
3. Keep the credential file local. To display it in a private PowerShell window, run:

   ```powershell
   Add-Type -AssemblyName System.Security
   $credentialFile = '.\server\data\hackathon-demo\credentials.local.dpapi.txt'
   $encoded = (Get-Content $credentialFile -Raw).Trim()
   $protected = [Convert]::FromBase64String($encoded)
   $plain = [Security.Cryptography.ProtectedData]::Unprotect(
     $protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser
   )
   [Console]::WriteLine([Text.Encoding]::UTF8.GetString($plain))
   ```

   Use the displayed administrator and officer credentials only in the local demo. Do not paste passwords into this report, source files, chat, slides, or screenshots. DPAPI decryption requires the same Windows user profile; if that profile is unavailable, stop rather than recreate or reset the demo database.

## Start the isolated demo

Open two PowerShell windows in the repository root. Do not use `npm run dev:full` or `npm run server`: those start the normal server path, which opens `server/data/roadfix.sqlite` and may apply migrations.

**PowerShell window 1 — isolated SQLite API:**

```powershell
node .\server\scripts\hackathon-demo-server.js
```

Wait for:

```text
[RoadFix] SQLite API running at http://127.0.0.1:4000
```

**PowerShell window 2 — frontend:**

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Wait for Vite's `Local: http://127.0.0.1:5173/` message.

Open these exact local URLs in Chrome:

- App: `http://127.0.0.1:5173/`
- Citizen report: `http://127.0.0.1:5173/report`
- Public tracking: `http://127.0.0.1:5173/track`
- Staff login: `http://127.0.0.1:5173/login`
- Admin: `http://127.0.0.1:5173/admin`
- Officer: `http://127.0.0.1:5173/officer`
- Local health endpoint: `http://127.0.0.1:4000/api/health`

Use `127.0.0.1` consistently. The server's local security configuration allows the frontend's `127.0.0.1:5173` origin. The API should only be reachable on loopback.

## Fictional seed records

The local demo already has the five records below in the `Synthetic Agra Demo Ward`:

| Fictional road label | Severity | Starting status | Assignment |
| --- | --- | --- | --- |
| Fictional Demo Road Alpha | High | Submitted | Unassigned (use this in the admin assignment demonstration) |
| Fictional Demo Road Bravo | Medium | Under review | Demo officer |
| Fictional Demo Road Charlie | High | Verified | Demo officer |
| Fictional Demo Road Delta | Low | In progress | Demo officer |
| Fictional Demo Road Echo | Medium | Resolved | Demo officer |

All are fictional, use generic demo-center coordinates, and have no reporter identity/contact or personal photographs. The local image fixture at `server/data/hackathon-demo/synthetic-pothole.png` is a generated synthetic graphic suitable for demonstrating upload. Do not present the fictional road labels as real Agra roads or ward boundaries.

## Recommended live sequence: citizen → admin → officer → citizen

1. **Citizen submission:** open `/report`. Select `Synthetic Agra Demo Ward`. For the location text use `Fictional Demo Road Foxtrot — synthetic hackathon example`. Choose a pothole, select a severity, and describe only fictional damage. Leave reporter name/contact blank. Attach `server/data/hackathon-demo/synthetic-pothole.png`. If online map tiles are unavailable, use the displayed coordinate fields and the fictional location text; do not claim a map is loaded. Review and submit.
2. **Record the reference:** copy the generated `RF-AG-...` reference into a private presenter note. It is synthetic but still avoid putting it on public slides.
3. **Citizen tracking:** open `/track`, enter that reference, and confirm the initial `submitted` status and history.
4. **Admin review and assignment:** open `/login`, use the local demo administrator credentials, and verify `/admin` loads. Locate the new Foxtrot complaint and assign `Demo Officer`. Confirm the admin dashboard's total/status counts changed.
5. **Officer update:** log out through the app. Sign in with the local demo officer credentials and verify `/officer` shows the assigned Foxtrot complaint in the synthetic ward. Change its status from `submitted` to `under_review` and save.
6. **Citizen confirms:** log out, open `/track`, enter the same reference, and confirm `under_review` and the status history. Return to `/admin` only after re-authenticating as admin if you want to show the changed statistics.

The starting reference is generated when the live report is submitted; it is not preprinted in this runbook. Do not promise that this sequence passed before manually completing it in Chrome.

## Internet requirements

- **Needs internet:** background map tiles from `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. The current environment could not resolve the OSM tile hostname, so connected tile behavior must be checked on the demonstration connection.
- **Optional and may need network/location services:** browser geolocation. Do not request browser location permission for a fictional demo; use the synthetic ward coordinates or manual coordinate fields.
- **Local/offline by design:** frontend served from localhost, `/api` requests through Vite's local proxy, SQLite, account login/session handling, complaint submission/tracking/status, assignment, local image processing, local uploads, fonts, and bundled icons. Both local processes must remain running.
- No geocoder or remote font/image service is required by the inspected core flow. The synthetic upload is local.

## Manual Chrome checks (no browser automation)

1. Manually type `http://127.0.0.1:5173/` into Chrome. Confirm the page renders and the address remains loopback.
2. Check `/api/health` in a new tab. Confirm a successful local health response. If it fails, verify the API terminal still shows its listening message.
3. Complete the citizen → admin → officer → citizen sequence above. Verify each displayed status/reference and changed count yourself. Do not rely on the UI's mere presence as proof.
4. On `/report`, verify whether the map tiles visibly load. If they do not, confirm the page reports unavailable tiles and that the coordinate fields and location text remain usable. Do not call the blank map an offline map.
5. Close only the demo tabs after rehearsal; do not clear or reset application data.

## Disconnected-mode rehearsal

Perform this only after the connected rehearsal and only if you can restore the network yourself. This is a **read-only fallback smoke check**: do not submit a report, log in, assign, update status, or upload while disconnected. Those actions can write to the demo database or uploads. Use the reference from the completed connected rehearsal.

1. Save any needed demo reference in a private note. Keep both localhost processes running.
2. Note which Wi-Fi network is connected, then disconnect Wi-Fi using Windows Quick Settings. Do not change proxy, firewall, BitLocker, or other host security settings.
3. In Chrome, use the loopback URLs above. Confirm `/`, `/api/health`, `/report`, `/track`, `/login`, and the assigned officer page still load locally.
4. Open `/report`; confirm the local ward list loads. Observe unavailable tiles and the manual coordinate inputs. Do not submit the form or choose a file.
5. Open `/track` and enter the reference from the connected rehearsal. Confirm the existing status/history loads. This is a read-only public lookup.
6. Do not log into a staff account during this strict no-mutation check: session creation/activity may write session state to SQLite. This means disconnected admin/officer mutation workflows remain unverified.
7. Reconnect the same Wi-Fi network using Quick Settings. Confirm internet is back before closing the rehearsal.

If you cannot reliably restore the connection, do not disconnect it; mark offline rehearsal not performed. No complaint, upload, session, database reset, migration, backup restore, or cleanup is needed for this check. Keep the connected reference private and do not add it to slides.

## Stop and preserve the demo

- In each terminal, press **Ctrl+C** once and wait for shutdown. The API should print `RoadFix demo server stopped cleanly.`
- Leave `server/data/hackathon-demo/` intact, including any `roadfix-demo.sqlite-wal` and `roadfix-demo.sqlite-shm` files. SQLite sidecars can be present and must not be manually deleted while the API is running. The preparation script refuses to overwrite this folder.
- Do not run the normal `server` or `dev:full` commands against this data, do not rerun preparation, and do not delete the demo folder as part of the demo. No data cleanup is required after presenting.
- If a port remains occupied, identify the process listening on port 4000 or 5173 before stopping anything. Do not terminate every Node process.

## Troubleshooting

- **Demo API refuses to start / file missing:** check that `server/data/hackathon-demo/roadfix-demo.sqlite` exists. Do not run the preparation script as a repair; preserve files and ask for help.
- **Port 4000 or 5173 is occupied:** stop only the RoadFix process that owns that port, or choose a separate coordinated configuration after rehearsal. The current Vite proxy and demo API expect 4000/5173.
- **Ward list is empty or app says server unavailable:** ensure the isolated API terminal is listening and use `127.0.0.1`, not a LAN IP or hostname.
- **Login fails:** decrypt the credential file under the same Windows account that prepared it; use the correct administrator or officer email and do not reset/bootstrap accounts.
- **Map is blank:** this is expected without OSM tile connectivity. Continue with the location description and manual coordinates. Complaint submission must not depend on tile availability.
- **Image selection fails:** select the generated local `synthetic-pothole.png`; do not use a real resident photo.
- **A live workflow fails:** stop the presentation rehearsal, keep both demo folders intact, note the screen and error, and do not rerun preparation or switch to the default database.
