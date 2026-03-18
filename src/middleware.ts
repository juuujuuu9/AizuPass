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

export const onRequest = clerkMiddleware((auth, context, next) => {
  const { userId, sessionClaims } = auth();
  const { url, request, redirect, locals } = context;
  const pathname = url.pathname;
  const method = request.method;

  // Get email from session claims (provider-dependent key naming)
  const email =
    (sessionClaims?.email as string | undefined) ??
    (sessionClaims?.email_address as string | undefined);

  // Role assignment:
  // - admin from ADMIN_EMAILS
  // - scanner from SCANNER_EMAILS (or default scanner when allowlist is unset)
  // - staff = authenticated but not authorized for scanner/admin surfaces
  const role = userId ? getStaffRole(email) ?? 'staff' : null;

  // Set locals (mirroring previous auth-astro structure)
  locals.user = userId
    ? {
        id: userId,
        email: email ?? null,
        role: role ?? 'staff',
      }
    : null;
  locals.isStaff = role === 'admin' || role === 'scanner';
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

  const isWebhook = pathname.startsWith('/api/webhooks/');

  const requireRole = (required: 'scanner' | 'admin') => {
    if (testBypass || isWebhook) return null;
    if (required === 'admin' && locals.isAdmin) return null;
    if (required === 'scanner' && locals.isScanner) return null;
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: required === 'admin' ? 'Admin role required' : 'Scanner role required' }),
        { status: userId ? 403 : 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const returnTo = encodeURIComponent(pathname + url.search);
    const tag = required === 'admin' ? 'admin' : 'scanner';
    return redirect(`/login?returnTo=${returnTo}&required=${tag}`);
  };

  // Scanner surfaces
  if (pathname === '/' || pathname.startsWith('/scanner') || pathname.startsWith('/demo-codes')) {
    const denied = requireRole('scanner');
    if (denied) return denied;
    return next();
  }

  // Admin surfaces
  if (pathname.startsWith('/admin')) {
    const denied = requireRole('admin');
    if (denied) return denied;
    return next();
  }

  // Scanner APIs: check-in + attendee lookup/cache only.
  const isScannerApi =
    (pathname === '/api/checkin' && method === 'POST') ||
    (pathname === '/api/attendees' && method === 'GET') ||
    (pathname === '/api/attendees/offline-cache' && method === 'GET');
  if (isScannerApi) {
    const denied = requireRole('scanner');
    if (denied) return denied;
    return next();
  }

  // Admin APIs: event management/import/export/email/preferences and attendee writes.
  const isAdminApi =
    pathname.startsWith('/api/send-email') ||
    pathname.startsWith('/api/events') ||
    pathname === '/api/update-last-event' ||
    pathname.startsWith('/api/attendees/import') ||
    pathname.startsWith('/api/attendees/export') ||
    pathname.startsWith('/api/attendees/refresh-qr') ||
    pathname.startsWith('/api/attendees/refresh-qr-bulk') ||
    pathname.startsWith('/api/attendees/send-bulk-qr') ||
    (pathname === '/api/attendees' && method !== 'GET');
  if (isAdminApi) {
    const denied = requireRole('admin');
    if (denied) return denied;
    return next();
  }

  if (isStaffRoute(context.request) && !locals.isStaff && !testBypass && !isWebhook) {
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const returnTo = encodeURIComponent(pathname + url.search);
    return redirect(`/login?returnTo=${returnTo}&required=staff`);
  }

  // Default: allow access
  return next();
});
