/**
 * Production split: marketing on apex (and optional www), product on app subdomain.
 * When PUBLIC_APP_HOST and PUBLIC_MARKETING_HOSTS are unset, all hosts behave as the app (local dev, previews).
 */

function normalizeHost(raw: string): string {
  const first = raw.split(',')[0].trim();
  return first.split(':')[0].toLowerCase();
}

/** Public hostname(s) for the incoming request (Vercel sets x-forwarded-host). */
export function getRequestHost(request: Request): string {
  const xfh = request.headers.get('x-forwarded-host');
  return normalizeHost(xfh ?? request.headers.get('host') ?? '');
}

function parseMarketingHosts(): string[] {
  const raw = process.env.PUBLIC_MARKETING_HOSTS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => normalizeHost(s))
    .filter(Boolean);
}

export function siteHostSplitEnabled(): boolean {
  const app = process.env.PUBLIC_APP_HOST?.trim().toLowerCase();
  const marketing = parseMarketingHosts();
  return Boolean(app && marketing.length > 0);
}

/** True when this request should show the marketing homepage at `/` (and related public pages). */
export function isMarketingHost(host: string): boolean {
  if (!siteHostSplitEnabled()) return false;
  const app = process.env.PUBLIC_APP_HOST!.trim().toLowerCase();
  if (host === app) return false;
  return parseMarketingHosts().includes(host);
}

/** Paths that only exist on the app host; marketing host redirects here with 308. */
export function isAppOnlyDocumentPath(pathname: string): boolean {
  if (pathname === '/demo-codes-print') return true;
  if (pathname.startsWith('/demo-codes')) return true;
  const prefixes = [
    '/scanner',
    '/admin',
    '/login',
    '/signup',
    '/onboarding',
    '/invite',
    '/error',
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function getAppOrigin(request: Request): string {
  const host = process.env.PUBLIC_APP_HOST?.trim();
  if (!host) {
    return new URL(request.url).origin;
  }
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}
