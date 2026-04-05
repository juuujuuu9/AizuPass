/**
 * Postgres `TIMESTAMP` (no time zone) values often arrive as ISO-like strings **without** `Z` or offset.
 * `new Date("2026-04-05T05:39:00")` is parsed as *local* wall time (ECMA-262), which shifts the instant.
 * Neon session time for `NOW()` is UTC; we treat naive datetimes as UTC so local display matches reality.
 */
function hasExplicitTimezone(t: string): boolean {
  return /Z$/i.test(t) || /[+-]\d{2}:\d{2}/.test(t) || /[+-]\d{4}$/.test(t);
}

export function parsePostgresUtcTimestamp(s: string | null | undefined): Date | null {
  if (s == null || s === '') return null;
  const t = String(s).trim();
  if (!t) return null;
  if (hasExplicitTimezone(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const normalized = t.includes('T') ? t : t.replace(' ', 'T');
  const d = new Date(`${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
