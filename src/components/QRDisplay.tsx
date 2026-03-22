import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Smartphone, Sun, Focus, AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QRDisplayProps {
  qrDataUrl: string;
  attendeeName?: string;
}

export function QRDisplay({ qrDataUrl, attendeeName }: QRDisplayProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTips, setShowTips] = useState(true);

  const handleDownload = useCallback(() => {
    const safeName = attendeeName
      ? attendeeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : 'guest';
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${safeName}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [attendeeName, qrDataUrl]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleImageClick = useCallback(() => {
    if (!isFullscreen) {
      setShowTips((prev) => !prev);
    }
  }, [isFullscreen]);

  const qrImageCompact = (
    <img
      src={qrDataUrl}
      alt="Your QR Code"
      className="mx-auto w-full max-w-[200px] cursor-pointer transition-all duration-200 hover:opacity-90"
      onClick={handleImageClick}
      style={{
        imageRendering: 'pixelated',
        filter: 'none',
      }}
    />
  );

  const qrImageExpanded = (
    <img
      src={qrDataUrl}
      alt="Your QR Code"
      className="mx-auto h-auto max-h-[min(70vh,calc(100vh-10rem))] w-auto max-w-full object-contain transition-all duration-200"
      onClick={handleImageClick}
      style={{
        imageRendering: 'pixelated',
        filter: 'none',
      }}
    />
  );

  /** Portal to body: `fixed` inside Radix Dialog is tied to the transformed dialog box and breaks layout. */
  const scanModeOverlay =
    isFullscreen && typeof document !== 'undefined' ? (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black p-4"
        role="presentation"
        onClick={() => setIsFullscreen(false)}
      >
        <div className="absolute top-4 left-4 right-4 z-[101] flex items-center justify-between gap-2 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <Focus className="h-5 w-5 shrink-0" />
            <span className="truncate font-medium">Scan Mode</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              <Download className="mr-2 h-5 w-5" />
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(false);
              }}
            >
              <Minimize2 className="mr-2 h-5 w-5" />
              Done
            </Button>
          </div>
        </div>

        <div
          className="flex min-h-0 w-full flex-1 items-center justify-center px-2 pt-14 pb-28"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-[min(70vh,calc(100vh-10rem))] max-w-[min(70vw,100%)] rounded-lg bg-white p-4">
            {qrImageExpanded}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-6 left-4 right-4 z-[101] space-y-2 text-center text-white">
          <p className="text-base font-medium">Show this to staff</p>
          <p className="text-sm text-white/70">
            Hold phones 4-6 inches apart • Keep both screens bright
          </p>
          {attendeeName && (
            <p className="text-sm text-white/50">{attendeeName}</p>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative">
      {scanModeOverlay
        ? createPortal(scanModeOverlay, document.body)
        : null}
      {/* Compact QR — hidden while scan mode is open (overlay is portaled to body) */}
      {!isFullscreen && (
        <div
          className="relative inline-block rounded-lg border-2 bg-white p-4"
          onClick={handleImageClick}
        >
          {qrImageCompact}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="absolute -top-2 -right-2 rounded-full bg-primary p-1.5 text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
            aria-label="Full screen scan mode"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Phone-to-Phone Tips */}
      {!isFullscreen && showTips && (
        <div className="mt-3 space-y-2">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
            <h4 className="font-semibold text-amber-900 flex items-center gap-1.5 mb-2 text-sm">
              <Smartphone className="h-4 w-4" />
              Phone-to-Phone Tips
            </h4>
            <ul className="space-y-1.5 text-xs text-amber-800">
              <li className="flex items-start gap-1.5">
                <Sun className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>Max brightness</strong> — Both phones need to be bright</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Focus className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>4-6 inches apart</strong> — Too close = blurry, too far = small</span>
              </li>
              <li className="flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>Avoid glare</strong> — Tilt slightly if you see reflections</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Maximize2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>Tap QR for full screen</strong> — Bigger, cleaner display</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {!isFullscreen && !showTips && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Tap QR for scanning tips
        </p>
      )}
      {!isFullscreen && (
        <div className="mt-3 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="mr-2 h-4 w-4" />
            Download QR
          </Button>
        </div>
      )}
    </div>
  );
}
