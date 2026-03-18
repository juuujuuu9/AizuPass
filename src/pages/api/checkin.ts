import type { APIRoute } from 'astro';
import {
  getAttendeeById,
  getEventById,
  findAttendeeByEventAndToken,
  checkInAttendeeWithTokenScoped,
  checkInAttendeeIfNotCheckedIn,
} from '../../lib/db';
import { decodeQR } from '../../lib/qr';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';
import { logCheckInAttempt } from '../../lib/audit';
import { validateCheckIn, validateManualCheckIn } from '../../lib/validation';

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    logCheckInAttempt({ ip, outcome: 'rate_limited' });
    return new Response(
      JSON.stringify({
        error: 'Too many check-in attempts. Please try again later.',
      }),
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
    const rawBody = (await request.json()) || {};

    // Check if this is a manual check-in by attendee ID
    if (rawBody.attendeeId) {
      const validation = validateManualCheckIn(rawBody);
      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: 'Validation failed', details: validation.errors }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { attendeeId } = validation.data;
      const attendee = await getAttendeeById(attendeeId);
      if (!attendee) {
        logCheckInAttempt({ ip, outcome: 'not_found', attendeeId });
        return new Response(
          JSON.stringify({ error: 'Attendee not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (attendee.checkedIn) {
        const event = attendee.eventId
          ? await getEventById(attendee.eventId as string)
          : null;
        logCheckInAttempt({ ip, outcome: 'replay_attempt', attendeeId, eventId: attendee.eventId });
        return new Response(
          JSON.stringify({
            alreadyCheckedIn: true,
            attendee,
            event: event ? { id: event.id, name: event.name } : undefined,
            message: `Already checked in: ${attendee.firstName} ${attendee.lastName}`,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Atomic update prevents double-success when two stations submit at once.
      const updated = await checkInAttendeeIfNotCheckedIn(attendeeId);
      if (!updated) {
        const latest = await getAttendeeById(attendeeId);
        const event = latest?.eventId
          ? await getEventById(latest.eventId as string)
          : null;
        if (!latest) {
          logCheckInAttempt({ ip, outcome: 'not_found', attendeeId });
          return new Response(
            JSON.stringify({ error: 'Attendee not found' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
        logCheckInAttempt({ ip, outcome: 'replay_attempt', attendeeId, eventId: latest.eventId });
        return new Response(
          JSON.stringify({
            alreadyCheckedIn: true,
            attendee: latest,
            event: event ? { id: event.id, name: event.name } : undefined,
            message: `Already checked in: ${latest.firstName} ${latest.lastName}`,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const event = updated.eventId
        ? await getEventById(updated.eventId as string)
        : null;
      logCheckInAttempt({ ip, outcome: 'success', attendeeId: updated.id, eventId: updated.eventId });
      return new Response(
        JSON.stringify({
          success: true,
          event: event ? { id: event.id, name: event.name } : undefined,
          attendee: updated,
          message: `${updated.firstName} ${updated.lastName} checked in successfully!`,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // QR code check-in
    const validation = validateCheckIn(rawBody);
    if (!validation.success) {
      logCheckInAttempt({ ip, outcome: 'invalid_format' });
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validation.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { qrData, scannerDeviceId } = validation.data;

    // Demo codes: canned responses for staff testing (never touch DB)
    const normalized = qrData.replace(/\uFEFF/g, '').trim();
    if (normalized === 'DEMO-SUCCESS') {
      logCheckInAttempt({ ip, outcome: 'demo_success' });
      return new Response(
        JSON.stringify({
          success: true,
          event: { id: 'demo', name: 'Demo Event' },
          attendee: {
            id: 'demo-attendee',
            firstName: 'Demo',
            lastName: 'Guest',
            email: 'demo@example.com',
            checkedIn: true,
          },
          message: 'Demo Guest checked in successfully!',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (normalized === 'DEMO-ALREADY') {
      logCheckInAttempt({ ip, outcome: 'demo_already' });
      return new Response(
        JSON.stringify({
          alreadyCheckedIn: true,
          event: { id: 'demo', name: 'Demo Event' },
          attendee: {
            id: 'demo-attendee',
            firstName: 'Demo',
            lastName: 'Guest',
            email: 'demo@example.com',
            checkedIn: true,
          },
          message: 'Already checked in: Demo Guest',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (normalized === 'DEMO-INVALID') {
      logCheckInAttempt({ ip, outcome: 'demo_invalid' });
      return new Response(
        JSON.stringify({ error: 'Invalid or expired QR code' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let eventId: string;
    let entryId: string;
    let token: string;
    try {
      const payload = await decodeQR(qrData);
      eventId = payload.eventId;
      entryId = payload.entryId;
      token = payload.token;
    } catch {
      logCheckInAttempt({ ip, outcome: 'invalid_format' });
      return new Response(
        JSON.stringify({ error: 'Invalid QR code format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const event = await getEventById(eventId);
    if (!event) {
      logCheckInAttempt({ ip, outcome: 'not_found', eventId, entryId });
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const attendee = await findAttendeeByEventAndToken(eventId, entryId, token);
    if (!attendee) {
      const existing = await getAttendeeById(entryId);
      if (existing?.eventId !== eventId) {
        logCheckInAttempt({ ip, outcome: 'invalid_or_expired', attendeeId: entryId });
        return new Response(
          JSON.stringify({ error: 'Invalid or expired QR code' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (existing?.qrUsedAt || existing?.checkedIn) {
        logCheckInAttempt({ ip, outcome: 'replay_attempt', attendeeId: entryId });
        const message = existing
          ? `Already checked in: ${existing.firstName} ${existing.lastName}`
          : 'QR code already used';
        return new Response(
          JSON.stringify({
            alreadyCheckedIn: true,
            attendee: existing,
            event: { id: event.id, name: event.name },
            message,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (existing?.qrExpiresAt && new Date(existing.qrExpiresAt as string) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'QR code expired' }),
          { status: 410, headers: { 'Content-Type': 'application/json' } }
        );
      }
      logCheckInAttempt({ ip, outcome: 'invalid_or_expired', attendeeId: entryId });
      return new Response(
        JSON.stringify({ error: 'Invalid or expired QR code' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const updated = await checkInAttendeeWithTokenScoped(
      eventId,
      entryId,
      token,
      scannerDeviceId ?? null
    );
    logCheckInAttempt({ ip, outcome: 'success', attendeeId: updated.id, eventId });
    return new Response(
      JSON.stringify({
        success: true,
        event: { id: event.id, name: event.name },
        attendee: updated,
        message: `${updated.firstName} ${updated.lastName} checked in successfully!`,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('POST /api/checkin', err);
    logCheckInAttempt({ ip, outcome: 'error' });
    return new Response(
      JSON.stringify({ error: 'Failed to process check-in' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
