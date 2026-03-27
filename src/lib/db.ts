/**
 * Database access layer. Organizations / invitations / memberships live in `./db/organizations.ts`.
 * See docs/DB-MODULE-LAYOUT.md.
 *
 * CR-4: Transaction Support Note —
 * The current Neon HTTP driver (`@neondatabase/serverless`) does not support multi-statement transactions.
 * Operations that require atomicity (e.g., createOrganizationForOwner, acceptOrganizationInvitation,
 * deleteEventForUser) run as separate queries. This can leave orphaned data on partial failures.
 *
 * Future fix: Use Neon's `transaction()` API (WebSocket/pool mode) or add compensating cleanup logic.
 * See: https://neon.tech/docs/serverless/transaction-support
 *
 * LO-6: QR Token Storage — Accepted Risk
 * QR tokens are stored in plaintext (qr_token column) rather than hashed. This is an intentional
 * design choice because:
 * 1. Tokens are short-lived (24h default expiration via TOKEN_TTL_MS)
 * 2. Tokens are single-use (qr_used_at is set on first scan, token is cleared after use)
 * 3. QR codes must be scannable offline, requiring token availability in the cache
 * 4. Hashing would require additional complexity for offline validation and QR payload generation
 *
 * Defense-in-depth: Tokens are 128-bit cryptographically random values generated via generateQRToken().
 * Database access is restricted via RLS (Row Level Security) and org-scoped queries.
 */
import { getEnv } from './env';
import { getDb, type SqlRow } from './db/client';
import { rowToEvent, type EventRow } from './db/event-row';
import { getOrganizationByOwnerUserId, getEventForOrganization } from './db/organizations';
import type { Attendee } from '../types/attendee';

export * from './db/organizations';
export type { EventRow } from './db/event-row';
export { sanitizeEventSettings } from './db/event-row';
export { getDb } from './db/client';

const DEFAULT_EVENT_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
let defaultEventIdCache: { id: string; expiresAt: number } | null = null;

// LO-5: Simple in-memory cache for user access summary to reduce DB load
const USER_ACCESS_CACHE_TTL_MS = 5_000; // 5 seconds
const userAccessCache = new Map<string, { data: { hasMembership: boolean; hasOrganizerRole: boolean; organizationCount: number; eventCount: number }; expiresAt: number }>();

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

function rowToAttendee(row: SqlRow): Attendee {
  return {
    id: row.id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
    phone: (row.phone as string | null) ?? undefined,
    company: (row.company as string | null) ?? undefined,
    dietaryRestrictions: (row.dietary_restrictions as string | null) ?? undefined,
    checkedIn: row.checked_in as boolean,
    checkedInAt: (row.checked_in_at as string | null) ?? undefined,
    rsvpAt: row.rsvp_at as string,
    qrExpiresAt: (row.qr_expires_at as string | null) ?? undefined,
    qrUsedAt: (row.qr_used_at as string | null) ?? undefined,
    qrUsedByDevice: (row.qr_used_by_device as string | null) ?? undefined,
    eventId: (row.event_id as string | null) ?? undefined,
    micrositeEntryId: (row.microsite_entry_id as string | null) ?? undefined,
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

  // LO-5: Check cache first
  const cached = userAccessCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
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
  const result = {
    hasMembership: organizationCount > 0,
    hasOrganizerRole: organizerRows > 0,
    organizationCount,
    eventCount,
  };

  // LO-5: Store in cache
  userAccessCache.set(userId, { data: result, expiresAt: Date.now() + USER_ACCESS_CACHE_TTL_MS });
  return result;
}

/**
 * Organizer welcome email is for solo signups creating an org. Skip for staff and for anyone
 * mid–staff-invite flow (pending invitation on their email).
 */
export async function shouldSuppressOrganizerWelcomeEmail(
  userId: string,
  email: string
): Promise<boolean> {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!userId || !normalized) return false;

  const summary = await getUserAccessSummary(userId);
  if (summary.hasMembership && !summary.hasOrganizerRole) {
    return true;
  }

  const db = getDb();
  const pending = await db`
    SELECT 1
    FROM organization_invitations
    WHERE lower(trim(email)) = ${normalized}
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1
  `;
  return pending.length > 0;
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

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

function normalizePagination(options?: PaginationOptions): { limit: number; offset: number } {
  const limit = Math.min(
    Math.max(1, options?.limit ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );
  const offset = Math.max(0, options?.offset ?? 0);
  return { limit, offset };
}

export async function getAllEventsForUser(
  userId: string,
  options?: PaginationOptions
): Promise<PaginatedResult<EventRow>> {
  if (!userId) return { data: [], pagination: { total: 0, limit: DEFAULT_PAGE_SIZE, offset: 0, hasMore: false } };
  const db = getDb();
  const { limit, offset } = normalizePagination(options);

  // Get total count
  const countResult = await db`
    SELECT COUNT(DISTINCT e.id) as count
    FROM events e
    INNER JOIN organization_memberships m
      ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
  `;
  const total = Number((countResult[0] as { count: string }).count) || 0;

  // Get paginated results
  const rows = await db`
    SELECT DISTINCT e.*
    FROM events e
    INNER JOIN organization_memberships m
      ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
    ORDER BY e.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    data: rows.map((row) => rowToEvent(row as Record<string, unknown>)),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    },
  };
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

export type AttendeeListOpts = { limit?: number; offset?: number };

export interface PaginatedAttendees {
  data: Attendee[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export async function getAllAttendeesForUser(
  userId: string,
  eventId?: string,
  opts?: AttendeeListOpts
): Promise<PaginatedAttendees> {
  if (!userId) return { data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } };
  const db = getDb();
  const limit = Math.min(Math.max(opts?.limit ?? 20, 0), 100);
  const offset = opts?.offset ?? 0;

  if (eventId) {
    const countRows = await db`
      SELECT count(*)::int AS count
      FROM attendees a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
      WHERE a.event_id = ${eventId} AND m.user_id = ${userId}
    `;
    const total = Number((countRows[0] as Record<string, unknown>).count) || 0;
    const rows = limit > 0
      ? await db`
      SELECT a.*
      FROM attendees a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
      WHERE a.event_id = ${eventId} AND m.user_id = ${userId}
      ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
      : [];
    const data = rows.map((row) => rowToAttendee(row as Record<string, unknown>));
    return { data, pagination: { total, limit, offset, hasMore: offset + data.length < total } };
  }

  const countRows = await db`
    SELECT count(*)::int AS count
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
  `;
  const total = Number((countRows[0] as Record<string, unknown>).count) || 0;
  const rows = limit > 0
    ? await db`
    SELECT a.*
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
    ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
    : [];
  const data = rows.map((row) => rowToAttendee(row as Record<string, unknown>));
  return { data, pagination: { total, limit, offset, hasMore: offset + data.length < total } };
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

export async function searchAttendeesForUser(
  userId: string,
  eventId?: string,
  q?: string,
  opts?: AttendeeListOpts
): Promise<PaginatedAttendees> {
  if (!q?.trim()) return getAllAttendeesForUser(userId, eventId, opts);
  const db = getDb();
  const pattern = `%${String(q).trim().slice(0, 200)}%`;
  const limit = Math.min(Math.max(opts?.limit ?? 20, 0), 100);
  const offset = opts?.offset ?? 0;
  const rowToAttendeeWithEvent = (row: Record<string, unknown>) => ({
    ...rowToAttendee(row),
    eventName: row.event_name as string | undefined,
  });

  if (eventId) {
    const countRows = await db`
      SELECT count(*)::int AS count
      FROM attendees a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
      WHERE a.event_id = ${eventId}
        AND m.user_id = ${userId}
        AND (a.first_name ILIKE ${pattern} OR a.last_name ILIKE ${pattern} OR a.email ILIKE ${pattern})
    `;
    const total = Number((countRows[0] as Record<string, unknown>).count) || 0;
    const rows = limit > 0
      ? await db`
      SELECT a.*, e.name as event_name
      FROM attendees a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
      WHERE a.event_id = ${eventId}
        AND m.user_id = ${userId}
        AND (a.first_name ILIKE ${pattern} OR a.last_name ILIKE ${pattern} OR a.email ILIKE ${pattern})
      ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
      : [];
    const data = rows.map((row) => rowToAttendeeWithEvent(row as Record<string, unknown>));
    return { data, pagination: { total, limit, offset, hasMore: offset + data.length < total } };
  }

  const countRows = await db`
    SELECT count(*)::int AS count
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
      AND (a.first_name ILIKE ${pattern} OR a.last_name ILIKE ${pattern} OR a.email ILIKE ${pattern})
  `;
  const total = Number((countRows[0] as Record<string, unknown>).count) || 0;
  const rows = limit > 0
    ? await db`
    SELECT a.*, e.name as event_name
    FROM attendees a
    INNER JOIN events e ON e.id = a.event_id
    INNER JOIN organization_memberships m ON m.organization_id = e.organization_id
    WHERE m.user_id = ${userId}
      AND (a.first_name ILIKE ${pattern} OR a.last_name ILIKE ${pattern} OR a.email ILIKE ${pattern})
    ORDER BY a.created_at DESC NULLS LAST, a.rsvp_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
    : [];
  const data = rows.map((row) => rowToAttendeeWithEvent(row as Record<string, unknown>));
  return { data, pagination: { total, limit, offset, hasMore: offset + data.length < total } };
}

export async function getAttendeeById(id: string) {
  const db = getDb();
  const rows = await db`SELECT * FROM attendees WHERE id = ${id}`;
  return rows.length ? rowToAttendee(rows[0] as Record<string, unknown>) : null;
}

/**
 * ME-7: Batch fetch attendees by IDs in a single query.
 * Reduces N queries to 1 query for bulk operations.
 *
 * @param ids Array of attendee IDs
 * @returns Map of id -> attendee for quick lookup
 */
export async function getAttendeesByIds(ids: string[]): Promise<Map<string, Attendee>> {
  if (ids.length === 0) return new Map();

  const db = getDb();
  const uniqueIds = [...new Set(ids)];

  const rows = await db`
    SELECT * FROM attendees
    WHERE id = ANY(${uniqueIds}::uuid[])
  `;

  const result = new Map<string, Attendee>();
  for (const row of rows) {
    const attendee = rowToAttendee(row as Record<string, unknown>);
    result.set(attendee.id, attendee);
  }

  return result;
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
    /** When true, sets checked_in and checked_in_at (e.g. Eventbrite already checked in). */
    initialCheckedIn?: boolean;
  }
) {
  const db = getDb();
  const id = crypto.randomUUID();
  const eventId = data.eventId ?? (await getDefaultEventId());
  const sourceDataJson = data.sourceData != null ? JSON.stringify(data.sourceData) : null;
  const checkedIn = Boolean(data.initialCheckedIn);
  const rows = await db`
    INSERT INTO attendees (id, event_id, first_name, last_name, email, phone, company, dietary_restrictions, checked_in, checked_in_at, rsvp_at, created_at, microsite_entry_id, source_data)
    VALUES (${id}, ${eventId}, ${data.firstName}, ${data.lastName}, ${data.email}, ${data.phone ?? ''}, ${data.company ?? ''}, ${data.dietaryRestrictions ?? ''}, ${checkedIn}, ${checkedIn ? new Date() : null}, NOW(), NOW(), ${data.micrositeEntryId ?? null}, ${sourceDataJson})
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

/**
 * ME-7: Batch update QR tokens for multiple attendees in a single query.
 * Reduces N+1 queries from 2N+1 to just 2 queries total.
 * 
 * @param updates Array of {attendeeId, token, expiresAt} objects
 * @returns Number of rows updated
 */
export async function bulkUpdateAttendeeQRTokens(
  updates: Array<{ attendeeId: string; token: string; expiresAt: Date }>
): Promise<number> {
  if (updates.length === 0) return 0;
  
  const db = getDb();
  
  // Extract arrays for unnest
  const ids = updates.map(u => u.attendeeId);
  const tokens = updates.map(u => u.token);
  const expiresAts = updates.map(u => u.expiresAt.toISOString());
  
  // Single batched UPDATE using unnest
  const rows = await db`
    UPDATE attendees 
    SET qr_token = v.token, 
        qr_expires_at = v.expires_at::timestamp with time zone
    FROM (
      SELECT 
        unnest(${ids}::uuid[]) as id,
        unnest(${tokens}::text[]) as token,
        unnest(${expiresAts}::text[]) as expires_at
    ) AS v
    WHERE attendees.id = v.id
    RETURNING attendees.id
  `;

  return rows.length;
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

/** Batch lookup for integration sync (e.g. Eventbrite attendee ids). */
export async function findAttendeesByEventAndMicrositeIds(
  eventId: string,
  micrositeEntryIds: string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(micrositeEntryIds.filter(Boolean)));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const db = getDb();
  const rows = await db`
    SELECT id, microsite_entry_id FROM attendees
    WHERE event_id = ${eventId} AND microsite_entry_id = ANY(${unique}::text[])
  `;
  for (const row of rows) {
    const mid = row.microsite_entry_id != null ? String(row.microsite_entry_id) : '';
    if (mid) out.set(mid, String(row.id));
  }
  return out;
}

export async function updateAttendeeMicrositeEntryId(attendeeId: string, micrositeEntryId: string) {
  const db = getDb();
  await db`
    UPDATE attendees SET microsite_entry_id = ${micrositeEntryId} WHERE id = ${attendeeId}
  `;
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

function parseSettingsColumn(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Full `events.settings` including integration secrets. Organizer-only; never send to the browser. */
export async function getEventSettingsRawForManage(
  userId: string,
  eventId: string
): Promise<Record<string, unknown> | null> {
  if (!userId || !eventId) return null;
  const allowed = await canUserManageEvent(userId, eventId);
  if (!allowed) return null;
  const db = getDb();
  const rows = await db`SELECT settings FROM events WHERE id = ${eventId} LIMIT 1`;
  if (!rows.length) return null;
  return parseSettingsColumn(rows[0].settings);
}

export async function mergeEventbriteSettingsForManage(
  userId: string,
  eventId: string,
  data: { eventbriteEventId: string; privateToken: string; lastSyncedAt: string }
): Promise<boolean> {
  if (!userId || !eventId) return false;
  const allowed = await canUserManageEvent(userId, eventId);
  if (!allowed) return false;
  const db = getDb();
  const rows = await db`SELECT settings FROM events WHERE id = ${eventId} LIMIT 1`;
  if (!rows.length) return false;
  const current = parseSettingsColumn(rows[0].settings);
  const prevEb =
    current.eventbrite && typeof current.eventbrite === 'object' && !Array.isArray(current.eventbrite)
      ? (current.eventbrite as Record<string, unknown>)
      : {};
  const nextSettings = {
    ...current,
    eventbrite: {
      ...prevEb,
      eventbriteEventId: data.eventbriteEventId,
      privateToken: data.privateToken,
      lastSyncedAt: data.lastSyncedAt,
    },
  };
  await db`
    UPDATE events
    SET settings = ${JSON.stringify(nextSettings)}::jsonb
    WHERE id = ${eventId}
  `;
  return true;
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
