import type { APIRoute } from 'astro';
import { json, errorResponse } from '../../../lib/api-response';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import crypto from 'crypto';

/**
 * ME-8: Resend webhook endpoint for bounce and complaint handling.
 * HI-1: Proper HMAC signature verification implemented.
 */

function getWebhookSecret(): string {
  return getEnv('RESEND_WEBHOOK_SECRET') || '';
}

function verifyWebhookSignature(payload: string, signature: string | null, secret: string): boolean {
  // HI-1: Fail closed - reject if secret or signature missing
  if (!secret) return false;
  if (!signature) return false;

  // Resend uses HMAC-SHA256 with the secret as the key
  // Signature format: base64-encoded HMAC
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');

  // Timing-safe comparison to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(signature, 'base64');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64');

    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

async function recordEmailEvent(
  email: string,
  eventType: 'bounced' | 'complained' | 'delivered',
  metadata: Record<string, unknown>
): Promise<void> {
  const db = getDb();

  try {
    await db`
      INSERT INTO email_events (
        email, event_type, metadata, created_at
      ) VALUES (
        ${email},
        ${eventType},
        ${JSON.stringify(metadata)}::jsonb,
        NOW()
      )
    `;

    if (eventType === 'bounced' || eventType === 'complained') {
      const bounceType = metadata.bounce_type as string | undefined;
      const isHardBounce = eventType === 'complained' || bounceType === 'hard';

      await db`
        UPDATE attendees
        SET email_bounced = true,
            email_bounce_reason = ${isHardBounce ? 'hard_bounce' : 'soft_bounce'},
            updated_at = NOW()
        WHERE email = ${email.toLowerCase().trim()}
          AND email_bounced = false
      `;
    }
  } catch (err) {
    console.error('[Resend Webhook] Failed to record email event:', err);
  }
}

export async function getEmailStatus(email: string): Promise<{
  canSend: boolean;
  reason?: string;
}> {
  const db = getDb();

  try {
    const bouncedRows = await db`
      SELECT email_bounced, email_bounce_reason
      FROM attendees
      WHERE email = ${email.toLowerCase().trim()}
        AND email_bounced = true
      LIMIT 1
    `;

    if (bouncedRows.length > 0) {
      const reason = bouncedRows[0].email_bounce_reason as string;
      return {
        canSend: false,
        reason: reason === 'complained'
          ? 'Recipient previously marked emails as spam'
          : 'Email address previously bounced',
      };
    }

    const eventRows = await db`
      SELECT event_type, created_at
      FROM email_events
      WHERE email = ${email.toLowerCase().trim()}
        AND event_type IN ('bounced', 'complained')
        AND created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (eventRows.length > 0) {
      const eventType = eventRows[0].event_type as string;
      return {
        canSend: false,
        reason: eventType === 'complained'
          ? 'Recipient marked previous email as spam'
          : 'Recent bounce detected for this address',
      };
    }

    return { canSend: true };
  } catch (err) {
    console.error('[Email Status] Error checking email status:', err);
    // ME-1: Fail closed - don't send if we can't verify status
    return {
      canSend: false,
      reason: 'Unable to verify email status - service temporarily unavailable',
    };
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const secret = getWebhookSecret();
    const signature = request.headers.get('Resend-Signature');
    const body = await request.text();

    if (!verifyWebhookSignature(body, signature, secret)) {
      return errorResponse('Invalid webhook signature', 401);
    }

    const event = JSON.parse(body);
    const eventType = event.type;
    const emailData = event.data;

    if (eventType === 'email.bounced') {
      const toEmails = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
      for (const email of toEmails) {
        if (email) {
          await recordEmailEvent(email, 'bounced', {
            bounce_type: emailData.bounce_type,
            bounce_message: emailData.bounce_message,
            email_id: emailData.email_id,
            subject: emailData.subject,
          });
        }
      }
    }

    else if (eventType === 'email.complained') {
      const toEmails = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
      for (const email of toEmails) {
        if (email) {
          await recordEmailEvent(email, 'complained', {
            email_id: emailData.email_id,
            subject: emailData.subject,
          });
        }
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error('[Resend Webhook] Error:', err);
    return errorResponse('Failed to process webhook', 500);
  }
};
