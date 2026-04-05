import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/astro/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, X, RotateCcw, CheckCircle2, QrCode, Copy, AlertCircle, LayoutDashboard, Search, Flashlight, CalendarDays } from 'lucide-react';
import { EventCombobox } from '@/components/EventCombobox';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import type { EventOption } from '@/components/AdminPage';
import { toast } from 'sonner';
import type { CheckInResult } from '@/types/attendee';
import { apiService } from '@/services/api';
import { QR_SCANNER } from '@/config/qr';
import {
  preloadScannerSounds,
  provideFeedback,
  type FeedbackType,
} from '@/lib/feedback';
import {
  checkInOffline,
  checkInAttendeeOffline,
  setCachedData,
  getCachedData,
  getPendingQueueCount,
  syncQueue,
  isOnline,
} from '@/lib/offline';
import { recordCheckInRoundTripMs } from '@/lib/scan-metrics';

/** Proactive session probe while the tab is visible (long-shift door ops). */
const SESSION_PROBE_INTERVAL_MS = 5 * 60 * 1000;

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
  if (err instanceof Error && (err.message.includes('network') || err.message.includes('fetch'))) return true;
  return false;
}

function httpStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

/** Map OfflineCheckInResult to CheckInResult for UI consistency */
function toCheckInResult(
  r:
    | { success: true; alreadyCheckedIn?: boolean; attendee: { id: string; firstName: string; lastName: string; email: string; company?: string }; event?: { id: string; name: string }; message: string }
    | { success: false; alreadyCheckedIn?: boolean; attendee?: { id: string; firstName: string; lastName: string; email: string; company?: string }; event?: { id: string; name: string }; message: string }
): CheckInResult {
  return {
    success: r.success,
    alreadyCheckedIn: r.alreadyCheckedIn,
    message: r.message,
    event: r.event,
    attendee: r.attendee
      ? { id: r.attendee.id, firstName: r.attendee.firstName, lastName: r.attendee.lastName, email: r.attendee.email, company: r.attendee.company, checkedIn: true, rsvpAt: '' }
      : undefined,
  };
}

interface CheckInScannerProps {
  onCheckIn?: () => void;
  standalone?: boolean;
  /** Event this scanner accepts (QR + manual). Sent to the API as scannerEventId. */
  eventId?: string;
  /** Label for UI when opening with `/?event=` (optional client fetch if missing). */
  eventName?: string;
}

type SearchAttendee = { id: string; firstName: string; lastName: string; email: string; checkedIn: boolean; eventName?: string };

function feedbackTypeFromResult(result: CheckInResult): FeedbackType {
  if (result.success) return 'success';
  if (result.alreadyCheckedIn) return 'alreadyCheckedIn';
  return 'error';
}

type SessionProbeResult = 'ok' | '401' | '403' | 'offline' | 'error';

export function CheckInScanner({
  onCheckIn,
  standalone = false,
  eventId,
  eventName,
}: CheckInScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<CheckInResult | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [manualResults, setManualResults] = useState<SearchAttendee[]>([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualCheckingIn, setManualCheckingIn] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  /** 401 → sign in again; 403 → profile/onboarding (middleware) */
  const [sessionBlock, setSessionBlock] = useState<null | 'signin' | 'profile'>(null);
  /** After repeated invalid QR check-ins, show door-ops fallback copy (torch / name search). */
  const [doorResilienceHint, setDoorResilienceHint] = useState(false);
  const [sessionRefreshBusy, setSessionRefreshBusy] = useState(false);
  const processingRef = useRef(false);
  const { isLoaded, isSignedIn, getToken } = useAuth();
  /** Suppress duplicate html5-qrcode decodes of the same payload (see QR_SCANNER.debounceMs). */
  const lastDecodeRef = useRef<{ text: string; at: number } | null>(null);
  /** Keyboard-wedge laser scanners: characters until Enter/Tab (see keydown capture listener). */
  const wedgeBufferRef = useRef('');
  const wedgeIdleClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveInvalidScanRef = useRef(0);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<{ stop: () => Promise<void> } | null>(null);

  const [pickerEvents, setPickerEvents] = useState<EventOption[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const [pickedEventName, setPickedEventName] = useState<string | null>(null);
  const [fetchedEventName, setFetchedEventName] = useState<string | null>(null);

  const activeEventId = (pickedEventId ?? eventId)?.trim() || null;
  const activeEventName = pickedEventName ?? eventName ?? fetchedEventName ?? null;

  const returnToParam =
    typeof window !== 'undefined'
      ? encodeURIComponent(`${window.location.pathname}${window.location.search}`)
      : '';

  const commitScannerEvent = useCallback((id: string, name: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('event', id);
    window.history.replaceState({}, '', url.toString());
    setPickedEventId(id);
    setPickedEventName(name);
  }, []);

  const updateDoorResilienceAfterResult = useCallback((result: CheckInResult) => {
    if (!result.success && !result.alreadyCheckedIn) {
      const n = consecutiveInvalidScanRef.current + 1;
      consecutiveInvalidScanRef.current = n;
      setDoorResilienceHint(n >= 2);
    } else {
      consecutiveInvalidScanRef.current = 0;
      setDoorResilienceHint(false);
    }
  }, []);

  /** Clerk: refresh JWT before probing — fixes many tab-background / long-session cookie mismatches. */
  const refreshSessionAndProbe = useCallback(async (): Promise<SessionProbeResult> => {
    if (!isOnline()) return 'offline';
    try {
      if (isLoaded && isSignedIn && getToken) {
        await getToken({ skipCache: true });
      }
    } catch {
      /* still probe; server is source of truth */
    }
    try {
      const r = await apiService.pingSession();
      if (r.ok) {
        setSessionBlock(null);
        return 'ok';
      }
      if (r.status === 401) {
        setSessionBlock('signin');
        return '401';
      }
      if (r.status === 403) {
        setSessionBlock('profile');
        return '403';
      }
    } catch {
      return 'error';
    }
    return 'error';
  }, [isLoaded, isSignedIn, getToken]);

  const handleRetrySessionFromBanner = useCallback(async () => {
    setSessionRefreshBusy(true);
    try {
      const result = await refreshSessionAndProbe();
      if (result === 'ok') {
        toast.success('Session restored — you can scan again.');
      } else if (result === '401') {
        toast.error('Still signed out — use Sign in below.');
      } else if (result === '403') {
        toast.error('Account setup still required — use the link below.');
      } else if (result === 'offline') {
        toast.error('You are offline — connect to refresh session.');
      }
    } finally {
      setSessionRefreshBusy(false);
    }
  }, [refreshSessionAndProbe]);

  const sessionBannerEl =
    sessionBlock != null ? (
      <div
        className="rounded-lg border border-[var(--amber-6)] bg-[var(--amber-2)] px-3 py-2.5 text-sm"
        role="alert"
      >
        {sessionBlock === 'signin' ? (
          <>
            <p className="font-medium text-foreground">Your session may have expired.</p>
            <p className="text-muted-foreground mt-1">
              Sign in again to check in and sync queued scans.{' '}
              <a
                href={`/login?returnTo=${returnToParam}`}
                className="font-medium text-primary underline"
              >
                Sign in
              </a>
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-foreground">Account setup required</p>
            <p className="text-muted-foreground mt-1">
              Complete your profile to use the scanner.{' '}
              <a
                href={`/onboarding/profile?returnTo=${returnToParam}`}
                className="font-medium text-primary underline"
              >
                Continue setup
              </a>
            </p>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={sessionRefreshBusy}
            onClick={() => void handleRetrySessionFromBanner()}
            className="gap-1.5"
          >
            {sessionRefreshBusy ? (
              <>
                <ButtonSpinner className="h-3.5 w-3.5" />
                Refreshing…
              </>
            ) : (
              'Refresh session'
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Tries a fresh Clerk token, then reconnects to the server.
          </span>
        </div>
      </div>
    ) : null;

  useEffect(() => {
    if (!standalone) return;
    if (eventId?.trim()) return;

    let cancelled = false;
    setPickerLoading(true);
    apiService
      .getEvents()
      .then((list) => {
        if (cancelled) return;
        setPickerEvents(list);
        if (list.length === 1) {
          commitScannerEvent(list[0].id, list[0].name);
        }
      })
      .catch(() => {
        if (!cancelled) setPickerEvents([]);
      })
      .finally(() => {
        if (!cancelled) setPickerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [standalone, eventId, commitScannerEvent]);

  useEffect(() => {
    if (!activeEventId) {
      setFetchedEventName(null);
      return;
    }
    if (pickedEventName || eventName?.trim()) {
      setFetchedEventName(null);
      return;
    }
    let cancelled = false;
    apiService
      .getEvent(activeEventId)
      .then((ev) => {
        if (!cancelled && ev?.name) setFetchedEventName(ev.name);
      })
      .catch(() => {
        if (!cancelled) setFetchedEventName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeEventId, pickedEventName, eventName]);

  useEffect(() => {
    preloadScannerSounds();
  }, []);

  useEffect(() => {
    setOfflineMode(!isOnline());
    const onOffline = () => setOfflineMode(true);
    const onOnline = () => setOfflineMode(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    const runWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshSessionAndProbe();
    };
    void refreshSessionAndProbe();
    document.addEventListener('visibilitychange', runWhenVisible);
    window.addEventListener('focus', runWhenVisible);
    const onOnline = () => runWhenVisible();
    window.addEventListener('online', onOnline);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && isOnline()) {
        void refreshSessionAndProbe();
      }
    }, SESSION_PROBE_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', runWhenVisible);
      window.removeEventListener('focus', runWhenVisible);
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
    };
  }, [refreshSessionAndProbe]);

  // Cache guest list when online; sync queue when coming back online
  useEffect(() => {
    const refreshPendingCount = async () => {
      try {
        setPendingQueueCount(await getPendingQueueCount());
      } catch {
        // Ignore queue read errors.
      }
    };
    const refreshCache = async () => {
      if (!isOnline() || !activeEventId) return;
      try {
        const data = await apiService.getOfflineCache(activeEventId);
        await setCachedData(data);
      } catch (err) {
        const st = httpStatus(err);
        if (st === 401) setSessionBlock('signin');
        else if (st === 403) setSessionBlock('profile');
      }
    };
    const doSync = async () => {
      if (!isOnline()) return;
      const { synced, failed, authRejected } = await syncQueue((body) =>
        fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
      if (authRejected) {
        setSessionBlock('signin');
        toast.error('Sign in again to sync queued check-ins.', {
          duration: 8000,
        });
      }
      if (synced > 0) {
        toast.success(`Synced ${synced} check-in${synced > 1 ? 's' : ''}`);
        onCheckIn?.();
      }
      if (failed > 0 && !authRejected) {
        toast.error(`${failed} check-in${failed > 1 ? 's' : ''} failed to sync`);
      }
      await refreshPendingCount();
    };
    refreshPendingCount();
    refreshCache();
    if (isOnline()) void doSync();
    const onOnline = () => {
      doSync().then(refreshCache);
    };
    window.addEventListener('online', onOnline);
    const queueInterval = window.setInterval(refreshPendingCount, 5000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(queueInterval);
    };
  }, [activeEventId, onCheckIn]);

  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(''), 2000);
    return () => clearTimeout(t);
  }, [announcement]);

  const stopScanning = useCallback(() => {
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop().catch(console.error);
      html5QrCodeRef.current = null;
    }
    setScanning(false);
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  const processDecodedPayload = useCallback(
    async (decodedText: string, options: { stopCamera: boolean }) => {
      const trimmed = decodedText.trim();
      if (!trimmed || !activeEventId) return;
      if (trimmed.length > 500) {
        toast.error('QR data is too long');
        return;
      }

      if (processingRef.current) return;
      const now = Date.now();
      const prev = lastDecodeRef.current;
      if (
        prev &&
        prev.text === trimmed &&
        now - prev.at < QR_SCANNER.debounceMs
      ) {
        return;
      }
      lastDecodeRef.current = { text: trimmed, at: now };

      processingRef.current = true;
      setProcessing(true);
      const t0 = performance.now();
      if (options.stopCamera && !standalone) stopScanning();

      try {
        let result: CheckInResult;
        try {
          result = await apiService.checkInAttendee(trimmed, activeEventId);
        } catch (err) {
          if (isNetworkError(err) && !isOnline()) {
            const offlineResult = await checkInOffline(trimmed, activeEventId);
            result = toCheckInResult(offlineResult);
            setPendingQueueCount(await getPendingQueueCount());
          } else {
            const st = httpStatus(err);
            if (st === 401) {
              setSessionBlock('signin');
              result = {
                success: false,
                message: 'Sign-in expired. Sign in again, then scan.',
              };
            } else if (st === 403) {
              setSessionBlock('profile');
              result = {
                success: false,
                message: 'Finish account setup before checking in.',
              };
            } else {
              throw err;
            }
          }
        }
        recordCheckInRoundTripMs(performance.now() - t0);
        setScanResult(result);
        updateDoorResilienceAfterResult(result);
        const ftype = feedbackTypeFromResult(result);
        provideFeedback(ftype, result.message, setAnnouncement);

        if (result.success) {
          toast.success(result.message);
          onCheckIn?.();
        } else if (result.alreadyCheckedIn) {
          toast.warning(result.message);
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error('Check-in error:', error);
        recordCheckInRoundTripMs(performance.now() - t0);
        provideFeedback('error', 'Check-in failed', setAnnouncement);
        const failed: CheckInResult = {
          success: false,
          message: 'Check-in failed',
        };
        setScanResult(failed);
        updateDoorResilienceAfterResult(failed);
        toast.error('Check-in failed');
      } finally {
        setProcessing(false);
        if (!standalone) processingRef.current = false;
      }
    },
    [
      activeEventId,
      standalone,
      onCheckIn,
      updateDoorResilienceAfterResult,
      stopScanning,
    ]
  );

  useEffect(() => {
    if (!activeEventId) return;

    const clearIdle = () => {
      if (wedgeIdleClearRef.current) {
        clearTimeout(wedgeIdleClearRef.current);
        wedgeIdleClearRef.current = null;
      }
    };

    const scheduleIdleClear = () => {
      clearIdle();
      wedgeIdleClearRef.current = setTimeout(() => {
        wedgeBufferRef.current = '';
        wedgeIdleClearRef.current = null;
      }, 600);
    };

    const isManualTextInputTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
        return true;
      }
      return t.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isManualTextInputTarget(e.target)) return;

      if (e.key === 'Enter' || e.key === 'Tab') {
        const raw = wedgeBufferRef.current.trim();
        wedgeBufferRef.current = '';
        clearIdle();
        if (!raw) return;
        e.preventDefault();
        e.stopPropagation();
        void processDecodedPayload(raw, { stopCamera: false });
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (wedgeBufferRef.current.length >= 500) return;
        wedgeBufferRef.current += e.key;
        scheduleIdleClear();
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      clearIdle();
    };
  }, [activeEventId, processDecodedPayload]);

  const startScanning = async () => {
    if (!activeEventId) {
      toast.error('Select an event before scanning');
      return;
    }
    try {
      setScanning(true);
      setCameraError(null);
      setScanResult(null);
      setDoorResilienceHint(false);
      consecutiveInvalidScanRef.current = 0;
      lastDecodeRef.current = null;

      const Html5Qrcode = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode.Html5Qrcode('reader');
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: QR_SCANNER.fps,
        qrbox: QR_SCANNER.qrbox,
        aspectRatio: QR_SCANNER.aspectRatio,
        showTorchButtonIfSupported: QR_SCANNER.showTorchButtonIfSupported,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText: string) => {
          void processDecodedPayload(decodedText, { stopCamera: true });
        },
        () => {}
      );
      try {
        const caps = html5QrCode.getRunningTrackCameraCapabilities();
        setTorchSupported(caps.torchFeature().isSupported());
      } catch {
        setTorchSupported(false);
      }
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError(
        'Unable to access camera. Please ensure you have granted camera permissions.'
      );
      setScanning(false);
    }
  };

  const toggleTorch = async () => {
    const scanner = html5QrCodeRef.current;
    if (!scanner || !torchSupported) return;
    try {
      const torch = (scanner as any).getRunningTrackCameraCapabilities().torchFeature();
      const next = !torchOn;
      await torch.apply(next);
      setTorchOn(torch.value() ?? next);
      if (next) {
        consecutiveInvalidScanRef.current = 0;
        setDoorResilienceHint(false);
      }
    } catch (err) {
      console.error('Torch toggle failed:', err);
      toast.error('Could not switch torch');
    }
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const searchManual = async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setManualResults([]);
      return;
    }
    if (!activeEventId) {
      setManualResults([]);
      return;
    }
    setManualSearching(true);
    try {
      if (!isOnline()) {
        const cache = await getCachedData();
        if (cache) {
          const lower = q.trim().toLowerCase();
          const filtered = cache.attendees.filter(
            (a) =>
              a.firstName.toLowerCase().includes(lower) ||
              a.lastName.toLowerCase().includes(lower) ||
              a.email.toLowerCase().includes(lower)
          );
          const scoped = filtered.filter((a) => a.eventId === activeEventId);
          setManualResults(
            scoped.map((a) => ({
              id: a.id,
              firstName: a.firstName,
              lastName: a.lastName,
              email: a.email,
              checkedIn: a.checkedIn,
              eventName: a.eventName,
            }))
          );
          return;
        }
      }
      const attendees = await apiService.searchAttendees(activeEventId, q);
      setManualResults(attendees);
    } catch (err) {
      if (isNetworkError(err) && !isOnline()) {
        const cache = await getCachedData();
        if (cache) {
          const lower = q.trim().toLowerCase();
          const filtered = cache.attendees.filter(
            (a) =>
              a.firstName.toLowerCase().includes(lower) ||
              a.lastName.toLowerCase().includes(lower) ||
              a.email.toLowerCase().includes(lower)
          );
          const scoped = filtered.filter((a) => a.eventId === activeEventId);
          setManualResults(
            scoped.map((a) => ({
              id: a.id,
              firstName: a.firstName,
              lastName: a.lastName,
              email: a.email,
              checkedIn: a.checkedIn,
              eventName: a.eventName,
            }))
          );
        } else {
          toast.error('Offline: guest list not cached. Connect first.');
          setManualResults([]);
        }
      } else {
        console.error('Manual search error:', err);
        toast.error('Search failed');
        setManualResults([]);
      }
    } finally {
      setManualSearching(false);
    }
  };

  const manualSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (manualSearchDebounceRef.current) clearTimeout(manualSearchDebounceRef.current);
    if (!manualQuery.trim()) {
      setManualResults([]);
      return;
    }
    if (manualQuery.length < 2) {
      setManualResults([]);
      return;
    }
    manualSearchDebounceRef.current = setTimeout(() => searchManual(manualQuery), 300);
    return () => {
      if (manualSearchDebounceRef.current) clearTimeout(manualSearchDebounceRef.current);
    };
  }, [manualQuery, activeEventId]);

  const handleManualCheckIn = async (attendee: SearchAttendee) => {
    if (!activeEventId) return;
    setManualCheckingIn(attendee.id);
    const t0 = performance.now();
    try {
      let result: CheckInResult;
      try {
        setProcessing(true);
        result = await apiService.checkInAttendeeById(attendee.id, activeEventId);
      } catch (err) {
        if (isNetworkError(err) && !isOnline()) {
          const offlineResult = await checkInAttendeeOffline(attendee.id, activeEventId);
          result = toCheckInResult(offlineResult);
          setPendingQueueCount(await getPendingQueueCount());
        } else {
          const st = httpStatus(err);
          if (st === 401) {
            setSessionBlock('signin');
            result = {
              success: false,
              message: 'Sign-in expired. Sign in again, then check in.',
            };
          } else if (st === 403) {
            setSessionBlock('profile');
            result = {
              success: false,
              message: 'Finish account setup before checking in.',
            };
          } else {
            throw err;
          }
        }
      }
      recordCheckInRoundTripMs(performance.now() - t0);
      setScanResult(result);
      updateDoorResilienceAfterResult(result);
      const ftype = feedbackTypeFromResult(result);
      provideFeedback(ftype, result.message, setAnnouncement);
      if (result.success) {
        toast.success(result.message);
        onCheckIn?.();
        setManualResults((prev) =>
          prev.map((a) => (a.id === attendee.id ? { ...a, checkedIn: true } : a))
        );
      } else {
        if (result.alreadyCheckedIn) toast.warning(result.message);
        else toast.error(result.message);
        if (result.alreadyCheckedIn) {
          setManualResults((prev) =>
            prev.map((a) => (a.id === attendee.id ? { ...a, checkedIn: true } : a))
          );
        }
      }
    } catch (err) {
      console.error('Manual check-in error:', err);
      recordCheckInRoundTripMs(performance.now() - t0);
      provideFeedback('error', 'Check-in failed', setAnnouncement);
      toast.error('Check-in failed');
    } finally {
      setManualCheckingIn(null);
      setProcessing(false);
    }
  };

  const handleScanNext = () => {
    setScanResult(null);
    processingRef.current = false;
  };

  const eventContextBanner =
    activeEventId ? (
      <div
        className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm"
        role="status"
      >
        <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-foreground">Scanning for</p>
          <p className="text-muted-foreground truncate">
            {activeEventName?.trim() || 'This event'}
          </p>
        </div>
      </div>
    ) : null;

  const standalonePickerEl =
    standalone && !activeEventId && pickerLoading ? (
      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
        <ButtonSpinner className="h-4 w-4" />
        Loading events…
      </div>
    ) : standalone && !activeEventId && !pickerLoading && pickerEvents.length > 1 ? (
      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-sm font-medium text-foreground">Which event are you checking in?</p>
        <EventCombobox
          events={pickerEvents}
          value={pickedEventId ?? ''}
          onSelect={(id) => {
            const ev = pickerEvents.find((e) => e.id === id);
            if (ev) commitScannerEvent(ev.id, ev.name);
          }}
          className="md:w-full"
        />
      </div>
    ) : standalone && !activeEventId && !pickerLoading && pickerEvents.length === 0 ? (
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-center text-sm text-muted-foreground">
        <p>No events assigned to your account.</p>
        <a href="/admin" className="mt-2 inline-block font-medium text-primary underline">
          Open Event Workspace
        </a>
      </div>
    ) : null;

  const readerEl = (
    <div className="space-y-2">
      <div
        id="reader"
        ref={scannerRef}
        className={`w-full border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted scanner-frame ${!scanning ? 'animate-pulse' : ''}`}
        style={{ minHeight: standalone ? 'min(70vh, 400px)' : '300px' }}
      >
        {!scanning && (
          <div className="text-center text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-2" />
            <p>
              {standalone
                ? 'Tap "Start Scanner" to activate camera'
                : 'Click "Start Scanning" to activate camera'}
            </p>
          </div>
        )}
      </div>
      {scanning && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="text-center text-sm text-muted-foreground space-y-1" aria-live="polite">
            <p><strong>Phone-to-phone scanning:</strong></p>
            <ul className="text-xs space-y-0.5">
              <li>• Hold phones 6–10 inches apart</li>
              <li>• Ask attendee to max their brightness</li>
              <li>• Avoid glare — tilt either phone if you see reflections</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">
              QR still won&apos;t read? Use <strong className="text-foreground">torch</strong> above or{' '}
              <strong className="text-foreground">check in by name</strong>
              {!standalone && ' (below)'}.
            </p>
          </div>
          {doorResilienceHint && (
            <div
              role="status"
              className="w-full max-w-md rounded-lg border border-[var(--amber-6)] bg-[var(--amber-2)] px-3 py-2.5 text-[var(--amber-11)]"
            >
              <p className="text-sm font-medium">Invalid code again?</p>
              <p className="text-xs mt-1 opacity-95">
                Try the torch, ask the guest to brighten their screen, or use check in by name
                {!standalone && ' below'}. Hold phones about 6–10 inches apart with steady hands.
              </p>
            </div>
          )}
          {offlineMode && (
            <span className="text-xs px-2 py-1 rounded-md bg-amber-500/20 text-amber-11 border border-amber-6">
              Offline — will sync when connected
            </span>
          )}
          {pendingQueueCount > 0 && (
            <span className="text-xs px-2 py-1 rounded-md bg-[var(--amber-2)] text-[var(--amber-11)] border border-[var(--amber-6)]">
              {pendingQueueCount} queued for sync
            </span>
          )}
          {processing && (
            <span className="text-xs px-2 py-1 rounded-md bg-blue-500/20 text-blue-11 border border-blue-6 inline-flex items-center gap-1.5">
              <ButtonSpinner className="h-3.5 w-3.5" />
              Processing scan...
            </span>
          )}
          {torchSupported && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleTorch}
              className="gap-1.5"
              aria-pressed={torchOn}
              aria-label={torchOn ? 'Turn off torch' : 'Turn on torch'}
            >
              <Flashlight className={`h-4 w-4 ${torchOn ? 'text-amber-500' : ''}`} />
              {torchOn ? 'Torch on' : 'Torch'}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const ariaLiveEl = (
    <div
      role="status"
      aria-live="polite"
      aria-atomic
      className="sr-only"
      key={announcement}
    >
      {announcement}
    </div>
  );

  const handleMobileScannerAction = () => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/`;
    const isMobile =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(max-width: 768px)').matches);
    if (isMobile) {
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Opening scanner in new tab.');
    } else {
      navigator.clipboard.writeText(url).then(
        () => {
          setCopyFlash(true);
          setTimeout(() => setCopyFlash(false), 300);
          toast.success('Copied! Open this link on a mobile device for mobile scanning.');
        },
        () => toast.error('Could not copy link.')
      );
    }
  };

  const buttons = (
    <div className="flex flex-col gap-2">
      {activeEventId ? (
        <p className="text-center text-xs text-muted-foreground">
          USB or Bluetooth <span className="text-foreground font-medium">keyboard-wedge</span> scanners
          work without the camera—scan anytime. To type in name search below, click that field first.
        </p>
      ) : null}
      <div className="flex gap-2">
        {!scanning ? (
          <Button
            onClick={startScanning}
            className="flex-1"
            size={standalone ? 'lg' : 'default'}
            disabled={!activeEventId}
          >
            <Camera className="h-4 w-4 mr-2" />
            {standalone ? 'Start Scanner' : 'Start Scanning'}
          </Button>
        ) : (
          <Button
            onClick={stopScanning}
            variant="destructive"
            className="flex-1"
            size={standalone ? 'lg' : 'default'}
          >
            <X className="h-4 w-4 mr-2" />
            Stop Scanning
          </Button>
        )}
        {!standalone && (
          <Button
            onClick={() => setScanResult(null)}
            variant="outline"
            disabled={scanning}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
      {!standalone && (
        <Button
          onClick={handleMobileScannerAction}
          variant="outline"
          size="default"
          className={`w-full transition-colors duration-150 bg-secondary text-secondary-foreground border-border hover:bg-accent ${
            copyFlash ? 'bg-red-500! text-white! border-red-500!' : ''
          }`}
        >
          <Copy className="h-4 w-4 mr-2 hidden md:inline-block" />
          Mobile Scanner
        </Button>
      )}
      {standalone && (
        <>
          <Button variant="outline" size="lg" className="w-full" asChild>
            <a
              href={
                activeEventId
                  ? `/admin?event=${encodeURIComponent(activeEventId)}`
                  : '/admin'
              }
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Event Workspace
            </a>
          </Button>
          <a
            href="/demo-codes"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mt-1"
          >
            <QrCode className="h-3.5 w-3.5" />
            Demo codes
          </a>
        </>
      )}
    </div>
  );

  const errorEl = cameraError && (
    <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg">
      <p className="text-sm">{cameraError}</p>
    </div>
  );

  const manualCheckInEl = (
    <div className="space-y-3 pt-4 border-t border-border">
      <p className="text-sm font-medium text-muted-foreground">Or check in by name</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name or email..."
          value={manualQuery}
          onChange={(e) => setManualQuery(e.target.value)}
          className="pl-9"
          disabled={!activeEventId || manualSearching}
          aria-label="Search attendees by name or email"
        />
      </div>
      {manualSearching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ButtonSpinner className="h-4 w-4" />
          Searching...
        </div>
      )}
      {manualResults.length > 0 && (
        <ul className="space-y-2 max-h-48 overflow-y-auto rounded-md border border-border bg-muted/50 p-2">
          {manualResults.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {a.firstName} {a.lastName}
                </p>
                <p className="text-muted-foreground text-xs truncate">{a.email}</p>
                {a.eventName && (
                  <p className="text-muted-foreground text-xs truncate">{a.eventName}</p>
                )}
              </div>
              <Button
                size="sm"
                disabled={a.checkedIn || manualCheckingIn === a.id}
                onClick={() => handleManualCheckIn(a)}
              >
                {manualCheckingIn === a.id ? (
                  <ButtonSpinner className="h-4 w-4" />
                ) : a.checkedIn ? (
                  'Checked in'
                ) : (
                  'Check in'
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {manualQuery.length >= 2 && !manualSearching && manualResults.length === 0 && (
        <p className="text-sm text-muted-foreground">No attendees found</p>
      )}
    </div>
  );

  const resultOverlay =
    standalone && scanResult ? (
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-4 ${
          scanResult.success
            ? 'bg-success'
            : scanResult.alreadyCheckedIn
              ? 'bg-warning'
              : 'bg-error'
        }`}
      >
        <div className="text-white text-center max-w-sm">
          {scanResult.success ? (
            <CheckCircle2 className="h-20 w-20 mx-auto mb-4" aria-hidden />
          ) : scanResult.alreadyCheckedIn ? (
            <AlertCircle className="h-20 w-20 mx-auto mb-4" aria-hidden />
          ) : (
            <X className="h-20 w-20 mx-auto mb-4" aria-hidden />
          )}
          <p className="text-xl font-semibold mb-2">
            {scanResult.success
              ? 'Checked in'
              : scanResult.alreadyCheckedIn
                ? 'Already checked in'
                : 'Invalid code'}
          </p>
          <p className="text-white/90 text-lg">{scanResult.message}</p>
        </div>
        <Button
          onClick={handleScanNext}
          variant="secondary"
          size="lg"
          className="mt-8 min-w-[200px]"
        >
          Scan next
        </Button>
        {scanResult.alreadyCheckedIn && (
          <p className="mt-4 text-white/90 text-center max-w-sm text-sm">
            If this is a different guest, ask for ID and use name search.
          </p>
        )}
      </div>
    ) : null;

  if (standalone) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        {ariaLiveEl}
        <div className="w-full max-w-md space-y-4 px-4 py-4">
          {sessionBannerEl}
          {standalonePickerEl}
          {eventContextBanner}
          {readerEl}
          {buttons}
          {manualCheckInEl}
          {errorEl}
        </div>
        {resultOverlay}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {ariaLiveEl}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">QR Code Scanner</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Point your camera at the attendee's QR code to check them in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessionBannerEl}
            {eventContextBanner}
            {readerEl}
            {buttons}
            {manualCheckInEl}
            {errorEl}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Scan Results</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Results from the latest QR code scan
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scanResult ? (
            <div
              className={`p-4 rounded-lg ${
                scanResult.success
                  ? 'bg-[var(--green-2)] border border-[var(--green-6)] text-[var(--green-11)]'
                  : scanResult.alreadyCheckedIn
                    ? 'bg-[var(--amber-2)] border border-[var(--amber-6)] text-[var(--amber-11)]'
                    : 'bg-[var(--red-2)] border border-[var(--red-6)] text-[var(--red-11)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {scanResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-[var(--green-11)]" />
                ) : scanResult.alreadyCheckedIn ? (
                  <AlertCircle className="h-5 w-5 text-[var(--amber-11)]" />
                ) : (
                  <X className="h-5 w-5 text-destructive" />
                )}
                <p className="font-medium">
                  {scanResult.success
                    ? 'Check-in Successful!'
                    : scanResult.alreadyCheckedIn
                      ? 'Already Checked In'
                      : 'Check-in Failed'}
                </p>
              </div>
              <p className="text-sm opacity-90">
                {scanResult.message}
              </p>
              {scanResult.alreadyCheckedIn && (
                <p className="text-sm mt-2 opacity-90">
                  If this is a different guest, ask for ID and use name search.
                </p>
              )}
              {(scanResult.success || scanResult.alreadyCheckedIn) &&
                scanResult.event && (
                  <p className="text-sm mt-1 opacity-90">
                    Event: {scanResult.event.name}
                  </p>
                )}
              {scanResult.attendee && (
                <div className="mt-4 pt-4 border-t border-current/20">
                  <p className="text-sm font-medium mb-2">Attendee Details:</p>
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Name:</strong>{' '}
                      {scanResult.attendee.firstName}{' '}
                      {scanResult.attendee.lastName}
                    </p>
                    <p>
                      <strong>Email:</strong> {scanResult.attendee.email}
                    </p>
                    {scanResult.attendee.company && (
                      <p>
                        <strong>Company:</strong> {scanResult.attendee.company}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <QrCode className="h-12 w-12 mx-auto mb-2" />
              <p>No scan results yet</p>
              <p className="text-sm">Start scanning to see results here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
