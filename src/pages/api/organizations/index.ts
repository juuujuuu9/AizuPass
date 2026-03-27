import type { APIRoute } from 'astro';
import {
  createOrganizationForOwner,
  getEventForOrganization,
  getOrganizationByOwnerUserId,
  getOrganizationForUser,
} from '../../../lib/db';
import { requireUserId } from '../../../lib/access';
import { json, errorResponse } from '../../../lib/api-response';
import { organizationCreationSchema, validateRequestBody } from '../../../lib/validation';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    const owned = await getOrganizationByOwnerUserId(userId);
    const joined = owned ?? (await getOrganizationForUser(userId));
    if (!joined) {
      return json({ organization: null, event: null });
    }
    const event = await getEventForOrganization(joined.id);
    return json({ organization: joined, event });
  } catch (err) {
    console.error('GET /api/organizations', err);
    return errorResponse('Failed to fetch organization', 500);
  }
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    // ME-12: Use Zod validation instead of manual checks
    const body = (await context.request.json()) as Record<string, unknown>;
    const validation = validateRequestBody(organizationCreationSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }
    const { name } = validation.data;

    const organization = await createOrganizationForOwner(userId, name);
    return json({ organization }, 201);
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return errorResponse('You already have an organization', 409);
    }
    console.error('POST /api/organizations', err);
    return errorResponse('Failed to create organization', 500);
  }
};
