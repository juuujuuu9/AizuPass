import type { APIRoute } from 'astro';
import { createEventForUser, getAllEventsForUser } from '../../../lib/db';
import { requireUserId } from '../../../lib/access';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  try {
    const events = await getAllEventsForUser(userId);
    return new Response(JSON.stringify(events), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/events', err);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch events' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  try {
    const body = (await request.json()) as { name?: string; slug?: string; micrositeUrl?: string };
    const name = (body?.name ?? '').trim();
    const slug = (body?.slug ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!name || !slug) {
      return new Response(
        JSON.stringify({ error: 'name and slug are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const event = await createEventForUser(userId, {
      name,
      slug,
      micrositeUrl: body?.micrositeUrl?.trim() || undefined,
    });
    return new Response(JSON.stringify(event), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('Organization required')) {
      return new Response(
        JSON.stringify({ error: 'Create an organization before creating an event' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (msg.includes('already has an event')) {
      return new Response(
        JSON.stringify({ error: 'Your organization already has an event. Multiple events are part of a future paid tier.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return new Response(
        JSON.stringify({ error: 'An event with this slug already exists' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    console.error('POST /api/events', err);
    return new Response(
      JSON.stringify({ error: 'Failed to create event' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
