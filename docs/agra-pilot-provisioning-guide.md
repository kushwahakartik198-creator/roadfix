# Agra Pilot Provisioning Guide

Use this procedure only after the owner approves the host, data location, identities, privacy notice, backup plan, and security controls. This document does not provision anything. Never place real complaint data in a test workflow.

## 1. Prepare the pilot machine

1. Record the machine owner, Windows edition/build, Node.js and npm versions, approved service host, primary/alternate operator, incident contact, and recovery-key custodians.
2. Confirm Windows supports the approved encryption plan. Complete and verify BitLocker on every fixed volume that will hold application data and backup sets, plus BitLocker To Go on removable media before writing any backups. Record `manage-bde -status <DRIVE>:` results without recording recovery keys.
3. Create the approved repository/application and data directories. Review NTFS ACLs with the Windows administrator. Grant only the service identity and named operators the access necessary for their duties; test as an ordinary user.
4. Install Node.js 24 (server declares Node `>=20`), then install packages using `npm ci` and `npm ci --prefix server`. Confirm the approved source revision and local security review. Do not use the development launcher as a production service.
5. Configure HTTPS termination, firewall, service supervision, logs, and the exact browser/API origin in the production environment. Review [.env.example](../.env.example) and [Windows runbook](roadfix-windows-operations-runbook.md). Production requires `ROADFIX_SECURITY_MODE=production` and exact HTTPS `CORS_ORIGINS`; TLS/reverse proxy and host setup are deployment responsibilities.

## 2. Create the initial administrator

The interactive bootstrap command is:

```powershell
npm --prefix server run auth:bootstrap-admin
```

It prompts for email and a non-echoed password (12–128 characters) and confirmation. Do not supply credentials as command arguments or put them in a script, environment file, or log. The command calls the normal database opener on the fixed default path `server/data/roadfix.sqlite`, which creates/opens the database and applies migrations. It has no database path option and only works once. Therefore verify the machine, working tree, default path, ACLs, and intended target before authorizing it. This guide did not run bootstrap or create a pilot database.

Deliver the initial credential directly to the authorized administrator using the owner-approved channel. Require a successful first sign-in and establish the organization's credential rotation/recovery procedure.

## 3. Create wards and officers

1. Sign in at `/login` with the initial administrator and open `/admin`.
2. Use **Create ward** to enter the actual owner-approved Agra ward records. Obtain identifiers, names, codes, descriptions, and active status from the designated municipal data owner. Do not infer or fabricate ward data.
3. Use **Create staff account** to create each officer with an owner-provided display name/email and initial password. Select the correct already-created ward for each officer. Confirm every assignment with the responsible ward owner.
4. Verify accounts and ward assignments in the admin dashboard. Give credentials through an approved private channel. Do not share officer credentials between staff.
5. For later transfers, use the admin ward assignment controls and retain audit records. Deactivate accounts promptly when access is no longer required.

## 4. Verify access and run a synthetic workflow

Before resident data is accepted, use an owner-approved isolated pre-launch test environment with synthetic records only:

1. Verify an administrator can create and inspect wards/accounts, assign a complaint, and view allowed operational details.
2. Verify each officer can sign in and sees only their own ward's restricted unassigned summaries and permitted details for assigned complaints; try another ward and confirm denial.
3. Submit one clearly synthetic complaint with a non-real location, contact, and image. Confirm the returned reference tracks status without private contacts or photo URLs. Verify a private photo requires authorized access. Update status as the assigned officer and confirm unauthorized status changes fail.
4. Do not use real resident contact details, locations, or photographs in this test. Do not create synthetic rows in a live resident database unless an owner-approved isolation and cleanup procedure exists. The project currently has no general-purpose pilot test reset procedure described here.
5. Document results, operator, date, test account IDs, and safe disposition of synthetic records. Do not delete the database or rows manually as an improvised cleanup.

## 5. Create and verify the first encrypted paired backup set

Before backup, stop the server cleanly and every SQLite writer. Confirm uploads are idle. Confirm approved protected destination and free space. Use the command with actual absolute paths:

```powershell
npm --prefix server run db:backup-set -- --database "<ROADFIX_DATA_DIR>\roadfix.sqlite" --uploads "<ROADFIX_DATA_DIR>\uploads" --directory "<BACKUP_ROOT>\Daily" --confirm-server-stopped
```

The final flag is operator attestation only; it detects no processes. The command writes the database, uploads and hash manifest into a unique timestamped set and verifies the set. It does not itself encrypt files, copy to external media, or perform retention. Copy the complete set to owner-approved BitLocker To Go media, compare files with the manifest, run `npm --prefix server run db:integrity -- "<COPIED_SET>\database\<DATABASE_FILE>.sqlite"`, lock/eject the drive, and record custody. Never copy resident information to an unapproved cloud or third-party service.

## 6. Record ownership and readiness

Record the following in the owner-approved protected operations log (do not store passwords or recovery keys in it):

- Primary and alternate operators and their shifts/availability.
- Database and upload storage paths and ACL review evidence.
- Backup operator, daily/weekly/monthly schedule approval, media labels, custodian, and storage location.
- Volume encryption status and separate recovery-key custodians.
- Backup completion/integrity evidence and escalation contacts.
- Privacy notice owner approval and complaint-data retention policy approval.
- Completion of dependency audit when registry access works and the real Windows competing-process lock rehearsal.

Do not begin a controlled pilot until the owner has reviewed the outstanding decisions listed in [the pilot checklist](roadfix-pilot-operations-checklist.md) and formally authorized launch. This guide does not claim that all Stage 1 findings are resolved.
