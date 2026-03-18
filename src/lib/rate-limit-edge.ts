/**
 * Edge-compatible rate limiting strategy for Vercel.
 *
 * NOTE: This is a best-effort approach for the free tier. In-memory rate
 * limiting doesn't work reliably across serverless instances, but we can
 * use a combination of techniques:
 *
 * 1. Per-instance memory cache (reduces load on single instance)
 * 2. Vercel's geolocation headers to identify regions
 * 3. Client IP + path-based keys
 *
 * For truly distributed rate limiting, upgrade to Vercel KV or use
 * a Redis provider once you have budget.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (per-instance only)
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}, 60000); // Clean up every minute

export interface RateLimitOptions {
  maxAttempts?: number;
  windowMs?: number;
}

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Check rate limit for a given key.
 *
 * WARNING: This is per-instance only. On Vercel free tier, each function
 * invocation may hit a different instance, so rate limits are not
 * guaranteed across the entire platform.
 */
export function checkRateLimitEdge(
  key: string,
  options: RateLimitOptions = {}
): { allowed: boolean; retryAfterSec?: number; limitType: 'memory' } {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const storeKey = `${key}:${maxAttempts}:${windowMs}`;

  const now = Date.now();
  const entry = store.get(storeKey);

  if (!entry) {
    store.set(storeKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limitType: 'memory' };
  }

  if (now >= entry.resetAt) {
    store.set(storeKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limitType: 'memory' };
  }

  entry.count += 1;
  if (entry.count > maxAttempts) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec, limitType: 'memory' };
  }
  return { allowed: true, limitType: 'memory' };
}

/**
 * Get client IP from request headers, considering Vercel's proxy setup.
 */
export function getClientIpFromRequest(request: Request): string {
  // Vercel-specific headers
  const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) return vercelForwarded.split(',')[0]?.trim() ?? 'unknown';

  // Standard headers
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';

  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Get a composite rate limit key that includes geographic info if available.
 * This helps distribute rate limiting across regions.
 */
export function getCompositeRateLimitKey(
  request: Request,
  endpoint: string
): string {
  const ip = getClientIpFromRequest(request);
  const country = request.headers.get('x-vercel-ip-country') ?? 'unknown';
  const region = request.headers.get('x-vercel-ip-region') ?? 'unknown';

  // Composite key: endpoint:country:region:ip
  return `${endpoint}:${country}:${region}:${ip}`;
}

/**
 * Budget-friendly rate limiting advice:
 *
 * Free tier strategy:
 * - Use this edge-compatible rate limiting for basic protection
 * - Set stricter limits on critical endpoints (check-in, RSVP)
 * - Add client-side rate limiting as a first line of defense
 * - Monitor logs for abuse patterns
 *
 * When ready to scale (paid options):
 * 1. Vercel KV ($0.40/GB-month) - Distributed rate limiting across all instances
 * 2. Upstash Redis (free tier: 10K commands/day) - Good for low-volume apps
 * 3. Rate Limiting add-on ($10/month) - Vercel's managed solution
 *
 * For investor demos:
 * The free tier approach is sufficient. Document the limitation and
 * mention it as a scaling opportunity in your pitch.
 */
