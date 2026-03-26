/// <reference types="astro/client" />

type StaffRole = 'organizer' | 'staff' | 'none';

interface User {
  id: string;
  email: string | null;
  role: StaffRole;
  /** From `users` row; set in middleware after profile sync. */
  firstName: string | null;
  lastName: string | null;
}

declare namespace App {
  interface Locals {
    user: User | null;
    isStaff: boolean;
    isAdmin: boolean;
    isScanner: boolean;
    hasOrganization: boolean;
    hasEvent: boolean;
    /** False until first/last name saved in `users` (see /onboarding/profile). */
    profileComplete?: boolean;
    /** True when profile check failed due to DB error (fail-closed). See HI-5. */
    profileCheckError?: boolean;
  }
}
