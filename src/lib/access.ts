import type { APIContext } from 'astro';
import {
  canUserAccessEvent,
  canUserManageEvent,
  getOrganizationByOwnerUserId,
  getOrganizationMembership,
} from './db';
import { errorResponse } from './api-response';

function isTestBypass(context: APIContext): boolean {
  return (
    process.env.BYPASS_AUTH_FOR_TESTS === 'true'
    && process.env.NODE_ENV !== 'production'
    && context.request.headers.get('X-Test-Mode') === '1'
  );
}

export function requireUserId(context: APIContext): string | Response {
  const userId = context.locals.user?.id;
  if (!userId && isTestBypass(context)) {
    return 'test-user';
  }
  if (!userId) {
    return errorResponse('Authentication required', 401);
  }
  return userId;
}

export async function requireEventAccess(
  context: APIContext,
  eventId: string
): Promise<string | Response> {
  if (isTestBypass(context)) return 'test-user';
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const allowed = await canUserAccessEvent(userId, eventId);
  if (!allowed) return errorResponse('Event access denied', 403);
  return userId;
}

export async function requireEventManage(
  context: APIContext,
  eventId: string
): Promise<string | Response> {
  if (isTestBypass(context)) return 'test-user';
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const allowed = await canUserManageEvent(userId, eventId);
  if (!allowed) return errorResponse('Organizer access required', 403);
  return userId;
}

export async function requireOwnedOrganization(context: APIContext): Promise<
  { userId: string; organizationId: string } | Response
> {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const organization = await getOrganizationByOwnerUserId(userId);
  if (!organization) {
    return errorResponse('Organization required', 403);
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
  if (!membership) return errorResponse('Organization access denied', 403);
  return userId;
}
