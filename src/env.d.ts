/// <reference types="astro/client" />

type StaffRole = 'organizer' | 'staff' | 'none';

interface User {
  id: string;
  email: string | null;
  role: StaffRole;
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
  }
}
