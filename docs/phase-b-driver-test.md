# RoadFix Phase B1 — better-sqlite3 Installation Test

Date: 2026-11-10

## Result

The initial `12.12.0` npm install was blocked because that version is not published to npm (despite its upstream release tag and binary). In a later owner-authorized test, **`better-sqlite3@12.11.1` installed successfully**, loaded its native module on Windows x64 / Node 24.20.0, and passed all requested temporary database checks. The test database and its sidecars were removed. The separate `12.12.0` registry findings remain below for context.

## Initial Git state

Exact `git status --short` before the test:

```text
?? docs/phase-b-preflight.md
?? docs/sqlite-migration-audit.md
```

Those existing untracked documents were preserved.

## Installation attempts

Exact command:

```powershell
npm.cmd install --prefix server --save-exact better-sqlite3@12.12.0
```

1. Default sandbox attempt: stalled during registry access; after interrupting it, npm reported `ENOTFOUND` for `registry.npmjs.org`. No package changes were observed.
2. Network-enabled retry of the same exact command: **exit code 1**, npm error `ETARGET`: `No matching version found for better-sqlite3@12.12.0.`

The second attempt reached npm, so the final blocker is version resolution, rather than a demonstrated Windows ABI/build-tool failure. The preflight's inspected GitHub release metadata is not sufficient proof that this tag is published as an npm package at the exact requested version. No dependency version was substituted.

## Environment and package state at initial 12.12.0 diagnostic

- Node.js: `v24.20.0`
- npm: `11.19.0`
- Platform/architecture/ABI from the earlier read-only preflight: `win32 x64`, ABI `137`
- Python is available on PATH; `cl` and `msbuild` were not found on PATH. Presence of Visual Studio Build Tools elsewhere on the machine was not established.
- At that stage, `server/package.json` declared zero runtime dependencies, no server lockfile existed, and the package was not installed. This predates the subsequent authorized `12.11.1` test.

## Requested test results

| Check | Result |
|---|---|
| Install exact version | **FAIL / blocked:** npm `ETARGET`, exit 1 |
| Installed package version | **Not installed** |
| Native module loading | **Not run:** module unavailable |
| Database creation | **Not run:** no test DB was created |
| Table creation | **Not run** |
| Insert, update and select | **Not run** |
| Prepared statements | **Not run** |
| Transaction commit and rollback | **Not run** |
| Foreign-key enforcement | **Not run** |
| WAL mode | **Not run** |
| Close and reopen persistence | **Not run** |
| Temporary DB cleanup | **Not applicable:** no test DB or sidecars were created |
| Production RoadFix DB | **Not created** |

## Warnings and errors

- Initial sandbox install could not resolve `registry.npmjs.org` (`ENOTFOUND`).
- Network-enabled retry failed because npm reported that version `12.12.0` does not exist in the configured registry (`ETARGET`).
- No native compilation was attempted, so no conclusion can be drawn about Visual Studio Build Tools requirements for an install fallback.

## Read-only registry diagnostic (follow-up)

The configured registry was read with `npm.cmd config get registry`: `https://registry.npmjs.org/`. No auth configuration or token was queried or printed.

The requested command, with the official registry explicitly selected, was run:

```powershell
npm.cmd view better-sqlite3@12.12.0 version --registry=https://registry.npmjs.org/
```

It exited 1 with npm `E404`: “No match found for version 12.12.0.” This is a registry response, not a network failure. A read-only `npm view better-sqlite3 versions --json` query exited 0 and showed the most recent 12.x version published as `12.11.1`, followed by `13.0.0` through `13.0.3`; `12.12.0` is absent. The metadata query for 12.12.0 likewise returned E404. Metadata was read for the nearest published releases without installation:

- `12.11.1`: Node engines `20.x` through `26.x`; install script `prebuild-install || node-gyp rebuild --release`; dependencies `bindings` and `prebuild-install`; npm tarball `https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-12.11.1.tgz`.
- `13.0.3`: Node engines `>=22`; depends on `node-addon-api`; its registry metadata lists no install script. Upstream issue reports npm 11 lockfile installs still invoking implicit `node-gyp`, so installing this version should be separately tested rather than assumed safe.

The exact upstream release binary was checked by an HTTP HEAD request (no binary body downloaded):

```text
https://github.com/WiseLibs/better-sqlite3/releases/download/v12.12.0/better-sqlite3-v12.12.0-node-v137-win32-x64.tar.gz
```

GitHub redirected to its release-assets host and returned **HTTP 200 OK**, `Content-Length: 1040529`, with `Content-Disposition` naming `better-sqlite3-v12.12.0-node-v137-win32-x64.tar.gz`. This confirms an upstream release asset for Node ABI 137 / Windows x64 exists. It does not make `12.12.0` available to `npm install better-sqlite3@12.12.0`; the install failure is due to package publication/version mismatch, not missing ABI binary or registry unreachability.

The preflight statement that 12.12.0 could be pinned as an npm package should be corrected: upstream release history includes the `v12.12.0` tag and binary, but npm's published package version list currently does not. The latest published 12.x npm package found by this diagnostic is 12.11.1. No alternative was selected or installed.

## Owner-authorized test: better-sqlite3 12.11.1

### Initial Git state for this test

```text
?? docs/phase-b-driver-test.md
?? docs/phase-b-preflight.md
?? docs/sqlite-migration-audit.md
```

All existing untracked audit documents were preserved.

### Installation and version

Exact command:

```powershell
npm.cmd install --prefix server --save-exact better-sqlite3@12.11.1
```

Result: **exit code 0**. npm reported `added 38 packages, and audited 39 packages in 15s`, with `found 0 vulnerabilities`. It added only the exact server dependency `better-sqlite3: 12.11.1` and generated `server/package-lock.json`; no root dependencies were upgraded or changed.

Installed version was verified both with `require('./server/node_modules/better-sqlite3/package.json').version` (printed `12.11.1`) and `npm.cmd ls --prefix server better-sqlite3 --depth=0` (showed `better-sqlite3@12.11.1`, exit 0).

Runtime: Node `v24.20.0`, npm `11.19.0`, Windows `win32 x64`, ABI 137.

### Native module and database checks

Native module loading passed. An in-memory smoke query reported SQLite `3.53.2`.

The file-backed check used a unique `roadfix-driver-test-<random>.sqlite` under the Windows system temp directory, outside the project and `server/data/`.

| Check | Result |
|---|---|
| Database creation | **PASS** — temporary file appeared after opening the DB |
| Table creation | **PASS** — parent, child and records tables created |
| Insert, update and select | **PASS** — inserted, updated and selected the expected value |
| Prepared statements | **PASS** — parameterized insert/update/select executed |
| Transaction rollback | **PASS** — a deliberate thrown error rolled back its insert; row count stayed zero |
| Foreign-key enforcement | **PASS** — invalid parent reference was rejected; child row was not stored |
| WAL mode | **PASS** — pragma returned `wal` |
| Close/reopen persistence | **PASS** — committed value remained after reopen; WAL still reported `wal` |
| Cleanup | **PASS** — temporary database, `-wal`, and `-shm` files removed after all checks passed; follow-up temp search found no `roadfix-driver-test-*` entries |
| Production RoadFix database | **NOT CREATED** |

The database check exited 0. No server or API route was started or changed.

### Warnings and errors

- npm warning: `prebuild-install@7.1.3` is deprecated/no longer maintained.
- npm warning: one package has install scripts not yet covered by `allowScripts`, identifying `better-sqlite3@12.11.1` and `prebuild-install || node-gyp rebuild --release`.
- Despite that warning, installation succeeded, native loading passed, and all database checks passed. No compilation error occurred; Python/MSVC were not needed in this install.

### Phase B recommendation

**Recommend `better-sqlite3@12.11.1` for Phase B implementation, pinned exactly as installed.** Evidence now includes successful install on the target environment, native module loading, and passing create/read/write, transaction rollback, FK, WAL and reopen checks. Track the deprecated `prebuild-install` and npm lifecycle-script warning in dependency review; do not upgrade without review. This recommendation covers the driver for database foundation work only. It does not authorize API/auth work, JSON import, or production database initialization.

### Final Git status

Exact `git status --short` after test and report update:

```text
 M server/package.json
?? docs/phase-b-driver-test.md
?? docs/phase-b-preflight.md
?? docs/sqlite-migration-audit.md
?? server/package-lock.json
```

The server manifest dependency addition and new server lockfile are the authorized installation result. This report is the only documentation file modified during this test. No application code, root dependencies, npm configuration, production database or existing data was changed. Nothing was staged or committed.
