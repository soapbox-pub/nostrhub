/**
 * What the page hands the service worker.
 *
 * A push carries one raw, unverified Nostr event and nothing else. Deciding
 * whether it's news, and what to say about it, takes the user's
 * {@link NotificationContext} — who they are, what they made, which threads
 * they're watching — so the page writes it to IndexedDB, which both sides of
 * the origin share. Read back by `src/sw/worker.ts`.
 */

import type { NotificationContext } from '@/lib/notifications';

const DB_NAME = 'nostrhub-push';
const STORE = 'state';
const KEY = 'context';

export interface PushWorkerState {
  ctx: NotificationContext;
  /** When this record was written (ms). */
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Publish the worker's copy of the context. */
export async function putPushWorkerState(ctx: NotificationContext): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await withStore('readwrite', (store) => store.put({ ctx, updatedAt: Date.now() } satisfies PushWorkerState, KEY));
}

/** Drop the worker's copy — push was turned off, or the user logged out. */
export async function clearPushWorkerState(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await withStore('readwrite', (store) => store.delete(KEY));
}

/** The context the page last published, or null. */
export async function loadPushWorkerState(): Promise<PushWorkerState | null> {
  try {
    const value = await withStore<PushWorkerState | undefined>('readonly', (store) => store.get(KEY));
    return value?.ctx ? value : null;
  } catch {
    return null;
  }
}
