import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { Attendee } from '@/types/attendee';
import { apiService } from '@/services/api';
import { AdminDashboard } from '@/components/AdminDashboard';
import { ScanQrMark } from '@/components/ScanQrMark';
import { EventCombobox } from '@/components/EventCombobox';
import { Toaster } from '@/components/ui/sonner';

export interface EventOption {
  id: string;
  name: string;
  slug: string;
}

interface AdminPageProps {
  /** Initial attendees from server (optional). */
  initialAttendees?: Attendee[];
  /** Events for selector. */
  events?: EventOption[];
  /** Pre-selected event ID (URL param or DB lastSelectedEventId). */
  selectedEventId?: string;
  /** Show organizer-only controls. */
  canManageOrganization?: boolean;
}

export function AdminPage({
  initialAttendees = [],
  events = [],
  selectedEventId = '',
  canManageOrganization = false,
}: AdminPageProps) {
  // Server passes selectedEventId (URL > DB). Use as initial state.
  const [eventId, setEventId] = useState(selectedEventId || '');
  
  const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees);
  const [loading, setLoading] = useState(Boolean(eventId && !initialAttendees.length));
  const [error, setError] = useState<string | null>(null);

  const loadAttendees = useCallback(async (eid?: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const data = await apiService.getAllAttendees(eid || undefined);
      setAttendees(data);
    } catch (err) {
      console.error('Error loading attendees:', err);
      const status = (err as Error & { status?: number })?.status;
      let message = 'Failed to load attendees';
      if (err instanceof TypeError && (err as Error).message === 'Failed to fetch') {
        message = 'Cannot reach server. Make sure the dev server is running.';
      } else if (status === 401) {
        message = 'Session expired. Please sign in again.';
      } else if (status === 500) {
        message = 'Server error. Check DATABASE_URL and server logs.';
      } else if (err instanceof Error && (err as Error).message) {
        message = (err as Error).message;
      }
      if (!silent) setError(message);
      toast.error(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Sync with server value when it changes (e.g., URL param or navigation)
  useEffect(() => {
    if (selectedEventId !== eventId) {
      setEventId(selectedEventId);
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (!eventId) {
      setAttendees([]);
      setLoading(false);
      return;
    }
    loadAttendees(eventId);
  }, [eventId, loadAttendees]);

  const onEventSelect = async (newEventId: string) => {
    // Persist to DB so selection survives logout/login and works across devices
    try {
      await fetch('/api/update-last-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: newEventId || null }),
      });
    } catch {
      // Non-blocking; page will still work
    }

    const params = new URLSearchParams(window.location.search);
    if (newEventId) {
      params.set('event', newEventId);
    } else {
      params.delete('event');
    }
    const qs = params.toString();
    window.location.href = qs ? `/admin?${qs}` : '/admin';
  };

  return (
    <>
      <Toaster position="top-center" richColors />
      {events.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="w-full min-w-0 md:w-auto">
            <EventCombobox
              events={events}
              value={eventId}
              onSelect={onEventSelect}
            />
          </div>
          <a
            href={eventId ? `/?event=${encodeURIComponent(eventId)}` : '/'}
            aria-label="Open check-in scanner"
            className="flex w-full flex-row items-center justify-center gap-3 rounded-xl border-0 bg-red-600 px-4 py-3 font-medium text-white shadow-sm outline-none transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
          >
            <span className="block size-12 shrink-0 overflow-hidden">
              <ScanQrMark className="block h-full w-full" />
            </span>
            <span className="shrink-0 text-[1.3125rem] leading-none">Scan</span>
          </a>
        </div>
      )}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <span className="ml-2 text-slate-600">Loading...</span>
        </div>
      )}
      {error && (
        <div className="bg-[var(--red-2)] border border-[var(--red-6)] text-[var(--red-11)] px-4 py-3 rounded-lg mb-6">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => eventId && loadAttendees(eventId)}
            className="mt-2 text-sm font-medium underline"
          >
            Retry
          </button>
        </div>
      )}
      {!loading && (
        <AdminDashboard
          attendees={attendees}
          eventId={eventId || undefined}
          eventName={events.find((e) => e.id === eventId)?.name}
          showScannerCta={events.length > 0}
          onRefresh={() => eventId && loadAttendees(eventId, { silent: true })}
        />
      )}
    </>
  );
}
