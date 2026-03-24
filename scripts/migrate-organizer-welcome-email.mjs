/**
 * Migration: users.organizer_welcome_sent_at for deduplicating organizer welcome emails.
 *
 * Usage:
 *   node scripts/migrate-organizer-welcome-email.mjs --dry-run
 *   node scripts/migrate-organizer-welcome-email.mjs
 */
import { createSql } from './lib/migration-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const sql = createSql();

async function main() {
  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be written.\n');
    console.log('Would run: ALTER TABLE users ADD COLUMN IF NOT EXISTS organizer_welcome_sent_at TIMESTAMPTZ');
    console.log('\n[DRY RUN] Done. Run without --dry-run to apply.');
    process.exit(0);
  }

  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS organizer_welcome_sent_at TIMESTAMPTZ
  `;
  console.log('users.organizer_welcome_sent_at column ready');
  console.log('Migration done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
