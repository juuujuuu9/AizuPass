import type { APIRoute } from 'astro';
import { json } from '../../lib/api-response';

export const GET: APIRoute = async () => {
  const timestamp = new Date().toISOString();

  return json(
    {
      status: 'ok',
      timestamp,
      version: process.env.npm_package_version || '0.0.1',
      // LO-1: Removed NODE_ENV from response to avoid information leakage
    },
    200,
    { 'Cache-Control': 'no-store, max-age=0' }
  );
};

// Also support HEAD for lightweight health checks
export const HEAD: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
};
