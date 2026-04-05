/**
 * Migration: convert attendees timestamp columns to TIMESTAMPTZ.
 * Existing values are interpreted as UTC (Neon / NOW() semantics for naive TIMESTAMP).
 *
 * Usage:
 *   node scripts/migrate-attendee-timestamps-tz.mjs --dry-run
 *   node scripts/migrate-attendee-timestamps-tz.mjs
 */
import { createSql } from './lib/migration-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const sql = createSql();

async function columnDataType(column) {
  const rows = await sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendees'
      AND column_name = ${column}
  `;
  return rows[0]?.data_type ?? null;
}

async function main() {
  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be written.\n');
  }

  const columns = [
    'checked_in_at',
    'rsvp_at',
    'created_at',
    'qr_expires_at',
    'qr_used_at',
  ];

  for (const col of columns) {
    const dt = await columnDataType(col);
    if (!dt) {
      console.log(`Skip ${col}: column not found`);
      continue;
    }
    if (dt === 'timestamp with time zone') {
      console.log(`${col}: already TIMESTAMPTZ`);
      continue;
    }
    if (dt !== 'timestamp without time zone') {
      console.log(`Skip ${col}: unexpected type ${dt}`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`Would set ${col} → TIMESTAMPTZ (UTC)`);
      continue;
    }
    // Whitelisted column names only — do not interpolate user input.
    if (col === 'checked_in_at') {
      await sql`ALTER TABLE attendees ALTER COLUMN checked_in_at TYPE TIMESTAMPTZ USING checked_in_at AT TIME ZONE 'UTC'`;
    } else if (col === 'rsvp_at') {
      await sql`ALTER TABLE attendees ALTER COLUMN rsvp_at TYPE TIMESTAMPTZ USING rsvp_at AT TIME ZONE 'UTC'`;
    } else if (col === 'created_at') {
      await sql`ALTER TABLE attendees ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`;
    } else if (col === 'qr_expires_at') {
      await sql`ALTER TABLE attendees ALTER COLUMN qr_expires_at TYPE TIMESTAMPTZ USING qr_expires_at AT TIME ZONE 'UTC'`;
    } else if (col === 'qr_used_at') {
      await sql`ALTER TABLE attendees ALTER COLUMN qr_used_at TYPE TIMESTAMPTZ USING qr_used_at AT TIME ZONE 'UTC'`;
    }
    console.log(`${col}: migrated to TIMESTAMPTZ`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Done. Run without --dry-run to apply.');
    process.exit(0);
  }

  console.log('Migration done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
