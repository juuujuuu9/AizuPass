import type { APIRoute } from 'astro';
import { getAttendeeById, getEventById } from '../../../lib/db';
import { sendQRCodeEmail } from '../../../lib/email';
import { generateQRCodeBase64 } from '../../../lib/qr-client';
import { QR_GENERATION } from '../../../config/qr';
import { getOrCreateQRPayload } from '../../../lib/qr-token';
import { requireEventManage } from '../../../lib/access';

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
      return new Response(
        JSON.stringify({ error: 'attendeeIds array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: 'eventId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const event = await getEventById(eventId);
    if (!event) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const manage = await requireEventManage(context, eventId);
    if (manage instanceof Response) return manage;

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as { attendeeId: string; error: string }[],
    };

    // Resend rate limit: 2 requests per second. Process sequentially with 550ms spacing.
    const RESEND_DELAY_MS = 550;
    for (const attendeeId of attendeeIds) {
      try {
        const attendee = await getAttendeeById(attendeeId);
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

        const qrCodeBase64 = await generateQRCodeBase64(qrResult.qrPayload, {
          width: QR_GENERATION.width,
          margin: QR_GENERATION.margin,
          errorCorrectionLevel: QR_GENERATION.errorCorrectionLevel,
          color: QR_GENERATION.color,
        });

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

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.sent,
        failed: results.failed,
        total: attendeeIds.length,
        errors: results.errors.slice(0, 5), // Limit errors returned
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[send-bulk-qr]', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Bulk send failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
