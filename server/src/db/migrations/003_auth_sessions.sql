ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1));

CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL CHECK(length(password_hash) BETWEEN 80 AND 100),
  password_salt TEXT NOT NULL CHECK(length(password_salt) BETWEEN 20 AND 24),
  hash_parameters TEXT NOT NULL CHECK(length(hash_parameters) BETWEEN 1 AND 100),
  changed_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 100),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  csrf_token TEXT NOT NULL CHECK(length(csrf_token) = 43),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX sessions_user_expiry_idx ON sessions(user_id, expires_at);
CREATE INDEX user_credentials_changed_idx ON user_credentials(changed_at);

CREATE TRIGGER admin_audit_log_no_update
BEFORE UPDATE ON admin_audit_log BEGIN
  SELECT RAISE(ABORT, 'admin audit records are append-only');
END;

CREATE TRIGGER admin_audit_log_no_delete
BEFORE DELETE ON admin_audit_log BEGIN
  SELECT RAISE(ABORT, 'admin audit records are append-only');
END;
