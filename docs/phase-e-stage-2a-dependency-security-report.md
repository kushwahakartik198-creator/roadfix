# RoadFix — Phase E, Stage 2A Dependency Security Verification

## Result

**The identified Sharp advisory is addressed by the existing `sharp@0.35.5` pin. The npm audit remains unverified.** No dependency files were changed in this task. A successful `npm audit` could not be obtained because `registry.npmjs.org` did not resolve from this environment. Therefore this report does not claim the full dependency tree is audit-clean.

## Scope and environment

Inspected root and server manifests/lockfiles, installed dependency trees, the two prior Phase D dependency remediation reports, and the existing Stage 1 audit finding.

- Node: `v24.20.0`
- npm: `11.19.0`
- Root: `package.json`, `package-lock.json` (lockfile v3; 388 package entries)
- Server: `server/package.json`, `server/package-lock.json` (lockfile v3)
- Root `npm ls --all`: exit 0. Server `npm ls --all`: exit 0. The full listing includes expected unmet optional platform dependencies; no invalid/missing required dependency was reported.
- The root package tree does not include `sharp` or `better-sqlite3`. The server tree has direct production dependencies `sharp@0.35.5` and `better-sqlite3@12.11.1`, both direct paths from `roadfix-server`.
- Server package and lockfile agree on both versions. `better-sqlite3@12.11.1` declares Node support including Node 24 in the lock metadata. The existing Sharp pin is exact and prior remediation notes report its Node 24 compatibility; no change was needed or made.

Prior reports inspected: `docs/phase-d-remediation-dependency-fix-report.md` and `docs/phase-d-remediation-stage-1-report.md`. Stage 1 documented one high npm finding while audit detail retrieval failed. The dependency-fix report documented the exact Sharp update from `0.35.0` to `0.35.5`, successful installation/tree verification, and the same audit DNS failure.

## Audit attempts

Ran each command in both the repository root and `server/`:

| Command | Root | Server |
| --- | --- | --- |
| `npm audit --omit=dev` | Failed before receiving advisories | Failed before receiving advisories |
| `npm audit --json` | Returned registry request error JSON | Returned registry request error JSON |
| `npm ls --all` | Passed, exit 0 | Passed, exit 0 |

Both audit modes failed requesting `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` with `getaddrinfo ENOTFOUND registry.npmjs.org`. This prevents npm from reporting advisory totals, dependency paths, or a complete audit status for either production or development dependencies. The JSON failure response contained the network error, not vulnerability records.

## Advisory identification and disposition

The likely high finding that prompted the Phase D Sharp update is confirmed by primary GitHub advisory records for Sharp:

| Advisory | Severity / issue | Affected | Patched | Current server status |
| --- | --- | --- | --- | --- |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | High; upstream libheif vulnerabilities, including potential RCE under specified glibc Linux conditions | `sharp < 0.35.4` | `0.35.4` | `sharp@0.35.5`, not in affected range |
| [GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) | High; CVE-2026-96889 in bundled librsvg, potential RCE under specified glibc Linux conditions | `sharp < 0.35.5` | `0.35.5` | `sharp@0.35.5`, at patched version |

The affected dependency path is the server's direct runtime dependency: `roadfix-server → sharp`. Sharp is used to decode/re-encode user-uploaded complaint images, so it is production-reachable, not development-only. The first advisory has no need for a further change at the current pin; the second is fixed exactly by `0.35.5`. GitHub identifies both as High severity. The advisory source describes platform/runtime conditions; the audit itself still needs to run to confirm the package registry's complete current dataset and any other dependencies.

The earlier `sharp@0.35.0` pin fell inside the affected ranges above. The recorded move to `0.35.5` was the smallest safe in-family patch satisfying both advisories without a major upgrade. It is already present in `server/package.json`, `server/package-lock.json`, and the installed tree. No change to `better-sqlite3@12.11.1` is indicated by the evidence found.

## Validation and changes

No approved dependency change was necessary in this task, so post-change test/build validation was not triggered. Current installed direct versions were verified with `npm ls`:

- `sharp@0.35.5`
- `better-sqlite3@12.11.1`

The previous dependency-fix report records backend tests (database/auth/import: 18 passed; API: 11 reported, 0 failed), lint and typecheck passing after the Sharp update. Those historical checks do not substitute for a fresh successful registry audit. No tests, build, migrations, database commands, bootstrap, or import were run for this task.

No manifests, lockfiles, source files, or existing workspace changes were modified. Only this report was created. No stage, commit, or push was performed.

## Remaining uncertainty and next action

The Sharp issue that motivated the known high finding is patched in the currently installed server version. However, because npm's advisory endpoint remained unreachable in both package contexts, the full root and server dependency trees—including development packages—have not received a current npm audit result. Do not describe the repository as audit-clean on this evidence.

When registry DNS is available, rerun `npm audit --omit=dev` and `npm audit --json` in both root and server contexts. If any additional finding appears, record its package path, severity, identifier, affected range, and patched range before changing dependencies. This task stops here without further dependency changes.