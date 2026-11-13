# RoadFix Windows Operations Runbook

This is an operator guide for a small, offline or tightly controlled pilot. It is not a deployment approval. Do not accept resident data until the owner has resolved the decisions in the pilot provisioning guide and checklist.

## A. Initial Windows setup

### Requirements and startup

- Use Node.js 24 for the documented baseline; the server declares Node.js `>=20`. Use the npm version distributed with the selected supported Node release.
- Install at the repository root and server package: `npm ci` and `npm ci --prefix server`.
- Local development: `npm run dev:full` from the repository root. The frontend is `http://127.0.0.1:5173`; the API listens on `127.0.0.1:4000` by default. Ctrl+C stops both. This is local development, not a Windows production service.
- Production hosting, service supervision, HTTPS termination, firewall rules, log rotation, and monitoring must be selected and reviewed by the owner/Windows administrator. Do not use the development launcher for a pilot deployment.

### Service and backup identities

Use a dedicated, non-interactive Windows service identity for the API where the selected host supports it. Do not run the server as an everyday personal account or grant it administrator rights. Name a separate backup operator identity, primary/alternate human custodian, and escalation contact before accepting data. Restrict interactive logon and remote access according to owner policy. The Node process must be able to read application code and modify the database and uploads locations; the backup operator needs read/list access to source data and modify access to the backup destination. Test with the actual identities before launch.

Default data paths are `server\data\roadfix.sqlite` and `server\data\uploads\`, relative to the repository root. Keep them together under a dedicated, non-public data directory where practical. Neither the database nor upload directory should be exposed by a static web server.

## B. Encryption

### Check Windows support and state

In PowerShell, inspect the edition:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsHardwareAbstractionLayer
```

Windows Pro, Enterprise, and Education provide BitLocker Drive Encryption; some Home devices may offer Device Encryption with device-specific requirements. Confirm support with the Windows administrator. Device Encryption is not a substitute for BitLocker To Go on removable backup drives.

From an elevated PowerShell or Command Prompt, check each actual volume (substitute the drive letter):

```powershell
manage-bde -status C:
manage-bde -status D:
manage-bde -status E:
```

Record the volume, encryption percentage, protection status, lock status and date in the protected operations log. Do not record recovery keys in that log. For an accepted protected volume, verify full encryption and protection on using the displayed status; check fixed data volumes and external backup media independently.

### Enable using Windows administration

Have the authorized Windows administrator turn on BitLocker through **Control Panel → System and Security → BitLocker Drive Encryption → Turn on BitLocker** for supported fixed drives. Follow the organization's approved encryption and startup-authentication policy; complete encryption before placing RoadFix data on the volume. For a removable drive, use **File Explorer → right-click drive → Turn on BitLocker** (BitLocker To Go), complete encryption before copying any backup set, then eject/lock it after use. UI labels may differ by Windows edition/build. The application does not enable or verify encryption.

Store recovery keys separately from the computer and the media they unlock, in an owner-approved restricted offline custody location. Identify a primary and alternate custodian; test retrieval without exposing the key in a ticket, log, script, or backup folder. If the machine cannot support the approved encryption policy, pause pilot data collection and obtain an approved protected device or storage solution. Do not treat an ordinary SQLite file as encrypted.

BitLocker protects the volume while configured and locked according to Windows behavior. It does not make a copied file encrypted when copied to an unencrypted disk and does not replace NTFS access controls. RoadFix does not implement per-file backup encryption.

## C. NTFS permissions

Have a Windows administrator review the actual paths and accounts. Suggested access model:

- `SYSTEM` and local Administrators: full control.
- RoadFix service identity: modify access to the data directory and uploads; read/execute application code.
- Backup operator: list/read the database, SQLite sidecars (when present while the service is stopped), and uploads; modify access to the backup destination. Avoid broader access than the actual backup procedure requires.
- Ordinary users: no direct access to private database, upload, or backup files.

The following are examples only. Replace all angle-bracket placeholders and review before executing. These commands change ACLs; this runbook only documents them and does not execute them.

```powershell
icacls "<ROADFIX_DATA_DIR>" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "<COMPUTER>\<ROADFIX_SERVICE_ACCOUNT>:(OI)(CI)M" "<COMPUTER>\<BACKUP_OPERATOR>:(OI)(CI)RX"
icacls "<BACKUP_ROOT>" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "<COMPUTER>\<BACKUP_OPERATOR>:(OI)(CI)M"
icacls "<ROADFIX_DATA_DIR>"
icacls "<BACKUP_ROOT>"
```

Ensure the account that runs backup can read the SQLite file and uploads and write the chosen destination. A restrictive data ACL may need to grant the backup operator read/list on the tree; an ACL must not block the running service from writing uploads/database files. Use File Explorer **Properties → Security → Advanced → Effective Access** for the actual ordinary-user and service identities. Then sign in as a normal non-privileged user and confirm direct access to the private DB, upload files, and backups is denied. Inspect inherited ACEs and remote shares as well as local permissions. Do not assume an `icacls` listing alone proves effective access.

## D. Backup operations

### Create and verify a paired set

Use an approved backup location outside the application's writable `server\data` directory. Stop the RoadFix service cleanly and stop all other SQLite writers. Confirm no one is submitting reports and uploads are idle. The confirmation flag is only an operator attestation; it does not detect processes or lock the source.

From the repository root, substitute actual paths:

```powershell
npm --prefix server run db:backup-set -- --database "<ROADFIX_DATA_DIR>\roadfix.sqlite" --uploads "<ROADFIX_DATA_DIR>\uploads" --directory "<BACKUP_ROOT>\Daily" --confirm-server-stopped
```

The command creates a unique UTC timestamped `roadfix-backup-set-*` folder with `database`, `uploads`, and `manifest.json`. It verifies SQLite application/integrity metadata and upload inventory, sizes, and SHA-256 hashes. A successful command reports paths and totals. Read the full output, review the manifest, and record the set path/time/result/operator. A failed command leaves its incomplete set for investigation; preserve its printed path and all listed files. Do not clean it up as a routine retry.

The command does not encrypt, make an external copy, compare a second copy, or delete old sets. Copy the entire completed set to the approved BitLocker To Go drive only after the drive is unlocked and its `manage-bde -status <DRIVE>:` output confirms the expected protection. Compare the copy to the manifest (paths, sizes and hashes) using an approved hashing procedure, then run SQLite integrity on the copied database:

```powershell
npm --prefix server run db:integrity -- "<COPIED_SET>\database\<DATABASE_FILE>.sqlite"
Get-FileHash -Algorithm SHA256 "<COPIED_SET>\database\<DATABASE_FILE>.sqlite"
```

The manifest's database hash is the reference for comparison. A matching SHA-256 checks file equality; it does not establish encryption or who created the manifest. Lock/eject the external drive and log its custodian and storage location. Never copy resident information to an unapproved cloud or third-party service.

## E. Recovery

### Separate recovery units

A paired backup set contains a SQLite database and its corresponding photo tree. The implemented restore command restores only the SQLite database. Recover the matching `uploads` directory as a separate controlled file operation, maintaining its expected path and ACLs. Database integrity does not prove that photo files were recovered; compare each path/size/hash with the set manifest.

### Offline database restore

Restores must be offline and serialized. Stop RoadFix and every SQLite writer, verify the chosen backup file and its containing set, confirm a verified safety backup can be created and sufficient same-volume free space is available. The restore verifies SQLite application and integrity metadata and creates a target-directory safety backup before displacing an existing target. Example only, after authorization:

```powershell
npm --prefix server run db:integrity -- "<BACKUP_SET>\database\<DATABASE_FILE>.sqlite"
npm --prefix server run db:restore -- "<BACKUP_SET>\database\<DATABASE_FILE>.sqlite" --database "<ROADFIX_DATA_DIR>\roadfix.sqlite" --confirm-overwrite
npm --prefix server run db:integrity -- "<ROADFIX_DATA_DIR>\roadfix.sqlite"
```

If CLI output reports leftover recovery files after a successful restore, do not delete them; record and inspect every path. Cleanup did not fully complete. If restore reports an error or rollback failures, do not restart or open candidate/original files. Preserve every path in the error. The restore's manual recovery instructions say to quarantine candidate files from target paths, restore displaced original WAL/SHM first, and restore the original database last; never overwrite a path. Obtain approval from the primary custodian and a second qualified operator, then verify integrity before restart. Follow the detailed [Phase D final sign-off](phase-d-final-signoff.md) and [correction report](phase-d-final-restore-correction-report.md).

If any file is locked, missing, duplicated, or at an unexpected path, stop and escalate. Do not force-delete, overwrite, or pair a database with sidecars of uncertain origin. The real competing-process Windows file-lock rehearsal remains outstanding.

## F. Daily checks and escalation

At start/end of each pilot day, the operator records:

1. RoadFix service state and whether startup/shutdown errors occurred.
2. Database and upload directory availability, current file count/size, and whether new photos can be accessed through authorized workflow.
3. Latest paired backup set path, verification result, and matching external copy/custody.
4. Free space on the live and each backup volume (`Get-Volume` or File Explorer). The backup plan proposes alerting below 20% free or 10 GB, whichever threshold is reached first; owner must confirm it for actual volume sizes.
5. Windows/application logs, API errors, failed logins, repeated 4xx/5xx responses, and any unauthorized access or file permission changes.
6. External-media lock/eject state and named current custodian.

Do not restart after a failed restore, failed/incomplete backup, unexplained integrity error, suspected exposure, or storage fault until the primary operator/custodian has reviewed it. Record timestamp, exact command, complete error, affected paths and actions; preserve files and logs. Notify the alternate operator and the owner-designated incident contact. If private information or a drive may be exposed, restrict access and custody immediately and follow the owner's incident procedure. This repository has no centralized monitoring or paging system; contact names and response targets remain owner decisions.
