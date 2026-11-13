# RoadFix — Phase E, Stage 2D Backup and Data Protection Plan

## Executive recommendation

Before the Agra pilot stores resident data, approve and implement a Windows storage plan covering both the SQLite database and uploaded complaint photographs. Keep the live files on a BitLocker protected fixed volume, write backup sets to a distinct protected location, and keep a second copy on rotated, offline BitLocker To Go media. Limit NTFS access to the RoadFix service account, designated backup operators, SYSTEM, and administrators. Use a manual, reviewable retention schedule; do not enable automatic deletion until a full database-and-photo restore drill and retention approval are complete.

The repository creates valid SQLite snapshots, but it does not encrypt them, include uploads, set Windows ACLs, retain/prune old backups, or protect their passwords/keys. No cloud destination is assumed or recommended here.

## Current implementation findings

| Question | Finding |
| --- | --- |
| Default database path | `server/data/roadfix.sqlite`, from `DEFAULT_DATABASE_PATH` in `server/src/db/database.js:6-8`. The CLI can target a different path with `--database`. |
| Default backup path | `server/data/backups`, from `backupDatabase()` and the CLI default (`server/src/db/maintenance.js:60-66`; `maintenance-cli.js:21-24`). It is next to the live database and normally on the same volume. `--directory` can select another path. |
| Are uploads included? | No. Photos are stored as separate files under `server/data/uploads` by default (`server/src/api.js:15,426-429`). Backup calls SQLite's online backup API for one database file; it does not copy the uploads tree. The SQLite image rows contain storage paths, so a restored DB without its corresponding files can have broken photo links. |
| Does a backup contain reporter contact information? | Yes. The backup is a complete SQLite database snapshot. Optional reporter names/contacts are stored in the `complaint_private` table (`server/src/db/repository.js:214-220`; Phase E Stage 1 report). Treat each `.sqlite` backup as personal-data-bearing. |
| Are backups encrypted? | No application-level encryption is implemented. The `.sqlite` file is plaintext at the file level. BitLocker may encrypt the volume that contains it, but that protection depends on the actual Windows volume being encrypted and locked; a copied file on another unencrypted volume is not protected by the source volume's BitLocker. |
| Can backup creation overwrite an existing file? | No. The timestamped destination is published with `COPYFILE_EXCL` (`maintenance.js:70-77`). A collision fails instead of replacing the existing file. Names use a UTC timestamp with second precision, so repeated backups in the same second can collide. |
| Does restore validate a backup? | Yes, before staging, after staging, and after promotion. `verifyDatabase()` checks the RoadFix application ID, migration metadata table, SQLite `integrity_check`, and `foreign_key_check` (`maintenance.js:20-38,134,162,189`). Restore also creates a safety backup before displacing an existing target. This validation does not check that external photo files exist or match the DB. |
| Is there backup retention or deletion? | No retention policy or old-backup pruning is implemented. Backup code only removes its temporary work file. Restore cleanup removes displaced old target files after commit, but it does not prune timestamped backups (`maintenance.js:43-51,190-198`). |
| Are Windows folder ACLs configured? | No explicit ACL/permission commands or checks exist in the inspected implementation. The code creates directories recursively and relies on Windows parent-folder inheritance. The actual deployment ACLs are unknown and must be inspected on the host. Upload storage also has no application-managed NTFS ACL setup. |

A restore overwrite safety backup is created in the target database's directory (`maintenance.js:169-177`), even when the operator's input backup came from a separate drive. It is useful for immediate rollback, but it is not an independent backup copy and inherits the target directory's volume and ACL risks. The Stage 3 report and Stage 1 audit likewise record that backups were unencrypted, not pruned, and left to operator storage controls.

## Recommended controlled-pilot policy

### A. Encryption

1. **Encrypt the host's OS volume and every fixed data volume that holds the live database or uploads.** Verify status rather than assuming Windows Device Encryption or BitLocker is enabled. Microsoft documents manual BitLocker Drive Encryption for Windows Pro, Enterprise, and Education; Windows Device Encryption may be available on some Home devices, but its coverage does not include removable USB drives. Check the edition and volume state before accepting complaint data. [Microsoft BitLocker support](https://support.microsoft.com/en-au/windows/security/encryption/bitlocker-drive-encryption), [Device Encryption in Windows](https://support.microsoft.com/en-us/windows/security/encryption/device-encryption-in-windows)
2. **Use BitLocker To Go for removable backup drives.** Encrypt each external drive before writing any RoadFix data. Do not rely on device encryption to protect USB drives. BitLocker To Go is Microsoft's BitLocker option for removable data drives, including external hard disks and USB flash drives. [Microsoft BitLocker FAQ](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/bitlocker-overview-and-requirements-faq)
3. **Do not add custom cryptography.** Application-level encryption is not essential for the pilot if every working and backup copy remains on approved BitLocker protected volumes, access is restricted, and removable copies are encrypted before data is written. BitLocker protects a volume, not an individual `.sqlite` file. If a backup must leave that volume as a standalone file or go onto media BitLocker cannot protect, pause and obtain an approved encrypted-container/archive solution before copying it. There is no such file-encryption feature in RoadFix.
4. **Check and record status.** In an elevated PowerShell or Command Prompt, run `manage-bde -status C:` (and the actual data/backup drive letters, for example `manage-bde -status D:` and `manage-bde -status E:`). Confirm `Percentage Encrypted: 100%` and `Protection Status: Protection On`; retain the result in the protected operations log without recording keys. Microsoft documents `manage-bde -status` as reporting encryption percentage, method, protection and lock status. [manage-bde status](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/manage-bde-status)
5. **Back up BitLocker recovery information separately.** Store recovery material in an owner-approved offline controlled location, separate from the removable media it unlocks and separate from the computer. Restrict it to the named primary and alternate custodian. Never put a recovery key/password in the backup folder, backup log, script, or a note attached to the drive. Test key retrieval before relying on encrypted backups.

If the pilot computer is Windows Home without eligible Device Encryption, or Group Policy blocks removable-drive encryption, the recommendation cannot be met using those features. The owner must provision a Windows edition/device or an approved encrypted storage solution; do not describe plaintext backup files as protected.

### B. Storage and access

- **Live data:** keep the database and `server/data/uploads` together under a dedicated RoadFix data directory on a BitLocker protected fixed volume. Preserve their relative paths. Do not put uploads under a public web root.
- **Primary backup copy:** use a separate backup destination, preferably a different physical device or at least a separate protected volume. A second folder/partition on the same physical disk protects against accidental overwrite but not disk failure or loss of the host. The default `server/data/backups` is not a sufficient separate copy.
- **Protected external copy:** maintain two labeled BitLocker To Go drives in rotation. After creating and verifying a set, copy the database and matching uploads to the second encrypted drive, verify the copies, eject/lock the drive, and store it in a locked cabinet. Keep one copy disconnected. An off-site copy may be used only if the owner explicitly approves the location and custody; no third-party/cloud service is assumed.
- **Back up a complete set:** use `npm run db:backup-set` with explicit database, uploads, destination, and `--confirm-server-stopped` paths. The CLI creates a timestamped set, runs the existing verified SQLite backup, copies photos, writes a SHA-256 manifest, and verifies the copied set. The flag is an operator attestation and does not detect writers. Resume the service only after the command and any external copy checks pass.
- **Least privilege:** use a dedicated non-interactive service account for RoadFix. It needs Modify on the live DB and uploads folders (SQLite must create/update WAL/SHM sidecars and the app writes photos). It does not need access to external/offline backup drives. The backup operator needs Read access to the live data and Modify on the backup destination; ordinary officers and users should have no filesystem access. SYSTEM and local Administrators retain management access. Keep backup destinations outside the app-writable data tree.
- **Inspect actual ACLs before changes:** run `icacls "C:\RoadFix\server\data"` and `icacls "E:\RoadFixBackup"` after substituting the actual paths. Windows NTFS DACLs are the access control mechanism; Microsoft documents `icacls` for displaying/modifying them and inheritance. [icacls reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
- **Example ACL pattern only:** after confirming exact host/account names and testing in a non-production folder, an administrator could establish a restrictive data-folder ACL with a command such as `icacls "C:\RoadFix\server\data" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "HOSTNAME\RoadFixSvc:(OI)(CI)M"`. Set the backup root separately for the backup operator, for example `icacls "E:\RoadFixBackup" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "HOSTNAME\RoadFixBackupOp:(OI)(CI)M"`. Replace the example paths and accounts; do not paste these commands unchanged. ACL edits can prevent the service or backup operator from functioning if account names, inheritance, or folder layout are wrong. Have the Windows administrator review and verify effective access before pilot data is written.

### C. Backup and retention schedule

Recommended starting schedule for a small pilot, subject to owner approval and any separate complaint-data retention rule:

| Set | Frequency | Keep | Copy placement |
| --- | --- | --- | --- |
| Daily | Every day with accepted complaints, after the service is stopped for the paired DB/uploads copy | 14 daily sets | Primary protected backup location |
| Weekly | Once per week, preferably after the weekly integrity/recovery review | 8 weekly sets | Primary location and current external rotation |
| Monthly | At month end, after a successful restore drill or integrity check | 6 monthly sets | Primary location plus one encrypted external copy |

A weekly or monthly set may be copied from its daily source only after verifying that the database file and upload set are complete; the operator should record which daily set it derives from. Do not count RoadFix's same-directory safety backup as a scheduled set or as the external copy.

This schedule is a practical proposal, not an implemented feature. There is no automatic retention/deletion today. Keep manual deletion disabled until the owner approves the schedule, the operator has a verified restore drill, and a written approval step exists. Do not delete the last known-good copy or a set under incident/recovery review. Expired sets should be removed only after checking the retention ledger, verifying newer database and upload copies, and getting a second-person review. Use the organization's approved media sanitization process for media leaving service. File deletion on a live NTFS/SSD volume is not a guarantee that underlying blocks are unrecoverable; do not claim secure erasure from `Remove-Item` or ordinary Explorer deletion. If media is retired, have IT handle drive sanitization or destruction and BitLocker key retirement.

### D. Operations and recovery

**Ownership**

- Name a primary backup operator and a trained alternate before pilot data collection.
- Name the data custodian who approves retention, access, restore decisions, and any off-site custody.
- Keep a backup ledger with timestamp, operator, database path, upload-set path, destination drive/volume, integrity result, file counts/bytes, SHA-256 hashes, and copy/eject checks. Protect the ledger and recovery-key record like the backups.

**Daily backup procedure (operator runbook template)**

1. Announce a short maintenance window and stop the RoadFix server and all other SQLite clients. For a terminal-started server, stop it cleanly with Ctrl+C; otherwise use the approved service manager. Do not copy an actively changing uploads folder as if it were a database snapshot.
2. Unlock/mount only the approved encrypted destination. Select the approved parent destination, for example `E:\RoadFixBackup\Daily`; the command creates the timestamped set directory inside it.
3. From the `server` directory, run the paired backup-set command with explicit paths. The confirmation flag is an operator attestation; it does not detect running processes automatically:

   ```powershell
   npm run db:backup-set -- --database "C:\RoadFix\server\data\roadfix.sqlite" --uploads "C:\RoadFix\server\data\uploads" --directory "E:\RoadFixBackup\Daily" --confirm-server-stopped
   ```

   Record the CLI-reported timestamped set path, manifest, integrity, and upload file/byte totals. The command creates the set directory, verifies the SQLite snapshot and photo copies against a SHA-256 manifest, and leaves partial sets in place with their paths reported if a step fails. Do not reuse or delete an incomplete set without review.
4. Copy the completed set directory to the designated encrypted external rotation drive. Compare the database SHA-256 and upload manifest/files on both drives. Keep the manifest with the set.

   ```powershell
   # Use the exact set and database filenames printed by db:backup-set.
   npm run db:integrity -- "E:\RoadFixBackup\Daily\roadfix-backup-set-<generated-UTC-timestamp>\database\roadfix-<generated-UTC-timestamp>.sqlite"
   ```

   The set manifest records the database hash and per-photo relative paths, sizes, and hashes. Eject/lock the external drive and record custody/location. Restart RoadFix only after all steps pass.

**If a backup fails**

- Do not delete, rotate, or overwrite older verified sets. `COPYFILE_EXCL` intentionally fails if the same timestamp destination exists.
- Record the full command, output, timestamp and drive space. Keep the live database unchanged; investigate available space, permissions, destination encryption/lock state, and file/SQLite errors.
- If a partial set or temporary file remains, quarantine it by moving it to an operator-marked review folder on the same protected volume only after confirming the path; do not use it for recovery. Preserve evidence if the error suggests hardware failure.
- Retry only to a new timestamped directory after the underlying cause is fixed. Escalate to the primary data custodian if a verified backup cannot be produced that day.

**Integrity and recovery verification**

- The backup routine verifies the DB snapshot before publishing it. The operator should also run `db:integrity` on the final copied DB after any external copy.
- Check that the matching uploads directory exists, is non-empty when photos are expected, and matches the source inventory/manifest. Database integrity does not detect missing image files.
- At least monthly, run a full restore drill from a selected set to a separate, isolated test folder, not the production DB path. Example DB-only test target:

   ```powershell
   npm run db:restore -- "E:\RoadFixBackup\Monthly\<set>\<backup-file>.sqlite" --database "C:\RoadFix\restore-drill\roadfix-drill.sqlite"
   npm run db:integrity -- "C:\RoadFix\restore-drill\roadfix-drill.sqlite"
   ```

   Restore the paired uploads into the drill folder as well. Confirm sample complaint rows and that referenced photo files are present before declaring the full set recoverable. Keep the server stopped and do not point the production service at the drill DB. Clean up the drill set only after the exercise is documented and a second person confirms it is not a recovery copy.
- Before any real restore, stop RoadFix and all SQLite clients, identify and hash the selected backup, confirm the paired photos and safety backup space, run `db:integrity` on the source, and get custodian approval. The restore code verifies DB identity/integrity and creates a safety backup before displacement, but it cannot validate photo completeness. Keep restore offline and serialized per the final sign-off; do not restore over a live database or delete recovery files without inspecting them.

**Free-space monitoring**

- Record free space on the live-data volume and both backup volumes daily. Use `Get-Volume` or File Explorer; alert the operator below 20% free or below 10 GB, whichever threshold is reached first. Treat this as a pilot starting threshold and adjust for actual data growth.
- Before database backup, ensure the destination can hold the complete DB and photos plus temporary-copy headroom. Backup creation temporarily holds a SQLite temporary snapshot and final destination copy; restore also stages a candidate and creates a safety copy. As a conservative preflight, require free space at least twice the current DB size on the destination for backup, and about three times the DB size on the target volume for restore, plus expected upload bytes. Measure actual data and raise the threshold if WAL/recovery or filesystem behavior needs more room.
- The current upload quota defaults to 500 MiB, but it is not a disk-space monitor and does not reserve space for backups (`server/src/api.js:21,130`). The backup owner must watch total volume capacity independently.

## Decisions requiring owner approval

1. Windows edition/device and actual BitLocker status for every live and backup volume; if removable BitLocker To Go is unavailable, which approved encrypted medium will replace it?
2. Exact live, primary backup, and external rotation paths; whether an off-site physical copy is approved and who holds custody. No cloud storage is presumed.
3. Primary and alternate backup operators, data custodian, after-hours escalation contact, and who can unlock/recover the external drives.
4. Proposed retention of 14 daily, 8 weekly, and 6 monthly paired DB/uploads sets, including alignment with resident-data deletion and incident holds.
5. Minimum required recovery point/time objectives and whether the server can be taken offline daily for a consistent DB/photo set.
6. Whether approved BitLocker volume encryption plus ACLs is sufficient, or whether policy requires separately encrypted archive files when copied outside protected volumes.
7. Free-space alert threshold, backup ledger location, hash/photo-manifest approach, and approved media sanitization process.

## Risks and limitations

- This is an operational recommendation; the repository does not verify actual BitLocker status, Windows edition, NTFS permissions, storage device health, or recovery-key custody.
- The SQLite backup does not contain photos. No coordinated database/uploads backup command or automated photo manifest exists.
- BitLocker volume encryption protects data at rest when the volume is locked; an unlocked volume and an authorized process can read the files. It does not encrypt an individual SQLite backup for copying to an unencrypted disk.
- Backups are not app-encrypted, automatically pruned, or guaranteed to be securely erased at file deletion. No third-party/cloud destination is part of this plan.
- The restore command validates SQLite structure and integrity, not uploaded media completeness. Application startup can run migrations after a restored database is opened; restore remains an offline, serialized operator action.
- External drives can be lost, damaged, unavailable, or fail to unlock. Keep two physically distinct encrypted copies, separate recovery credentials, periodic restore drills, and named custodians.
- No legal compliance conclusion is made. The owner must approve retention, access, and notice policy for the pilot.

## Recommended implementation steps

1. Owner approves the decisions above and identifies the pilot host, Windows edition, service identity, operators, and custodians.
2. Windows administrator provisions the fixed data volume and backup destinations, enables supported volume encryption, captures recovery keys in the approved separate vault, and verifies protection status.
3. Administrator applies and reviews least-privilege NTFS ACLs; confirm the RoadFix service can write DB/WAL/SHM and uploads, while operators can read source and write backup sets. Verify ordinary accounts cannot browse these folders.
4. Select a backup root outside `server/data`; test the explicit `--directory` path and a second encrypted external copy using only synthetic data before pilot records exist.
5. Write and rehearse the paired DB/uploads procedure, hash/inventory ledger, failure escalation, encrypted-drive custody, and monthly isolated restore drill. Keep automatic deletion disabled.
6. Approve and document the retention/deletion review process and media-sanitation path. Enable only manual deletion after successful drill and dual review; automate only after a separate safety review.
7. Begin pilot data collection only after the first complete encrypted DB-plus-uploads set is created, copied, integrity checked, hash recorded, and recovery key access tested.

## Read-only confirmation

This assessment inspected source and documentation only. No database was opened, created, backed up, restored, or modified; no migration, account bootstrap, data import, or filesystem ACL/encryption change was performed. No application or existing documentation file was modified. Only this requested plan is created; nothing was staged, committed, or pushed.
