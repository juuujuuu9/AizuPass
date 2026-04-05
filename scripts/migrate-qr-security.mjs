/**
 * One-time migration: add QR token columns and backfill attendee id to UUID.
 * Run after pulling QR security changes. Safe to run multiple times (adds columns if missing; backfills only non-UUID ids).
 */
import { createSql } from './lib/migration-helpers.mjs';
import crypto from 'crypto';

const sql = createSql();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUUID(s) {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

async function main() {
  // 1. Add new columns if not present (one ALTER per column in Postgres)
  await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS qr_token TEXT`;
  await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS qr_expires_at TIMESTAMPTZ`;
  await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS qr_used_at TIMESTAMPTZ`;
  await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS qr_used_by_device VARCHAR(255)`;
  console.log('Added QR token columns (if missing)');

  // 2. Backfill id to UUID for rows that are not yet UUIDs
  const rows = await sql`SELECT id FROM attendees`;
  let backfilled = 0;
  for (const row of rows) {
    const oldId = row.id;
    if (isUUID(oldId)) continue;
    const newId = crypto.randomUUID();
    await sql`UPDATE attendees SET id = ${newId} WHERE id = ${oldId}`;
    backfilled++;
  }
  console.log(`Backfilled ${backfilled} attendee id(s) to UUID`);

  console.log('Migration done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
