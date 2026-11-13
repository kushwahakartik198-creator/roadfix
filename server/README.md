# RoadFix Node.js API

The API uses local SQLite (`better-sqlite3`) and the RoadFix authentication/session implementation. It does not use Supabase for current application data or authentication. Supabase package and legacy files remain in the repository but are inactive for the current API/frontend path.

## Install and run

From the repository root:

```powershell
npm ci
npm ci --prefix server
npm run server
```

The API defaults to `127.0.0.1:4000`. To run the frontend and API together locally, use `npm run dev:full`; the Vite development server is at `http://127.0.0.1:5173` and proxies `/api` to the API. Do not run the normal server startup against a production database during development: startup opens the default database and applies pending migrations.

Node.js 20 or newer is declared by `server/package.json`; use Node.js 24 for the currently documented project baseline.

## Configuration

Variables actually read by current code:

| Variable | Purpose |
| --- | --- |
| `ROADFIX_SECURITY_MODE` | `local` or `production`; the root launcher sets `local` for development/test when unset. Production Node mode defaults to production security mode. |
| `NODE_ENV` | Affects security-mode default and must not be `production` with local security mode. |
| `HOST` | API bind host; default `127.0.0.1`. Local mode permits loopback only. |
| `PORT` | API port; default `4000`. |
| `CORS_ORIGINS` | Comma-separated exact origins. Production requires one or more HTTPS origins with no paths or wildcard. |
| `UPLOAD_STORAGE_MAX_BYTES` | Optional upload storage quota in bytes; defaults to 500 MiB and must be at least 5 MiB. |

The browser optionally reads `VITE_API_URL` (empty means same-origin API requests). Vite reads root `.env` files for frontend variables; the Node server reads its settings from the process environment and does not load `.env` itself, so configure server values in the Windows service/launcher environment. Production needs a correctly configured HTTPS edge/reverse proxy, a deliberate bind host, matching exact `CORS_ORIGINS`, and secure cookies. This repository does not set up TLS, a Windows service, firewall rules, or proxy trust. Review `.env.example` and the Windows operations runbook. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are retained as legacy/inactive configuration for this application path.

## Data locations

- Default database: `server/data/roadfix.sqlite`.
- Default private image storage: `server/data/uploads/`.
- Schema migrations: `server/src/db/migrations/`; normal startup applies pending migrations.

Reporter contact details are held separately in SQLite. Complaint images are stored on disk and referenced in SQLite. Backups must include both the database and corresponding uploads. Database restore is not photo recovery. Protect both locations and every backup copy with owner-approved Windows encryption and ACLs before a pilot.

## Authentication and API

Staff use email/password login at `POST /api/auth/login`; the API returns a CSRF token and sets an HttpOnly, SameSite=Lax session cookie (Secure in production). Session lookup is `GET /api/auth/session`; logout is `POST /api/auth/logout`. Sessions have 8-hour absolute and 30-minute idle limits. Mutations require an allowed Origin and valid CSRF token. Backend role, ward and assignment checks remain authoritative.

Residents can submit complaints at `POST /api/issues` without signing in and track by reference at `GET /api/issues/:reference/track` and `/track/history`. Public endpoints expose only public projections. Admin operations include `/api/wards`, `/api/admin/accounts`, `/api/admin/audit`, and complaint assignment. Officers access operational complaint routes through authenticated `/api/issues` and related routes; private contacts and photos are protected. Do not expose `server/data/uploads` through a static web server.

The first admin is provisioned once using the interactive command below. It opens the default database, applies migrations, prompts for the email, and reads the password without echo; use only on the prepared pilot machine and target database:

```powershell
npm --prefix server run auth:bootstrap-admin
```

The bootstrap tool refuses a second initial admin. There is no CLI database-path option for this command; the active database is the fixed default path above. Ward setup and later account provisioning are done by an administrator in the application.

## Maintenance

From the repository root, complete paired database-and-photo backup sets with an explicit destination and stopped-writer attestation:

```powershell
npm --prefix server run db:backup-set -- --database "C:\RoadFix\server\data\roadfix.sqlite" --uploads "C:\RoadFix\server\data\uploads" --directory "E:\RoadFixBackup\Daily" --confirm-server-stopped
```

The flag is not process detection. The command verifies the database and upload hashes in its manifest but does not encrypt, copy to a second drive, or delete old backups. For integrity, use `npm --prefix server run db:integrity -- "<database-path>"`. For database-only restore, use `npm --prefix server run db:restore -- "<verified-database-backup>" --database "<target-database>" --confirm-overwrite`; it is offline and serialized. The restore creates a safety backup for an existing target. Restore the matching photos separately and follow any recovery-path warning before restarting.

Other package scripts include `npm --prefix server test`, `npm --prefix server run test:db`, and `npm --prefix server run test:api`. The `seed` and `reset` scripts are not pilot-operational procedures; do not use them on pilot data. See the Windows runbook and pilot checklist for custody, recovery, and escalation practices.
