import type { APIRoute } from 'astro';
import { acceptOrganizationInvitation } from '../../../../lib/db';
import { requireUserId } from '../../../../lib/access';

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const email = context.locals.user?.email ?? '';

  try {
    const body = (await context.request.json()) as { token?: string };
    const token = String(body?.token ?? '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Invite token is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = await acceptOrganizationInvitation(token, userId, email);
    if (!result.ok) {
      const map: Record<string, { status: number; error: string }> = {
        not_found: { status: 404, error: 'Invitation not found' },
        email_mismatch: { status: 403, error: 'Invitation email does not match your account' },
        expired: { status: 410, error: 'Invitation expired' },
      };
      const out = map[result.reason] ?? { status: 400, error: 'Could not accept invitation' };
      return new Response(JSON.stringify({ error: out.error }), {
        status: out.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, organizationId: result.organizationId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('POST /api/organizations/invitations/accept', err);
    return new Response(JSON.stringify({ error: 'Failed to accept invitation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
