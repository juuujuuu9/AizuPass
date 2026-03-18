import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { getUserAccessSummary } from './lib/db';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/login',
  '/api/webhooks/(.*)',
  '/_astro/(.*)',
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
]);

// Define authenticated routes
const isAuthenticatedRoute = createRouteMatcher([
  '/',
  '/admin(.*)',
  '/scanner(.*)',
  '/demo-codes(.*)',
  '/onboarding(.*)',
  '/invite(.*)',
]);

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const { userId, sessionClaims } = auth();
  const { url, request, redirect, locals } = context;
  const pathname = url.pathname;
  const method = request.method;

  // Get email from session claims (provider-dependent key naming)
  const email =
    (sessionClaims?.email as string | undefined) ??
    (sessionClaims?.email_address as string | undefined);

  const summary = userId
    ? await getUserAccessSummary(userId)
    : { hasMembership: false, hasOrganizerRole: false, organizationCount: 0, eventCount: 0 };

  // Set locals from app-managed membership model.
  locals.user = userId
    ? {
        id: userId,
        email: email ?? null,
        role: summary.hasOrganizerRole ? 'organizer' : summary.hasMembership ? 'staff' : 'none',
      }
    : null;
  locals.isStaff = summary.hasMembership;
  locals.isAdmin = summary.hasOrganizerRole;
  locals.isScanner = summary.hasMembership;
  locals.hasOrganization = summary.organizationCount > 0;
  locals.hasEvent = summary.eventCount > 0;

  // Dev-only: bypass auth when BYPASS_AUTH_FOR_TESTS and X-Test-Mode: 1 present
  const testBypass =
    process.env.NODE_ENV === 'development' &&
    process.env.BYPASS_AUTH_FOR_TESTS === 'true' &&
    request.headers.get('X-Test-Mode') === '1';
  if (testBypass) {
    locals.isStaff = true;
    locals.isAdmin = true;
    locals.isScanner = true;
    locals.hasOrganization = true;
    locals.hasEvent = true;
  }

  // Check access for protected paths
  if (isPublicRoute(context.request)) {
    return next();
  }

  const isWebhook = pathname.startsWith('/api/webhooks/');

  const requireAuth = () => {
    if (testBypass || isWebhook) return null;
    if (userId) return null;
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const returnTo = encodeURIComponent(pathname + url.search);
    return redirect(`/login?returnTo=${returnTo}&required=auth`);
  };

  // Scanner + dashboard surfaces require sign-in; org/event scope is enforced per page/API.
  if (pathname === '/' || pathname.startsWith('/scanner') || pathname.startsWith('/demo-codes')) {
    const denied = requireAuth();
    if (denied) return denied;
    return next();
  }

  // Admin and onboarding surfaces require sign-in.
  if (pathname.startsWith('/admin')) {
    const denied = requireAuth();
    if (denied) return denied;
    return next();
  }
  if (pathname.startsWith('/onboarding') || pathname.startsWith('/invite')) {
    const denied = requireAuth();
    if (denied) return denied;
    return next();
  }

  const isProtectedApi =
    pathname === '/api/checkin' ||
    (pathname === '/api/attendees' && method !== 'POST') ||
    pathname.startsWith('/api/attendees/') ||
    pathname.startsWith('/api/send-email') ||
    pathname.startsWith('/api/events') ||
    pathname === '/api/update-last-event' ||
    pathname === '/api/organizations' ||
    pathname.startsWith('/api/organizations/');
  if (isProtectedApi) {
    const denied = requireAuth();
    if (denied) return denied;
    return next();
  }

  if (isAuthenticatedRoute(context.request) && !userId && !testBypass && !isWebhook) {
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const returnTo = encodeURIComponent(pathname + url.search);
    return redirect(`/login?returnTo=${returnTo}&required=auth`);
  }

  // Default: allow access
  return next();
});
