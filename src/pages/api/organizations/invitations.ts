import type { APIRoute } from 'astro';
import {
  createOrganizationInvitation,
  getOrganizationByOwnerUserId,
  listOrganizationInvitations,
} from '../../../lib/db';
import { requireUserId } from '../../../lib/access';
import { sendOrganizationInviteEmail } from '../../../lib/email';
import { getAppBaseUrl } from '../../../lib/env';
import { json, errorResponse } from '../../../lib/api-response';
import { invitationCreationSchema, validateRequestBody } from '../../../lib/validation';

const DEFAULT_INVITE_TTL_DAYS = 7;

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  try {
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) {
      return errorResponse('Organization required', 403);
    }
    const invitations = await listOrganizationInvitations(organization.id);
    return json({ invitations });
  } catch (err) {
    console.error('GET /api/organizations/invitations', err);
    return errorResponse('Failed to fetch invitations', 500);
  }
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  try {
    const organization = await getOrganizationByOwnerUserId(userId);
    if (!organization) {
      return errorResponse('Organization required', 403);
    }
    // ME-12: Use Zod validation instead of manual email check
    const body = (await context.request.json()) as Record<string, unknown>;
    const validation = validateRequestBody(invitationCreationSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }
    const { email } = validation.data;

    const expiresAt = new Date(Date.now() + DEFAULT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitation = await createOrganizationInvitation({
      organizationId: organization.id,
      email,
      invitedByUserId: userId,
      role: 'staff',
      expiresAt,
    });

    const appBaseUrl = getAppBaseUrl(new URL(context.request.url).origin);
    const inviteUrl = `${appBaseUrl.replace(/\/$/, '')}/invite/accept?token=${invitation.token}`;

    const emailResult = await sendOrganizationInviteEmail({
      toEmail: email,
      organizationName: organization.name,
      inviteUrl,
      invitedByEmail: context.locals.user?.email ?? null,
      expiresAt,
    });

    return json(
      {
        invitation,
        communication: {
          sent: emailResult.success,
          error: emailResult.success ? null : emailResult.error,
        },
      },
      201
    );
  } catch (err) {
    console.error('POST /api/organizations/invitations', err);
    return errorResponse('Failed to create invitation', 500);
  }
};
