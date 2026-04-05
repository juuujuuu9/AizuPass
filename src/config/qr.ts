/**
 * **Screen / email** — phone-to-phone and RSVP email embeds.
 * See `QR_PRINT` for badge sheets and bulk ZIP intended for physical printing.
 */
export const QR_GENERATION = {
  /**
   * Optimized for phone-to-phone scanning.
   * 280px = ~7cm, fits comfortably on small screens while remaining scannable.
   * Too large = moiré patterns and glare issues. Too small = hard to focus.
   */
  width: 280,
  /**
   * Quiet zone (margin) is critical for phone-to-phone:
   * - 4 modules = adequate isolation from screen bezels/UI
   * - Helps scanner distinguish QR from phone frame/reflections
   */
  margin: 4,
  /**
   * H = High (30% redundancy).
   * Essential for phone screens: handles glare, cracks, screen protectors,
   * and the inevitable thumb smudge over part of the code.
   */
  errorCorrectionLevel: 'H' as const,
  scale: 4,
  /**
   * Color contrast optimized for OLED/LCD screens.
   * Pure black/white avoids subpixel rendering issues.
   */
  color: {
    dark: '#000000',
    light: '#FFFFFF',
  },
};

/**
 * **Print / sticker** — higher module count for paper; same H error correction.
 * Use with `generateQRCodeBase64(payload, { profile: 'print' })`.
 * Physical minimums: see docs/qr-scannability-matrix.md.
 */
export const QR_PRINT = {
  /** 512px bitmap ≈ 1.35" square at 300 DPI when printed at native pixel size; scale in CSS/layout as needed. */
  width: 512,
  margin: 4,
  errorCorrectionLevel: 'H' as const,
  color: {
    dark: '#000000',
    light: '#FFFFFF',
  },
};

export const QR_SCANNER = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1.0,
  showTorchButtonIfSupported: true,
  /**
   * Duplicate suppression: ignore repeat decodes of the same payload within this window (ms).
   * The first decode is processed immediately (no artificial delay before the check-in request).
   */
  debounceMs: 500,
  /** Soft target for decode → API response (ms); documented for ops / future slow-network UX. */
  targetRoundTripMs: 1000,
};
