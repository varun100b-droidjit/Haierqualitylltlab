import { addNotification } from './unitStore';
import { idbSaveAll, idbGetAll, safeLocalStorageSet } from '../lib/indexedDbStorage';
import { 
  syncReportRoomToSupabase, 
  deleteReportRoomFromSupabase, 
  fetchReportRoomFromSupabase 
} from '../lib/supabase';
import { db, collection, doc, setDoc, deleteDoc, getDocs } from './firebase';
import { requireOnlineForSave } from './networkManager';

export type ReportTagType = 'C Simulation' | 'C Experience';
export type ReportCategoryKey = 'cs-simulation' | 'cs-experience';

export interface SavedReport {
  id: string;
  reportType: ReportCategoryKey; // 'cs-simulation' | 'cs-experience'
  tag: ReportTagType; // 'C Simulation' | 'C Experience'
  title: string;
  reportNo: string;
  modelName: string;
  unitSource: 'proto' | 'pp';
  serialNo: string;
  station?: string;
  requestBy?: string;
  createdAt: string; // e.g. '2026-08-17 10:45'
  generatedDate: string; // e.g. '2026-08-17'
  specs: {
    coolingCapacity?: string;
    powerMode?: string;
    refrigerant?: string;
    iseer?: string;
    iduMotorSpec?: string;
    iduMotorPartCode?: string;
    iduMotorSupplier?: string;
    iduPcbPartCode?: string;
    iduPcbSupplier?: string;
    oduMotorSpec?: string;
    oduMotorPartCode?: string;
    oduMotorSupplier?: string;
    oduPcbPartCode?: string;
    oduPcbSupplier?: string;
    compressorSpec?: string;
    compressorPartCode?: string;
    compressorSupplier?: string;
    eevSpec?: string;
    eevPartCode?: string;
    eevSupplier?: string;
    sampleReceivedDate?: string;
    testCommencedDate?: string;
    testCompletedDate?: string;
    testConclusion?: string;
  };
  dataValuesMap: Record<string, string>;
  photos: Record<string, string>;
  templateName?: string;
  status: 'Generated' | 'Verified' | 'Archived';
  remarks?: string;
}

const STORAGE_KEY_REPORT_ROOM = 'llt_report_room_saved_reports_v1';

const INITIAL_SAVED_REPORTS: SavedReport[] = [];

let savedReportsCache: SavedReport[] = loadLocalReports();
let listeners: ((reports: SavedReport[]) => void)[] = [];

/* ==========================================
   FIREBASE FIRESTORE SYNC HELPERS FOR REPORTS
   ========================================== */

export async function syncReportRoomToFirestore(report: SavedReport) {
  if (!db || !report || report.id === 'rep-cs-101' || report.id === 'rep-ce-102') return;
  try {
    const docRef = doc(db, 'report_room', report.id);
    await setDoc(docRef, { ...report }, { merge: true });
    console.log('Successfully synced Report to Firebase Firestore:', report.id);
  } catch (e) {
    console.warn('Firestore Report sync note:', e);
  }
}

export async function deleteReportRoomFromFirestore(id: string) {
  if (!db) return;
  try {
    const docRef = doc(db, 'report_room', id);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Firestore Report delete note:', e);
  }
}

export async function fetchReportRoomFromFirestore(): Promise<SavedReport[] | null> {
  if (!db) return null;
  try {
    const colRef = collection(db, 'report_room');
    const snap = await getDocs(colRef);
    if (snap.empty) return null;
    const list: SavedReport[] = [];
    snap.forEach(d => {
      const data = d.data() as SavedReport;
      if (data && data.id !== 'rep-cs-101' && data.id !== 'rep-ce-102') {
        list.push(data);
      }
    });
    return list;
  } catch (e) {
    console.warn('Firestore Report fetch note:', e);
    return null;
  }
}

// Initialize Cloud and IndexedDB async sync
initCloudAndLocalReports();

async function initCloudAndLocalReports() {
  try {
    const firestoreReports = await fetchReportRoomFromFirestore();
    if (firestoreReports && firestoreReports.length > 0) {
      const cleanFs = firestoreReports.filter(r => r && r.id !== 'rep-cs-101' && r.id !== 'rep-ce-102');
      savedReportsCache = cleanFs;
      persistReports(cleanFs);
      notifyListeners(cleanFs);
      return;
    }

    const remoteReports = await fetchReportRoomFromSupabase();
    if (remoteReports && remoteReports.length > 0) {
      const cleanRemote = remoteReports.filter(r => r && r.id !== 'rep-cs-101' && r.id !== 'rep-ce-102');
      const mergedMap = new Map<string, SavedReport>();
      savedReportsCache.forEach(r => { if (r && r.id !== 'rep-cs-101' && r.id !== 'rep-ce-102') mergedMap.set(r.id, r); });
      cleanRemote.forEach((r: SavedReport) => { if (r && r.id !== 'rep-cs-101' && r.id !== 'rep-ce-102') mergedMap.set(r.id, r); });
      savedReportsCache = Array.from(mergedMap.values());
      persistReports(savedReportsCache);
      notifyListeners(savedReportsCache);
      cleanRemote.forEach((r: SavedReport) => syncReportRoomToFirestore(r));
    }
  } catch (err) {
    console.warn('[ReportRoom] Failed to load from remote:', err);
  }
}

function loadLocalReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORT_ROOM);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((r: any) => r && r.id !== 'rep-cs-101' && r.id !== 'rep-ce-102');
      }
    }
    return [];
  } catch (err) {
    return [];
  }
}

function notifyListeners(reports: SavedReport[]) {
  listeners.forEach(fn => {
    try {
      fn(reports);
    } catch (err) {
      console.error('Error notifying report room listener:', err);
    }
  });
}

function persistReports(reports: SavedReport[]) {
  savedReportsCache = reports;
  // 1. Safe localStorage save (automatically handles quota by stripping heavy base64 strings)
  safeLocalStorageSet(STORAGE_KEY_REPORT_ROOM, reports);
  // 2. Full high-capacity IndexedDB save (stores all high-res photos without 5MB quota limit)
  idbSaveAll('saved_reports', reports);
}

export function getSavedReports(): SavedReport[] {
  return [...savedReportsCache];
}

export function clearAllSavedReports(): void {
  persistReports([]);
  notifyListeners([]);
}

export function setSavedReportsDirectly(reports: SavedReport[]): void {
  persistReports(reports);
  notifyListeners(reports);
}

export function saveReportToRoom(reportData: Omit<SavedReport, 'id' | 'createdAt'> & { id?: string }): SavedReport | null {
  if (!requireOnlineForSave(`Save Report (${reportData.reportNo || reportData.modelName})`)) {
    return null;
  }
  const current = getSavedReports();
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  
  const id = reportData.id || `rep-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Determine tag from reportType if not explicitly passed
  let tag: ReportTagType = reportData.tag;
  if (!tag) {
    tag = reportData.reportType === 'cs-experience' ? 'C Experience' : 'C Simulation';
  }

  const newReport: SavedReport = {
    ...reportData,
    id,
    tag,
    createdAt: dateStr,
    generatedDate: reportData.generatedDate || now.toISOString().split('T')[0],
  };

  // Prepend new report to list
  const updated = [newReport, ...current.filter(r => r.id !== id)];
  persistReports(updated);

  // Sync to Supabase & Firestore
  syncReportRoomToSupabase(newReport);
  syncReportRoomToFirestore(newReport);

  // Trigger lab notification
  addNotification(
    `New ${tag} Saved to Report Room`,
    `Report #${newReport.reportNo} (${newReport.modelName}) has been archived in the Report Room under ${tag}.`,
    'success'
  );

  notifyListeners(updated);
  return newReport;
}

export function deleteSavedReport(id: string): boolean {
  if (!requireOnlineForSave(`Delete Report (${id})`)) {
    return false;
  }
  const current = getSavedReports();
  const deletedItem = current.find(r => r.id === id);
  const updated = current.filter(r => r.id !== id);
  
  persistReports(updated);
  deleteReportRoomFromSupabase(id);
  deleteReportRoomFromFirestore(id);

  if (deletedItem) {
    addNotification(
      `Report Deleted`,
      `Report #${deletedItem.reportNo} (${deletedItem.modelName}) was removed from Report Room.`,
      'info'
    );
  }
  notifyListeners(updated);
  return true;
}

export function updateSavedReport(id: string, updates: Partial<SavedReport>): SavedReport | null {
  if (!requireOnlineForSave(`Update Report (${id})`)) {
    return null;
  }
  const current = getSavedReports();
  const idx = current.findIndex(r => r.id === id);
  if (idx === -1) return null;

  current[idx] = {
    ...current[idx],
    ...updates
  };

  persistReports(current);
  syncReportRoomToSupabase(current[idx]);
  syncReportRoomToFirestore(current[idx]);
  notifyListeners(current);
  return current[idx];
}

export function subscribeReportRoom(listener: (reports: SavedReport[]) => void): () => void {
  listeners.push(listener);
  // Immediate emit
  listener(getSavedReports());
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

export function getReportCounts(): { total: number; cSimulation: number; cExperience: number } {
  const all = getSavedReports();
  const cSimulation = all.filter(r => r.tag === 'C Simulation' || r.reportType === 'cs-simulation').length;
  const cExperience = all.filter(r => r.tag === 'C Experience' || r.reportType === 'cs-experience').length;
  return {
    total: all.length,
    cSimulation,
    cExperience
  };
}

export function findSavedReportForUnit(
  unitOrIdentifier: { id?: string; serialNo?: string; iduSerialNumber?: string; oduSerialNumber?: string; modelName?: string } | string,
  tag?: ReportTagType
): SavedReport | null {
  const all = getSavedReports();
  if (typeof unitOrIdentifier === 'string') {
    const term = unitOrIdentifier.trim().toLowerCase();
    if (!term) return null;
    return all.find(r => {
      const matchTag = !tag || r.tag === tag || (tag === 'C Simulation' && r.reportType === 'cs-simulation') || (tag === 'C Experience' && r.reportType === 'cs-experience');
      if (!matchTag) return false;
      return (
        (r.serialNo && r.serialNo.toLowerCase() === term) ||
        (r.modelName && r.modelName.toLowerCase() === term) ||
        (r.reportNo && r.reportNo.toLowerCase() === term) ||
        (r.id && r.id.toLowerCase() === term)
      );
    }) || null;
  }

  const { id, serialNo, iduSerialNumber, oduSerialNumber, modelName } = unitOrIdentifier;
  return all.find(r => {
    const matchTag = !tag || r.tag === tag || (tag === 'C Simulation' && r.reportType === 'cs-simulation') || (tag === 'C Experience' && r.reportType === 'cs-experience');
    if (!matchTag) return false;

    // Check serial matches
    if (serialNo && r.serialNo && r.serialNo.toLowerCase() === serialNo.toLowerCase()) return true;
    if (iduSerialNumber && r.serialNo && r.serialNo.toLowerCase() === iduSerialNumber.toLowerCase()) return true;
    if (oduSerialNumber && r.serialNo && r.serialNo.toLowerCase() === oduSerialNumber.toLowerCase()) return true;
    if (id && (r.id === id || r.dataValuesMap?.unitId === id)) return true;

    // Check model name match
    if (modelName && r.modelName && r.modelName.toLowerCase() === modelName.toLowerCase()) {
      if (serialNo && (r.serialNo === serialNo || r.reportNo?.includes(serialNo))) return true;
      if (iduSerialNumber && (r.serialNo === iduSerialNumber || r.reportNo?.includes(iduSerialNumber))) return true;
      if (oduSerialNumber && (r.serialNo === oduSerialNumber || r.reportNo?.includes(oduSerialNumber))) return true;
      if (r.serialNo === '58192' && iduSerialNumber === '58192') return true;
    }

    return false;
  }) || null;
}
