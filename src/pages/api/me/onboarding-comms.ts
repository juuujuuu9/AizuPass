import type { APIRoute } from 'astro';
import { requireUserId } from '../../../lib/access';
import { updateUserOnboardingComms } from '../../../lib/db';
import { json, errorResponse } from '../../../lib/api-response';
import { onboardingCommsSchema, validateRequestBody } from '../../../lib/validation';

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    const body = (await context.request.json()) as Record<string, unknown>;
    const validation = validateRequestBody(onboardingCommsSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }
    const { emailProductUpdates, emailMarketing } = validation.data;
    await updateUserOnboardingComms(userId, {
      emailProductUpdates,
      emailMarketing,
    });
    return json({ ok: true });
  } catch (err) {
    console.error('POST /api/me/onboarding-comms', err);
    return errorResponse('Failed to save preferences', 500);
  }
};
