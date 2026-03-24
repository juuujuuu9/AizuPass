/**
 * Unified env access that works in both Vite (import.meta.env) and
 * Node/Vercel (process.env) runtime contexts.
 */
export function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env[key]) {
    return process.env[key];
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) {
    return (import.meta as any).env[key] as string;
  }
  return undefined;
}

export function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

/**
 * Resolve app base URL from env: APP_URL > PUBLIC_APP_URL > https://VERCEL_URL.
 * Falls back to the provided requestOrigin (from the incoming request).
 */
export function getAppBaseUrl(requestOrigin?: string): string {
  return (
    getEnv('APP_URL') ||
    getEnv('PUBLIC_APP_URL') ||
    (getEnv('VERCEL_URL') ? `https://${getEnv('VERCEL_URL')}` : '') ||
    requestOrigin ||
    ''
  );
}

/**
 * Base URL for links in outbound email: env first, then Host / forwarded headers from the request.
 * Trailing slash stripped.
 */
export function getAppBaseUrlFromRequest(request: Request): string {
  let fromRequest: string | undefined;
  try {
    const url = new URL(request.url);
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || url.host;
    const proto =
      request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
      (url.protocol === 'https:' ? 'https' : 'http');
    if (host) fromRequest = `${proto}://${host}`;
  } catch {
    /* ignore */
  }
  return getAppBaseUrl(fromRequest).replace(/\/$/, '');
}
