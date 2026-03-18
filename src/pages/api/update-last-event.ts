import type { APIRoute } from 'astro';
import { updateStaffLastEventId } from '../../lib/db';
import { requireEventAccess } from '../../lib/access';

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const user = locals.user;
  if (!user?.id) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { eventId?: string | null };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : null;
  try {
    if (eventId) {
      const access = await requireEventAccess(context, eventId);
      if (access instanceof Response) return access;
    }
    await updateStaffLastEventId(user.id, eventId || null);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('POST /api/update-last-event', err);
    return new Response(JSON.stringify({ error: 'Failed to update' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
