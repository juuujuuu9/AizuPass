import type { APIRoute } from 'astro';
import { errorResponse, json } from '../../../lib/api-response';
import { getOrCreateQRPayload } from '../../../lib/qr-token';
import { getAttendeeByIdForUser } from '../../../lib/db';
import { requireEventManage, requireUserId } from '../../../lib/access';

export const POST: APIRoute = async (context) => {
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

    const result = await getOrCreateQRPayload(id, String(attendee.eventId));
    if (!result) {
      return errorResponse('Attendee not found', 404);
    }

    return json({ qrPayload: result.qrPayload, expiresAt: result.expiresAt.toISOString() });
  } catch (err) {
    console.error('POST /api/attendees/refresh-qr', err);
    return errorResponse('Failed to generate QR payload', 500);
  }
};
