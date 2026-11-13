import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, migrateDatabase, DEFAULT_MIGRATIONS_DIR } from "../db/database.js";
import { provisionInitialAdmin, provisionStaffAccount, setStaffAccountActive } from "./accounts.js";
import { createSession, findSession, hashPassword, hashSessionToken, parseCookies, revokeSession, sessionCookie, clearSessionCookie, validateCsrf, verifyPassword } from "./security.js";
import { FixedWindowLimiter, loginRateKeys, requestRemoteAddress } from "./rate-limit.js";

test("scrypt credentials and one-time temporary administrator bootstrap", async () => {
  const tempRoot = mkdtempSync(join(process.cwd(), ".roadfix-auth-test-"));
  const db = openDatabase({ dbPath: join(tempRoot, "auth.sqlite") });
  try {
    const firstHash = await hashPassword("CorrectHorseBattery-42");
    const secondHash = await hashPassword("CorrectHorseBattery-42");
    assert.notEqual(firstHash.passwordSalt, secondHash.passwordSalt);
    assert.notEqual(firstHash.passwordHash, secondHash.passwordHash);
    assert.equal(await verifyPassword("CorrectHorseBattery-42", firstHash), true);
    assert.equal(await verifyPassword("wrong-password", firstHash), false);
    assert.equal(await verifyPassword("CorrectHorseBattery-42", null), false);
    await assert.rejects(hashPassword("short"), /12 and 128/);

    const admin = await provisionInitialAdmin(db, { email: "Owner@Example.test", password: "BootstrappedAdmin-42", displayName: "Temporary Owner" });
    assert.equal(admin.email, "owner@example.test");
    await assert.rejects(provisionInitialAdmin(db, { email: "second@example.test", password: "AnotherAdminPass-42" }), /already been used/);
    const user = db.prepare("SELECT active, role FROM users WHERE id = ?").get(admin.id);
    assert.deepEqual(user, { active: 1, role: "admin" });
    assert.equal(db.prepare("SELECT count(*) AS count FROM admin_audit_log WHERE action = 'initial_admin_bootstrap'").get().count, 1);
  } finally { db.close(); rmSync(tempRoot, { recursive: true, force: true }); }
});

test("session expiry, idle timeout, revocation, CSRF and cookie attributes", () => {
  const tempRoot = mkdtempSync(join(process.cwd(), ".roadfix-session-test-"));
  const db = openDatabase({ dbPath: join(tempRoot, "session.sqlite") });
  try {
    const now = new Date("2026-01-01T00:00:00.000Z");
    db.prepare(`INSERT INTO users (id, email, role, active, created_at, updated_at)
      VALUES ('admin-1', 'admin@example.test', 'admin', 1, ?, ?)`).run(now.toISOString(), now.toISOString());
    const session = createSession(db, "admin-1", { now });
    const tokenHash = db.prepare("SELECT token_hash FROM sessions WHERE user_id = 'admin-1'").get().token_hash;
    assert.notEqual(tokenHash, session.token);
    assert.equal(tokenHash.length, 64);
    const cookieSession = findSession(db, session.token, { now: new Date(now.getTime() + 1000) });
    assert.equal(cookieSession.role, "admin");
    assert.equal(validateCsrf(cookieSession, session.csrfToken), true);
    assert.equal(validateCsrf(cookieSession, "not-the-csrf-token"), false);
    assert.equal(findSession(db, session.token, { now: new Date(now.getTime() + 30 * 60 * 1000) }), null);
    const second = createSession(db, "admin-1", { now });
    assert.equal(findSession(db, second.token, { now: new Date(now.getTime() + 8 * 60 * 60 * 1000) }), null);
    const third = createSession(db, "admin-1", { now });
    assert.equal(revokeSession(db, db.prepare("SELECT id FROM sessions WHERE token_hash = ?").get(hashSessionToken(third.token)).id, { now }), true);
    assert.equal(findSession(db, third.token, { now }), null);
    assert.match(sessionCookie(third.token, { secure: true }), /HttpOnly; SameSite=Lax; Max-Age=28800; Secure/);
    assert.match(sessionCookie(third.token), /; Secure$/);
    assert.doesNotMatch(sessionCookie(third.token, { secure: false }), /Secure/);
    assert.match(clearSessionCookie({ secure: true }), /Max-Age=0; Secure/);
    assert.match(clearSessionCookie(), /; Secure$/);
    assert.equal(parseCookies("a=1; roadfix_session=abc; b=2").get("roadfix_session"), "abc");
  } finally { db.close(); rmSync(tempRoot, { recursive: true, force: true }); }
});

test("deactivation revokes sessions and blocks the last active administrator", async () => {
  const tempRoot = mkdtempSync(join(process.cwd(), ".roadfix-account-test-"));
  const db = openDatabase({ dbPath: join(tempRoot, "accounts.sqlite") });
  try {
    const admin = await provisionInitialAdmin(db, { email: "admin@example.test", password: "AdministratorPass-42" });
    const officer = await provisionStaffAccount(db, { email: "officer@example.test", password: "OfficerAccountPass-42", displayName: "Officer", role: "officer", wardId: null, actor: { userId: admin.id, role: "admin" } }).catch(() => null);
    assert.equal(officer, null);
    const wardNow = new Date().toISOString();
    db.prepare(`INSERT INTO wards (id, code, name, latitude, longitude, ward_number, created_at)
      VALUES ('ward-a', 'A', 'A', 0, 0, 'A', ?)`).run(wardNow);
    const staff = await provisionStaffAccount(db, { email: "officer@example.test", password: "OfficerAccountPass-42", displayName: "Officer", role: "officer", wardId: "ward-a", actor: { userId: admin.id, role: "admin" } });
    const session = createSession(db, staff.id);
    assert.throws(() => setStaffAccountActive(db, { userId: admin.id, active: false, actor: { userId: admin.id, role: "admin" } }), /cannot deactivate your own/);
    assert.equal(setStaffAccountActive(db, { userId: staff.id, active: false, actor: { userId: admin.id, role: "admin" } }), true);
    assert.equal(findSession(db, session.token), null);
    assert.equal(db.prepare("SELECT active FROM officers WHERE user_id = ?").get(staff.id).active, 0);
  } finally { db.close(); rmSync(tempRoot, { recursive: true, force: true }); }
});

test("auth migration adds credentials and sessions without changing existing rows", () => {
  const tempRoot = mkdtempSync(join(process.cwd(), ".roadfix-auth-migration-"));
  const oldMigrations = join(tempRoot, "old-migrations");
  mkdirSync(oldMigrations);
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, "001_core.sql"), join(oldMigrations, "001_core.sql"));
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, "002_indexes.sql"), join(oldMigrations, "002_indexes.sql"));
  const db = openDatabase({ dbPath: join(tempRoot, "preserve.sqlite"), migrationsDir: oldMigrations });
  try {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id,email,role,display_name,created_at,updated_at)
      VALUES ('legacy-user','legacy@example.test','officer','Legacy Officer',?,?)`).run(now, now);
    db.prepare(`INSERT INTO wards (id,code,name,latitude,longitude,ward_number,created_at)
      VALUES ('ward-x','X','X',0,0,'X',?)`).run(now);
    db.prepare(`INSERT INTO officers (id,user_id,ward_id,display_name,phone,active,created_at)
      VALUES ('officer-x','legacy-user','ward-x','Legacy Officer','+911111111111',1,?)`).run(now);
    db.prepare(`INSERT INTO complaints (id,reference,title,description,category,status,severity,ward_id,latitude,longitude,status_updated_at,created_at,updated_at)
      VALUES ('complaint-x','RF-AG-01234567','Title','A synthetic legacy complaint','pothole','submitted','medium','ward-x',0,0,?,?,?)`).run(now, now, now);
    db.prepare(`INSERT INTO complaint_private (complaint_id,reporter_name,reporter_contact,created_at,updated_at)
      VALUES ('complaint-x','Reporter','+919999999999',?,?)`).run(now, now);
    db.prepare(`INSERT INTO complaint_images (id,complaint_id,slot,storage_path,content_type,size_bytes,created_at)
      VALUES ('image-x','complaint-x',1,'image-x.png','image/png',10,?)`).run(now);
    db.prepare(`INSERT INTO complaint_status_history (id,complaint_id,event_type,to_status,actor_role,created_at)
      VALUES ('history-x','complaint-x','created','submitted','system',?)`).run(now);
    db.prepare(`INSERT INTO admin_audit_log (actor_role,action,target_complaint_id,created_at)
      VALUES ('system','synthetic_audit','complaint-x',?)`).run(now);
    const before = db.prepare(`SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM officers) officers,
      (SELECT count(*) FROM complaints) complaints, (SELECT count(*) FROM complaint_private) private,
      (SELECT count(*) FROM complaint_images) images, (SELECT count(*) FROM complaint_status_history) history,
      (SELECT count(*) FROM admin_audit_log) audit`).get();
    migrateDatabase(db, { migrationsDir: DEFAULT_MIGRATIONS_DIR });
    const after = db.prepare(`SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM officers) officers,
      (SELECT count(*) FROM complaints) complaints, (SELECT count(*) FROM complaint_private) private,
      (SELECT count(*) FROM complaint_images) images, (SELECT count(*) FROM complaint_status_history) history,
      (SELECT count(*) FROM admin_audit_log) audit`).get();
    assert.deepEqual(after, before);
    assert.equal(db.prepare("SELECT active FROM users WHERE id='legacy-user'").get().active, 0);
    assert.throws(() => db.prepare("UPDATE admin_audit_log SET action='changed' WHERE action='synthetic_audit'").run(), /append-only/);
    assert.equal(db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get().version, "003");
  } finally { db.close(); rmSync(tempRoot, { recursive: true, force: true }); }
});

test("fixed-window limiter stays bounded and ignores forwarded IP headers", () => {
  let now = 1000;
  const limiter = new FixedWindowLimiter({ maxKeys: 2, now: () => now });
  assert.equal(limiter.consume("one", { limit: 1, windowMs: 1000 }).allowed, true);
  assert.equal(limiter.consume("one", { limit: 1, windowMs: 1000 }).allowed, false);
  limiter.consume("two", { limit: 1, windowMs: 1000 });
  limiter.consume("three", { limit: 1, windowMs: 1000 });
  assert.ok(limiter.size <= 2);
  now += 1001;
  assert.equal(limiter.consume("four", { limit: 1, windowMs: 1000 }).allowed, true);
  assert.deepEqual(loginRateKeys("127.0.0.1", "user@example.test").map((k) => k.split(":")[1]), ["ip", "email"]);
  assert.equal(requestRemoteAddress({ headers: { "x-forwarded-for": "1.2.3.4" }, socket: { remoteAddress: "127.0.0.1" } }), "127.0.0.1");
});
