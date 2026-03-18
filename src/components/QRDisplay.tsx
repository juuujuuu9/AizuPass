import { useState, useCallback } from 'react';
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

  const qrImage = (
    <img
      src={qrDataUrl}
      alt="Your QR Code"
      className={`transition-all duration-200 ${
        isFullscreen
          ? 'w-auto h-auto max-w-[70vw] max-h-[70vh] object-contain'
          : 'w-full max-w-[200px] mx-auto cursor-pointer hover:opacity-90'
      }`}
      onClick={handleImageClick}
      style={{
        imageRendering: 'pixelated',
        // Prevent any CSS filters that could affect contrast
        filter: 'none',
      }}
    />
  );

  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black p-4"
        onClick={() => setIsFullscreen(false)}
      >
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Focus className="h-5 w-5" />
            <span className="font-medium">Scan Mode</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              <Download className="h-5 w-5 mr-2" />
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
              <Minimize2 className="h-5 w-5 mr-2" />
              Done
            </Button>
          </div>
        </div>

        <div 
          className="flex-1 flex items-center justify-center w-full" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white p-4 rounded-lg">
            {qrImage}
          </div>
        </div>

        <div className="absolute bottom-8 left-4 right-4 text-center text-white space-y-2">
          <p className="text-base font-medium">Show this to staff</p>
          <p className="text-sm text-white/70">
            Hold phones 4-6 inches apart • Keep both screens bright
          </p>
          {attendeeName && (
            <p className="text-sm text-white/50">{attendeeName}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Compact QR Container - Optimized for small screens */}
      <div
        className="relative bg-white rounded-lg p-4 border-2 inline-block"
        onClick={handleImageClick}
      >
        {qrImage}
        
        {/* Subtle expand hint */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className="absolute -top-2 -right-2 bg-primary text-primary-foreground p-1.5 rounded-full shadow-md hover:bg-primary/90 transition-colors"
          aria-label="Full screen scan mode"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Phone-to-Phone Tips */}
      {showTips && (
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

      {!showTips && (
        <p className="text-center text-xs text-muted-foreground mt-2">
          Tap QR for scanning tips
        </p>
      )}
      <div className="mt-3 text-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4 mr-2" />
          Download QR
        </Button>
      </div>
    </div>
  );
}
