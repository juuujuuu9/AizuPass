import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { getStaffRole } from './lib/staff';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/login',
  '/api/webhooks/(.*)',
  '/_astro/(.*)',
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
]);

// Define staff-only routes
const isStaffRoute = createRouteMatcher([
  '/',
  '/admin(.*)',
  '/scanner(.*)',
  '/demo-codes(.*)',
]);

// Define staff-only API routes
const isStaffApiRoute = createRouteMatcher([
  '/api/attendees(.*)',
  '/api/checkin',
  '/api/send-email',
  '/api/events(.*)',
  '/api/update-last-event',
]);

export const onRequest = clerkMiddleware((auth, context, next) => {
  const { userId, sessionClaims } = auth();
  const { url, request, redirect, locals } = context;
  const pathname = url.pathname;
  const method = request.method;

  // Get email from session claims
  const email = sessionClaims?.email as string | undefined;

  // Determine role based on staff.ts logic
  const role = getStaffRole(email);

  // Set locals (mirroring previous auth-astro structure)
  locals.user = userId
    ? {
        id: userId,
        email: email ?? null,
        role: role ?? 'staff',
      }
    : null;
  locals.isStaff = !!role && ['admin', 'scanner', 'staff'].includes(role);
  locals.isAdmin = role === 'admin';
  locals.isScanner = role === 'scanner' || role === 'admin';

  // Dev-only: bypass auth when BYPASS_AUTH_FOR_TESTS and X-Test-Mode: 1 present
  const testBypass =
    process.env.NODE_ENV === 'development' &&
    process.env.BYPASS_AUTH_FOR_TESTS === 'true' &&
    request.headers.get('X-Test-Mode') === '1';
  if (testBypass) {
    locals.isStaff = true;
    locals.isAdmin = true;
    locals.isScanner = true;
  }

  // Check access for protected paths
  if (isPublicRoute(context.request)) {
    return next();
  }

  // Check staff routes
  if (isStaffRoute(context.request) || isStaffApiRoute(context.request)) {
    // Check for POST/DELETE/PUT methods on API routes
    const isStaffOnlyApi = pathname.startsWith('/api/') &&
      (pathname.startsWith('/api/attendees') ||
        (pathname === '/api/checkin' && method === 'POST') ||
        pathname.startsWith('/api/send-email') ||
        pathname.startsWith('/api/events') ||
        pathname === '/api/update-last-event');

    // Skip auth check for webhook routes
    const isWebhook = pathname.startsWith('/api/webhooks/');

    if ((isStaffOnlyApi || isStaffRoute(context.request)) && !locals.isStaff && !testBypass && !isWebhook) {
      if (pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const returnTo = encodeURIComponent(pathname + url.search);
      return redirect(`/login?returnTo=${returnTo}&required=staff`);
    }
    return next();
  }

  // Default: allow access
  return next();
});
