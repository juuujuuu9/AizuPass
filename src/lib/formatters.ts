import { parsePostgresUtcTimestamp } from './postgres-timestamp';

/** Local wall-clock for CSV / tables (Postgres naive timestamps = UTC). */
export function formatLocalDateTime(iso: string | null | undefined): string {
  const d = parsePostgresUtcTimestamp(iso ?? undefined);
  return d
    ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
}

export function formatLocalDate(iso: string | null | undefined): string {
  const d = parsePostgresUtcTimestamp(iso ?? undefined);
  return d ? d.toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

export function formatRelativeTime(dateString: string): string {
  const date = parsePostgresUtcTimestamp(dateString);
  if (!date) return '—';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}
