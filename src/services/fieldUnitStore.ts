import { FieldUnit } from '../types';
import { addLabNotification } from './unitStore';
import { 
  syncFieldUnitToSupabase, 
  deleteFieldUnitFromSupabase, 
  fetchFieldUnitsFromSupabase,
  broadcastLabRealtimeEvent,
  subscribeToLabRealtimeEvents 
} from '../lib/supabase';
import { db, collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from './firebase';
import { requireOnlineForSave } from './networkManager';
import { cleanForFirestore, enforceFirestoreDocSizeLimit } from './firestoreSanitizer';
import { safeLocalStorageSet, idbSaveAll, idbGetAll } from '../lib/indexedDbStorage';

const STORAGE_KEY_FIELD_UNITS = 'llt_field_units_v2';
const DELETED_FIELD_UNITS_KEY = 'llt_deleted_field_units_v1';

function getDeletedFieldUnitIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_FIELD_UNITS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markFieldUnitDeleted(id: string) {
  const set = getDeletedFieldUnitIds();
  set.add(id);
  try {
    localStorage.setItem(DELETED_FIELD_UNITS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function unmarkFieldUnitDeleted(id: string) {
  const set = getDeletedFieldUnitIds();
  if (set.has(id)) {
    set.delete(id);
    try {
      localStorage.setItem(DELETED_FIELD_UNITS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }
}

function getFormattedNow(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const INITIAL_FIELD_UNITS: FieldUnit[] = [];

let fieldUnitsCache: FieldUnit[] = loadLocalFieldUnits();
const subscribers: Set<() => void> = new Set();

// Local Inter-Tab Broadcast Channel
const localFieldBus = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('llt_field_bus') 
  : null;

if (localFieldBus) {
  localFieldBus.onmessage = () => {
    fieldUnitsCache = loadLocalFieldUnits();
    notifySubscribers();
  };
}

// Storage event listener
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY_FIELD_UNITS) {
      fieldUnitsCache = loadLocalFieldUnits();
      notifySubscribers();
    }
  });
}

// Global Supabase Realtime event listener
subscribeToLabRealtimeEvents((event, payload) => {
  if (event === 'field_units_change') {
    if (payload?.deletedId) {
      markFieldUnitDeleted(payload.deletedId);
      fieldUnitsCache = fieldUnitsCache.filter(u => u.id !== payload.deletedId);
      safeLocalStorageSet(STORAGE_KEY_FIELD_UNITS, fieldUnitsCache);
      notifySubscribers();
    } else {
      initDataSync();
    }
  }
});

// Periodic background sync: ONLY push un-synced items to Firestore, never destructively wipe
if (typeof window !== 'undefined') {
  setInterval(() => {
    pushPendingLocalUnitsToFirestore();
  }, 15000);
}

/* ==========================================
   FIREBASE FIRESTORE SYNC HELPERS & REAL-TIME LISTENER
   ========================================== */

export async function syncFieldUnitToFirestore(unit: FieldUnit) {
  if (!db || !unit || unit.id === 'field-101' || unit.id === 'field-102' || unit.id === 'field-103') return;
  try {
    const sanitized = enforceFirestoreDocSizeLimit(cleanForFirestore(unit));
    const docRef = doc(db, 'field_units', unit.id);
    await setDoc(docRef, sanitized, { merge: true });
    if ((unit as any)._pendingSync) {
      delete (unit as any)._pendingSync;
      safeLocalStorageSet(STORAGE_KEY_FIELD_UNITS, fieldUnitsCache);
    }
    console.log('Successfully synced Field Unit to Firebase Firestore:', unit.id);
  } catch (e) {
    console.warn('Firestore Field Unit sync note:', e);
  }
}

export async function deleteFieldUnitFromFirestore(id: string) {
  if (!db) return;
  try {
    const docRef = doc(db, 'field_units', id);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Firestore Field Unit delete note:', e);
  }
}

export async function fetchFieldUnitsFromFirestore(): Promise<FieldUnit[] | null> {
  if (!db) return null;
  try {
    const colRef = collection(db, 'field_units');
    const snap = await getDocs(colRef);
    if (snap.empty) return null;
    const list: FieldUnit[] = [];
    snap.forEach(d => {
      const data = d.data() as FieldUnit;
      if (data && data.id !== 'field-101' && data.id !== 'field-102' && data.id !== 'field-103') {
        list.push(data);
      }
    });
    return list;
  } catch (e) {
    console.warn('Firestore Field Unit fetch note:', e);
    return null;
  }
}

/**
 * Merges incoming remote records with the local cache in a NON-DESTRUCTIVE manner.
 * Never drops locally created or updated units that have not finished syncing to Firestore.
 */
function mergeWithLocalCache(remoteUnits: FieldUnit[]): FieldUnit[] {
  const deleted = getDeletedFieldUnitIds();
  const map = new Map<string, FieldUnit>();

  // First, add all existing local units that have NOT been explicitly deleted
  fieldUnitsCache.forEach(u => {
    if (u && u.id && !deleted.has(u.id)) {
      map.set(u.id, u);
    }
  });

  // Second, integrate remote units
  remoteUnits.forEach(rem => {
    if (!rem || !rem.id || deleted.has(rem.id)) return;
    const local = map.get(rem.id);
    if (!local) {
      map.set(rem.id, rem);
    } else {
      // If local is currently marked as pending sync, preserve local changes
      if ((local as any)._pendingSync) {
        return;
      }
      const remTime = new Date(rem.updatedAt || rem.createdAt || 0).getTime();
      const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
      if (remTime >= localTime) {
        map.set(rem.id, rem);
      }
    }
  });

  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return merged;
}

// Push any pending local units to Firestore if they aren't on the cloud yet
function pushPendingLocalUnitsToFirestore() {
  const deleted = getDeletedFieldUnitIds();
  fieldUnitsCache.forEach(u => {
    if (u && !deleted.has(u.id) && !u.id.startsWith('field-101') && !u.id.startsWith('field-102') && !u.id.startsWith('field-103')) {
      if ((u as any)._pendingSync) {
        syncFieldUnitToFirestore(u);
      }
    }
  });
}

// Attach Real-Time Firestore Listener for Live Multi-Device Sync
if (db) {
  try {
    const colRef = collection(db, 'field_units');
    onSnapshot(colRef, (snap: any) => {
      if (snap) {
        const list: FieldUnit[] = [];
        snap.forEach((d: any) => {
          const data = d.data() as FieldUnit;
          if (data && data.id !== 'field-101' && data.id !== 'field-102' && data.id !== 'field-103') {
            list.push(data);
          }
        });

        // Non-destructive merge preserves any freshly created local unit
        const merged = mergeWithLocalCache(list);
        fieldUnitsCache = merged;
        safeLocalStorageSet(STORAGE_KEY_FIELD_UNITS, merged);
        idbSaveAll('field_units', merged);
        notifySubscribers();
      }
    }, (err: any) => {
      console.warn('[FieldUnitStore] Real-time listener error:', err);
    });
  } catch (e) {
    console.warn('[FieldUnitStore] Could not set up real-time listener:', e);
  }
}

// Automatically fetch from Firestore / Supabase on init
initDataSync();

async function initDataSync() {
  try {
    // Try fetching from Firestore first
    const firestoreData = await fetchFieldUnitsFromFirestore();
    if (firestoreData && firestoreData.length > 0) {
      const clean = firestoreData.filter(u => u && u.id !== 'field-101' && u.id !== 'field-102' && u.id !== 'field-103');
      const merged = mergeWithLocalCache(clean);
      fieldUnitsCache = merged;
      safeLocalStorageSet(STORAGE_KEY_FIELD_UNITS, merged);
      idbSaveAll('field_units', merged);
      notifySubscribers();
      pushPendingLocalUnitsToFirestore();
      return;
    }

    // Fallback to Supabase
    const remoteData = await fetchFieldUnitsFromSupabase();
    if (remoteData && remoteData.length > 0) {
      const clean = remoteData.filter(u => u && u.id !== 'field-101' && u.id !== 'field-102' && u.id !== 'field-103');
      const merged = mergeWithLocalCache(clean);
      fieldUnitsCache = merged;
      safeLocalStorageSet(STORAGE_KEY_FIELD_UNITS, merged);
      idbSaveAll('field_units', merged);
      notifySubscribers();
      clean.forEach(u => syncFieldUnitToFirestore(u));
    }
  } catch (e) {
    console.warn('Field units Cloud sync note:', e);
  }
}

function notifySubscribers() {
  subscribers.forEach(cb => cb());
}

function loadLocalFieldUnits(): FieldUnit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIELD_UNITS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((u: any) => u && u.id !== 'field-101' && u.id !== 'field-102' && u.id !== 'field-103');
      }
    }
    return [];
  } catch (err) {
    return [];
  }
}

function saveLocalFieldUnits(units: FieldUnit[]) {
  const clean = (units || []).filter(u => u && u.id !== 'field-101' && u.id !== 'field-102' && u.id !== 'field-103');
  fieldUnitsCache = clean;
  safeLocalStorageSet(STORAGE_KEY_FIELD_UNITS, clean);
  idbSaveAll('field_units', clean);
  if (localFieldBus) {
    try { localFieldBus.postMessage({ timestamp: Date.now() }); } catch {}
  }
  broadcastLabRealtimeEvent('field_units_change', { timestamp: Date.now() });
  notifySubscribers();
}

export function subscribeFieldUnitStore(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getFieldUnits(): FieldUnit[] {
  return [...fieldUnitsCache];
}

export function addFieldUnit(unitData: Omit<FieldUnit, 'id' | 'createdAt' | 'updatedAt' | 'observations'>): FieldUnit | null {
  if (!requireOnlineForSave(`Add Field Unit: ${unitData.modelName || 'New Unit'}`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  const newUnit: FieldUnit = {
    ...unitData,
    id: `field-${Date.now()}`,
    observations: [],
    createdAt: formattedDate,
    updatedAt: formattedDate
  };
  (newUnit as any)._pendingSync = true;
  unmarkFieldUnitDeleted(newUnit.id);

  const updated = [newUnit, ...fieldUnitsCache];
  saveLocalFieldUnits(updated);

  // Sync to Supabase & Firestore
  syncFieldUnitToSupabase(newUnit);
  syncFieldUnitToFirestore(newUnit);

  addLabNotification(
    `Field Unit Added: ${newUnit.modelName}`,
    `Station: ${newUnit.station} | Serial: ${newUnit.serialNumber}`
  );

  return newUnit;
}

export function updateFieldUnitStatus(id: string, status: FieldUnit['status'], doneHour?: number): FieldUnit | null {
  if (!requireOnlineForSave(`Update Field Unit status to ${status}`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let updatedUnit: FieldUnit | null = null;

  const updated = fieldUnitsCache.map(u => {
    if (u.id === id) {
      const existingObs = u.observations || [];
      let autoNoteText = '';

      if (status === 'stopped') {
        autoNoteText = `Test Stopped at ${formattedDate}`;
      } else if (status === 'finished') {
        autoNoteText = `Test Passed & Completed at ${formattedDate}`;
      } else if (status === 'live' && u.status === 'stopped') {
        autoNoteText = `Test Resumed at ${formattedDate}`;
      }

      const autoObs = autoNoteText ? [{
        id: `obs-auto-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        text: autoNoteText,
        timestamp: formattedDate
      }] : [];

      updatedUnit = {
        ...u,
        status,
        ...(typeof doneHour === 'number' ? { doneHour } : {}),
        endDateTime: status === 'stopped' || status === 'finished' ? formattedDate : (status === 'live' ? '' : (u.endDateTime || '')),
        observations: [...autoObs, ...existingObs],
        updatedAt: formattedDate
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalFieldUnits(updated);

  if (updatedUnit) {
    syncFieldUnitToSupabase(updatedUnit);
    syncFieldUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function updateFieldUnit(id: string, updates: Partial<FieldUnit>): FieldUnit | null {
  if (!requireOnlineForSave(`Update Field Unit (${id})`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let updatedUnit: FieldUnit | null = null;

  const updated = fieldUnitsCache.map(u => {
    if (u.id === id) {
      updatedUnit = {
        ...u,
        ...updates,
        updatedAt: formattedDate,
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalFieldUnits(updated);

  if (updatedUnit) {
    syncFieldUnitToSupabase(updatedUnit);
    syncFieldUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function addFieldUnitObservation(id: string, text: string): FieldUnit | null {
  if (!requireOnlineForSave(`Add Observation to Field Unit (${id})`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let updatedUnit: FieldUnit | null = null;

  const updated = fieldUnitsCache.map(u => {
    if (u.id === id) {
      const existingObs = u.observations || [];
      const newObs = {
        id: `obs-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        text: text.trim(),
        timestamp: formattedDate
      };
      updatedUnit = {
        ...u,
        observations: [newObs, ...existingObs],
        updatedAt: formattedDate
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalFieldUnits(updated);

  if (updatedUnit) {
    syncFieldUnitToSupabase(updatedUnit);
    syncFieldUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function deleteFieldUnitObservation(id: string, obsId: string): FieldUnit | null {
  if (!requireOnlineForSave(`Delete Observation on Field Unit (${id})`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let updatedUnit: FieldUnit | null = null;

  const updated = fieldUnitsCache.map(u => {
    if (u.id === id) {
      const existingObs = u.observations || [];
      updatedUnit = {
        ...u,
        observations: existingObs.filter(o => o.id !== obsId),
        updatedAt: formattedDate
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalFieldUnits(updated);

  if (updatedUnit) {
    syncFieldUnitToSupabase(updatedUnit);
    syncFieldUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function deleteFieldUnit(id: string) {
  markFieldUnitDeleted(id);
  const updated = fieldUnitsCache.filter(u => u.id !== id);
  saveLocalFieldUnits(updated);

  broadcastLabRealtimeEvent('field_units_change', { deletedId: id, timestamp: Date.now() });

  // Delete from Supabase & Firestore asynchronously
  deleteFieldUnitFromSupabase(id).catch(err => console.warn('[FieldUnitStore] Supabase delete note:', err));
  deleteFieldUnitFromFirestore(id).catch(err => console.warn('[FieldUnitStore] Firestore delete note:', err));
}

export function getAllFieldUnits(): FieldUnit[] {
  return [...fieldUnitsCache];
}

export function setFieldUnitsDirectly(units: FieldUnit[]) {
  saveLocalFieldUnits(units);
}

export function clearAllFieldUnits() {
  saveLocalFieldUnits([]);
}
