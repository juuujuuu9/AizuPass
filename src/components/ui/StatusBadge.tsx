interface StatusBadgeProps {
  status: 'pending' | 'checked-in' | 'error';
  className?: string;
  /** Overrides the default "Pending" label (e.g. "Not Yet" for check-in lists). */
  pendingLabel?: string;
}

export function StatusBadge({
  status,
  className = '',
  pendingLabel,
}: StatusBadgeProps) {
  const styles = {
    pending: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    'checked-in': 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    error: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  };

  const labels = {
    pending: pendingLabel ?? 'Pending',
    'checked-in': 'Checked In',
    error: 'Error',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'checked-in'
            ? 'bg-emerald-500'
            : status === 'error'
            ? 'bg-red-500'
            : 'bg-slate-400'
        }`}
      />
      {labels[status]}
    </span>
  );
}
