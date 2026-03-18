import type { APIRoute } from 'astro';
import { deleteEventForUser, getEventByIdForUser } from '../../../lib/db';
import { requireUserId } from '../../../lib/access';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { params } = context;
  const id = params?.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Event ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const event = await getEventByIdForUser(id, userId);
    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(event), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/events/[id]', err);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch event' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const DELETE: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { params } = context;
  const id = params?.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Event ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const deleted = await deleteEventForUser(id, userId);
    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Event not found or access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('DELETE /api/events/[id]', err);
    return new Response(
      JSON.stringify({ error: 'Failed to delete event' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
