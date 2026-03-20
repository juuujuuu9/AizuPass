import type { APIRoute } from 'astro';
import {
  getOrganizationByOwnerUserId,
  getOrganizationInvitationById,
  revokeOrganizationInvitation,
} from '../../../../lib/db';
import { requireUserId } from '../../../../lib/access';
import { sendOrganizationInviteEmail } from '../../../../lib/email';
import { getAppBaseUrl } from '../../../../lib/env';
import { json, errorResponse } from '../../../../lib/api-response';

function getInviteUrl(requestUrl: URL, token: string): string {
  const appBaseUrl = getAppBaseUrl(requestUrl.origin);
  return `${appBaseUrl.replace(/\/$/, '')}/invite/accept?token=${token}`;
}

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  const invitationId = context.params?.id?.trim();
  if (!invitationId) {
    return errorResponse('Invitation ID required');
  }

  try {
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) {
      return errorResponse('Organization required', 403);
    }

    const invitation = await getOrganizationInvitationById(organization.id, invitationId);
    if (!invitation) {
      return errorResponse('Invitation not found', 404);
    }

    const body = (await context.request.json()) as { action?: 'resend' | 'revoke' };
    if (body?.action === 'revoke') {
      const revoked = await revokeOrganizationInvitation(organization.id, invitationId);
      if (!revoked) {
        return errorResponse('Only pending invitations can be revoked', 409);
      }
      return json({ ok: true });
    }

    if (body?.action === 'resend') {
      if (invitation.status !== 'pending') {
        return errorResponse('Only pending invitations can be resent', 409);
      }
      const expiresAt = new Date(invitation.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        return errorResponse('Invitation expired. Create a new invite instead.', 410);
      }
      const inviteUrl = getInviteUrl(new URL(context.request.url), invitation.token);
      const emailResult = await sendOrganizationInviteEmail({
        toEmail: invitation.email,
        organizationName: organization.name,
        inviteUrl,
        invitedByEmail: context.locals.user?.email ?? null,
        expiresAt,
      });
      return json({
        ok: true,
        communication: {
          sent: emailResult.success,
          error: emailResult.success ? null : emailResult.error,
        },
      });
    }

    return errorResponse('Unsupported action');
  } catch (err) {
    console.error('POST /api/organizations/invitations/[id]', err);
    return errorResponse('Failed to process invitation action', 500);
  }
};
