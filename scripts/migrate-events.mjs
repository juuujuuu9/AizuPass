/**
 * Migration: add events table, extend attendees with event_id and microsite fields.
 * Creates default event and backfills all existing attendees to it.
 * Safe to run multiple times (creates table/columns if missing, skips backfill if already set).
 *
 * Usage:
 *   node scripts/migrate-events.mjs --dry-run   # preview only
 *   node scripts/migrate-events.mjs             # apply
 */
import { createSql } from './lib/migration-helpers.mjs';
import crypto from 'crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const sql = createSql();

const DEFAULT_EVENT_SLUG = process.env.DEFAULT_EVENT_SLUG || 'default';
const DEFAULT_EVENT_NAME = 'Demo Event';

async function main() {
  if (DRY_RUN) {
    console.log('[DRY RUN] No changes will be written.\n');
  }

  if (!DRY_RUN) {
    // 1. Create events table
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        microsite_url TEXT,
        settings JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('Events table ready');

    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id UUID`;
    console.log('events.organization_id column ready (if missing)');

    // 2. Add columns to attendees (idempotent where supported)
    await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS event_id UUID`;
    await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS microsite_entry_id TEXT`;
    await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS source_data JSONB`;
    await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS created_at TIMESTAMP`;
    console.log('Attendees columns ready');
  }

  // 3. Resolve default event id (for backfill count and dry-run message)
  let defaultEventId;
  try {
    const existing = await sql`SELECT id FROM events WHERE slug = ${DEFAULT_EVENT_SLUG}`;
    if (existing.length > 0) {
      defaultEventId = existing[0].id;
      if (!DRY_RUN) console.log(`Default event already exists: ${defaultEventId}`);
    } else {
      defaultEventId = crypto.randomUUID();
      if (DRY_RUN) {
        console.log(`Would create Demo Organization + default event: ${defaultEventId} (${DEFAULT_EVENT_NAME}, slug=${DEFAULT_EVENT_SLUG})`);
      } else {
        // After migrate-organizations, events.organization_id is NOT NULL (one event per org).
        await sql`
          CREATE TABLE IF NOT EXISTS organizations (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            owner_user_id TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
        const defaultOrgId = crypto.randomUUID();
        await sql`
          INSERT INTO organizations (id, name, owner_user_id, created_at)
          VALUES (${defaultOrgId}, 'Demo Organization', NULL, NOW())
        `;
        await sql`
          INSERT INTO events (id, organization_id, name, slug, created_at)
          VALUES (${defaultEventId}, ${defaultOrgId}, ${DEFAULT_EVENT_NAME}, ${DEFAULT_EVENT_SLUG}, NOW())
        `;
        console.log(`Created default org ${defaultOrgId} and event ${defaultEventId}`);
      }
    }
  } catch (e) {
    if (DRY_RUN && (e.code === '42P01' || e.message?.includes('does not exist'))) {
      defaultEventId = crypto.randomUUID();
      console.log(`Would create default event: ${defaultEventId} (${DEFAULT_EVENT_NAME}, slug=${DEFAULT_EVENT_SLUG})`);
    } else throw e;
  }

  // 4. Backfill attendees without event_id
  let toUpdate = [];
  try {
    toUpdate = await sql`SELECT id FROM attendees WHERE event_id IS NULL`;
  } catch (e) {
    if (DRY_RUN && (e.code === '42703' || e.message?.includes('event_id'))) {
      console.log('Would update 0 attendees (event_id column may not exist yet)');
    } else throw e;
  }
  const attendeeCount = toUpdate.length;

  if (attendeeCount > 0) {
    if (DRY_RUN) {
      console.log(`Would update ${attendeeCount} attendees with event_id = ${defaultEventId ?? '(new default)'}`);
    } else {
      await sql`
        UPDATE attendees
        SET event_id = ${defaultEventId},
            created_at = COALESCE(created_at, rsvp_at)
        WHERE event_id IS NULL
      `;
      console.log(`Backfilled ${attendeeCount} attendee(s) to default event`);
    }
  } else if (!DRY_RUN) {
    console.log('No attendees to backfill');
  }

  if (!DRY_RUN) {
    // 5. Set event_id NOT NULL (after backfill)
    try {
      await sql`ALTER TABLE attendees ALTER COLUMN event_id SET NOT NULL`;
      console.log('Set event_id NOT NULL');
    } catch (e) {
      if (e.code === '23502' || e.message?.includes('violates not-null')) {
        console.warn('Skipping SET NOT NULL: some rows still have null event_id');
      } else throw e;
    }

    // 6. Add FK if not present
    try {
      await sql`ALTER TABLE attendees ADD CONSTRAINT fk_attendees_event FOREIGN KEY (event_id) REFERENCES events(id)`;
      console.log('Added FK attendees.event_id -> events.id');
    } catch (e) {
      if (e.code === '42710' || e.message?.includes('already exists')) {
        console.log('FK already exists');
      } else throw e;
    }

    // 6b. Allow same email across events: drop global UNIQUE(email), add UNIQUE(event_id, email)
    try {
      await sql`ALTER TABLE attendees DROP CONSTRAINT IF EXISTS attendees_email_key`;
      console.log('Dropped UNIQUE(email) if present');
    } catch (e) {
      if (e.code === '42703' || e.message?.includes('constraint')) {
        console.log('No attendees_email_key constraint to drop');
      } else throw e;
    }
    try {
      await sql`ALTER TABLE attendees DROP CONSTRAINT IF EXISTS attendees_email_unique`;
      console.log('Dropped attendees_email_unique if present');
    } catch (e) {
      if (e.code === '42703' || e.message?.includes('constraint')) {
        console.log('No attendees_email_unique constraint to drop');
      } else throw e;
    }
    try {
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_attendees_event_email ON attendees(event_id, email)`;
      console.log('Unique index event_id+email ready');
    } catch (e) {
      if (e.code === '42710' || e.message?.includes('already exists')) {
        console.log('idx_attendees_event_email already exists');
      } else throw e;
    }

    // 7. Create indexes
    const indexes = [
      ['idx_attendees_event_id', sql`CREATE INDEX IF NOT EXISTS idx_attendees_event_id ON attendees(event_id)`],
      ['idx_attendees_event_qr', sql`CREATE INDEX IF NOT EXISTS idx_attendees_event_qr ON attendees(event_id, qr_token, qr_expires_at)`],
      ['idx_attendees_microsite_lookup', sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_attendees_microsite_lookup ON attendees(event_id, microsite_entry_id) WHERE microsite_entry_id IS NOT NULL`],
      ['idx_attendees_event_list', sql`CREATE INDEX IF NOT EXISTS idx_attendees_event_list ON attendees(event_id, created_at DESC NULLS LAST, checked_in) INCLUDE (first_name, last_name, email)`],
    ];

    for (const [name, stmt] of indexes) {
      try {
        await stmt;
        console.log(`Index ready: ${name}`);
      } catch (e) {
        if (name === 'idx_attendees_event_list' && (e.message?.includes('INCLUDE') || e.message?.includes('syntax'))) {
          await sql`CREATE INDEX IF NOT EXISTS idx_attendees_event_list ON attendees(event_id, created_at DESC NULLS LAST, checked_in, first_name, last_name, email)`;
          console.log('Index ready: idx_attendees_event_list (fallback without INCLUDE)');
        } else throw e;
      }
    }
  } else {
    console.log('Would drop UNIQUE(email) if present; would create idx_attendees_event_email');
    console.log('Would create index: idx_attendees_event_id');
    console.log('Would create index: idx_attendees_event_qr');
    console.log('Would create index: idx_attendees_microsite_lookup');
    console.log('Would create index: idx_attendees_event_list');
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
