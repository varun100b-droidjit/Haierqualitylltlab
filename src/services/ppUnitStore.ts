import { PpUnit } from '../types';
import { addLabNotification } from './unitStore';
import { 
  syncPpUnitToSupabase, 
  deletePpUnitFromSupabase, 
  fetchPpUnitsFromSupabase 
} from '../lib/supabase';
import { db, collection, doc, setDoc, deleteDoc, getDocs } from './firebase';
import { idbSaveAll, idbGetAll, safeLocalStorageSet } from '../lib/indexedDbStorage';

const STORAGE_KEY_PP_UNITS = 'llt_pp_units_v1';

// Helper to generate a random unique 5-digit string (e.g., "54321")
export function generatePp5DigitSerial(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

const INITIAL_PP_UNITS: PpUnit[] = [
  {
    id: 'pp-idu-19',
    modelName: 'HSI19GHD-MAI5NB-I',
    unitType: 'IDU',
    materialCode: 'MAT-1950',
    version: 'V1.0',
    quantity: 10,
    station: 'Station 01',
    iduSerialNumber: 'IDU-19501',
    oduSerialNumber: '',
    requestBy: 'Lab Specialist',
    testPurpose: 'IDU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:00',
    updatedAt: '2026-08-10 10:00',
  },
  {
    id: 'pp-odu-19',
    modelName: 'HSO19-5NB-I',
    unitType: 'ODU',
    materialCode: 'MAT-1951',
    version: 'V1.0',
    quantity: 8,
    station: 'Station 01',
    iduSerialNumber: '',
    oduSerialNumber: 'ODU-19502',
    requestBy: 'Lab Specialist',
    testPurpose: 'ODU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:05',
    updatedAt: '2026-08-10 10:05',
  },
  {
    id: 'pp-idu-18',
    modelName: 'HSI18GHD-MAI5NB-I',
    unitType: 'IDU',
    materialCode: 'MAT-1850',
    version: 'V1.0',
    quantity: 5,
    station: 'Station 02',
    iduSerialNumber: 'IDU-18501',
    oduSerialNumber: '',
    requestBy: 'Lab Specialist',
    testPurpose: 'IDU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:10',
    updatedAt: '2026-08-10 10:10',
  },
  {
    id: 'pp-odu-18',
    modelName: 'HSO18-5NB-I',
    unitType: 'ODU',
    materialCode: 'MAT-1851',
    version: 'V1.0',
    quantity: 5,
    station: 'Station 02',
    iduSerialNumber: '',
    oduSerialNumber: 'ODU-18502',
    requestBy: 'Lab Specialist',
    testPurpose: 'ODU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:15',
    updatedAt: '2026-08-10 10:15',
  },
  {
    id: 'pp-idu-24',
    modelName: 'HSI24GHD-MAI5NB-I',
    unitType: 'IDU',
    materialCode: 'MAT-2450',
    version: 'V1.0',
    quantity: 6,
    station: 'Station 03',
    iduSerialNumber: 'IDU-24501',
    oduSerialNumber: '',
    requestBy: 'Lab Specialist',
    testPurpose: 'IDU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:20',
    updatedAt: '2026-08-10 10:20',
  },
  {
    id: 'pp-odu-24',
    modelName: 'HSO24-5NB-I',
    unitType: 'ODU',
    materialCode: 'MAT-2451',
    version: 'V1.0',
    quantity: 6,
    station: 'Station 03',
    iduSerialNumber: '',
    oduSerialNumber: 'ODU-24502',
    requestBy: 'Lab Specialist',
    testPurpose: 'ODU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:25',
    updatedAt: '2026-08-10 10:25',
  },
  {
    id: 'pp-idu-30',
    modelName: 'HSI30GHD-MAI5NB-I',
    unitType: 'IDU',
    materialCode: 'MAT-3050',
    version: 'V1.0',
    quantity: 4,
    station: 'Station 04',
    iduSerialNumber: 'IDU-30501',
    oduSerialNumber: '',
    requestBy: 'Lab Specialist',
    testPurpose: 'IDU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:30',
    updatedAt: '2026-08-10 10:30',
  },
  {
    id: 'pp-odu-36',
    modelName: 'HSO36-5NB-I',
    unitType: 'ODU',
    materialCode: 'MAT-3651',
    version: 'V1.0',
    quantity: 7,
    station: 'Station 05',
    iduSerialNumber: '',
    oduSerialNumber: 'ODU-36502',
    requestBy: 'Lab Specialist',
    testPurpose: 'ODU Model Registration',
    requiredHour: 100,
    partsInfo: {},
    photos: {},
    status: 'live',
    createdAt: '2026-08-10 10:35',
    updatedAt: '2026-08-10 10:35',
  }
];

let ppUnitsCache: PpUnit[] = loadLocalPpUnits();
const listeners: Set<() => void> = new Set();

/* ==========================================
   FIREBASE FIRESTORE SYNC HELPERS
   ========================================== */

export async function syncPpUnitToFirestore(unit: PpUnit) {
  if (!db) return;
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
    snap.forEach(d => list.push(d.data() as PpUnit));
    return list;
  } catch (e) {
    console.warn('Firestore PP Unit fetch note:', e);
    return null;
  }
}

// Automatically fetch from Firestore / Supabase on init
initDataSync();

async function initDataSync() {
  // Try fetching from Firestore first
  const firestoreData = await fetchPpUnitsFromFirestore();
  if (firestoreData && firestoreData.length > 0) {
    ppUnitsCache = firestoreData;
    localStorage.setItem(STORAGE_KEY_PP_UNITS, JSON.stringify(firestoreData));
    notifyListeners();
    return;
  }

  // Fallback to Supabase
  const remoteData = await fetchPpUnitsFromSupabase();
  if (remoteData && remoteData.length > 0) {
    ppUnitsCache = remoteData;
    localStorage.setItem(STORAGE_KEY_PP_UNITS, JSON.stringify(remoteData));
    notifyListeners();
    remoteData.forEach(u => syncPpUnitToFirestore(u));
  } else {
    // Sync initial local units to both
    INITIAL_PP_UNITS.forEach(unit => {
      syncPpUnitToSupabase(unit);
      syncPpUnitToFirestore(unit);
    });
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
  ppUnitsCache = data;
  safeLocalStorageSet(STORAGE_KEY_PP_UNITS, data);
  idbSaveAll('pp_units', data);
  notifyListeners();
}

function loadLocalPpUnits(): PpUnit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PP_UNITS);
    if (!raw) {
      safeLocalStorageSet(STORAGE_KEY_PP_UNITS, INITIAL_PP_UNITS);
      return INITIAL_PP_UNITS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return INITIAL_PP_UNITS;
  } catch (e) {
    return INITIAL_PP_UNITS;
  }
}

// Background sync from IndexedDB
idbGetAll<PpUnit>('pp_units').then((idbUnits) => {
  if (idbUnits && idbUnits.length > 0) {
    const mergedMap = new Map<string, PpUnit>();
    ppUnitsCache.forEach(u => mergedMap.set(u.id, u));
    idbUnits.forEach(u => mergedMap.set(u.id, u));
    ppUnitsCache = Array.from(mergedMap.values());
    notifyListeners();
  }
}).catch(() => {});

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

export function addPpUnit(unit: Omit<PpUnit, 'id' | 'createdAt' | 'updatedAt'> & { status?: 'live' | 'stopped' | 'finished' }): PpUnit {
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
}

export function getIduOduMatchingPairs(units: PpUnit[]): MatchedPairResult[] {
  const iduMap: { [key: string]: { modelName: string; totalQty: number; item?: PpUnit } } = {};
  const oduMap: { [key: string]: { modelName: string; totalQty: number; item?: PpUnit } } = {};

  units.forEach(u => {
    const isIdu = u.unitType === 'IDU' || Boolean(u.iduSerialNumber && !u.oduSerialNumber) || u.modelName.toUpperCase().includes('HSI') || u.modelName.toUpperCase().includes('IDU');
    const isOdu = u.unitType === 'ODU' || Boolean(u.oduSerialNumber && !u.iduSerialNumber) || u.modelName.toUpperCase().includes('HSO') || u.modelName.toUpperCase().includes('ODU');

    const key = extractNumbersKey(u.modelName);
    const qty = typeof u.quantity === 'number' ? u.quantity : 1;

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

export function calculatePpUnitMetrics(units: PpUnit[]) {
  let iduQty = 0;
  let oduQty = 0;
  let bothQty = 0;

  const iduNumberKeys: { [key: string]: number } = {};
  const oduNumberKeys: { [key: string]: number } = {};

  units.forEach(u => {
    const hasIduSerial = Boolean(u.iduSerialNumber && u.iduSerialNumber.trim() !== '');
    const hasOduSerial = Boolean(u.oduSerialNumber && u.oduSerialNumber.trim() !== '');

    const isExplicitBoth = u.unitType === 'BOTH' || (hasIduSerial && hasOduSerial);
    const isExplicitIdu = u.unitType === 'IDU' || (hasIduSerial && !hasOduSerial);
    const isExplicitOdu = u.unitType === 'ODU' || (hasOduSerial && !hasIduSerial);

    if (isExplicitBoth) {
      bothQty++;
      iduQty++;
      oduQty++;
    } else if (isExplicitIdu) {
      iduQty++;
      const key = extractNumbersKey(u.modelName);
      if (key) {
        iduNumberKeys[key] = (iduNumberKeys[key] || 0) + 1;
      }
    } else if (isExplicitOdu) {
      oduQty++;
      const key = extractNumbersKey(u.modelName);
      if (key) {
        oduNumberKeys[key] = (oduNumberKeys[key] || 0) + 1;
      }
    } else {
      const lower = u.modelName.toLowerCase();
      if (lower.includes('idu')) {
        iduQty++;
        const key = extractNumbersKey(u.modelName);
        if (key) iduNumberKeys[key] = (iduNumberKeys[key] || 0) + 1;
      } else if (lower.includes('odu')) {
        oduQty++;
        const key = extractNumbersKey(u.modelName);
        if (key) oduNumberKeys[key] = (oduNumberKeys[key] || 0) + 1;
      } else {
        bothQty++;
        iduQty++;
        oduQty++;
      }
    }
  });

  Object.keys(iduNumberKeys).forEach(key => {
    if (oduNumberKeys[key]) {
      const matches = Math.min(iduNumberKeys[key], oduNumberKeys[key]);
      bothQty += matches;
    }
  });

  return { iduQty, oduQty, bothQty };
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

