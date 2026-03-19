-- ══════════════════════════════════════════════════════════════
--  BDA Portal — PostgreSQL Schema
--  Runs automatically when the container starts for the first time
-- ══════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- for case-insensitive email

-- ── ENUM types ────────────────────────────────────────────────
CREATE TYPE user_role   AS ENUM ('Admin', 'Manager', 'Analyst', 'Viewer');
CREATE TYPE user_status AS ENUM ('active', 'pending', 'inactive');

-- ══════════════════════════════════════════════════════════════
--  TABLE: users
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    first_name   VARCHAR(80)  NOT NULL,
    last_name    VARCHAR(80)  NOT NULL DEFAULT '',
    email        CITEXT       NOT NULL UNIQUE,
    password     TEXT         NOT NULL,           -- bcrypt hash
    phone        VARCHAR(30)  NOT NULL DEFAULT '',
    company      VARCHAR(120) NOT NULL DEFAULT '',
    role         user_role    NOT NULL DEFAULT 'Viewer',
    status       user_status  NOT NULL DEFAULT 'active',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login   TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email   ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role    ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_company ON users (company);

-- ══════════════════════════════════════════════════════════════
--  TABLE: sessions  (audit trail of logins)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address   VARCHAR(45),
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- ══════════════════════════════════════════════════════════════
--  TABLE: audit_logs  (who did what and when)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(60) NOT NULL,   -- e.g. 'user.create', 'user.delete'
    target_id    INTEGER,                -- affected user id
    details      JSONB,
    ip_address   VARCHAR(45),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_logs (created_at DESC);

-- ══════════════════════════════════════════════════════════════
--  TRIGGER: auto-update updated_at on users
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════
--  SEED DATA  (default admin + sample users)
--  Password for all seed users: Admin@123
--  bcrypt hash generated with 10 rounds
-- ══════════════════════════════════════════════════════════════
INSERT INTO users (first_name, last_name, email, password, phone, company, role, status, created_at) VALUES
  ('Admin',  'User',    'admin@bda.com',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543210', 'BDA Corp',  'Admin',   'active',   NOW() - INTERVAL '90 days'),
  ('Sarah',  'Chen',    'sarah@acme.com',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543211', 'Acme Corp', 'Manager',  'active',   NOW() - INTERVAL '60 days'),
  ('Raj',    'Patel',   'raj@techco.com',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543212', 'TechCo',    'Analyst',  'active',   NOW() - INTERVAL '45 days'),
  ('Maria',  'Garcia',  'maria@xyz.com',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543213', 'XYZ Ltd',   'Viewer',   'pending',  NOW() - INTERVAL '30 days'),
  ('James',  'Wilson',  'james@corp.com',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543214', 'Corp Inc',  'Analyst',  'active',   NOW() - INTERVAL '25 days'),
  ('Priya',  'Sharma',  'priya@infosys.com',  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543215', 'Infosys',   'Manager',  'active',   NOW() - INTERVAL '20 days'),
  ('Chen',   'Wei',     'chen@alibaba.com',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543216', 'Alibaba',   'Viewer',   'inactive', NOW() - INTERVAL '15 days'),
  ('Ayesha', 'Khan',    'ayesha@tcs.com',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543217', 'TCS',       'Analyst',  'active',   NOW() - INTERVAL '10 days'),
  ('David',  'Lee',     'david@wipro.com',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543218', 'Wipro',     'Viewer',   'active',   NOW() - INTERVAL '7 days'),
  ('Nina',   'Torres',  'nina@hcl.com',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '+91 9876543219', 'HCL',       'Admin',    'active',   NOW() - INTERVAL '3 days')
ON CONFLICT (email) DO NOTHING;

-- Seed some audit log entries
INSERT INTO audit_logs (user_id, action, target_id, details, created_at) VALUES
  (1, 'user.create',  2, '{"note":"Initial setup"}',           NOW() - INTERVAL '60 days'),
  (1, 'user.create',  3, '{"note":"Initial setup"}',           NOW() - INTERVAL '45 days'),
  (1, 'user.update',  3, '{"field":"role","from":"Viewer","to":"Analyst"}', NOW() - INTERVAL '40 days'),
  (1, 'user.create',  4, '{"note":"Invited by admin"}',        NOW() - INTERVAL '30 days'),
  (2, 'user.create',  5, '{"note":"Team member"}',             NOW() - INTERVAL '25 days')
ON CONFLICT DO NOTHING;
