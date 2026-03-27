import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

async function run() {
  const sql = neon(DATABASE_URL);

  try {
    await sql`CREATE TABLE IF NOT EXISTS email_events (
      id SERIAL PRIMARY KEY, email TEXT NOT NULL,
      event_type TEXT NOT NULL, metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`;

    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_bounce_check
      ON email_events(email, event_type, created_at)
      WHERE event_type IN ('bounced', 'complained')`;

    await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS email_bounced BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS email_bounce_reason TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS idx_attendees_email_bounced ON attendees(email) WHERE email_bounced = true`;

    console.log('✅ Email bounce tracking migration complete');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
