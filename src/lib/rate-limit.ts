import { createClient, type VercelKV } from '@vercel/kv';
import { getEnv } from './env';

/**
 * HI-2: Distributed rate limiting using Vercel KV (Redis).
 * Falls back to in-memory for local dev without KV configured.
 */

// In-memory fallback store
const memoryStore = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_ATTEMPTS = 5;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastCleanup = Date.now();
let kvClient: VercelKV | null = null;

function getKvClient(): VercelKV | null {
  // Return cached client if already initialized
  if (kvClient) return kvClient;

  const url = getEnv('KV_URL') || getEnv('KV_REST_API_URL');
  const token = getEnv('KV_REST_API_TOKEN');

  if (!url || !token) return null;

  try {
    kvClient = createClient({ url, token });
    return kvClient;
  } catch {
    return null;
  }
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  for (const [key, entry] of memoryStore.entries()) {
    if (now >= entry.resetAt) {
      memoryStore.delete(key);
    }
  }
  lastCleanup = now;
}

export interface RateLimitOptions {
  maxAttempts?: number;
  windowMs?: number;
}

async function checkDistributedRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const kv = getKvClient();
  if (!kv) {
    // Fall back to memory-based rate limiting
    return checkMemoryRateLimit(key, maxAttempts, windowMs);
  }

  const storeKey = `rate_limit:${key}`;
  const now = Date.now();

  try {
    // Get current count and timestamp
    const data = await kv.get<{ count: number; resetAt: number }>(storeKey);

    if (!data || now >= data.resetAt) {
      // First request or window expired - set new window
      const resetAt = now + windowMs;
      await kv.set(storeKey, { count: 1, resetAt }, { px: windowMs });
      return { allowed: true };
    }

    if (data.count >= maxAttempts) {
      const retryAfterSec = Math.ceil((data.resetAt - now) / 1000);
      return { allowed: false, retryAfterSec };
    }

    // Increment count
    await kv.set(storeKey, { count: data.count + 1, resetAt: data.resetAt }, { px: windowMs });
    return { allowed: true };
  } catch (err) {
    console.error('[Rate Limit] KV error, falling back to memory:', err);
    return checkMemoryRateLimit(key, maxAttempts, windowMs);
  }
}

function checkMemoryRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; retryAfterSec?: number } {
  cleanupExpiredEntries();

  const storeKey = `${key}:${maxAttempts}:${windowMs}`;
  const now = Date.now();
  const entry = memoryStore.get(storeKey);

  if (!entry) {
    memoryStore.set(storeKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (now >= entry.resetAt) {
    memoryStore.set(storeKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > maxAttempts) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  return checkDistributedRateLimit(key, maxAttempts, windowMs);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}
