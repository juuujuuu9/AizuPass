/**
 * Organizations, memberships, invitations, and org-scoped event listing.
 * Split from `db.ts` (2026-03-22); see docs/DB-MODULE-LAYOUT.md.
 */
import { getDb } from './client';
import { rowToEvent, type EventRow } from './event-row';

export interface OrganizationRow {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt?: string;
}

export interface OrganizationWithRole extends OrganizationRow {
  userRole: OrganizationRole;
}

export type OrganizationRole = 'organizer' | 'staff';

export interface OrganizationMembershipRow {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  invitedByUserId?: string | null;
  createdAt?: string;
}

export interface OrganizationInvitationRow {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedByUserId?: string | null;
  expiresAt: string;
  createdAt?: string;
}

function rowToOrganization(row: Record<string, unknown>): OrganizationRow {
  return {
    id: row.id as string,
    name: row.name as string,
    ownerUserId: row.owner_user_id as string,
    createdAt: row.created_at as string | undefined,
  };
}

function rowToMembership(row: Record<string, unknown>): OrganizationMembershipRow {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    userId: row.user_id as string,
    role: row.role as OrganizationRole,
    invitedByUserId: row.invited_by_user_id as string | null,
    createdAt: row.created_at as string | undefined,
  };
}

function rowToInvitation(row: Record<string, unknown>): OrganizationInvitationRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    email: String(row.email),
    role: row.role as OrganizationRole,
    token: String(row.token),
    status: row.status as OrganizationInvitationRow['status'],
    invitedByUserId: (row.invited_by_user_id as string | null) ?? null,
    expiresAt: String(row.expires_at),
    createdAt: row.created_at as string | undefined,
  };
}

export async function getOrganizationByOwnerUserId(userId: string): Promise<OrganizationRow | null> {
  if (!userId) return null;
  const db = getDb();
  const rows = await db`SELECT * FROM organizations WHERE owner_user_id = ${userId} LIMIT 1`;
  return rows.length ? rowToOrganization(rows[0] as Record<string, unknown>) : null;
}

export async function getOrganizationById(id: string): Promise<OrganizationRow | null> {
  if (!id) return null;
  const db = getDb();
  const rows = await db`SELECT * FROM organizations WHERE id = ${id} LIMIT 1`;
  return rows.length ? rowToOrganization(rows[0] as Record<string, unknown>) : null;
}

export async function getOrganizationForUser(userId: string): Promise<OrganizationRow | null> {
  if (!userId) return null;
  const db = getDb();
  const rows = await db`
    SELECT o.*
    FROM organizations o
    INNER JOIN organization_memberships m
      ON m.organization_id = o.id
    WHERE m.user_id = ${userId}
    ORDER BY o.created_at ASC
    LIMIT 1
  `;
  return rows.length ? rowToOrganization(rows[0] as Record<string, unknown>) : null;
}

export async function getAllOrganizationsForUser(userId: string): Promise<OrganizationWithRole[]> {
  if (!userId) return [];
  const db = getDb();
  const rows = await db`
    SELECT DISTINCT o.*,
      CASE
        WHEN o.owner_user_id = ${userId} THEN 'organizer'
        ELSE m.role
      END as user_role
    FROM organizations o
    LEFT JOIN organization_memberships m
      ON m.organization_id = o.id AND m.user_id = ${userId}
    WHERE o.owner_user_id = ${userId}
       OR m.user_id = ${userId}
    ORDER BY o.created_at ASC
  `;
  return rows.map((row) => ({
    ...rowToOrganization(row as Record<string, unknown>),
    userRole: row.user_role as OrganizationRole,
  }));
}

export async function getOrganizationMembership(
  userId: string,
  organizationId: string
): Promise<OrganizationMembershipRow | null> {
  if (!userId || !organizationId) return null;
  const db = getDb();
  const rows = await db`
    SELECT *
    FROM organization_memberships
    WHERE user_id = ${userId} AND organization_id = ${organizationId}
    LIMIT 1
  `;
  return rows.length ? rowToMembership(rows[0] as Record<string, unknown>) : null;
}

/** Organizer owner or any active membership (staff). */
export async function canUserAccessOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  if (!userId || !organizationId) return false;
  const org = await getOrganizationById(organizationId);
  if (!org) return false;
  if (org.ownerUserId === userId) return true;
  const m = await getOrganizationMembership(userId, organizationId);
  return m !== null;
}

export type ResolveAdminOrganizationResult =
  | { status: 'ok'; organization: OrganizationRow; orgNavQuery: string }
  | { status: 'redirect'; to: string }
  | { status: 'no_access' };

/**
 * Resolves which organization an admin/settings page is for. Organizers default to their owned org;
 * staff must use ?id= when in multiple orgs, or are redirected to add it when they only have one.
 */
export async function resolveOrganizationForAdminSession(
  userId: string,
  queryOrgId: string | undefined,
  hasOrganizerRole: boolean,
  /** e.g. `/admin/organization` or `/admin/organization/staff` (no query string) */
  adminSectionPath: string
): Promise<ResolveAdminOrganizationResult> {
  const idParam = queryOrgId?.trim() ?? '';

  if (idParam) {
    const allowed = await canUserAccessOrganization(userId, idParam);
    if (!allowed) return { status: 'no_access' };
    const organization = await getOrganizationById(idParam);
    if (!organization) return { status: 'no_access' };
    return {
      status: 'ok',
      organization,
      orgNavQuery: `?id=${encodeURIComponent(idParam)}`,
    };
  }

  if (hasOrganizerRole) {
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) return { status: 'no_access' };
    return { status: 'ok', organization, orgNavQuery: '' };
  }

  const orgs = await getAllOrganizationsForUser(userId);
  if (orgs.length === 0) return { status: 'no_access' };
  if (orgs.length === 1) {
    const id = orgs[0]!.id;
    return {
      status: 'redirect',
      to: `${adminSectionPath}?id=${encodeURIComponent(id)}`,
    };
  }
  return { status: 'redirect', to: '/admin' };
}

export async function getOrganizationMembershipsForUser(
  userId: string
): Promise<OrganizationMembershipRow[]> {
  if (!userId) return [];
  const db = getDb();
  const rows = await db`
    SELECT *
    FROM organization_memberships
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `;
  return rows.map((row) => rowToMembership(row as Record<string, unknown>));
}

export type StaffMember = OrganizationMembershipRow & {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  status?: 'active' | 'pending' | 'revoked' | 'expired';
  displayName?: string;
};

export async function getOrganizationStaffMembers(organizationId: string): Promise<StaffMember[]> {
  if (!organizationId) return [];
  const db = getDb();

  const membershipRows = await db`
    SELECT m.*,
           u.email AS user_email,
           u.first_name AS profile_first_name,
           u.last_name AS profile_last_name
    FROM organization_memberships m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ${organizationId}
    ORDER BY m.created_at DESC
  `;

  const invitationRows = await db`
    SELECT i.*
    FROM organization_invitations i
    WHERE i.organization_id = ${organizationId}
      AND i.status = 'pending'
      AND i.expires_at > NOW()
    ORDER BY i.created_at DESC
  `;

  const staff: StaffMember[] = [];

  for (const row of membershipRows) {
    const membership = rowToMembership(row as Record<string, unknown>);
    const fn = (row.profile_first_name as string | null) ?? null;
    const ln = (row.profile_last_name as string | null) ?? null;
    const userEmail = (row.user_email as string | null) ?? undefined;
    const displayName = fn && ln ? `${fn} ${ln}` : fn || ln || undefined;
    staff.push({
      ...membership,
      email: userEmail,
      firstName: fn,
      lastName: ln,
      status: 'active',
      displayName,
    });
  }

  for (const row of invitationRows) {
    staff.push({
      id: String(row.id),
      organizationId: String(row.organization_id),
      userId: '',
      role: String(row.role) as OrganizationRole,
      invitedByUserId: String(row.invited_by_user_id),
      createdAt: String(row.created_at),
      email: String(row.email),
      status: 'pending',
    });
  }

  return staff;
}

export async function createOrganizationForOwner(ownerUserId: string, name: string): Promise<OrganizationRow> {
  const existing = await getOrganizationByOwnerUserId(ownerUserId);
  if (existing) return existing;
  const db = getDb();
  const organizationId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const rows = await db`
    INSERT INTO organizations (id, name, owner_user_id, created_at)
    VALUES (${organizationId}, ${name}, ${ownerUserId}, NOW())
    RETURNING *
  `;
  await db`
    INSERT INTO organization_memberships (id, organization_id, user_id, role, invited_by_user_id, created_at)
    VALUES (${membershipId}, ${organizationId}, ${ownerUserId}, 'organizer', ${ownerUserId}, NOW())
    ON CONFLICT (organization_id, user_id) DO NOTHING
  `;
  return rowToOrganization(rows[0] as Record<string, unknown>);
}

export async function getEventForOrganization(organizationId: string): Promise<EventRow | null> {
  if (!organizationId) return null;
  const db = getDb();
  const rows = await db`SELECT * FROM events WHERE organization_id = ${organizationId} LIMIT 1`;
  return rows.length ? rowToEvent(rows[0] as Record<string, unknown>) : null;
}

export async function getEventsForOrganization(organizationId: string): Promise<EventRow[]> {
  if (!organizationId) return [];
  const db = getDb();
  const rows = await db`SELECT * FROM events WHERE organization_id = ${organizationId} ORDER BY created_at DESC`;
  return rows.map((r) => rowToEvent(r as Record<string, unknown>));
}

export async function createOrganizationInvitation(data: {
  organizationId: string;
  email: string;
  invitedByUserId: string;
  role?: OrganizationRole;
  expiresAt: Date;
}): Promise<OrganizationInvitationRow> {
  const db = getDb();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const role = data.role ?? 'staff';
  const rows = await db`
    INSERT INTO organization_invitations
      (id, organization_id, email, role, token, status, expires_at, invited_by_user_id, created_at)
    VALUES
      (${id}, ${data.organizationId}, ${data.email}, ${role}, ${token}, 'pending', ${data.expiresAt}, ${data.invitedByUserId}, NOW())
    RETURNING *
  `;
  return rowToInvitation(rows[0] as Record<string, unknown>);
}

export async function listOrganizationInvitations(organizationId: string): Promise<OrganizationInvitationRow[]> {
  const db = getDb();
  const rows = await db`
    SELECT *
    FROM organization_invitations
    WHERE organization_id = ${organizationId}
    ORDER BY created_at DESC
  `;
  return rows.map((row) => rowToInvitation(row as Record<string, unknown>));
}

export async function getOrganizationInvitationById(
  organizationId: string,
  invitationId: string
): Promise<OrganizationInvitationRow | null> {
  if (!organizationId || !invitationId) return null;
  const db = getDb();
  const rows = await db`
    SELECT *
    FROM organization_invitations
    WHERE organization_id = ${organizationId}
      AND id = ${invitationId}
    LIMIT 1
  `;
  return rows.length ? rowToInvitation(rows[0] as Record<string, unknown>) : null;
}

export async function revokeOrganizationInvitation(
  organizationId: string,
  invitationId: string
): Promise<boolean> {
  if (!organizationId || !invitationId) return false;
  const db = getDb();
  const rows = await db`
    UPDATE organization_invitations
    SET status = 'revoked'
    WHERE organization_id = ${organizationId}
      AND id = ${invitationId}
      AND status = 'pending'
    RETURNING id
  `;
  return rows.length > 0;
}

export async function removeOrganizationMembership(membershipId: string): Promise<boolean> {
  if (!membershipId) return false;
  const db = getDb();
  const rows = await db`
    DELETE FROM organization_memberships
    WHERE id = ${membershipId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function getInvitationByToken(token: string): Promise<{
  organizationId: string;
  email: string;
  organizationName: string;
  role: OrganizationRole;
  status: OrganizationInvitationRow['status'];
  expiresAt: string;
} | null> {
  if (!token) return null;
  const db = getDb();
  const rows = await db`
    SELECT i.organization_id, i.email, i.role, i.status, i.expires_at, o.name AS organization_name
    FROM organization_invitations i
    INNER JOIN organizations o ON o.id = i.organization_id
    WHERE i.token = ${token}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    organizationId: String(row.organization_id),
    email: String(row.email),
    organizationName: String(row.organization_name),
    role: row.role as OrganizationRole,
    status: row.status as OrganizationInvitationRow['status'],
    expiresAt: String(row.expires_at),
  };
}

export async function acceptOrganizationInvitation(token: string, userId: string, userEmail: string) {
  const db = getDb();
  const rows = await db`
    SELECT *
    FROM organization_invitations
    WHERE token = ${token}
      AND status = 'pending'
    LIMIT 1
  `;
  if (!rows.length) return { ok: false as const, reason: 'not_found' as const };
  const invite = rows[0] as Record<string, unknown>;
  const inviteEmail = String(invite.email ?? '').trim().toLowerCase();
  if (!inviteEmail || inviteEmail !== String(userEmail ?? '').trim().toLowerCase()) {
    return { ok: false as const, reason: 'email_mismatch' as const };
  }
  const expiresAt = new Date(String(invite.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    await db`UPDATE organization_invitations SET status = 'expired' WHERE id = ${invite.id}`;
    return { ok: false as const, reason: 'expired' as const };
  }

  const membershipId = crypto.randomUUID();
  await db`
    INSERT INTO organization_memberships (id, organization_id, user_id, role, invited_by_user_id, created_at)
    VALUES (${membershipId}, ${invite.organization_id}, ${userId}, ${invite.role}, ${invite.invited_by_user_id}, NOW())
    ON CONFLICT (organization_id, user_id) DO NOTHING
  `;
  await db`UPDATE organization_invitations SET status = 'accepted' WHERE id = ${invite.id}`;
  return { ok: true as const, organizationId: String(invite.organization_id) };
}
