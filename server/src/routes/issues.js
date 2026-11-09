/**
 * RoadFix Local Server — Issues routes.
 *
 * Handles citizen reporting, ward-based issue listing, public tracking by
 * reference, officer triage (status transitions), and assignment.
 */
import { pathname, sendJson, readJsonBody } from "../http.js";

const VALID_STATUSES = ["reported", "verified", "in_progress", "resolved", "rejected"];
const VALID_SEVERITY = ["low", "medium", "high", "critical"];
const VALID_CATEGORIES = [
  "pothole",
  "waterlogging",
  "open_manhole",
  "streetlight",
  "garbage",
  "erosion",
  "water_pipe_leak",
  "damaged_sign",
  "other",
];

export function createIssueRouter(store, respond) {
  return async (req, res, url) => {
    const p = pathname(req);
    const mIssue = p.match(/^\/api\/issues\/([^/]+)$/);
    const mTrack = p.match(/^\/api\/issues\/([^/]+)\/track$/);
    const mHistory = p.match(/^\/api\/issues\/([^/]+)\/history$/);
    const mAssign = p.match(/^\/api\/issues\/([^/]+)\/assign$/);

    // GET /api/issues — ward-based listing
    if (p === "/api/issues" && req.method === "GET") {
      const wardId = url.searchParams.get("wardId") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const severity = url.searchParams.get("severity") || undefined;
      const category = url.searchParams.get("category") || undefined;
      const assignedOfficerId = url.searchParams.get("assignedOfficerId") || undefined;
      const q = url.searchParams.get("q") || undefined;
      const page = Number(url.searchParams.get("page")) || 1;
      const pageSize = Number(url.searchParams.get("pageSize")) || 20;
      const sort = url.searchParams.get("sort") || "createdAt";
      const dir = url.searchParams.get("dir") || "desc";

      const result = store.listIssues({
        wardId, status, severity, category, assignedOfficerId, q, page, pageSize, sort, dir,
      });

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Total-Count": String(result.total),
        "X-Page": String(result.page),
        "X-Page-Size": String(result.pageSize),
      });
      res.end(JSON.stringify({ ok: true, data: result.data, ...result }));
      return true;
    }

    // GET /api/issues/:id
    if (mIssue && req.method === "GET") {
      const issue = store.getIssue(mIssue[1]);
      if (!issue) {
        respond(404, { ok: false, error: "Issue not found" });
        return true;
      }
      respond(200, { ok: true, data: issue });
      return true;
    }

    // GET /api/issues/:ref/track — public tracking by reference
    if (mTrack && req.method === "GET") {
      const issue = store.getIssueByReference(mTrack[1]);
      if (!issue) {
        respond(404, { ok: false, error: "No issue found with that reference number" });
        return true;
      }
      respond(200, { ok: true, data: issue });
      return true;
    }

    // GET /api/issues/:id/history — audit trail
    if (mHistory && req.method === "GET") {
      const issue = store.getIssue(mHistory[1]);
      if (!issue) {
        respond(404, { ok: false, error: "Issue not found" });
        return true;
      }
      const history = store.data.history.filter((h) => h.issueId === mHistory[1]);
      history.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      respond(200, { ok: true, data: history });
      return true;
    }

    // POST /api/issues — citizen submits a report (ward + optional photo)
    if (p === "/api/issues" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const parsed = body?.form ?? body;

        // Validation
        const required = ["wardId", "category", "description", "lat", "lng"];
        for (const field of required) {
          if (parsed[field] === undefined || parsed[field] === null || parsed[field] === "") {
            respond(400, { ok: false, error: `${field} is required` });
            return true;
          }
        }
        if (!VALID_CATEGORIES.includes(parsed.category)) {
          respond(400, { ok: false, error: `Invalid category. Allowed: ${VALID_CATEGORIES.join(", ")}` });
          return true;
        }
        const lat = Number(parsed.lat);
        const lng = Number(parsed.lng);
        if (Number.isNaN(lat) || lat < -90 || lat > 90 || Number.isNaN(lng) || lng < -180 || lng > 180) {
          respond(400, { ok: false, error: "Invalid latitude/longitude" });
          return true;
        }
        const ward = store.getWard(parsed.wardId);
        if (!ward) {
          respond(404, { ok: false, error: "Ward not found" });
          return true;
        }
        if (!parsed.severity) parsed.severity = "medium";
        if (!VALID_SEVERITY.includes(parsed.severity)) {
          respond(400, { ok: false, error: `Invalid severity. Allowed: ${VALID_SEVERITY.join(", ")}` });
          return true;
        }
        if (!parsed.title) parsed.title = parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1);
        if (parsed.description.length < 10 || parsed.description.length > 1000) {
          respond(400, { ok: false, error: "Description must be between 10 and 1000 characters" });
          return true;
        }

        // Handle photo upload (data URL or base64)
        let photoUrl = null;
        if (parsed.photo) {
          photoUrl = await savePhoto(parsed.photo);
        }

        const reference = generateReference();
        const now = new Date().toISOString();
        const reporterId = `citizen-${randomUid()}`;

        const issue = {
          id: randomUid(),
          reference,
          title: parsed.title.trim(),
          description: parsed.description.trim(),
          category: parsed.category,
          status: "reported",
          severity: parsed.severity,
          wardId: parsed.wardId,
          locationDescription: parsed.locationDescription || null,
          lat,
          lng,
          reporterName: parsed.reporterName || "Anonymous",
          reporterContact: parsed.reporterContact || null,
          reporterId,
          assignedOfficerId: null,
          assignedAt: null,
          rejectionReason: null,
          resolutionNote: null,
          resolvedAt: null,
          photoUrl,
          createdAt: now,
          updatedAt: now,
        };
        store.data.issues.push(issue);

        store.addHistory({
          id: randomUid(),
          issueId: issue.id,
          eventType: "created",
          fromStatus: null,
          toStatus: "reported",
          actorId: reporterId,
          actorRole: "citizen",
          note: "Citizen submitted report via RoadFix.",
          createdAt: now,
        });

        respond(201, { ok: true, data: issue });
      } catch (err) {
        respond(400, { ok: false, error: err.message || "Invalid request" });
      }
      return true;
    }

    // PATCH /api/issues/:id — officer triage (status transition)
    if (mIssue && req.method === "PATCH") {
      const officerId = req.headers["x-officer-id"];
      if (!officerId) {
        respond(403, { ok: false, error: "Officer authentication required (X-Officer-Id header)" });
        return true;
      }
      const officer = store.getOfficer(officerId);
      if (!officer) {
        respond(403, { ok: false, error: "Officer not found" });
        return true;
      }
      const issue = store.getIssue(mIssue[1]);
      if (!issue) {
        respond(404, { ok: false, error: "Issue not found" });
        return true;
      }

      try {
        const body = await readJsonBody(req);
        const parsed = body?.form ?? body;
        const { status, severity, note } = parsed;

        // Validate officer can act on this issue (same ward or senior engineer)
        const canAct =
          officer.role === "senior_engineer" ||
          officer.wardId === issue.wardId ||
          officer.assignedOfficerId === officer.id; // assigned officer
        if (!canAct && issue.wardId !== officer.wardId) {
          respond(403, { ok: false, error: "You are not authorized to triage issues in this ward" });
          return true;
        }

        if (status) {
          if (!VALID_STATUSES.includes(status)) {
            respond(400, { ok: false, error: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}` });
            return true;
          }
          const fromStatus = issue.status;
          const transition = validateTransition(fromStatus, status, parsed, issue, officer);
          if (!transition.ok) {
            respond(400, { ok: false, error: transition.error });
            return true;
          }
          issue.status = status;
          issue.updatedAt = new Date().toISOString();
          if (severity && VALID_SEVERITY.includes(severity)) issue.severity = severity;
          if (status === "resolved") {
            issue.resolvedAt = new Date().toISOString();
            issue.resolutionNote = note || null;
          }
          if (status === "rejected") {
            issue.rejectionReason = note || null;
          }

          store.addHistory({
            id: randomUid(),
            issueId: issue.id,
            eventType: "status_change",
            fromStatus,
            toStatus: status,
            actorId: officerId,
            actorRole: officer.role,
            note: note || null,
            createdAt: new Date().toISOString(),
          });
        } else if (note || severity) {
          issue.updatedAt = new Date().toISOString();
          if (severity && VALID_SEVERITY.includes(severity)) issue.severity = severity;
          if (note) {
            store.addHistory({
              id: randomUid(),
              issueId: issue.id,
              eventType: "note",
              fromStatus: null,
              toStatus: null,
              actorId: officerId,
              actorRole: officer.role,
              note,
              createdAt: new Date().toISOString(),
            });
          }
        } else {
          respond(400, { ok: false, error: "Nothing to update (provide status and/or note)" });
          return true;
        }

        respond(200, { ok: true, data: issue });
      } catch (err) {
        respond(400, { ok: false, error: err.message || "Invalid request" });
      }
      return true;
    }

    // POST /api/issues/:id/assign — assign officer
    if (mAssign && req.method === "POST") {
      const officerId = req.headers["x-officer-id"];
      if (!officerId) {
        respond(403, { ok: false, error: "Officer authentication required" });
        return true;
      }
      const officer = store.getOfficer(officerId);
      if (!officer || officer.role !== "senior_engineer") {
        respond(403, { ok: false, error: "Only senior engineers can assign issues" });
        return true;
      }
      const issue = store.getIssue(mAssign[1]);
      if (!issue) {
        respond(404, { ok: false, error: "Issue not found" });
        return true;
      }
      if (issue.status !== "verified" && issue.status !== "in_progress") {
        respond(400, { ok: false, error: "Assignment only allowed for verified or in_progress issues" });
        return true;
      }
      try {
        const body = await readJsonBody(req);
        const parsed = body?.form ?? body;
        const assigneeId = parsed.officerId;
        if (!assigneeId) {
          respond(400, { ok: false, error: "officerId is required" });
          return true;
        }
        const assignee = store.getOfficer(assigneeId);
        if (!assignee || !assignee.active) {
          respond(404, { ok: false, error: "Assignee officer not found" });
          return true;
        }
        const now = new Date().toISOString();
        issue.assignedOfficerId = assigneeId;
        issue.assignedAt = now;
        issue.updatedAt = now;
        store.addHistory({
          id: randomUid(),
          issueId: issue.id,
          eventType: "assignment",
          fromStatus: issue.status,
          toStatus: issue.status,
          actorId: officerId,
          actorRole: officer.role,
          note: `Assigned to ${assignee.name}`,
          createdAt: now,
        });
        respond(200, { ok: true, data: issue });
      } catch (err) {
        respond(400, { ok: false, error: err.message || "Invalid request" });
      }
      return true;
    }

    return false;
  };
}

function validateTransition(from, to, parsed, issue, officer) {
  // Allowed transitions per RoadFix transition matrix
  const allowed = {
    reported: ["verified", "rejected"],
    verified: ["in_progress", "rejected"],
    in_progress: ["resolved", "rejected"],
    resolved: ["reported"], // reopen
    rejected: ["reported"], // reopen
  };
  if (!allowed[from]?.includes(to)) {
    return { ok: false, error: `Cannot transition from ${from} to ${to}` };
  }
  if (to === "verified" && !parsed.severity) {
    return { ok: false, error: "Severity is required when verifying an issue" };
  }
  if (to === "rejected" && !parsed.note) {
    return { ok: false, error: "A rejection reason is required when rejecting an issue" };
  }
  if (to === "in_progress") {
    // Must be assigned to acting officer, unless actor is a senior engineer
    const assigned = issue.assignedOfficerId;
    if (!assigned) {
      return { ok: false, error: "Issue must be assigned to an officer before starting work" };
    }
    if (officer.role !== "senior_engineer" && assigned !== officer.id) {
      return { ok: false, error: "Only the assigned officer or a senior engineer can start work" };
    }
  }
  if (to === "resolved" && !parsed.note) {
    return { ok: false, error: "A resolution note is required when resolving an issue" };
  }
  if (to === "resolved") {
    const assigned = issue.assignedOfficerId;
    if (!assigned) {
      return { ok: false, error: "Issue must be assigned to an officer before resolving" };
    }
    if (officer.role !== "senior_engineer" && assigned !== officer.id) {
      return { ok: false, error: "Only the assigned officer or a senior engineer can resolve" };
    }
  }
  return { ok: true };
}

async function savePhoto(dataUrl) {
  const { createWriteStream } = await import("node:fs");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const fs = await import("node:fs/promises");
  const { execSync } = await import("node:child_process");

  const match = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.*)$/);
  if (!match) throw new Error("Invalid photo data URL");
  const ext = match[1].toLowerCase();
  const base64 = match[2];
  const filename = `report_${randomUid()}.${ext}`;
  const dir = join(process.cwd(), "data", "uploads");
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  const buffer = Buffer.from(base64, "base64");
  await fs.writeFile(join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

function randomUid() {
  return (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
}

function generateReference() {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let ref = "RF-AG-";
  for (let i = 0; i < 8; i++) ref += alphabet[Math.floor(Math.random() * alphabet.length)];
  return ref;
}
