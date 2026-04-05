/**
 * Migration: onboarding email preferences + completion gate after profile name.
 *
 * Usage:
 *   node scripts/migrate-onboarding-comms.mjs --dry-run
 *   node scripts/migrate-onboarding-comms.mjs
 */
import { createSql } from './lib/migration-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const sql = createSql();

async function main() {
  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be written.\n');
    console.log(
      'Would add: email_product_updates, email_marketing, onboarding_comms_completed_at'
    );
    console.log('Would backfill onboarding_comms_completed_at for existing named profiles.');
    console.log('\n[DRY RUN] Done. Run without --dry-run to apply.');
    process.exit(0);
  }

  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_product_updates BOOLEAN NOT NULL DEFAULT true
  `;
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_marketing BOOLEAN NOT NULL DEFAULT false
  `;
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_comms_completed_at TIMESTAMPTZ
  `;

  await sql`
    UPDATE users
    SET onboarding_comms_completed_at = COALESCE(updated_at, created_at, NOW())
    WHERE onboarding_comms_completed_at IS NULL
      AND length(trim(coalesce(first_name, ''))) > 0
      AND length(trim(coalesce(last_name, ''))) > 0
  `;

  console.log('users email preference columns + onboarding_comms_completed_at ready');
  console.log('Existing complete profiles backfilled (skip new onboarding step).');
  console.log('Migration done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
