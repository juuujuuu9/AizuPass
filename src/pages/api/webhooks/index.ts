import type { APIRoute } from 'astro';
import { json } from '../../../lib/api-response';
import { getEnv } from '../../../lib/env';

export const GET: APIRoute = () => {
  const baseUrl = getEnv('PUBLIC_APP_URL') || 'https://your-domain.com';

  return json({
    webhooks: {
      resend: {
        url: `${baseUrl}/api/webhooks/resend`,
        events: ['email.bounced', 'email.complained', 'email.delivered'],
        configured: Boolean(getEnv('RESEND_WEBHOOK_SECRET')),
      },
    },
    setup: {
      resend_dashboard: 'https://resend.com/webhooks',
      instructions: [
        'Go to Resend Dashboard → Webhooks',
        `Add endpoint: ${baseUrl}/api/webhooks/resend`,
        'Select events: email.bounced, email.complained',
        'Set RESEND_WEBHOOK_SECRET environment variable',
      ],
    },
  });
};
