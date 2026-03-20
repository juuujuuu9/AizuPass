import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
import { updateStaffLastEventId } from '../../lib/db';
import { requireEventAccess } from '../../lib/access';

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const user = locals.user;
  if (!user?.id) {
    return errorResponse('Authentication required', 401);
  }

  let body: { eventId?: string | null };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON');
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : null;
  try {
    if (eventId) {
      const access = await requireEventAccess(context, eventId);
      if (access instanceof Response) return access;
    }
    await updateStaffLastEventId(user.id, eventId || null);
    return json({ ok: true });
  } catch (err) {
    console.error('POST /api/update-last-event', err);
    return errorResponse('Failed to update', 500);
  }
};
