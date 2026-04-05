/**
 * Client-side bulk QR → ZIP: stable filenames with duplicate-name disambiguation.
 */

/** Matches `POST /api/attendees/qr-export-payloads` batch limit. */
export const MAX_QR_EXPORT_ATTENDEE_IDS = 500;

export function attendeeQrPngFilename(
  firstName: string,
  lastName: string,
  attendeeId: string
): string {
  const base = `${lastName}-${firstName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'guest';
  const short = attendeeId.replace(/-/g, '').slice(0, 8);
  return `${base}-${short}.png`;
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
