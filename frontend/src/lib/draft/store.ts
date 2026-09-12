export type AppStateName = 'resume' | 'add-photo' | 'mask' | 'axis' | 'measure';

export type DraftRecord = {
  state: AppStateName;
  photoDataUrl: string | null;
  sheet: 'auto' | 'green' | 'black';
  sensitivity: number;
  maskPixelCount?: number;
  axis?: {
    center: { x: number; y: number };
    lengthPx: number;
    widthPx: number;
    angleRad: number;
    userRotationRad: number;
  } | null;
  lengthIn?: number | null;
  thicknessIn?: number | null;
  updatedAt: number;
};

const DB = 'slabuploader-m1';
const STORE = 'draft';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDraft(): Promise<DraftRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as DraftRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...draft, updatedAt: Date.now() }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearDraft(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
