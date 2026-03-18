import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const timestamp = new Date().toISOString();

  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp,
      version: process.env.npm_package_version || '0.0.1',
      environment: process.env.NODE_ENV || 'production',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
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
