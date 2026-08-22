import { Unit, ActivityLog, LabNotification, WORKFLOW_STAGES, TimelineStep, Department } from '../types';
import { db, isFirebaseConfigured, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, onSnapshot } from './firebase';
import { 
  syncRDUnitToSupabase, 
  deleteRDUnitFromSupabase, 
  fetchRDUnitsFromSupabase 
} from '../lib/supabase';

const STORAGE_KEY_UNITS = 'llt_lab_units_v2';
const STORAGE_KEY_LOGS = 'llt_lab_activity_logs_v2';
const STORAGE_KEY_NOTIFS = 'llt_lab_notifications_v2';

const INITIAL_UNITS: Unit[] = [
  {
    id: 'unit-101',
    modelName: 'LLT-V8 Micro-Sensor Array',
    serialNumber: 'SN-2026-9810',
    requiredBy: getFutureDateStr(6), // 6 days remaining -> Green
    dayDuration: 7,
    transferDate: '2026-07-20 09:30',
    bsrPerson: 'Alex Rivera (BSR)',
    eltPerson: 'Sarah Chen (ELT)',
    rdPerson: 'Indrajit (R&D)',
    oqcPerson: 'Marcus Thorne (OQC)',
    currentHolder: 'Sarah Chen (ELT)',
    currentStageIndex: 1, // ELT Person
    status: 'transferred',
    createdAt: '2026-07-20T09:30:00Z',
    updatedAt: '2026-07-20T09:30:00Z',
    priority: 'High',
    notes: 'Thermal stress tolerance verification required prior to high-altitude deployment.',
    timeline: createInitialTimeline('Alex Rivera (BSR)', 'Sarah Chen (ELT)', 'Indrajit (R&D)', 1)
  },
  {
    id: 'unit-102',
    modelName: 'LLT-900 Thermal Processor',
    serialNumber: 'SN-2026-4401',
    requiredBy: getFutureDateStr(3), // 3 days remaining -> Yellow
    dayDuration: 5,
    transferDate: '2026-07-21 14:15',
    bsrPerson: 'Vikram Patel (BSR)',
    eltPerson: 'Elena Rostova (ELT)',
    rdPerson: 'Dr. Alan Grant (R&D)',
    currentHolder: 'Dr. Alan Grant (R&D)',
    currentStageIndex: 3, // Area (R&D)
    status: 'transferred',
    createdAt: '2026-07-21T14:15:00Z',
    updatedAt: '2026-07-22T10:00:00Z',
    priority: 'High',
    notes: 'Chamber 4 calibration test pending approval.',
    timeline: createInitialTimeline('Vikram Patel (BSR)', 'Elena Rostova (ELT)', 'Dr. Alan Grant (R&D)', 3)
  },
  {
    id: 'unit-103',
    modelName: 'LLT-Optic 50X Radar Module',
    serialNumber: 'SN-2026-1192',
    requiredBy: getFutureDateStr(0), // 0 days -> Red / Urgent
    dayDuration: 4,
    transferDate: '2026-07-19 11:00',
    bsrPerson: 'Alex Rivera (BSR)',
    eltPerson: 'Kenji Sato (ELT)',
    rdPerson: 'Dr. Maya Lin (R&D)',
    currentHolder: 'Kenji Sato (ELT)',
    currentStageIndex: 6, // ELT Person (Return loop)
    status: 'pending_verification',
    createdAt: '2026-07-19T11:00:00Z',
    updatedAt: '2026-07-23T08:00:00Z',
    priority: 'High',
    notes: 'Secondary optical alignment complete, pending ELT sign-off.',
    timeline: createInitialTimeline('Alex Rivera (BSR)', 'Kenji Sato (ELT)', 'Dr. Maya Lin (R&D)', 6)
  },
  {
    id: 'unit-104',
    modelName: 'LLT-200 Power Mod Gen-3',
    serialNumber: 'SN-2026-7023',
    requiredBy: getFutureDateStr(10), // 10 days -> Green
    dayDuration: 12,
    transferDate: '2026-07-18 08:45',
    bsrPerson: 'Maria Garcia (BSR)',
    eltPerson: 'Sarah Chen (ELT)',
    rdPerson: 'Indrajit (R&D)',
    oqcPerson: 'Marcus Thorne (OQC)',
    currentHolder: 'Maria Garcia (BSR)',
    currentStageIndex: 13, // Unit Received (Completed)
    status: 'received',
    createdAt: '2026-07-18T08:45:00Z',
    updatedAt: '2026-07-23T09:00:00Z',
    priority: 'Normal',
    notes: 'Full cycle validation passed with zero defects.',
    timeline: createInitialTimeline('Maria Garcia (BSR)', 'Sarah Chen (ELT)', 'Indrajit (R&D)', 13)
  },
  {
    id: 'unit-105',
    modelName: 'LLT-Cryo Subsystem Delta',
    serialNumber: 'SN-2026-3011',
    requiredBy: getFutureDateStr(2), // 2 days -> Yellow
    dayDuration: 6,
    transferDate: '2026-07-22 16:20',
    bsrPerson: 'Alex Rivera (BSR)',
    eltPerson: 'Elena Rostova (ELT)',
    rdPerson: 'Dr. Alan Grant (R&D)',
    currentHolder: 'Elena Rostova (ELT)',
    currentStageIndex: 1, // ELT Person
    status: 'rework',
    createdAt: '2026-07-22T16:20:00Z',
    updatedAt: '2026-07-23T07:15:00Z',
    priority: 'High',
    notes: 'Seal leakage detected during pressure ramp. Returned for rework.',
    timeline: createInitialTimeline('Alex Rivera (BSR)', 'Elena Rostova (ELT)', 'Dr. Alan Grant (R&D)', 1)
  }
];

const INITIAL_LOGS: ActivityLog[] = [
  {
    id: 'log-shift-start-1',
    unitId: 'SHIFT-GEN',
    modelName: 'Lab Shift Management',
    serialNumber: 'General Shift',
    action: 'Lab Shift Started - General Shift Operational (09:00 AM)',
    performedBy: 'Shift Supervisor',
    timestamp: '2026-08-05 09:00',
    stageName: 'Shift Schedule',
    type: 'shift_start'
  },
  {
    id: 'log-shift-off-1',
    unitId: 'SHIFT-PREV',
    modelName: 'Lab Shift Management',
    serialNumber: 'General Shift',
    action: 'Lab Shift Ended / Turned Off (05:30 PM)',
    performedBy: 'Shift Supervisor',
    timestamp: '2026-08-04 17:30',
    stageName: 'Shift Schedule',
    type: 'shift_off'
  },
  {
    id: 'log-1',
    unitId: 'unit-101',
    modelName: 'LLT-V8 Micro-Sensor Array',
    serialNumber: 'SN-2026-9810',
    action: 'Unit Transferred to R&D Workflow',
    performedBy: 'Alex Rivera (BSR)',
    timestamp: '2026-07-20 09:30',
    stageName: 'BSR Person',
    type: 'transfer'
  },
  {
    id: 'log-2',
    unitId: 'unit-104',
    modelName: 'LLT-200 Power Mod Gen-3',
    serialNumber: 'SN-2026-7023',
    action: 'Final Inspection Passed - Moved to Received Tab',
    performedBy: 'Maria Garcia (BSR)',
    timestamp: '2026-07-23 09:00',
    stageName: 'Unit Received',
    type: 'received'
  },
  {
    id: 'log-3',
    unitId: 'unit-105',
    modelName: 'LLT-Cryo Subsystem Delta',
    serialNumber: 'SN-2026-3011',
    action: 'Flagged for Rework - Pressure Ramp Leakage',
    performedBy: 'Elena Rostova (ELT)',
    timestamp: '2026-07-23 07:15',
    stageName: 'ELT Person',
    type: 'rework'
  }
];

const INITIAL_NOTIFS: LabNotification[] = [
  {
    id: 'notif-1',
    title: 'New Unit Transferred',
    message: 'Unit SN-2026-9810 (LLT-V8 Micro-Sensor) transferred by Alex Rivera.',
    timestamp: '10 mins ago',
    read: false,
    type: 'info',
    unitId: 'unit-101'
  },
  {
    id: 'notif-2',
    title: 'Urgent Target Date',
    message: 'Unit SN-2026-1192 is due today (0 days remaining).',
    timestamp: '1 hour ago',
    read: false,
    type: 'alert',
    unitId: 'unit-103'
  },
  {
    id: 'notif-3',
    title: 'Rework Requested',
    message: 'LLT-Cryo Subsystem Delta returned for seal rework.',
    timestamp: '2 hours ago',
    read: true,
    type: 'warning',
    unitId: 'unit-105'
  }
];

// Memory store state
let unitsCache: Unit[] = loadLocalUnits();
let logsCache: ActivityLog[] = loadLocalLogs();
let notifsCache: LabNotification[] = loadLocalNotifs();

const listeners: Set<() => void> = new Set();

// Automatically fetch from Supabase on init
initSupabaseSync();

async function initSupabaseSync() {
  const remoteData = await fetchRDUnitsFromSupabase();
  if (remoteData && remoteData.length > 0) {
    unitsCache = normalizeUnitTimelines(remoteData);
    localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(unitsCache));
    notifyListeners();
  } else {
    // Sync initial demo units to Supabase if remote is empty
    INITIAL_UNITS.forEach(u => syncRDUnitToSupabase(u));
  }
}

function notifyListeners() {
  listeners.forEach(fn => fn());
}

export function subscribeUnitStore(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function saveLocalUnits(data: Unit[]) {
  unitsCache = data;
  localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(data));
  notifyListeners();
}

function saveLocalLogs(data: ActivityLog[]) {
  logsCache = data;
  localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(data));
  notifyListeners();
}

function saveLocalNotifs(data: LabNotification[]) {
  notifsCache = data;
  localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(data));
  notifyListeners();
}

function normalizeUnitTimelines(units: Unit[]): Unit[] {
  if (!Array.isArray(units)) return INITIAL_UNITS;
  return units.filter((u): u is Unit => Boolean(u && typeof u === 'object')).map(u => {
    let currentStageIndex = typeof u.currentStageIndex === 'number' ? u.currentStageIndex : 0;
    let currentHolder = u.currentHolder || 'Unassigned';

    // Automatically correct units created at Stage 0 (BSR) when ELT and R&D persons were assigned in the form
    if (currentStageIndex === 0) {
      if (u.rdPerson && u.rdPerson.trim()) {
        currentStageIndex = 2; // Step 3: R&D Person
        currentHolder = u.rdPerson;
      } else if (u.eltPerson && u.eltPerson.trim()) {
        currentStageIndex = 1; // Step 2: ELT Person
        currentHolder = u.eltPerson;
      }
    }

    // Automatically transition from Step 3 (R&D Person, index 2) to Step 4 (R&D Area, index 3) after 20 seconds
    if (currentStageIndex === 2) {
      const createdMs = u.createdAt ? new Date(u.createdAt).getTime() : Date.now();
      if (!isNaN(createdMs) && (Date.now() - createdMs >= 20000)) {
        currentStageIndex = 3; // Step 4: R&D Area
        currentHolder = u.rdPerson || u.bsrPerson || 'Requester';
      }
    }

    let timeline = u.timeline || [];
    const normalizedTimeline = WORKFLOW_STAGES.map((stage, idx) => {
      const existingStep = timeline[idx];
      let stepPerson = existingStep?.personName;

      if (!stepPerson || stepPerson === stage.defaultRole || stepPerson === 'Unassigned' || stepPerson === 'Lab Area Supervisor' || stepPerson === 'R&D Area Supervisor') {
        if (stage.department === 'BSR' && u.bsrPerson) stepPerson = u.bsrPerson;
        else if (stage.department === 'ELT' && u.eltPerson) stepPerson = u.eltPerson;
        else if (stage.department === 'R&D' && u.rdPerson) stepPerson = u.rdPerson;
        else if (stage.department === 'OQC' && u.oqcPerson) stepPerson = u.oqcPerson;
        else if (stage.department === 'AREA') stepPerson = u.rdPerson || u.bsrPerson || 'Requester';
        else stepPerson = stage.defaultRole;
      }

      let stepStatus: 'completed' | 'current' | 'pending' = 'pending';
      if (idx < currentStageIndex) {
        stepStatus = 'completed';
      } else if (idx === currentStageIndex) {
        stepStatus = (u.status === 'received' || u.status === 'completed') ? 'completed' : 'current';
      }

      let stepStageName = stage.stageName;

      let stepRemarks = existingStep?.remarks || '';
      if (stepRemarks.startsWith('Awaiting') || stepRemarks.includes('Currently active at Step 1') || stepRemarks.includes('Stage Step')) {
        stepRemarks = '';
      }

      const now = new Date();
      const dateStr = u.transferDate ? u.transferDate.split(' ')[0] : now.toISOString().split('T')[0];
      const timeStr = u.transferDate ? u.transferDate.split(' ').slice(1).join(' ') : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        id: existingStep?.id || `step-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        stageIndex: idx,
        stageName: stepStageName,
        department: stage.department,
        personName: stepPerson,
        date: existingStep?.date && existingStep.date !== '--' ? existingStep.date : (idx <= currentStageIndex ? dateStr : '--'),
        time: existingStep?.time && existingStep.time !== '--' ? existingStep.time : (idx <= currentStageIndex ? timeStr : '--'),
        remarks: stepRemarks,
        status: stepStatus
      };
    });

    return {
      ...u,
      currentStageIndex,
      currentHolder,
      timeline: normalizedTimeline
    };
  });
}

function loadLocalUnits(): Unit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_UNITS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(INITIAL_UNITS));
      return INITIAL_UNITS;
    }
    const parsed = JSON.parse(raw);
    return normalizeUnitTimelines(parsed);
  } catch (e) {
    return INITIAL_UNITS;
  }
}

function loadLocalLogs(): ActivityLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGS);
    if (!raw) return INITIAL_LOGS;
    return JSON.parse(raw);
  } catch (e) {
    return INITIAL_LOGS;
  }
}

function loadLocalNotifs(): LabNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
    if (!raw) return INITIAL_NOTIFS;
    return JSON.parse(raw);
  } catch (e) {
    return INITIAL_NOTIFS;
  }
}

// Helpers for timeline generation
export function createInitialTimeline(bsrPerson: string, eltPerson: string, rdPerson: string, activeStageIdx: number = 0): TimelineStep[] {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return WORKFLOW_STAGES.map((stage, idx) => {
    let person = 'Unassigned';
    if (stage.department === 'BSR') person = bsrPerson || 'BSR Officer';
    else if (stage.department === 'ELT') person = eltPerson || 'ELT Officer';
    else if (stage.department === 'R&D') person = rdPerson || 'R&D Lead';
    else if (stage.department === 'OQC') person = 'OQC Quality Inspector';
    else if (stage.department === 'AREA') person = rdPerson || bsrPerson || 'Requester';

    let stepStatus: 'completed' | 'current' | 'pending' = 'pending';
    if (idx < activeStageIdx) stepStatus = 'completed';
    else if (idx === activeStageIdx) stepStatus = 'current';

    let stepRemarks = '';
    if (idx === 7) { // Step 8 (0-indexed 7)
      if (stepStatus === 'completed') stepRemarks = 'Unit Verification Passed';
      else if (stepStatus === 'current') stepRemarks = 'Unit Verification Pending';
    }

    return {
      id: `step-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      stageIndex: idx,
      stageName: stage.stageName,
      department: stage.department,
      personName: person,
      date: idx <= activeStageIdx ? dateStr : '--',
      time: idx <= activeStageIdx ? timeStr : '--',
      remarks: stepRemarks,
      status: stepStatus
    };
  });
}

function getFutureDateStr(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

// API functions
export function getUnits(): Unit[] {
  return normalizeUnitTimelines(unitsCache);
}

export function getActivityLogs(): ActivityLog[] {
  return [...logsCache];
}

export function addShiftActivityLog(
  action: string,
  type: 'shift_start' | 'shift_off' | 'shift_change',
  shiftName: string = 'Lab Shift',
  performedBy: string = 'Shift Manager'
): ActivityLog {
  const now = new Date();
  const timeFormatted = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const newLog: ActivityLog = {
    id: `log-shift-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    unitId: 'LAB-SHIFT',
    modelName: 'Lab Shift Management',
    serialNumber: shiftName,
    action: action,
    performedBy: performedBy,
    timestamp: timeFormatted,
    stageName: 'Shift Schedule',
    type: type
  };
  logsCache = [newLog, ...logsCache];
  saveLocalLogs(logsCache);
  notifyListeners();
  return newLog;
}

export function getNotifications(): LabNotification[] {
  return [...notifsCache];
}

export function addLabNotification(
  title: string,
  message: string,
  type: 'info' | 'warning' | 'alert' = 'info'
): LabNotification {
  const newNotif: LabNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title,
    message,
    timestamp: 'Just now',
    read: false,
    type
  };
  notifsCache = [newNotif, ...notifsCache];
  saveLocalNotifs(notifsCache);
  return newNotif;
}

export async function addMultipleUnits(
  unitRows: { modelName: string; serialNumber: string }[],
  requiredBy: string,
  dayDuration: number,
  bsrPerson: string,
  eltPerson: string,
  rdPerson: string
): Promise<Unit[]> {
  const now = new Date();
  const transferDateFormatted = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  
  let initialStageIdx = 0;
  let holder = bsrPerson || 'BSR Person';
  if (rdPerson && rdPerson.trim()) {
    initialStageIdx = 2; // Step 3: R&D Person
    holder = rdPerson;
  } else if (eltPerson && eltPerson.trim()) {
    initialStageIdx = 1; // Step 2: ELT Person
    holder = eltPerson;
  }

  const newUnits: Unit[] = unitRows.map((row) => {
    const unitId = `unit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const initialTimeline = createInitialTimeline(bsrPerson, eltPerson, rdPerson, initialStageIdx);

    return {
      id: unitId,
      modelName: row.modelName || 'LLT Standard Module',
      serialNumber: row.serialNumber || `SN-${Math.floor(100000 + Math.random() * 900000)}`,
      requiredBy: requiredBy || getFutureDateStr(dayDuration || 7),
      dayDuration: Number(dayDuration) || 7,
      transferDate: transferDateFormatted,
      bsrPerson,
      eltPerson,
      rdPerson,
      currentHolder: holder,
      currentStageIndex: initialStageIdx,
      status: 'transferred',
      timeline: initialTimeline,
      priority: 'Normal',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

  const updatedUnits = [...newUnits, ...unitsCache];
  saveLocalUnits(updatedUnits);

  // Log activity
  const newLogs: ActivityLog[] = newUnits.map(u => ({
    id: `log-${Date.now()}-${Math.random()}`,
    unitId: u.id,
    modelName: u.modelName,
    serialNumber: u.serialNumber,
    action: `Unit Transferred to R&D Workflow by ${bsrPerson}`,
    performedBy: bsrPerson,
    timestamp: transferDateFormatted,
    stageName: 'BSR Person',
    type: 'transfer' as const
  }));

  saveLocalLogs([...newLogs, ...logsCache]);

  // Add Notification
  const newNotif: LabNotification = {
    id: `notif-${Date.now()}`,
    title: `${newUnits.length} Unit(s) Transferred`,
    message: `${newUnits.map(u => u.serialNumber).join(', ')} assigned from BSR to ELT/R&D.`,
    timestamp: 'Just now',
    read: false,
    type: 'info'
  };
  saveLocalNotifs([newNotif, ...notifsCache]);

  // Sync to Supabase
  for (const u of newUnits) {
    syncRDUnitToSupabase(u);
  }

  // Sync to Firestore if configured
  if (isFirebaseConfigured && db) {
    try {
      for (const u of newUnits) {
        await setDoc(doc(db, 'units', u.id), u);
      }
    } catch (err) {
      console.error("Firestore sync error:", err);
    }
  }

  return newUnits;
}

export async function advanceUnitStage(
  unitId: string, 
  performerName: string, 
  remarks: string, 
  nextStageIdx?: number,
  overrideStatus?: Unit['status']
) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Time 30 seconds later for Stage 9 (Unit Verify)
  const time30SecLater = new Date(now.getTime() + 30000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const updatedUnits = unitsCache.map(u => {
    if (u.id !== unitId) return u;

    const currentIdx = u.currentStageIndex;
    const targetIdx = typeof nextStageIdx === 'number' ? nextStageIdx : Math.min(currentIdx + 1, WORKFLOW_STAGES.length - 1);
    
    const isFinalStage = targetIdx === WORKFLOW_STAGES.length - 1;
    const newStatus: Unit['status'] = overrideStatus || (isFinalStage ? 'received' : u.status === 'rework' && !overrideStatus ? 'rework' : 'transferred');

    // Update timeline steps
    const updatedTimeline = WORKFLOW_STAGES.map((stage, idx) => {
      const existingStep = u.timeline[idx];
      let stepStatus: 'completed' | 'current' | 'pending' = 'pending';
      if (idx < targetIdx) {
        stepStatus = 'completed';
      } else if (idx === targetIdx) {
        stepStatus = isFinalStage ? 'completed' : 'current';
      }

      let stepPerson = existingStep?.personName || performerName || stage.defaultRole;

      // Keep OQC person name synchronized for all OQC stages
      if (stage.department === 'OQC') {
        const activeOqcPerson = (performerName && (idx === targetIdx || targetIdx >= 7)) ? performerName : (u.oqcPerson || performerName);
        if (activeOqcPerson) {
          stepPerson = activeOqcPerson;
        }
      } else if (performerName && idx === targetIdx) {
        stepPerson = performerName;
      }

      let stepDate = (idx === targetIdx) ? dateStr : (existingStep?.date && existingStep.date !== '--' ? existingStep.date : dateStr);
      let stepTime = (idx === targetIdx) ? timeStr : (existingStep?.time && existingStep.time !== '--' ? existingStep.time : timeStr);

      let stepRemarks = existingStep?.remarks || '';
      if (idx === targetIdx) {
        stepRemarks = remarks || '';
      }

      return {
        id: existingStep?.id || `step-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        stageIndex: idx,
        stageName: stage.stageName,
        department: stage.department,
        personName: stepPerson,
        date: idx <= targetIdx ? stepDate : '--',
        time: idx <= targetIdx ? stepTime : '--',
        remarks: stepRemarks,
        status: stepStatus
      };
    });

    const newHolder = performerName || WORKFLOW_STAGES[targetIdx].stageName;

    return {
      ...u,
      oqcPerson: (targetIdx >= 7 && performerName) ? performerName : u.oqcPerson,
      currentStageIndex: targetIdx,
      currentHolder: newHolder,
      status: newStatus,
      timeline: updatedTimeline,
      updatedAt: now.toISOString()
    };
  });

  saveLocalUnits(updatedUnits);

  const targetUnit = updatedUnits.find(u => u && u.id === unitId);
  if (targetUnit) {
    const stageName = WORKFLOW_STAGES[targetUnit.currentStageIndex]?.stageName || 'Transfer Completed';
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      unitId,
      modelName: targetUnit.modelName,
      serialNumber: targetUnit.serialNumber,
      action: targetUnit.status === 'received' ? 'Unit Workflow Completed & Received' : `Advanced to Stage: ${stageName}`,
      performedBy: performerName || 'System',
      timestamp: `${dateStr} ${timeStr}`,
      stageName,
      type: targetUnit.status === 'received' ? 'received' : 'stage_update'
    };
    saveLocalLogs([newLog, ...logsCache]);

    // Sync to Supabase
    syncRDUnitToSupabase(targetUnit);
  }

  // Firestore sync
  if (isFirebaseConfigured && db && targetUnit) {
    try {
      await setDoc(doc(db, 'units', targetUnit.id), targetUnit);
    } catch (e) {
      console.error(e);
    }
  }
}

export async function reworkUnit(unitId: string, performerName: string, remarks: string) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const updatedUnits = unitsCache.map(u => {
    if (u.id !== unitId) return u;
    
    // Set status to rework
    const updatedTimeline = u.timeline.map((step, idx) => {
      if (idx === u.currentStageIndex) {
        return {
          ...step,
          remarks: `[REWORK REQUESTED] ${remarks || 'Issues identified during validation.'}`
        };
      }
      return step;
    });

    return {
      ...u,
      status: 'rework' as const,
      timeline: updatedTimeline,
      notes: `[REWORK] ${remarks}`,
      updatedAt: now.toISOString()
    };
  });

  saveLocalUnits(updatedUnits);

  const targetUnit = updatedUnits.find(u => u && u.id === unitId);
  if (targetUnit) {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      unitId,
      modelName: targetUnit.modelName,
      serialNumber: targetUnit.serialNumber,
      action: `Flagged for Rework: ${remarks}`,
      performedBy: performerName || 'Quality Specialist',
      timestamp: `${dateStr} ${timeStr}`,
      stageName: WORKFLOW_STAGES[targetUnit.currentStageIndex]?.stageName || 'Completed',
      type: 'rework'
    };
    saveLocalLogs([newLog, ...logsCache]);

    // Sync to Supabase
    syncRDUnitToSupabase(targetUnit);
  }
}

export async function updateUnitDetails(unitId: string, partial: Partial<Unit>) {
  let updatedTarget: Unit | null = null;
  const updatedUnits = unitsCache.map(u => {
    if (u.id !== unitId) return u;
    updatedTarget = {
      ...u,
      ...partial,
      updatedAt: new Date().toISOString()
    };
    return updatedTarget;
  });
  saveLocalUnits(updatedUnits);

  if (updatedTarget) {
    syncRDUnitToSupabase(updatedTarget);
  }
}

export async function deleteUnit(unitId: string) {
  const target = unitsCache.find(u => u.id === unitId);
  const updatedUnits = unitsCache.filter(u => u.id !== unitId);
  saveLocalUnits(updatedUnits);

  if (target) {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      unitId,
      modelName: target.modelName,
      serialNumber: target.serialNumber,
      action: `Deleted Unit from Lab System`,
      performedBy: 'Authorized User',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      type: 'delete'
    };
    saveLocalLogs([newLog, ...logsCache]);
  }

  // Delete from Supabase
  deleteRDUnitFromSupabase(unitId);

  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'units', unitId));
    } catch (e) {
      console.error(e);
    }
  }
}

export function markNotificationAsRead(id: string) {
  const updated = notifsCache.map(n => n.id === id ? { ...n, read: true } : n);
  saveLocalNotifs(updated);
}

export function addNotification(title: string, message: string, type: 'info' | 'warning' | 'success' | 'alert' = 'alert', unitId?: string) {
  const existing = notifsCache.find(n => n.title === title && n.message === message);
  if (existing) return;
  const newNotif: LabNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    title,
    message,
    timestamp: 'Just now',
    read: false,
    type,
    unitId
  };
  saveLocalNotifs([newNotif, ...notifsCache]);
}

export function clearNotifications() {
  saveLocalNotifs([]);
}

export function resetToDemoData() {
  saveLocalUnits(INITIAL_UNITS);
  saveLocalLogs(INITIAL_LOGS);
  saveLocalNotifs(INITIAL_NOTIFS);
}

export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const cleanStr = dateStr.trim().split(' ')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  const fallback = new Date(dateStr);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

export function calculateRemainingDays(requiredByDateStr: string): number {
  if (!requiredByDateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseLocalDate(requiredByDateStr);
  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Checks if a unit is currently at R&D Person or in R&D Area stage (Stage 2: R&D Person, Stage 3: R&D Area, Stage 4: R&D Person Return).
 */
export function isUnitInRDAreaOrPerson(unit: Unit): boolean {
  if (!unit) return false;
  const idx = unit.currentStageIndex ?? 0;
  const stage = WORKFLOW_STAGES[idx];
  if (stage && (stage.department === 'R&D' || stage.department === 'AREA')) {
    return true;
  }
  return idx === 2 || idx === 3 || idx === 4;
}

/**
 * Checks if a unit is overdue AND currently in R&D Person / R&D Area stage.
 */
export function isUnitOverdue(unit: Unit): boolean {
  if (!unit) return false;
  if (unit.status === 'received' || unit.status === 'completed' || (unit.currentStageIndex ?? 0) >= 10) {
    return false;
  }
  const days = calculateRemainingDays(unit.requiredBy);
  return days <= 0 && isUnitInRDAreaOrPerson(unit);
}

export function extendUnitRequiredDate(id: string, additionalDays: number): Unit | null {
  if (additionalDays <= 0) return null;
  const now = new Date();
  const dateStr = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  let updatedUnit: Unit | null = null;

  const updatedUnits = unitsCache.map(u => {
    if (u.id === id) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let targetDate = new Date();
      if (u.requiredBy) {
        const existingTarget = parseLocalDate(u.requiredBy);
        if (existingTarget > today) {
          targetDate = existingTarget;
        } else {
          targetDate = today;
        }
      } else {
        targetDate = today;
      }

      targetDate.setDate(targetDate.getDate() + additionalDays);
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      const newRequiredByStr = `${year}-${month}-${day}`;
      const newDuration = (u.dayDuration || 0) + additionalDays;

      const existingObs = u.observations || [];
      const newObs = {
        id: `obs-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        text: `📅 Timeline extended (+${additionalDays} Days) - New Target Date: ${newRequiredByStr}`,
        timestamp: dateStr
      };

      updatedUnit = {
        ...u,
        requiredBy: newRequiredByStr,
        dayDuration: newDuration,
        observations: [newObs, ...existingObs],
        updatedAt: now.toISOString()
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalUnits(updatedUnits);

  if (updatedUnit) {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      unitId: id,
      modelName: updatedUnit.modelName,
      serialNumber: updatedUnit.serialNumber,
      action: `Required Date extended by +${additionalDays} days (New Target: ${updatedUnit.requiredBy})`,
      performedBy: 'Lab Manager',
      timestamp: dateStr,
      stageName: WORKFLOW_STAGES[updatedUnit.currentStageIndex]?.stageName || 'RD Unit',
      type: 'stage_update'
    };
    saveLocalLogs([newLog, ...logsCache]);

    const newNotif: LabNotification = {
      id: `notif-${Date.now()}`,
      title: `Timeline Extended (+${additionalDays} Days)`,
      message: `Unit ${updatedUnit.modelName} (SN: ${updatedUnit.serialNumber}) target date extended to ${updatedUnit.requiredBy}.`,
      timestamp: 'Just now',
      read: false,
      type: 'info'
    };
    saveLocalNotifs([newNotif, ...notifsCache]);

    syncRDUnitToSupabase(updatedUnit);

    if (isFirebaseConfigured && db) {
      try {
        setDoc(doc(db, 'units', updatedUnit.id), updatedUnit);
      } catch (e) {
        console.error(e);
      }
    }
  }

  return updatedUnit;
}

export function addUnitObservation(id: string, text: string): Unit | null {
  const now = new Date();
  const dateStr = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  let updatedUnit: Unit | null = null;

  const updatedUnits = unitsCache.map(u => {
    if (u.id === id) {
      const existingObs = u.observations || [];
      const newObs = {
        id: `obs-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        text: text.trim(),
        timestamp: dateStr
      };
      updatedUnit = {
        ...u,
        observations: [newObs, ...existingObs],
        updatedAt: now.toISOString()
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalUnits(updatedUnits);

  if (updatedUnit) {
    syncRDUnitToSupabase(updatedUnit);
  }

  return updatedUnit;
}

export function deleteUnitObservation(id: string, obsId: string): Unit | null {
  let updatedUnit: Unit | null = null;
  const updatedUnits = unitsCache.map(u => {
    if (u.id === id) {
      const existingObs = u.observations || [];
      updatedUnit = {
        ...u,
        observations: existingObs.filter(o => o.id !== obsId),
        updatedAt: new Date().toISOString()
      };
      return updatedUnit;
    }
    return u;
  });

  saveLocalUnits(updatedUnits);

  if (updatedUnit) {
    syncRDUnitToSupabase(updatedUnit);
  }

  return updatedUnit;
}

export function getAllRDUnits(): Unit[] {
  return [...unitsCache];
}

export function syncUnitToFirestore(unit: Unit) {
  if (!db) return Promise.resolve();
  try {
    const docRef = doc(db, 'units', unit.id);
    return setDoc(docRef, unit);
  } catch (err) {
    console.warn('Firestore RD sync notice:', err);
    return Promise.resolve();
  }
}

export function setRDUnitsDirectly(units: Unit[]) {
  saveLocalUnits(units);
}


export function clearAllRDUnits() {
  saveLocalUnits([]);
}

export function getAllActivityLogs(): ActivityLog[] {
  return [...logsCache];
}

export function setActivityLogsDirectly(logs: ActivityLog[]) {
  saveLocalLogs(logs);
}

export function clearAllActivityLogs() {
  saveLocalLogs([]);
}

export function getAllNotifications(): LabNotification[] {
  return [...notifsCache];
}

export function setNotificationsDirectly(notifs: LabNotification[]) {
  saveLocalNotifs(notifs);
}

export function clearAllNotifications() {
  saveLocalNotifs([]);
}

