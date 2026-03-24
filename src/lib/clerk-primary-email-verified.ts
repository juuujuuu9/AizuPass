import { clerkClient } from '@clerk/astro/server';

/** Context accepted by `clerkClient()` (middleware or Astro page). */
export type ClerkCallContext = Parameters<typeof clerkClient>[0];

/** True if the user's primary Clerk email is verified. True when unknown (fail open). */
export async function isPrimaryEmailVerifiedByClerk(context: ClerkCallContext, userId: string): Promise<boolean> {
  try {
    const cu = await clerkClient(context).users.getUser(userId);
    const primary =
      (cu.primaryEmailAddressId &&
        cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)) ??
      cu.emailAddresses[0];
    if (!primary) return true;
    return primary.verification?.status === 'verified';
  } catch {
    return true;
  }
}
