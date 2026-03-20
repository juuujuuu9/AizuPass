import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
import {
  searchAttendeesForUser,
  getAttendeeByIdForUser,
  createAttendee,
  deleteAttendee,
} from '../../lib/db';
import { getOrCreateQRPayload } from '../../lib/qr-token';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
import { validateRSVPForm } from '../../lib/validation';
import { requireEventAccess, requireEventManage, requireUserId } from '../../lib/access';

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
    const attendees = await searchAttendeesForUser(userId, eventId, q);
    return json(attendees);
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
      { error: 'Too many RSVPs. Please try again later.' },
      429,
      rate.retryAfterSec != null ? { 'Retry-After': String(rate.retryAfterSec) } : undefined
    );
  }

  try {
    const rawData = (await request.json()) || {};

    // Validate input using zod schema
    const validation = validateRSVPForm(rawData);
    if (!validation.success) {
      return json({ error: 'Validation failed', details: validation.errors }, 400);
    }

    const data = validation.data;
    const attendee = await createAttendee({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone ?? undefined,
      company: data.company ?? undefined,
      dietaryRestrictions: data.dietaryRestrictions ?? undefined,
      eventId: data.eventId,
    });
    const qrResult = await getOrCreateQRPayload(attendee.id);
    const body = qrResult
      ? { ...attendee, qrPayload: qrResult.qrPayload, qrExpiresAt: qrResult.expiresAt.toISOString() }
      : attendee;
    return json(body, 201);
  } catch (err) {
    const msg = (err as Error)?.message || '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return errorResponse('This email is already registered for this event', 409);
    }
    console.error('POST /api/attendees', err);
    return errorResponse('Failed to create attendee', 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  try {
    const { id } = ((await request.json()) || {}) as { id?: string };
    if (!id) {
      return errorResponse('Attendee ID is required');
    }
    const attendee = await getAttendeeByIdForUser(id, userId);
    if (!attendee?.eventId) {
      return errorResponse('Attendee not found', 404);
    }
    const manage = await requireEventManage(context, String(attendee.eventId));
    if (manage instanceof Response) return manage;
    const deleted = await deleteAttendee(id);
    if (!deleted) {
      return errorResponse('Attendee not found', 404);
    }
    return json({ success: true });
  } catch (err) {
    console.error('DELETE /api/attendees', err);
    return errorResponse('Failed to delete attendee', 500);
  }
};
