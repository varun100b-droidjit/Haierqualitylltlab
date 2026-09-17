import { ProtoUnit } from '../types';
import { addLabNotification } from './unitStore';
import { 
  syncProtoUnitToSupabase, 
  deleteProtoUnitFromSupabase, 
  fetchProtoUnitsFromSupabase,
  broadcastLabRealtimeEvent,
  subscribeToLabRealtimeEvents
} from '../lib/supabase';
import { db, collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from './firebase';
import { requireOnlineForSave } from './networkManager';
import { buildNormalizedPhotos } from '../utils/photoManager';
import { cleanForFirestore, enforceFirestoreDocSizeLimit } from './firestoreSanitizer';
import { safeLocalStorageSet, idbSaveAll, idbGetAll } from '../lib/indexedDbStorage';

const STORAGE_KEY_PROTO_UNITS = 'llt_proto_units_v1';
const DELETED_PROTO_UNITS_KEY = 'llt_deleted_proto_units_v1';

// Helper to track explicitly deleted unit IDs to prevent resurrection during sync
function getDeletedProtoUnitIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_PROTO_UNITS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markProtoUnitDeleted(id: string) {
  const set = getDeletedProtoUnitIds();
  set.add(id);
  try {
    localStorage.setItem(DELETED_PROTO_UNITS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function unmarkProtoUnitDeleted(id: string) {
  const set = getDeletedProtoUnitIds();
  if (set.has(id)) {
    set.delete(id);
    try {
      localStorage.setItem(DELETED_PROTO_UNITS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }
}

// Helper to generate a random unique 5-digit string (e.g., "54321")
export function generate5DigitSerial(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

const INITIAL_PROTO_UNITS: ProtoUnit[] = [];

let protoUnitsCache: ProtoUnit[] = loadLocalProtoUnits();
const listeners: Set<() => void> = new Set();

// Local Inter-Tab Broadcast Channel
const localProtoBus = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('llt_proto_bus') 
  : null;

if (localProtoBus) {
  localProtoBus.onmessage = () => {
    protoUnitsCache = loadLocalProtoUnits();
    notifyListeners();
  };
}

// Storage event listener
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY_PROTO_UNITS) {
      protoUnitsCache = loadLocalProtoUnits();
      notifyListeners();
    }
  });
}

// Global Supabase Realtime event listener
subscribeToLabRealtimeEvents((event, payload) => {
  if (event === 'proto_units_change') {
    if (payload?.deletedId) {
      markProtoUnitDeleted(payload.deletedId);
      protoUnitsCache = protoUnitsCache.filter(u => u.id !== payload.deletedId);
      safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, protoUnitsCache);
      notifyListeners();
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

export async function syncProtoUnitToFirestore(unit: ProtoUnit) {
  if (!db || !unit || unit.id.startsWith('proto-101') || unit.id.startsWith('proto-102')) return;
  try {
    const sanitized = enforceFirestoreDocSizeLimit(cleanForFirestore(unit));
    const docRef = doc(db, 'proto_units', unit.id);
    await setDoc(docRef, sanitized, { merge: true });
    // Remove local pending flag once successfully confirmed on Firestore
    if ((unit as any)._pendingSync) {
      delete (unit as any)._pendingSync;
      safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, protoUnitsCache);
    }
    console.log('Successfully synced Proto Unit to Firebase Firestore:', unit.id);
  } catch (e) {
    console.warn('Firestore Proto Unit sync note:', e);
  }
}

export async function deleteProtoUnitFromFirestore(id: string) {
  if (!db) return;
  try {
    const docRef = doc(db, 'proto_units', id);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Firestore Proto Unit delete note:', e);
  }
}

export async function fetchProtoUnitsFromFirestore(): Promise<ProtoUnit[] | null> {
  if (!db) return null;
  try {
    const colRef = collection(db, 'proto_units');
    const snap = await getDocs(colRef);
    if (snap.empty) return null;
    const list: ProtoUnit[] = [];
    snap.forEach(d => {
      const data = d.data() as ProtoUnit;
      if (data && data.id !== 'proto-101' && data.id !== 'proto-102') {
        list.push(data);
      }
    });
    return list;
  } catch (e) {
    console.warn('Firestore Proto Unit fetch note:', e);
    return null;
  }
}

/**
 * Merges incoming remote records with the local cache in a NON-DESTRUCTIVE manner.
 * Never drops locally created or updated units that have not finished syncing to Firestore.
 */
function mergeWithLocalCache(remoteUnits: ProtoUnit[]): ProtoUnit[] {
  const deleted = getDeletedProtoUnitIds();
  const map = new Map<string, ProtoUnit>();

  // First, add all existing local units that have NOT been explicitly deleted
  protoUnitsCache.forEach(u => {
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
  const deleted = getDeletedProtoUnitIds();
  protoUnitsCache.forEach(u => {
    if (u && !deleted.has(u.id) && !u.id.startsWith('proto-101') && !u.id.startsWith('proto-102')) {
      if ((u as any)._pendingSync) {
        syncProtoUnitToFirestore(u);
      }
    }
  });
}

// Attach Real-Time Firestore Listener for Live Multi-Device Sync
if (db) {
  try {
    const colRef = collection(db, 'proto_units');
    onSnapshot(colRef, (snap: any) => {
      if (snap) {
        const list: ProtoUnit[] = [];
        snap.forEach((d: any) => {
          const data = d.data() as ProtoUnit;
          if (data && data.id !== 'proto-101' && data.id !== 'proto-102') {
            list.push(data);
          }
        });

        // Non-destructive merge preserves any freshly created local unit
        const merged = mergeWithLocalCache(list);
        protoUnitsCache = merged;
        safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, merged);
        idbSaveAll('proto_units', merged);
        notifyListeners();
      }
    }, (err: any) => {
      console.warn('[ProtoUnitStore] Real-time listener error:', err);
    });
  } catch (e) {
    console.warn('[ProtoUnitStore] Could not set up real-time listener:', e);
  }
}

// Automatically fetch from Firestore / Supabase on init
initDataSync();

async function initDataSync() {
  try {
    // Try fetching from Firestore first
    const firestoreData = await fetchProtoUnitsFromFirestore();
    if (firestoreData && firestoreData.length > 0) {
      const clean = firestoreData.filter(u => u && u.id !== 'proto-101' && u.id !== 'proto-102');
      const merged = mergeWithLocalCache(clean);
      protoUnitsCache = merged;
      safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, merged);
      idbSaveAll('proto_units', merged);
      notifyListeners();
      pushPendingLocalUnitsToFirestore();
      return;
    }

    // Fallback to Supabase
    const remoteData = await fetchProtoUnitsFromSupabase();
    if (remoteData && remoteData.length > 0) {
      const cleanRemote = remoteData.filter(u => u && u.id !== 'proto-101' && u.id !== 'proto-102');
      const merged = mergeWithLocalCache(cleanRemote);
      protoUnitsCache = merged;
      safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, merged);
      idbSaveAll('proto_units', merged);
      notifyListeners();
      cleanRemote.forEach(u => syncProtoUnitToFirestore(u));
    }
  } catch (e) {
    console.warn('Proto Units cloud sync note:', e);
  }
}

function notifyListeners() {
  listeners.forEach(fn => fn());
}

export function subscribeProtoUnitStore(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function saveLocalProtoUnits(data: ProtoUnit[]) {
  const clean = (data || []).filter(u => u && u.id !== 'proto-101' && u.id !== 'proto-102');
  protoUnitsCache = clean;
  safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, clean);
  idbSaveAll('proto_units', clean);
  if (localProtoBus) {
    try { localProtoBus.postMessage({ timestamp: Date.now() }); } catch {}
  }
  broadcastLabRealtimeEvent('proto_units_change', { timestamp: Date.now() });
  notifyListeners();
}

function loadLocalProtoUnits(): ProtoUnit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROTO_UNITS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((u: any) => u && u.id !== 'proto-101' && u.id !== 'proto-102');
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

export function getProtoUnits(): ProtoUnit[] {
  return [...protoUnitsCache];
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

function sanitizeStringFields<T>(obj: T, parentKey = ''): T {
  if (parentKey === 'photos' || parentKey === 'photoRecords' || parentKey === 'photoUrl') {
    return obj;
  }
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    return (trimmed === '' ? 'NA' : trimmed) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeStringFields(item, parentKey)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'photos' || key === 'photoRecords') {
        result[key] = value;
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        result[key] = (trimmed === '' ? 'NA' : trimmed);
      } else if (value !== null && typeof value === 'object') {
        result[key] = sanitizeStringFields(value, key);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}

export function addProtoUnit(unit: Omit<ProtoUnit, 'id' | 'createdAt' | 'updatedAt'> & { status?: 'live' | 'stopped' | 'finished' }): ProtoUnit | null {
  if (!requireOnlineForSave(`Add Proto Unit: ${unit.modelName || 'New Unit'}`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  const sanitizedUnit = sanitizeStringFields(unit);

  const normalized = buildNormalizedPhotos(sanitizedUnit.photos || {});

  const newUnit: ProtoUnit = {
    ...sanitizedUnit,
    photos: normalized.photos,
    id: `proto-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    status: sanitizedUnit.status || 'live',
    createdAt: formattedDate,
    updatedAt: formattedDate,
  };
  (newUnit as any)._pendingSync = true;
  unmarkProtoUnitDeleted(newUnit.id);

  const updated = [newUnit, ...protoUnitsCache];
  saveLocalProtoUnits(updated);

  // Sync to Supabase & Firebase Firestore
  syncProtoUnitToSupabase(newUnit);
  syncProtoUnitToFirestore(newUnit);

  addLabNotification(
    `Proto Unit Added: ${newUnit.modelName}`,
    `Station: ${newUnit.station} | IDU: ${newUnit.iduSerialNumber || 'NA'}, ODU: ${newUnit.oduSerialNumber || 'NA'}`
  );

  return newUnit;
}

export function updateProtoUnitStatus(id: string, status: 'live' | 'finished' | 'stopped', doneHour?: number): void {
  if (!requireOnlineForSave(`Update Proto Unit status to ${status}`)) {
    return;
  }
  const formattedDate = getFormattedNow();

  let targetUnit: ProtoUnit | null = null;
  const updated = protoUnitsCache.map(u => {
    if (u.id === id) {
      targetUnit = {
        ...u,
        status,
        ...(typeof doneHour === 'number' ? { doneHour } : {}),
        updatedAt: formattedDate,
      };
      return targetUnit;
    }
    return u;
  });
  saveLocalProtoUnits(updated);

  if (targetUnit) {
    syncProtoUnitToSupabase(targetUnit);
    syncProtoUnitToFirestore(targetUnit);
  }
}

export function updateProtoUnit(id: string, updates: Partial<ProtoUnit>): ProtoUnit | null {
  if (!requireOnlineForSave(`Update Proto Unit (${id})`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let updatedUnit: ProtoUnit | null = null;

  const normalizedUpdates = { ...updates };
  if (updates.photos) {
    const norm = buildNormalizedPhotos(updates.photos);
    normalizedUpdates.photos = norm.photos;
  }

  const updated = protoUnitsCache.map(u => {
    if (u.id === id) {
      updatedUnit = {
        ...u,
        ...normalizedUpdates,
        updatedAt: formattedDate,
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalProtoUnits(updated);

  if (updatedUnit) {
    syncProtoUnitToSupabase(updatedUnit);
    syncProtoUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function deleteProtoUnit(id: string): void {
  markProtoUnitDeleted(id);
  const updated = protoUnitsCache.filter(u => u.id !== id);
  saveLocalProtoUnits(updated);

  broadcastLabRealtimeEvent('proto_units_change', { deletedId: id, timestamp: Date.now() });

  // Delete from Supabase & Firestore asynchronously
  deleteProtoUnitFromSupabase(id).catch(err => console.warn('[ProtoUnitStore] Supabase delete note:', err));
  deleteProtoUnitFromFirestore(id).catch(err => console.warn('[ProtoUnitStore] Firestore delete note:', err));
}

export function addProtoUnitObservation(id: string, text: string): ProtoUnit | null {
  if (!requireOnlineForSave(`Add Observation to Proto Unit (${id})`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let updatedUnit: ProtoUnit | null = null;

  const updated = protoUnitsCache.map(u => {
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

  saveLocalProtoUnits(updated);

  if (updatedUnit) {
    syncProtoUnitToSupabase(updatedUnit);
    syncProtoUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function deleteProtoUnitObservation(id: string, obsId: string): ProtoUnit | null {
  if (!requireOnlineForSave(`Delete Observation on Proto Unit (${id})`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let updatedUnit: ProtoUnit | null = null;

  const updated = protoUnitsCache.map(u => {
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

  saveLocalProtoUnits(updated);

  if (updatedUnit) {
    syncProtoUnitToSupabase(updatedUnit);
    syncProtoUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function getAllProtoUnits(): ProtoUnit[] {
  return [...protoUnitsCache];
}

export function setProtoUnitsDirectly(units: ProtoUnit[]) {
  saveLocalProtoUnits(units);
}

export function clearAllProtoUnits() {
  saveLocalProtoUnits([]);
}
