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
  const cleaned = str.split(':')[0];
  const matches = cleaned.match(/\d+/g);
  if (!matches || matches.length === 0) return '';
  return matches.join('-');
}

export function getSubseries(str: string): string {
  if (!str) return '';
  const cleaned = str.split(':')[0];
  const m = cleaned.match(/HS[IO](\d+)([A-Z]+)?/i);
  return m && m[2] ? m[2].toUpperCase() : '';
}

export function getCapacityNumber(str: string): string {
  if (!str) return '';
  const cleaned = str.split(':')[0];
  const m = cleaned.match(/HS[IO](\d+)/i);
  return m ? m[1] : '';
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

export function isUnitTestingEntry(u: PpUnit): boolean {
  if (!u) return false;
  // If explicitly flagged
  if (u.entrySource === 'unit_testing') return true;
  if (u.entrySource === 'model_list' || u.isModelOnly === true) return false;

  // Check testPurpose for model registration keywords
  const purpose = (u.testPurpose || '').toLowerCase();
  if (
    purpose.includes('model registration') || 
    purpose.includes('master database') || 
    purpose.includes('idu model') || 
    purpose.includes('odu model')
  ) {
    return false;
  }

  // A genuine unit testing run submitted via AddPpUnitDialog has sampleType, reportDetails, namePlate, or partsInfo
  if (u.sampleType && u.sampleType.trim() !== '' && u.sampleType !== 'NA') {
    return true;
  }
  if (u.reportDetails && Object.keys(u.reportDetails).length > 0) {
    return true;
  }
  if (u.namePlate && Object.keys(u.namePlate).length > 0) {
    return true;
  }
  if (u.fourWaySwing && u.fourWaySwing !== 'NA') {
    return true;
  }
  if (u.rpm && u.rpm !== 'NA') {
    return true;
  }

  // Default fallback: if no testing form details exist, treat as model registration
  return false;
}

export function isModelListEntry(u: PpUnit): boolean {
  return !isUnitTestingEntry(u);
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

  const iduList: PpUnit[] = [];
  const oduList: PpUnit[] = [];

  unitsToMatch.forEach(u => {
    const isIdu = u.unitType === 'IDU' || Boolean(u.iduSerialNumber && !u.oduSerialNumber) || u.modelName.toUpperCase().includes('HSI') || u.modelName.toUpperCase().includes('IDU');
    const isOdu = u.unitType === 'ODU' || Boolean(u.oduSerialNumber && !u.iduSerialNumber) || u.modelName.toUpperCase().includes('HSO') || u.modelName.toUpperCase().includes('ODU');

    if (isIdu && !isOdu) {
      iduList.push(u);
    } else if (isOdu && !isIdu) {
      oduList.push(u);
    } else if (u.unitType === 'BOTH') {
      iduList.push(u);
      oduList.push(u);
    }
  });

  const pairedOduIds = new Set<string>();
  const results: MatchedPairResult[] = [];

  // Pair each IDU with its compatible ODU
  // Note: One ODU can be paired with multiple IDU models (e.g., HSO19-2NT-I with HSI19N-S2NT-I, HSI19N-G2NT-I, HSI19VP-G2NT-I)
  iduList.forEach(idu => {
    const iduKey = extractNumbersKey(idu.modelName);
    const iduSub = getSubseries(idu.modelName);
    const iduCap = getCapacityNumber(idu.modelName);

    // 1. Exact numbers key match (e.g. 19-2 with 19-2, 19-3 with 19-3)
    let candidates = oduList.filter(o => extractNumbersKey(o.modelName) === iduKey);

    // 2. If no exact numbers key match, fallback to capacity match (e.g. 19 series)
    if (candidates.length === 0 && iduCap) {
      candidates = oduList.filter(o => getCapacityNumber(o.modelName) === iduCap);
    }

    let matchedOdu: PpUnit | null = null;
    if (candidates.length === 1) {
      matchedOdu = candidates[0];
    } else if (candidates.length > 1) {
      // If there is an exact subseries match (e.g. HC with HC), prefer it
      if (iduSub) {
        matchedOdu = candidates.find(o => getSubseries(o.modelName) === iduSub) || null;
      }
      if (!matchedOdu) {
        // Otherwise prefer general candidate without subseries or first candidate
        matchedOdu = candidates.find(o => !getSubseries(o.modelName)) || candidates[0];
      }
    }

    const setKey = iduKey || iduCap || 'Set';

    if (matchedOdu) {
      pairedOduIds.add(matchedOdu.id);

      const iduN = idu.modelName.trim().toLowerCase();
      const oduN = matchedOdu.modelName.trim().toLowerCase();

      // Check if this set is matched in Unit Testing (Live, Stopped, Finished)
      const matchedTesting = testingUnits.filter(tu => {
        if (!tu.modelName) return false;
        const tName = tu.modelName.trim().toLowerCase();
        const tuKey = extractNumbersKey(tu.modelName);

        if (tName === iduN || tName.includes(iduN) || iduN.includes(tName)) return true;
        if (tName === oduN || tName.includes(oduN) || oduN.includes(tName)) return true;
        if (setKey && tuKey && setKey === tuKey) return true;
        if (idu.iduSerialNumber && tu.iduSerialNumber && idu.iduSerialNumber === tu.iduSerialNumber) return true;
        if (matchedOdu.oduSerialNumber && tu.oduSerialNumber && matchedOdu.oduSerialNumber === tu.oduSerialNumber) return true;
        return false;
      });

      const isPending = matchedTesting.length === 0;
      const activeTestUnit = matchedTesting.find(tu => tu.status === 'live') ||
                             matchedTesting.find(tu => tu.status === 'stopped') ||
                             matchedTesting.find(tu => tu.status === 'finished') || null;

      results.push({
        id: `set-${idu.id}-${matchedOdu.id}`,
        commonKey: setKey,
        iduModel: idu.modelName,
        iduQty: typeof idu.quantity === 'number' ? Math.max(1, idu.quantity) : 1,
        oduModel: matchedOdu.modelName,
        oduQty: typeof matchedOdu.quantity === 'number' ? Math.max(1, matchedOdu.quantity) : 1,
        matchedQty: 1,
        balanceIduQty: 0,
        balanceOduQty: 0,
        status: 'Fully Matched',
        iduItem: idu,
        oduItem: matchedOdu,
        isPending,
        testingStatus: activeTestUnit?.status || null,
        matchedTestingUnits: matchedTesting,
      });
    } else {
      // IDU without matching ODU
      results.push({
        id: `unmatched-idu-${idu.id}`,
        commonKey: setKey,
        iduModel: idu.modelName,
        iduQty: typeof idu.quantity === 'number' ? Math.max(1, idu.quantity) : 1,
        oduModel: 'N/A (No Matching ODU)',
        oduQty: 0,
        matchedQty: 0,
        balanceIduQty: typeof idu.quantity === 'number' ? Math.max(1, idu.quantity) : 1,
        balanceOduQty: 0,
        status: 'IDU Available but ODU Not Available',
        iduItem: idu,
        isPending: true,
        testingStatus: null,
        matchedTestingUnits: [],
      });
    }
  });

  // Check any ODU that wasn't paired with any IDU
  oduList.forEach(odu => {
    if (!pairedOduIds.has(odu.id)) {
      const oduKey = extractNumbersKey(odu.modelName);
      const oduSub = getSubseries(odu.modelName);
      const oduCap = getCapacityNumber(odu.modelName);

      // Check if it can pair with an IDU that matches its key or capacity
      let iduCandidates = iduList.filter(i => extractNumbersKey(i.modelName) === oduKey);
      if (iduCandidates.length === 0 && oduCap) {
        iduCandidates = iduList.filter(i => getCapacityNumber(i.modelName) === oduCap);
      }

      if (iduCandidates.length > 0) {
        const matchedIdu = (oduSub ? iduCandidates.find(i => getSubseries(i.modelName) === oduSub) : null) || iduCandidates[0];
        pairedOduIds.add(odu.id);

        const iduN = matchedIdu.modelName.trim().toLowerCase();
        const oduN = odu.modelName.trim().toLowerCase();
        const setKey = oduKey || oduCap || 'Set';

        const matchedTesting = testingUnits.filter(tu => {
          if (!tu.modelName) return false;
          const tName = tu.modelName.trim().toLowerCase();
          const tuKey = extractNumbersKey(tu.modelName);

          if (tName === iduN || tName.includes(iduN) || iduN.includes(tName)) return true;
          if (tName === oduN || tName.includes(oduN) || oduN.includes(tName)) return true;
          if (setKey && tuKey && setKey === tuKey) return true;
          if (matchedIdu.iduSerialNumber && tu.iduSerialNumber && matchedIdu.iduSerialNumber === tu.iduSerialNumber) return true;
          if (odu.oduSerialNumber && tu.oduSerialNumber && odu.oduSerialNumber === tu.oduSerialNumber) return true;
          return false;
        });

        const isPending = matchedTesting.length === 0;
        const activeTestUnit = matchedTesting.find(tu => tu.status === 'live') ||
                               matchedTesting.find(tu => tu.status === 'stopped') ||
                               matchedTesting.find(tu => tu.status === 'finished') || null;

        results.push({
          id: `set-${matchedIdu.id}-${odu.id}`,
          commonKey: setKey,
          iduModel: matchedIdu.modelName,
          iduQty: typeof matchedIdu.quantity === 'number' ? Math.max(1, matchedIdu.quantity) : 1,
          oduModel: odu.modelName,
          oduQty: typeof odu.quantity === 'number' ? Math.max(1, odu.quantity) : 1,
          matchedQty: 1,
          balanceIduQty: 0,
          balanceOduQty: 0,
          status: 'Fully Matched',
          iduItem: matchedIdu,
          oduItem: odu,
          isPending,
          testingStatus: activeTestUnit?.status || null,
          matchedTestingUnits: matchedTesting,
        });
      } else {
        // Completely unmatched ODU
        const setKey = oduKey || oduCap || 'Set';
        results.push({
          id: `unmatched-odu-${odu.id}`,
          commonKey: setKey,
          iduModel: 'N/A (No Matching IDU)',
          iduQty: 0,
          oduModel: odu.modelName,
          oduQty: typeof odu.quantity === 'number' ? Math.max(1, odu.quantity) : 1,
          matchedQty: 0,
          balanceIduQty: 0,
          balanceOduQty: typeof odu.quantity === 'number' ? Math.max(1, odu.quantity) : 1,
          status: 'ODU Available but IDU Not Available',
          oduItem: odu,
          isPending: true,
          testingStatus: null,
          matchedTestingUnits: [],
        });
      }
    }
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

  // 3. BOTH Qty: Total sets in Model List BOTH (IDU + ODU matching pairs)
  const bothPairs = getIduOduMatchingPairs(allUnits);
  const bothSets = bothPairs.filter(p => Boolean(p.iduItem && p.oduItem));
  // Total sets in BOTH view is bothSets.length (matches the exact number of sets shown in BOTH tab)
  const bothQty = bothSets.length;

  // 4. Unit Testing Live, Stopped, Finished quantities (ONLY actual unit testing form submissions)
  const liveQty = testingUnits.filter(u => u.status === 'live').length;
  const stoppedQty = testingUnits.filter(u => u.status === 'stopped').length;
  const finishedQty = testingUnits.filter(u => u.status === 'finished').length;

  // 5. Pending Qty:
  // "menu ke PP Unit ke Model list me jo BOTH hai usme jitni bhi machine set wo match krega Unit Testing ke Live, Stop, Finished ab enme jo Set model Match kr raha hai BOTH se wo thik hai. Jo Match nhi kr raha wo Dashboard me Pending me Qty daal dena."
  const pendingModels = bothSets.filter(p => p.isPending);
  const matchedModels = bothSets.filter(p => !p.isPending);
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

