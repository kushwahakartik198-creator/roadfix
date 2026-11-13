import { randomUUID } from "node:crypto";
import { assertPassword, hashPassword, normalizeEmail } from "./security.js";

export async function provisionInitialAdmin(db, { email, password, displayName = "Administrator" }) {
  const normalizedEmail = requireEmail(email);
  assertPassword(password);
  const credential = await hashPassword(password);
  const userId = randomUUID();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const previousBootstrap = db.prepare("SELECT 1 FROM admin_audit_log WHERE action = 'initial_admin_bootstrap' LIMIT 1").get();
    const credentialedAdmin = db.prepare(`SELECT 1 FROM users u JOIN user_credentials c ON c.user_id = u.id
      WHERE u.role = 'admin' AND u.active = 1 LIMIT 1`).get();
    const existing = previousBootstrap || credentialedAdmin;
    if (existing) throw new AccountProvisionError("Administrator bootstrap has already been used");
    db.prepare(`INSERT INTO users (id, email, role, display_name, created_at, updated_at, active)
      VALUES (?, ?, 'admin', ?, ?, ?, 1)`).run(userId, normalizedEmail, cleanName(displayName), now, now);
    insertCredential(db, userId, credential, now);
    db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_user_id, created_at)
      VALUES (NULL, 'system', 'initial_admin_bootstrap', ?, ?)`).run(userId, now);
  });
  tx.immediate();
  return { id: userId, email: normalizedEmail, role: "admin", displayName: cleanName(displayName) };
}

export async function provisionStaffAccount(db, { email, password, displayName, role, wardId, actor }) {
  if (actor?.role !== "admin") throw new AccountProvisionError("Administrator access required");
  if (!new Set(["officer", "admin"]).has(role)) throw new AccountProvisionError("Only officer or admin accounts can be provisioned");
  const normalizedEmail = requireEmail(email);
  assertPassword(password);
  const name = cleanName(displayName);
  if (role === "officer" && (typeof wardId !== "string" || !wardId.trim())) throw new AccountProvisionError("A ward is required for an officer account");
  const credential = await hashPassword(password);
  const userId = randomUUID();
  const officerId = role === "officer" ? randomUUID() : null;
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (role === "officer" && !db.prepare("SELECT 1 FROM wards WHERE id = ? AND active = 1").get(wardId)) {
      throw new AccountProvisionError("Ward not found or inactive");
    }
    db.prepare(`INSERT INTO users (id, email, role, display_name, created_at, updated_at, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)`).run(userId, normalizedEmail, role, name, now, now);
    insertCredential(db, userId, credential, now);
    if (role === "officer") {
      db.prepare(`INSERT INTO officers (id, user_id, ward_id, display_name, active, created_at)
        VALUES (?, ?, ?, ?, 1, ?)`).run(officerId, userId, wardId, name, now);
    }
    db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_user_id, created_at)
      VALUES (?, 'admin', ?, ?, ?)`).run(actor.userId, role === "officer" ? "officer_account_created" : "admin_account_created", userId, now);
  });
  try { tx.immediate(); }
  catch (error) {
    if (String(error?.code ?? "").startsWith("SQLITE_CONSTRAINT_UNIQUE")) throw new AccountProvisionError("An account with that email already exists");
    throw error;
  }
  return { id: userId, officerId, email: normalizedEmail, role, displayName: name, wardId: wardId ?? null, active: true };
}

export function setStaffAccountActive(db, { userId, active, actor }) {
  if (actor?.role !== "admin") throw new AccountProvisionError("Administrator access required");
  if (typeof active !== "boolean") throw new AccountProvisionError("active must be a boolean");
  if (actor.userId === userId && !active) throw new AccountProvisionError("You cannot deactivate your own account");
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const user = db.prepare("SELECT id, role FROM users WHERE id = ? AND role IN ('officer','admin')").get(userId);
    if (!user) return false;
    if (!active && user.role === "admin") {
      const otherAdmins = db.prepare("SELECT count(*) AS count FROM users WHERE role = 'admin' AND active = 1 AND id <> ?").get(userId).count;
      if (otherAdmins === 0) throw new AccountProvisionError("The last active administrator cannot be deactivated");
    }
    db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?").run(active ? 1 : 0, now, userId);
    if (user.role === "officer") db.prepare("UPDATE officers SET active = ? WHERE user_id = ?").run(active ? 1 : 0, userId);
    if (!active) db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, userId);
    db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_user_id, created_at)
      VALUES (?, 'admin', ?, ?, ?)`).run(actor.userId, active ? "staff_account_activated" : "staff_account_deactivated", userId, now);
    return true;
  });
  return tx.immediate();
}

function insertCredential(db, userId, credential, now) {
  db.prepare(`INSERT INTO user_credentials (user_id, password_hash, password_salt, hash_parameters, changed_at)
    VALUES (?, ?, ?, ?, ?)`).run(userId, credential.passwordHash, credential.passwordSalt, credential.hashParameters, now);
}

function requireEmail(value) {
  const email = normalizeEmail(value);
  if (!email) throw new AccountProvisionError("A valid email address is required");
  return email;
}

function cleanName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) throw new AccountProvisionError("Display name must be between 1 and 120 characters");
  return value.trim();
}

export class AccountProvisionError extends Error {}
