import { FieldUnit } from '../types';
import { addLabNotification } from './unitStore';
import { 
  syncFieldUnitToSupabase, 
  deleteFieldUnitFromSupabase, 
  fetchFieldUnitsFromSupabase 
} from '../lib/supabase';

const STORAGE_KEY_FIELD_UNITS = 'llt_field_units_v2';

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

// Automatically fetch from Supabase on init
initSupabaseSync();

async function initSupabaseSync() {
  try {
    const remoteData = await fetchFieldUnitsFromSupabase();
    if (remoteData && remoteData.length > 0) {
      const clean = remoteData.filter(u => u && u.id !== 'field-101' && u.id !== 'field-102' && u.id !== 'field-103');
      fieldUnitsCache = clean;
      localStorage.setItem(STORAGE_KEY_FIELD_UNITS, JSON.stringify(clean));
      notifySubscribers();
    }
  } catch (e) {
    console.warn('Field units Supabase sync note:', e);
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
  try {
    localStorage.setItem(STORAGE_KEY_FIELD_UNITS, JSON.stringify(clean));
  } catch (err) {
    console.error('Error saving field units to localStorage:', err);
  }
  notifySubscribers();
}

export function subscribeFieldUnitStore(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getFieldUnits(): FieldUnit[] {
  return [...fieldUnitsCache];
}

export function addFieldUnit(unitData: Omit<FieldUnit, 'id' | 'createdAt' | 'updatedAt' | 'observations'>): FieldUnit {
  const formattedDate = getFormattedNow();
  const newUnit: FieldUnit = {
    ...unitData,
    id: `field-${Date.now()}`,
    observations: [],
    createdAt: formattedDate,
    updatedAt: formattedDate
  };

  const updated = [newUnit, ...fieldUnitsCache];
  saveLocalFieldUnits(updated);

  // Sync to Supabase
  syncFieldUnitToSupabase(newUnit);

  addLabNotification(
    `Field Unit Added: ${newUnit.modelName}`,
    `Station: ${newUnit.station} | Serial: ${newUnit.serialNumber}`
  );

  return newUnit;
}

export function updateFieldUnitStatus(id: string, status: FieldUnit['status'], doneHour?: number): FieldUnit | null {
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
        endDateTime: status === 'stopped' || status === 'finished' ? formattedDate : (status === 'live' ? undefined : u.endDateTime),
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
  }

  return updatedUnit;
}

export function addFieldUnitObservation(id: string, text: string): FieldUnit | null {
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
  }

  return updatedUnit;
}

export function deleteFieldUnitObservation(id: string, obsId: string): FieldUnit | null {
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
  }

  return updatedUnit;
}

export function deleteFieldUnit(id: string) {
  const updated = fieldUnitsCache.filter(u => u.id !== id);
  saveLocalFieldUnits(updated);

  // Delete from Supabase
  deleteFieldUnitFromSupabase(id);
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


