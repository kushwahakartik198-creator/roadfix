# Phase D Final Restore Rollback Correction

## Summary

Corrected pre-commit restore rollback so candidate database artifacts are quarantined before the original database can return to the target path. Quarantine uses unique names in the target directory. Production moves copy with `COPYFILE_EXCL` and then unlink the source, so an existing recovery path cannot be replaced by POSIX rename behavior. Candidate artifacts are retained; rollback does not discard candidate WAL/SHM files.

The rollback order is now:

1. On a post-promotion failure, move candidate target WAL and SHM files to unique failed-candidate paths, then move the candidate database.
2. If any candidate move fails, do not restore the original. Continue inventorying/moving the other candidate artifacts where possible, leave the original database and sidecars in their displaced paths, and report every known path and error. A partially completed staged-to-target copy is treated as a candidate and quarantined before rollback.
3. If all candidate artifacts leave target paths, restore original WAL/SHM sidecars first.
4. Restore the displaced original database last. If an original sidecar cannot be restored, leave the original database displaced.

Pre-promotion failures still restore the original sidecars and database while recognizing sidecars that never moved as original files. Exclusive copy prevents replacement of existing recovery destinations. On Windows, source and recovery paths stay in the target directory; if a file lock prevents copying or unlinking, the operation fails safely and the source and any already-created recovery copy are preserved. Lock behavior is tested deterministically through injected filesystem-operation failures rather than relying on random permission errors.

After the commit point (successful verification of the promoted target), cleanup remains best effort. Cleanup failures only report leftover old files and cannot delete the restored database.

## Manual recovery guidance

When an error includes rollback failures, stop RoadFix and all SQLite clients. Do not open or delete the listed files. Preserve the candidate, displaced, staged, safety-backup, and recovery files. Move any candidate database/WAL/SHM still at target paths to new, non-existing quarantine names on the same volume. Confirm no candidate sidecar remains at the target. Restore displaced original WAL and SHM files to their matching target sidecar paths, then restore the displaced original database last. Run the RoadFix integrity check before restarting. The thrown error lists the exact paths known to the restore operation and includes the original operation error plus rollback errors.

## Deterministic test coverage

Tests use temporary synthetic SQLite databases and injected filesystem operations. Distinct sentinel bytes are used for candidate and original WAL/SHM artifacts. Coverage includes candidate WAL, SHM, and database quarantine failures; simultaneous candidate-sidecar quarantine failures; original database, WAL, and SHM restoration failures; exact path/error reporting; preservation of original and sidecar contents; successful restore after the rollback changes; and post-commit cleanup failure preserving the restored database.

## Verification results

- Maintenance tests: **24 passed, 0 failed**.
- Full backend tests: **54 passed, 0 failed** (42 database/auth tests and 12 API tests).
- Lint (`npm run lint`): **passed**.
- Typecheck (`npm run typecheck`): **passed**.
- `git diff --check`: **passed** (exit code 0).

All SQLite restore tests used temporary synthetic databases. No production database operations, migrations, account creation, or data imports were performed. No dependencies, frontend, or authentication code were changed; nothing was staged, committed, or pushed.

## Remaining risks

- File locking is simulated through deterministic filesystem-operation injection; the tests do not force an external process to hold a Windows SQLite sidecar open.
- Recovery moves require enough free space for a temporary duplicate and filesystem support for exclusive copy. If source unlink fails, both source and recovery copy remain; both paths are reported for manual recovery.
- When rollback cannot complete, the target may intentionally be absent or may still hold a candidate artifact. The explicit recovery paths and instructions are required before any further database use.
