CREATE TABLE IF NOT EXISTS portal_accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff', disabled INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS portal_one_owner ON portal_accounts(role) WHERE role='owner';
CREATE TABLE IF NOT EXISTS portal_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS portal_session_expiry ON portal_sessions(expires);
CREATE TABLE IF NOT EXISTS portal_login_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
