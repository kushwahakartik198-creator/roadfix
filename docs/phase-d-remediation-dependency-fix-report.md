# RoadFix — Dependency Security Fix Report

## Change

Updated the server's exact Sharp pin from `0.35.0` to `0.35.5` in both `server/package.json` and `server/package-lock.json`. No application code or unrelated dependency was changed in this task.

Exact installation command:

```text
npm.cmd install --save-exact sharp@0.35.5 --no-audit --registry=https://registry.npmjs.org/
```

Result: **success**, `changed 2 packages in 7s`. The existing server package manifest and lockfile were already untracked workspace files; they were preserved and updated in place. `better-sqlite3` remains pinned at `12.11.1`.

## Sharp version verification

- `npm.cmd ls sharp --all` (run in `server/`) — **passed**; output contains only `sharp@0.35.5`.
- The server manifest pins `sharp: 0.35.5`.
- The lockfile root dependency and `node_modules/sharp` entry pin `0.35.5`; the lockfile's Sharp platform packages are also `0.35.5`.
- No additional installed Sharp version appeared in the dependency tree.

## Security audit

Ran the requested command:

```text
npm.cmd audit --omit=dev --json
```

The audit service was unavailable. npm reported `getaddrinfo ENOTFOUND registry.npmjs.org` while requesting `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`. Therefore no fresh advisory result is available. `npm audit fix` was not run.

## Verification

- `npm.cmd test --prefix server` — **passed**. Database/auth/import suite: 18 passed, 0 failed. API suite: 11 reported, 0 failed. The API suite includes malformed-image rejection, excessive-dimension rejection, and valid image decode/re-encode checks.
- `npm.cmd run lint` — **passed**, exit code 0.
- `npm.cmd run typecheck` — **passed**, exit code 0.
- `git diff --check` — **passed**; Git emitted line-ending normalization notices for existing modified files, but no whitespace errors.

## Warnings

The install reported that `better-sqlite3@12.11.1` has an install script not covered by the current `allowScripts` policy. This is an existing dependency and was not changed. No audit fix or other dependency updates were performed.

## Files

- `server/package.json`
- `server/package-lock.json`
- `docs/phase-d-remediation-dependency-fix-report.md` (this report)

No production database, account, or imported data was touched. Nothing was staged, committed, or pushed. Pre-existing workspace changes were preserved.
