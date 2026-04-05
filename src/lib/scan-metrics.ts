/**
 * In-memory scan timing for door-operations tuning. Dev console logs optional.
 * Not sent to analytics unless wired later.
 */

import { QR_SCANNER } from '@/config/qr';

const MAX_SAMPLES = 80;
const samples: number[] = [];

export function recordCheckInRoundTripMs(ms: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(ms) || ms < 0) return;
  samples.push(ms);
  if (samples.length > MAX_SAMPLES) samples.shift();

  if (import.meta.env.DEV) {
    const n = samples.length;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.max(0, Math.ceil(n * 0.95) - 1)];
    const over =
      ms > QR_SCANNER.targetRoundTripMs
        ? ` — slower than ${QR_SCANNER.targetRoundTripMs} ms ops target`
        : '';
    console.debug(
      `[aizupass/scan] check-in round-trip: ${ms.toFixed(0)} ms (n=${n}, p95≈${p95.toFixed(0)} ms)${over}`
    );
  }

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __aizuScanMetrics?: ReturnType<typeof getScanRoundTripStats> }).__aizuScanMetrics =
      getScanRoundTripStats();
  }
}

export function getScanRoundTripStats(): {
  count: number;
  lastMs: number;
  p95Ms: number;
  avgMs: number;
} | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const p95 = sorted[Math.max(0, Math.ceil(n * 0.95) - 1)];
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    count: n,
    lastMs: samples[samples.length - 1],
    p95Ms: p95,
    avgMs: sum / n,
  };
}
