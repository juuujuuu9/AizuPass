import {
  wasOrganizerWelcomeEmailSent,
  recordOrganizerWelcomeEmailSent,
  shouldSuppressOrganizerWelcomeEmail,
} from './db';
import { sendOrganizerWelcomeEmail } from './email';
import { getAppBaseUrlFromRequest, getEnv } from './env';

/** Dev-only: avoid parallel middleware invocations sending duplicate welcomes before DB updates. */
const welcomeSendInFlight = new Set<string>();

/**
 * Clerk cannot POST webhooks to localhost. In development, send the same welcome email on the
 * first authenticated request once `users.organizer_welcome_sent_at` is still null (deduped with
 * POST /api/clerk/welcome when using ngrok or in production).
 */
export function scheduleWelcomeEmailIfPending(
  userId: string,
  email: string,
  firstName: string | null,
  request: Request
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!getEnv('RESEND_API_KEY')) return;
  if (welcomeSendInFlight.has(userId)) return;
  welcomeSendInFlight.add(userId);

  void (async () => {
    try {
      if (await wasOrganizerWelcomeEmailSent(userId)) return;
      if (await shouldSuppressOrganizerWelcomeEmail(userId, email)) {
        await recordOrganizerWelcomeEmailSent(userId);
        return;
      }
      const base = getAppBaseUrlFromRequest(request);
      if (!base) {
        console.warn(
          '[welcome-email-followup] skip: empty base URL (set APP_URL for dev or use a real Host header)'
        );
        return;
      }
      const toEmail = email.trim().toLowerCase();
      if (!toEmail) return;

      const result = await sendOrganizerWelcomeEmail({
        toEmail,
        firstName: firstName?.trim() ? firstName.trim() : null,
        onboardingUrl: `${base}/onboarding/organization`,
      });
      if (result.success) await recordOrganizerWelcomeEmailSent(userId);
      else console.error('[welcome-email-followup] send failed:', result.error);
    } catch (e) {
      console.error('[welcome-email-followup]', e);
    } finally {
      welcomeSendInFlight.delete(userId);
    }
  })();
}
