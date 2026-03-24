import type { APIRoute } from 'astro';
import { requireUserId } from '../../../lib/access';
import { updateUserProfile } from '../../../lib/db';
import { json, errorResponse } from '../../../lib/api-response';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  return json({ ok: true });
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    const body = (await context.request.json()) as {
      firstName?: string;
      lastName?: string;
    };
    const firstName = String(body?.firstName ?? '').trim();
    const lastName = String(body?.lastName ?? '').trim();
    if (!firstName || !lastName) {
      return errorResponse('First name and last name are required');
    }
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
