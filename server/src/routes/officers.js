/**
 * RoadFix Local Server — Officers routes.
 */
import { pathname, sendJson, readJsonBody } from "../http.js";

export function createOfficerRouter(store, respond) {
  return async (req, res, url) => {
    const p = pathname(req);
    const m = p.match(/^\/api\/officers\/([^/]+)$/);

    // GET /api/officers
    if (p === "/api/officers" && req.method === "GET") {
      const q = url.searchParams.get("q") || undefined;
      const wardId = url.searchParams.get("wardId") || undefined;
      const active = url.searchParams.get("active");
      const officers = store.listOfficers({ q, wardId, active });
      respond(200, { ok: true, data: officers, count: officers.length });
      return true;
    }

    // GET /api/officers/:id
    if (m && req.method === "GET") {
      const officer = store.getOfficer(m[1]);
      if (!officer) {
        respond(404, { ok: false, error: "Officer not found" });
        return true;
      }
      respond(200, { ok: true, data: officer });
      return true;
    }

    return false;
  };
}
