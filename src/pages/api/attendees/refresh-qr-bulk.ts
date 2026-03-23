import type { APIRoute } from 'astro';
import { errorResponse, json } from '../../../lib/api-response';
import { getAllAttendeesForUser } from '../../../lib/db';
import { getOrCreateQRPayload } from '../../../lib/qr-token';
import { requireEventManage, requireUserId } from '../../../lib/access';

/**
 * Bulk refresh QR tokens for an event.
 * Use this to regenerate all QRs with new settings (e.g., after optimizing for phone-to-phone scanning).
 * This invalidates old QR screenshots but ensures all codes use latest generation settings.
 */
export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  try {
    const { request } = context;
    const { eventId, confirm } = ((await request.json()) || {}) as {
      eventId?: string;
      confirm?: boolean;
    };

    if (!confirm) {
      return json(
        {
          error: 'Confirmation required',
          message:
            'This will invalidate all existing QR codes for the event. Attendees with screenshots or saved images will need new codes. Set confirm: true to proceed.',
        },
        400
      );
    }
    if (!eventId) {
      return errorResponse('eventId is required');
    }
    const manage = await requireEventManage(context, eventId);
    if (manage instanceof Response) return manage;

    // Get attendees
    const attendees = await getAllAttendeesForUser(userId, eventId);

    if (attendees.length === 0) {
      return errorResponse('No attendees found', 404);
    }

    // Refresh QRs in batches
    const results = { refreshed: 0, failed: 0, errors: [] as string[] };
    const BATCH_SIZE = 10;

    for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
      const batch = attendees.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (attendee) => {
          try {
            await getOrCreateQRPayload(attendee.id, eventId || attendee.eventId || undefined);
            results.refreshed++;
          } catch (err) {
            results.failed++;
            results.errors.push(
              `Failed for ${attendee.id}: ${err instanceof Error ? err.message : 'Unknown error'}`
            );
          }
        })
      );

      // Small delay between batches
      if (i + BATCH_SIZE < attendees.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return json({
      success: true,
      refreshed: results.refreshed,
      failed: results.failed,
      total: attendees.length,
      errors: results.errors.slice(0, 10),
    });
  } catch (err) {
    console.error('[refresh-qr-bulk]', err);
    return errorResponse(err instanceof Error ? err.message : 'Bulk refresh failed', 500);
  }
};
