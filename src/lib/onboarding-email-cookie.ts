/** Set on first visit to check-email after sign-up (no session). Cleared via /onboarding/continue-onboarding. */
export const EMAIL_ONBOARDING_PENDING_COOKIE = 'email_onboarding_pending';

export function readCookieValue(request: Request, name: string): string | undefined {
  const raw = request.headers.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function hasEmailOnboardingPendingCookie(request: Request): boolean {
  return readCookieValue(request, EMAIL_ONBOARDING_PENDING_COOKIE) === '1';
}
