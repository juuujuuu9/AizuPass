import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { Attendee } from '@/types/attendee';
import { apiService } from '@/services/api';
import { AdminDashboard } from '@/components/AdminDashboard';
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

    // Update URL for shareability
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
            href="/admin/events"
            className="rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Manage events
          </a>
          {canManageOrganization && (
            <a
              href="/admin/organization"
              className="rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Organization
            </a>
          )}
          <a
            href="/admin/events/new"
            className="text-sm text-primary hover:underline"
          >
            + New event
          </a>
          <a
            href="/"
            className="ml-auto inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <svg
              className="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M13,11V7h4v4Zm4,6V15H15v2ZM7,13v4h4V13ZM7,7V9H9V7Z" />
              <path d="M21,8V4a1,1,0,0,0-1-1H16" />
              <path d="M16,21h4a1,1,0,0,0,1-1V16" />
              <path d="M8,3H4A1,1,0,0,0,3,4V8" />
              <path d="M3,16v4a1,1,0,0,0,1,1H8" />
            </svg>
            Scan
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
          onRefresh={() => eventId && loadAttendees(eventId, { silent: true })}
        />
      )}
    </>
  );
}
