/**
 * Database access layer. Organizations / invitations / memberships live in `./db/organizations.ts`.
 * See docs/DB-MODULE-LAYOUT.md.
 */
import { getEnv } from './env';
import { getDb, type SqlRow } from './db/client';
import { rowToEvent, type EventRow } from './db/event-row';
import { getOrganizationByOwnerUserId, getEventForOrganization } from './db/organizations';

export * from './db/organizations';
export type { EventRow } from './db/event-row';

const DEFAULT_EVENT_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
let defaultEventIdCache: { id: string; expiresAt: number } | null = null;

/** One row per Clerk user; display name for the account (all orgs). */
export interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Set when organizer welcome email (Clerk user.created → POST /api/clerk/welcome) was sent successfully. */
  organizerWelcomeSentAt?: string | null;
}

function rowToUser(row: Record<string, unknown>): UserRow {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
    organizerWelcomeSentAt: (row.organizer_welcome_sent_at as string | null) ?? null,
  };
}

/** Ensure a row exists for this Clerk user (email updated when non-empty). */
export async function ensureUserRow(userId: string, email: string | null): Promise<void> {
  if (!userId) return;
  const db = getDb();
  const em = email?.trim() ?? '';
  await db`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${userId}, ${em}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email),
      updated_at = NOW()
  `;
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  if (!userId) return null;
  const db = getDb();
  const rows = await db`SELECT * FROM users WHERE id = ${userId} LIMIT 1`;
  return rows.length ? rowToUser(rows[0] as Record<string, unknown>) : null;
}

export async function wasOrganizerWelcomeEmailSent(userId: string): Promise<boolean> {
  if (!userId) return false;
  const db = getDb();
  const rows = await db`
    SELECT organizer_welcome_sent_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;
  if (!rows.length) return false;
  const row = rows[0] as Record<string, unknown>;
  return row.organizer_welcome_sent_at != null;
}

export async function recordOrganizerWelcomeEmailSent(userId: string): Promise<void> {
  if (!userId) return;
  const db = getDb();
  await db`
    UPDATE users
    SET organizer_welcome_sent_at = NOW(), updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function isUserProfileComplete(userId: string): Promise<boolean> {
  const u = await getUserById(userId);
  if (!u) return false;
  return Boolean(String(u.firstName ?? '').trim() && String(u.lastName ?? '').trim());
}

export async function updateUserProfile(
  userId: string,
  data: { firstName: string; lastName: string; email?: string | null }
): Promise<void> {
  if (!userId) return;
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  if (!firstName || !lastName) throw new Error('First and last name are required');
  await ensureUserRow(userId, data.email ?? null);
  const db = getDb();
  await db`
    UPDATE users
    SET first_name = ${firstName},
        last_name = ${lastName},
        updated_at = NOW()
    WHERE id = ${userId}
  `;
}

function rowToAttendee(row: SqlRow) {
  return {
    id: row.id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
    phone: row.phone as string | null,
    company: row.company as string | null,
    dietaryRestrictions: row.dietary_restrictions as string | null,
    checkedIn: row.checked_in as boolean,
    checkedInAt: row.checked_in_at as string | null,
    rsvpAt: row.rsvp_at as string,
    qrExpiresAt: row.qr_expires_at as string | null,
    qrUsedAt: row.qr_used_at as string | null,
    qrUsedByDevice: row.qr_used_by_device as string | null,
    eventId: row.event_id as string | null,
    micrositeEntryId: row.microsite_entry_id as string | null,
    sourceData: row.source_data,
    createdAt: row.created_at as string,
  };
}

export async function canUserAccessEvent(userId: string, eventId: string): Promise<boolean> {
  if (!userId || !eventId) return false;
  const db = getDb();
  const rows = await db`
    SELECT 1
    FROM events e
    INNER JOIN organization_memberships m
      ON m.organization_id = e.organization_id
    WHERE e.id = ${eventId} AND m.user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function canUserManageEvent(userId: string, eventId: string): Promise<boolean> {
  if (!userId || !eventId) return false;
  const db = getDb();
  const rows = await db`
    SELECT 1
    FROM events e
    INNER JOIN organization_memberships m
      ON m.organization_id = e.organization_id
    WHERE e.id = ${eventId}
      AND m.user_id = ${userId}
      AND m.role = 'organizer'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function getUserAccessSummary(userId: string): Promise<{
  hasMembership: boolean;
  hasOrganizerRole: boolean;
  organizationCount: number;
  eventCount: number;
}> {
  if (!userId) {
    return { hasMembership: false, hasOrganizerRole: false, organizationCount: 0, eventCount: 0 };
  }
  const db = getDb();
  const rows = await db`
    SELECT
      COUNT(DISTINCT m.organization_id) AS organization_count,
      COUNT(DISTINCT e.id) AS event_count,
      SUM(CASE WHEN m.role = 'organizer' THEN 1 ELSE 0 END) AS organizer_rows
    FROM organization_memberships m
    LEFT JOIN events e ON e.organization_id = m.organization_id
    WHERE m.user_id = ${userId}
  `;
  const row = (rows[0] ?? {}) as Record<string, unknown>;
  const organizationCount = Number(row.organization_count ?? 0);
  const eventCount = Number(row.event_count ?? 0);
  const organizerRows = Number(row.organizer_rows ?? 0);
  return {
    hasMembership: organizationCount > 0,
    hasOrganizerRole: organizerRows > 0,
    organizationCount,
    eventCount,
  };
}

export async function getEventById(id: string): Promise<EventRow | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM events WHERE id = ${id}`;
  return rows.length ? rowToEvent(rows[0] as Record<string, unknown>) : null;
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM events WHERE slug = ${slug}`;
  return rows.length ? rowToEvent(rows[0] as Record<string, unknown>) : null;
}

export async function getEventByIdForUser(
  id: string,
  userId: string
): Promise<EventRow | null> {
  if (!id || !userId) return null;
  const db = getDb();
  const rows = await db`
    SELECT e.*
    FROM events e
    INNER JOIN organization_memberships m
      ON m.organization_id = e.organization_id
    WHERE e.id = ${id} AND m.user_id = ${userId}
    LIMIT 1
  `;
  return rows.length ? rowToEvent(rows[0] as Record<string, unknown>) : null;
}

export async function getAllEventsForUser(userId: string): Promise<EventRow[]> {
  if (!userId) return [];
  const db = getDb();
  const rows = await db`
    SELECT DISTINCT e.*
    FROM events e
    INNER JOIN organization_memberships m
      ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
    ORDER BY e.created_at DESC
  `;
  return rows.map((row) => rowToEvent(row as Record<string, unknown>));
}

export async function getDefaultEventId(): Promise<string> {
  const now = Date.now();
  if (defaultEventIdCache && defaultEventIdCache.expiresAt > now) {
    return defaultEventIdCache.id;
  }
  const slug = getEnv('DEFAULT_EVENT_SLUG') || 'default';
  const event = await getEventBySlug(slug);
  if (!event) throw new Error('Default event not found. Run npm run migrate-events.');
  defaultEventIdCache = { id: event.id, expiresAt: now + DEFAULT_EVENT_CACHE_TTL_MS };
  return event.id;
}

export async function getAllAttendeesForUser(userId: string, eventId?: string) {
  if (!userId) return [];
  const db = getDb();
  if (eventId) {
    const rows = await db`
      SELECT a.*
      FROM attendees a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
      WHERE a.event_id = ${eventId} AND m.user_id = ${userId}
      ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
    `;
    return rows.map((row) => rowToAttendee(row as Record<string, unknown>));
  }
  const rows = await db`
    SELECT a.*
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
    ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
  `;
  return rows.map((row) => rowToAttendee(row as Record<string, unknown>));
}

/** Minimal attendee data including qr_token for offline cache. Staff-only. */
export type OfflineCacheAttendee = {
  id: string;
  eventId: string;
  qrToken: string | null;
  qrExpiresAt: string | null;
  checkedIn: boolean;
  firstName: string;
  lastName: string;
  email: string;
  eventName?: string;
};

function rowToOffline(row: Record<string, unknown>): OfflineCacheAttendee {
  return {
    id: row.id as string,
    eventId: (row.event_id ?? '') as string,
    qrToken: (row.qr_token ?? null) as string | null,
    qrExpiresAt: (row.qr_expires_at ?? null) as string | null,
    checkedIn: Boolean(row.checked_in),
    firstName: (row.first_name ?? '') as string,
    lastName: (row.last_name ?? '') as string,
    email: (row.email ?? '') as string,
    eventName: row.event_name as string | undefined,
  };
}

export async function getAttendeesForOfflineCacheForUser(
  userId: string,
  eventId?: string
): Promise<OfflineCacheAttendee[]> {
  if (!userId) return [];
  const db = getDb();
  if (eventId) {
    const rows = await db`
      SELECT a.id, a.event_id, a.qr_token, a.qr_expires_at, a.checked_in,
             a.first_name, a.last_name, a.email, e.name as event_name
      FROM attendees a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
      WHERE a.event_id = ${eventId} AND m.user_id = ${userId}
      ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
    `;
    return rows.map((row) => rowToOffline(row as Record<string, unknown>));
  }
  const rows = await db`
    SELECT a.id, a.event_id, a.qr_token, a.qr_expires_at, a.checked_in,
           a.first_name, a.last_name, a.email, e.name as event_name
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
    ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
  `;
  return rows.map((row) => rowToOffline(row as Record<string, unknown>));
}

export async function searchAttendeesForUser(userId: string, eventId?: string, q?: string) {
  if (!q?.trim()) return getAllAttendeesForUser(userId, eventId);
  const db = getDb();
  const pattern = `%${String(q).trim().slice(0, 200)}%`;
  const rowToAttendeeWithEvent = (row: Record<string, unknown>) => ({
    ...rowToAttendee(row),
    eventName: row.event_name as string | undefined,
  });
  if (eventId) {
    const rows = await db`
      SELECT a.*, e.name as event_name
      FROM attendees a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
      WHERE a.event_id = ${eventId}
        AND m.user_id = ${userId}
        AND (a.first_name ILIKE ${pattern} OR a.last_name ILIKE ${pattern} OR a.email ILIKE ${pattern})
      ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
    `;
    return rows.map((row) => rowToAttendeeWithEvent(row as Record<string, unknown>));
  }
  const rows = await db`
    SELECT a.*, e.name as event_name
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
      AND (a.first_name ILIKE ${pattern} OR a.last_name ILIKE ${pattern} OR a.email ILIKE ${pattern})
    ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
  `;
  return rows.map((row) => rowToAttendeeWithEvent(row as Record<string, unknown>));
}

export async function getAttendeeById(id: string) {
  const db = getDb();
  const rows = await db`SELECT * FROM attendees WHERE id = ${id}`;
  return rows.length ? rowToAttendee(rows[0] as Record<string, unknown>) : null;
}

export async function getAttendeeByIdForUser(id: string, userId: string) {
  if (!id || !userId) return null;
  const db = getDb();
  const rows = await db`
    SELECT a.*
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE a.id = ${id} AND m.user_id = ${userId}
    LIMIT 1
  `;
  return rows.length ? rowToAttendee(rows[0] as Record<string, unknown>) : null;
}

export async function createAttendee(
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    company?: string;
    dietaryRestrictions?: string;
    eventId?: string;
    micrositeEntryId?: string;
    sourceData?: Record<string, unknown>;
  }
) {
  const db = getDb();
  const id = crypto.randomUUID();
  const eventId = data.eventId ?? (await getDefaultEventId());
  const sourceDataJson = data.sourceData != null ? JSON.stringify(data.sourceData) : null;
  const rows = await db`
    INSERT INTO attendees (id, event_id, first_name, last_name, email, phone, company, dietary_restrictions, checked_in, rsvp_at, created_at, microsite_entry_id, source_data)
    VALUES (${id}, ${eventId}, ${data.firstName}, ${data.lastName}, ${data.email}, ${data.phone ?? ''}, ${data.company ?? ''}, ${data.dietaryRestrictions ?? ''}, false, NOW(), NOW(), ${data.micrositeEntryId ?? null}, ${sourceDataJson})
    RETURNING *
  `;
  return rowToAttendee(rows[0] as Record<string, unknown>);
}

/** Atomic manual check-in that only succeeds if attendee is not already checked in. */
export async function checkInAttendeeIfNotCheckedIn(id: string) {
  const db = getDb();
  const rows = await db`
    UPDATE attendees
    SET checked_in = true, checked_in_at = NOW()
    WHERE id = ${id} AND checked_in = false
    RETURNING *
  `;
  return rows.length ? rowToAttendee(rows[0] as Record<string, unknown>) : null;
}

/** Event-scoped lookup for check-in (v2 QR format). */
export async function findAttendeeByEventAndToken(
  eventId: string,
  entryId: string,
  token: string
) {
  const db = getDb();
  const rows = await db`
    SELECT * FROM attendees
    WHERE event_id = ${eventId}
      AND id = ${entryId}
      AND qr_token = ${token}
      AND qr_expires_at > NOW()
      AND qr_used_at IS NULL
  `;
  return rows.length ? rowToAttendee(rows[0] as Record<string, unknown>) : null;
}

/** Event-scoped atomic check-in (v2 QR format). */
export async function checkInAttendeeWithTokenScoped(
  eventId: string,
  entryId: string,
  token: string,
  scannerDeviceId: string | null
) {
  const db = getDb();
  const rows = await db`
    UPDATE attendees
    SET qr_used_at = NOW(),
        qr_used_by_device = ${scannerDeviceId},
        qr_token = NULL,
        qr_expires_at = NULL,
        checked_in = true,
        checked_in_at = NOW()
    WHERE event_id = ${eventId}
      AND id = ${entryId}
      AND qr_token = ${token}
      AND qr_expires_at > NOW()
      AND qr_used_at IS NULL
    RETURNING *
  `;
  if (!rows.length) throw new Error('Attendee not found');
  return rowToAttendee(rows[0] as Record<string, unknown>);
}

export async function deleteAttendee(id: string) {
  const db = getDb();
  const rows = await db`DELETE FROM attendees WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** Set qr_token and qr_expires_at for an attendee. Always updates by id so token is persisted. */
export async function updateAttendeeQRToken(
  id: string,
  token: string,
  expiresAt: Date,
) {
  const db = getDb();
  await db`
    UPDATE attendees
    SET qr_token = ${token}, qr_expires_at = ${expiresAt}
    WHERE id = ${id}
  `;
}

export async function findAttendeeByEventAndMicrositeId(
  eventId: string,
  micrositeEntryId: string
) {
  const db = getDb();
  const rows = await db`
    SELECT id, qr_token, qr_expires_at FROM attendees
    WHERE event_id = ${eventId} AND microsite_entry_id = ${micrositeEntryId}
  `;
  return rows.length ? (rows[0] as { id: string; qr_token: string | null; qr_expires_at: string | null }) : null;
}

/** For CSV import deduplication: skip if this event already has an attendee with this email. */
export async function findAttendeeByEventAndEmail(
  eventId: string,
  email: string
): Promise<{ id: string } | null> {
  const db = getDb();
  const rows = await db`
    SELECT id FROM attendees
    WHERE event_id = ${eventId} AND LOWER(TRIM(email)) = LOWER(TRIM(${email}))
  `;
  return rows.length ? (rows[0] as { id: string }) : null;
}

/** Batch event+email lookup for CSV imports. */
export async function findAttendeesByEventAndEmails(
  eventId: string,
  emails: string[]
): Promise<Array<{ id: string; email: string }>> {
  const normalized = Array.from(
    new Set(
      emails
        .map((email) => String(email ?? '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (normalized.length === 0) return [];

  const db = getDb();
  const rows = await db`
    SELECT id, email
    FROM attendees
    WHERE event_id = ${eventId}
      AND LOWER(TRIM(email)) = ANY(${normalized}::text[])
  `;
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    email: String(row.email ?? ''),
  }));
}

/** Update attendee profile fields for CSV merge mode. */
export async function updateAttendeeProfile(
  id: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    company?: string;
    dietaryRestrictions?: string;
    sourceData?: Record<string, unknown>;
  }
) {
  const db = getDb();
  const sourceDataJson = data.sourceData != null ? JSON.stringify(data.sourceData) : null;
  const rows = await db`
    UPDATE attendees
    SET first_name = ${data.firstName},
        last_name = ${data.lastName},
        email = ${data.email},
        phone = ${data.phone ?? ''},
        company = ${data.company ?? ''},
        dietary_restrictions = ${data.dietaryRestrictions ?? ''},
        source_data = ${sourceDataJson}
    WHERE id = ${id}
    RETURNING *
  `;
  if (!rows.length) throw new Error('Attendee not found');
  return rowToAttendee(rows[0] as Record<string, unknown>);
}

/** Remove all attendees for an event (CSV replace mode). */
export async function deleteAttendeesByEventId(eventId: string): Promise<number> {
  const db = getDb();
  const rows = await db`
    DELETE FROM attendees
    WHERE event_id = ${eventId}
    RETURNING id
  `;
  return rows.length;
}

export async function createEventForUser(userId: string, data: {
  name: string;
  slug: string;
  micrositeUrl?: string;
  settings?: Record<string, unknown>;
}) {
  if (!userId) throw new Error('Authentication required');
  const organization = await getOrganizationByOwnerUserId(userId);
  if (!organization) {
    throw new Error('Organization required before creating an event');
  }
  const existingEvent = await getEventForOrganization(organization.id);
  if (existingEvent) {
    throw new Error('Organization already has an event');
  }
  const db = getDb();
  const id = crypto.randomUUID();
  const settingsJson = data.settings != null ? JSON.stringify(data.settings) : null;
  await db`
    INSERT INTO events (id, organization_id, name, slug, microsite_url, settings, created_at)
    VALUES (${id}, ${organization.id}, ${data.name}, ${data.slug}, ${data.micrositeUrl ?? null}, ${settingsJson}, NOW())
  `;
  return { id, organizationId: organization.id, ...data };
}

/** Get staff user's last selected event ID. Returns null if none stored. */
export async function getStaffLastEventId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const db = getDb();
  const rows = await db`
    SELECT last_selected_event_id FROM staff_preferences WHERE user_id = ${userId}
  `;
  return rows.length && rows[0].last_selected_event_id
    ? String(rows[0].last_selected_event_id)
    : null;
}

/** Update staff user's last selected event. */
export async function updateStaffLastEventId(
  userId: string,
  eventId: string | null
): Promise<void> {
  if (!userId) return;
  const db = getDb();
  if (eventId) {
    await db`
      INSERT INTO staff_preferences (user_id, last_selected_event_id)
      VALUES (${userId}, ${eventId})
      ON CONFLICT (user_id) DO UPDATE SET last_selected_event_id = ${eventId}
    `;
  } else {
    await db`
      UPDATE staff_preferences SET last_selected_event_id = NULL WHERE user_id = ${userId}
    `;
  }
}

/** Delete an event and all its attendees. */
export async function deleteEventForUser(id: string, userId: string): Promise<boolean> {
  const canManage = await canUserManageEvent(userId, id);
  if (!canManage) return false;
  const db = getDb();
  await db`DELETE FROM attendees WHERE event_id = ${id}`;
  const rows = await db`DELETE FROM events WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
