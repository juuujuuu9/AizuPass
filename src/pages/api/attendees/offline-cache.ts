import type { APIRoute } from 'astro';
import {
  getAllEventsForUser,
  getAttendeesForOfflineCacheForUser,
  type OfflineCacheAttendee,
} from '../../../lib/db';
import { requireEventAccess, requireUserId } from '../../../lib/access';

export type OfflineCacheData = {
  cachedAt: string;
  defaultEventId: string;
  events: { id: string; name: string }[];
  attendees: OfflineCacheAttendee[];
};

/** Get attendees with qr_token for offline cache for signed-in staff. */
export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { url } = context;
  try {
    const eventId = url.searchParams.get('eventId') ?? undefined;
    if (eventId) {
      const access = await requireEventAccess(context, eventId);
      if (access instanceof Response) return access;
    }
    const events = await getAllEventsForUser(userId);
    const defaultEvent = events.find((e) => e.slug === 'default') ?? events[0];
    const defaultEventId = defaultEvent?.id ?? '';

    const attendees = await getAttendeesForOfflineCacheForUser(userId, eventId);

    const data: OfflineCacheData = {
      cachedAt: new Date().toISOString(),
      defaultEventId,
      events: events.map((e) => ({ id: e.id, name: e.name })),
      attendees,
    };

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/attendees/offline-cache', err);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch offline cache' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
