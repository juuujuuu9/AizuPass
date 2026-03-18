import type { APIRoute } from 'astro';
import {
  createOrganizationInvitation,
  getOrganizationByOwnerUserId,
  listOrganizationInvitations,
} from '../../../lib/db';
import { requireUserId } from '../../../lib/access';
import { sendOrganizationInviteEmail } from '../../../lib/email';

const DEFAULT_INVITE_TTL_DAYS = 7;

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  try {
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) {
      return new Response(JSON.stringify({ error: 'Organization required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const invitations = await listOrganizationInvitations(organization.id);
    return new Response(JSON.stringify({ invitations }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/organizations/invitations', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch invitations' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  try {
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) {
      return new Response(JSON.stringify({ error: 'Organization required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = (await context.request.json()) as { email?: string };
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const expiresAt = new Date(Date.now() + DEFAULT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitation = await createOrganizationInvitation({
      organizationId: organization.id,
      email,
      invitedByUserId: userId,
      role: 'staff',
      expiresAt,
    });

    const requestUrl = new URL(context.request.url);
    const appBaseUrl =
      (typeof process !== 'undefined' && (process.env.APP_URL || process.env.PUBLIC_APP_URL))
      || ((typeof process !== 'undefined' && process.env.VERCEL_URL) ? `https://${process.env.VERCEL_URL}` : '')
      || requestUrl.origin;
    const inviteUrl = `${appBaseUrl.replace(/\/$/, '')}/invite/accept?token=${invitation.token}`;

    const emailResult = await sendOrganizationInviteEmail({
      toEmail: email,
      organizationName: organization.name,
      inviteUrl,
      invitedByEmail: context.locals.user?.email ?? null,
      expiresAt,
    });

    return new Response(JSON.stringify({
      invitation,
      communication: {
        sent: emailResult.success,
        error: emailResult.success ? null : emailResult.error,
      },
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('POST /api/organizations/invitations', err);
    return new Response(JSON.stringify({ error: 'Failed to create invitation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
