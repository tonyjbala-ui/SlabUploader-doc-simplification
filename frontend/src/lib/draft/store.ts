/**
 * Device draft: one in-progress slab in IndexedDB.
 *
 * This is not a WooCommerce draft. Milestone 1 stores source photo, approved
 * mask, rectangle, axis, length, thickness, widths, sqft, bdft, and the
 * inventory PNG so Continue can restore the last approved state.
 */

import type { SheetMode } from '../image/mask';
import type { SlabRect } from '../image/minAreaRect';
import type { WidthStats } from '../image/sampleWidths';

export const DRAFT_VERSION = 1;
export const DRAFT_DB = 'slabuploader';
export const DRAFT_STORE = 'draft';
export const DRAFT_KEY = 'current';

export type DraftState = 'mask' | 'axis' | 'measure';

/** An ImageBitmap is not structured cloneable everywhere; the mask is stored raw. */
export type SerializedMask = {
  width: number;
  height: number;
  mask: Uint8Array;
};

export type Draft = {
  version: number;
  state: DraftState;
  photoBlob: Blob;
  sheet: SheetMode;
  sensitivity: number;
  mask: SerializedMask | null;
  rect: SlabRect | null;
  axisAngleRad: number;
  lengthIn: number | null;
  thicknessIn: number | null;
  scale: number | null;
  widths: WidthStats | null;
  sqft: number | null;
  bdft: number | null;
  inventoryPngBlob: Blob | null;
};

export function draftSupported(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_DB, DRAFT_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  if (!draftSupported()) return Promise.resolve(null);
  return openDb()
    .then(
      (db) =>
        new Promise<T | null>((resolve, reject) => {
          const transaction = db.transaction(DRAFT_STORE, mode);
          const request = work(transaction.objectStore(DRAFT_STORE));
          request.onsuccess = () => resolve((request.result ?? null) as T | null);
          request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
          transaction.oncomplete = () => db.close();
        })
    )
    .catch((error: unknown) => {
      // A device draft is a convenience. Never break capture over storage.
      console.warn('device draft unavailable:', error);
      return null;
    });
}

export async function loadDraft(): Promise<Draft | null> {
  const draft = await run<Draft>('readonly', (store) => store.get(DRAFT_KEY));
  if (!draft || typeof draft !== 'object') return null;
  if (draft.version !== DRAFT_VERSION) return null;
  if (!(draft.photoBlob instanceof Blob)) return null;
  return draft;
}

export async function saveDraft(draft: Draft): Promise<void> {
  await run('readwrite', (store) => store.put(draft, DRAFT_KEY));
}

export async function clearDraft(): Promise<void> {
  await run('readwrite', (store) => store.delete(DRAFT_KEY));
}