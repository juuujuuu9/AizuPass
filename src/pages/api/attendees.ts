import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
import { requireUserId, requireEventAccess } from '../../lib/access';
import { getClientIp } from '../../lib/rate-limit';
import { searchAttendeesForUser, createAttendee } from '../../lib/db';
import { checkRateLimit } from '../../lib/rate-limit';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('eventId') ?? undefined;
    if (eventId) {
      const check = await requireEventAccess(context, eventId);
      if (check instanceof Response) return check;
    }
    const q = url.searchParams.get('q')?.trim() ?? undefined;

    // HI-3: Pagination support
    const limit = url.searchParams.has('limit')
      ? parseInt(url.searchParams.get('limit')!, 10)
      : undefined;
    const offset = url.searchParams.has('offset')
      ? parseInt(url.searchParams.get('offset')!, 10)
      : undefined;

    const result = await searchAttendeesForUser(userId, eventId, q, { limit, offset });
    return json(result);
  } catch (err) {
    console.error('GET /api/attendees', err);
    return errorResponse('Failed to fetch attendees', 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`attendees:${ip}`, { maxAttempts: 20 });
  if (!rate.allowed) {
    return json(
      {
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: rate.retryAfter,
      },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();

    // Basic validation
    if (!body.firstName || !body.lastName || !body.email || !body.eventId) {
      return json(
        { error: 'Missing required fields: firstName, lastName, email, eventId' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Create attendee
    const attendee = await createAttendee({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      company: body.company,
      dietaryRequirements: body.dietaryRequirements,
      eventId: body.eventId,
      status: body.status || 'registered',
    });

    return json(attendee, { status: 201 });
  } catch (err) {
    console.error('POST /api/attendees', err);
    return errorResponse('Failed to create attendee', 500);
  }
};
