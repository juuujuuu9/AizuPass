import type { APIRoute } from 'astro';
import {
  getAllAttendees,
  searchAttendees,
  getAttendeeById,
  createAttendee,
  deleteAttendee,
} from '../../lib/db';
import { getOrCreateQRPayload } from '../../lib/qr-token';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
import { validateRSVPForm } from '../../lib/validation';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('eventId') ?? undefined;
    const q = url.searchParams.get('q')?.trim() ?? undefined;
    const attendees = await searchAttendees(eventId, q);
    return new Response(JSON.stringify(attendees), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/attendees', err);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch attendees' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`attendees:${ip}`, { maxAttempts: 20 });
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many RSVPs. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...(rate.retryAfterSec != null && {
            'Retry-After': String(rate.retryAfterSec),
          }),
        },
      }
    );
  }

  try {
    const rawData = (await request.json()) || {};

    // Validate input using zod schema
    const validation = validateRSVPForm(rawData);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validation.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
    return new Response(JSON.stringify(body), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = (err as Error)?.message || '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return new Response(
        JSON.stringify({ error: 'This email is already registered for this event' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    console.error('POST /api/attendees', err);
    return new Response(
      JSON.stringify({ error: 'Failed to create attendee' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { id } = ((await request.json()) || {}) as { id?: string };
    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Attendee ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const deleted = await deleteAttendee(id);
    if (!deleted) {
      return new Response(
        JSON.stringify({ error: 'Attendee not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('DELETE /api/attendees', err);
    return new Response(
      JSON.stringify({ error: 'Failed to delete attendee' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
