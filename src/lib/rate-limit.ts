/**
 * In-memory rate limit: max N attempts per key (e.g. IP) per window.
 * Single-instance only; for multi-instance use Redis/Vercel KV.
 */
const store = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_ATTEMPTS = 5;

export interface RateLimitOptions {
  maxAttempts?: number;
  windowMs?: number;
}

export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const storeKey = `${key}:${maxAttempts}:${windowMs}`;

  const now = Date.now();
  const entry = store.get(storeKey);

  if (!entry) {
    store.set(storeKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (now >= entry.resetAt) {
    store.set(storeKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > maxAttempts) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}
