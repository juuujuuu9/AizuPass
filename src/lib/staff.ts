/**
 * Role mapping:
 * - ADMIN_EMAILS => admin
 * - SCANNER_EMAILS (optional) => scanner allowlist
 * - If SCANNER_EMAILS is unset/empty, any non-admin authenticated user is scanner
 */

export type StaffRole = 'admin' | 'scanner' | 'staff';

function getEnv(name: string): string | undefined {
  // On Vercel, process.env is the runtime source of truth
  if (typeof process !== 'undefined' && process.env[name]) {
    return process.env[name];
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as Record<string, string | undefined>)[name];
  }
  return undefined;
}

function parseList(value: string | undefined): string[] {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function getStaffRole(email: string | null | undefined): StaffRole | null {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();

  const adminEmails = parseList(getEnv('ADMIN_EMAILS'));
  if (adminEmails.length > 0 && adminEmails.includes(normalized)) return 'admin';

  const scannerEmails = parseList(getEnv('SCANNER_EMAILS'));
  if (scannerEmails.length > 0) {
    return scannerEmails.includes(normalized) ? 'scanner' : 'staff';
  }

  return 'scanner';
}

export function isStaffEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().length > 0;
}
