import type { PoseResult } from './shared/lib/pose/protocol';

export type StoredPose = {
  key: string; result: PoseResult; skeleton: Blob; overlay: Blob; included: boolean; createdAt: number;
};
const retention = 7 * 24 * 60 * 60 * 1000;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pixondeck-pose-results', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('poses', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export const poseCache = {
  async get(key: string): Promise<StoredPose | null> {
    const db = await database();
    try {
      const entry = await new Promise<StoredPose | undefined>((resolve, reject) => {
        const request = db.transaction('poses').objectStore('poses').get(key);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return entry && entry.createdAt > Date.now() - retention ? entry : null;
    } finally { db.close(); }
  },
  async set(entry: StoredPose) {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('poses', 'readwrite'), store = transaction.objectStore('poses');
        store.put(entry);
        const request = store.getAll();
        request.onsuccess = () => {
          const entries = (request.result as StoredPose[]).sort((a, b) => b.createdAt - a.createdAt);
          entries.forEach((item, index) => { if (index >= 140 || item.createdAt <= Date.now() - retention) store.delete(item.key); });
        };
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  },
  async remove(key: string) {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('poses', 'readwrite'); transaction.objectStore('poses').delete(key);
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
      });
    } finally { db.close(); }
  },
};
