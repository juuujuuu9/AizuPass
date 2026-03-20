import type { APIRoute } from 'astro';
import { deleteEventForUser, getEventByIdForUser } from '../../../lib/db';
import { requireUserId } from '../../../lib/access';
import { json, errorResponse } from '../../../lib/api-response';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { params } = context;
  const id = params?.id;
  if (!id) {
    return errorResponse('Event ID required');
  }
  try {
    const event = await getEventByIdForUser(id, userId);
    if (!event) {
      return errorResponse('Event not found', 404);
    }
    return json(event);
  } catch (err) {
    console.error('GET /api/events/[id]', err);
    return errorResponse('Failed to fetch event', 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { params } = context;
  const id = params?.id;
  if (!id) {
    return errorResponse('Event ID required');
  }
  try {
    const deleted = await deleteEventForUser(id, userId);
    if (!deleted) {
      return errorResponse('Event not found or access denied', 403);
    }
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/events/[id]', err);
    return errorResponse('Failed to delete event', 500);
  }
};
