/// <reference types="astro/client" />

type StaffRole = 'admin' | 'scanner' | 'staff';

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
  }
}
