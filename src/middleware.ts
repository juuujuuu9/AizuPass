import { clerkMiddleware, createRouteMatcher, clerkClient } from '@clerk/astro/server';
import { isPrimaryEmailVerifiedByClerk } from './lib/clerk-primary-email-verified';
import { hasEmailOnboardingPendingCookie } from './lib/onboarding-email-cookie';
import { ensureUserRow, getUserAccessSummary, getUserById } from './lib/db';
import { scheduleWelcomeEmailIfPending } from './lib/welcome-email-followup';

// Routes that never require authentication.
// Everything else requires sign-in; org/event scope is enforced per page/API.
const isPublicRoute = createRouteMatcher([
  '/login',
  '/signup',
  '/onboarding/verify-email',
  '/invite/accept',
  '/api/clerk/welcome',
  '/api/ingest/entry',
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
        firstName: null,
        lastName: null,
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
      firstName: 'Test',
      lastName: 'User',
    };
    locals.isStaff = true;
    locals.isAdmin = true;
    locals.isScanner = true;
    locals.hasOrganization = true;
    locals.hasEvent = true;
  }

  let profileComplete = true;
  let profileFirstName: string | null = null;
  let profileLastName: string | null = null;
  const uidForProfile = testBypass ? '' : userId ?? '';
  const emailForProfile = testBypass ? null : (email ?? null);
  if (uidForProfile && !testBypass) {
    try {
      await ensureUserRow(uidForProfile, emailForProfile);
      const u = await getUserById(uidForProfile);
      const fn = String(u?.firstName ?? '').trim();
      const ln = String(u?.lastName ?? '').trim();
      profileFirstName = fn || null;
      profileLastName = ln || null;
      profileComplete = Boolean(fn && ln);

      if (
        u &&
        !u.organizerWelcomeSentAt &&
        emailForProfile &&
        String(emailForProfile).trim()
      ) {
        scheduleWelcomeEmailIfPending(
          uidForProfile,
          String(emailForProfile).trim(),
          profileFirstName,
          request
        );
      }
    } catch (err) {
      // HI-5: Fail closed — DB outage or missing table should not bypass profile gate
      console.error('[middleware] user profile sync', err);
      profileComplete = false;
      // Set a flag so UI can show appropriate error (maintenance mode / try again)
      locals.profileCheckError = true;
    }
  }
  if (locals.user && uidForProfile && !testBypass) {
    locals.user = {
      ...locals.user,
      firstName: profileFirstName,
      lastName: profileLastName,
    };
  }
  locals.profileComplete = testBypass ? true : profileComplete;

  // Public routes + RSVP POST (unauthenticated form submission)
  if (isPublicRoute(context.request)) {
    if (uidForProfile && !testBypass && !profileComplete && pathname.startsWith('/invite/accept')) {
      const returnTo = encodeURIComponent(pathname + url.search);
      const emailOk = await isPrimaryEmailVerifiedByClerk(context, uidForProfile);
      const pendingCookie = hasEmailOnboardingPendingCookie(request);
      const needVerifyEmailStep = !emailOk || pendingCookie;
      if (needVerifyEmailStep) {
        return redirect(`/onboarding/verify-email?returnTo=${returnTo}`);
      }
      return redirect(`/onboarding/profile?returnTo=${returnTo}`);
    }
    return next();
  }
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

  if (userId && !testBypass && locals.user?.role === 'staff') {
    if (pathname === '/onboarding/organization' || pathname === '/admin/events/new') {
      return redirect('/admin/organization');
    }
  }

  // HI-5: If profile check failed due to DB error, show error page instead of onboarding loop
  if (!testBypass && userId && locals.profileCheckError) {
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable. Please try again.', code: 'profile_check_error' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Only redirect to error page if not already there
    if (pathname !== '/error/profile-check') {
      return redirect('/error/profile-check');
    }
  }

  if (!testBypass && userId && !profileComplete) {
    const emailOk = await isPrimaryEmailVerifiedByClerk(context, userId);
    const pendingCookie = hasEmailOnboardingPendingCookie(request);
    const needVerifyEmailStep = !emailOk || pendingCookie;
    const allowedIncomplete =
      pathname === '/onboarding/continue-onboarding' ||
      pathname === '/error/profile-check' ||
      ((pathname === '/onboarding/profile' || pathname.startsWith('/api/me/profile')) && !needVerifyEmailStep);
    if (!allowedIncomplete) {
      if (pathname.startsWith('/api/')) {
        const body = needVerifyEmailStep
          ? { error: 'Check your email to continue', code: 'email_onboarding_pending' }
          : { error: 'Complete your profile first', code: 'profile_incomplete' };
        return new Response(JSON.stringify(body), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const returnTo = encodeURIComponent(pathname + url.search);
      return redirect(`/onboarding/verify-email?returnTo=${returnTo}`);
    }
  }

  return next();
});
