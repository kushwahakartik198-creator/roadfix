/**
 * RoadFix Local Server — Shared HTTP helpers.
 */
/**
 * Read JSON body from an incoming request stream.
 */
export function readJsonBody(req, { limitBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      length += chunk.length;
      if (length > limitBytes) {
        failed = true;
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      try {
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) return resolve(null);
        const contentType = req.headers["content-type"] || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          const error = new Error("Content-Type must be application/json");
          error.statusCode = 415;
          return reject(error);
        }
        resolve(JSON.parse(buf.toString("utf-8")));
      } catch {
        const error = new Error("Invalid JSON body");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send a JSON response.
 */
export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Parse a URL pathname into segments.
 */
export function pathname(req) {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
}
