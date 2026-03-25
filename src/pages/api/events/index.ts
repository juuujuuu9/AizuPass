import type { APIRoute } from 'astro';
import { createEventForUser, getAllEventsForUser } from '../../../lib/db';
import { requireUserId } from '../../../lib/access';
import { json, errorResponse } from '../../../lib/api-response';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  try {
    const events = await getAllEventsForUser(userId);
    return json(events);
  } catch (err) {
    console.error('GET /api/events', err);
    return errorResponse('Failed to fetch events', 500);
  }
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  if (!context.locals.isAdmin) {
    return errorResponse('Only organization organizers can create events', 403);
  }
  const { request } = context;
  try {
    const body = (await request.json()) as { name?: string; slug?: string; micrositeUrl?: string };
    const name = (body?.name ?? '').trim();
    const slug = (body?.slug ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!name || !slug) {
      return errorResponse('name and slug are required');
    }
    const event = await createEventForUser(userId, {
      name,
      slug,
      micrositeUrl: body?.micrositeUrl?.trim() || undefined,
    });
    return json(event, 201);
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('Organization required')) {
      return errorResponse('Create an organization before creating an event', 403);
    }
    if (msg.includes('already has an event')) {
      return errorResponse(
        'Your organization already has an event. Multiple events are part of a future paid tier.',
        403
      );
    }
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return errorResponse('An event with this slug already exists', 409);
    }
    console.error('POST /api/events', err);
    return errorResponse('Failed to create event', 500);
  }
};
