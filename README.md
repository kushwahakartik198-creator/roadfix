# RoadFix

RoadFix is a civic reporting application for residents to report road problems and for authorized administrators and ward officers to manage complaints. It is a community project and is not an official government service.

## Architecture

- React, TypeScript, Vite frontend.
- Node.js HTTP API.
- Local SQLite database using `better-sqlite3`; the default file is `server/data/roadfix.sqlite`.
- Uploaded complaint images are stored under `server/data/uploads/` by default and served only through authenticated API routes.
- Supabase code, package and configuration files remain in the repository for legacy reasons. The current application uses the local API, SQLite and RoadFix session authentication; it does not use Supabase for application data or authentication.

## Requirements and installation

Use Node.js 24 (the project has been exercised on Node 24); the server package declares Node.js 20 or newer. Use a supported npm release supplied with Node.js.

```powershell
npm ci
npm ci --prefix server
```

## Local development

Create no production data for development. Start both local services from the repository root:

```powershell
npm run dev:full
```

Vite listens on `http://127.0.0.1:5173` and proxies `/api` to the local API on port 4000. To run only the API, use `npm run server`; to run only Vite, use `npm run dev`. Ctrl+C stops the development launcher. Local security mode is loopback-only.

## Tests and quality checks

Run at the repository root:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Backend tests use the server package:

```powershell
npm --prefix server test
npm --prefix server run test:db
```

The test suites use disposable fixtures. Never point test tooling at an operational database.

## Application workflows

- Residents can submit a complaint without signing in and track progress using its reference.
- Public ward browsing and tracking return public projections; private reporter contact data and uploaded photographs use protected routes.
- Staff sign in at `/login`. Sessions use an HttpOnly, SameSite=Lax cookie with CSRF protection on mutations, Origin checks, role and ward authorization, and idle/absolute expiration.
- `/admin` is restricted to administrators. Administrators can create wards and staff accounts, set an officer's ward, view audit information, and assign complaints.
- `/officer` is protected. Officers see their own ward's restricted summaries and operational details for complaints assigned to them; only an assigned officer can update a complaint's status.
- Initial administrator provisioning is a one-time interactive operation described in [the Agra pilot provisioning guide](docs/agra-pilot-provisioning-guide.md). Do not put a password on a command line.

## Environment configuration

See [.env.example](.env.example). `VITE_API_URL` is optional; when empty the browser uses the same origin. Production API deployments require `ROADFIX_SECURITY_MODE=production`, at least one exact HTTPS origin in `CORS_ORIGINS`, HTTPS at the user-facing edge, secure cookies, and an explicitly reviewed host/bind and reverse-proxy setup. The repository does not configure TLS termination or production service hosting.

Supabase variables in the example are marked legacy/inactive for the current application. Do not add secrets to `VITE_` variables.

## Database, uploads, and maintenance

The default SQLite file and uploads directory are under `server/data/`. The application creates/opens the database and applies migrations on normal server startup. Do not use the development launcher against pilot data. Protect the data directory and backups with approved Windows volume encryption and least-privilege NTFS permissions before accepting resident information.

Create a complete database-and-photo backup set only while RoadFix and all other SQLite writers are stopped. From the repository root, supply explicit absolute paths and an external destination:

```powershell
npm --prefix server run db:backup-set -- --database "C:\RoadFix\server\data\roadfix.sqlite" --uploads "C:\RoadFix\server\data\uploads" --directory "E:\RoadFixBackup\Daily" --confirm-server-stopped
```

The flag is operator attestation; the command does not detect processes. The command creates and verifies a timestamped set with a SHA-256 manifest, but does not encrypt it, copy it to external media, or prune old sets. Read the [Windows operations runbook](docs/roadfix-windows-operations-runbook.md) and [backup protection plan](docs/phase-e-stage-2d-backup-protection-plan.md).

Integrity check:

```powershell
npm --prefix server run db:integrity -- "E:\RoadFixBackup\Daily\<backup-set>\database\<database-file>.sqlite"
```

Restore is an offline, serialized, database-only operation. It requires the target overwrite flag if a target already exists and produces a safety backup before displacing an existing target. Restore does not restore uploads; recover the paired `uploads` directory separately. Review every recovery-file warning and do not delete recovery files without checking them. Follow the sign-off and runbook before any operational restore.

## Operational status

Phase E Stage 1 reported **NOT READY** pending dependency audit completion and operational decisions. The Sharp version was updated, but a complete npm audit could not be verified because registry DNS failed. Windows competing-process lock rehearsal, encryption capability, ACLs, storage locations, retention approvals, data retention policy, and named operational owners still require resolution. Documentation does not itself approve a pilot or establish compliance.

See [pilot operations checklist](docs/roadfix-pilot-operations-checklist.md), [privacy notice draft](docs/citizen-privacy-notice-draft.md), and [provisioning guide](docs/agra-pilot-provisioning-guide.md). The privacy notice is a draft and must not be published until approved.
