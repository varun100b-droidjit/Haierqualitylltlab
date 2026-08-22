import { ProtoUnit } from '../types';
import { addLabNotification } from './unitStore';
import { 
  syncProtoUnitToSupabase, 
  deleteProtoUnitFromSupabase, 
  fetchProtoUnitsFromSupabase 
} from '../lib/supabase';
import { idbSaveAll, idbGetAll, safeLocalStorageSet } from '../lib/indexedDbStorage';

const STORAGE_KEY_PROTO_UNITS = 'llt_proto_units_v1';

// Helper to generate a random unique 5-digit string (e.g., "54321")
export function generate5DigitSerial(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

const INITIAL_PROTO_UNITS: ProtoUnit[] = [
  {
    id: 'proto-101',
    modelName: 'HSI19T-S2NB-F',
    station: 'Station 01',
    iduSerialNumber: '58192',
    oduSerialNumber: '93104',
    requestBy: 'Mohit Sharma',
    testPurpose: 'Performance & Thermal Stress Testing under 45°C Ambient',
    requiredHour: 120,
    partsInfo: {
      iduPcbSupplier: 'Sanken Electric',
      iduMotorSupplier: 'Nidec Japan',
      iduPcbPartCode: 'PCB-IDU-8841',
      iduMotorPartCode: 'MTR-IDU-2201',
      oduPcbSupplier: 'Delta Electronics',
      oduCompressorSupplier: 'Highly Panasonic',
      oduMotorSupplier: 'Nidec Japan',
      oduEevSupplier: 'Sanjia EEV',
      oduPcbPartCode: 'PCB-ODU-9902',
      oduCompressorPartCode: 'CMP-ODU-7721',
      oduMotorPartCode: 'MTR-ODU-3310',
      oduEevPartCode: 'EEV-ODU-1022',
    },
    photos: {},
    remarks: 'Sample batch 1 for verification. All sensors pre-calibrated.',
    status: 'live',
    createdAt: '2026-07-29 10:15',
    updatedAt: '2026-07-29 10:15',
  },
  {
    id: 'proto-102',
    modelName: 'YU63 Dual Inverter',
    station: 'Station 02',
    iduSerialNumber: '14209',
    oduSerialNumber: '88310',
    requestBy: 'Indrajit',
    testPurpose: 'Low Voltage Operational Limit & Acoustic Noise Test',
    requiredHour: 72,
    partsInfo: {
      iduPcbSupplier: 'Renesas',
      iduMotorSupplier: 'Welling Motor',
      iduPcbPartCode: 'PCB-IDU-4021',
      iduMotorPartCode: 'MTR-IDU-1109',
      oduPcbSupplier: 'Texas Instruments',
      oduCompressorSupplier: 'GMCC Toshiba',
      oduMotorSupplier: 'Welling Motor',
      oduEevSupplier: 'DunAn Sensing',
      oduPcbPartCode: 'PCB-ODU-3320',
      oduCompressorPartCode: 'CMP-ODU-8822',
      oduMotorPartCode: 'MTR-ODU-4401',
      oduEevPartCode: 'EEV-ODU-5510',
    },
    photos: {},
    remarks: 'Finished initial 72 hour continuous test cycle without defects.',
    status: 'finished',
    createdAt: '2026-07-25 14:00',
    updatedAt: '2026-07-28 14:00',
  }
];

let protoUnitsCache: ProtoUnit[] = loadLocalProtoUnits();
const listeners: Set<() => void> = new Set();

// Automatically fetch from Supabase on init
initSupabaseSync();

async function initSupabaseSync() {
  const remoteData = await fetchProtoUnitsFromSupabase();
  if (remoteData && remoteData.length > 0) {
    protoUnitsCache = remoteData;
    localStorage.setItem(STORAGE_KEY_PROTO_UNITS, JSON.stringify(remoteData));
    notifyListeners();
  } else {
    // Sync initial local units to Supabase if empty
    INITIAL_PROTO_UNITS.forEach(unit => syncProtoUnitToSupabase(unit));
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
  protoUnitsCache = data;
  safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, data);
  idbSaveAll('proto_units', data);
  notifyListeners();
}

function loadLocalProtoUnits(): ProtoUnit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROTO_UNITS);
    if (!raw) {
      safeLocalStorageSet(STORAGE_KEY_PROTO_UNITS, INITIAL_PROTO_UNITS);
      return INITIAL_PROTO_UNITS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return INITIAL_PROTO_UNITS;
  } catch (e) {
    return INITIAL_PROTO_UNITS;
  }
}

// Background sync from IndexedDB
idbGetAll<ProtoUnit>('proto_units').then((idbUnits) => {
  if (idbUnits && idbUnits.length > 0) {
    const mergedMap = new Map<string, ProtoUnit>();
    protoUnitsCache.forEach(u => mergedMap.set(u.id, u));
    idbUnits.forEach(u => mergedMap.set(u.id, u));
    protoUnitsCache = Array.from(mergedMap.values());
    notifyListeners();
  }
}).catch(() => {});

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

export function addProtoUnit(unit: Omit<ProtoUnit, 'id' | 'createdAt' | 'updatedAt'> & { status?: 'live' | 'stopped' | 'finished' }): ProtoUnit {
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

  const updated = [newUnit, ...protoUnitsCache];
  saveLocalProtoUnits(updated);

  // Sync to Supabase
  syncProtoUnitToSupabase(newUnit);

  addLabNotification(
    `Proto Unit Added: ${newUnit.modelName}`,
    `Station: ${newUnit.station} | IDU: ${newUnit.iduSerialNumber || 'NA'}, ODU: ${newUnit.oduSerialNumber || 'NA'}`
  );

  return newUnit;
}

export function updateProtoUnitStatus(id: string, status: 'live' | 'finished' | 'stopped'): void {
  const formattedDate = getFormattedNow();

  let targetUnit: ProtoUnit | null = null;
  const updated = protoUnitsCache.map(u => {
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
  saveLocalProtoUnits(updated);

  if (targetUnit) {
    syncProtoUnitToSupabase(targetUnit);
  }
}

export function updateProtoUnit(id: string, updates: Partial<ProtoUnit>): ProtoUnit | null {
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
  }

  return updatedUnit;
}

export function deleteProtoUnit(id: string): void {
  const updated = protoUnitsCache.filter(u => u.id !== id);
  saveLocalProtoUnits(updated);

  // Delete from Supabase
  deleteProtoUnitFromSupabase(id);
}

export function addProtoUnitObservation(id: string, text: string): ProtoUnit | null {
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
  }

  return updatedUnit;
}

export function deleteProtoUnitObservation(id: string, obsId: string): ProtoUnit | null {
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


