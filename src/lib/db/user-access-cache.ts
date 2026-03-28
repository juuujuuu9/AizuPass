/**
 * ME-3: User access summary cache for middleware (locals.isAdmin, etc.).
 * Invalidate on membership changes so role/org boundaries update immediately.
 */
export type UserAccessSummaryData = {
  hasMembership: boolean;
  hasOrganizerRole: boolean;
  organizationCount: number;
  eventCount: number;
};

const USER_ACCESS_CACHE_TTL_MS = 3_000;
const userAccessCache = new Map<string, { data: UserAccessSummaryData; expiresAt: number }>();

export function getUserAccessSummaryFromCache(userId: string): UserAccessSummaryData | null {
  const cached = userAccessCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  return null;
}

export function setUserAccessSummaryCache(userId: string, data: UserAccessSummaryData): void {
  userAccessCache.set(userId, { data, expiresAt: Date.now() + USER_ACCESS_CACHE_TTL_MS });
}

/** Call after membership create/update/remove so middleware sees fresh roles. */
export function invalidateUserAccessCache(userId?: string): void {
  if (userId) userAccessCache.delete(userId);
  else userAccessCache.clear();
}
