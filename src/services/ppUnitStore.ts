import { PpUnit } from '../types';
import { addLabNotification } from './unitStore';
import { 
  syncPpUnitToSupabase, 
  deletePpUnitFromSupabase, 
  fetchPpUnitsFromSupabase,
  broadcastLabRealtimeEvent,
  subscribeToLabRealtimeEvents 
} from '../lib/supabase';
import { db, collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from './firebase';
import { requireOnlineForSave } from './networkManager';

const STORAGE_KEY_PP_UNITS = 'llt_pp_units_v1';

// Helper to generate a random unique 5-digit string (e.g., "54321")
export function generatePp5DigitSerial(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

const INITIAL_PP_UNITS: PpUnit[] = [];

let ppUnitsCache: PpUnit[] = loadLocalPpUnits();
const listeners: Set<() => void> = new Set();

// Local Inter-Tab Broadcast Channel
const localPpBus = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('llt_pp_bus') 
  : null;

if (localPpBus) {
  localPpBus.onmessage = () => {
    ppUnitsCache = loadLocalPpUnits();
    notifyListeners();
  };
}

// Storage event listener
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY_PP_UNITS) {
      ppUnitsCache = loadLocalPpUnits();
      notifyListeners();
    }
  });
}

// Global Supabase Realtime event listener
subscribeToLabRealtimeEvents((event) => {
  if (event === 'pp_units_change') {
    initDataSync();
  }
});

// Periodic background sync check
if (typeof window !== 'undefined') {
  setInterval(() => {
    initDataSync();
  }, 6000);
}

/* ==========================================
   FIREBASE FIRESTORE SYNC HELPERS & REAL-TIME LISTENER
   ========================================== */

export async function syncPpUnitToFirestore(unit: PpUnit) {
  if (!db || !unit || unit.id.startsWith('pp-idu-') || unit.id.startsWith('pp-odu-')) return;
  try {
    const docRef = doc(db, 'pp_units', unit.id);
    await setDoc(docRef, { ...unit }, { merge: true });
    console.log('Successfully synced PP Unit to Firebase Firestore:', unit.id);
  } catch (e) {
    console.warn('Firestore PP Unit sync note:', e);
  }
}

export async function deletePpUnitFromFirestore(id: string) {
  if (!db) return;
  try {
    const docRef = doc(db, 'pp_units', id);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Firestore PP Unit delete note:', e);
  }
}

export async function fetchPpUnitsFromFirestore(): Promise<PpUnit[] | null> {
  if (!db) return null;
  try {
    const colRef = collection(db, 'pp_units');
    const snap = await getDocs(colRef);
    if (snap.empty) return null;
    const list: PpUnit[] = [];
    snap.forEach(d => {
      const data = d.data() as PpUnit;
      if (data && !data.id.startsWith('pp-idu-') && !data.id.startsWith('pp-odu-')) {
        list.push(data);
      }
    });
    return list;
  } catch (e) {
    console.warn('Firestore PP Unit fetch note:', e);
    return null;
  }
}

// Attach Real-Time Firestore Listener for Live Multi-Device Sync
if (db) {
  try {
    const colRef = collection(db, 'pp_units');
    onSnapshot(colRef, (snap: any) => {
      if (snap) {
        const list: PpUnit[] = [];
        snap.forEach((d: any) => {
          const data = d.data() as PpUnit;
          if (data && !data.id.startsWith('pp-idu-') && !data.id.startsWith('pp-odu-')) {
            list.push(data);
          }
        });
        if (list.length > 0) {
          // Sort by creation date descending
          list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          ppUnitsCache = list;
          try { localStorage.setItem(STORAGE_KEY_PP_UNITS, JSON.stringify(list)); } catch {}
          notifyListeners();
        }
      }
    }, (err: any) => {
      console.warn('[PPUnitStore] Real-time listener error:', err);
    });
  } catch (e) {
    console.warn('[PPUnitStore] Could not set up real-time listener:', e);
  }
}

// Automatically fetch from Firestore / Supabase on init
initDataSync();

async function initDataSync() {
  try {
    // Try fetching from Firestore first
    const firestoreData = await fetchPpUnitsFromFirestore();
    if (firestoreData && firestoreData.length > 0) {
      const clean = firestoreData.filter(u => u && !u.id.startsWith('pp-idu-') && !u.id.startsWith('pp-odu-'));
      ppUnitsCache = clean;
      try { localStorage.setItem(STORAGE_KEY_PP_UNITS, JSON.stringify(clean)); } catch {}
      notifyListeners();
      return;
    }

    // Fallback to Supabase
    const remoteData = await fetchPpUnitsFromSupabase();
    if (remoteData && remoteData.length > 0) {
      const clean = remoteData.filter(u => u && !u.id.startsWith('pp-idu-') && !u.id.startsWith('pp-odu-'));
      ppUnitsCache = clean;
      try { localStorage.setItem(STORAGE_KEY_PP_UNITS, JSON.stringify(clean)); } catch {}
      notifyListeners();
      clean.forEach(u => syncPpUnitToFirestore(u));
    }
  } catch (e) {
    console.warn('Data sync note in PP Store:', e);
  }
}

function notifyListeners() {
  listeners.forEach(fn => fn());
}

export function subscribePpUnitStore(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function saveLocalPpUnits(data: PpUnit[]) {
  const clean = (data || []).filter(u => u && !u.id.startsWith('pp-idu-') && !u.id.startsWith('pp-odu-'));
  ppUnitsCache = clean;
  try { localStorage.setItem(STORAGE_KEY_PP_UNITS, JSON.stringify(clean)); } catch {}
  if (localPpBus) {
    try { localPpBus.postMessage({ timestamp: Date.now() }); } catch {}
  }
  broadcastLabRealtimeEvent('pp_units_change', { timestamp: Date.now() });
  notifyListeners();
}

function loadLocalPpUnits(): PpUnit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PP_UNITS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((u: any) => u && !u.id.startsWith('pp-idu-') && !u.id.startsWith('pp-odu-'));
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

export function getPpUnits(): PpUnit[] {
  return [...ppUnitsCache];
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

import { buildNormalizedPhotos } from '../utils/photoManager';

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

export function addPpUnit(unit: Omit<PpUnit, 'id' | 'createdAt' | 'updatedAt'> & { status?: 'live' | 'stopped' | 'finished' }): PpUnit | null {
  if (!requireOnlineForSave(`Add PP Unit: ${unit.modelName || 'New Unit'}`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  const sanitizedUnit = sanitizeStringFields(unit);

  const normalized = buildNormalizedPhotos(sanitizedUnit.photos || {});

  const newUnit: PpUnit = {
    ...sanitizedUnit,
    photos: normalized.photos,
    id: `pp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    status: sanitizedUnit.status || 'live',
    createdAt: formattedDate,
    updatedAt: formattedDate,
  };

  const updated = [newUnit, ...ppUnitsCache];
  saveLocalPpUnits(updated);

  // Sync to Supabase & Firebase Firestore
  syncPpUnitToSupabase(newUnit);
  syncPpUnitToFirestore(newUnit);

  addLabNotification(
    `PP Unit Added: ${newUnit.modelName}`,
    `Station: ${newUnit.station} | IDU: ${newUnit.iduSerialNumber || 'NA'}, ODU: ${newUnit.oduSerialNumber || 'NA'}`
  );

  return newUnit;
}

export function updatePpUnit(id: string, updates: Partial<PpUnit>): PpUnit | null {
  if (!requireOnlineForSave(`Update PP Unit (${id})`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let targetUnit: PpUnit | null = null;
  const updated = ppUnitsCache.map(u => {
    if (u.id === id) {
      targetUnit = {
        ...u,
        ...updates,
        updatedAt: formattedDate,
      };
      return targetUnit;
    }
    return u;
  });
  saveLocalPpUnits(updated);

  if (targetUnit) {
    syncPpUnitToSupabase(targetUnit);
    syncPpUnitToFirestore(targetUnit);
  }
  return targetUnit;
}

export function togglePpUnitStatus(id: string, newStatus: 'live' | 'finished' | 'stopped'): PpUnit | null {
  if (!requireOnlineForSave(`Change PP Unit status to ${newStatus}`)) {
    return null;
  }
  const formattedDate = getFormattedNow();
  let targetUnit: PpUnit | null = null;
  const updated = ppUnitsCache.map(u => {
    if (u.id === id) {
      targetUnit = {
        ...u,
        status: newStatus,
        updatedAt: formattedDate,
      };
      return targetUnit;
    }
    return u;
  });
  saveLocalPpUnits(updated);

  if (targetUnit) {
    syncPpUnitToSupabase(targetUnit);
    syncPpUnitToFirestore(targetUnit);
  }
  return targetUnit;
}

export function updatePpUnitStatus(id: string, status: 'live' | 'finished' | 'stopped'): void {
  if (!requireOnlineForSave(`Update PP Unit status to ${status}`)) {
    return;
  }
  const formattedDate = getFormattedNow();

  let targetUnit: PpUnit | null = null;
  const updated = ppUnitsCache.map(u => {
    if (u.id === id) {
      targetUnit = {
        ...u,
        status,
        updatedAt: formattedDate,
      };
      return targetUnit;
    }
    return u;
  });
  saveLocalPpUnits(updated);

  if (targetUnit) {
    syncPpUnitToSupabase(targetUnit);
    syncPpUnitToFirestore(targetUnit);
  }
}

export function passPpUnitWithDetails(
  id: string, 
  startDate?: string, 
  endDate?: string, 
  calculatedHours?: number
): void {
  if (!requireOnlineForSave(`Pass PP Unit (${id})`)) {
    return;
  }
  const formattedNow = getFormattedNow();

  let targetUnit: PpUnit | null = null;
  const updated = ppUnitsCache.map(u => {
    if (u.id === id) {
      let finalHours = u.requiredHour;
      if (typeof calculatedHours === 'number' && calculatedHours > 0) {
        finalHours = calculatedHours;
      } else if (startDate && endDate) {
        const startMs = new Date(startDate.replace(' ', 'T')).getTime();
        const endMs = new Date(endDate.replace(' ', 'T')).getTime();
        if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
          const diffHours = (endMs - startMs) / (1000 * 60 * 60);
          finalHours = Number(diffHours.toFixed(1));
        }
      }

      targetUnit = {
        ...u,
        status: 'finished',
        requiredHour: finalHours,
        createdAt: startDate || u.createdAt,
        updatedAt: endDate || formattedNow,
      };
      return targetUnit;
    }
    return u;
  });
  saveLocalPpUnits(updated);

  if (targetUnit) {
    syncPpUnitToSupabase(targetUnit);
    syncPpUnitToFirestore(targetUnit);
  }
}

export function deletePpUnit(id: string): void {
  if (!requireOnlineForSave(`Delete PP Unit (${id})`)) {
    return;
  }
  const updated = ppUnitsCache.filter(u => u.id !== id);
  saveLocalPpUnits(updated);

  // Delete from Supabase & Firestore
  deletePpUnitFromSupabase(id);
  deletePpUnitFromFirestore(id);
}

export function addPpUnitObservation(id: string, text: string): PpUnit | null {
  const formattedDate = getFormattedNow();
  let updatedUnit: PpUnit | null = null;

  const updated = ppUnitsCache.map(u => {
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

  saveLocalPpUnits(updated);

  if (updatedUnit) {
    syncPpUnitToSupabase(updatedUnit);
    syncPpUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

export function deletePpUnitObservation(id: string, obsId: string): PpUnit | null {
  const formattedDate = getFormattedNow();
  let updatedUnit: PpUnit | null = null;

  const updated = ppUnitsCache.map(u => {
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

  saveLocalPpUnits(updated);

  if (updatedUnit) {
    syncPpUnitToSupabase(updatedUnit);
    syncPpUnitToFirestore(updatedUnit);
  }

  return updatedUnit;
}

/* ==========================================
   PP UNIT DASHBOARD METRICS & MATCHING LOGIC
   ========================================== */

export function extractNumbersKey(str: string): string {
  if (!str) return '';
  const matches = str.match(/\d+/g);
  if (!matches || matches.length === 0) return '';
  return matches.join('-');
}

export function updatePpUnitQuantity(id: string, newQty: number): void {
  const formattedDate = getFormattedNow();
  let targetUnit: PpUnit | null = null;
  const updated = ppUnitsCache.map(u => {
    if (u.id === id) {
      targetUnit = {
        ...u,
        quantity: Math.max(0, newQty),
        updatedAt: formattedDate,
      };
      return targetUnit;
    }
    return u;
  });
  saveLocalPpUnits(updated);

  if (targetUnit) {
    syncPpUnitToSupabase(targetUnit);
    syncPpUnitToFirestore(targetUnit);
  }
}

export function isModelListEntry(u: PpUnit): boolean {
  if (!u) return false;
  if (u.isModelOnly === true || u.entrySource === 'model_list') return true;
  if (u.entrySource === 'unit_testing') return false;
  if (u.testPurpose && u.testPurpose.toLowerCase().includes('model registration')) return true;
  return false;
}

export function isUnitTestingEntry(u: PpUnit): boolean {
  return !isModelListEntry(u);
}

export interface MatchedPairResult {
  id: string;
  commonKey: string;
  iduModel: string;
  iduQty: number;
  oduModel: string;
  oduQty: number;
  matchedQty: number;
  balanceIduQty: number;
  balanceOduQty: number;
  status: 'Fully Matched' | 'Partially Matched' | 'IDU Available but ODU Not Available' | 'ODU Available but IDU Not Available' | 'Unmatched Models';
  iduItem?: PpUnit;
  oduItem?: PpUnit;
  // Unit Testing match status
  isPending: boolean;
  testingStatus: 'live' | 'stopped' | 'finished' | null;
  matchedTestingUnits: PpUnit[];
}

export function getIduOduMatchingPairs(units?: PpUnit[]): MatchedPairResult[] {
  const allUnits = units && units.length > 0 ? units : ppUnitsCache;
  const modelUnits = allUnits.filter(isModelListEntry);
  const testingUnits = allUnits.filter(isUnitTestingEntry);

  // If models are registered, use models for pairing; otherwise fallback to all units
  const unitsToMatch = modelUnits.length > 0 ? modelUnits : allUnits;

  const iduMap: { [key: string]: { modelName: string; totalQty: number; item?: PpUnit } } = {};
  const oduMap: { [key: string]: { modelName: string; totalQty: number; item?: PpUnit } } = {};

  unitsToMatch.forEach(u => {
    const isIdu = u.unitType === 'IDU' || Boolean(u.iduSerialNumber && !u.oduSerialNumber) || u.modelName.toUpperCase().includes('HSI') || u.modelName.toUpperCase().includes('IDU');
    const isOdu = u.unitType === 'ODU' || Boolean(u.oduSerialNumber && !u.iduSerialNumber) || u.modelName.toUpperCase().includes('HSO') || u.modelName.toUpperCase().includes('ODU');

    const key = extractNumbersKey(u.modelName);
    const qty = typeof u.quantity === 'number' ? Math.max(1, u.quantity) : 1;

    if (isIdu && !isOdu) {
      if (!iduMap[key]) {
        iduMap[key] = { modelName: u.modelName, totalQty: qty, item: u };
      } else {
        iduMap[key].totalQty += qty;
      }
    } else if (isOdu && !isIdu) {
      if (!oduMap[key]) {
        oduMap[key] = { modelName: u.modelName, totalQty: qty, item: u };
      } else {
        oduMap[key].totalQty += qty;
      }
    } else if (u.unitType === 'BOTH') {
      if (key) {
        if (!iduMap[key]) iduMap[key] = { modelName: `${u.modelName} (IDU)`, totalQty: qty, item: u };
        if (!oduMap[key]) oduMap[key] = { modelName: `${u.modelName} (ODU)`, totalQty: qty, item: u };
      }
    }
  });

  const allKeys = Array.from(new Set([...Object.keys(iduMap), ...Object.keys(oduMap)])).filter(Boolean);

  const results: MatchedPairResult[] = [];

  allKeys.forEach(key => {
    const iduData = iduMap[key] || { modelName: 'N/A (No IDU Model)', totalQty: 0 };
    const oduData = oduMap[key] || { modelName: 'N/A (No ODU Model)', totalQty: 0 };

    const iduQty = iduData.totalQty;
    const oduQty = oduData.totalQty;
    const matchedQty = Math.min(iduQty, oduQty);
    const balanceIduQty = iduQty - matchedQty;
    const balanceOduQty = oduQty - matchedQty;

    let status: MatchedPairResult['status'] = 'Unmatched Models';
    if (iduQty > 0 && oduQty > 0) {
      if (balanceIduQty === 0 && balanceOduQty === 0) {
        status = 'Fully Matched';
      } else {
        status = 'Partially Matched';
      }
    } else if (iduQty > 0 && oduQty === 0) {
      status = 'IDU Available but ODU Not Available';
    } else if (oduQty > 0 && iduQty === 0) {
      status = 'ODU Available but IDU Not Available';
    }

    // Match against Unit Testing units (Live, Stopped, Finished)
    // "Unit Testing ke Live, Stop, Finished ab enme jo Set model Match kr raha hai BOTH se wo thik hai. Jo Match nhi kr raha wo Dashboard me Pending me Qty daal dena. Aur haat Jo model Pending hai Wo Both me Us model Cardview ka outer line Red kr dena"
    const matchedTesting = testingUnits.filter(tu => {
      if (!tu.modelName) return false;
      const tName = tu.modelName.trim().toLowerCase();
      const iduN = iduData.modelName.trim().toLowerCase();
      const oduN = oduData.modelName.trim().toLowerCase();
      const tuKey = extractNumbersKey(tu.modelName);

      // Exact model match
      if (iduN !== 'n/a (no idu model)' && (tName === iduN || tName.includes(iduN) || iduN.includes(tName))) return true;
      if (oduN !== 'n/a (no odu model)' && (tName === oduN || tName.includes(oduN) || oduN.includes(tName))) return true;
      // Common number key match
      if (key && tuKey && key === tuKey) return true;
      // Serial match if available
      if (iduData.item?.iduSerialNumber && tu.iduSerialNumber && iduData.item.iduSerialNumber === tu.iduSerialNumber) return true;
      if (oduData.item?.oduSerialNumber && tu.oduSerialNumber && oduData.item.oduSerialNumber === tu.oduSerialNumber) return true;

      return false;
    });

    const isPending = matchedTesting.length === 0;
    const activeTestUnit = matchedTesting.find(tu => tu.status === 'live') ||
                           matchedTesting.find(tu => tu.status === 'stopped') ||
                           matchedTesting.find(tu => tu.status === 'finished') || null;

    results.push({
      id: `match-${key}`,
      commonKey: key,
      iduModel: iduData.modelName,
      iduQty,
      oduModel: oduData.modelName,
      oduQty,
      matchedQty,
      balanceIduQty,
      balanceOduQty,
      status,
      iduItem: iduData.item,
      oduItem: oduData.item,
      isPending,
      testingStatus: activeTestUnit?.status || null,
      matchedTestingUnits: matchedTesting,
    });
  });

  const priorityOrder: { [key in MatchedPairResult['status']]: number } = {
    'Fully Matched': 1,
    'Partially Matched': 2,
    'IDU Available but ODU Not Available': 3,
    'ODU Available but IDU Not Available': 4,
    'Unmatched Models': 5,
  };

  return results.sort((a, b) => priorityOrder[a.status] - priorityOrder[b.status]);
}

export interface PpUnitDashboardMetrics {
  iduQty: number;      // machines under Model List IDU
  oduQty: number;      // machines under Model List ODU
  bothQty: number;     // matched sets under Model List BOTH formed by IDU+ODU matching
  liveQty: number;     // units in Unit Testing with status === 'live'
  stoppedQty: number;  // units in Unit Testing with status === 'stopped'
  finishedQty: number; // units in Unit Testing with status === 'finished'
  pendingQty: number;  // BOTH sets that do NOT match any unit in Unit Testing (Live/Stop/Finished)
  pendingModels: MatchedPairResult[];
  matchedModels: MatchedPairResult[];
  bothPairs: MatchedPairResult[];
}

export function calculatePpUnitMetrics(units?: PpUnit[]): PpUnitDashboardMetrics {
  const allUnits = units && units.length > 0 ? units : ppUnitsCache;
  const modelUnits = allUnits.filter(isModelListEntry);
  const testingUnits = allUnits.filter(isUnitTestingEntry);

  const effectiveModels = modelUnits.length > 0 ? modelUnits : allUnits;

  // 1. IDU Qty: Total machine quantity under Model List IDU
  let iduQty = 0;
  effectiveModels.forEach(u => {
    const isIdu = u.unitType === 'IDU' || Boolean(u.iduSerialNumber && !u.oduSerialNumber) || u.modelName.toUpperCase().includes('HSI') || u.modelName.toUpperCase().includes('IDU');
    const isOdu = u.unitType === 'ODU' || Boolean(u.oduSerialNumber && !u.iduSerialNumber) || u.modelName.toUpperCase().includes('HSO') || u.modelName.toUpperCase().includes('ODU');
    if (isIdu && !isOdu) {
      iduQty += (typeof u.quantity === 'number' ? Math.max(1, u.quantity) : 1);
    } else if (u.unitType === 'BOTH') {
      iduQty += (typeof u.quantity === 'number' ? Math.max(1, u.quantity) : 1);
    }
  });

  // 2. ODU Qty: Total machine quantity under Model List ODU
  let oduQty = 0;
  effectiveModels.forEach(u => {
    const isIdu = u.unitType === 'IDU' || Boolean(u.iduSerialNumber && !u.oduSerialNumber) || u.modelName.toUpperCase().includes('HSI') || u.modelName.toUpperCase().includes('IDU');
    const isOdu = u.unitType === 'ODU' || Boolean(u.oduSerialNumber && !u.iduSerialNumber) || u.modelName.toUpperCase().includes('HSO') || u.modelName.toUpperCase().includes('ODU');
    if (isOdu && !isIdu) {
      oduQty += (typeof u.quantity === 'number' ? Math.max(1, u.quantity) : 1);
    } else if (u.unitType === 'BOTH') {
      oduQty += (typeof u.quantity === 'number' ? Math.max(1, u.quantity) : 1);
    }
  });

  // 3. BOTH Qty: Total sets formed by IDU+ODU matching
  const bothPairs = getIduOduMatchingPairs(allUnits);
  let bothQty = 0;
  bothPairs.forEach(pair => {
    if (pair.matchedQty > 0) {
      bothQty += pair.matchedQty;
    }
  });
  if (bothQty === 0 && effectiveModels.some(u => u.unitType === 'BOTH')) {
    bothQty = effectiveModels.filter(u => u.unitType === 'BOTH').reduce((acc, u) => acc + (u.quantity || 1), 0);
  }

  // 4. Unit Testing Live, Stopped, Finished quantities
  const effectiveTesting = testingUnits.length > 0 ? testingUnits : (modelUnits.length === 0 ? allUnits : []);
  const liveQty = effectiveTesting.filter(u => u.status === 'live').length;
  const stoppedQty = effectiveTesting.filter(u => u.status === 'stopped').length;
  const finishedQty = effectiveTesting.filter(u => u.status === 'finished').length;

  // 5. Pending Qty:
  // "menu ke PP Unit ke Model list me jo BOTH hai usme jitni bhi machine set wo match krega Unit Testing ke Live, Stop, Finished ab enme jo Set model Match kr raha hai BOTH se wo thik hai. Jo Match nhi kr raha wo Dashboard me Pending me Qty daal dena."
  const pendingModels = bothPairs.filter(p => p.isPending);
  const matchedModels = bothPairs.filter(p => !p.isPending);
  const pendingQty = pendingModels.length;

  return {
    iduQty,
    oduQty,
    bothQty,
    liveQty,
    stoppedQty,
    finishedQty,
    pendingQty,
    pendingModels,
    matchedModels,
    bothPairs,
  };
}

export function getAllPpUnits(): PpUnit[] {
  return [...ppUnitsCache];
}

export function setPpUnitsDirectly(units: PpUnit[]) {
  saveLocalPpUnits(units);
}

export function clearAllPpUnits() {
  saveLocalPpUnits([]);
}

