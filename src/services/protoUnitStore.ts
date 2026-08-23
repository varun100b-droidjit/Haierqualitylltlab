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

const INITIAL_PROTO_UNITS: ProtoUnit[] = [];

let protoUnitsCache: ProtoUnit[] = loadLocalProtoUnits();
const listeners: Set<() => void> = new Set();

// Automatically fetch from Supabase on init
initSupabaseSync();

async function initSupabaseSync() {
  try {
    const remoteData = await fetchProtoUnitsFromSupabase();
    if (remoteData && remoteData.length > 0) {
      const cleanRemote = remoteData.filter(u => u && u.id !== 'proto-101' && u.id !== 'proto-102');
      protoUnitsCache = cleanRemote;
      localStorage.setItem(STORAGE_KEY_PROTO_UNITS, JSON.stringify(cleanRemote));
      notifyListeners();
    }
  } catch (e) {
    console.warn('Supabase Proto Unit sync note:', e);
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

// Background sync from IndexedDB
idbGetAll<ProtoUnit>('proto_units').then((idbUnits) => {
  const currentRaw = localStorage.getItem(STORAGE_KEY_PROTO_UNITS);
  if (currentRaw === '[]') return; // Purged state, do not restore
  if (idbUnits && idbUnits.length > 0) {
    const cleanIdb = idbUnits.filter(u => u && u.id !== 'proto-101' && u.id !== 'proto-102');
    const mergedMap = new Map<string, ProtoUnit>();
    protoUnitsCache.forEach(u => { if (u && u.id !== 'proto-101' && u.id !== 'proto-102') mergedMap.set(u.id, u); });
    cleanIdb.forEach(u => { if (u && u.id !== 'proto-101' && u.id !== 'proto-102') mergedMap.set(u.id, u); });
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

export function updateProtoUnitStatus(id: string, status: 'live' | 'finished' | 'stopped', doneHour?: number): void {
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


