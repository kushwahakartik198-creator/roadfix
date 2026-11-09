# RoadFix Local Server

A zero-dependency Node.js HTTP server backed by a file-based database (JSON store on disk). It replaces Supabase for local development and powers the fully-working user-facing features of RoadFix: ward-aware reporting, ward-based issue listing, officer triage, and public tracking.

## Run

```bash
# From the repository root
npm run server:dev
# or directly
node server/src/index.js
```

The server listens on `http://localhost:4000` by default (override with `PORT` env var).

## Data

- **Store**: `server/data/store.json` (generated on first boot from `server/src/seed.js`).
- **Uploads**: `server/data/uploads/` (citizen photos and officer repair evidence).

## Endpoints

| Method | Path                       | Auth        | Description                                       |
| ------ | -------------------------- | ----------- | ------------------------------------------------- |
| GET    | `/api/health`              | none        | Liveness probe.                                   |
| GET    | `/api/wards`               | none        | List/search municipal wards.                      |
| GET    | `/api/wards/:id`           | none        | Fetch a single ward.                              |
| GET    | `/api/officers`            | none        | List officers.                                    |
| GET    | `/api/officers/:id`        | none        | Fetch a single officer.                           |
| GET    | `/api/issues`              | none        | List/filter issues (paginated).                   |
| GET    | `/api/issues/:id`          | none        | Fetch a single issue.                             |
| GET    | `/api/issues/:id/history`  | none        | Audit trail for an issue.                         |
| GET    | `/api/issues/:ref/track`   | none        | Public tracking by reference (`RF-AG-XXXXXX`).    |
| POST   | `/api/issues`              | none        | Citizen submits a report (ward + photo).          |
| PATCH  | `/api/issues/:id`          | officer     | Transition issue status (triage workflow).        |
| POST   | `/api/issues/:id/assign`   | officer     | Assign an officer to a verified issue.            |
| GET    | `/api/stats`               | none        | Aggregate counts by status and ward.              |

> **Note:** This server is intentionally simple for local civic-tech development. Authentication is by officer `id` header (`X-Officer-Id`) for triage endpoints. In production, replace with a real auth provider.