import { clerkMiddleware, createRouteMatcher, clerkClient } from '@clerk/astro/server';
import { ensureUserRow, getUserAccessSummary, isUserProfileComplete } from './lib/db';

// Routes that never require authentication.
// Everything else requires sign-in; org/event scope is enforced per page/API.
const isPublicRoute = createRouteMatcher([
  '/login',
  '/signup',
  '/invite/accept',
  '/api/webhooks/(.*)',
  '/api/health',
  '/api/auth/(.*)',
  '/_astro/(.*)',
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
]);

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const { userId, sessionClaims } = auth();
  const { url, request, redirect, locals } = context;
  const pathname = url.pathname;

  // Get email from session claims (provider-dependent key naming)
  let email =
    (sessionClaims?.email as string | undefined) ??
    (sessionClaims?.email_address as string | undefined);

  // Fallback: fetch user from Clerk if email not in session claims
  if (userId && !email) {
    try {
      const user = await clerkClient(context).users.getUser(userId);
      email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    } catch {
      // Ignore errors, email will remain null
    }
  }

  const summary = userId
    ? await getUserAccessSummary(userId)
    : { hasMembership: false, hasOrganizerRole: false, organizationCount: 0, eventCount: 0 };

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
    process.env.NODE_ENV !== 'production' &&
    process.env.BYPASS_AUTH_FOR_TESTS === 'true' &&
    request.headers.get('X-Test-Mode') === '1';
  if (testBypass) {
    locals.user = {
      id: 'test-user',
      email: 'test@example.com',
      role: 'organizer',
    };
    locals.isStaff = true;
    locals.isAdmin = true;
    locals.isScanner = true;
    locals.hasOrganization = true;
    locals.hasEvent = true;
  }

  let profileComplete = true;
  const uidForProfile = testBypass ? '' : userId ?? '';
  const emailForProfile = testBypass ? null : (email ?? null);
  if (uidForProfile && !testBypass) {
    try {
      await ensureUserRow(uidForProfile, emailForProfile);
      profileComplete = await isUserProfileComplete(uidForProfile);
    } catch (err) {
      // e.g. `users` table missing — fail open until migration is applied
      console.error('[middleware] user profile sync', err);
      profileComplete = true;
    }
  }
  locals.profileComplete = testBypass ? true : profileComplete;

  // Public routes + RSVP POST (unauthenticated form submission)
  if (isPublicRoute(context.request)) {
    if (uidForProfile && !testBypass && !profileComplete && pathname.startsWith('/invite/accept')) {
      const returnTo = encodeURIComponent(pathname + url.search);
      return redirect(`/onboarding/profile?returnTo=${returnTo}`);
    }
    return next();
  }
  if (pathname === '/api/attendees' && request.method === 'POST') return next();

  // Everything else requires authentication
  if (!userId && !testBypass) {
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const returnTo = encodeURIComponent(pathname + url.search);
    return redirect(`/login?returnTo=${returnTo}&required=auth`);
  }

  if (!testBypass && userId && !profileComplete) {
    const allowedIncomplete =
      pathname === '/onboarding/profile' || pathname.startsWith('/api/me/profile');
    if (!allowedIncomplete) {
      if (pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: 'Complete your profile first', code: 'profile_incomplete' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const returnTo = encodeURIComponent(pathname + url.search);
      return redirect(`/onboarding/profile?returnTo=${returnTo}`);
    }
  }

  return next();
});
