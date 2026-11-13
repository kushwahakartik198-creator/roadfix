# RoadFix — Phase E, Stage 3 Final Integrated Verification

**Verification date:** 12 November 2026  
**Verdict: NOT READY**

The core software workflows inspected in this audit are implemented and the disposable-fixture regression suites pass. The Agra controlled pilot is not ready because the complete dependency audit remains blocked by registry DNS, host encryption and ACL controls are not verified, named owner decisions remain open, and there has been no real Windows file-lock rehearsal or production-like browser/API proxy smoke test. Do not collect real resident information until the launch gates in this report have evidence and the project owner gives explicit approval.

## Scope and safety

Reviewed the latest Phase E Stage 1 and Stages 2A–2E reports, Phase D final restore sign-off, root and server READMEs, `.env.example`, the Windows operations runbook, Agra provisioning guide, pilot checklist, citizen privacy notice draft, package scripts, frontend routes, API, authentication, repository, SQLite maintenance code, and related tests.

All regression checks ran against disposable test fixtures. No operational server was started. No real database, upload store, account, or resident data was accessed or changed. No bootstrap, real migration, backup, restore, BitLocker/ACL change, or `store.json` import was performed. This report is the only file created for this task; no application files or existing reports were modified.

## A. Software implementation status

**Implementation: present for the reviewed workflows, based on source inspection and automated tests.** This is not a claim that production configuration or live network operation has been verified.

| Workflow | Implementation and verification |
| --- | --- |
| Anonymous complaint submission | `/report` sends to `POST /api/issues`; API validates input/photos and repository transaction persists complaint, optional private contact, image metadata, and initial status history. Synthetic API test passes. (`src/pages/ReportPage.tsx:107-205`; `server/src/api.js:365-439`; `server/src/db/repository.js:203-238`.) |
| Public reference tracking and history | `/track` calls `GET /api/issues/:reference/track` and public `/track/history`; allowlisted tracking/history data is tested on a synthetic complaint. (`src/pages/TrackPage.tsx:11-37,64-87`; `server/src/api.js:276-291`.) |
| Admin authentication/session | `/login` uses login/session/logout endpoints; password/session code uses stored credentials and sessions, HttpOnly/SameSite cookie, CSRF, Origin, expiry and revocation checks. Synthetic API/auth tests pass. No pilot administrator was provisioned. (`src/pages/LoginPage.tsx`; `server/src/api.js:156-192`; `server/src/auth/`.) |
| Ward and officer management | `/admin` creates wards and staff and manages officer ward assignment; API gates management by admin role and mutation protections. Synthetic API tests verify ward/account creation and officer denial. (`src/pages/AdminPage.tsx:83-275`; `server/src/api.js:213-256`.) |
| Complaint assignment | Admin dashboard calls admin-only `POST /api/issues/:id/assign`; repository validates active same-ward assignment and records history. Synthetic API test passes and rejects wrong-ward assignment. (`src/pages/AdminPage.tsx:277-324`; `server/src/api.js:334-343`; `server/src/db/repository.js:269-287`.) |
| Unassigned officer view | Backend returns only reference, status, category, ward ID and submission date for unassigned same-ward rows; UI renders a restricted summary. API test checks exact keys and absence of description, coordinates, contacts, notes and photo fields. (`server/src/db/repository.js:115-133`; `src/pages/OfficerPage.tsx:138-158`.) |
| Assigned officer management/status history | `PATCH /api/issues/:id` requires staff session, valid Origin/CSRF and (for officers) matching ward and assignment. Repository enforces transitions and writes status history. Tests cover assigned updates, unassigned/wrong-ward denial, transition restrictions and admin reopen. (`server/src/api.js:349-363`; `server/src/db/repository.js:239-267`.) |
| Private contacts and photos | Scoped authenticated contact/photo endpoints permit authorized admins and assigned officers. Contact reads are audited; private responses are no-store. Tests cover allowed access and anonymous/unassigned/wrong-ward denial. (`server/src/api.js:300-333`; `server/src/db/repository.js:164-201`.) |
| Unauthorized/protected operations | API revalidates session and role; mutations validate Origin and CSRF; caller-supplied identity headers do not grant access. Tests cover unauthenticated, spoofed, wrong-role, wrong-ward and missing-CSRF requests. (`server/src/api.js:492-503`; `src/features/auth/RequireAuth.tsx`.) |
| Backup-set creation/verification | `db:backup-set` requires explicit stopped-server attestation and creates a timestamped DB/uploads/manifest set with hash verification and exclusive creation. Maintenance tests use synthetic SQLite DBs and files for success, empty uploads, hashes, collision, injected copy/verification failures and partial preservation. (`server/src/db/maintenance.js:148-244`; `server/src/db/maintenance-cli.js`; `server/package.json:14`.) |
| Restore CLI and integrity | `db:restore` reports leftover recovery paths; restore commit follows target verification and post-commit cleanup failures do not roll back the new DB. `db:integrity` checks SQLite integrity and foreign keys. Maintenance tests cover restore, rollback/quarantine errors, recovery reporting, cleanup, and integrity with disposable DBs. No operational restore was run. (`server/src/db/maintenance.js:281-441`; `server/src/db/maintenance-cli.js`.) |

SQLite tables involved include `wards`, `users`, `user_credentials`, `sessions`, `officers`, `complaints`, `complaint_private`, `complaint_images`, `complaint_status_history`, `schema_migrations`, and `admin_audit_log` (migrations under `server/src/db/migrations/`). Default paths are `server/data/roadfix.sqlite` and `server/data/uploads/` (`server/src/db/database.js:8`; `server/src/api.js:15`).

## B. Automated verification results

| Check | Result |
| --- | --- |
| Full backend: `npm test --prefix server` | **70 passed, 0 failed**: 58 database/auth/import/maintenance tests and 12 API integration tests. |
| Full frontend: `npm test` | **50 passed, 0 failed** across 9 test files. Existing React `act(...)` warnings appeared; an inactive Supabase helper test printed its missing-credentials diagnostic. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| Production build: `npm run build -- --outDir <temporary directory>` | Passed; 2,167 modules transformed. Vite emitted its non-fatal warning for a 634.29 kB minified JS chunk, above the 500 kB advisory threshold. |
| `git diff --check` | Passed, exit 0. Git emitted working-copy LF-to-CRLF notices. |

Tests use synthetic fixtures and do not establish operational account provisioning or live network behavior. The API test harness dispatches synthetic requests directly to `createApiHandler`; it does not bind a listening socket or traverse a real browser, HTTPS endpoint, or reverse proxy. Frontend tests use Vitest/jsdom. Therefore a production-like browser/API proxy smoke test is **NOT VERIFIED**.

## Dependency audit

Attempted all four checks: `npm audit --omit=dev` and `npm audit --json` in both repository root and `server/`. All failed with exit code 1 before receiving advisories because `registry.npmjs.org` could not resolve (`getaddrinfo ENOTFOUND` at the npm bulk advisory endpoint). JSON output contained the registry request error, not vulnerability records. **The full dependency audit is incomplete; this report does not claim the dependency tree is clean.**

The Phase E Stage 2A report records `sharp@0.35.5` as outside the two previously identified Sharp advisory ranges and retains `better-sqlite3@12.11.1`. That addresses the known Sharp version issue as documented, but it does not answer the current complete advisory status for root or server dependencies. Rerun and triage successful audits once registry access returns.

## Documentation consistency

- Root and server README commands match the current root and server package scripts. They no longer describe JSON-store application data, `X-Officer-Id`, or obsolete `server:dev` startup.
- Paired backup examples use the implemented `--database`, `--uploads`, `--directory`, and `--confirm-server-stopped` options. Documentation correctly explains the flag is an operator attestation, not process detection.
- Restore documentation requires overwrite confirmation for an existing target, explains the safety backup and recovery-file output, and distinguishes database restore from separate matching uploads recovery.
- The privacy notice is marked draft/do not publish, has owner/contact placeholders, states complaint retention is undecided, makes no legal-compliance or per-file encryption claim, and distinguishes the proposed backup schedule from complaint-data retention.
- Windows runbook examples use placeholders and make no claim that BitLocker or ACLs have been configured. No such commands were executed.
- Supabase packages/helper/configuration remain. Current application data and authentication use the local API and SQLite; Supabase is retained legacy/inactive code for the active app path. The example labels it accordingly and contains no real secrets or staff data.

## C. Host-machine configuration still required

These are not proven by repository code or documentation and were not performed here:

- Verify actual Windows edition and encryption capability. Enable/verify BitLocker on every fixed volume holding live data and backups, and BitLocker To Go on removable backup media. Record `manage-bde -status` evidence and test separately controlled recovery-key retrieval.
- Configure least-privilege NTFS access for application code, database, uploads and backup destinations; verify effective access for service, backup operator, administrators and an ordinary user.
- Approve actual live DB/upload paths, separate backup destination, encrypted external copy and media custody.
- Configure production service identity/supervision, firewall, HTTPS termination, exact browser origins, proxy, secure cookie path, logs, disk monitoring and escalation. Code validation requires production HTTPS CORS origins and enables Secure cookies (`server/src/security-config.js:4-32`), but the repository does not provide the Windows service, TLS terminator, or operational monitoring.
- Perform the production-like browser/API proxy smoke test through the intended deployment. API-handler tests are not an equivalent network/browser test.
- Perform a real competing-process SQLite WAL/SHM lock rehearsal on synthetic data. Phase D sign-off says filesystem failures are injected deterministically; no external process holds a Windows sidecar open in the tests.

## D. Owner approval still required

- Named primary and alternate operators, backup/media custodians, Windows administrator, privacy contact, and incident/escalation contacts.
- Actual drive/path locations and approved encrypted external-copy custody.
- Backup retention approval and a manual secure deletion procedure. No automatic pruning/deletion is implemented.
- Separate resident complaint-data retention/deletion policy.
- Final privacy notice wording, operator identity/contact, local-language translation, and verified safeguards.
- Approval of actual permitted administrator/officer access, monitoring/log ownership, free-space thresholds and recovery procedures.
- Formal controlled-pilot authorization after receipt/review of the evidence below.

## E. Conditions before collecting real resident information

1. **Developer/security owner:** when registry DNS works, run root and server audits successfully; identify, triage, and fix or formally disposition every production finding. Retain command output. Do not call a failed audit clean.
2. **Windows administrator:** verify device/volume capability; enable and verify the approved fixed-volume and removable-media encryption; test recovery-key retrieval through separately controlled custody.
3. **Windows administrator:** set and test least-privilege ACLs on actual data/uploads/backups; demonstrate ordinary-user denial and necessary service/backup-operator access.
4. **Project owner:** approve real paths, backup-copy custody, backup retention, separate complaint retention, privacy notice/translation, contact/access policy, and monitoring/escalation; name primary and alternate operators.
5. **Developer + Windows administrator/operator:** rehearse a competing process holding a SQLite WAL/SHM file on the intended Windows filesystem using synthetic data; document safe failure and preservation of all files.
6. **Deployment engineer/operator:** exercise the production-like HTTPS browser/API/proxy path on a non-resident test environment. Test anonymous report and tracking, login/session/logout, CSRF/Origin, ward/officer workflows, authorized/private contact and photo access, denied access, secure cookies and configured request/upload behavior.
7. **Primary + alternate operators:** run an offline serialized paired backup/recovery drill on synthetic database and photos. Verify manifest and external copy hashes, SQLite integrity, separate upload restoration, recovery-file handling, and restart decision steps.
8. **Provisioning operator + project owner:** only after the gates above, use authoritative owner-supplied Agra wards/staff data to provision accounts and perform a final synthetic workflow/access rehearsal in an isolated approved target. No pilot DB or real accounts were created in this audit.
9. **Project owner:** review and accept the evidence and explicitly authorize controlled-pilot launch in writing. Until then, do not collect resident information.

## Prioritized launch checklist and responsible party

| Priority | Outstanding action | Responsible party | Completion evidence |
| --- | --- | --- | --- |
| P0 | Complete audits and disposition production dependency findings | Developer/security owner | Successful root and server audit outputs and triage record |
| P0 | Verify Windows edition, encrypt live and backup volumes, rehearse key recovery | Windows administrator + custodians | `manage-bde -status` evidence and successful retrieval rehearsal |
| P0 | Configure/test least-privilege NTFS ACLs | Windows administrator | Effective-access review for service, backup operator, admin and ordinary user |
| P0 | Approve paths, external media/custody, separate retention policies, privacy notice, named roles and escalation | Project owner | Approved operations record, finalized notice and named primary/alternate |
| P0 | Complete real Windows file-lock and production-like browser/API proxy smoke tests | Developer/deployment engineer + Windows administrator/operator | Test records using synthetic data; safe lock-failure evidence |
| P0 | Complete offline paired backup and restore drill | Primary/alternate operators, witnessed by Windows administrator | DB integrity, photo hash comparison, recovery path and restart records |
| P0 | Provision with authoritative data and conduct final synthetic workflow only after controls pass | Provisioning operator + project owner | Access/workflow record; no invented ward or staff details |
| P0 | Approve launch | Project owner | Explicit written authorization after reviewing all preceding evidence |

## Readiness decision

**NOT READY.** The software implementation and automated tests provide useful evidence, but they do not verify the machine that will hold resident data. The incomplete npm audit, unverified Windows encryption/ACLs, untested real Windows sidecar lock behavior, absent production-like proxy smoke test, and unresolved owner decisions are material launch gates. Reassess after the prioritized checklist is completed; this audit finds no need to redesign the application architecture.
