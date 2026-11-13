import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  findSession,
  hashPassword,
  normalizeEmail,
  parseCookies,
  revokeSession,
  sessionCookie,
  verifyPassword,
} from "./security.js";

const DUMMY_CREDENTIAL = await hashPassword("roadfix-dummy-login-password");

export function createAuthService(db, { secureCookies = true } = {}) {
  const findUser = db.prepare(`SELECT u.id AS userId, u.email, u.role, u.display_name AS displayName,
      u.active AS active, c.password_hash, c.password_salt, c.hash_parameters,
      o.id AS officerId, o.ward_id AS wardId, o.active AS officerActive
    FROM users u LEFT JOIN user_credentials c ON c.user_id = u.id
    LEFT JOIN officers o ON o.user_id = u.id WHERE u.email = ? COLLATE NOCASE`);

  return {
    async login(emailInput, password) {
      const email = normalizeEmail(emailInput) ?? "invalid@invalid.invalid";
      const user = findUser.get(email);
      const credential = user?.password_hash ? {
        password_hash: user.password_hash,
        password_salt: user.password_salt,
        hash_parameters: user.hash_parameters,
      } : DUMMY_CREDENTIAL;
      const passwordMatches = await verifyPassword(password, credential);
      const validRole = user?.role === "admin" || user?.role === "officer";
      const validOfficer = user?.role !== "officer" || (user.officerId && user.officerActive && user.wardId);
      if (!passwordMatches || !user?.active || !validRole || !validOfficer) return null;
      return {
        user: safeUser(user),
        session: createSession(db, user.userId),
      };
    },
    authenticate(req) {
      const token = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
      const session = findSession(db, token);
      if (!session) return null;
      return {
        sessionId: session.sessionId,
        userId: session.userId,
        role: session.role,
        displayName: session.displayName,
        officerId: session.officerId ?? null,
        wardId: session.wardId ?? null,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      };
    },
    revoke(sessionId) { return revokeSession(db, sessionId); },
    cookie: (token) => sessionCookie(token, { secure: secureCookies }),
    clearCookie: () => clearSessionCookie({ secure: secureCookies }),
    getCookieName() { return SESSION_COOKIE; },
  };
}

export function safeUser(row) {
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    officerId: row.officerId ?? null,
    wardId: row.wardId ?? null,
  };
}
