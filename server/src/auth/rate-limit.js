import { createHash } from "node:crypto";

export class FixedWindowLimiter {
  #entries = new Map();

  constructor({ maxKeys = 10_000, now = () => Date.now() } = {}) {
    this.maxKeys = maxKeys;
    this.now = now;
  }

  consume(key, { limit, windowMs }) {
    const now = this.now();
    let entry = this.#entries.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (this.#entries.size >= this.maxKeys) this.#evict(now, windowMs);
      entry = { start: now, count: 0, windowMs };
      this.#entries.set(key, entry);
    }
    entry.count += 1;
    const retryAfter = Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000));
    return { allowed: entry.count <= limit, retryAfter, remaining: Math.max(0, limit - entry.count) };
  }

  reset(key) { this.#entries.delete(key); }
  get size() { return this.#entries.size; }

  #evict(now, incomingWindow) {
    for (const [key, entry] of this.#entries) {
      if (now - entry.start >= entry.windowMs) this.#entries.delete(key);
    }
    while (this.#entries.size >= this.maxKeys) this.#entries.delete(this.#entries.keys().next().value);
    if (!this.maxKeys || !incomingWindow) this.#entries.clear();
  }
}

export function loginRateKeys(remoteAddress, normalizedEmail) {
  const address = remoteAddress || "unknown";
  const emailDigest = createHash("sha256").update(normalizedEmail).digest("hex");
  return [`login:ip:${address}`, `login:email:${emailDigest}`];
}

export function requestRemoteAddress(req) {
  // Forwarded headers are intentionally ignored; deployment proxies must apply their own limits.
  return req.socket?.remoteAddress ?? "unknown";
}
