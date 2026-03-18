// Auth types for Clerk integration
// No additional type declarations needed - Clerk provides its own types

// Re-export StaffRole for convenience
export type StaffRole = 'organizer' | 'staff' | 'none';

export interface User {
  id: string;
  email: string | null;
  role: StaffRole;
}
