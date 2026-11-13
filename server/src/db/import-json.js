import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, constants as fsConstants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openDatabase, DEFAULT_DATABASE_PATH } from "./database.js";

const SERVER_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_JSON_PATH = resolve(SERVER_ROOT, "data", "store.json");
const STATUSES = new Set([
  "submitted",
  "under_review",
  "verified",
  "in_progress",
  "resolved",
  "rejected",
]);
const SEVERITIES = new Set(["low", "medium", "high"]);
const CATEGORIES = new Set([
  "pothole",
  "waterlogging",
  "open_manhole",
  "streetlight",
  "garbage",
  "erosion",
  "water_pipe_leak",
  "damaged_sign",
  "other",
]);
const EVENTS = new Set(["created", "status_change", "assignment", "reopened", "note"]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/;

function containsContactPattern(value) {
  if (typeof value !== "string") return false;
  return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value);
}

function cleanText(value, min, max) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length >= min && cleaned.length <= max ? cleaned : null;
}

function timestamp(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function mapStatus(status) {
  if (status === "reported") return "submitted";
  return STATUSES.has(status) ? status : null;
}

function isAllowedHistoricalTransition(from, to, actorRole) {
  if (from === null || to === null) return true;
  const allowed = {
    submitted: ["under_review", "rejected"],
    under_review: ["verified", "rejected"],
    verified: ["in_progress", "rejected"],
    in_progress: ["resolved"],
    resolved: actorRole === "admin" ? ["in_progress"] : [],
    rejected: actorRole === "admin" ? ["submitted"] : [],
  };
  return allowed[from]?.includes(to) ?? false;
}

function reject(list, row, reason) {
  list.push({
    id: typeof row?.id === "string" ? row.id : null,
    reference: typeof row?.reference === "string" ? row.reference : null,
    reason,
  });
}

export function analyzeJsonStore(data) {
  const rejected = { wards: [], officers: [], complaints: [], history: [] };
  const warnings = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("JSON store root must be an object");
  }
  for (const collection of ["wards", "officers", "issues", "history"]) {
    if (!Array.isArray(data[collection]))
      throw new TypeError(`JSON store collection ${collection} must be an array`);
  }

  const wards = [];
  const inputWardIds = new Set();
  const inputWardCodes = new Set();
  for (const row of data.wards) {
    const id = cleanText(row?.id, 1, 100);
    const code = cleanText(row?.code, 1, 16)?.toUpperCase();
    const name = cleanText(row?.name, 1, 100);
    const description = row?.description == null ? null : cleanText(row.description, 0, 500);
    const latitude = Number(row?.lat ?? row?.latitude);
    const longitude = Number(row?.lng ?? row?.longitude);
    const wardNumber = cleanText(String(row?.wardNumber ?? row?.ward_number ?? ""), 1, 20);
    const sourceCreatedAt = timestamp(row?.createdAt ?? row?.created_at);
    const createdAt = sourceCreatedAt ?? new Date().toISOString();
    if (
      !id ||
      !code ||
      !name ||
      !wardNumber ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      (row?.description != null && description === null) ||
      containsContactPattern(description)
    ) {
      reject(rejected.wards, row, "invalid_fields_or_contact_pattern");
      continue;
    }
    if (inputWardIds.has(id) || inputWardCodes.has(code)) {
      reject(rejected.wards, row, "duplicate_id_or_code_in_source");
      continue;
    }
    inputWardIds.add(id);
    inputWardCodes.add(code);
    wards.push({
      id,
      code,
      name,
      description,
      latitude,
      longitude,
      wardNumber,
      active: row?.active === false ? 0 : 1,
      createdAt,
    });
  }

  const wardIds = new Set(wards.map((ward) => ward.id));
  const complaints = [];
  const issueIdMap = new Map();
  const inputIssueIds = new Set();
  for (const row of data.issues) {
    const id = cleanText(row?.id, 1, 100);
    const reference = typeof row?.reference === "string" ? row.reference.trim().toUpperCase() : "";
    const status = mapStatus(row?.status);
    const severity = row?.severity == null ? null : row.severity;
    const title = cleanText(row?.title, 1, 120);
    const description = cleanText(row?.description, 10, 1000);
    const category = row?.category;
    const wardId = cleanText(row?.wardId ?? row?.ward_id, 1, 100);
    const locationDescription =
      row?.locationDescription == null ? null : cleanText(row.locationDescription, 0, 150);
    const latitude = Number(row?.lat ?? row?.latitude);
    const longitude = Number(row?.lng ?? row?.longitude);
    const createdAt = timestamp(row?.createdAt ?? row?.created_at);
    const updatedAt = timestamp(row?.updatedAt ?? row?.updated_at) ?? createdAt;
    const statusUpdatedAt = timestamp(row?.statusUpdatedAt ?? row?.status_updated_at) ?? updatedAt;
    const rejectionReason =
      row?.rejectionReason == null ? null : cleanText(row.rejectionReason, 1, 1000);
    const resolutionNote =
      row?.resolutionNote == null ? null : cleanText(row.resolutionNote, 1, 1000);
    const resolvedAt = row?.resolvedAt == null ? null : timestamp(row.resolvedAt);

    if (!id || inputIssueIds.has(id)) {
      reject(rejected.complaints, row, id ? "duplicate_id_in_source" : "missing_or_invalid_id");
      continue;
    }
    inputIssueIds.add(id);
    if (!/^RF-AG-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(reference)) {
      reject(rejected.complaints, row, "invalid_reference");
      continue;
    }
    if (!status) {
      reject(rejected.complaints, row, "unmappable_status");
      continue;
    }
    if (severity !== null && !SEVERITIES.has(severity)) {
      reject(rejected.complaints, row, `unmappable_severity:${String(severity)}`);
      continue;
    }
    if (
      !title ||
      !description ||
      !CATEGORIES.has(category) ||
      !wardId ||
      !wardIds.has(wardId) ||
      (row?.locationDescription != null && locationDescription === null) ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !createdAt ||
      !updatedAt ||
      !statusUpdatedAt ||
      (row?.rejectionReason != null && rejectionReason === null) ||
      (row?.resolutionNote != null && resolutionNote === null) ||
      (row?.resolvedAt != null && resolvedAt === null)
    ) {
      reject(rejected.complaints, row, "invalid_fields_or_missing_ward");
      continue;
    }
    if (
      (status === "rejected" && !rejectionReason) ||
      (status === "resolved" && (!resolutionNote || !resolvedAt))
    ) {
      reject(rejected.complaints, row, "required_terminal_status_details_missing");
      continue;
    }
    const textFields = [title, description, locationDescription, rejectionReason, resolutionNote];
    if (textFields.some(containsContactPattern)) {
      reject(rejected.complaints, row, "unclassified_contact_pattern_in_free_text");
      continue;
    }

    const complaint = {
      id,
      reference,
      reporterId: null,
      title,
      description,
      category,
      status,
      severity,
      wardId,
      locationDescription,
      latitude,
      longitude,
      assignedOfficerId: null,
      assignedAt: null,
      rejectionReason,
      resolutionNote,
      resolvedAt,
      statusUpdatedAt,
      createdAt,
      updatedAt,
    };
    complaints.push(complaint);
    issueIdMap.set(id, complaint);
  }

  const complaintRefs = new Set();
  const uniqueComplaints = [];
  for (const complaint of complaints) {
    if (complaintRefs.has(complaint.reference)) {
      reject(rejected.complaints, complaint, "duplicate_reference_in_source");
      issueIdMap.delete(complaint.id);
      continue;
    }
    complaintRefs.add(complaint.reference);
    uniqueComplaints.push(complaint);
  }

  // Names, email and phone in legacy officer records are unclassified personal data.
  for (const officer of data.officers)
    reject(rejected.officers, officer, "withheld_unclassified_personal_data");

  const history = [];
  const historyIds = new Set();
  for (const row of data.history) {
    const id = cleanText(row?.id, 1, 100);
    const complaint = issueIdMap.get(row?.issueId ?? row?.issue_id);
    const eventType = row?.eventType ?? row?.event_type;
    const fromStatus = row?.fromStatus == null ? null : mapStatus(row.fromStatus);
    const toStatus = row?.toStatus == null ? null : mapStatus(row.toStatus);
    const rawRole = row?.actorRole ?? row?.actor_role;
    const actorRole =
      rawRole === "senior_engineer"
        ? "officer"
        : ["citizen", "officer", "admin", "system"].includes(rawRole)
          ? rawRole
          : "system";
    const createdAt = timestamp(row?.createdAt ?? row?.created_at);
    if (
      !id ||
      historyIds.has(id) ||
      !complaint ||
      !EVENTS.has(eventType) ||
      !createdAt ||
      (row?.fromStatus != null && !fromStatus) ||
      (row?.toStatus != null && !toStatus)
    ) {
      reject(rejected.history, row, "invalid_or_unmappable_history");
      continue;
    }
    historyIds.add(id);
    if (
      eventType === "status_change" &&
      !isAllowedHistoricalTransition(fromStatus, toStatus, actorRole)
    ) {
      reject(rejected.history, row, "legacy_transition_not_in_approved_lifecycle");
      continue;
    }
    history.push({
      id,
      complaintId: complaint.id,
      eventType,
      fromStatus,
      toStatus,
      assigneeId: null,
      actorId: null,
      actorRole,
      note: null,
      createdAt,
    });
  }

  if (data.issues.some((issue) => Boolean(issue?.photoUrl ?? issue?.photo_url))) {
    warnings.push(
      "Legacy photo references were not imported; files require a separate privacy and file-integrity review."
    );
  }
  warnings.push(
    "Reporter names and contacts were not copied. Legacy officer records were withheld until their personal data is classified."
  );
  if (data.wards.some((ward) => !timestamp(ward?.createdAt ?? ward?.created_at))) {
    warnings.push(
      "A current UTC import timestamp is used for legacy wards that have no valid creation timestamp."
    );
  }

  return {
    sourceCounts: {
      wards: data.wards.length,
      officers: data.officers.length,
      complaints: data.issues.length,
      history: data.history.length,
    },
    rows: { wards, complaints: uniqueComplaints, history },
    rejected,
    warnings,
    sourceSha256: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}

function sameRow(existing, expected, fields) {
  return fields.every((field) => existing[field] === expected[field]);
}

function insertOrSkipWard(db, row) {
  const existing = db.prepare("SELECT * FROM wards WHERE id = ? OR code = ?").get(row.id, row.code);
  if (!existing) {
    db.prepare(
      `INSERT INTO wards(id,code,name,description,latitude,longitude,ward_number,active,created_at)
      VALUES (@id,@code,@name,@description,@latitude,@longitude,@wardNumber,@active,@createdAt)`
    ).run(row);
    return "imported";
  }
  const fields = [
    "id",
    "code",
    "name",
    "description",
    "latitude",
    "longitude",
    "ward_number",
    "active",
    "created_at",
  ];
  const expected = { ...row, ward_number: row.wardNumber, created_at: row.createdAt };
  if (sameRow(existing, expected, fields)) return "duplicate";
  throw new Error(`Conflicting existing ward id or code: ${row.id}`);
}

function insertOrSkipComplaint(db, row) {
  const existing = db
    .prepare("SELECT * FROM complaints WHERE id = ? OR reference = ?")
    .get(row.id, row.reference);
  if (existing) {
    const fields = [
      "id",
      "reference",
      "reporter_id",
      "title",
      "description",
      "category",
      "status",
      "severity",
      "ward_id",
      "location_description",
      "latitude",
      "longitude",
      "assigned_officer_id",
      "assigned_at",
      "rejection_reason",
      "resolution_note",
      "resolved_at",
      "status_updated_at",
      "created_at",
      "updated_at",
    ];
    const expected = {
      ...row,
      reporter_id: null,
      ward_id: row.wardId,
      location_description: row.locationDescription,
      assigned_officer_id: null,
      assigned_at: null,
      rejection_reason: row.rejectionReason,
      resolution_note: row.resolutionNote,
      resolved_at: row.resolvedAt,
      status_updated_at: row.statusUpdatedAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
    if (sameRow(existing, expected, fields)) return "duplicate";
    throw new Error(`Conflicting existing complaint id or reference: ${row.id}`);
  }
  db.prepare(
    `INSERT INTO complaints(
    id,reference,reporter_id,title,description,category,status,severity,ward_id,location_description,
    latitude,longitude,assigned_officer_id,assigned_at,rejection_reason,resolution_note,resolved_at,
    status_updated_at,created_at,updated_at
  ) VALUES (
    @id,@reference,@reporterId,@title,@description,@category,@status,@severity,@wardId,@locationDescription,
    @latitude,@longitude,@assignedOfficerId,@assignedAt,@rejectionReason,@resolutionNote,@resolvedAt,
    @statusUpdatedAt,@createdAt,@updatedAt
  )`
  ).run(row);
  return "imported";
}

function insertOrSkipHistory(db, row) {
  const existing = db.prepare("SELECT * FROM complaint_status_history WHERE id = ?").get(row.id);
  if (existing) {
    const expected = {
      id: row.id,
      complaint_id: row.complaintId,
      event_type: row.eventType,
      from_status: row.fromStatus,
      to_status: row.toStatus,
      assignee_id: null,
      actor_id: null,
      actor_role: row.actorRole,
      note: null,
      created_at: row.createdAt,
    };
    if (sameRow(existing, expected, Object.keys(expected))) return "duplicate";
    throw new Error(`Conflicting existing history id: ${row.id}`);
  }
  db.prepare(
    `INSERT INTO complaint_status_history(
    id,complaint_id,event_type,from_status,to_status,assignee_id,actor_id,actor_role,note,created_at
  ) VALUES (@id,@complaintId,@eventType,@fromStatus,@toStatus,@assigneeId,@actorId,@actorRole,@note,@createdAt)`
  ).run(row);
  return "imported";
}

export function applyImportPlan(db, plan) {
  const counts = {
    wards: { imported: 0, duplicate: 0 },
    complaints: { imported: 0, duplicate: 0 },
    history: { imported: 0, duplicate: 0 },
  };
  const apply = db.transaction(() => {
    for (const row of plan.rows.wards) counts.wards[insertOrSkipWard(db, row)] += 1;
    for (const row of plan.rows.complaints) counts.complaints[insertOrSkipComplaint(db, row)] += 1;
    for (const row of plan.rows.history) counts.history[insertOrSkipHistory(db, row)] += 1;
  });
  apply.immediate();
  return counts;
}

export function createJsonBackup(sourcePath) {
  const source = resolve(sourcePath);
  const folder = dirname(source);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt ? `-${attempt}` : "";
    const backupPath = join(folder, `${basename(source)}.backup-${stamp}${suffix}`);
    try {
      copyFileSync(source, backupPath, fsConstants.COPYFILE_EXCL);
      return backupPath;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not create a unique JSON backup path");
}

function parseArgs(args) {
  const options = { mode: "dry-run", sourcePath: DEFAULT_JSON_PATH, dbPath: DEFAULT_DATABASE_PATH };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--dry-run") options.mode = "dry-run";
    else if (args[i] === "--apply") options.mode = "apply";
    else if (args[i] === "--source" && args[i + 1]) options.sourcePath = resolve(args[++i]);
    else if (args[i] === "--db" && args[i + 1]) options.dbPath = resolve(args[++i]);
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  return options;
}

export async function runCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const data = JSON.parse(readFileSync(options.sourcePath, "utf8"));
  const plan = analyzeJsonStore(data);
  const baseSummary = {
    mode: options.mode,
    sourcePath: options.sourcePath,
    sourceSha256: plan.sourceSha256,
    sourceCounts: plan.sourceCounts,
    plannedImportCounts: {
      wards: plan.rows.wards.length,
      complaints: plan.rows.complaints.length,
      history: plan.rows.history.length,
    },
    withheldCounts: Object.fromEntries(
      Object.entries(plan.rejected).map(([key, rows]) => [key, rows.length])
    ),
    withheldRecords: plan.rejected,
    warnings: plan.warnings,
  };

  if (options.mode === "dry-run") {
    console.log(JSON.stringify(baseSummary, null, 2));
    return baseSummary;
  }

  const backupPath = createJsonBackup(options.sourcePath);
  const db = openDatabase({ dbPath: options.dbPath });
  try {
    const counts = applyImportPlan(db, plan);
    const result = { ...baseSummary, backupPath, appliedCounts: counts };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch((error) => {
    console.error(`JSON import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
