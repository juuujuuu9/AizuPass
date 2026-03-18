import type { APIRoute } from 'astro';
import {
  createOrganizationForOwner,
  getEventForOrganization,
  getOrganizationByOwnerUserId,
  getOrganizationForUser,
} from '../../../lib/db';
import { requireUserId } from '../../../lib/access';

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    const owned = await getOrganizationByOwnerUserId(userId);
    const joined = owned ?? (await getOrganizationForUser(userId));
    if (!joined) {
      return new Response(JSON.stringify({ organization: null, event: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const event = await getEventForOrganization(joined.id);
    return new Response(JSON.stringify({ organization: joined, event }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/organizations', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch organization' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;

  try {
    const body = (await context.request.json()) as { name?: string };
    const name = String(body?.name ?? '').trim();
    if (!name) {
      return new Response(JSON.stringify({ error: 'Organization name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const organization = await createOrganizationForOwner(userId, name);
    return new Response(JSON.stringify({ organization }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return new Response(JSON.stringify({ error: 'You already have an organization' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('POST /api/organizations', err);
    return new Response(JSON.stringify({ error: 'Failed to create organization' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
