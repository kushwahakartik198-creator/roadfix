const LOCAL_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function createSecurityConfig({ mode = process.env.ROADFIX_SECURITY_MODE, nodeEnv = process.env.NODE_ENV, corsOrigins = process.env.CORS_ORIGINS, host = process.env.HOST || "127.0.0.1" } = {}) {
  let resolvedMode = mode;
  if (resolvedMode == null || resolvedMode === "") {
    if (nodeEnv === "production") resolvedMode = "production";
    else if (["development", "test"].includes(nodeEnv)) resolvedMode = "local";
    else {
      throw new Error("Set ROADFIX_SECURITY_MODE to 'local' or 'production' for this deployment");
    }
  }
  if (!["local", "production"].includes(resolvedMode)) throw new Error("ROADFIX_SECURITY_MODE must be 'local' or 'production'");
  if (nodeEnv === "production" && resolvedMode !== "production") throw new Error("Production NODE_ENV cannot use local security mode");

  const configured = typeof corsOrigins === "string" ? corsOrigins.split(",").map((origin) => origin.trim()).filter(Boolean) : [];
  const origins = configured.length ? configured : resolvedMode === "local" ? LOCAL_ORIGINS : [];
  if (resolvedMode === "production" && origins.length === 0) throw new Error("CORS_ORIGINS must contain at least one HTTPS origin in production");
  for (const origin of origins) {
    if (origin === "*") throw new Error("Wildcard CORS origins are not allowed");
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error(`Invalid CORS origin: ${origin}`); }
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error(`CORS entries must be exact origins without paths: ${origin}`);
    }
    if (resolvedMode === "production" && parsed.protocol !== "https:") throw new Error("Production CORS origins must use HTTPS");
    if (resolvedMode === "local" && (!LOOPBACK_HOSTS.has(parsed.hostname) || !["http:", "https:"].includes(parsed.protocol))) {
      throw new Error("Local security mode allows loopback origins only");
    }
  }
  if (resolvedMode === "local" && !LOOPBACK_HOSTS.has(host)) throw new Error("Local security mode must bind to a loopback host");
  return Object.freeze({ mode: resolvedMode, origins: Object.freeze([...new Set(origins)]), secureCookies: resolvedMode === "production", host });
}
