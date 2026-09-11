// Smog Qty Entry Store & Synchronization Service with Firebase Firestore Persistence
import { db, collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from './firebase';

export interface SmogQtyRecord {
  id: string;
  date: string;       // YYYY-MM-DD
  shift: 'A' | 'B' | 'C';
  smogQty: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

const STORAGE_KEY_SMOG_QTY = 'llt_smog_qty_entries_v1';

const localBus = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('llt_smog_qty_bus')
  : null;

let memoryRecords: SmogQtyRecord[] | null = null;
const listeners = new Set<(records: SmogQtyRecord[]) => void>();

function notifyListeners(records: SmogQtyRecord[]) {
  listeners.forEach((listener) => {
    try {
      listener(records);
    } catch (err) {
      console.error('Error notifying smog qty listener:', err);
    }
  });
}

/* =========================================================================
   FIREBASE FIRESTORE SYNC HELPERS & REALTIME LISTENER
   ========================================================================= */

export async function syncSmogQtyToFirestore(record: SmogQtyRecord): Promise<void> {
  if (!db || !record || !record.id) return;
  try {
    const docRef = doc(db, 'smog_qty_records', record.id);
    await setDoc(docRef, { ...record }, { merge: true });
    console.log('[Firebase] Smog Qty record saved:', record.id);
  } catch (err) {
    console.warn('[Firebase] Smog Qty record save note:', err);
  }
}

export async function deleteSmogQtyFromFirestore(id: string): Promise<void> {
  if (!db || !id) return;
  try {
    const docRef = doc(db, 'smog_qty_records', id);
    await deleteDoc(docRef);
    console.log('[Firebase] Smog Qty record deleted:', id);
  } catch (err) {
    console.warn('[Firebase] Smog Qty record delete note:', err);
  }
}

export async function fetchSmogQtyFromFirestore(): Promise<SmogQtyRecord[] | null> {
  if (!db) return null;
  try {
    const colRef = collection(db, 'smog_qty_records');
    const snap = await getDocs(colRef);
    if (snap.empty) return null;
    const list: SmogQtyRecord[] = [];
    snap.forEach((d: any) => {
      const data = d.data() as SmogQtyRecord;
      if (data && data.id) {
        list.push(data);
      }
    });
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return list;
  } catch (err) {
    console.warn('[Firebase] Smog Qty records fetch note:', err);
    return null;
  }
}

// Attach Real-Time Firestore listener for cross-device live updates
if (db) {
  try {
    const colRef = collection(db, 'smog_qty_records');
    onSnapshot(colRef, (snap: any) => {
      if (snap) {
        const list: SmogQtyRecord[] = [];
        snap.forEach((d: any) => {
          const data = d.data() as SmogQtyRecord;
          if (data && data.id) {
            list.push(data);
          }
        });
        if (list.length > 0) {
          list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          memoryRecords = list;
          try { localStorage.setItem(STORAGE_KEY_SMOG_QTY, JSON.stringify(list)); } catch {}
          notifyListeners(list);
        }
      }
    }, (err: any) => {
      console.warn('[Firebase] Smog Qty real-time listener note:', err);
    });
  } catch (err) {
    console.warn('[Firebase] Could not attach Smog Qty listener:', err);
  }
}

// Initial sync with Firebase Firestore on boot
async function initSmogQtyFirestoreSync() {
  try {
    const remote = await fetchSmogQtyFromFirestore();
    if (remote && remote.length > 0) {
      memoryRecords = remote;
      try { localStorage.setItem(STORAGE_KEY_SMOG_QTY, JSON.stringify(remote)); } catch {}
      notifyListeners(remote);
    } else {
      // If Firestore is currently empty, push existing local records to Firestore
      const local = getSmogQtyRecords();
      for (const rec of local) {
        await syncSmogQtyToFirestore(rec);
      }
    }
  } catch (err) {
    console.warn('[Firebase] Smog Qty initial sync note:', err);
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    initSmogQtyFirestoreSync();
  }, 100);
}

export function getSmogQtyRecords(): SmogQtyRecord[] {
  if (memoryRecords) {
    return memoryRecords;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SMOG_QTY);
    if (!raw) {
      // Default initial sample entry for today's date if empty
      const today = new Date().toISOString().split('T')[0];
      const initial: SmogQtyRecord[] = [
        {
          id: 'sq-initial-1',
          date: today,
          shift: 'A',
          smogQty: 120,
          notes: 'Standard shift production quota',
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem(STORAGE_KEY_SMOG_QTY, JSON.stringify(initial));
      memoryRecords = initial;
      return initial;
    }
    const parsed = JSON.parse(raw);
    memoryRecords = Array.isArray(parsed) ? parsed : [];
    return memoryRecords;
  } catch (err) {
    console.error('Error loading smog qty records from localStorage:', err);
    memoryRecords = [];
    return [];
  }
}

export function saveSmogQtyRecord(data: {
  date: string;
  shift: 'A' | 'B' | 'C';
  smogQty: number;
  notes?: string;
}): SmogQtyRecord {
  const current = getSmogQtyRecords();
  const today = new Date().toISOString().split('T')[0];
  const targetDate = data.date ? data.date.trim() : today;

  // Check if an entry already exists for this exact date and shift
  const existingIdx = current.findIndex(
    (r) => r.date === targetDate && r.shift === data.shift
  );

  let updatedList: SmogQtyRecord[];
  let savedRecord: SmogQtyRecord;

  if (existingIdx >= 0) {
    // Update existing entry (add qty or replace with new total as entered)
    const existing = current[existingIdx];
    savedRecord = {
      ...existing,
      smogQty: Number(data.smogQty),
      notes: data.notes || existing.notes,
      updatedAt: new Date().toISOString()
    };
    updatedList = [...current];
    updatedList[existingIdx] = savedRecord;
  } else {
    savedRecord = {
      id: `sq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date: targetDate,
      shift: data.shift,
      smogQty: Number(data.smogQty),
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };
    updatedList = [savedRecord, ...current];
  }

  try {
    localStorage.setItem(STORAGE_KEY_SMOG_QTY, JSON.stringify(updatedList));
    memoryRecords = updatedList;
  } catch (err) {
    console.error('Error saving smog qty record to localStorage:', err);
  }

  notifyListeners(updatedList);
  if (localBus) {
    localBus.postMessage({ type: 'SMOG_QTY_UPDATED', payload: updatedList });
  }

  // Persist to Firebase Firestore
  syncSmogQtyToFirestore(savedRecord).catch((err) => {
    console.warn('[Firebase] Background Smog Qty sync note:', err);
  });

  return savedRecord;
}

export function deleteSmogQtyRecord(id: string): void {
  const current = getSmogQtyRecords();
  const filtered = current.filter((r) => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY_SMOG_QTY, JSON.stringify(filtered));
    memoryRecords = filtered;
  } catch (err) {
    console.error('Error deleting smog qty record:', err);
  }

  notifyListeners(filtered);
  if (localBus) {
    localBus.postMessage({ type: 'SMOG_QTY_UPDATED', payload: filtered });
  }

  // Delete from Firebase Firestore
  deleteSmogQtyFromFirestore(id).catch((err) => {
    console.warn('[Firebase] Background Smog Qty delete note:', err);
  });
}

export function getSmogQtySum(date?: string | null, shift?: 'all' | 'A' | 'B' | 'C'): number {
  const records = getSmogQtyRecords();
  return records
    .filter((r) => {
      if (date && r.date !== date) return false;
      if (shift && shift !== 'all' && r.shift !== shift) return false;
      return true;
    })
    .reduce((acc, r) => acc + (Number(r.smogQty) || 0), 0);
}

export function subscribeSmogQtyRecords(cb: (records: SmogQtyRecord[]) => void): () => void {
  listeners.add(cb);
  cb(getSmogQtyRecords());

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY_SMOG_QTY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        memoryRecords = parsed;
        notifyListeners(parsed);
      } catch (err) {
        console.error('Error parsing smog qty storage event:', err);
      }
    }
  };

  const handleBroadcast = (e: MessageEvent) => {
    if (e.data?.type === 'SMOG_QTY_UPDATED' && Array.isArray(e.data.payload)) {
      memoryRecords = e.data.payload;
      notifyListeners(e.data.payload);
    }
  };

  window.addEventListener('storage', handleStorage);
  if (localBus) {
    localBus.addEventListener('message', handleBroadcast);
  }

  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', handleStorage);
    if (localBus) {
      localBus.removeEventListener('message', handleBroadcast);
    }
  };
}
