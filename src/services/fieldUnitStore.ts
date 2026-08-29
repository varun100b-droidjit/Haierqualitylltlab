import { FieldUnit } from '../types';
import { addLabNotification } from './unitStore';
import { 
  syncFieldUnitToSupabase, 
  deleteFieldUnitFromSupabase, 
  fetchFieldUnitsFromSupabase 
} from '../lib/supabase';
import { db, collection, doc, setDoc, deleteDoc, getDocs } from './firebase';
import { requireOnlineForSave } from './networkManager';

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

/* ==========================================
   FIREBASE FIRESTORE SYNC HELPERS
   ========================================== */

export async function syncFieldUnitToFirestore(unit: FieldUnit) {
  if (!db || !unit || unit.id === 'field-101' || unit.id === 'field-102' || unit.id === 'field-103') return;
  try {
    const docRef = doc(db, 'field_units', unit.id);
    await setDoc(docRef, { ...unit }, { merge: true });
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

// Automatically fetch from Firestore / Supabase on init
initDataSync();

async function initDataSync() {
  try {
    // Try fetching from Firestore first
    const firestoreData = await fetchFieldUnitsFromFirestore();
    if (firestoreData && firestoreData.length > 0) {
      const clean = firestoreData.filter(u => u && u.id !== 'field-101' && u.id !== 'field-102' && u.id !== 'field-103');
      fieldUnitsCache = clean;
      try { localStorage.setItem(STORAGE_KEY_FIELD_UNITS, JSON.stringify(clean)); } catch {}
      notifySubscribers();
      return;
    }

    // Fallback to Supabase
    const remoteData = await fetchFieldUnitsFromSupabase();
    if (remoteData && remoteData.length > 0) {
      const clean = remoteData.filter(u => u && u.id !== 'field-101' && u.id !== 'field-102' && u.id !== 'field-103');
      fieldUnitsCache = clean;
      try { localStorage.setItem(STORAGE_KEY_FIELD_UNITS, JSON.stringify(clean)); } catch {}
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
  if (!requireOnlineForSave(`Delete Field Unit (${id})`)) {
    return;
  }
  const updated = fieldUnitsCache.filter(u => u.id !== id);
  saveLocalFieldUnits(updated);

  // Delete from Supabase & Firestore
  deleteFieldUnitFromSupabase(id);
  deleteFieldUnitFromFirestore(id);
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
