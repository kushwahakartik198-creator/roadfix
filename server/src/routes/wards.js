/**
 * RoadFix Local Server — Wards routes.
 */
import { pathname, sendJson, readJsonBody } from "../http.js";

export function createWardRouter(store, respond) {
  return async (req, res, url) => {
    const p = pathname(req);
    const mWard = p.match(/^\/api\/wards\/([^/]+)$/);
    const mIssues = p.match(/^\/api\/wards\/([^/]+)\/issues$/);

    // GET /api/wards
    if (p === "/api/wards" && req.method === "GET") {
      const q = url.searchParams.get("q");
      const active = url.searchParams.get("active");
      const wards = store.listWards({ q, active });
      respond(200, { ok: true, data: wards, count: wards.length });
      return true;
    }

    // GET /api/wards/:id
    if (mWard && req.method === "GET") {
      const ward = store.getWard(mWard[1]);
      if (!ward) {
        respond(404, { ok: false, error: "Ward not found" });
        return true;
      }
      respond(200, { ok: true, data: ward });
      return true;
    }

    // GET /api/wards/:id/issues
    if (mIssues && req.method === "GET") {
      const wardId = mIssues[1];
      if (!store.getWard(wardId)) {
        respond(404, { ok: false, error: "Ward not found" });
        return true;
      }
      const status = url.searchParams.get("status") || undefined;
      const severity = url.searchParams.get("severity") || undefined;
      const page = Number(url.searchParams.get("page")) || 1;
      const pageSize = Number(url.searchParams.get("pageSize")) || 20;
      const result = store.listIssues({ wardId, status, severity, page, pageSize, sort: "createdAt", dir: "desc" });
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Total-Count": String(result.total),
        "X-Page": String(result.page),
        "X-Page-Size": String(result.pageSize),
      });
      res.end(JSON.stringify({ ok: true, data: result.data, ...result }));
      return true;
    }

    // POST /api/wards — create a ward (officer/admin)
    if (p === "/api/wards" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const officerId = req.headers["x-officer-id"];
        if (!officerId) {
          respond(403, { ok: false, error: "Officer authentication required" });
          return true;
        }
        if (!body || !body.name || !body.code) {
          respond(400, { ok: false, error: "name and code are required" });
          return true;
        }
        if (store.listWards().some((w) => w.code === body.code.toUpperCase())) {
          respond(409, { ok: false, error: "Ward code already exists" });
          return true;
        }
        const ward = {
          id: randomUid(),
          code: body.code.toUpperCase(),
          name: body.name.trim(),
          description: body.description || null,
          lat: Number(body.lat) || 27.18,
          lng: Number(body.lng) || 78.02,
          active: true,
          createdAt: new Date().toISOString(),
        };
        store.data.wards.push(ward);
        respond(201, { ok: true, data: ward });
      } catch (err) {
        respond(400, { ok: false, error: err.message || "Invalid request" });
      }
      return true;
    }

    return false;
  };
}

function randomUid() {
  return (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
}
