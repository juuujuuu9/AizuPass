import type { Attendee } from '@/types/attendee';

/** First 8 hex chars of UUID (no dashes) — stable, human-glanceable disambiguator. */
export function attendeeShortId(attendeeId: string): string {
  return attendeeId.replace(/-/g, '').slice(0, 8);
}

export function attendeeNameKey(attendee: Attendee): string {
  return `${attendee.lastName.trim().toLowerCase()}\u0000${attendee.firstName.trim().toLowerCase()}`;
}

/** Keys where two or more attendees share the same first+last name (case-insensitive). */
export function duplicateNameKeys(attendees: Attendee[]): Set<string> {
  const counts = new Map<string, number>();
  for (const a of attendees) {
    const k = attendeeNameKey(a);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dups = new Set<string>();
  for (const [k, n] of counts) {
    if (n > 1) dups.add(k);
  }
  return dups;
}
