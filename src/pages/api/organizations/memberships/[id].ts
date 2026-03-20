import type { APIRoute } from 'astro';
import {
  getOrganizationByOwnerUserId,
  removeOrganizationMembership,
} from '../../../../lib/db';
import { requireUserId } from '../../../../lib/access';
import { json, errorResponse } from '../../../../lib/api-response';

export const DELETE: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  const membershipId = context.params?.id?.trim();
  if (!membershipId) {
    return errorResponse('Membership ID required');
  }

  try {
    // Verify the current user is an organizer of the organization
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) {
      return errorResponse('Organization required', 403);
    }

    const removed = await removeOrganizationMembership(membershipId);
    if (!removed) {
      return errorResponse('Membership not found or could not be removed', 404);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/organizations/memberships/[id]', err);
    return errorResponse('Failed to remove member', 500);
  }
};
