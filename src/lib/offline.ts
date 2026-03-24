/**
 * Offline capability: cache guest list in IndexedDB; queue check-ins when offline; sync when online.
 */

import type { OfflineCacheAttendee } from './db';
import { isValidUUID } from './uuid';
export type { OfflineCacheAttendee };

/** Pre–AizuPass rebrand; migrated once into `DB_NAME`, then deleted. */
const LEGACY_DB_NAME = 'qr-check-in-offline';
const DB_NAME = 'aizupass-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_QUEUE = 'queue';

const MIGRATION_LS_KEY = 'aizupass-offline-migrated';

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
  scannerEventId: string;
  queuedAt: string;
};

function mergeQueues(a: QueuedCheckIn[], b: QueuedCheckIn[]): QueuedCheckIn[] {
  const byId = new Map<string, QueuedCheckIn>();
  for (const q of a) byId.set(q.id, q);
  for (const q of b) {
    if (!byId.has(q.id)) byId.set(q.id, q);
  }
  return [...byId.values()];
}

function deleteDatabaseByName(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function openNamedDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
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

async function readCacheAndQueue(db: IDBDatabase): Promise<{
  cache: OfflineCacheData | null;
  queue: QueuedCheckIn[];
}> {
  const cache = await new Promise<OfflineCacheData | null>((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_CACHE)) {
      resolve(null);
      return;
    }
    const tx = db.transaction(STORE_CACHE, 'readonly');
    const req = tx.objectStore(STORE_CACHE).get('guest-list');
    req.onsuccess = () => resolve(req.result?.data ?? null);
    req.onerror = () => reject(req.error);
  });

  const queue = await new Promise<QueuedCheckIn[]>((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_QUEUE)) {
      resolve([]);
      return;
    }
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });

  return { cache, queue };
}

async function writeCacheAndQueue(
  db: IDBDatabase,
  cache: OfflineCacheData | null,
  queue: QueuedCheckIn[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CACHE, STORE_QUEUE], 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();

    const cacheStore = tx.objectStore(STORE_CACHE);
    if (cache) {
      cacheStore.put({ key: 'guest-list', data: cache });
    } else {
      cacheStore.delete('guest-list');
    }

    const queueStore = tx.objectStore(STORE_QUEUE);
    queueStore.clear();
    for (const item of queue) {
      queueStore.put(item);
    }
  });
}

function markOfflineMigrationDone(): void {
  try {
    localStorage.setItem(MIGRATION_LS_KEY, '1');
  } catch {
    /* private mode / quota */
  }
}

function isOfflineMigrationMarkedDone(): boolean {
  try {
    return localStorage.getItem(MIGRATION_LS_KEY) === '1';
  } catch {
    return false;
  }
}

async function legacyIndexedDbListed(): Promise<boolean | null> {
  if (typeof indexedDB?.databases !== 'function') return null;
  try {
    const list = await indexedDB.databases();
    return list.some((d) => d.name === LEGACY_DB_NAME);
  } catch {
    return null;
  }
}

/** Remove legacy DB if the browser still lists it (e.g. localStorage was cleared). */
async function deleteLegacyIfStillPresent(): Promise<void> {
  const listed = await legacyIndexedDbListed();
  if (listed === false) return;
  if (listed === true) {
    await deleteDatabaseByName(LEGACY_DB_NAME);
    return;
  }
  // `databases()` unavailable: try delete (no-op if missing on some engines)
  try {
    await deleteDatabaseByName(LEGACY_DB_NAME);
  } catch {
    /* ignore */
  }
}

/**
 * One-time: copy guest-list cache + pending queue from `LEGACY_DB_NAME` into `DB_NAME`, then delete legacy.
 * Idempotent and safe if the new DB already has data (queues merged by id; cache prefers existing new data).
 */
async function migrateFromLegacyIfNeeded(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  if (isOfflineMigrationMarkedDone()) {
    await deleteLegacyIfStillPresent();
    return;
  }

  try {
    const listed = await legacyIndexedDbListed();
    if (listed === false) {
      markOfflineMigrationDone();
      return;
    }

    const legacyDb = await openNamedDatabase(LEGACY_DB_NAME);
    const legacy = await readCacheAndQueue(legacyDb);
    legacyDb.close();

    const legacyEmpty = legacy.cache == null && legacy.queue.length === 0;
    if (legacyEmpty) {
      await deleteDatabaseByName(LEGACY_DB_NAME);
      markOfflineMigrationDone();
      return;
    }

    const newDb = await openNamedDatabase(DB_NAME);
    const existing = await readCacheAndQueue(newDb);

    const mergedCache = existing.cache ?? legacy.cache;
    const mergedQueue = mergeQueues(existing.queue, legacy.queue);

    await writeCacheAndQueue(newDb, mergedCache, mergedQueue);
    newDb.close();

    await deleteDatabaseByName(LEGACY_DB_NAME);
  } catch (e) {
    console.warn('[AizuPass] Offline IndexedDB migration skipped:', e);
    return;
  }

  markOfflineMigrationDone();
}

function queueSignature(item: {
  qrData?: string;
  attendeeId?: string;
  scannerEventId?: string;
}): string {
  const scope = item.scannerEventId ?? '';
  if (item.attendeeId) return `attendee:${item.attendeeId}:${scope}`;
  if (item.qrData) return `qr:${item.qrData.trim()}:${scope}`;
  return 'unknown';
}

async function openDB(): Promise<IDBDatabase> {
  await migrateFromLegacyIfNeeded();
  return openNamedDatabase(DB_NAME);
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

/**
 * Add a queued check-in, or return the existing queue row id if the same logical check-in
 * is already pending (same attendee/QR + event). Uses one IndexedDB transaction so concurrent
 * callers cannot insert duplicates between read and write.
 */
export async function addToQueue(item: Omit<QueuedCheckIn, 'id' | 'queuedAt'>): Promise<string> {
  const signature = queueSignature(item);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_QUEUE);
    const listReq = store.getAll();
    listReq.onerror = () => reject(listReq.error);
    listReq.onsuccess = () => {
      const existing = (listReq.result ?? []) as QueuedCheckIn[];
      const duplicate = existing.find((queued) => queueSignature(queued) === signature);
      if (duplicate) {
        tx.oncomplete = () => {
          db.close();
          resolve(duplicate.id);
        };
        return;
      }
      const id = crypto.randomUUID();
      const record: QueuedCheckIn = {
        ...item,
        id,
        queuedAt: new Date().toISOString(),
      };
      const addReq = store.add(record);
      addReq.onerror = () => reject(addReq.error);
      tx.oncomplete = () => {
        db.close();
        resolve(id);
      };
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

export type OfflineCheckInResult =
  | { success: true; attendee: OfflineCacheAttendee; event?: { id: string; name: string }; message: string }
  | { success: false; alreadyCheckedIn: true; attendee: OfflineCacheAttendee; event?: { id: string; name: string }; message: string }
  | { success: false; message: string };

/**
 * Validate QR and perform check-in locally when offline.
 * Returns result shape matching CheckInResult for consistent UI.
 */
export async function checkInOffline(
  qrData: string,
  scannerEventId: string
): Promise<OfflineCheckInResult> {
  const cache = await getCachedData();
  if (!cache) {
    return { success: false, message: 'Guest list not cached. Connect to sync, then try again.' };
  }

  const parsed = parseQR(qrData, cache.defaultEventId);
  if (!parsed || !isValidUUID(parsed.eventId) || !isValidUUID(parsed.entryId)) {
    return { success: false, message: 'Invalid QR code format' };
  }

  if (parsed.eventId !== scannerEventId) {
    return { success: false, message: 'This QR code is for a different event.' };
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

  await addToQueue({ qrData, scannerEventId });
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
export async function checkInAttendeeOffline(
  attendeeId: string,
  scannerEventId: string
): Promise<OfflineCheckInResult> {
  const cache = await getCachedData();
  if (!cache) {
    return { success: false, message: 'Guest list not cached. Connect to sync, then try again.' };
  }

  const attendee = cache.attendees.find((a) => a.id === attendeeId);
  if (!attendee) {
    return { success: false, message: 'Attendee not found' };
  }
  if (attendee.eventId !== scannerEventId) {
    return { success: false, message: 'This guest is registered for a different event.' };
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

  await addToQueue({ attendeeId, scannerEventId });
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

export type SyncQueueResult = {
  synced: number;
  failed: number;
  /** At least one item hit 401/403 — session or policy; queue rows kept for retry after sign-in */
  authRejected?: boolean;
};

/** Serialize sync so overlapping runs (e.g. `online` + rapid focus) cannot POST the same row twice. */
let syncChain: Promise<void> = Promise.resolve();

function enqueueSync<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncChain.then(fn);
  syncChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

/** Sync queued check-ins to server. Treat 409 as success. */
export async function syncQueue(
  post: (body: {
    qrData?: string;
    attendeeId?: string;
    scannerEventId: string;
  }) => Promise<Response>
): Promise<SyncQueueResult> {
  return enqueueSync(() => syncQueueUnlocked(post));
}

async function syncQueueUnlocked(
  post: (body: {
    qrData?: string;
    attendeeId?: string;
    scannerEventId: string;
  }) => Promise<Response>
): Promise<SyncQueueResult> {
  const queue = await getPendingQueue();
  let synced = 0;
  let failed = 0;
  let authRejected = false;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const backoffMs = [250, 800, 2000] as const;

  for (const item of queue) {
    try {
      const scannerEventId = item.scannerEventId;
      if (!scannerEventId) {
        failed++;
        continue;
      }
      const body = item.qrData
        ? { qrData: item.qrData, scannerEventId }
        : { attendeeId: item.attendeeId, scannerEventId };
      let success = false;
      for (let i = 0; i < backoffMs.length; i++) {
        const res = await post(body!);
        if (res.ok || res.status === 409) {
          await removeFromQueue(item.id);
          synced++;
          success = true;
          break;
        }
        if (res.status === 401 || res.status === 403) {
          authRejected = true;
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
  return { synced, failed, authRejected: authRejected || undefined };
}
