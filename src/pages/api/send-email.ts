import type { APIRoute } from 'astro';
import { getAttendeeByIdForUser } from '../../lib/db';
import { sendQRCodeEmail } from '../../lib/email';
import { requireEventManage, requireUserId } from '../../lib/access';

const RESEND_LINK = 'https://resend.com/api-keys';

export const GET: APIRoute = () => {
  // On Vercel, process.env is the runtime source of truth
  const configured = Boolean(
    (typeof process !== 'undefined' && process.env.RESEND_API_KEY)
    || (typeof import.meta !== 'undefined' && import.meta.env.RESEND_API_KEY)
  );
  return new Response(
    JSON.stringify({ configured, link: RESEND_LINK }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  try {
    const { attendeeId, qrCodeBase64 } =
      ((await request.json()) || {}) as { attendeeId?: string; qrCodeBase64?: string };
    if (!attendeeId || !qrCodeBase64) {
      return new Response(
        JSON.stringify({ error: 'Attendee ID and QR code are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const attendee = await getAttendeeByIdForUser(attendeeId, userId);
    if (!attendee || !attendee.eventId) {
      return new Response(
        JSON.stringify({ error: 'Attendee not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const manage = await requireEventManage(context, String(attendee.eventId));
    if (manage instanceof Response) return manage;
    const result = await sendQRCodeEmail(attendee, qrCodeBase64);
    if (result.success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ error: result.error || 'Failed to send email' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('POST /api/send-email', err);
    return new Response(
      JSON.stringify({ error: 'Failed to send email' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
