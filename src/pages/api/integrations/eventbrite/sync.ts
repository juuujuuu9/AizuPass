import type { APIRoute } from 'astro';
import { requireEventManage, requireUserId } from '../../../../lib/access';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { json, errorResponse } from '../../../../lib/api-response';
import {
  createAttendee,
  findAttendeesByEventAndEmails,
  findAttendeesByEventAndMicrositeIds,
  getAttendeeById,
  getEventSettingsRawForManage,
  mergeEventbriteSettingsForManage,
  updateAttendeeMicrositeEntryId,
  updateAttendeeProfile,
} from '../../../../lib/db';
import { EventbriteApiError, fetchAllEventAttendees } from '../../../../lib/eventbrite';
import { getOrCreateQRPayload } from '../../../../lib/qr-token';

export const prerender = false;

const EB_PREFIX = 'eb:';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  const ip = getClientIp(context.request);
  const rate = await checkRateLimit(`eventbrite-sync:${ip}`, { maxAttempts: 20 });
  if (!rate.allowed) {
    return json(
      { error: 'Too many sync requests. Please try again later.' },
      429,
      rate.retryAfterSec != null ? { 'Retry-After': String(rate.retryAfterSec) } : undefined
    );
  }

  let body: {
    eventId?: string;
    eventbriteEventId?: string;
    privateToken?: string;
    saveCredentials?: boolean;
  };
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON');
  }

  const hubEventId = (body?.eventId ?? '').trim();
  if (!hubEventId) {
    return errorResponse('eventId is required');
  }

  const manageDenied = await requireEventManage(context, hubEventId);
  if (manageDenied instanceof Response) return manageDenied;

  const rawSettings = (await getEventSettingsRawForManage(userId, hubEventId)) ?? {};
  const savedEb = rawSettings.eventbrite;
  const savedObj =
    savedEb && typeof savedEb === 'object' && !Array.isArray(savedEb)
      ? (savedEb as Record<string, unknown>)
      : {};
  const savedEbEventId = typeof savedObj.eventbriteEventId === 'string' ? savedObj.eventbriteEventId.trim() : '';
  const savedToken = typeof savedObj.privateToken === 'string' ? savedObj.privateToken.trim() : '';

  const eventbriteEventId = (body?.eventbriteEventId ?? savedEbEventId).trim();
  const privateToken = (body?.privateToken ?? savedToken).trim();

  if (!eventbriteEventId || !privateToken) {
    return errorResponse(
      'Eventbrite event ID and private token are required (enter them below or save credentials on a previous sync).',
      400
    );
  }

  let ebRows;
  try {
    ebRows = await fetchAllEventAttendees(eventbriteEventId, privateToken);
  } catch (e) {
    if (e instanceof EventbriteApiError) {
      return json(
        {
          error:
            e.status === 401 || e.status === 403
              ? 'Eventbrite rejected the token. Check that your private token is valid and has access to this event.'
              : e.message,
        },
        502
      );
    }
    console.error('POST /api/integrations/eventbrite/sync', e);
    return errorResponse('Eventbrite sync failed', 500);
  }

  const valid = ebRows.filter(
    (row) => !row.cancelled && !row.refunded && String(row.profile?.email ?? '').trim()
  );

  const emails = valid.map((a) => normalizeEmail(String(a.profile?.email)));
  const microIds = valid.map((a) => `${EB_PREFIX}${a.id}`);

  const byMicro = await findAttendeesByEventAndMicrositeIds(hubEventId, microIds);
  const byEmailRows = await findAttendeesByEventAndEmails(hubEventId, emails);
  const byEmail = new Map<string, string>();
  for (const row of byEmailRows) {
    byEmail.set(normalizeEmail(row.email), row.id);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  for (const a of valid) {
    const emailRaw = String(a.profile?.email ?? '').trim();
    const emailNorm = normalizeEmail(emailRaw);
    const microId = `${EB_PREFIX}${a.id}`;
    const firstName = String(a.profile?.first_name ?? '').trim() || 'Guest';
    const lastName = String(a.profile?.last_name ?? '').trim() || '';

    const ebSnapshot = {
      attendeeId: a.id,
      orderId: a.order_id ?? null,
      status: a.status ?? null,
      checkedIn: a.checked_in,
      syncedAt: nowIso,
    };

    let hubAttendeeId = byMicro.get(microId) ?? byEmail.get(emailNorm);

    if (hubAttendeeId) {
      const existingRow = await getAttendeeById(hubAttendeeId);
      const prevSource =
        existingRow?.sourceData &&
        typeof existingRow.sourceData === 'object' &&
        !Array.isArray(existingRow.sourceData)
          ? { ...(existingRow.sourceData as Record<string, unknown>) }
          : {};

      await updateAttendeeProfile(hubAttendeeId, {
        firstName,
        lastName,
        email: emailRaw,
        sourceData: { ...prevSource, eventbrite: ebSnapshot },
      });

      if (existingRow?.micrositeEntryId !== microId) {
        await updateAttendeeMicrositeEntryId(hubAttendeeId, microId);
      }

      byMicro.set(microId, hubAttendeeId);
      byEmail.set(emailNorm, hubAttendeeId);
      updated += 1;
      continue;
    }

    try {
      const newAttendee = await createAttendee({
        eventId: hubEventId,
        firstName,
        lastName,
        email: emailRaw,
        micrositeEntryId: microId,
        sourceData: { eventbrite: ebSnapshot },
        initialCheckedIn: Boolean(a.checked_in),
      });
      await getOrCreateQRPayload(newAttendee.id, hubEventId);
      byMicro.set(microId, newAttendee.id);
      byEmail.set(emailNorm, newAttendee.id);
      created += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
        skipped += 1;
        continue;
      }
      console.error('Eventbrite sync create attendee', err);
      skipped += 1;
    }
  }

  if (body.saveCredentials) {
    await mergeEventbriteSettingsForManage(userId, hubEventId, {
      eventbriteEventId,
      privateToken,
      lastSyncedAt: nowIso,
    });
  }

  return json({
    ok: true,
    created,
    updated,
    skipped,
    eventbriteTotal: ebRows.length,
    eligible: valid.length,
    saveCredentials: Boolean(body.saveCredentials),
  });
};
