/**
 * RoadFix Local Server — Shared HTTP helpers.
 */
import { parse } from "node:url";
import { readFile } from "node:fs/promises";

/**
 * Read JSON body from an incoming request stream.
 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) return resolve(null);
        const contentType = req.headers["content-type"] || "";
        if (contentType.includes("multipart/form-data")) {
          return resolve({ form: parseMultipart(buf, contentType) });
        }
        resolve(JSON.parse(buf.toString("utf-8")));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
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

/**
 * Multipart/form-data parser for file uploads (best-effort, dependency-free).
 * Returns { fields: Record<string, string>, files: Record<string, { filename, contentType, data: Buffer }> }.
 */
function parseMultipart(buf, contentType) {
  const boundaryMatch = contentType.match(/boundary=("?)([^";]+)\1?/);
  if (!boundaryMatch) return { fields: {}, files: {} };
  const boundary = `--${boundaryMatch[2]}`;
  const text = buf.toString("utf-8");
  const parts = text.split(boundary).slice(1, -1);

  const fields = {};
  const files = {};

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd);
    const bodyPart = part.slice(headerEnd + 4).replace(/\r\n$/, "");

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const contentTypeMatch = headers.match(/Content-Type:\s*([^\r]+)/);

    const name = nameMatch ? nameMatch[1] : null;
    if (!name) continue;

    if (filenameMatch && contentTypeMatch) {
      // Find buffer offset for binary file data
      const headerEndIdx = buf.indexOf(part, 0);
      const offset = headerEndIdx + headerEnd + 4;
      const endIdx = buf.lastIndexOf(`\r\n${boundary}`);
      const data = buf.slice(offset, endIdx > offset ? endIdx : buf.length - 2);
      files[name] = {
        filename: filenameMatch[1],
        contentType: contentTypeMatch[1].trim(),
        data,
      };
    } else {
      fields[name] = bodyPart.trim();
    }
  }

  return { fields, files };
}