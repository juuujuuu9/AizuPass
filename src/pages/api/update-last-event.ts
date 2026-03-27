import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
import { updateStaffLastEventId } from '../../lib/db';
import { requireEventAccess } from '../../lib/access';
import { staffPreferenceSchema, validateRequestBody } from '../../lib/validation';

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const user = locals.user;
  if (!user?.id) {
    return errorResponse('Authentication required', 401);
  }

  try {
    // ME-12: Use Zod validation instead of manual type checking
    const body = (await request.json()) as Record<string, unknown>;
    const validation = validateRequestBody(staffPreferenceSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const eventId = validation.data.eventId ?? null;

    if (eventId) {
      const access = await requireEventAccess(context, eventId);
      if (access instanceof Response) return access;
    }
    await updateStaffLastEventId(user.id, eventId);
    return json({ ok: true });
  } catch (err) {
    console.error('POST /api/update-last-event', err);
    return errorResponse('Failed to update', 500);
  }
};
