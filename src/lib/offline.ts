/**
 * Offline capability: cache guest list in IndexedDB; queue check-ins when offline; sync when online.
 */

const DB_NAME = 'qr-check-in-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_QUEUE = 'queue';

export type OfflineCacheAttendee = {
  id: string;
  eventId: string;
  qrToken: string | null;
  qrExpiresAt: string | null;
  checkedIn: boolean;
  firstName: string;
  lastName: string;
  email: string;
  eventName?: string;
};

export type OfflineCacheData = {
  cachedAt: string;
  defaultEventId: string;
  events: { id: string; name: string }[];
  attendees: OfflineCacheAttendee[];
};

export type QueuedCheckIn = {
  id: string;
  qrData?: string;
  attendeeId?: string;
  queuedAt: string;
};

function queueSignature(item: { qrData?: string; attendeeId?: string }): string {
  if (item.attendeeId) return `attendee:${item.attendeeId}`;
  if (item.qrData) return `qr:${item.qrData.trim()}`;
  return 'unknown';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
      }
    };
  });
}

export async function getCachedData(): Promise<OfflineCacheData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, 'readonly');
    const req = tx.objectStore(STORE_CACHE).get('guest-list');
    req.onsuccess = () => resolve(req.result?.data ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function setCachedData(data: OfflineCacheData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, 'readwrite');
    tx.objectStore(STORE_CACHE).put({ key: 'guest-list', data });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingQueue(): Promise<QueuedCheckIn[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getPendingQueueCount(): Promise<number> {
  const queue = await getPendingQueue();
  return queue.length;
}

export async function addToQueue(item: Omit<QueuedCheckIn, 'id' | 'queuedAt'>): Promise<string> {
  const existing = await getPendingQueue();
  const signature = queueSignature(item);
  const duplicate = existing.find((queued) => queueSignature(queued) === signature);
  if (duplicate) return duplicate.id;

  const id = crypto.randomUUID();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    const record: QueuedCheckIn = { ...item, id, queuedAt: new Date().toISOString() };
    tx.objectStore(STORE_QUEUE).add(record);
    tx.oncomplete = () => {
      db.close();
      resolve(id);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateLocalCheckedIn(attendeeId: string): Promise<void> {
  const data = await getCachedData();
  if (!data) return;
  const idx = data.attendees.findIndex((a) => a.id === attendeeId);
  if (idx >= 0) {
    data.attendees[idx] = { ...data.attendees[idx], checkedIn: true };
    await setCachedData(data);
  }
}

/** Parse QR string to eventId, entryId, token. Supports v2 (3 parts) and v1 (2 parts, needs defaultEventId). */
function parseQR(qrData: string, defaultEventId: string): { eventId: string; entryId: string; token: string } | null {
  const parts = qrData.split(':');
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return { eventId: parts[0], entryId: parts[1], token: parts[2] };
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { eventId: defaultEventId, entryId: parts[0], token: parts[1] };
  }
  return null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(s: string): boolean {
  return UUID_REGEX.test(s);
}

export type OfflineCheckInResult =
  | { success: true; attendee: OfflineCacheAttendee; event?: { id: string; name: string }; message: string }
  | { success: false; alreadyCheckedIn: true; attendee: OfflineCacheAttendee; event?: { id: string; name: string }; message: string }
  | { success: false; message: string };

/**
 * Validate QR and perform check-in locally when offline.
 * Returns result shape matching CheckInResult for consistent UI.
 */
export async function checkInOffline(qrData: string): Promise<OfflineCheckInResult> {
  const cache = await getCachedData();
  if (!cache) {
    return { success: false, message: 'Guest list not cached. Connect to sync, then try again.' };
  }

  const parsed = parseQR(qrData, cache.defaultEventId);
  if (!parsed || !isValidUUID(parsed.eventId) || !isValidUUID(parsed.entryId)) {
    return { success: false, message: 'Invalid QR code format' };
  }

  const attendee = cache.attendees.find(
    (a) =>
      a.eventId === parsed!.eventId &&
      a.id === parsed!.entryId &&
      a.qrToken === parsed!.token &&
      a.qrExpiresAt &&
      new Date(a.qrExpiresAt) > new Date() &&
      !a.checkedIn
  );

  if (!attendee) {
    const existing = cache.attendees.find((a) => a.id === parsed!.entryId);
    if (existing?.checkedIn) {
      const event = cache.events.find((e) => e.id === existing.eventId);
      return {
        success: false,
        alreadyCheckedIn: true,
        attendee: existing,
        event: event ? { id: event.id, name: event.name } : undefined,
        message: `Already checked in: ${existing.firstName} ${existing.lastName}`,
      };
    }
    if (existing && (!existing.qrToken || existing.qrToken !== parsed!.token)) {
      return { success: false, message: 'Invalid or expired QR code' };
    }
    if (existing?.qrExpiresAt && new Date(existing.qrExpiresAt) < new Date()) {
      return { success: false, message: 'QR code expired' };
    }
    return { success: false, message: 'Invalid or expired QR code' };
  }

  await addToQueue({ qrData });
  await updateLocalCheckedIn(attendee.id);

  const event = cache.events.find((e) => e.id === attendee.eventId);
  return {
    success: true,
    attendee,
    event: event ? { id: event.id, name: event.name } : undefined,
    message: `${attendee.firstName} ${attendee.lastName} checked in successfully!`,
  };
}

/** Check-in by attendee ID (manual override) when offline. */
export async function checkInAttendeeOffline(attendeeId: string): Promise<OfflineCheckInResult> {
  const cache = await getCachedData();
  if (!cache) {
    return { success: false, message: 'Guest list not cached. Connect to sync, then try again.' };
  }

  const attendee = cache.attendees.find((a) => a.id === attendeeId);
  if (!attendee) {
    return { success: false, message: 'Attendee not found' };
  }
  if (attendee.checkedIn) {
    const event = cache.events.find((e) => e.id === attendee.eventId);
    return {
      success: false,
      alreadyCheckedIn: true,
      attendee,
      event: event ? { id: event.id, name: event.name } : undefined,
      message: `Already checked in: ${attendee.firstName} ${attendee.lastName}`,
    };
  }

  await addToQueue({ attendeeId });
  await updateLocalCheckedIn(attendee.id);

  const event = cache.events.find((e) => e.id === attendee.eventId);
  return {
    success: true,
    attendee,
    event: event ? { id: event.id, name: event.name } : undefined,
    message: `${attendee.firstName} ${attendee.lastName} checked in successfully!`,
  };
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

/** Sync queued check-ins to server. Treat 409 as success. */
export async function syncQueue(
  post: (body: { qrData?: string; attendeeId?: string }) => Promise<Response>
): Promise<{ synced: number; failed: number }> {
  const queue = await getPendingQueue();
  let synced = 0;
  let failed = 0;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const backoffMs = [250, 800, 2000] as const;

  for (const item of queue) {
    try {
      const body = item.qrData ? { qrData: item.qrData } : { attendeeId: item.attendeeId };
      let success = false;
      for (let i = 0; i < backoffMs.length; i++) {
        const res = await post(body!);
        if (res.ok || res.status === 409) {
          await removeFromQueue(item.id);
          synced++;
          success = true;
          break;
        }
        if (res.status >= 500 && i < backoffMs.length - 1) {
          await sleep(backoffMs[i]);
          continue;
        }
        break;
      }
      if (!success) failed++;
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}
