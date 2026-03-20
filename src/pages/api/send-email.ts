import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
import { getAttendeeByIdForUser } from '../../lib/db';
import { sendQRCodeEmail } from '../../lib/email';
import { requireEventManage, requireUserId } from '../../lib/access';
import { getEnv } from '../../lib/env';

const RESEND_LINK = 'https://resend.com/api-keys';

export const GET: APIRoute = () => {
  const configured = Boolean(getEnv('RESEND_API_KEY'));
  return json({ configured, link: RESEND_LINK });
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  try {
    const { attendeeId, qrCodeBase64 } =
      ((await request.json()) || {}) as { attendeeId?: string; qrCodeBase64?: string };
    if (!attendeeId || !qrCodeBase64) {
      return errorResponse('Attendee ID and QR code are required');
    }
    const attendee = await getAttendeeByIdForUser(attendeeId, userId);
    if (!attendee || !attendee.eventId) {
      return errorResponse('Attendee not found', 404);
    }
    const manage = await requireEventManage(context, String(attendee.eventId));
    if (manage instanceof Response) return manage;
    const result = await sendQRCodeEmail(attendee, qrCodeBase64);
    if (result.success) {
      return json({ success: true });
    }
    return errorResponse(result.error || 'Failed to send email', 500);
  } catch (err) {
    console.error('POST /api/send-email', err);
    return errorResponse('Failed to send email', 500);
  }
};
