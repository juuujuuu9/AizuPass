import { useLayoutEffect, useMemo, useState } from 'react';
import { parsePostgresUtcTimestamp } from '@/lib/postgres-timestamp';

/**
 * Renders a DB timestamp in the **browser's** local timezone.
 * Parses naive Postgres `TIMESTAMP` strings as UTC (see `parsePostgresUtcTimestamp`).
 */
export function LocalDateTime({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  const [label, setLabel] = useState('—');

  const instant = useMemo(() => (iso ? parsePostgresUtcTimestamp(iso) : null), [iso]);

  useLayoutEffect(() => {
    if (!instant) {
      setLabel('—');
      return;
    }
    setLabel(instant.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
  }, [instant]);

  if (!iso || !instant) {
    return <span className={className}>—</span>;
  }

  return (
    <time dateTime={instant.toISOString()} className={className}>
      {label}
    </time>
  );
}
