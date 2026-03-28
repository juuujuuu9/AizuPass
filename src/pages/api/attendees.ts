import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
import { requireUserId, requireEventAccess, requireEventManage } from '../../lib/access';
import { getClientIp } from '../../lib/rate-limit';
import { searchAttendeesForUser, createAttendee } from '../../lib/db';
import { checkRateLimit } from '../../lib/rate-limit';
import { attendeeCreationSchema, validateRequestBody } from '../../lib/validation';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('eventId') ?? undefined;
    if (eventId) {
      if (!UUID_RE.test(eventId)) return errorResponse('Invalid eventId format', 400);
      const check = await requireEventAccess(context, eventId);
      if (check instanceof Response) return check;
    }
    const q = url.searchParams.get('q')?.trim() ?? undefined;

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

export const POST: APIRoute = async (context) => {
  // CR-1: Require authentication and event management permission
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  const { request } = context;
  const ip = getClientIp(request);
  const rate = await checkRateLimit(`attendees:${ip}`, { maxAttempts: 20 });
  if (!rate.allowed) {
    return json(
      {
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: rate.retryAfterSec,
      },
      429
    );
  }

  try {
    const body = await request.json();

    const validation = validateRequestBody(attendeeCreationSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }
    const { firstName, lastName, email, phone, company, dietaryRestrictions, eventId } = validation.data;

    // CR-1: Verify user has management access to this event
    const manageCheck = await requireEventManage(context, eventId);
    if (manageCheck instanceof Response) return manageCheck;

    const attendee = await createAttendee({
      firstName,
      lastName,
      email,
      phone: phone ?? undefined,
      company: company ?? undefined,
      dietaryRestrictions: dietaryRestrictions ?? undefined,
      eventId,
    });

    return json(attendee, 201);
  } catch (err) {
    console.error('POST /api/attendees', err);
    return errorResponse('Failed to create attendee', 500);
  }
};
