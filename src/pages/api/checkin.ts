import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
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
import { requireEventAccess, requireUserId } from '../../lib/access';

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  const ip = getClientIp(request);

  const rate = await checkRateLimit(ip);
  if (!rate.allowed) {
    logCheckInAttempt({ ip, outcome: 'rate_limited' });
    return json(
      { error: 'Too many check-in attempts. Please try again later.' },
      429,
      rate.retryAfterSec != null ? { 'Retry-After': String(rate.retryAfterSec) } : undefined
    );
  }

  try {
    const rawBody = (await request.json()) || {};

    // Check if this is a manual check-in by attendee ID
    if (rawBody.attendeeId) {
      const validation = validateManualCheckIn(rawBody);
      if (!validation.success) {
        return json({ error: 'Validation failed', details: validation.errors }, 400);
      }

      const { attendeeId, scannerEventId } = validation.data;
      const attendee = await getAttendeeById(attendeeId);
      if (!attendee) {
        logCheckInAttempt({ ip, outcome: 'not_found', attendeeId });
        return errorResponse('Attendee not found', 404);
      }
      if (!attendee.eventId) {
        logCheckInAttempt({ ip, outcome: 'invalid_format', attendeeId });
        return errorResponse('Attendee is not linked to an event', 400);
      }
      if (String(attendee.eventId) !== scannerEventId) {
        logCheckInAttempt({
          ip,
          outcome: 'wrong_scanner_event',
          attendeeId,
          eventId: attendee.eventId,
        });
        return json({ error: 'This guest is registered for a different event.' }, 403);
      }
      if (attendee.checkedIn) {
        if (attendee.eventId) {
          const access = await requireEventAccess(context, String(attendee.eventId));
          if (access instanceof Response) return access;
        }
        const event = attendee.eventId
          ? await getEventById(attendee.eventId as string)
          : null;
        logCheckInAttempt({ ip, outcome: 'replay_attempt', attendeeId, eventId: attendee.eventId });
        return json(
          {
            alreadyCheckedIn: true,
            attendee,
            event: event ? { id: event.id, name: event.name } : undefined,
            message: `Already checked in: ${attendee.firstName} ${attendee.lastName}`,
          },
          409
        );
      }
      if (attendee.eventId) {
        const access = await requireEventAccess(context, String(attendee.eventId));
        if (access instanceof Response) return access;
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
          return errorResponse('Attendee not found', 404);
        }
        logCheckInAttempt({ ip, outcome: 'replay_attempt', attendeeId, eventId: latest.eventId });
        return json(
          {
            alreadyCheckedIn: true,
            attendee: latest,
            event: event ? { id: event.id, name: event.name } : undefined,
            message: `Already checked in: ${latest.firstName} ${latest.lastName}`,
          },
          409
        );
      }
      const event = updated.eventId
        ? await getEventById(updated.eventId as string)
        : null;
      logCheckInAttempt({ ip, outcome: 'success', attendeeId: updated.id, eventId: updated.eventId });
      return json({
        success: true,
        event: event ? { id: event.id, name: event.name } : undefined,
        attendee: updated,
        message: `${updated.firstName} ${updated.lastName} checked in successfully!`,
      });
    }

    // QR code check-in
    const validation = validateCheckIn(rawBody);
    if (!validation.success) {
      logCheckInAttempt({ ip, outcome: 'invalid_format' });
      return json({ error: 'Validation failed', details: validation.errors }, 400);
    }

    const { qrData, scannerEventId, scannerDeviceId } = validation.data;

    // Demo codes: canned responses for staff testing (never touch DB).
    // ME-5: In production require both ENABLE_DEMO_CODES and ENABLE_DEMO_CODES_IN_PRODUCTION.
    const normalized = qrData.replace(/\uFEFF/g, '').trim();
    const isProduction = import.meta.env.PROD || process.env.NODE_ENV === 'production';
    const demoCodesEnabled =
      !isProduction ||
      (process.env.ENABLE_DEMO_CODES === 'true' &&
        process.env.ENABLE_DEMO_CODES_IN_PRODUCTION === 'true');
    if (demoCodesEnabled) {
      const demoResponses: Record<string, { body: object; status?: number }> = {
        'DEMO-SUCCESS': {
          body: {
            success: true,
            event: { id: 'demo', name: 'Demo Event' },
            attendee: { id: 'demo-attendee', firstName: 'Demo', lastName: 'Guest', email: 'demo@example.com', checkedIn: true },
            message: 'Demo Guest checked in successfully!',
          },
        },
        'DEMO-ALREADY': {
          body: {
            alreadyCheckedIn: true,
            event: { id: 'demo', name: 'Demo Event' },
            attendee: { id: 'demo-attendee', firstName: 'Demo', lastName: 'Guest', email: 'demo@example.com', checkedIn: true },
            message: 'Already checked in: Demo Guest',
          },
          status: 409,
        },
        'DEMO-INVALID': {
          body: { error: 'Invalid or expired QR code' },
          status: 401,
        },
      };
      const demo = demoResponses[normalized];
      if (demo) {
        console.log(
          '[Demo Check-In]',
          normalized,
          isProduction ? '- triggered (demo codes enabled for production)' : '- triggered in dev environment'
        );
        logCheckInAttempt({ ip, outcome: `demo_${normalized.toLowerCase().replace('demo-', '')}` as any });
        return json(demo.body, demo.status ?? 200);
      }
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
      return errorResponse('Invalid QR code format');
    }

    if (eventId !== scannerEventId) {
      logCheckInAttempt({ ip, outcome: 'wrong_scanner_event', eventId, entryId });
      return json({ error: 'This QR code is for a different event.' }, 403);
    }

    const event = await getEventById(eventId);
    if (!event) {
      logCheckInAttempt({ ip, outcome: 'not_found', eventId, entryId });
      return errorResponse('Event not found', 404);
    }
    const eventAccess = await requireEventAccess(context, eventId);
    if (eventAccess instanceof Response) return eventAccess;

    const attendee = await findAttendeeByEventAndToken(eventId, entryId, token);
    if (!attendee) {
      const existing = await getAttendeeById(entryId);
      if (existing?.eventId !== eventId) {
        logCheckInAttempt({ ip, outcome: 'invalid_or_expired', attendeeId: entryId });
        return errorResponse('Invalid or expired QR code', 401);
      }
      if (existing?.qrUsedAt || existing?.checkedIn) {
        logCheckInAttempt({ ip, outcome: 'replay_attempt', attendeeId: entryId });
        const message = existing
          ? `Already checked in: ${existing.firstName} ${existing.lastName}`
          : 'QR code already used';
        return json(
          {
            alreadyCheckedIn: true,
            attendee: existing,
            event: { id: event.id, name: event.name },
            message,
          },
          409
        );
      }
      if (existing?.qrExpiresAt && new Date(existing.qrExpiresAt as string) < new Date()) {
        return errorResponse('QR code expired', 410);
      }
      logCheckInAttempt({ ip, outcome: 'invalid_or_expired', attendeeId: entryId });
      return errorResponse('Invalid or expired QR code', 401);
    }

    const updated = await checkInAttendeeWithTokenScoped(
      eventId,
      entryId,
      token,
      scannerDeviceId ?? null
    );
    logCheckInAttempt({ ip, outcome: 'success', attendeeId: updated.id, eventId });
    return json({
      success: true,
      event: { id: event.id, name: event.name },
      attendee: updated,
      message: `${updated.firstName} ${updated.lastName} checked in successfully!`,
    });
  } catch (err) {
    console.error('POST /api/checkin', err);
    logCheckInAttempt({ ip, outcome: 'error' });
    return errorResponse('Failed to process check-in', 500);
  }
};
