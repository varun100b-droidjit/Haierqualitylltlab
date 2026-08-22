import { addNotification } from './unitStore';
import { idbSaveAll, idbGetAll, safeLocalStorageSet } from '../lib/indexedDbStorage';
import { 
  syncReportRoomToSupabase, 
  deleteReportRoomFromSupabase, 
  fetchReportRoomFromSupabase 
} from '../lib/supabase';

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

const INITIAL_SAVED_REPORTS: SavedReport[] = [
  {
    id: 'rep-cs-101',
    reportType: 'cs-simulation',
    tag: 'C Simulation',
    title: 'Customer Simulation Report - HSI19T-S2NB-F',
    reportNo: 'REP-CS-2026-0881',
    modelName: 'HSI19T-S2NB-F',
    unitSource: 'proto',
    serialNo: '58192',
    station: 'Station 01',
    requestBy: 'Mohit Sharma',
    createdAt: '2026-08-15 14:30',
    generatedDate: '2026-08-15',
    specs: {
      coolingCapacity: '5200 W (1.5 Ton Inverter)',
      powerMode: '230V / 50Hz / Single Phase',
      refrigerant: 'R-32 (950g)',
      iseer: '5.20 (5 Star)',
      iduMotorSpec: 'DC Inverter Motor 30W',
      iduMotorPartCode: 'MTR-IDU-2201',
      iduMotorSupplier: 'Nidec Japan',
      iduPcbPartCode: 'PCB-IDU-8841',
      iduPcbSupplier: 'Sanken Electric',
      oduMotorSpec: 'DC Brushless 45W',
      oduMotorPartCode: 'MTR-ODU-3310',
      oduMotorSupplier: 'Nidec Japan',
      oduPcbPartCode: 'PCB-ODU-9902',
      oduPcbSupplier: 'Delta Electronics',
      compressorSpec: 'Twin Rotary Inverter',
      compressorPartCode: 'CMP-ODU-7721',
      compressorSupplier: 'Highly Panasonic',
      eevSpec: 'Electronic Expansion Valve 500 Pulse',
      eevPartCode: 'EEV-ODU-1022',
      eevSupplier: 'Sanjia EEV',
      sampleReceivedDate: '2026-08-10',
      testCommencedDate: '2026-08-10',
      testCompletedDate: '2026-08-15',
      testConclusion: 'All customer simulation tests passed. Performance and thermal parameters conform to design specs.'
    },
    dataValuesMap: {
      Model_Name: 'HSI19T-S2NB-F',
      Report_No: 'REP-CS-2026-0881',
      Sample_Received_Date: '2026-08-10',
      Test_Commenced_Date: '2026-08-10',
      Test_Completed_Date: '2026-08-15',
      Cooling_Capacity: '5200 W (1.5 Ton Inverter)',
      Power_Mode: '230V / 50Hz / Single Phase',
      Power_mode: '230V / 50Hz / Single Phase',
      Refrigerant: 'R-32 (950g)',
      Gas_injection_Volume: '950 g',
      Gas_Injection_Volume: '950 g',
      ISEER: '5.20 (5 Star)',
      IDU_Motor_Spec: 'DC Inverter Motor 30W',
      IDU_Motor_Part_Code: 'MTR-IDU-2201',
      IDU_Motor_Supplier: 'Nidec Japan',
      IDU_PCB_Part_Code: 'PCB-IDU-8841',
      IDU_PCB_Supplier: 'Sanken Electric',
      ODU_Motor_Spec: 'DC Brushless 45W',
      ODU_Motor_Part_Code: 'MTR-ODU-3310',
      ODU_Motor_Supplier: 'Nidec Japan',
      ODU_PCB_Part_Code: 'PCB-ODU-9902',
      ODU_PCB_Supplier: 'Delta Electronics',
      "Compressor _Spec": 'Twin Rotary Inverter',
      Compressor_Spec: 'Twin Rotary Inverter',
      Compressor_Part_Code: 'CMP-ODU-7721',
      Compressor_Supplier: 'Highly Panasonic',
      EEV_Spec: 'Electronic Expansion Valve 500 Pulse',
      EEV_Part_Code: 'EEV-ODU-1022',
      EEV_Supplier: 'Sanjia EEV',
      Request_By: 'Mohit Sharma',
      Station: 'Station 01',
      Test_Conclusion: 'All customer simulation tests passed. Performance and thermal parameters conform to design specs.'
    },
    photos: {},
    templateName: 'Standard Customer Simulation Template v2',
    status: 'Verified',
    remarks: 'Approved by Lab Incharge. Ready for release.'
  },
  {
    id: 'rep-ce-102',
    reportType: 'cs-experience',
    tag: 'C Experience',
    title: 'Customer Experience Report - YU63 Dual Inverter',
    reportNo: 'REP-CE-2026-0412',
    modelName: 'YU63 Dual Inverter',
    unitSource: 'proto',
    serialNo: '14209',
    station: 'Station 02',
    requestBy: 'Indrajit',
    createdAt: '2026-08-16 11:20',
    generatedDate: '2026-08-16',
    specs: {
      coolingCapacity: '3500 W (1.0 Ton Dual Inverter)',
      powerMode: '230V / 50Hz / Single Phase',
      refrigerant: 'R-32 (780g)',
      iseer: '4.85 (4 Star)',
      iduMotorSpec: 'DC Motor 25W High Efficiency',
      iduMotorPartCode: 'MTR-IDU-1109',
      iduMotorSupplier: 'Welling Motor',
      iduPcbPartCode: 'PCB-IDU-4021',
      iduPcbSupplier: 'Renesas',
      oduMotorSpec: 'BLDC Fan Motor 40W',
      oduMotorPartCode: 'MTR-ODU-2290',
      oduMotorSupplier: 'Welling Motor',
      oduPcbPartCode: 'PCB-ODU-5510',
      oduPcbSupplier: 'Texas Instruments',
      compressorSpec: 'Dual Inverter GMCC',
      compressorPartCode: 'CMP-ODU-3388',
      compressorSupplier: 'GMCC Toshiba',
      eevSpec: 'Sanjia 480 Pulse EEV',
      eevPartCode: 'EEV-ODU-2091',
      eevSupplier: 'Sanjia EEV',
      sampleReceivedDate: '2026-08-12',
      testCommencedDate: '2026-08-12',
      testCompletedDate: '2026-08-16',
      testConclusion: 'Acoustic levels below 32dB(A). Low voltage operational limit validated smoothly at 145V.'
    },
    dataValuesMap: {
      Model_Name: 'YU63 Dual Inverter',
      Report_No: 'REP-CE-2026-0412',
      Sample_Received_Date: '2026-08-12',
      Test_Commenced_Date: '2026-08-12',
      Test_Completed_Date: '2026-08-16',
      Cooling_Capacity: '3500 W (1.0 Ton Dual Inverter)',
      Power_Mode: '230V / 50Hz / Single Phase',
      Refrigerant: 'R-32 (780g)',
      ISEER: '4.85 (4 Star)',
      IDU_Motor_Spec: 'DC Motor 25W High Efficiency',
      IDU_Motor_Part_Code: 'MTR-IDU-1109',
      IDU_Motor_Supplier: 'Welling Motor',
      IDU_PCB_Part_Code: 'PCB-IDU-4021',
      IDU_PCB_Supplier: 'Renesas',
      ODU_Motor_Spec: 'BLDC Fan Motor 40W',
      ODU_Motor_Part_Code: 'MTR-ODU-2290',
      ODU_Motor_Supplier: 'Welling Motor',
      ODU_PCB_Part_Code: 'PCB-ODU-5510',
      ODU_PCB_Supplier: 'Texas Instruments',
      Compressor_Spec: 'Dual Inverter GMCC',
      Compressor_Part_Code: 'CMP-ODU-3388',
      Compressor_Supplier: 'GMCC Toshiba',
      EEV_Spec: 'Sanjia 480 Pulse EEV',
      EEV_Part_Code: 'EEV-ODU-2091',
      EEV_Supplier: 'Sanjia EEV',
      Request_By: 'Indrajit',
      Station: 'Station 02',
      Test_Conclusion: 'Acoustic levels below 32dB(A). Low voltage operational limit validated smoothly at 145V.'
    },
    photos: {},
    templateName: 'Standard Customer Experience Template v1',
    status: 'Generated',
    remarks: 'Customer experience validation passed with excellent user ergonomics score.'
  }
];

let savedReportsCache: SavedReport[] = loadLocalReports();
let listeners: ((reports: SavedReport[]) => void)[] = [];

// Initialize IndexedDB async sync
initIndexedDbReports();

async function initIndexedDbReports() {
  try {
    const remoteReports = await fetchReportRoomFromSupabase();
    if (remoteReports && remoteReports.length > 0) {
      const mergedMap = new Map<string, SavedReport>();
      savedReportsCache.forEach(r => mergedMap.set(r.id, r));
      remoteReports.forEach((r: SavedReport) => mergedMap.set(r.id, r));
      savedReportsCache = Array.from(mergedMap.values());
      persistReports(savedReportsCache);
      notifyListeners(savedReportsCache);
    }

    const idbReports = await idbGetAll<SavedReport>('saved_reports');
    if (idbReports && idbReports.length > 0) {
      // Merge with in-memory / local storage cache (prefer IDB since it holds full high-res photos)
      const mergedMap = new Map<string, SavedReport>();
      savedReportsCache.forEach(r => mergedMap.set(r.id, r));
      idbReports.forEach(r => mergedMap.set(r.id, r));
      savedReportsCache = Array.from(mergedMap.values());
      notifyListeners(savedReportsCache);
    } else if (savedReportsCache.length > 0) {
      // Seed IndexedDB with initial cache
      idbSaveAll('saved_reports', savedReportsCache);
    }
  } catch (err) {
    console.warn('[ReportRoom] Failed to load from IndexedDB:', err);
  }
}

function loadLocalReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORT_ROOM);
    if (raw === null) {
      safeLocalStorageSet(STORAGE_KEY_REPORT_ROOM, INITIAL_SAVED_REPORTS);
      return INITIAL_SAVED_REPORTS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return INITIAL_SAVED_REPORTS;
    }
    return parsed;
  } catch (err) {
    console.warn('Error reading saved reports from localStorage:', err);
    return INITIAL_SAVED_REPORTS;
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

export function saveReportToRoom(reportData: Omit<SavedReport, 'id' | 'createdAt'> & { id?: string }): SavedReport {
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

  // Sync to Supabase
  syncReportRoomToSupabase(newReport);

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
  const current = getSavedReports();
  const deletedItem = current.find(r => r.id === id);
  const updated = current.filter(r => r.id !== id);
  
  persistReports(updated);
  deleteReportRoomFromSupabase(id);

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
  const current = getSavedReports();
  const idx = current.findIndex(r => r.id === id);
  if (idx === -1) return null;

  current[idx] = {
    ...current[idx],
    ...updates
  };

  persistReports(current);
  syncReportRoomToSupabase(current[idx]);
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
