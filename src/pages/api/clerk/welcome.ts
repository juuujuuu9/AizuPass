import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { ensureUserRow, wasOrganizerWelcomeEmailSent, recordOrganizerWelcomeEmailSent } from '../../../lib/db';
import { sendOrganizerWelcomeEmail } from '../../../lib/email';
import { getAppBaseUrlFromRequest, getEnv } from '../../../lib/env';
import { json, errorResponse } from '../../../lib/api-response';

/** Server-only; avoids any static routing edge cases on hosts that shadow `/api/webhooks/*`. */
export const prerender = false;

type ClerkEmailAddress = { id: string; email_address: string };

function pickPrimaryEmail(data: Record<string, unknown>): string | null {
  const addresses = data.email_addresses as ClerkEmailAddress[] | undefined;
  if (!addresses?.length) return null;
  const primaryId = data.primary_email_address_id as string | undefined;
  if (primaryId) {
    const primary = addresses.find((a) => a.id === primaryId);
    if (primary?.email_address) return primary.email_address.trim().toLowerCase();
  }
  const first = addresses[0]?.email_address?.trim();
  return first ? first.toLowerCase() : null;
}

export const GET: APIRoute = () => {
  const signingSecretConfigured = Boolean(getEnv('CLERK_WEBHOOK_SIGNING_SECRET'));
  return json({
    ok: true,
    route: 'clerk-organizer-welcome',
    signingSecretConfigured,
    hint: signingSecretConfigured
      ? 'POST is ready for Clerk user.created'
      : 'Set CLERK_WEBHOOK_SIGNING_SECRET (same value as Clerk endpoint Signing Secret)',
  });
};

export const POST: APIRoute = async ({ request }) => {
  const secret = getEnv('CLERK_WEBHOOK_SIGNING_SECRET');
  if (!secret) {
    console.error('POST /api/clerk/welcome: CLERK_WEBHOOK_SIGNING_SECRET is not set');
    return errorResponse('Webhook not configured', 501);
  }

  const payload = await request.text();
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return errorResponse('Missing webhook signature headers', 400);
  }

  let evt: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type: string; data: Record<string, unknown> };
  } catch (e) {
    console.error('POST /api/clerk/welcome: signature verification failed', e);
    return errorResponse(
      'Invalid webhook signature — copy Signing Secret from this exact Clerk endpoint (Production vs Development must match your app)',
      400
    );
  }

  if (evt.type !== 'user.created') {
    return json({ ok: true, ignored: evt.type });
  }

  const userId = String(evt.data.id ?? '');
  if (!userId) {
    return json({ ok: true, skipped: 'no_user_id' });
  }

  const toEmail = pickPrimaryEmail(evt.data);
  if (!toEmail) {
    console.warn(
      '[clerk-welcome] user.created skipped: no_email (check Clerk payload / email_addresses)',
      { userId }
    );
    return json({ ok: true, skipped: 'no_email' });
  }

  const firstNameRaw = evt.data.first_name;
  const firstName =
    typeof firstNameRaw === 'string' && firstNameRaw.trim() ? firstNameRaw.trim() : null;

  try {
    await ensureUserRow(userId, toEmail);
    if (await wasOrganizerWelcomeEmailSent(userId)) {
      return json({ ok: true, skipped: 'already_sent' });
    }

    const base = getAppBaseUrlFromRequest(request);
    if (!base) {
      console.error(
        '[clerk-welcome] Empty base URL for welcome email; set APP_URL or deploy with a valid Host header'
      );
      return errorResponse('Cannot build onboarding link (set APP_URL)', 500);
    }
    const onboardingUrl = `${base}/onboarding/organization`;

    const result = await sendOrganizerWelcomeEmail({
      toEmail,
      firstName,
      onboardingUrl,
    });

    if (!result.success) {
      console.error('POST /api/clerk/welcome: welcome email failed', result.error);
      return errorResponse(result.error || 'Failed to send welcome email', 500);
    }

    await recordOrganizerWelcomeEmailSent(userId);
    return json({ ok: true, sent: true });
  } catch (err) {
    console.error('POST /api/clerk/welcome', err);
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('organizer_welcome_sent_at') ||
      msg.includes('42703') ||
      msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist')
    ) {
      return errorResponse(
        'Database column missing: run pnpm run migrate-organizer-welcome-email against production DATABASE_URL',
        500
      );
    }
    if (msg.includes('DATABASE_URL') || msg.toLowerCase().includes('connect')) {
      return errorResponse('Database connection failed (check DATABASE_URL on Vercel)', 500);
    }
    return errorResponse('Webhook handler failed', 500);
  }
};
