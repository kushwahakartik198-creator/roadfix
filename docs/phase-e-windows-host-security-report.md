# Phase E Launch Gate 2 — Read-Only Windows Host Security Check

## Verdict: NOT VERIFIED

The visible directory ACLs were read successfully, but actual volume encryption status, Device Encryption availability/state, volume filesystem details, and Windows service configuration could not be confirmed from this non-administrative environment. The application data directories are on the same visible `C:` volume as the repository. Their directory ACLs grant `ReadAndExecute` to `KARTIK\CodexSandboxUsers` and inherited `FullControl` to SYSTEM, local Administrators, and `KARTIK\kushw`; the application data directories therefore do not show a dedicated restrictive ACL in this view. Do not infer that the volume is encrypted or that data-file ACLs are identical from the directory ACL alone.

No security settings were changed. The database, uploads and backup contents were not accessed, opened, listed, copied, or modified. No files other than this report were created; no files were deleted.

## Windows edition and build

Read from `HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion`:

- Product: **Windows 10 Home Single Language**
- Edition ID: `CoreSingleLanguage`
- Display version: **25H2**
- Build: **26200**, UBR **9974**
- Installation type: Client
- Runtime OS description: `Microsoft Windows 10.0.26200`

The CIM operating-system query was denied, so the report uses the readable Windows registry values above. The current PowerShell identity is `KARTIK\kushw`; it is not in the local Administrators role.

## Encryption capability and actual status

### Volume placement

The repository root, `server\data`, and `server\data\uploads` all resolve to drive **C:**. The `server\data\backups` directory does not exist. The current owner-approved external backup destination/drive is not specified in the repository or available in this host check, so no external backup volume could be identified for status checking.

Only directory existence was checked for `server\data` and `server\data\uploads`; no database, upload, or backup file was inspected.

### BitLocker availability

- `manage-bde.exe` is present on the system. Its presence alone does not establish that the selected edition/device can provide the required protection.
- The OS reports Home Single Language. Full BitLocker management capability was not established from this restricted account.
- `Get-BitLockerVolume` is installed but failed with “Access to a CIM resource was not available to the client.”
- `Get-Volume` failed with the same CIM access restriction.
- `fsutil fsinfo volumeinfo C:` failed with `Error 5: Access is denied`, so the volume filesystem type could not be independently confirmed.

### Actual encryption state

**C: encryption status: NOT VERIFIED.** `manage-bde -status C:` returned “An attempt to access a required resource was denied” and instructed that administrative rights may be required. No status output identifying conversion, encryption percentage, protection, or lock state was obtained. The equivalent PowerShell query was blocked. This is not evidence that encryption is on or off.

### Device Encryption

**Availability and enabled state: NOT VERIFIED.** This Windows edition can expose a device-encryption option only on supported configurations, but this assessment did not establish hardware eligibility or inspect an authoritative Settings status. `Get-Tpm` required administrator privilege; `Confirm-SecureBootUEFI` returned an access-denied privilege error. These blocked checks do not prove Device Encryption is unavailable or disabled. No Device Encryption or BitLocker setting was changed.

## Directory ACL findings

Read-only `icacls` and `Get-Acl` queries were run on the repository root and the existing `server\data` and `server\data\uploads` directories. ACLs were not queried recursively. Rights below are the ACEs shown on those directory objects; they do not establish effective access for every group member or the ACL on any protected file.

| Directory | Present? | Listed access entries |
| --- | --- | --- |
| `C:\Users\kushw\roadfix` | Yes | `KARTIK\CodexSandboxUsers`: `ReadAndExecute` (`RX`), explicit on this directory and inheritable. `NT AUTHORITY\SYSTEM`: `FullControl` (inherited). `BUILTIN\Administrators`: `FullControl` (inherited). `KARTIK\kushw`: `FullControl` (inherited). |
| `C:\Users\kushw\roadfix\server\data` | Yes | `KARTIK\CodexSandboxUsers`: inherited `ReadAndExecute` (`RX`). SYSTEM, BUILTIN\Administrators, and `KARTIK\kushw`: inherited `FullControl`. |
| `C:\Users\kushw\roadfix\server\data\uploads` | Yes | `KARTIK\CodexSandboxUsers`: inherited `ReadAndExecute` (`RX`). SYSTEM, BUILTIN\Administrators, and `KARTIK\kushw`: inherited `FullControl`. |
| `C:\Users\kushw\roadfix\server\data\backups` | No | No directory ACL to inspect. |

`FullControl` includes read, write, modify, delete, and permission-management rights. `ReadAndExecute` provides read/list and execute rights, but not write/modify/full control. No separate `Write`-only or `Modify`-only ACE was listed on these directory objects. The `CodexSandboxUsers` group is granted inherited read/execute access through `server\data` and `uploads`; its actual membership/effective access to protected child files was not established here. The current account has a direct inherited `FullControl` ACE. These are observed entries, not a recommendation or an ACL change.

The database file, upload contents, and backups were deliberately not queried, so file-specific ACEs, explicit child overrides, and effective access to each protected file remain unverified. No approved external backup path was available to inspect.

## Current account and service identity

- Current shell identity: **`KARTIK\kushw`**, non-administrative, interactive user context. The token reports membership in standard `Users` and `INTERACTIVE` groups. Personal account email and SID are intentionally omitted.
- No Node process was visible during the check.
- Querying Windows services failed: “Cannot open Service Control Manager on computer '.'” due to insufficient privileges.
- The repository's launcher scripts start Node processes, but this source inspection does not establish what identity a future production service will use.
- **Dedicated RoadFix service identity: NOT VERIFIED.** The current shell is an ordinary interactive account; service installation and service logon identity could not be checked. Do not assume a dedicated service account is configured or that this interactive account is the intended pilot service identity.

## Checks blocked or limited

- BitLocker status, volume enumeration, volume type, TPM state, Secure Boot status, and service enumeration were blocked by permissions/CIM restrictions.
- Device Encryption availability/state was not visible through an authoritative status check.
- The intended external backup volume has not been selected or disclosed in the current configuration, and `server\data\backups` is absent.
- File-level ACLs and effective access for protected files were not inspected to honor the prohibition on accessing database/uploads/backups.
- This check describes the Windows host visible to the current session. If the pilot will use a different machine, all host checks must be repeated there.

## Exact remaining owner/host actions

1. **Windows administrator:** On the actual pilot machine, identify all approved live-data and backup volumes. Use an elevated read-only `manage-bde -status <DRIVE>:` and `Get-BitLockerVolume` check to record conversion, protection and lock status. Do not treat an access-denied response as a status.
2. **Windows administrator / project owner:** For Home edition, verify Device Encryption eligibility and status through the machine's supported Windows Settings/System Information path. If status or eligibility cannot be established, treat encryption as unverified and select an owner-approved supported host/storage option before resident data is stored.
3. **Windows administrator:** Confirm the data and backup volumes' filesystem types and inspect effective NTFS access for the service account, backup operator, administrators, ordinary users, and members of `KARTIK\CodexSandboxUsers`. Clarify why this group has inherited read/execute on the app data tree. Review protected file ACL metadata only under an approved read-only procedure; do not open file contents for this security check.
4. **Windows administrator / project owner:** With authorized service-control visibility, determine whether a RoadFix Windows service exists, which identity it uses, and whether that identity is a dedicated least-privilege service account. Name the backup operator separately.
5. **Project owner:** Select and record the actual database/uploads locations and encrypted external backup location/custodians. The current local backups directory is absent and the external backup path is unresolved.
6. **Project owner:** Approve any future ACL or encryption changes separately and only after path/identity review. This assessment made no such changes.

Do not collect real resident information until encryption status, service identity, effective ACLs, backup destination protection, and owner approvals are verified on the intended pilot machine.
