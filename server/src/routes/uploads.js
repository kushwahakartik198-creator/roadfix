/**
 * RoadFix Local Server — Uploads routes.
 *
 * Serves citizen photos and officer repair evidence stored in data/uploads/.
 */
import { sendJson } from "../http.js";

export function createUploadsRouter(store, respond, uploadsDir) {
  return async (req, res, url) => {
    const p = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
    const m = p.match(/^\/uploads\/([^/]+)$/);

    if (m && req.method === "GET") {
      try {
        const { readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const filePath = join(uploadsDir, m[1]);
        const buf = await readFile(filePath);
        const ext = m[1].split(".").pop().toLowerCase();
        const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        res.end(buf);
        return true;
      } catch {
        respond(404, { ok: false, error: "File not found" });
        return true;
      }
    }

    return false;
  };
}
