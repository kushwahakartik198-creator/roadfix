import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "roadfix_session";
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SCRYPT_PARAMETERS = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 64 });
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function hashPassword(password) {
  assertPassword(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_PARAMETERS.keyLength, {
    N: SCRYPT_PARAMETERS.N,
    r: SCRYPT_PARAMETERS.r,
    p: SCRYPT_PARAMETERS.p,
    maxmem: SCRYPT_MAXMEM,
  });
  return {
    passwordHash: Buffer.from(derived).toString("base64url"),
    passwordSalt: salt.toString("base64url"),
    hashParameters: JSON.stringify({ algorithm: "scrypt-v1", ...SCRYPT_PARAMETERS }),
  };
}

export function assertPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new AuthValidationError("Password must be between 12 and 128 characters");
  }
}

export async function verifyPassword(password, credential) {
  if (typeof password !== "string" || password.length > 128 || !credential) return false;
  try {
    const rawParameters = credential.hash_parameters ?? credential.hashParameters;
    const parameters = typeof rawParameters === "string" ? JSON.parse(rawParameters) : rawParameters;
    if (parameters.algorithm !== "scrypt-v1" || parameters.N !== 32768 || parameters.r !== 8 || parameters.p !== 1 || parameters.keyLength !== 64) return false;
    const salt = Buffer.from(credential.password_salt ?? credential.passwordSalt, "base64url");
    const expected = Buffer.from(credential.password_hash ?? credential.passwordHash, "base64url");
    if (salt.length !== 16 || expected.length !== parameters.keyLength) return false;
    const derived = Buffer.from(await scrypt(password, salt, parameters.keyLength, {
      N: parameters.N,
      r: parameters.r,
      p: parameters.p,
      maxmem: SCRYPT_MAXMEM,
    }));
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!cookies.has(name)) cookies.set(name, value);
  }
  return cookies;
}

export function createSession(db, userId, { now = new Date() } = {}) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS).toISOString();
  const idleBefore = new Date(now.getTime() - SESSION_IDLE_MS).toISOString();
  const discardBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL
      AND (expires_at <= ? OR last_seen_at <= ?)`).run(createdAt, createdAt, idleBefore);
    db.prepare("DELETE FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at <= ?").run(discardBefore);
    db.prepare(`INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, hashSessionToken(token), csrfToken, createdAt, createdAt, expiresAt);
    const excess = db.prepare(`SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 5`).all(userId);
    const revoke = db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?");
    for (const row of excess) revoke.run(createdAt, row.id);
  });
  tx.immediate();
  return { token, csrfToken, expiresAt };
}

export function findSession(db, token, { now = new Date() } = {}) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = hashSessionToken(token);
  const row = db.prepare(`SELECT s.id AS sessionId, s.user_id AS userId, s.token_hash AS tokenHash,
    s.csrf_token AS csrfToken, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt,
    s.expires_at AS expiresAt, u.role, u.display_name AS displayName, u.active AS userActive,
    o.id AS officerId, o.ward_id AS wardId, o.active AS officerActive
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN officers o ON o.user_id = u.id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL`).get(tokenHash);
  if (!row) return null;
  if (!row.userActive || Date.parse(row.expiresAt) <= now.getTime() || Date.parse(row.lastSeenAt) + SESSION_IDLE_MS <= now.getTime()) {
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now.toISOString(), row.sessionId);
    return null;
  }
  if (row.role === "officer" && (!row.officerId || !row.officerActive || !row.wardId)) return null;
  const lastSeen = Date.parse(row.lastSeenAt);
  if (now.getTime() - lastSeen >= 5 * 60 * 1000) {
    const nextSeen = now.toISOString();
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL").run(nextSeen, row.sessionId);
    row.lastSeenAt = nextSeen;
  }
  return row;
}

export function validateCsrf(session, suppliedToken) {
  if (typeof suppliedToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(suppliedToken)) return false;
  const expected = Buffer.from(session.csrfToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function revokeSession(db, sessionId, { now = new Date() } = {}) {
  return db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now.toISOString(), sessionId).changes > 0;
}

export function sessionCookie(token, { secure = true, maxAgeSeconds = SESSION_ABSOLUTE_MS / 1000 } = {}) {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie({ secure = true } = {}) {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export class AuthValidationError extends Error {}
