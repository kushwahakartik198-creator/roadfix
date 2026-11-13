# RoadFix Pilot Operations Checklist

Use named people and owner-approved contact channels in the controlled operations record. This checklist is not a legal compliance checklist. Do not place passwords, recovery keys, or resident details in general logs.

## Daily startup

- [ ] Primary operator records date, time, name, and service host.
- [ ] Verify the approved data and uploads directories exist and are on the expected protected volume.
- [ ] Confirm volume protection and expected external-media lock/custody state; check for unexpected device/path changes.
- [ ] Check free space on live, local backup, and external backup volumes using File Explorer or `Get-Volume`.
- [ ] Review last shutdown, Windows service/application logs, errors, failed sign-ins, disk alerts, and backup ledger.
- [ ] Start only the approved service configuration. Check API health at `/api/health`; confirm the UI is HTTPS and login works for an authorized operator.
- [ ] Verify no unexplained database, upload, ACL, or account changes before accepting reports.

## Daily shutdown and backup verification

- [ ] Stop report intake according to the pilot operating procedure; stop the RoadFix service cleanly.
- [ ] Confirm all SQLite writers and processes that might update uploads are stopped. The backup flag does not detect them.
- [ ] Create a paired backup set to the approved destination with `npm --prefix server run db:backup-set -- --database "<ROADFIX_DATA_DIR>\roadfix.sqlite" --uploads "<ROADFIX_DATA_DIR>\uploads" --directory "<BACKUP_ROOT>\Daily" --confirm-server-stopped`.
- [ ] Confirm command success; record set path, time, operator, SQLite integrity and file count/bytes. Review manifest and all photos expected for the period.
- [ ] Copy the entire set to the approved encrypted external drive; compare database and upload hashes/paths against the manifest; run `npm --prefix server run db:integrity -- "<COPIED_SET>\database\<DATABASE_FILE>.sqlite"`.
- [ ] Lock/eject the drive, record custodian and location, and confirm at least one verified recovery copy remains available. Do not overwrite or automatically delete any set.
- [ ] If any check fails, preserve incomplete files and errors; follow **Failed backup** below. Restart only when the source is safe and approved.

## Free-space, access, and operational monitoring

- [ ] Record free space for every relevant volume daily. The backup plan suggests an initial alert threshold of less than 20% free or less than 10 GB, whichever occurs first; owner must validate threshold against expected volume sizes.
- [ ] Confirm database and uploads remain available and expected photo file count/size has not changed unexpectedly.
- [ ] Review local service and Windows logs for startup/shutdown failures, repeated API failures, failed logins, unauthorized access reports, and storage errors. Central monitoring/alerting is not provided by this repository; named monitoring ownership remains open.
- [ ] Confirm only named operators have access to database, uploads, backup media, and keys. Recheck access after staff/device changes.

## Unauthorized-access or privacy incident

1. Notify the primary operator and owner-designated incident contact using approved channels. If primary is unavailable, the alternate acts and records the escalation.
2. Restrict access to the affected host, account, or media without destroying evidence. Preserve relevant files, logs, timestamps, and custody records; do not email resident data or keys.
3. If backup media is lost, record its label, last custodian/location, last verified encryption/lock status, and discovery time. Do not assume the data is encrypted unless the device/volume status was verified.
4. Suspend affected accounts or service access through the approved administrator process where appropriate. Preserve audit information and request a Windows/security review.
5. The owner determines communication, investigation, and any required external response. Do not make legal or compliance claims based on this checklist.

## Failed backup

- Stop and preserve the exact console output, timestamp, destination and all incomplete-set paths. Do not delete or reuse the partial set.
- Confirm the live database/uploads are unchanged, check space, mount/lock state, ACLs, and Windows/storage errors.
- Escalate to the primary custodian; alternate operator takes ownership if unavailable. Retry only to a new unique destination after cause review and approval. Do not rotate older verified sets to make space.
- If no verified set can be made, notify the owner before accepting further pilot data or follow the owner-approved pause procedure.

## Failed restore

- Keep RoadFix and every SQLite writer stopped. Do not open candidate/original files or attempt a second restore.
- Preserve the complete error and every path it lists: target, candidate, staged, displaced database, sidecars, safety backup, and recovery/quarantine paths. Do not overwrite or delete any of them.
- Follow the exact manual recovery instructions in the error and Phase D final sign-off. Candidate artifacts must be moved to unique unused quarantine names before restoring original sidecars; original WAL/SHM return before original database. If any move fails, stop and keep the original database displaced.
- Escalate to the primary custodian and an independent second operator. Verify restored database integrity and the matching upload tree/hashes before restart. If the paths or file identities are uncertain, use qualified SQLite/Windows recovery assistance.

## Roles and escalation

| Role | Required responsibility | Owner-provided identity/contact |
| --- | --- | --- |
| Primary operator/data custodian | Daily start/stop, backup completion, first escalation, records custody | **[OWNER TO COMPLETE]** |
| Alternate operator | Coverage, independent review, escalation when primary unavailable | **[OWNER TO COMPLETE]** |
| Backup/media custodian | Protected drive custody, key access procedure, transfer log | **[OWNER TO COMPLETE]** |
| Windows/service administrator | Host, service identity, encryption, ACLs, HTTPS/edge, system logs | **[OWNER TO COMPLETE]** |
| Privacy/incident contact | Review privacy issues and direct owner response | **[OWNER TO COMPLETE]** |

## Pre-launch owner approval

- [ ] Actual Windows edition and BitLocker/Device Encryption capability verified.
- [ ] Live database, uploads, local backup, and external backup volumes and paths approved.
- [ ] Service account, backup operator, primary/alternate identities and access reviewed.
- [ ] Recovery-key custody and tested retrieval approved.
- [ ] Backup retention schedule approved; no automatic deletion is implemented.
- [ ] Resident complaint-data retention policy approved separately from backup retention.
- [ ] Citizen privacy notice approved; draft not published before approval.
- [ ] HTTPS, exact production origins, firewall, service supervision, log ownership, and escalation contacts reviewed.
- [ ] npm audit rerun successfully when registry access is available; current npm audit was incomplete due to registry DNS failure.
- [ ] Real Windows competing-process SQLite sidecar lock rehearsal completed and documented.
- [ ] Offline serialized restore drill completed with paired photos and recovery-path handling.
- [ ] Synthetic complaint workflow/access test completed in an isolated environment.
- [ ] Owner gives explicit written approval for controlled pilot start.
