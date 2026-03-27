import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../lib/api-response';
import { getAttendeeByIdForUser } from '../../lib/db';
import { sendQRCodeEmail } from '../../lib/email';
import { requireEventManage, requireUserId } from '../../lib/access';
import { getEnv } from '../../lib/env';

const RESEND_LINK = 'https://resend.com/api-keys';

/** Max size for base64 data URL (roughly 100KB for QR code PNG) */
const MAX_QR_BASE64_LENGTH = 100 * 1024;

/**
 * Validates that the QR base64 string is a valid data URL format.
 * ME-3: Prevents embedding of large payloads or invalid formats in emails.
 */
function isValidQRCodeBase64(value: string): { valid: true } | { valid: false; error: string } {
  if (typeof value !== 'string') {
    return { valid: false, error: 'QR code must be a string' };
  }

  if (value.length > MAX_QR_BASE64_LENGTH) {
    return { valid: false, error: 'QR code data exceeds maximum size' };
  }

  // Must be a valid data URL format for PNG or SVG
  const validPattern = /^data:image\/(png|svg\+xml|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  if (!validPattern.test(value)) {
    return { valid: false, error: 'Invalid QR code format: must be a valid base64 data URL' };
  }

  return { valid: true };
}

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

    // ME-3: Validate QR base64 format and size before processing
    const validation = isValidQRCodeBase64(qrCodeBase64);
    if (!validation.valid) {
      return errorResponse(validation.error, 400);
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
