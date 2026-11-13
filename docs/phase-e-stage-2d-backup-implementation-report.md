# RoadFix — Phase E, Stage 2D Complete Backup Sets

## Summary

Implemented a paired backup-set workflow that writes a verified SQLite snapshot and its corresponding uploads tree into a unique, timestamped directory under an explicitly selected destination. A `manifest.json` records the backup timestamp, relative database filename and SHA-256, every upload's relative path/size/SHA-256, and upload file/byte totals. The command hashes files incrementally and re-reads the resulting set to validate database and upload hashes, sizes, inventory, and totals.

The CLI requires `--confirm-server-stopped`. This is an operator attestation only; the program does not detect RoadFix processes or other SQLite writers. Backup-set destinations are rejected when inside the application's writable `server/data` directory, including resolved path aliases, and when they overlap the source uploads directory. Existing timestamped sets are never overwritten. On failure, the incomplete set and all existing files are preserved; the error reports the set, existing artifact paths, expected database/uploads locations, and manifest path. No automatic retention or deletion was added.

## Changed files

- `server/src/db/maintenance.js` — added `backupSet()`, `verifyBackupSet()`, incremental SHA-256 calculation, recursive upload inventory/copy, destination safety checks, and incomplete-set path inventory. The existing single-database backup and restore algorithms were not changed.
- `server/src/db/maintenance-cli.js` — added `backup-set` command and success output with set/database/manifest paths, SQLite integrity, file count, byte count, and explicit attestation notice.
- `server/src/db/maintenance.test.js` — added deterministic tests using synthetic SQLite databases and files.
- `server/package.json` — added `db:backup-set` script; no dependency or lockfile changes.
- `docs/phase-e-stage-2d-backup-protection-plan.md` — updated the daily operator runbook to use the new paired command.
- `docs/phase-e-stage-2d-backup-implementation-report.md` — this report.

No schema, migration, restore rollback logic, custom encryption, retention/deletion, ACL configuration, or BitLocker configuration changed.

## Operator workflow

1. Stop RoadFix cleanly and stop all other SQLite clients/writers. Confirm uploads are not being modified. `--confirm-server-stopped` records this operator assertion; it does not inspect processes.
2. Unlock/mount the approved protected destination. Use a parent directory outside `server/data`.
3. From `server/`, run:

   ```powershell
   npm run db:backup-set -- --database "C:\RoadFix\server\data\roadfix.sqlite" --uploads "C:\RoadFix\server\data\uploads" --directory "E:\RoadFixBackup\Daily" --confirm-server-stopped
   ```

   The CLI creates `roadfix-backup-set-<UTC timestamp>` beneath the supplied destination. It prints the exact set, database and manifest paths, SQLite integrity result, and upload totals. Save these in the protected backup ledger.
4. Review `manifest.json`. Verify the file count/bytes and that the listed database and `uploads` tree exist. A successful command has already verified the set contents.
5. Copy the entire completed set directory to the approved encrypted external rotation media. Compare the database hash and upload manifest/content on the copy; run `npm run db:integrity -- "<copied set>\database\<database filename>"` on the external copy. Lock/eject the drive and record custody.
6. Restart RoadFix only after the source was left unchanged and all intended copies passed checks.
7. If the command fails, preserve the printed incomplete set and all listed files for review. Do not reuse that timestamp, delete the partial set, or rotate older backups. Retry only to a new destination/timestamp after review.

The detailed approved plan contains the storage, encryption, ACL, retention, free-space, and recovery-key guidance. No cloud destination is assumed. The new command does not configure BitLocker or NTFS ACLs.

## Tests and validation

All test databases, uploads, and output directories were temporary synthetic fixtures under the repository's test fixture directory and were removed by test cleanup. No RoadFix operational data was used.

| Check | Result |
| --- | --- |
| Focused SQLite maintenance suite (`node --test src/db/maintenance.test.js`) | **40 passed, 0 failed** |
| Full backend (`npm test` in `server/`) | **70 passed, 0 failed**: 58 database/auth/import/maintenance tests and 12 API tests |
| Frontend (`npm test`) | **50 passed, 0 failed** across 9 files |
| TypeScript (`npm run typecheck`) | **Passed**, exit 0 |
| Lint (`npm run lint`) | **Passed**, exit 0 |
| Production build | **Passed**, 2,167 modules transformed in a unique temporary output directory, removed after the build. Existing Vite chunk warning remains: JavaScript 634.29 kB (gzip 190.13 kB), above 500 kB. |
| `git diff --check` | **Passed**, exit 0. Git emitted existing LF-to-CRLF normalization notices; no whitespace errors. |

Focused tests cover a complete paired set with multiple synthetic files, empty uploads, database and upload hash verification (including tampering), existing timestamp collision, stop attestation, out-of-data destination rejection, injected upload copy failure, injected manifest verification failure, exact partial-set paths, and source preservation.

## Limitations and remaining risks

- Consistency across the database snapshot and upload tree depends on the operator actually stopping RoadFix and all writers. The flag is not process detection or a filesystem lock. A false attestation or concurrent writer can produce a logically mismatched pair even if file hashes match their manifest.
- The backup set contains sensitive SQLite data and images in ordinary files. It is not individually encrypted or signed. Use only owner-approved protected volumes and encrypted removable media as required by the protection plan. A SHA-256 manifest detects accidental changes relative to that manifest; it does not prove who created it or encrypt data.
- Copying the completed set to external media remains a separate operator action. The CLI does not verify a second media copy, configure ACLs/BitLocker, or protect keys.
- The manifest is a filesystem inventory; the command does not query complaint image rows to prove every database reference maps to an upload. It verifies every copied file against the manifest and all source files discovered at copy time.
- Restore remains a database-only operation. Operators must restore the paired uploads set separately using a reviewed procedure; restore rollback logic was intentionally unchanged.
- No retention, pruning, or automatic deletion exists. Incomplete sets remain on disk and require manual review. Destination capacity and full-volume monitoring remain operator responsibilities.
- The app still has the existing large production JavaScript chunk warning; it is unrelated to this backup change.

## Scope confirmation

No real database or real uploads were opened, backed up, modified, restored, or migrated. No accounts were bootstrapped, no `store.json` was imported, and no dependencies changed. Existing unstaged and untracked workspace work was preserved. Nothing was staged, committed, or pushed.