import { randomBytes } from 'crypto';
import { getAttendeeById, updateAttendeeQRToken, bulkUpdateAttendeeQRTokens, getDefaultEventId } from './db';
import { encodeQR } from './qr';
import { getEnv } from './env';

// Event check-in QRs (including CSV import) must be valid until the event. 15 min broke imported/scanned QRs.
const TTL_DAYS = Number(getEnv('QR_TOKEN_TTL_DAYS') || 7) || 7;
const TOKEN_TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export function generateQRToken(): string {
  return randomBytes(16).toString('hex');
}

export async function getOrCreateQRPayload(
  attendeeId: string,
  eventId?: string
): Promise<{ qrPayload: string; expiresAt: Date } | null> {
  const attendee = await getAttendeeById(attendeeId);
  if (!attendee) return null;

  const resolvedEventId = eventId ?? (attendee.eventId as string | undefined) ?? (await getDefaultEventId());
  const token = generateQRToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await updateAttendeeQRToken(attendeeId, token, expiresAt);

  const qrPayload = encodeQR(resolvedEventId, attendeeId, token);
  return { qrPayload, expiresAt };
}

/**
 * ME-7: Batch generate QR payloads for multiple attendees.
 * Reduces queries from 2N+1 to 2 queries (1 SELECT + 1 UPDATE).
 */
export async function bulkGenerateQRPayloads(
  attendeeIds: string[],
  eventId: string
): Promise<Array<{attendeeId: string; qrPayload: string; token: string}>> {
  if (attendeeIds.length === 0) return [];
  
  // Generate tokens for all attendees
  const updates: Array<{attendeeId: string; token: string; expiresAt: Date}> = [];
  const results: Array<{attendeeId: string; qrPayload: string; token: string}> = [];
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  
  for (const attendeeId of attendeeIds) {
    const token = generateQRToken();
    updates.push({ attendeeId, token, expiresAt });
    results.push({
      attendeeId,
      qrPayload: encodeQR(eventId, attendeeId, token),
      token,
    });
  }
  
  // Single batched UPDATE for all attendees
  await bulkUpdateAttendeeQRTokens(updates);
  
  return results;
}
