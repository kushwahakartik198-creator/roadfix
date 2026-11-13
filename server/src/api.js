import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepository, CATEGORIES, STATUSES, SEVERITIES, ValidationError } from "./db/repository.js";
import { readJsonBody, sendJson } from "./http.js";
import { createAuthService } from "./auth/service.js";
import { AccountProvisionError, provisionStaffAccount, setStaffAccountActive } from "./auth/accounts.js";
import { FixedWindowLimiter, loginRateKeys, requestRemoteAddress } from "./auth/rate-limit.js";
import { normalizeEmail, validateCsrf } from "./auth/security.js";
import sharp from "sharp";
import { createSecurityConfig } from "./security-config.js";

const SERVER_ROOT = fileURLToPath(new URL("../", import.meta.url));
const UPLOADS_ROOT = resolve(SERVER_ROOT, "data", "uploads");
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_REQUEST_BYTES = 22 * 1024 * 1024;
const SUBMISSION_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_UPLOAD_QUOTA_BYTES = 500 * 1024 * 1024;

sharp.concurrency(1);
sharp.cache({ memory: 50, files: 0, items: 20 });

export function resolvePrivateUploadPath(root, filename) {
  if (typeof filename !== "string" || filename !== basename(filename) || filename.includes("\\") || filename === "." || filename === "..") {
    throw new Error("Invalid upload path");
  }
  const base = resolve(root);
  const candidate = resolve(base, filename);
  if (!candidate.startsWith(`${base}${sep}`)) throw new Error("Invalid upload path");
  return candidate;
}

export function validatePhotoDataUrl(value) {
  if (typeof value !== "string") throw new ValidationError("Photo must be an image data URL");
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new ValidationError("Photo must be a base64 JPEG, PNG or WebP image");
  const contentType = match[1];
  const base64 = match[2];
  if (base64.length % 4 !== 0) throw new ValidationError("Photo data is invalid");
  const data = Buffer.from(base64, "base64");
  if (!data.length || data.length > MAX_IMAGE_SIZE || data.toString("base64") !== base64) {
    throw new ValidationError("Photo must be between 1 byte and 5 MiB");
  }
  let valid = false;
  try {
    valid = contentType === "image/jpeg" ? isJpeg(data)
      : contentType === "image/png" ? isPng(data)
        : isWebp(data);
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError("Photo content does not match its image type");
  return { contentType, data };
}

function isPng(data) {
  if (data.length < 45 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8;
  let first = true;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > data.length) return false;
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunkData = data.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = data.readUInt32BE(offset + 8 + length);
    if (crc32(data.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) return false;
    if (["tEXt", "iTXt", "zTXt", "eXIf"].includes(type)) return false;
    if (first && (type !== "IHDR" || length !== 13 || chunkData.readUInt32BE(0) < 1 || chunkData.readUInt32BE(4) < 1)) return false;
    first = false;
    if (type === "IEND") return length === 0 && end === data.length;
    offset = end;
  }
  return false;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isWebp(data) {
  if (data.length < 20 || data.toString("ascii", 0, 4) !== "RIFF" || data.readUInt32LE(4) !== data.length - 8 || data.toString("ascii", 8, 12) !== "WEBP") return false;
  let offset = 12;
  let hasImage = false;
  while (offset + 8 <= data.length) {
    const type = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > data.length || ["EXIF", "XMP "].includes(type)) return false;
    if (["VP8 ", "VP8L", "VP8X"].includes(type)) hasImage = true;
    offset = end;
  }
  return hasImage && offset === data.length;
}

function isJpeg(data) {
  if (data.length < 12 || data[0] !== 0xff || data[1] !== 0xd8) return false;
  let offset = 2;
  let hasFrame = false;
  while (offset < data.length) {
    if (data[offset] !== 0xff) return false;
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xd9) return hasFrame && offset === data.length;
    if (marker === 0xda) {
      const scanLength = data.readUInt16BE(offset);
      if (scanLength < 2 || offset + scanLength > data.length) return false;
      const scan = offset + scanLength;
      return hasFrame && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9 && data.indexOf(Buffer.from([0xff, 0xd9]), scan) === data.length - 2;
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) return false;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) return false;
    // APP1 and APP13 commonly contain EXIF/IPTC location and camera metadata.
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) return false;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) hasFrame = true;
    offset += length;
  }
  return false;
}

export function createApiHandler({ db, securityConfig, uploadsRoot = UPLOADS_ROOT, submissionLimit = 5, submissionWindowMs = SUBMISSION_WINDOW_MS, maxConcurrentUploads = 2, uploadQuotaBytes = configuredUploadQuota() } = {}) {
  if (!db) throw new TypeError("A SQLite connection is required");
  const security = createSecurityConfig(securityConfig ? { mode: securityConfig.mode, corsOrigins: securityConfig.origins?.join(","), host: securityConfig.host } : {});
  const repo = createRepository(db);
  const auth = createAuthService(db, { secureCookies: security.secureCookies });
  const loginLimiter = new FixedWindowLimiter({ maxKeys: 20_000 });
  const trackingLimiter = new FixedWindowLimiter({ maxKeys: 20_000 });
  const submissionLimiter = new FixedWindowLimiter({ maxKeys: 20_000 });
  let activeSubmissions = 0;
  let reservedUploadBytes = 0;
  const origins = security.origins;
  return async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, X-Page, X-Page-Size");
    if (origin && !origins.includes(origin)) return sendJson(res, 403, { ok: false, error: "Origin is not allowed" });
    if (req.method === "OPTIONS") {
      res.writeHead(204); res.end(); return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    try {
      if (path === "/api/auth/login" && req.method === "POST") {
        if (!requireOrigin(req, origins)) return sendJson(res, 403, { ok: false, error: "Origin is not allowed" });
        const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("A JSON object is required");
        const emailKey = normalizeEmail(body.email) ?? (String(body.email ?? "").trim().toLowerCase().slice(0, 254) || "invalid");
        const keys = loginRateKeys(requestRemoteAddress(req), emailKey);
        const ipLimit = loginLimiter.consume(keys[0], { limit: 20, windowMs: 15 * 60 * 1000 });
        const emailLimit = loginLimiter.consume(keys[1], { limit: 5, windowMs: 15 * 60 * 1000 });
        if (!ipLimit.allowed || !emailLimit.allowed) {
          const retryAfter = Math.max(!ipLimit.allowed ? ipLimit.retryAfter : 0, !emailLimit.allowed ? emailLimit.retryAfter : 0);
          res.setHeader("Retry-After", String(retryAfter));
          return sendJson(res, 429, { ok: false, error: "Too many login attempts. Try again later." });
        }
        const result = await auth.login(body.email, body.password);
        if (!result) return sendJson(res, 401, { ok: false, error: "Email or password is incorrect" });
        for (const key of keys) loginLimiter.reset(key);
        res.setHeader("Set-Cookie", auth.cookie(result.session.token));
        res.setHeader("Cache-Control", "no-store");
        return sendJson(res, 200, { ok: true, data: { user: result.user, csrfToken: result.session.csrfToken, expiresAt: result.session.expiresAt } });
      }
      if (path === "/api/auth/session" && req.method === "GET") {
        const session = auth.authenticate(req);
        if (!session) return sendJson(res, 401, { ok: false, error: "Authentication required" });
        res.setHeader("Cache-Control", "no-store");
        return sendJson(res, 200, { ok: true, data: { user: { id: session.userId, displayName: session.displayName, role: session.role, officerId: session.officerId, wardId: session.wardId }, csrfToken: session.csrfToken, expiresAt: session.expiresAt } });
      }
      if (path === "/api/auth/logout" && req.method === "POST") {
        if (!requireOrigin(req, origins)) return sendJson(res, 403, { ok: false, error: "Origin is not allowed" });
        const session = auth.authenticate(req);
        if (session) {
          if (!validateCsrf(session, req.headers["x-csrf-token"])) return sendJson(res, 403, { ok: false, error: "CSRF validation failed" });
          auth.revoke(session.sessionId);
        }
        res.setHeader("Set-Cookie", auth.clearCookie());
        res.setHeader("Cache-Control", "no-store");
        return sendJson(res, 200, { ok: true, data: { loggedOut: true } });
      }

      if (req.method === "GET" && path === "/api/health") {
        db.prepare("SELECT 1").get();
        return sendJson(res, 200, { ok: true, service: "roadfix-local-server", port: Number(process.env.PORT) || 4000, database: "ok" });
      }
      if (path === "/api/wards" && req.method === "GET") {
        const data = repo.listWards({ q: boundedParam(url, "q", 100), active: url.searchParams.get("active") });
        return sendJson(res, 200, { ok: true, data, count: data.length });
      }
      const wardIssues = path.match(/^\/api\/wards\/([^/]+)\/issues$/);
      if (wardIssues && req.method === "GET") {
        if (!repo.getWard(decodeSegment(wardIssues[1]))) return sendJson(res, 404, { ok: false, error: "Ward not found" });
        const result = repo.listWardIssues({ wardId: decodeSegment(wardIssues[1]), status: validOptional(url, "status", STATUSES), severity: validOptional(url, "severity", SEVERITIES), page: url.searchParams.get("page"), pageSize: url.searchParams.get("pageSize") });
        return sendPaged(res, result);
      }
      const ward = path.match(/^\/api\/wards\/([^/]+)$/);
      if (ward && req.method === "GET") {
        const row = repo.getWard(decodeSegment(ward[1]));
        return row ? sendJson(res, 200, { ok: true, data: row }) : sendJson(res, 404, { ok: false, error: "Ward not found" });
      }
      if (path === "/api/wards" && req.method === "POST") {
        const session = requireRole(req, res, auth, ["admin"]);
        if (!session) return;
        if (!validateMutation(req, res, session, origins)) return;
        const body = await readJsonBody(req);
        validateWardInput(body);
        const data = repo.createWard(body, session);
        return sendJson(res, 201, { ok: true, data });
      }

      if (path === "/api/admin/accounts" && req.method === "GET") {
        const session = requireRole(req, res, auth, ["admin"]);
        if (!session) return;
        res.setHeader("Cache-Control", "private, no-store");
        return sendJson(res, 200, { ok: true, data: repo.listAccounts() });
      }
      if (path === "/api/admin/audit" && req.method === "GET") {
        const session = requireRole(req, res, auth, ["admin"]);
        if (!session) return;
        res.setHeader("Cache-Control", "private, no-store");
        return sendJson(res, 200, { ok: true, data: repo.listAuditLog(url.searchParams.get("limit")) });
      }
      if (path === "/api/admin/accounts" && req.method === "POST") {
        const session = requireRole(req, res, auth, ["admin"]);
        if (!session) return;
        if (!validateMutation(req, res, session, origins)) return;
        const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
        const data = await provisionStaffAccount(db, { ...(body ?? {}), actor: session });
        return sendJson(res, 201, { ok: true, data });
      }
      const adminAccount = path.match(/^\/api\/admin\/accounts\/([^/]+)$/);
      if (adminAccount && req.method === "PATCH") {
        const session = requireRole(req, res, auth, ["admin"]);
        if (!session) return;
        if (!validateMutation(req, res, session, origins)) return;
        const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
        const userId = decodeSegment(adminAccount[1]);
        if (typeof body?.active === "boolean" && Object.keys(body).length === 1) {
          if (!setStaffAccountActive(db, { userId, active: body.active, actor: session })) return sendJson(res, 404, { ok: false, error: "Account not found" });
        } else if (Object.keys(body ?? {}).length === 1 && (typeof body.wardId === "string" || body.wardId === null)) {
          if (!repo.updateOfficerWard(userId, body.wardId, session)) return sendJson(res, 404, { ok: false, error: "Officer account not found" });
        } else throw new ValidationError("Provide only active or wardId");
        return sendJson(res, 200, { ok: true, data: { updated: true } });
      }

      if (path === "/api/officers" && req.method === "GET") {
        const data = repo.listOfficers({ q: boundedParam(url, "q", 100), wardId: boundedParam(url, "wardId", 100), active: url.searchParams.get("active") });
        return sendJson(res, 200, { ok: true, data, count: data.length });
      }
      const officer = path.match(/^\/api\/officers\/([^/]+)$/);
      if (officer && req.method === "GET") {
        const row = repo.getOfficer(decodeSegment(officer[1]));
        return row ? sendJson(res, 200, { ok: true, data: row }) : sendJson(res, 404, { ok: false, error: "Officer not found" });
      }

      if (path === "/api/issues" && req.method === "GET") {
        const session = requireRole(req, res, auth, ["officer", "admin"]);
        if (!session) return;
        const requestedWard = boundedParam(url, "wardId", 100);
        if (session.role === "officer" && requestedWard && requestedWard !== session.wardId) return sendJson(res, 403, { ok: false, error: "Access denied" });
        const result = repo.listOperationalComplaints({ actor: session, status: validOptional(url, "status", STATUSES), severity: validOptional(url, "severity", SEVERITIES), category: validOptional(url, "category", CATEGORIES), q: boundedParam(url, "q", 100), page: url.searchParams.get("page"), pageSize: url.searchParams.get("pageSize") });
        return sendPaged(res, result);
      }
      const track = path.match(/^\/api\/issues\/([^/]+)\/track$/);
      if (track && req.method === "GET") {
        const limit = trackingLimiter.consume(`track:${requestRemoteAddress(req)}`, { limit: 30, windowMs: 60 * 1000 });
        if (!limit.allowed) { res.setHeader("Retry-After", String(limit.retryAfter)); return sendJson(res, 429, { ok: false, error: "Too many tracking requests. Try again later." }); }
        const row = repo.getComplaintByReference(decodeSegment(track[1]));
        return row ? sendJson(res, 200, { ok: true, data: { reference: row.reference, status: row.status, submittedAt: row.submittedAt, lastUpdatedAt: row.lastUpdatedAt, locationDescription: row.locationDescription } }) : sendJson(res, 404, { ok: false, error: "Complaint not found" });
      }
      const publicHistory = path.match(/^\/api\/issues\/([^/]+)\/track\/history$/);
      if (publicHistory && req.method === "GET") {
        const reference = decodeSegment(publicHistory[1]);
        const limit = trackingLimiter.consume(`track:${requestRemoteAddress(req)}`, { limit: 30, windowMs: 60 * 1000 });
        if (!limit.allowed) { res.setHeader("Retry-After", String(limit.retryAfter)); return sendJson(res, 429, { ok: false, error: "Too many tracking requests. Try again later." }); }
        const row = repo.getComplaintByReference(reference);
        if (!row) return sendJson(res, 404, { ok: false, error: "Complaint not found" });
        return sendJson(res, 200, { ok: true, data: repo.getHistory(row.id) });
      }
      const history = path.match(/^\/api\/issues\/([^/]+)\/history$/);
      if (history && req.method === "GET") {
        const limit = trackingLimiter.consume(`track:${requestRemoteAddress(req)}`, { limit: 30, windowMs: 60 * 1000 });
        if (!limit.allowed) { res.setHeader("Retry-After", String(limit.retryAfter)); return sendJson(res, 429, { ok: false, error: "Too many tracking requests. Try again later." }); }
        const id = decodeSegment(history[1]);
        if (!repo.getComplaint(id)) return sendJson(res, 404, { ok: false, error: "Complaint not found" });
        return sendJson(res, 200, { ok: true, data: repo.getHistory(id) });
      }
      const contact = path.match(/^\/api\/issues\/([^/]+)\/reporter-contact$/);
      if (contact && req.method === "GET") {
        const session = requireRole(req, res, auth, ["officer", "admin"]);
        if (!session) return;
        const result = repo.readReporterContact(decodeSegment(contact[1]), session);
        if (!result.found) return sendJson(res, 404, { ok: false, error: "Complaint not found" });
        if (!result.allowed) return sendJson(res, 403, { ok: false, error: "Access denied" });
        res.setHeader("Cache-Control", "private, no-store");
        return sendJson(res, 200, { ok: true, data: result.contact });
      }
      const complaintPhotos = path.match(/^\/api\/issues\/([^/]+)\/photos$/);
      if (complaintPhotos && req.method === "GET") {
        const session = requireRole(req, res, auth, ["officer", "admin"]);
        if (!session) return;
        const result = repo.listComplaintImages(decodeSegment(complaintPhotos[1]), session);
        if (!result.found) return sendJson(res, 404, { ok: false, error: "Complaint not found" });
        if (!result.allowed) return sendJson(res, 403, { ok: false, error: "Access denied" });
        res.setHeader("Cache-Control", "private, no-store");
        return sendJson(res, 200, { ok: true, data: result.images });
      }
      const complaintPhoto = path.match(/^\/api\/issues\/([^/]+)\/photos\/([^/]+)$/);
      if (complaintPhoto && req.method === "GET") {
        const session = requireRole(req, res, auth, ["officer", "admin"]);
        if (!session) return;
        const result = repo.readComplaintImage(decodeSegment(complaintPhoto[1]), decodeSegment(complaintPhoto[2]), session);
        if (!result.found) return sendJson(res, 404, { ok: false, error: "Complaint not found" });
        if (!result.allowed) return sendJson(res, 403, { ok: false, error: "Access denied" });
        if (!result.image) return sendJson(res, 404, { ok: false, error: "Photo not found" });
        const filename = basename(result.image.storagePath);
        const filePath = resolvePrivateUploadPath(uploadsRoot, filename);
        const bytes = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": result.image.contentType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" });
        return res.end(bytes);
      }
      const assign = path.match(/^\/api\/issues\/([^/]+)\/assign$/);
      if (assign && req.method === "POST") {
        const session = requireRole(req, res, auth, ["admin"]);
        if (!session) return;
        if (!validateMutation(req, res, session, origins)) return;
        const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
        if (typeof body?.officerId !== "string") throw new ValidationError("officerId is required");
        const result = repo.assignComplaint(decodeSegment(assign[1]), { officerId: body.officerId, actorId: session.userId, actorRole: session.role });
        return result ? sendJson(res, 200, { ok: true, data: result }) : sendJson(res, 404, { ok: false, error: "Complaint not found" });
      }
      const issue = path.match(/^\/api\/issues\/([^/]+)$/);
      if (issue && req.method === "GET") {
        const row = repo.getComplaint(decodeSegment(issue[1]));
        return row ? sendJson(res, 200, { ok: true, data: row }) : sendJson(res, 404, { ok: false, error: "Complaint not found" });
      }
      if (issue && req.method === "PATCH") {
        const session = requireRole(req, res, auth, ["officer", "admin"]);
        if (!session) return;
        if (!validateMutation(req, res, session, origins)) return;
        const id = decodeSegment(issue[1]);
        const current = repo.getComplaintAuthorization(id);
        if (!current) return sendJson(res, 404, { ok: false, error: "Complaint not found" });
        if (session.role === "officer" && (current.wardId !== session.wardId || current.assignedOfficerId !== session.officerId)) return sendJson(res, 403, { ok: false, error: "Access denied" });
        const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("A JSON object is required");
        if (body.severity != null && !SEVERITIES.includes(body.severity)) throw new ValidationError("Invalid severity");
        if (body.status != null && !STATUSES.includes(body.status)) throw new ValidationError("Invalid status");
        if (body.status == null) throw new ValidationError("status is required");
        const result = repo.updateComplaintStatus(id, { status: body.status, severity: body.severity, note: body.note, actorId: session.userId, actorRole: session.role, isAdmin: session.role === "admin" });
        return result ? sendJson(res, 200, { ok: true, data: result }) : sendJson(res, 404, { ok: false, error: "Complaint not found" });
      }
      if (path === "/api/issues" && req.method === "POST") {
        const remoteAddress = requestRemoteAddress(req);
        const limit = submissionLimiter.consume(`submission:${remoteAddress}`, { limit: submissionLimit, windowMs: submissionWindowMs });
        if (!limit.allowed) { res.setHeader("Retry-After", String(limit.retryAfter)); return sendJson(res, 429, { ok: false, error: "Too many reports. Try again later." }); }
        if (activeSubmissions >= maxConcurrentUploads) { res.setHeader("Retry-After", "5"); return sendJson(res, 429, { ok: false, error: "Report service is busy. Try again shortly." }); }
        activeSubmissions += 1;
        try { return await createIssue(req, res, repo, uploadsRoot, { uploadQuotaBytes, reserve: (bytes) => {
          if (getUploadStorageBytes(uploadsRoot) + reservedUploadBytes + bytes > uploadQuotaBytes) return false;
          reservedUploadBytes += bytes;
          return true;
        }, release: (bytes) => { reservedUploadBytes -= bytes; } }); }
        finally { activeSubmissions -= 1; }
      }
      if (path === "/api/stats" && req.method === "GET") return sendJson(res, 200, { ok: true, data: repo.getStats() });
      if (/^\/uploads\/[^/]+$/.test(path) && req.method === "GET") return unauthorized(res, "Authentication required to access private uploads", req);
      return sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (error) {
      if (error instanceof AccountProvisionError) return sendJson(res, 400, { ok: false, error: error.message });
      if (error instanceof ValidationError) return sendJson(res, 400, { ok: false, error: error.message });
      if (error?.statusCode) return sendJson(res, error.statusCode, { ok: false, error: error.message });
      console.error("RoadFix API request failed", { method: req.method, path, error });
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  };
}

async function createIssue(req, res, repo, uploadsRoot, storage) {
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    req.resume();
    const error = new Error("Request body is too large"); error.statusCode = 413; throw error;
  }
  const body = await readJsonBody(req, { limitBytes: MAX_REQUEST_BYTES });
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("A JSON object is required");
  const required = ["wardId", "category", "description", "lat", "lng"];
  for (const field of required) if (body[field] === undefined || body[field] === null || body[field] === "") throw new ValidationError(`${field} is required`);
  if (typeof body.wardId !== "string" || body.wardId.length > 100 || !repo.getWard(body.wardId)) return sendJson(res, 404, { ok: false, error: "Ward not found" });
  if (!CATEGORIES.includes(body.category)) throw new ValidationError("Invalid complaint category");
  const severity = body.severity ?? "medium";
  if (!SEVERITIES.includes(severity)) throw new ValidationError("Invalid severity");
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new ValidationError("Invalid latitude or longitude");
  if (typeof body.description !== "string" || body.description.trim().length < 10 || body.description.trim().length > 1000) throw new ValidationError("Description must be between 10 and 1000 characters");
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : titleCase(body.category);
  if (title.length > 120) throw new ValidationError("Title must be 120 characters or fewer");
  const locationDescription = body.locationDescription == null ? null : String(body.locationDescription).trim();
  if (locationDescription?.length > 150) throw new ValidationError("Location description must be 150 characters or fewer");
  const reporterName = body.reporterName == null ? null : String(body.reporterName).trim();
  const reporterContact = body.reporterContact == null ? null : String(body.reporterContact).trim();
  if ((reporterName && reporterName.length > 120) || (reporterContact && reporterContact.length > 254)) throw new ValidationError("Reporter contact fields exceed their allowed length");
  const photos = body.photos ?? (body.photo ? [body.photo] : []);
  if (!Array.isArray(photos) || photos.length > 3) throw new ValidationError("A complaint may include at most three photos");
  const validated = [];
  for (const photo of photos) validated.push(await sanitizePhotoDataUrl(photo));
  const uploadBytes = validated.reduce((sum, photo) => sum + photo.data.length, 0);
  if (uploadBytes && !storage.reserve(uploadBytes)) { const error = new Error("Upload storage limit reached; try again later"); error.statusCode = 507; throw error; }
  const saved = [];
  try {
    for (const photo of validated) {
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[photo.contentType];
      const filename = `${randomUUID()}.${ext}`;
      const fullPath = resolvePrivateUploadPath(uploadsRoot, filename);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, photo.data, { flag: "wx", mode: 0o600 });
      saved.push({ storagePath: filename, fullPath, contentType: photo.contentType, size: photo.data.length });
    }
    const result = repo.createComplaint({ wardId: body.wardId, category: body.category, severity, lat, lng, description: body.description.trim(), title, locationDescription, reporterName, reporterContact }, saved);
    return sendJson(res, 201, { ok: true, data: result });
  } catch (error) {
    for (const file of saved) {
      try { unlinkSync(file.fullPath); }
      catch (cleanupError) { console.error("RoadFix orphan upload cleanup failed", { storagePath: file.storagePath, error: cleanupError }); }
    }
    throw error;
  } finally {
    if (uploadBytes) storage.release(uploadBytes);
  }
}

async function sanitizePhotoDataUrl(value) {
  const input = validatePhotoDataUrl(value);
  try {
    const decoder = sharp(input.data, { limitInputPixels: MAX_IMAGE_PIXELS, limitInputChannels: 4, failOn: "error", sequentialRead: true });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ValidationError("Photo dimensions exceed the allowed limit");
    }
    let output;
    if (input.contentType === "image/jpeg") output = await decoder.rotate().jpeg({ quality: 85 }).toBuffer();
    else if (input.contentType === "image/png") output = await decoder.rotate().png({ compressionLevel: 9 }).toBuffer();
    else output = await decoder.rotate().webp({ quality: 85 }).toBuffer();
    if (!output.length || output.length > MAX_IMAGE_SIZE) throw new ValidationError("Processed photo exceeds the 5 MiB limit");
    return { contentType: input.contentType, data: output };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Photo could not be safely decoded");
  }
}

function configuredUploadQuota() {
  const configured = process.env.UPLOAD_STORAGE_MAX_BYTES;
  if (configured == null || configured === "") return DEFAULT_UPLOAD_QUOTA_BYTES;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < MAX_IMAGE_SIZE || value > Number.MAX_SAFE_INTEGER) {
    throw new Error("UPLOAD_STORAGE_MAX_BYTES must be a safe integer of at least 5 MiB");
  }
  return value;
}

function getUploadStorageBytes(root) {
  if (!existsSync(root)) return 0;
  return readdirSync(root).reduce((total, entry) => {
    const path = resolve(root, entry);
    const stat = lstatSync(path);
    return total + (stat.isFile() ? stat.size : 0);
  }, 0);
}

function sendPaged(res, result) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "X-Total-Count": String(result.total), "X-Page": String(result.page), "X-Page-Size": String(result.pageSize) });
  res.end(JSON.stringify({ ok: true, data: result }));
}
function unauthorized(res, message = "Authentication required", req) {
  req?.resume();
  return sendJson(res, 401, { ok: false, error: message });
}
function requireOrigin(req, origins) { return typeof req.headers.origin === "string" && origins.includes(req.headers.origin); }
function requireRole(req, res, auth, roles) {
  const session = auth.authenticate(req);
  if (!session) { sendJson(res, 401, { ok: false, error: "Authentication required" }); return null; }
  if (!roles.includes(session.role)) { sendJson(res, 403, { ok: false, error: "Access denied" }); return null; }
  return session;
}
function validateMutation(req, res, session, origins) {
  if (!requireOrigin(req, origins)) { sendJson(res, 403, { ok: false, error: "Origin is not allowed" }); return false; }
  if (!validateCsrf(session, req.headers["x-csrf-token"])) { sendJson(res, 403, { ok: false, error: "CSRF validation failed" }); return false; }
  return true;
}
function validateWardInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("A JSON object is required");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!name || name.length > 100 || !code || code.length > 16) throw new ValidationError("Valid ward name and code are required");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new ValidationError("Valid ward coordinates are required");
  body.name = name;
  body.code = code;
  body.lat = lat;
  body.lng = lng;
  body.wardNumber = String(body.wardNumber ?? code).trim();
  body.description = body.description == null ? null : String(body.description).trim();
  if (body.description?.length > 500 || !body.wardNumber || body.wardNumber.length > 20) throw new ValidationError("Ward description or number is too long");
}
function boundedParam(url, key, max) { const value = url.searchParams.get(key); if (value && value.length > max) throw new ValidationError(`${key} is too long`); return value || undefined; }
function validOptional(url, key, options) { const value = url.searchParams.get(key); if (value && !options.includes(value)) throw new ValidationError(`Invalid ${key}`); return value || undefined; }
function decodeSegment(value) { try { return decodeURIComponent(value); } catch { throw new ValidationError("Invalid URL path"); } }
function titleCase(value) { return value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "); }
