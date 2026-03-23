/**
 * Migration: add organizations, memberships, invitations, and event ownership.
 * Enforces:
 * - one organization per organizer via UNIQUE(owner_user_id)
 * - one event per organization via UNIQUE(events.organization_id)
 *
 * Usage:
 *   node scripts/migrate-organizations.mjs --dry-run
 *   node scripts/migrate-organizations.mjs
 */
import { createSql } from './lib/migration-helpers.mjs';
import crypto from 'crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const sql = createSql();

async function main() {
  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be written.\n');
    console.log('Would create organizations, organization_memberships, organization_invitations tables');
    console.log('Would add events.organization_id and enforce unique(event.organization_id)');
    process.exit(0);
  }

  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_user_id TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('organizations table ready');

  await sql`
    CREATE TABLE IF NOT EXISTS organization_memberships (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('organizer', 'staff')),
      invited_by_user_id TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (organization_id, user_id)
    )
  `;
  console.log('organization_memberships table ready');

  await sql`
    CREATE TABLE IF NOT EXISTS organization_invitations (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('staff')),
      token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
      expires_at TIMESTAMP NOT NULL,
      invited_by_user_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('organization_invitations table ready');

  await sql`CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_org_invites_org ON organization_invitations(organization_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invitations(LOWER(TRIM(email)))`;

  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id UUID`;
  console.log('events.organization_id column ready');

  const unscopedEvents = await sql`SELECT id FROM events WHERE organization_id IS NULL`;
  if (unscopedEvents.length > 0) {
    const legacyOrgId = crypto.randomUUID();
    await sql`
      INSERT INTO organizations (id, name, owner_user_id, created_at)
      VALUES (${legacyOrgId}, 'Legacy Organization', NULL, NOW())
    `;
    await sql`UPDATE events SET organization_id = ${legacyOrgId} WHERE organization_id IS NULL`;
    console.log(`Backfilled ${unscopedEvents.length} event(s) into Legacy Organization`);
  }

  try {
    await sql`ALTER TABLE events ALTER COLUMN organization_id SET NOT NULL`;
    console.log('events.organization_id set NOT NULL');
  } catch (e) {
    console.warn('Could not set events.organization_id NOT NULL:', e?.message ?? e);
  }

  try {
    await sql`
      ALTER TABLE events
      ADD CONSTRAINT events_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    `;
  } catch (e) {
    if (!(e?.code === '42710' || String(e?.message ?? '').includes('already exists'))) throw e;
  }

  // App invariant: one event per organization. Legacy backfill can put many events on one org.
  const duplicateOrgs = await sql`
    SELECT organization_id
    FROM events
    WHERE organization_id IS NOT NULL
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  `;
  for (const row of duplicateOrgs) {
    const organizationId = row.organization_id;
    const eventsForOrg = await sql`
      SELECT id, name FROM events
      WHERE organization_id = ${organizationId}
      ORDER BY created_at ASC NULLS LAST, name ASC
    `;
    for (let i = 1; i < eventsForOrg.length; i++) {
      const ev = eventsForOrg[i];
      const newOrgId = crypto.randomUUID();
      const orgName = `${ev.name || 'Event'} — organization`;
      await sql`
        INSERT INTO organizations (id, name, owner_user_id, created_at)
        VALUES (${newOrgId}, ${orgName}, NULL, NOW())
      `;
      await sql`UPDATE events SET organization_id = ${newOrgId} WHERE id = ${ev.id}`;
      console.log(
        `Split event ${ev.id} into new organization ${newOrgId} (removed duplicate of ${organizationId})`
      );
    }
  }

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_one_per_org ON events(organization_id)`;
  console.log('event ownership constraints ready');

  console.log('Migration done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
