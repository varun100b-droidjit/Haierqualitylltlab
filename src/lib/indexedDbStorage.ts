/**
 * IndexedDB Storage Helper for High-Capacity Client-Side Storage
 * Handles large items like high-resolution base64 images and reports without 5MB localStorage quota limitations.
 */

const DB_NAME = 'llt_lab_storage_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getIndexedDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const storeNames = ['saved_reports', 'proto_units', 'pp_units', 'field_units'];
      storeNames.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      console.warn('[IndexedDB] Failed to open database:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

export async function idbSaveAll<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
  try {
    const db = await getIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error saving to ${storeName}:`, err);
  }
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await getIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error reading from ${storeName}:`, err);
    return [];
  }
}

/**
 * Safely stores an array in localStorage.
 * If quota is exceeded, strips large base64 photo strings and saves a lightweight version.
 */
export function safeLocalStorageSet(key: string, data: any[]): boolean {
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(key, raw);
    return true;
  } catch (err) {
    console.warn(`[Storage] LocalStorage quota exceeded for ${key}. Falling back to lightweight metadata.`);
    try {
      // Strip large base64 photos to stay well within quota (< 50KB)
      const lightweight = data.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const copy = { ...item };
        if (copy.photos && typeof copy.photos === 'object') {
          const strippedPhotos: Record<string, string> = {};
          Object.entries(copy.photos).forEach(([pKey, pVal]) => {
            if (typeof pVal === 'string') {
              if (pVal.startsWith('data:image/') && pVal.length > 500) {
                strippedPhotos[pKey] = 'data:image/placeholder;stored_in_idb';
              } else {
                strippedPhotos[pKey] = pVal;
              }
            }
          });
          copy.photos = strippedPhotos;
        }
        return copy;
      });

      localStorage.setItem(key, JSON.stringify(lightweight));
      return true;
    } catch (fallbackErr) {
      console.warn(`[Storage] Could not write lightweight metadata to localStorage for ${key}:`, fallbackErr);
      return false;
    }
  }
}
