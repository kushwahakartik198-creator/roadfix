# RoadFix — Phase D Remediation Stage 1 Report

## Summary

Implemented the requested H-1 and M-1 protections and M-3 image decoding/re-encoding. Anonymous reporting remains available. No production database, account, or JSON data was created or imported. No Supabase files were removed. Nothing was staged, committed, or pushed.

## Findings addressed

### H-1 — Anonymous submission abuse protections

In `server/src/api.js`:

- Added a bounded in-memory per-socket-address limit of 5 report submissions per 15 minutes. Forwarded IP headers are not used. This preserves anonymous reporting and blocks only excess submissions.
- Limited active report requests to 2 per API process. Busy requests receive `429` and `Retry-After`.
- Kept the streaming JSON size limit at 22 MiB and added an early `Content-Length` rejection for oversized report bodies (`413`). Requests without a trustworthy length are still bounded while streaming by the existing byte counter.
- Added an upload-storage quota: 500 MiB by default, configurable with `UPLOAD_STORAGE_MAX_BYTES`. Existing regular files in the upload directory and in-flight reservations count against the limit. When a new upload would exceed it, the request returns `507` without creating the complaint.
- The limiter uses `requestRemoteAddress(req)`, which reads the socket peer and intentionally ignores `X-Forwarded-For` by default.

### M-1 — Public history rate-limit bypass

The legacy `/api/issues/:id/history` endpoint now consumes the same 30-per-minute socket-address tracking limiter as reference-based tracking and history. The route remains available for compatibility. The API regression test now exhausts the ID route and verifies that the next request receives `429` with `Retry-After`.

### M-3 — Image validation and sanitization

Inspected existing dependencies first: no image decoder was present. With owner approval, added pinned `sharp@0.35.0` to `server/package.json` and updated the existing server lockfile. Sharp is a maintained decoder with Windows x64 prebuilt binaries and official Node.js support starting at 20.9, which includes the project’s Node 24 runtime ([official installation documentation](https://sharp.pixelplumbing.com/install/)).

Uploaded photos are decoded and re-encoded before storage. The implementation enforces a maximum width or height of 8,192 pixels and at most 20 million decoded pixels. Sharp is configured for one processing thread with a 50 MiB cache; at most two report requests are processed concurrently. The output keeps the accepted JPEG/PNG/WebP content type, strips source metadata through re-encoding, and must remain within 5 MiB. Malformed images and images with excessive dimensions return `400`.

Tests now reject malformed compressed image data and a 5,000 × 5,000 image. They also confirm a valid test image is re-encoded to a readable 1 × 1 image without EXIF metadata.

## Files changed for Stage 1

- `server/src/api.js`
- `server/src/api.test.js`
- `server/package.json` (added exact dependency `sharp@0.35.0`; existing Phase D script/dependency changes were preserved)
- `server/package-lock.json` (sharp and platform packages added to the existing untracked lockfile)
- `docs/phase-d-remediation-stage-1-report.md` (this report)

Other pre-existing workspace changes remain untouched.

## Verification and exact results

- `npm.cmd test --prefix server` — **passed**: database/auth/import suite 18 passed, 0 failed; API suite 11 tests reported, 0 failed (including the nested API scenarios).
- `npm.cmd run lint` — **passed**, exit code 0.
- `npm.cmd run typecheck` — **passed**, exit code 0.
- `git diff --check` — **passed**. Git emitted line-ending normalization warnings for pre-existing modified files; no whitespace errors were reported.
- `npm.cmd ls --prefix server sharp --depth=0` — **passed**, reports `sharp@0.35.0`.

Installation command and result:

```text
npm.cmd install --save-exact sharp@0.35.0 --registry=https://registry.npmjs.org/
added 3 packages, and audited 42 packages in 6s
```

The install reported one high-severity audit issue and warned that the existing `better-sqlite3@12.11.1` install script was not covered by the current `allowScripts` policy. `npm audit --omit=dev --json` could not retrieve advisory details because the registry audit endpoint failed with `getaddrinfo ENOTFOUND registry.npmjs.org`. No `npm audit fix` was run. The advisory should be identified and reviewed when registry access is available.

## Remaining risks

- Rate-limit counters are process-local and reset on restart. Multiple server processes do not share them; a public deployment still needs equivalent limits at a trusted reverse proxy or shared limiter.
- The default upload quota is 500 MiB and counts regular files directly inside the upload directory. Operators should set `UPLOAD_STORAGE_MAX_BYTES` to match available persistent storage and monitor free disk space.
- Image decoding remains native work in the API process. Pixel, cache, thread, and request-concurrency limits reduce resource exposure, but deployment-level CPU/memory limits and reverse-proxy body/time limits are still recommended.
- The npm install reported a high-severity advisory, but advisory details could not be fetched because of DNS/network failure. Review it before deployment.
- `sharp` supplies platform-specific native packages. Deployment environments must install the correct optional platform package; verify packaging on each production target.

## Scope and status

Only H-1, M-1, and M-3 were addressed. No Stage 2 work was started. All existing workspace changes were preserved. No production data or accounts were touched, and nothing was staged, committed, or pushed.
