import type { APIRoute } from 'astro';
import {
  getOrganizationByOwnerUserId,
  getOrganizationInvitationById,
  revokeOrganizationInvitation,
} from '../../../../lib/db';
import { requireUserId } from '../../../../lib/access';
import { sendOrganizationInviteEmail } from '../../../../lib/email';

function getInviteUrl(requestUrl: URL, token: string): string {
  const appBaseUrl =
    (typeof process !== 'undefined' && (process.env.APP_URL || process.env.PUBLIC_APP_URL))
    || ((typeof process !== 'undefined' && process.env.VERCEL_URL) ? `https://${process.env.VERCEL_URL}` : '')
    || requestUrl.origin;
  return `${appBaseUrl.replace(/\/$/, '')}/invite/accept?token=${token}`;
}

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  const invitationId = context.params?.id?.trim();
  if (!invitationId) {
    return new Response(JSON.stringify({ error: 'Invitation ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) {
      return new Response(JSON.stringify({ error: 'Organization required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const invitation = await getOrganizationInvitationById(organization.id, invitationId);
    if (!invitation) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = (await context.request.json()) as { action?: 'resend' | 'revoke' };
    if (body?.action === 'revoke') {
      const revoked = await revokeOrganizationInvitation(organization.id, invitationId);
      if (!revoked) {
        return new Response(JSON.stringify({ error: 'Only pending invitations can be revoked' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body?.action === 'resend') {
      if (invitation.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Only pending invitations can be resent' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const expiresAt = new Date(invitation.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        return new Response(JSON.stringify({ error: 'Invitation expired. Create a new invite instead.' }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const inviteUrl = getInviteUrl(new URL(context.request.url), invitation.token);
      const emailResult = await sendOrganizationInviteEmail({
        toEmail: invitation.email,
        organizationName: organization.name,
        inviteUrl,
        invitedByEmail: context.locals.user?.email ?? null,
        expiresAt,
      });
      return new Response(JSON.stringify({
        ok: true,
        communication: {
          sent: emailResult.success,
          error: emailResult.success ? null : emailResult.error,
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unsupported action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('POST /api/organizations/invitations/[id]', err);
    return new Response(JSON.stringify({ error: 'Failed to process invitation action' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
