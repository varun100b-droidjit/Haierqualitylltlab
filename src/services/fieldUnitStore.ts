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

const INITIAL_FIELD_UNITS: FieldUnit[] = [
  {
    id: 'field-101',
    modelName: 'HSI19T-S2NB-F',
    productType: 'BOTH',
    iduSerialNumber: 'IDU-88219-A',
    oduSerialNumber: 'ODU-88219-B',
    serialNumber: 'IDU: IDU-88219-A | ODU: ODU-88219-B',
    requestBy: 'Suresh Verma',
    station: 'Station 01',
    startDateTime: '2026-07-30 08:30',
    requiredHour: 48,
    status: 'live',
    remarks: 'Field site performance testing under active thermal load.',
    observations: [
      {
        id: 'obs-f1',
        text: 'Compressor sound level checked at 48dB. Within acceptable limits.',
        timestamp: '2026-07-30 09:30'
      }
    ],
    createdAt: '2026-07-30 08:30',
    updatedAt: '2026-07-30 09:30'
  },
  {
    id: 'field-102',
    modelName: 'YU63 Dual Inverter 1.5T',
    productType: 'IDU',
    iduSerialNumber: 'IDU-99412-X',
    serialNumber: 'IDU: IDU-99412-X',
    requestBy: 'Rohan Mehta',
    station: 'Station 03',
    startDateTime: '2026-07-29 14:00',
    requiredHour: 72,
    status: 'live',
    remarks: 'Airflow and blower vibration field monitoring.',
    observations: [
      {
        id: 'obs-f2',
        text: 'Blower fan speed stable across 5 speed steps.',
        timestamp: '2026-07-29 16:45'
      }
    ],
    createdAt: '2026-07-29 14:00',
    updatedAt: '2026-07-29 16:45'
  },
  {
    id: 'field-103',
    modelName: 'AURA-5Star-HeavyDuty',
    productType: 'ODU',
    oduSerialNumber: 'ODU-12093-Z',
    serialNumber: 'ODU: ODU-12093-Z',
    requestBy: 'Amit Kumar',
    station: 'Station 05',
    startDateTime: '2026-07-28 10:00',
    requiredHour: 24,
    status: 'finished',
    endDateTime: '2026-07-29 10:00',
    remarks: '24-hour continuous high ambient heat test completed successfully.',
    observations: [
      {
        id: 'obs-f3',
        text: 'Test cycle completed without thermal trip.',
        timestamp: '2026-07-29 10:00'
      }
    ],
    createdAt: '2026-07-28 10:00',
    updatedAt: '2026-07-29 10:00'
  }
];

let fieldUnitsCache: FieldUnit[] = loadLocalFieldUnits();
const subscribers: Set<() => void> = new Set();

// Automatically fetch from Supabase on init
initSupabaseSync();

async function initSupabaseSync() {
  const remoteData = await fetchFieldUnitsFromSupabase();
  if (remoteData && remoteData.length > 0) {
    fieldUnitsCache = remoteData;
    localStorage.setItem(STORAGE_KEY_FIELD_UNITS, JSON.stringify(remoteData));
    notifySubscribers();
  } else {
    // Sync initial units to Supabase if empty
    INITIAL_FIELD_UNITS.forEach(u => syncFieldUnitToSupabase(u));
  }
}

function notifySubscribers() {
  subscribers.forEach(cb => cb());
}

function loadLocalFieldUnits(): FieldUnit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIELD_UNITS);
    if (!raw) return INITIAL_FIELD_UNITS;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading field units from localStorage:', err);
    return INITIAL_FIELD_UNITS;
  }
}

function saveLocalFieldUnits(units: FieldUnit[]) {
  fieldUnitsCache = units;
  try {
    localStorage.setItem(STORAGE_KEY_FIELD_UNITS, JSON.stringify(units));
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

export function updateFieldUnitStatus(id: string, status: FieldUnit['status']): FieldUnit | null {
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


