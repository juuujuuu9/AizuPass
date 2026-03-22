import { useState, useRef, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, X, RotateCcw, CheckCircle2, QrCode, Copy, AlertCircle, LayoutDashboard, Search, Loader2, Flashlight } from 'lucide-react';
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

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
  if (err instanceof Error && (err.message.includes('network') || err.message.includes('fetch'))) return true;
  return false;
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
  /** Scope manual search to this event. When omitted, searches all events. */
  eventId?: string;
}

type SearchAttendee = { id: string; firstName: string; lastName: string; email: string; checkedIn: boolean; eventName?: string };

function feedbackTypeFromResult(result: CheckInResult): FeedbackType {
  if (result.success) return 'success';
  if (result.alreadyCheckedIn) return 'alreadyCheckedIn';
  return 'error';
}

export function CheckInScanner({ onCheckIn, standalone = false, eventId }: CheckInScannerProps) {
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
  const processingRef = useRef(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<{ stop: () => Promise<void> } | null>(null);

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
      if (!isOnline()) return;
      try {
        const data = await apiService.getOfflineCache(eventId);
        await setCachedData(data);
      } catch {
        // Ignore—cache will be stale or empty
      }
    };
    const doSync = async () => {
      if (!isOnline()) return;
      const { synced, failed } = await syncQueue((body) =>
        fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
      if (synced > 0) {
        toast.success(`Synced ${synced} check-in${synced > 1 ? 's' : ''}`);
        onCheckIn?.();
      }
      if (failed > 0) toast.error(`${failed} check-in${failed > 1 ? 's' : ''} failed to sync`);
      await refreshPendingCount();
    };
    refreshPendingCount();
    refreshCache();
    const onOnline = () => {
      doSync().then(refreshCache);
    };
    window.addEventListener('online', onOnline);
    const queueInterval = window.setInterval(refreshPendingCount, 5000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(queueInterval);
    };
  }, [eventId, onCheckIn]);

  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(''), 2000);
    return () => clearTimeout(t);
  }, [announcement]);

  const startScanning = async () => {
    try {
      setScanning(true);
      setCameraError(null);
      setScanResult(null);

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
          if (processingRef.current) return;
          setTimeout(async () => {
            if (processingRef.current) return;
            processingRef.current = true;
            if (!standalone) stopScanning();

            try {
              let result: CheckInResult;
              try {
                setProcessing(true);
                result = await apiService.checkInAttendee(decodedText);
              } catch (err) {
                if (isNetworkError(err) && !isOnline()) {
                  const offlineResult = await checkInOffline(decodedText);
                  result = toCheckInResult(offlineResult);
                  setPendingQueueCount(await getPendingQueueCount());
                } else {
                  throw err;
                }
              }
              setScanResult(result);
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
              provideFeedback('error', 'Check-in failed', setAnnouncement);
              setScanResult({
                success: false,
                message: 'Check-in failed',
              });
              toast.error('Check-in failed');
            } finally {
              setProcessing(false);
              if (!standalone) processingRef.current = false;
            }
          }, QR_SCANNER.debounceMs);
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

  const stopScanning = () => {
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop().catch(console.error);
      html5QrCodeRef.current = null;
    }
    setScanning(false);
    setTorchSupported(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    const scanner = html5QrCodeRef.current;
    if (!scanner || !torchSupported) return;
    try {
      const torch = (scanner as any).getRunningTrackCameraCapabilities().torchFeature();
      const next = !torchOn;
      await torch.apply(next);
      setTorchOn(torch.value() ?? next);
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
          if (eventId) {
            const filteredEvent = filtered.filter((a) => a.eventId === eventId);
            setManualResults(
              filteredEvent.map((a) => ({
                id: a.id,
                firstName: a.firstName,
                lastName: a.lastName,
                email: a.email,
                checkedIn: a.checkedIn,
                eventName: a.eventName,
              }))
            );
          } else {
            setManualResults(
              filtered.map((a) => ({
                id: a.id,
                firstName: a.firstName,
                lastName: a.lastName,
                email: a.email,
                checkedIn: a.checkedIn,
                eventName: a.eventName,
              }))
            );
          }
          return;
        }
      }
      const attendees = await apiService.searchAttendees(eventId, q);
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
          setManualResults(
            filtered.map((a) => ({
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
  }, [manualQuery, eventId]);

  const handleManualCheckIn = async (attendee: SearchAttendee) => {
    setManualCheckingIn(attendee.id);
    try {
      let result: CheckInResult;
      try {
        setProcessing(true);
        result = await apiService.checkInAttendeeById(attendee.id);
      } catch (err) {
        if (isNetworkError(err) && !isOnline()) {
          const offlineResult = await checkInAttendeeOffline(attendee.id);
          result = toCheckInResult(offlineResult);
          setPendingQueueCount(await getPendingQueueCount());
        } else {
          throw err;
        }
      }
      setScanResult(result);
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
              <li>• Hold phones 4-6 inches apart</li>
              <li>• Ask attendee to max their brightness</li>
              <li>• Avoid glare — tilt either phone if you see reflections</li>
            </ul>
          </div>
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
      <div className="flex gap-2">
        {!scanning ? (
          <Button
            onClick={startScanning}
            className="flex-1"
            size={standalone ? 'lg' : 'default'}
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
            <a href="/admin">
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
          disabled={manualSearching}
          aria-label="Search attendees by name or email"
        />
      </div>
      {manualSearching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching...
        </div>
      )}
      {manualResults.length > 0 && (
        <ul className="space-y-2 max-h-48 overflow-y-auto rounded-md border border-border bg-muted/50 p-2 max-md:mb-8">
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
                  <Loader2 className="h-4 w-4 animate-spin" />
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
        <div className="w-full max-w-md space-y-4 px-4">
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
