import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { Printer } from 'lucide-react';
import { apiService } from '@/services/api';
import { generateQRCodeBase64 } from '@/lib/qr-client';
import { MAX_QR_EXPORT_ATTENDEE_IDS } from '@/lib/bulk-qr-zip';
import { attendeeShortId } from '@/lib/attendee-disambig';

type Row = {
  attendeeId: string;
  firstName: string;
  lastName: string;
  qrPayload: string;
  dataUrl: string;
};

interface BadgePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventName?: string;
  attendeeIds: string[];
}

export function BadgePrintDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
  attendeeIds,
}: BadgePrintDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!open || attendeeIds.length === 0) {
      setRows([]);
      setError(null);
      return;
    }

    if (attendeeIds.length > MAX_QR_EXPORT_ATTENDEE_IDS) {
      setRows([]);
      setError(
        `At most ${MAX_QR_EXPORT_ATTENDEE_IDS} attendees per print run. Reduce your selection.`
      );
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const items = await apiService.getQRExportPayloads(eventId, attendeeIds);
        const built: Row[] = [];
        for (const item of items) {
          const dataUrl = await generateQRCodeBase64(item.qrPayload, {
            profile: 'print',
          });
          if (cancelled) return;
          built.push({
            attendeeId: item.attendeeId,
            firstName: item.firstName,
            lastName: item.lastName,
            qrPayload: item.qrPayload,
            dataUrl,
          });
        }
        if (!cancelled) setRows(built);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load QR data');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, eventId, attendeeIds]);

  const handlePrint = () => {
    document.documentElement.classList.add('badge-print-mode');
    const cleanup = () => {
      document.documentElement.classList.remove('badge-print-mode');
      window.removeEventListener('afterprint', cleanup);
      window.clearTimeout(fallbackTimer);
    };
    window.addEventListener('afterprint', cleanup);
    const fallbackTimer = window.setTimeout(cleanup, 4000);
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="badge-print-dialog max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="no-print border-b border-border px-6 py-4">
          <DialogHeader>
            <DialogTitle>Print badges</DialogTitle>
            <DialogDescription>
              {eventName?.trim()
                ? `${eventName.trim()} — ${rows.length} badge(s). Uses print-optimized QR size.`
                : `${rows.length} badge(s). Uses print-optimized QR size.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="mt-2 text-sm text-[var(--red-11)]" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <ButtonSpinner className="h-5 w-5" />
              Building badges…
            </div>
          ) : (
            <div
              id="aizupass-badge-print"
              className="badge-print-root grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3"
            >
              {rows.map((r) => (
                <article
                  key={r.attendeeId}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 print:break-inside-avoid print:border-black print:bg-white"
                >
                  <div className="rounded-md border border-border bg-white p-2 print:border-black">
                    <img
                      src={r.dataUrl}
                      alt=""
                      className="h-44 w-44 object-contain print:h-40 print:w-40"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold leading-tight text-foreground print:text-black">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground print:text-neutral-600">
                      {attendeeShortId(r.attendeeId)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="no-print flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            disabled={loading || rows.length === 0 || Boolean(error)}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
