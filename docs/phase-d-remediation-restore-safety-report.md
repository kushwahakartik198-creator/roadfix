# Phase D Remediation: SQLite Restore Safety

## Scope

Reviewed and updated `server/src/db/maintenance.js` and `server/src/db/maintenance.test.js`. Restore tests use temporary synthetic SQLite databases; no production database or account was accessed.

## Restore safety changes

- The explicit commit point is after the promoted target passes RoadFix application, integrity, and foreign-key verification.
- Before commit, failures trigger rollback. The displaced original database is restored, along with any moved WAL/SHM sidecars when their original destinations are available.
- Sidecar rollback refuses to overwrite existing files. A collision, failed move, or failed rollback is included in the thrown error alongside the original failure.
- After commit, displaced-file cleanup is best effort. Cleanup failures return `recoveryFiles` containing existing leftovers; they cannot enter rollback or delete the restored target.
- When rollback cannot finish, remaining staged/promoted/displaced paths are reported and preserved. A promoted file is retained when there is no displaced original available.
- Existing-target restores continue to create and verify a safety backup before displacement.

## Deterministic coverage

Added tests for successful restore over an existing target, restore to a new target, pre-promotion failure, post-promotion verification failure, post-commit cleanup failure, partial WAL/SHM movement, rollback failure path reporting, and safety-backup validity. Filesystem operations and verification are injectable to make failures deterministic.

## Validation

- Maintenance tests: 13 passed.
- Backend tests (`npm test` in `server`): 43 passed across database/auth/API suites.
- Lint (`npm run lint`): passed.
- Typecheck (`npm run typecheck`): passed.
