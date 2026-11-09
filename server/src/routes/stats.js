/**
 * RoadFix Local Server — Stats route.
 */
import { pathname } from "../http.js";

export function createStatsRouter(store, respond) {
  return async (req, res, url) => {
    const p = pathname(req);
    if (p === "/api/stats" && req.method === "GET") {
      const issues = store.data.issues;
      const wards = store.data.wards;
      const wardMap = new Map(wards.map((w) => [w.id, w.name]));

      const byStatus = {};
      const bySeverity = {};
      const byWard = {};

      for (const issue of issues) {
        byStatus[issue.status] = (byStatus[issue.status] || 0) + 1;
        bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
        const wname = wardMap.get(issue.wardId) || issue.wardId;
        byWard[wname] = (byWard[wname] || 0) + 1;
      }

      respond(200, {
        ok: true,
        data: {
          total: issues.length,
          byStatus,
          bySeverity,
          byWard: Object.entries(byWard).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        },
      });
      return true;
    }
    return false;
  };
}
