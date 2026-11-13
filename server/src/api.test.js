import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { openDatabase } from "./db/database.js";
import { createRepository } from "./db/repository.js";
import { createApiHandler, resolvePrivateUploadPath } from "./api.js";
import { createSecurityConfig } from "./security-config.js";
import { createRoadFixServer } from "./index.js";
import { provisionInitialAdmin, provisionStaffAccount } from "./auth/accounts.js";

const ORIGIN = "http://127.0.0.1:5173";
const LOCAL_SECURITY = createSecurityConfig({ mode: "local", corsOrigins: ORIGIN, host: "127.0.0.1" });

test("authenticated API enforces roles, privacy, CSRF and persistence", async (t) => {
  const tempRoot = mkdtempSync(join(process.cwd(), ".roadfix-phase-d-"));
  const dbPath = join(tempRoot, "test.sqlite");
  const uploadRoot = join(tempRoot, "private-uploads");
  let db = openDatabase({ dbPath });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO wards (id, code, name, description, latitude, longitude, ward_number, active, created_at)
    VALUES ('ward-1', 'AG-01', 'Test Ward', 'Synthetic fixture', 27.18, 78.02, '1', 1, ?),
           ('ward-2', 'AG-02', 'Other Ward', 'Synthetic fixture', 27.2, 78.1, '2', 1, ?)`).run(now, now);
  const admin = await provisionInitialAdmin(db, { email: "admin@example.test", password: "AdminTestPass-123", displayName: "Test Admin" });
  const officer = await provisionStaffAccount(db, { email: "officer@example.test", password: "OfficerTestPass-123", displayName: "Test Officer", role: "officer", wardId: "ward-1", actor: { userId: admin.id, role: "admin" } });
  const secondOfficer = await provisionStaffAccount(db, { email: "second@example.test", password: "SecondTestPass-123", displayName: "Other Officer", role: "officer", wardId: "ward-1", actor: { userId: admin.id, role: "admin" } });

  let handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: LOCAL_SECURITY });
  const dispatch = async (path, { method = "GET", body, headers = {}, ip = "192.0.2.10" } = {}) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.url = path;
    req.headers = { host: "127.0.0.1", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers };
    req.socket = { remoteAddress: ip };
    const response = {
      headers: {},
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      writeHead(status, responseHeaders = {}) { this.status = status; for (const [name, value] of Object.entries(responseHeaders)) this.headers[name.toLowerCase()] = value; },
      end(payload = "") { this.body = payload; },
    };
    await handler(req, response);
    return { status: response.status, headers: response.headers, json: () => JSON.parse(Buffer.isBuffer(response.body) ? response.body.toString() : response.body || "null"), bytes: response.body };
  };
  const json = (method, body, headers = {}, ip) => dispatchOptions(method, body, headers, ip);
  function dispatchOptions(method, body, headers, ip) { return { method, body, headers: { origin: ORIGIN, ...headers }, ip }; }
  const login = async (email, password, ip = "192.0.2.10") => {
    const response = await dispatch("/api/auth/login", json("POST", { email, password }, {}, ip));
    const result = response.json();
    return {
      response,
      cookie: response.headers["set-cookie"]?.split(";", 1)[0],
      csrfToken: result.data?.csrfToken,
      user: result.data?.user,
    };
  };
  const headersFor = (session, includeCsrf = true) => ({
    origin: ORIGIN,
    cookie: session.cookie,
    ...(includeCsrf ? { "x-csrf-token": session.csrfToken } : {}),
  });

  let adminSession;
  let officerSession;
  let secondOfficerSession;
  let complaint;
  let secondComplaint;
  try {
    await t.test("deployment security configuration is validated and cookies follow mode", async () => {
      const local = createSecurityConfig({ mode: "local", nodeEnv: "development", corsOrigins: ORIGIN, host: "127.0.0.1" });
      assert.equal(local.secureCookies, false);
      assert.deepEqual(local.origins, [ORIGIN]);
      assert.deepEqual(createSecurityConfig({ mode: "local", nodeEnv: "development", host: "127.0.0.1" }).origins, ["http://localhost:5173", ORIGIN]);
      assert.throws(() => createSecurityConfig({ mode: "production", corsOrigins: "", host: "127.0.0.1" }), /CORS_ORIGINS/);
      assert.throws(() => createSecurityConfig({ mode: "production", corsOrigins: "http://roadfix.example", host: "127.0.0.1" }), /HTTPS/);
      assert.throws(() => createSecurityConfig({ mode: "production", corsOrigins: "*", host: "127.0.0.1" }), /Wildcard/);
      assert.throws(() => createSecurityConfig({ mode: "local", nodeEnv: "production", corsOrigins: ORIGIN, host: "127.0.0.1" }), /cannot use local/);
      assert.throws(() => createSecurityConfig({ mode: "local", corsOrigins: ORIGIN, host: "0.0.0.0" }), /loopback host/);
      assert.throws(() => createSecurityConfig({ mode: "production", corsOrigins: "https://roadfix.example/path", host: "127.0.0.1" }), /exact origins/);
      assert.throws(() => createSecurityConfig({ mode: "", nodeEnv: "staging", corsOrigins: ORIGIN, host: "127.0.0.1" }), /ROADFIX_SECURITY_MODE/);
      assert.throws(() => createSecurityConfig({ mode: "", nodeEnv: "", corsOrigins: ORIGIN, host: "127.0.0.1" }), /ROADFIX_SECURITY_MODE/);
      assert.throws(() => createRoadFixServer({ host: "127.0.0.1", securityConfig: { mode: "production", origins: [], host: "127.0.0.1" } }), /CORS_ORIGINS/);

      const savedEnv = { mode: process.env.ROADFIX_SECURITY_MODE, nodeEnv: process.env.NODE_ENV, cors: process.env.CORS_ORIGINS };
      try {
        process.env.ROADFIX_SECURITY_MODE = "production";
        process.env.NODE_ENV = "production";
        delete process.env.CORS_ORIGINS;
        assert.throws(() => createRoadFixServer({ host: "127.0.0.1" }), /CORS_ORIGINS/);
      } finally {
        if (savedEnv.mode === undefined) delete process.env.ROADFIX_SECURITY_MODE; else process.env.ROADFIX_SECURITY_MODE = savedEnv.mode;
        if (savedEnv.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedEnv.nodeEnv;
        if (savedEnv.cors === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = savedEnv.cors;
      }

      const production = createSecurityConfig({ mode: "production", nodeEnv: "test", corsOrigins: "https://roadfix.example", host: "127.0.0.1" });
      assert.equal(production.secureCookies, true);
      handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: production });
      const response = await dispatch("/api/auth/login", { method: "POST", body: { email: admin.email, password: "AdminTestPass-123" }, ip: "192.0.2.8", headers: { origin: "https://roadfix.example" } });
      assert.equal(response.status, 200);
      assert.match(response.headers["set-cookie"], /; Secure$/);
      assert.equal(response.headers["access-control-allow-origin"], "https://roadfix.example");
      const loginPayload = response.json().data;
      const productionLogout = await dispatch("/api/auth/logout", { method: "POST", body: {}, ip: "192.0.2.8", headers: { origin: "https://roadfix.example", cookie: response.headers["set-cookie"].split(";", 1)[0], "x-csrf-token": loginPayload.csrfToken } });
      assert.equal(productionLogout.status, 200);
      assert.match(productionLogout.headers["set-cookie"], /Max-Age=0; Secure$/);
      assert.equal((await dispatch("/api/auth/login", { method: "POST", body: { email: admin.email, password: "AdminTestPass-123" }, ip: "192.0.2.9", headers: { origin: "http://roadfix.example" } })).status, 403);
      handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: LOCAL_SECURITY });
    });

    await t.test("health, origins and ward reads", async () => {
      assert.equal((await dispatch("/api/health")).json().database, "ok");
      assert.equal((await dispatch("/api/wards")).json().count, 2);
      assert.equal((await dispatch("/api/wards/ward-1")).status, 200);
      assert.equal((await dispatch("/api/wards/ward-1/issues")).json().data.total, 0);
      assert.equal((await dispatch("/api/health", { headers: { origin: "https://untrusted.example" } })).status, 403);
      assert.equal((await dispatch("/api/auth/login", { method: "POST", body: { email: admin.email, password: "AdminTestPass-123" } })).status, 403);
      assert.equal((await dispatch("/api/wards", json("POST", { code: "AG-03", name: "No Auth", lat: 27, lng: 78 }))).status, 401);
    });

    await t.test("login, safe session and cookie flags", async () => {
      const bad = await login(admin.email, "wrong-password-123");
      assert.equal(bad.response.status, 401);
      assert.equal(bad.response.json().error, "Email or password is incorrect");
      adminSession = await login(admin.email, "AdminTestPass-123");
      assert.equal(adminSession.response.status, 200);
      assert.match(adminSession.cookie, /^roadfix_session=[A-Za-z0-9_-]{43}$/);
      assert.match(adminSession.response.headers["set-cookie"], /HttpOnly/);
      assert.match(adminSession.response.headers["set-cookie"], /SameSite=Lax/);
      assert.doesNotMatch(adminSession.response.headers["set-cookie"], /Secure/);
      assert.equal(adminSession.user.role, "admin");
      assert.equal("passwordHash" in adminSession.user, false);
      const sessionState = await dispatch("/api/auth/session", { headers: { cookie: adminSession.cookie } });
      assert.equal(sessionState.status, 200);
      assert.equal(sessionState.json().data.user.id, admin.id);
      assert.equal(sessionState.json().data.csrfToken, adminSession.csrfToken);
      assert.equal(sessionState.headers["cache-control"], "no-store");
      officerSession = await login("officer@example.test", "OfficerTestPass-123", "192.0.2.11");
      assert.equal(officerSession.user.role, "officer");
      assert.equal(officerSession.user.wardId, "ward-1");
      secondOfficerSession = await login("second@example.test", "SecondTestPass-123", "192.0.2.12");
    });

    await t.test("admin-only account and ward provisioning", async () => {
      const withoutCsrf = await dispatch("/api/admin/accounts", { ...json("POST", { email: "new@example.test", password: "NewOfficerPass-123", displayName: "New Officer", role: "officer", wardId: "ward-1" }), headers: { ...headersFor(adminSession, false) } });
      assert.equal(withoutCsrf.status, 403);
      const created = await dispatch("/api/admin/accounts", { ...json("POST", { email: "new@example.test", password: "NewOfficerPass-123", displayName: "New Officer", role: "officer", wardId: "ward-1" }), headers: headersFor(adminSession) });
      assert.equal(created.status, 201, created.json().error);
      assert.equal(created.json().data.role, "officer");
      assert.equal("passwordHash" in created.json().data, false);
      assert.equal((await dispatch("/api/admin/accounts", { headers: headersFor(officerSession) })).status, 403);
      const ward = await dispatch("/api/wards", { ...json("POST", { code: "AG-03", name: "New Ward", lat: 27.1, lng: 78.1 }), headers: headersFor(adminSession) });
      assert.equal(ward.status, 201);
      assert.equal(ward.json().data.code, "AG-03");
    });

    await t.test("anonymous reporting and privacy-safe public tracking", async () => {
      const first = await dispatch("/api/issues", json("POST", { wardId: "ward-1", category: "pothole", description: "A sufficiently detailed synthetic road report", lat: 27.18, lng: 78.02, reporterName: "Private Reporter", reporterContact: "+911234567890" }));
      assert.equal(first.status, 201);
      complaint = first.json().data;
      assert.match(complaint.reference, /^RF-AG-[0-9A-HJKMNP-TV-Z]{8}$/);
      assert.equal(complaint.status, "submitted");
      assert.equal("reporterContact" in complaint, false);
      const second = await dispatch("/api/issues", json("POST", { wardId: "ward-2", category: "pothole", description: "A second synthetic issue in another ward", lat: 27.2, lng: 78.1 }));
      assert.equal(second.status, 201);
      secondComplaint = second.json().data;
      assert.notEqual(secondComplaint.reference, complaint.reference);
      assert.equal((await dispatch("/api/issues")).status, 401);
      const operations = await dispatch("/api/issues?status=submitted&page=1&pageSize=50", { headers: { cookie: adminSession.cookie } });
      assert.equal(operations.status, 200);
      assert.equal(operations.json().data.total, 2);
      assert.equal(Array.isArray(operations.json().data.data), true);
      const adminComplaint = operations.json().data.data.find((row) => row.id === complaint.id);
      assert.equal(adminComplaint.description, "A sufficiently detailed synthetic road report");
      assert.equal(adminComplaint.lat, 27.18);
      const officerIssues = await dispatch("/api/issues", { headers: { cookie: officerSession.cookie } });
      assert.equal(officerIssues.status, 200);
      const restrictedComplaint = officerIssues.json().data.data.find((row) => row.reference === complaint.reference);
      assert.deepEqual(Object.keys(restrictedComplaint).sort(), ["category", "reference", "status", "submittedAt", "wardId"].sort());
      assert.deepEqual(restrictedComplaint, {
        reference: complaint.reference,
        status: "submitted",
        category: "pothole",
        wardId: "ward-1",
        submittedAt: complaint.submittedAt,
      });
      for (const field of ["description", "title", "lat", "lng", "locationDescription", "reporterContact", "reporterName", "rejectionReason", "resolutionNote", "images", "photos"]) {
        assert.equal(field in restrictedComplaint, false, `restricted complaint leaked ${field}`);
      }
      const hiddenTextSearch = await dispatch("/api/issues?q=sufficiently%20detailed%20synthetic%20road%20report", { headers: { cookie: officerSession.cookie } });
      assert.equal(hiddenTextSearch.json().data.total, 0);
      const severitySearch = await dispatch("/api/issues?severity=high", { headers: { cookie: officerSession.cookie } });
      assert.equal(severitySearch.json().data.total, officerIssues.json().data.total);
      assert.deepEqual(severitySearch.json().data.data.map((row) => row.reference), officerIssues.json().data.data.map((row) => row.reference));
      assert.equal((await dispatch("/api/issues?wardId=ward-2", { headers: { cookie: officerSession.cookie } })).status, 403);
      const publicDetail = (await dispatch(`/api/issues/${complaint.id}`)).json().data;
      for (const field of ["reporterContact", "reporterName", "rejectionReason", "resolutionNote", "latitude", "longitude", "description"]) assert.equal(field in publicDetail, false);
      const track = (await dispatch(`/api/issues/${complaint.reference}/track`)).json().data;
      assert.deepEqual(Object.keys(track).sort(), ["lastUpdatedAt", "locationDescription", "reference", "status", "submittedAt"].sort());
      assert.deepEqual(track, { reference: complaint.reference, status: "submitted", submittedAt: complaint.submittedAt, lastUpdatedAt: complaint.lastUpdatedAt, locationDescription: complaint.locationDescription });
      const timeline = (await dispatch(`/api/issues/${complaint.reference}/track/history`)).json().data;
      assert.equal(timeline[0].toStatus, "submitted");
      assert.equal("note" in timeline[0], false);
    });

    await t.test("ward scope, assigned-only updates and admin assignment/reopen", async () => {
      const spoofed = await dispatch(`/api/issues/${complaint.id}`, { ...json("PATCH", { status: "under_review" }, { "x-officer-id": officer.officerId }), headers: {} });
      assert.equal(spoofed.status, 401);
      const forbiddenAssignment = await dispatch(`/api/issues/${complaint.id}/assign`, { ...json("POST", { officerId: officer.officerId }), headers: headersFor(officerSession) });
      assert.equal(forbiddenAssignment.status, 403);
      const assigned = await dispatch(`/api/issues/${complaint.id}/assign`, { ...json("POST", { officerId: officer.officerId }), headers: headersFor(adminSession) });
      assert.equal(assigned.status, 200);
      const assignedIssueResponse = await dispatch("/api/issues", { headers: { cookie: officerSession.cookie } });
      const assignedIssue = assignedIssueResponse.json().data.data.find((row) => row.id === complaint.id);
      assert.equal(assignedIssue.description, "A sufficiently detailed synthetic road report");
      assert.equal(assignedIssue.lat, 27.18);
      assert.equal(assignedIssue.assignedOfficerId, officer.officerId);
      const adminIssueResponse = await dispatch("/api/issues", { headers: { cookie: adminSession.cookie } });
      const adminAssignedIssue = adminIssueResponse.json().data.data.find((row) => row.id === complaint.id);
      assert.equal(adminAssignedIssue.description, "A sufficiently detailed synthetic road report");
      assert.equal(adminAssignedIssue.resolutionNote, null);
      const unassigned = await dispatch(`/api/issues/${secondComplaint.id}`, { ...json("PATCH", { status: "under_review" }), headers: headersFor(officerSession) });
      assert.equal(unassigned.status, 403);
      const wrongWardAssignee = await dispatch(`/api/issues/${secondComplaint.id}/assign`, { ...json("POST", { officerId: officer.officerId }), headers: headersFor(adminSession) });
      assert.equal(wrongWardAssignee.status, 400);

      for (const [status, extra] of [["under_review", {}], ["verified", { severity: "high" }], ["in_progress", {}], ["resolved", { note: "Completed for test" }]]) {
        const updated = await dispatch(`/api/issues/${complaint.id}`, { ...json("PATCH", { status, ...extra }), headers: headersFor(officerSession) });
        assert.equal(updated.status, 200, updated.json().error);
      }
      const officerReopen = await dispatch(`/api/issues/${complaint.id}`, { ...json("PATCH", { status: "under_review" }), headers: headersFor(officerSession) });
      assert.equal(officerReopen.status, 400);
      const adminReopen = await dispatch(`/api/issues/${complaint.id}`, { ...json("PATCH", { status: "under_review" }), headers: headersFor(adminSession) });
      assert.equal(adminReopen.status, 200);
      const missingCsrf = await dispatch(`/api/issues/${complaint.id}`, { ...json("PATCH", { status: "verified" }), headers: headersFor(officerSession, false) });
      assert.equal(missingCsrf.status, 403);
    });

    await t.test("reporter contact access is assignment-scoped and audited before return", async () => {
      const before = db.prepare("SELECT count(*) AS count FROM admin_audit_log WHERE action = 'reporter_contact_read'").get().count;
      const unassignedContact = await dispatch(`/api/issues/${complaint.id}/reporter-contact`, { headers: headersFor({ cookie: secondOfficerSession.cookie }) });
      assert.equal(unassignedContact.status, 403);
      const otherWardContact = await dispatch(`/api/issues/${secondComplaint.id}/reporter-contact`, { headers: headersFor(officerSession) });
      assert.equal(otherWardContact.status, 403);
      const contactResponse = await dispatch(`/api/issues/${complaint.id}/reporter-contact`, { headers: headersFor(officerSession) });
      assert.equal(contactResponse.status, 200);
      assert.equal(contactResponse.headers["cache-control"], "private, no-store");
      assert.equal(contactResponse.json().data.reporterContact, "+911234567890");
      const after = db.prepare("SELECT count(*) AS count FROM admin_audit_log WHERE action = 'reporter_contact_read'").get().count;
      assert.equal(after, before + 1);
      const audit = db.prepare("SELECT actor_user_id, actor_role, target_complaint_id FROM admin_audit_log WHERE action = 'reporter_contact_read' ORDER BY id DESC LIMIT 1").get();
      assert.equal(audit.actor_user_id, officer.id);
      assert.equal(audit.actor_role, "officer");
      assert.equal(audit.target_complaint_id, complaint.id);
      const adminContact = await dispatch(`/api/issues/${complaint.id}/reporter-contact`, { headers: headersFor(adminSession) });
      assert.equal(adminContact.status, 200);
      assert.equal(adminContact.json().data.reporterContact, "+911234567890");
      const noContactBefore = db.prepare("SELECT count(*) AS count FROM admin_audit_log WHERE action = 'reporter_contact_read'").get().count;
      const absentContact = await dispatch(`/api/issues/${secondComplaint.id}/reporter-contact`, { headers: headersFor(adminSession) });
      assert.equal(absentContact.status, 200);
      assert.equal(absentContact.json().data, null);
      const noContactAfter = db.prepare("SELECT count(*) AS count FROM admin_audit_log WHERE action = 'reporter_contact_read'").get().count;
      assert.equal(noContactAfter, noContactBefore + 1);
      const emptyAudit = db.prepare("SELECT actor_user_id, target_complaint_id, target_user_id, created_at FROM admin_audit_log WHERE action = 'reporter_contact_read' ORDER BY id DESC LIMIT 1").get();
      assert.equal(emptyAudit.actor_user_id, admin.id);
      assert.equal(emptyAudit.target_complaint_id, secondComplaint.id);
      assert.equal(emptyAudit.target_user_id, null);
      assert.ok(Number.isFinite(Date.parse(emptyAudit.created_at)));
      db.exec("CREATE TRIGGER test_audit_denial BEFORE INSERT ON admin_audit_log WHEN NEW.action = 'reporter_contact_read' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
      const oldError = console.error; console.error = () => {};
      try {
        const denied = await dispatch(`/api/issues/${complaint.id}/reporter-contact`, { headers: headersFor(adminSession) });
        assert.equal(denied.status, 500);
        assert.deepEqual(denied.json(), { ok: false, error: "Internal server error" });
        assert.equal(Object.hasOwn(denied.json(), "data"), false);
      } finally { console.error = oldError; db.exec("DROP TRIGGER test_audit_denial"); }
    });

    await t.test("private photos require staff complaint scope", async () => {
      const png = makePng();
      const photoDataUrl = `data:image/png;base64,${png.toString("base64")}`;
      const malformed = await dispatch("/api/issues", json("POST", { wardId: "ward-1", category: "pothole", description: "Synthetic report with malformed image data", lat: 27.1, lng: 78, photo: `data:image/png;base64,${makePng(1, 1, Buffer.from("not-deflate")).toString("base64")}` }));
      assert.equal(malformed.status, 400);
      assert.match(malformed.json().error, /safely decoded/);
      const hugeImage = await dispatch("/api/issues", json("POST", { wardId: "ward-1", category: "pothole", description: "Synthetic report with excessive image dimensions", lat: 27.1, lng: 78, photo: `data:image/png;base64,${makePng(5000, 5000).toString("base64")}` }));
      assert.equal(hugeImage.status, 400);
      assert.match(hugeImage.json().error, /dimensions|safely decoded/);
      const created = await dispatch("/api/issues", json("POST", { wardId: "ward-1", category: "pothole", description: "Synthetic report with one private photo", lat: 27.1, lng: 78, photo: photoDataUrl }));
      const photoComplaint = created.json().data;
      assert.equal(created.status, 201);
      assert.equal((await dispatch(`/api/issues/${photoComplaint.id}/photos`)).status, 401);
      assert.equal((await dispatch("/uploads/private.jpg")).status, 401);
      const unassignedPhotos = await dispatch(`/api/issues/${photoComplaint.id}/photos`, { headers: headersFor(secondOfficerSession) });
      assert.equal(unassignedPhotos.status, 403);
      const storedPhotoId = db.prepare("SELECT id FROM complaint_images WHERE complaint_id = ?").get(photoComplaint.id).id;
      const unassignedPhoto = await dispatch(`/api/issues/${photoComplaint.id}/photos/${storedPhotoId}`, { headers: headersFor(secondOfficerSession) });
      assert.equal(unassignedPhoto.status, 403);
      await dispatch(`/api/issues/${photoComplaint.id}/assign`, { ...json("POST", { officerId: officer.officerId }), headers: headersFor(adminSession) });
      const list = await dispatch(`/api/issues/${photoComplaint.id}/photos`, { headers: headersFor(officerSession) });
      assert.equal(list.status, 200);
      const photoId = list.json().data[0].id;
      const image = await dispatch(`/api/issues/${photoComplaint.id}/photos/${photoId}`, { headers: { cookie: officerSession.cookie } });
      assert.equal(image.status, 200);
      assert.equal(image.headers["content-type"], "image/png");
      assert.equal(image.headers["cache-control"], "private, no-store");
      assert.equal(image.headers["x-content-type-options"], "nosniff");
      assert.notEqual(Buffer.compare(image.bytes, png), 0);
      const safeMetadata = await sharp(image.bytes).metadata();
      assert.deepEqual([safeMetadata.width, safeMetadata.height], [1, 1]);
      assert.equal(safeMetadata.exif, undefined);
      const other = await dispatch(`/api/issues/${photoComplaint.id}/photos/${photoId}`, { headers: { cookie: secondOfficerSession.cookie } });
      assert.equal(other.status, 403);
      assert.throws(() => resolvePrivateUploadPath(uploadRoot, "../test.sqlite"), /Invalid upload path/);
    });

    await t.test("anonymous submission limits and upload storage quota", async () => {
      const rateIp = "192.0.2.41";
      const payload = { wardId: "ward-1", category: "pothole", description: "Synthetic bounded anonymous report", lat: 27.18, lng: 78.02 };
      for (let i = 0; i < 5; i += 1) {
        const accepted = await dispatch("/api/issues", { method: "POST", body: payload, ip: rateIp, headers: { "x-forwarded-for": `198.51.100.${i + 1}` } });
        assert.equal(accepted.status, 201);
      }
      const limited = await dispatch("/api/issues", { method: "POST", body: payload, ip: rateIp, headers: { "x-forwarded-for": "203.0.113.99" } });
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers["retry-after"]) > 0);

      handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: LOCAL_SECURITY, maxConcurrentUploads: 0 });
      const busy = await dispatch("/api/issues", { method: "POST", body: payload, ip: "192.0.2.43" });
      assert.equal(busy.status, 429);
      assert.equal(busy.headers["retry-after"], "5");

      handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: LOCAL_SECURITY });
      const tooLarge = await dispatch("/api/issues", { method: "POST", body: payload, ip: "192.0.2.44", headers: { "content-length": String(22 * 1024 * 1024 + 1) } });
      assert.equal(tooLarge.status, 413);

      handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: LOCAL_SECURITY, uploadQuotaBytes: 1 });
      const photoBody = { ...payload, description: "Synthetic report rejected by upload storage quota", photo: `data:image/png;base64,${makePng().toString("base64")}` };
      const quota = await dispatch("/api/issues", { method: "POST", body: photoBody, ip: "192.0.2.42" });
      assert.equal(quota.status, 507);
      assert.match(quota.json().error, /storage limit/);
      handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: LOCAL_SECURITY });
    });

    await t.test("bounded login and public tracking rate limits", async () => {
      const rateIp = "192.0.2.30";
      for (let i = 0; i < 5; i += 1) assert.equal((await login("nobody@example.test", "WrongPassword-123", rateIp)).response.status, 401);
      const locked = await login("nobody@example.test", "WrongPassword-123", rateIp);
      assert.equal(locked.response.status, 429);
      assert.ok(Number(locked.response.headers["retry-after"]) > 0);
      let trackLimit;
      for (let i = 0; i < 31; i += 1) trackLimit = await dispatch("/api/issues/RF-AG-00000000/track", { ip: "192.0.2.31" });
      assert.equal(trackLimit.status, 429);
      assert.ok(Number(trackLimit.headers["retry-after"]) > 0);
      let historyLimit;
      for (let i = 0; i < 31; i += 1) historyLimit = await dispatch(`/api/issues/${complaint.id}/history`, { ip: "192.0.2.32" });
      assert.equal(historyLimit.status, 429);
      assert.ok(Number(historyLimit.headers["retry-after"]) > 0);
    });

    await t.test("session close/reopen persistence and logout revocation", async () => {
      db.close();
      db = openDatabase({ dbPath });
      handler = createApiHandler({ db, uploadsRoot: uploadRoot, securityConfig: LOCAL_SECURITY });
      assert.equal((await dispatch("/api/auth/session", { headers: { cookie: adminSession.cookie } })).status, 200);
      const logout = await dispatch("/api/auth/logout", { ...json("POST", {}, headersFor(adminSession)) });
      assert.equal(logout.status, 200);
      assert.match(logout.headers["set-cookie"], /Max-Age=0/);
      assert.equal((await dispatch("/api/auth/session", { headers: { cookie: adminSession.cookie } })).status, 401);
    });
  } finally {
    if (db.open) db.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function makePng(width = 1, height = 1, imageData = deflateSync(Buffer.from([0, 255, 0, 0, 255]))) {
  const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const typeBytes = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, body])));
    return Buffer.concat([length, typeBytes, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", imageData), chunk("IEND", Buffer.alloc(0))]);
}

