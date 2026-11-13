import { randomUUID } from "node:crypto";
import { generateUniqueReference } from "./references.js";

export const STATUSES = ["submitted", "under_review", "verified", "in_progress", "resolved", "rejected"];
export const SEVERITIES = ["low", "medium", "high"];
export const CATEGORIES = ["pothole", "waterlogging", "open_manhole", "streetlight", "garbage", "erosion", "water_pipe_leak", "damaged_sign", "other"];

const PUBLIC_COMPLAINT = `c.id, c.reference, c.title, c.category, c.status, c.severity,
  c.ward_id AS wardId, c.location_description AS locationDescription,
  c.created_at AS submittedAt, c.updated_at AS lastUpdatedAt`;
const PUBLIC_WARD = `id, code, name, description, latitude AS lat, longitude AS lng,
  ward_number AS wardNumber, active, created_at AS createdAt`;

export function createRepository(db) {
  const getWard = db.prepare(`SELECT ${PUBLIC_WARD} FROM wards WHERE id = ?`);
  const getComplaint = db.prepare(`SELECT ${PUBLIC_COMPLAINT} FROM complaints c WHERE c.id = ?`);
  const getByReference = db.prepare(`SELECT ${PUBLIC_COMPLAINT} FROM complaints c WHERE c.reference = ? COLLATE NOCASE`);
  return {
    listWards({ q, active } = {}) {
      let sql = `SELECT ${PUBLIC_WARD} FROM wards`;
      const args = [];
      const where = [];
      if (q) { where.push("(name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\')"); args.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`); }
      if (active !== null && active !== undefined) { where.push("active = ?"); args.push(active === "true" ? 1 : 0); }
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
      return db.prepare(`${sql} ORDER BY name COLLATE NOCASE`).all(...args);
    },
    getWard: (id) => getWard.get(id),
    listWardIssues({ wardId, status, severity, page = 1, pageSize = 20 }) {
      return listComplaints(db, { wardId, status, severity, page, pageSize });
    },
    listOfficers({ q, wardId, active } = {}) {
      let sql = "SELECT o.id, o.display_name AS displayName, o.ward_id AS wardId, o.active FROM officers o";
      const args = [];
      const where = [];
      if (q) { where.push("(o.display_name LIKE ? ESCAPE '\\' OR o.ward_id LIKE ? ESCAPE '\\')"); args.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`); }
      if (wardId) { where.push("o.ward_id = ?"); args.push(wardId); }
      if (active !== null && active !== undefined) { where.push("o.active = ?"); args.push(active === "true" ? 1 : 0); }
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
      return db.prepare(`${sql} ORDER BY o.display_name COLLATE NOCASE`).all(...args);
    },
    getOfficer(id) {
      return db.prepare("SELECT id, display_name AS displayName, ward_id AS wardId, active FROM officers WHERE id = ?").get(id);
    },
    listComplaints(params) { return listComplaints(db, params); },
    listOperationalComplaints({ actor, status, severity, category, q, page, pageSize }) {
      const filters = { status, severity: actor.role === "officer" ? undefined : severity, category, q, page, pageSize };
      if (actor.role === "officer") return listOperational(db, { ...filters, wardId: actor.wardId ?? "__no_assigned_ward__", actor });
      return listOperational(db, filters);
    },
    getComplaint: (id) => getComplaint.get(id),
    getComplaintAuthorization(id) {
      return db.prepare(`SELECT id, ward_id AS wardId, assigned_officer_id AS assignedOfficerId,
        reporter_id AS reporterId, status FROM complaints WHERE id = ?`).get(id);
    },
    createWard(input, actor) { return createWard(db, input, actor); },
    listAccounts() {
      return db.prepare(`SELECT u.id, u.email, u.role, u.display_name AS displayName, u.active,
        o.id AS officerId, o.ward_id AS wardId, o.active AS officerActive
        FROM users u LEFT JOIN officers o ON o.user_id = u.id ORDER BY u.role, u.email`).all();
    },
    listAuditLog(limit = 100) {
      return db.prepare(`SELECT a.id, a.actor_user_id AS actorUserId, u.display_name AS actorName,
        a.actor_role AS actorRole, a.action, a.target_complaint_id AS targetComplaintId,
        a.target_user_id AS targetUserId, a.created_at AS createdAt
        FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC, a.id DESC LIMIT ?`).all(Math.max(1, Math.min(250, Math.floor(Number(limit) || 100))));
    },
    updateOfficerWard(userId, wardId, actor) { return updateOfficerWard(db, userId, wardId, actor); },
    readReporterContact(id, actor) { return readReporterContact(db, id, actor); },
    listComplaintImages(id, actor) { return listComplaintImages(db, id, actor); },
    readComplaintImage(id, imageId, actor) { return readComplaintImage(db, id, imageId, actor); },
    getComplaintByReference: (ref) => getByReference.get(ref.trim().toUpperCase()),
    getHistory(id) {
      return db.prepare(`SELECT event_type AS eventType, from_status AS fromStatus,
        to_status AS toStatus, created_at AS createdAt FROM complaint_status_history
        WHERE complaint_id = ? ORDER BY created_at DESC, id DESC`).all(id);
    },
    createComplaint(input, files = []) { return createComplaint(db, input, files); },
    updateComplaintStatus(id, { status, severity, note, actorId, actorRole, isAdmin = false }) {
      return updateComplaintStatus(db, id, { status, severity, note, actorId, actorRole, isAdmin });
    },
    assignComplaint(id, { officerId, actorId, actorRole }) { return assignComplaint(db, id, { officerId, actorId, actorRole }); },
    getStats() {
      const total = db.prepare("SELECT count(*) AS count FROM complaints").get().count;
      const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
      for (const row of db.prepare("SELECT status, count(*) AS count FROM complaints GROUP BY status").all()) byStatus[row.status] = row.count;
      const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
      for (const row of db.prepare("SELECT severity, count(*) AS count FROM complaints WHERE severity IS NOT NULL GROUP BY severity").all()) bySeverity[row.severity] = row.count;
      const byWard = db.prepare(`SELECT w.name, count(c.id) AS count FROM wards w
        LEFT JOIN complaints c ON c.ward_id = w.id GROUP BY w.id ORDER BY count DESC, w.name`).all();
      return { total, byStatus, bySeverity, byWard };
    },
  };
}

function listComplaints(db, { wardId, status, severity, category, assignedOfficerId, q, page = 1, pageSize = 20 } = {}) {
  const where = [];
  const args = [];
  for (const [key, value, column] of [["ward", wardId, "c.ward_id"], ["status", status, "c.status"], ["severity", severity, "c.severity"], ["category", category, "c.category"], ["assignee", assignedOfficerId, "c.assigned_officer_id"]]) {
    if (value) { where.push(`${column} = ?`); args.push(value); }
  }
  if (q) { where.push("(c.reference LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.location_description LIKE ? ESCAPE '\\')"); const value = `%${escapeLike(q)}%`; args.push(value, value, value); }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const total = db.prepare(`SELECT count(*) AS count FROM complaints c${clause}`).get(...args).count;
  const parsedPage = Number(page);
  const parsedPageSize = Number(pageSize);
  const safePage = Math.max(1, Math.min(100000, Number.isFinite(parsedPage) ? Math.floor(parsedPage) || 1 : 1));
  const safePageSize = Math.max(1, Math.min(100, Number.isFinite(parsedPageSize) ? Math.floor(parsedPageSize) || 20 : 20));
  const rows = db.prepare(`SELECT ${PUBLIC_COMPLAINT} FROM complaints c${clause}
    ORDER BY c.created_at DESC, c.id LIMIT ? OFFSET ?`).all(...args, safePageSize, (safePage - 1) * safePageSize);
  return { data: rows, total, page: safePage, pageSize: safePageSize };
}

function listOperational(db, { wardId, status, severity, category, q, page = 1, pageSize = 30, actor } = {}) {
  const where = [];
  const args = [];
  for (const [value, column] of [[wardId, "c.ward_id"], [status, "c.status"], [severity, "c.severity"], [category, "c.category"]]) {
    if (value) { where.push(`${column} = ?`); args.push(value); }
  }
  if (q) {
    const term = `%${escapeLike(q)}%`;
    if (actor?.role === "officer") where.push("c.reference LIKE ? ESCAPE '\\'");
    else where.push("(c.reference LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.location_description LIKE ? ESCAPE '\\')");
    args.push(term);
    if (actor?.role !== "officer") args.push(term, term);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const total = db.prepare(`SELECT count(*) AS count FROM complaints c${clause}`).get(...args).count;
  const p = Math.max(1, Math.min(100000, Math.floor(Number(page) || 1)));
  const n = Math.max(1, Math.min(100, Math.floor(Number(pageSize) || 30)));
  const rows = db.prepare(`SELECT c.id, c.reference, c.title, c.description, c.category, c.status, c.severity,
      c.ward_id AS wardId, c.location_description AS locationDescription, c.latitude AS lat,
      c.longitude AS lng, c.assigned_officer_id AS assignedOfficerId, c.assigned_at AS assignedAt,
      c.rejection_reason AS rejectionReason, c.resolution_note AS resolutionNote,
      c.resolved_at AS resolvedAt, c.created_at AS createdAt, c.updated_at AS updatedAt
    FROM complaints c${clause} ORDER BY c.created_at DESC, c.id LIMIT ? OFFSET ?`).all(...args, n, (p - 1) * n);
  const data = actor?.role === "officer" ? rows.map((row) => (
    actor.officerId && row.assignedOfficerId === actor.officerId
      ? row
      : { reference: row.reference, status: row.status, category: row.category, wardId: row.wardId, submittedAt: row.createdAt }
  )) : rows;
  return { data, total, page: p, pageSize: n };
}

function createWard(db, input, actor) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO wards (id, code, name, description, latitude, longitude, ward_number, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(id, input.code, input.name, input.description, input.lat, input.lng, input.wardNumber, now);
    db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, created_at)
      VALUES (?, 'admin', 'ward_created', ?)`).run(actor.userId, now);
    return db.prepare(`SELECT ${PUBLIC_WARD} FROM wards WHERE id = ?`).get(id);
  });
  return tx.immediate();
}

function updateOfficerWard(db, userId, wardId, actor) {
  if (actor.role !== "admin") throw new ValidationError("Administrator access required");
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const target = db.prepare("SELECT id FROM officers WHERE user_id = ?").get(userId);
    if (!target) return false;
    if (wardId !== null && !db.prepare("SELECT 1 FROM wards WHERE id = ? AND active = 1").get(wardId)) throw new ValidationError("Ward not found or inactive");
    db.prepare("UPDATE officers SET ward_id = ? WHERE user_id = ?").run(wardId, userId);
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, userId);
    db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_user_id, created_at)
      VALUES (?, 'admin', 'officer_ward_changed', ?, ?)`).run(actor.userId, userId, now);
    return true;
  });
  return tx.immediate();
}

function hasComplaintScope(db, complaintId, actor) {
  const row = db.prepare("SELECT ward_id AS wardId, assigned_officer_id AS assignedOfficerId FROM complaints WHERE id = ?").get(complaintId);
  if (!row) return { found: false, allowed: false };
  if (actor.role === "admin") return { found: true, allowed: true };
  return { found: true, allowed: actor.role === "officer" && row.wardId === actor.wardId && row.assignedOfficerId === actor.officerId };
}

function readReporterContact(db, complaintId, actor) {
  const tx = db.transaction(() => {
    const scope = hasComplaintScope(db, complaintId, actor);
    if (!scope.found || !scope.allowed) return scope;
    const row = db.prepare(`SELECT p.reporter_name AS reporterName, p.reporter_contact AS reporterContact,
      c.reporter_id AS reporterId FROM complaint_private p JOIN complaints c ON c.id = p.complaint_id
      WHERE p.complaint_id = ?`).get(complaintId);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_complaint_id,
      target_user_id, created_at) VALUES (?, ?, 'reporter_contact_read', ?, ?, ?)`)
      .run(actor.userId, actor.role, complaintId, row?.reporterId ?? null, now);
    return { ...scope, contact: row ? { reporterName: row.reporterName, reporterContact: row.reporterContact } : null };
  });
  return tx.immediate();
}

function listComplaintImages(db, complaintId, actor) {
  const scope = hasComplaintScope(db, complaintId, actor);
  if (!scope.found || !scope.allowed) return scope;
  const images = db.prepare(`SELECT id, content_type AS contentType, size_bytes AS sizeBytes,
    created_at AS createdAt FROM complaint_images WHERE complaint_id = ? ORDER BY slot`).all(complaintId);
  return { ...scope, images };
}

function readComplaintImage(db, complaintId, imageId, actor) {
  const scope = hasComplaintScope(db, complaintId, actor);
  if (!scope.found || !scope.allowed) return scope;
  const image = db.prepare(`SELECT id, storage_path AS storagePath, content_type AS contentType,
    size_bytes AS sizeBytes FROM complaint_images WHERE id = ? AND complaint_id = ?`).get(imageId, complaintId);
  return { ...scope, image: image ?? null };
}

function createComplaint(db, input, files) {
  const transaction = db.transaction(() => {
    const now = new Date().toISOString();
    const id = randomUUID();
    const reference = generateUniqueReference(db);
    db.prepare(`INSERT INTO complaints
      (id, reference, title, description, category, status, severity, ward_id,
       location_description, latitude, longitude, status_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, reference, input.title, input.description, input.category, input.severity,
        input.wardId, input.locationDescription, input.lat, input.lng, now, now, now);
    if (input.reporterName || input.reporterContact) {
      db.prepare(`INSERT INTO complaint_private (complaint_id, reporter_name, reporter_contact, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`)
        .run(id, input.reporterName || null, input.reporterContact || null, now, now);
    }
    const insertImage = db.prepare(`INSERT INTO complaint_images
      (id, complaint_id, slot, storage_path, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    files.forEach((file, index) => insertImage.run(randomUUID(), id, index + 1, file.storagePath, file.contentType, file.size, now));
    db.prepare(`INSERT INTO complaint_status_history (id, complaint_id, event_type, from_status, to_status, actor_role, created_at)
      VALUES (?, ?, 'created', NULL, 'submitted', 'citizen', ?)`)
      .run(randomUUID(), id, now);
    return { ...db.prepare(`SELECT ${PUBLIC_COMPLAINT} FROM complaints c WHERE c.id = ?`).get(id), description: input.description };
  });
  return transaction.immediate();
}

const TRANSITIONS = {
  submitted: ["under_review", "rejected"],
  under_review: ["verified", "rejected"],
  verified: ["in_progress", "rejected"],
  in_progress: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
};

export function canTransition(from, to, { isAdmin = false } = {}) {
  if (["resolved", "rejected"].includes(from) && to === "under_review") return isAdmin;
  return Boolean(TRANSITIONS[from]?.includes(to));
}

function updateComplaintStatus(db, id, { status, severity, note, actorId, actorRole, isAdmin }) {
  const tx = db.transaction(() => {
    const current = db.prepare("SELECT * FROM complaints WHERE id = ?").get(id);
    if (!current) return null;
    if (!STATUSES.includes(status)) throw new ValidationError("Invalid complaint status");
    if (!canTransition(current.status, status, { isAdmin })) throw new ValidationError("Invalid complaint status transition");
    if (severity !== undefined && severity !== null && !SEVERITIES.includes(severity)) throw new ValidationError("Invalid complaint severity");
    if (status === "rejected" && !String(note ?? "").trim()) throw new ValidationError("A rejection reason is required");
    if (status === "resolved" && !String(note ?? "").trim()) throw new ValidationError("A resolution note is required");
    const now = new Date().toISOString();
    const nextSeverity = severity ?? current.severity;
    const rejectionReason = status === "rejected" ? note : null;
    const resolutionNote = status === "resolved" ? note : null;
    db.prepare(`UPDATE complaints SET status = ?, severity = ?, rejection_reason = ?,
      resolution_note = ?, resolved_at = ?, status_updated_at = ?, updated_at = ? WHERE id = ?`)
      .run(status, nextSeverity, rejectionReason, resolutionNote, status === "resolved" ? now : null, now, now, id);
    const eventType = ["resolved", "rejected"].includes(current.status) ? "reopened" : "status_change";
    db.prepare(`INSERT INTO complaint_status_history (id, complaint_id, event_type, from_status, to_status, actor_id, actor_role, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), id, eventType, current.status, status, actorId ?? null, actorRole, note ?? null, now);
    return db.prepare(`SELECT ${PUBLIC_COMPLAINT} FROM complaints c WHERE c.id = ?`).get(id);
  });
  return tx.immediate();
}

function assignComplaint(db, id, { officerId, actorId, actorRole }) {
  const tx = db.transaction(() => {
    const current = db.prepare("SELECT status FROM complaints WHERE id = ?").get(id);
    if (!current) return null;
    if (!["submitted", "under_review", "verified", "in_progress"].includes(current.status)) throw new ValidationError("Assignment is not allowed at this complaint status");
    const complaintWard = db.prepare("SELECT ward_id FROM complaints WHERE id = ?").get(id).ward_id;
    const officer = db.prepare("SELECT id, display_name, ward_id FROM officers WHERE id = ? AND active = 1").get(officerId);
    if (!officer) throw new ValidationError("Assignee officer not found");
    if (officer.ward_id !== complaintWard) throw new ValidationError("Assignee must belong to the complaint ward");
    if (actorRole !== "admin") throw new ValidationError("Administrator access required");
    const now = new Date().toISOString();
    db.prepare("UPDATE complaints SET assigned_officer_id = ?, assigned_at = ?, updated_at = ? WHERE id = ?").run(officerId, now, now, id);
    db.prepare(`INSERT INTO complaint_status_history (id, complaint_id, event_type, from_status, to_status, assignee_id, actor_id, actor_role, note, created_at)
      VALUES (?, ?, 'assignment', ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), id, current.status, current.status, officerId, actorId ?? null, actorRole, "Assignment updated", now);
    return db.prepare(`SELECT ${PUBLIC_COMPLAINT} FROM complaints c WHERE c.id = ?`).get(id);
  });
  return tx.immediate();
}

function escapeLike(value) { return String(value).replace(/[\\%_]/g, "\\$&"); }
export class ValidationError extends Error {}
