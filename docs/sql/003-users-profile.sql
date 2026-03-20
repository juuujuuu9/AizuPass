-- App user profiles: Clerk `users.id` = `users.id` in this table.
-- Run against Neon (or your Postgres). Idempotent.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Names live on `users` only (not per membership)
ALTER TABLE organization_memberships DROP COLUMN IF EXISTS first_name;
ALTER TABLE organization_memberships DROP COLUMN IF EXISTS last_name;
