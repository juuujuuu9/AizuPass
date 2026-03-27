import type { APIRoute } from 'astro';
import crypto from 'crypto';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { generateQRCodeBase64 } from '../../../lib/qr-client';
import {
  getEventBySlug,
  createAttendee,
  findAttendeeByEventAndMicrositeId,
} from '../../../lib/db';
import { encodeQR } from '../../../lib/qr';
import { generateQRToken } from '../../../lib/qr-token';
import { sendQRCodeEmail } from '../../../lib/email';
import { updateAttendeeQRToken } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { json, errorResponse } from '../../../lib/api-response';

export const prerender = false;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h default for webhook-created QRs

function getWebhookKey(): string {
  return getEnv('MICROSITE_WEBHOOK_KEY') || '';
}

/**
 * Timing-safe comparison for webhook key to prevent timing attacks.
 * Uses crypto.timingSafeEqual to compare secrets in constant time.
 */
function isValidWebhookKey(authHeader: string | null, expectedKey: string): boolean {
  if (!authHeader || !expectedKey) return false;

  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return false;

  const providedKey = authHeader.slice(prefix.length);

  // Prevent timing attacks: compare in constant time using timingSafeEqual
  // We must compare equal-length buffers, so we use the key length as reference
  try {
    const expectedBuffer = Buffer.from(expectedKey);
    const providedBuffer = Buffer.from(providedKey);

    // If lengths differ, we still want to run a comparison to avoid leaking length info
    // but we know it will fail. We compare against a dummy buffer of the same length
    // to keep timing consistent.
    if (expectedBuffer.length !== providedBuffer.length) {
      // Compare against a dummy buffer of the expected length to prevent length leak
      const dummyBuffer = Buffer.alloc(expectedBuffer.length);
      // This comparison will always fail but takes the same time as a real comparison
      crypto.timingSafeEqual(expectedBuffer, dummyBuffer);
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

function parseName(name: string): { firstName: string; lastName: string } {
  const trimmed = (name || '').trim();
  const space = trimmed.indexOf(' ');
  if (space <= 0) return { firstName: trimmed || 'Guest', lastName: '' };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) };
}

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('Authorization');
  const key = getWebhookKey();
  if (!isValidWebhookKey(auth, key)) {
    return errorResponse('Unauthorized', 401);
  }

  const ip = getClientIp(request);
  const rate = await checkRateLimit(`ingest:${ip}`, { maxAttempts: 60 });
  if (!rate.allowed) {
    return json(
      { error: 'Too many requests. Please try again later.' },
      429,
      rate.retryAfterSec != null ? { 'Retry-After': String(rate.retryAfterSec) } : undefined
    );
  }

  try {
    const body = (await request.json()) as {
      eventSlug?: string;
      micrositeEntryId?: string;
      name?: string;
      email?: string;
      sourceData?: Record<string, unknown>;
      generateQR?: boolean;
      sendEmail?: boolean;
    };

    const eventSlug = body?.eventSlug;
    const micrositeEntryId = body?.micrositeEntryId ?? null;
    const name = (body?.name ?? '').trim();
    const email = (body?.email ?? '').trim();
    const sourceData = body?.sourceData ?? {};
    const generateQR = Boolean(body?.generateQR);
    const sendEmail = Boolean(body?.sendEmail);

    if (!eventSlug || !email) {
      return errorResponse('eventSlug and email are required');
    }

    const event = await getEventBySlug(eventSlug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    if (micrositeEntryId) {
      const existing = await findAttendeeByEventAndMicrositeId(event.id, micrositeEntryId);
      if (existing) {
        let qrPayload: string | null = null;
        let refreshed = false;
        const isExpired = !existing.qr_expires_at || new Date(existing.qr_expires_at) < new Date();

        if (generateQR && isExpired) {
          const newToken = generateQRToken();
          const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
          await updateAttendeeQRToken(existing.id, newToken, expiresAt);
          qrPayload = encodeQR(event.id, existing.id, newToken);
          refreshed = true;
        } else if (existing.qr_token && existing.qr_expires_at && new Date(existing.qr_expires_at) > new Date()) {
          qrPayload = encodeQR(event.id, existing.id, existing.qr_token);
        }

        // On Vercel, process.env is the runtime source of truth
        const baseUrl = getEnv('PUBLIC_APP_URL') || '';
        return json({
          entryId: existing.id,
          qrPayload,
          qrUrl: qrPayload && baseUrl ? `${baseUrl.replace(/\/$/, '')}/qr/${encodeURIComponent(qrPayload)}` : null,
          existing: true,
          refreshed,
        });
      }
    }

    const { firstName, lastName } = parseName(name);
    const attendee = await createAttendee({
      firstName,
      lastName,
      email,
      eventId: event.id,
      micrositeEntryId: micrositeEntryId ?? undefined,
      sourceData,
    });

    let qrPayload: string | null = null;
    if (generateQR) {
      const token = generateQRToken();
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
      await updateAttendeeQRToken(attendee.id, token, expiresAt);
      qrPayload = encodeQR(event.id, attendee.id, token);
    }

    if (sendEmail && qrPayload) {
      const dataUrl = await generateQRCodeBase64(qrPayload);
      await sendQRCodeEmail(
        {
          firstName: attendee.firstName as string,
          lastName: attendee.lastName as string,
          email: attendee.email as string,
          rsvpAt: attendee.rsvpAt as string,
        },
        dataUrl
      );
    }

    // On Vercel, process.env is the runtime source of truth
    const baseUrl = getEnv('PUBLIC_APP_URL') || '';
    return json({
      entryId: attendee.id,
      qrPayload,
      qrUrl: qrPayload && baseUrl ? `${baseUrl.replace(/\/$/, '')}/qr/${encodeURIComponent(qrPayload)}` : null,
    });
  } catch (err) {
    console.error('POST /api/ingest/entry', err);
    return errorResponse('Failed to process webhook', 500);
  }
};
