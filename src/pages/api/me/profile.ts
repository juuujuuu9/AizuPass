import type { APIRoute } from 'astro';
import { requireUserId } from '../../../lib/access';
import { updateUserProfile } from '../../../lib/db';
import { json, errorResponse } from '../../../lib/api-response';
import { profileUpdateSchema, validateRequestBody } from '../../../lib/validation';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  return json({ ok: true });
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    // ME-12: Use Zod validation
    const body = (await context.request.json()) as Record<string, unknown>;
    const validation = validateRequestBody(profileUpdateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }
    const { firstName, lastName } = validation.data;
    await updateUserProfile(userId, {
      firstName,
      lastName,
      email: context.locals.user?.email ?? null,
    });
    return json({ ok: true });
  } catch (err) {
    console.error('POST /api/me/profile', err);
    return errorResponse('Failed to save profile', 500);
  }
};
