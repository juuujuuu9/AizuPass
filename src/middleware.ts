import { defineMiddleware } from 'astro:middleware';
import { clerkMiddleware, getAuth } from '@clerk/astro/server';
import { getStaffRole } from './lib/staff';

const PUBLIC_PATH_PATTERNS = [
  /^\/login$/,
  /^\/api\/webhooks\//,
  /^\/_astro\//,
  /^\/favicon\.(ico|png|svg)$/,
];

const STAFF_PAGE_PATTERNS = [/^\/$/, /^\/admin(\/|$)/, /^\/scanner(\/|$)/, /^\/demo-codes(\/|$)/];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((p) => p.test(pathname));
}

function isStaffPage(pathname: string): boolean {
  return STAFF_PAGE_PATTERNS.some((p) => p.test(pathname));
}

function isStaffOnlyApi(pathname: string, method: string): boolean {
  if (pathname.startsWith('/api/webhooks/')) return false; // webhooks have their own auth
  if (pathname.startsWith('/api/attendees')) return true;
  if (pathname === '/api/checkin' && method === 'POST') return true;
  if (pathname === '/api/send-email' && (method === 'GET' || method === 'POST')) return true;
  if (pathname === '/api/attendees/refresh-qr' && method === 'POST') return true;
  if (pathname === '/api/attendees/import' && method === 'POST') return true;
  if (pathname === '/api/attendees/export' && method === 'GET') return true;
  if (pathname.startsWith('/api/events')) return true;
  if (pathname === '/api/update-last-event' && method === 'POST') return true;
  return false;
}

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

// Clerk middleware wrapper
const clerk = clerkMiddleware();

export const onRequest = defineMiddleware(async (context, next) => {
  // First, run Clerk middleware
  const clerkResult = await clerk(context, async () => {
    // This inner function runs after Clerk sets up auth
    const { url, request, redirect, locals } = context;
    const pathname = url.pathname;
    const method = request.method;

    // Get auth from Clerk
    const auth = getAuth(context);
    const userId = auth?.userId;
    const email = auth?.sessionClaims?.email as string | undefined;

    // Determine role based on staff.ts logic
    const role = getStaffRole(email);

    // Set locals (mirroring previous auth-astro structure)
    locals.user = userId
      ? {
          id: userId,
          email: email ?? null,
          role: role ?? 'staff', // default to staff if authenticated but no specific role
        }
      : null;
    locals.isStaff = !!role && ['admin', 'scanner', 'staff'].includes(role);
    locals.isAdmin = role === 'admin';
    locals.isScanner = role === 'scanner' || role === 'admin';

    // Dev-only: bypass auth when BYPASS_AUTH_FOR_TESTS and X-Test-Mode: 1 present
    const testBypass =
      process.env.BYPASS_AUTH_FOR_TESTS === 'true' &&
      request.headers.get('X-Test-Mode') === '1';
    if (testBypass) {
      locals.isStaff = true;
      locals.isAdmin = true;
      locals.isScanner = true;
    }

    // Check access for protected paths
    if (isPublicPath(pathname)) {
      return next();
    }

    if (isStaffPage(pathname) || isStaffOnlyApi(pathname, method)) {
      if (!locals.isStaff && !testBypass) {
        if (isApiRequest(pathname)) {
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

  return clerkResult;
});
