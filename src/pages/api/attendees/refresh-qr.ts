import type { APIRoute } from 'astro';
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
      return new Response(
        JSON.stringify({ error: 'Attendee ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const attendee = await getAttendeeByIdForUser(id, userId);
    if (!attendee?.eventId) {
      return new Response(
        JSON.stringify({ error: 'Attendee not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const manage = await requireEventManage(context, String(attendee.eventId));
    if (manage instanceof Response) return manage;

    const result = await getOrCreateQRPayload(id, String(attendee.eventId));
    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Attendee not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ qrPayload: result.qrPayload, expiresAt: result.expiresAt.toISOString() }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('POST /api/attendees/refresh-qr', err);
    return new Response(
      JSON.stringify({ error: 'Failed to generate QR payload' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
