import type { APIRoute } from 'astro';
import { errorResponse, json } from '../../../lib/api-response';
import { getAttendeesByIds, getEventById } from '../../../lib/db';
import { sendQRCodeEmail } from '../../../lib/email';
import { generateQRCodeBase64 } from '../../../lib/qr-client';
import { getOrCreateQRPayload } from '../../../lib/qr-token';
import { requireEventManage } from '../../../lib/access';

const MAX_BULK_EMAIL_COUNT = 100;

export const POST: APIRoute = async (context) => {
  try {
    const { request } = context;
    const body = (await request.json()) as {
      attendeeIds?: string[];
      eventId?: string;
      fromName?: string;
      eventName?: string;
    };
    const { attendeeIds, eventId, fromName, eventName } = body;

    if (!attendeeIds || !Array.isArray(attendeeIds) || attendeeIds.length === 0) {
      return errorResponse('attendeeIds array is required');
    }

    // ME-2: Enforce maximum bulk email count to prevent abuse
    if (attendeeIds.length > MAX_BULK_EMAIL_COUNT) {
      return errorResponse(
        `Cannot send more than ${MAX_BULK_EMAIL_COUNT} emails at once. Please batch your requests.`,
        400
      );
    }

    if (!eventId) {
      return errorResponse('eventId is required');
    }

    const event = await getEventById(eventId);
    if (!event) {
      return errorResponse('Event not found', 404);
    }
    const manage = await requireEventManage(context, eventId);
    if (manage instanceof Response) return manage;

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as { attendeeId: string; error: string }[],
    };

    // ME-7: Batch fetch all attendees in a single query
    const attendeesMap = await getAttendeesByIds(attendeeIds);

    // Resend rate limit: 2 requests per second. Process sequentially with 550ms spacing.
    const RESEND_DELAY_MS = 550;
    for (const attendeeId of attendeeIds) {
      try {
        const attendee = attendeesMap.get(attendeeId);
        if (!attendee) {
          results.failed++;
          results.errors.push({ attendeeId, error: 'Attendee not found' });
          continue;
        }
        if (attendee.eventId !== eventId) {
          results.failed++;
          results.errors.push({ attendeeId, error: 'Attendee is not part of this event' });
          continue;
        }

        // Generate proper QR payload (creates and stores token in DB)
        const qrResult = await getOrCreateQRPayload(attendeeId, eventId);
        if (!qrResult) {
          results.failed++;
          results.errors.push({ attendeeId, error: 'Failed to generate QR payload' });
          continue;
        }

        const qrCodeBase64 = await generateQRCodeBase64(qrResult.qrPayload);

        const result = await sendQRCodeEmail(attendee, qrCodeBase64, {
          fromName,
          eventName,
        });
        if (result.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({ attendeeId, error: result.error || 'Unknown error' });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({
          attendeeId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      await new Promise((r) => setTimeout(r, RESEND_DELAY_MS));
    }

    return json({
      success: true,
      sent: results.sent,
      failed: results.failed,
      total: attendeeIds.length,
      errors: results.errors.slice(0, 5),
    });
  } catch (err) {
    console.error('[send-bulk-qr]', err);
    return errorResponse(err instanceof Error ? err.message : 'Bulk send failed', 500);
  }
};
