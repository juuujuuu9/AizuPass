import type { APIContext } from 'astro';
import {
  canUserAccessEvent,
  canUserManageEvent,
  getOrganizationByOwnerUserId,
  getOrganizationMembership,
} from './db';

function jsonResponse(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function requireUserId(context: APIContext): string | Response {
  const userId = context.locals.user?.id;
  if (!userId) {
    return jsonResponse('Authentication required', 401);
  }
  return userId;
}

export async function requireEventAccess(
  context: APIContext,
  eventId: string
): Promise<string | Response> {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const allowed = await canUserAccessEvent(userId, eventId);
  if (!allowed) return jsonResponse('Event access denied', 403);
  return userId;
}

export async function requireEventManage(
  context: APIContext,
  eventId: string
): Promise<string | Response> {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const allowed = await canUserManageEvent(userId, eventId);
  if (!allowed) return jsonResponse('Organizer access required', 403);
  return userId;
}

export async function requireOwnedOrganization(context: APIContext): Promise<
  { userId: string; organizationId: string } | Response
> {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const organization = await getOrganizationByOwnerUserId(userId);
  if (!organization) {
    return jsonResponse('Organization required', 403);
  }
  return { userId, organizationId: organization.id };
}

export async function requireOrganizationMembership(
  context: APIContext,
  organizationId: string
): Promise<string | Response> {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const membership = await getOrganizationMembership(userId, organizationId);
  if (!membership) return jsonResponse('Organization access denied', 403);
  return userId;
}
