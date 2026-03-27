import { Users, Upload, Plus } from 'lucide-react';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';

interface EmptyStateProps {
  onAddAttendee: () => void;
  /** When provided, shows Import CSV button. */
  onImportCSV?: () => void;
  importing?: boolean;
  /** Primary button label (default: "Add Attendee"). */
  addButtonLabel?: string;
  /** Primary button red variant when true (default: false = blue). */
  addButtonRed?: boolean;
}

export function EmptyState({ onAddAttendee, onImportCSV, importing, addButtonLabel = 'Add Attendee', addButtonRed = false }: EmptyStateProps) {
  const importOnly = !!onImportCSV;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      {!importOnly && (
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
          No attendees yet
        </h3>
      )}
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
        {importOnly ? 'Get started by importing your guest list' : 'Get started by creating a new event'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        {onImportCSV && (
          <button
            onClick={onImportCSV}
            disabled={importing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {importing ? (
              <ButtonSpinner className="w-4 h-4" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
        )}
        {!importOnly && (
          <button
            onClick={onAddAttendee}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              addButtonRed ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            {addButtonLabel}
          </button>
        )}
      </div>
    </div>
  );
}
