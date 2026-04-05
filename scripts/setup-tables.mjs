/**
 * One-time setup: creates attendees table, indexes, optional sample data.
 * Loads DATABASE_URL from .env at project root. Idempotent.
 */
import { createSql } from './lib/migration-helpers.mjs';

const sql = createSql();

async function run(statement) {
  return sql.query(statement, []);
}

async function main() {
  await run('DROP TABLE IF EXISTS attendees CASCADE');
  console.log('Dropped attendees (if existed)');

  await run(`
    CREATE TABLE attendees (
      id VARCHAR(36) PRIMARY KEY,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      company VARCHAR(255),
      dietary_restrictions TEXT,
      checked_in BOOLEAN DEFAULT FALSE,
      checked_in_at TIMESTAMPTZ,
      rsvp_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      qr_token TEXT,
      qr_expires_at TIMESTAMPTZ,
      qr_used_at TIMESTAMPTZ,
      qr_used_by_device VARCHAR(255)
    )
  `);
  console.log('Created table attendees (no global UNIQUE on email; use migrate-events for event_id + UNIQUE(event_id, email))');

  await run('CREATE INDEX idx_attendees_email ON attendees(email)');
  await run('CREATE INDEX idx_attendees_checked_in ON attendees(checked_in)');
  await run('CREATE INDEX idx_attendees_rsvp_at ON attendees(rsvp_at)');
  console.log('Created indexes');

  const { randomUUID } = await import('crypto');
  await run(`
    INSERT INTO attendees (id, first_name, last_name, email, phone, company, dietary_restrictions, checked_in, rsvp_at) VALUES
    ('${randomUUID()}', 'John', 'Doe', 'john.doe@example.com', '+1 555-0123', 'Tech Corp', 'Vegetarian', false, NOW() - INTERVAL '2 days'),
    ('${randomUUID()}', 'Jane', 'Smith', 'jane.smith@example.com', '+1 555-0124', 'Design Studio', '', true, NOW() - INTERVAL '1 day')
  `);
  console.log('Inserted sample data (skipped if already present)');

  console.log('Done. Tables are ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
