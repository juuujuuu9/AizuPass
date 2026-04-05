import type { APIRoute } from 'astro';
import { errorResponse, json } from '../../../lib/api-response';
import { getAttendeesByIds } from '../../../lib/db';
import { MAX_QR_EXPORT_ATTENDEE_IDS } from '../../../lib/bulk-qr-zip';
import { getQRPayloadForExport } from '../../../lib/qr-token';
import { requireEventManage, requireUserId } from '../../../lib/access';

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    const body = (await context.request.json()) as {
      eventId?: string;
      attendeeIds?: string[];
    };
    const { eventId, attendeeIds } = body;

    if (!eventId?.trim()) {
      return errorResponse('eventId is required', 400);
    }
    if (!attendeeIds || !Array.isArray(attendeeIds) || attendeeIds.length === 0) {
      return errorResponse('attendeeIds must be a non-empty array', 400);
    }
    if (attendeeIds.length > MAX_QR_EXPORT_ATTENDEE_IDS) {
      return errorResponse(
        `At most ${MAX_QR_EXPORT_ATTENDEE_IDS} attendees per request`,
        400
      );
    }

    const manage = await requireEventManage(context, eventId);
    if (manage instanceof Response) return manage;

    const uniqueIds = [...new Set(attendeeIds.map((id) => String(id).trim()).filter(Boolean))];
    const attendees = await getAttendeesByIds(uniqueIds);

    const items: Array<{
      attendeeId: string;
      firstName: string;
      lastName: string;
      qrPayload: string;
      expiresAt: string;
    }> = [];

    for (const id of uniqueIds) {
      const a = attendees.get(id);
      if (!a || a.eventId !== eventId) {
        continue;
      }
      const result = await getQRPayloadForExport(id, eventId);
      if (!result) continue;
      items.push({
        attendeeId: id,
        firstName: a.firstName,
        lastName: a.lastName,
        qrPayload: result.qrPayload,
        expiresAt: result.expiresAt.toISOString(),
      });
    }

    if (items.length === 0) {
      return errorResponse('No matching attendees for this event', 404);
    }

    return json({ items });
  } catch (err) {
    console.error('POST /api/attendees/qr-export-payloads', err);
    return errorResponse('Failed to build QR export', 500);
  }
};
