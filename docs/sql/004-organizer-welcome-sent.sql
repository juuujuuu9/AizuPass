-- Tracks whether we already sent the organizer onboarding welcome email (Clerk user.created → Resend).
-- Run after 003-users-profile.sql. Idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS organizer_welcome_sent_at TIMESTAMPTZ;
