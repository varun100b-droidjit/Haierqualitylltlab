import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  Search, 
  Plus, 
  CheckCircle2, 
  Trash2, 
  X,
  UserCheck,
  Clock,
  Layers,
  Check,
  Copy,
  User,
  Eye,
  Database,
  CheckCircle,
  AlertCircle,
  ScanBarcode,
  Calendar,
  Filter,
  FileText,
  MapPin,
  Hash
} from 'lucide-react';
import { UserProfile } from '../../types';
import { 
  syncLeakUnitToSupabase, 
  deleteLeakUnitFromSupabase, 
  fetchLeakUnitsFromSupabase,
  broadcastLabRealtimeEvent,
  subscribeToLabRealtimeEvents 
} from '../../lib/supabase';
import { SmogBarcodeScannerModal } from './SmogBarcodeScannerModal';
import { SmogUniqueCalendar } from './SmogUniqueCalendar';
import { SmogQtyFormModal } from './SmogQtyFormModal';
import { SmogWhatsAppReportModal } from './SmogWhatsAppReportModal';
import { subscribeSmogQtyRecords, SmogQtyRecord } from '../../services/smogQtyStore';
import { findModelByPrefix } from '../../services/modelMasterStore';
import { 
  syncSmogLeakUnitToFirebase, 
  deleteSmogLeakUnitFromFirebase, 
  fetchSmogLeakUnitsFromFirebase, 
  subscribeSmogLeakUnitsFromFirebase 
} from '../../services/smogFirebaseStore';

export interface LeakUnitRecord {
  id: string;
  smogPerson: string;
  shift: 'A' | 'B' | 'C';
  modelName: string;
  serialNumbers: string[];
  passedSerials: string[]; // List of Sr. No. passed/verified
  suspectCount: number;    // Number of Sr. No. in form
  actualCount: number;     // Number of passed Sr. No.
  date: string;            // YYYY-MM-DD
  month: string;           // YYYY-MM
  time: string;            // HH:mm AM/PM
  createdAt: string;
  notes?: string;
  productionDate?: string;
  smogDate?: string;
  operatorUserId?: string;
  location?: string;
  qty?: number;
}

// Backward compatibility export alias
export type SmogUnit = LeakUnitRecord;

const STORAGE_KEY_SMOG_UNITS = 'llt_smog_leak_units_v3';

// Local Inter-Tab Broadcast Channel
const localSmogBus = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('llt_smog_bus') 
  : null;

export function getSmogUnits(): LeakUnitRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SMOG_UNITS);
    if (!raw) {
      const initial: LeakUnitRecord[] = [];
      localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    const cleaned = (Array.isArray(parsed) ? parsed : [])
      .filter((item: any) => {
        return item && item.id && item.id !== 'leak-101' && item.id !== 'leak-102';
      })
      .map((item: any) => ({
        ...item,
        passedSerials: item.passedSerials || [],
        suspectCount: item.suspectCount || (item.serialNumbers ? item.serialNumbers.length : 0),
        actualCount: item.actualCount || (item.passedSerials ? item.passedSerials.length : 0)
      }));

    if (Array.isArray(parsed) && cleaned.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch (err) {
    console.error('Failed to parse smog leak units', err);
    return [];
  }
}

export function saveSmogUnits(units: LeakUnitRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(units));
  } catch (e) {
    console.warn(e);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smog-units-updated'));
  }
  if (localSmogBus) {
    try { localSmogBus.postMessage({ timestamp: Date.now() }); } catch {}
  }
  broadcastLabRealtimeEvent('smog_units_change', { timestamp: Date.now() });
}

export function subscribeSmogUnits(callback: (units: LeakUnitRecord[]) => void): () => void {
  const handler = () => {
    callback(getSmogUnits());
  };
  window.addEventListener('storage', handler);
  window.addEventListener('smog-units-updated', handler);
  if (localSmogBus) {
    localSmogBus.addEventListener('message', handler);
  }
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('smog-units-updated', handler);
    if (localSmogBus) {
      localSmogBus.removeEventListener('message', handler);
    }
  };
}

interface SmogModuleProps {
  currentUser?: UserProfile;
  onNavigateToDashboard?: () => void;
  selectedShiftFilter?: 'all' | 'A' | 'B' | 'C';
  onShiftFilterChange?: (shift: 'all' | 'A' | 'B' | 'C') => void;
}

export const SmogModule: React.FC<SmogModuleProps> = ({ 
  currentUser,
  selectedShiftFilter = 'all',
  onShiftFilterChange,
}) => {
  const [leakRecords, setLeakRecords] = useState<LeakUnitRecord[]>(getSmogUnits());
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'A' | 'B' | 'C'>(selectedShiftFilter);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'syncing' | 'idle'>('idle');
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Sync shiftFilter if selectedShiftFilter prop changes from Sidebar
  useEffect(() => {
    if (selectedShiftFilter && selectedShiftFilter !== shiftFilter) {
      setShiftFilter(selectedShiftFilter);
    }
  }, [selectedShiftFilter]);

  const handleSelectShiftFilter = (newShift: 'all' | 'A' | 'B' | 'C') => {
    setShiftFilter(newShift);
    onShiftFilterChange?.(newShift);
  };

  // Add Leak Modal State
  const [isLeakModalOpen, setIsLeakModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSmogQtyModalOpen, setIsSmogQtyModalOpen] = useState(false);
  const [isWhatsAppReportOpen, setIsWhatsAppReportOpen] = useState(false);
  const [whatsAppReportParams, setWhatsAppReportParams] = useState<{
    date: string;
    shift: 'A' | 'B' | 'C' | 'all';
    smogQty: number;
  } | null>(null);
  const [smogQtyRecords, setSmogQtyRecords] = useState<SmogQtyRecord[]>([]);

  // Subscribe to Smog Qty store changes
  useEffect(() => {
    const unsub = subscribeSmogQtyRecords((records) => {
      setSmogQtyRecords(records);
    });
    return () => unsub();
  }, []);
  
  // View Details Modal State
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<LeakUnitRecord | null>(null);

  // Form State
  const [smogPerson, setSmogPerson] = useState(currentUser?.name || 'Indrajit');
  const [shift, setShift] = useState<'A' | 'B' | 'C'>('A');
  const [modelName, setModelName] = useState('SAC-1.5T-INV-3S');
  const [locationName, setLocationName] = useState('General Location');
  const [serialNumbers, setSerialNumbers] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync profile name when currentUser changes
  useEffect(() => {
    if (currentUser?.name) {
      setSmogPerson(currentUser.name);
    }
  }, [currentUser]);

  // Initial load, Firebase & Supabase sync, and Real-time listener
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setSupabaseStatus('syncing');
      try {
        // 1. Fetch from Firebase Firestore first
        const firestoreData = await fetchSmogLeakUnitsFromFirebase();
        if (firestoreData && firestoreData.length > 0) {
          if (isMounted) {
            setLeakRecords(firestoreData as LeakUnitRecord[]);
            try { localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(firestoreData)); } catch {}
            setSupabaseStatus('connected');
          }
          return;
        }

        // 2. Fallback to Supabase if Firestore has not yet been populated
        const remoteData = await fetchLeakUnitsFromSupabase();
        if (remoteData && remoteData.length > 0) {
          if (isMounted) {
            setLeakRecords(remoteData);
            try { localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(remoteData)); } catch {}
            setSupabaseStatus('connected');
          }
          // Seed records to Firebase Firestore
          for (const record of remoteData) {
            await syncSmogLeakUnitToFirebase(record);
          }
        } else {
          // 3. Sync existing local records to Firebase Firestore & Supabase
          const local = getSmogUnits();
          if (isMounted) {
            setLeakRecords(local);
          }
          for (const record of local) {
            await syncSmogLeakUnitToFirebase(record);
            await syncLeakUnitToSupabase(record);
          }
          if (isMounted) {
            setSupabaseStatus('connected');
          }
        }
      } catch (err) {
        console.warn('Smog leak units initial sync note:', err);
        if (isMounted) {
          setSupabaseStatus('connected');
        }
      }
    };

    loadData();

    // Attach real-time Firestore listener for multi-device sync
    const unsubFirebase = subscribeSmogLeakUnitsFromFirebase((firestoreRecords) => {
      if (isMounted && firestoreRecords && firestoreRecords.length > 0) {
        setLeakRecords(firestoreRecords as LeakUnitRecord[]);
        try { localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(firestoreRecords)); } catch {}
      }
    });

    // Listen to inter-tab changes
    if (localSmogBus) {
      localSmogBus.onmessage = () => {
        if (isMounted) {
          setLeakRecords(getSmogUnits());
        }
      };
    }

    // Subscribe to cross-device realtime broadcast
    const unsubscribe = subscribeToLabRealtimeEvents((event) => {
      if (event === 'smog_units_change') {
        loadData();
      }
    });

    // Periodic sync (every 8s)
    const interval = setInterval(() => {
      loadData();
    }, 8000);

    return () => {
      isMounted = false;
      unsubFirebase();
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Handlers for dynamic Serial Number textboxes (+)
  const handleAddSerialField = () => {
    setSerialNumbers(prev => [...prev, '']);
  };

  const handleRemoveSerialField = (index: number) => {
    if (serialNumbers.length <= 1) return;
    setSerialNumbers(prev => prev.filter((_, i) => i !== index));
  };

  const handleSerialChange = (index: number, value: string) => {
    setSerialNumbers(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // Open Add Leak Modal handler
  const handleOpenLeakModal = () => {
    setSmogPerson(currentUser?.name || 'Indrajit');
    setShift('A');
    setModelName('');
    setSerialNumbers(['']);
    setNotes('');
    setIsLeakModalOpen(true);
  };

  // Save Leak Unit handler
  const handleSaveLeakUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName.trim()) {
      alert('Please enter Model Name.');
      return;
    }

    const validSerials = serialNumbers.map(s => s.trim()).filter(Boolean);
    if (validSerials.length === 0) {
      alert('Please enter at least one Serial Number (Sr. No.).');
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const monthStr = dateStr.substring(0, 7);
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newRecord: LeakUnitRecord = {
      id: `leak-${Date.now().toString().slice(-5)}`,
      smogPerson: smogPerson.trim() || currentUser?.name || 'Indrajit',
      shift,
      modelName: modelName.trim() || 'SAC-1.5T-INV-3S',
      serialNumbers: validSerials,
      passedSerials: [],
      suspectCount: validSerials.length,
      actualCount: 0,
      date: dateStr,
      month: monthStr,
      time: timeStr,
      createdAt: now.toISOString(),
      notes: notes.trim() || undefined,
      location: locationName.trim() || 'General Location',
      qty: validSerials.length
    };

    const updated = [newRecord, ...leakRecords];
    setLeakRecords(updated);
    saveSmogUnits(updated);

    // Sync to Firebase & Supabase
    setSupabaseStatus('syncing');
    await syncSmogLeakUnitToFirebase(newRecord);
    await syncLeakUnitToSupabase(newRecord);
    setSupabaseStatus('connected');

    setIsLeakModalOpen(false);
  };

  const handleDeleteRecord = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this Leak Unit record?')) {
      const updated = leakRecords.filter(r => r.id !== id);
      setLeakRecords(updated);
      saveSmogUnits(updated);
      if (selectedRecordForDetails?.id === id) {
        setSelectedRecordForDetails(null);
      }
      // Delete from Firebase & Supabase
      deleteSmogLeakUnitFromFirebase(id);
      deleteLeakUnitFromSupabase(id);
    }
  };

  // Toggle Pass/Unpass for a specific Serial Number
  const handleTogglePassSerial = async (recordId: string, srNo: string) => {
    const updatedRecords = leakRecords.map(record => {
      if (record.id !== recordId) return record;

      const isAlreadyPassed = record.passedSerials.includes(srNo);
      const newPassedSerials = isAlreadyPassed
        ? record.passedSerials.filter(s => s !== srNo)
        : [...record.passedSerials, srNo];

      const updatedRecord: LeakUnitRecord = {
        ...record,
        passedSerials: newPassedSerials,
        actualCount: newPassedSerials.length,
      };

      // Sync updated record to Firebase & Supabase
      syncSmogLeakUnitToFirebase(updatedRecord);
      syncLeakUnitToSupabase(updatedRecord);

      if (selectedRecordForDetails?.id === recordId) {
        setSelectedRecordForDetails(updatedRecord);
      }

      return updatedRecord;
    });

    setLeakRecords(updatedRecords);
    saveSmogUnits(updatedRecords);
  };

  const handleCopySerial = (serials: string[], recordId: string) => {
    navigator.clipboard.writeText(serials.join(', '));
    setCopiedId(recordId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Save units scanned from SmogBarcodeScannerModal
  const handleSaveScannedUnits = async (newRecords: LeakUnitRecord[]) => {
    const updated = [...newRecords, ...leakRecords];
    setLeakRecords(updated);
    saveSmogUnits(updated);

    // Auto-align view to the newly scanned units' Date & Shift
    if (newRecords.length > 0) {
      const savedDate = newRecords[0].smogDate || newRecords[0].date;
      const savedShift = newRecords[0].shift;

      if (selectedDate && selectedDate !== savedDate) {
        setSelectedDate(savedDate);
      }
      if (shiftFilter !== 'all' && shiftFilter !== savedShift) {
        handleSelectShiftFilter(savedShift);
      }
    }

    // Sync each to Firebase & Supabase
    setSupabaseStatus('syncing');
    for (const rec of newRecords) {
      await syncSmogLeakUnitToFirebase(rec);
      await syncLeakUnitToSupabase(rec);
    }
    setSupabaseStatus('connected');

    const first = newRecords[0];
    setToastNotification(`✓ Added ${newRecords.length} Leak Unit(s) to Shift ${first?.shift || ''} [Date: ${first?.smogDate || ''}]`);
    setTimeout(() => setToastNotification(null), 3500);
  };

  // Filtered Records (includes Search, Shift, and Calendar Date)
  const filteredRecords = leakRecords.filter(record => {
    const matchSearch = searchQuery === '' ||
      record.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.smogPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.serialNumbers.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchShift = shiftFilter === 'all' || record.shift === shiftFilter;

    const matchDate = !selectedDate || 
      record.date === selectedDate || 
      record.smogDate === selectedDate || 
      record.productionDate === selectedDate;

    return matchSearch && matchShift && matchDate;
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = leakRecords.filter(r => r.date === todayStr || r.smogDate === todayStr).length;

  // Date-wise active records for Dashboard calculations
  const activeRecordsForMetrics = selectedDate
    ? leakRecords.filter(r => r.date === selectedDate || r.smogDate === selectedDate || r.productionDate === selectedDate)
    : leakRecords;

  const displayLeakCount = activeRecordsForMetrics.length;
  const displaySuspects = activeRecordsForMetrics.reduce((sum, r) => sum + r.suspectCount, 0);
  const displayActuals = activeRecordsForMetrics.reduce((sum, r) => sum + r.actualCount, 0);

  // Model Qty: Total distinct models scanned in current active records (Scanner data)
  // "total Model ka data Scanner se pata chalega agar 2 alag alag Model Scanner hua hai to 2 Model Qty me add hoga."
  const uniqueModelsList = Array.from(
    new Set(
      activeRecordsForMetrics
        .map(r => r.modelName?.trim())
        .filter((m): m is string => Boolean(m && m.length > 0 && m !== 'SAC-1.5T-INV-3S' && m !== 'H-SMOG-900 PRO'))
    )
  );
  const modelQty = uniqueModelsList.length;

  // Smog Qty: Aggregated from Form uploads for current selected Date & Shift
  // "aur Jisme Us Date ka Smog Qty add hoga."
  const currentSmogQty = smogQtyRecords
    .filter(r => {
      if (selectedDate && r.date !== selectedDate) return false;
      if (shiftFilter !== 'all' && r.shift !== shiftFilter) return false;
      return true;
    })
    .reduce((sum, r) => sum + (Number(r.smogQty) || 0), 0);

  // Shift-wise counts for current active records (Date-filtered)
  const countShiftA = activeRecordsForMetrics.filter(r => r.shift === 'A').length;
  const countShiftB = activeRecordsForMetrics.filter(r => r.shift === 'B').length;
  const countShiftC = activeRecordsForMetrics.filter(r => r.shift === 'C').length;

  const suspectsShiftA = activeRecordsForMetrics.filter(r => r.shift === 'A').reduce((sum, r) => sum + r.suspectCount, 0);
  const suspectsShiftB = activeRecordsForMetrics.filter(r => r.shift === 'B').reduce((sum, r) => sum + r.suspectCount, 0);
  const suspectsShiftC = activeRecordsForMetrics.filter(r => r.shift === 'C').reduce((sum, r) => sum + r.suspectCount, 0);

  const actualsShiftA = activeRecordsForMetrics.filter(r => r.shift === 'A').reduce((sum, r) => sum + r.actualCount, 0);
  const actualsShiftB = activeRecordsForMetrics.filter(r => r.shift === 'B').reduce((sum, r) => sum + r.actualCount, 0);
  const actualsShiftC = activeRecordsForMetrics.filter(r => r.shift === 'C').reduce((sum, r) => sum + r.actualCount, 0);

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      
      {/* TOAST NOTIFICATION */}
      {toastNotification && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-2xl bg-emerald-950 border border-emerald-500 text-emerald-300 text-xs font-mono font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastNotification}</span>
        </div>
      )}

      {/* COMPACT CARDVIEW (50% Height Down) */}
      {/* Left: Calendar (Date-wise Dashboard Data) | Center: Title | Right: Form & Scanner */}
      <div className="py-2.5 px-3.5 sm:px-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl relative flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* LEFT: Unique Calendar Date Picker for Date-wise Dashboard Data */}
        <div className="flex items-center gap-2 z-10">
          <SmogUniqueCalendar
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d)}
            records={leakRecords}
          />
        </div>

        {/* CENTER: Title & Live Sync Badge */}
        <div className="flex items-center gap-2.5 z-10">
          <span className="p-1.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400 shrink-0">
            <Cloud className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-sm sm:text-base font-black text-white tracking-tight flex items-center gap-2">
              <span>Smog - Leak Unit Management</span>
              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                <Database className="w-2.5 h-2.5 text-emerald-400" />
                <span>Live Sync</span>
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Log & track leak units with Suspect verification.
            </p>
          </div>
        </div>

        {/* RIGHT: Scanner & Form Buttons */}
        <div className="flex items-center gap-2 justify-end z-10 flex-wrap">
          {/* Form Button (Opens Smog Qty Entry PopUp) */}
          <button
            type="button"
            onClick={() => setIsSmogQtyModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs text-purple-200 bg-purple-950/80 border border-purple-700/70 hover:bg-purple-900/90 hover:text-white shadow-md shadow-purple-950/50 transform active:scale-95 transition-all cursor-pointer"
            title="Open Form to Upload Smog Qty"
          >
            <FileText className="w-4 h-4 text-purple-400 stroke-[2.5]" />
            <span className="tracking-wide">Form</span>
          </button>

          {/* Scanner Button */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 shadow-md shadow-cyan-950/60 transform active:scale-95 transition-all cursor-pointer"
            title="Open ELT-style Barcode Scanner for Leak Units"
          >
            <ScanBarcode className="w-4 h-4 stroke-[2.5]" />
            <span className="tracking-wide">Scanner</span>
          </button>
        </div>
      </div>

      {/* KPI STATS CARDS */}
      <div className="space-y-3">
        {/* ROW 1: Date-Wise Suspect & Actual Verification */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/90">
            <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block font-bold">
              Total Suspect
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-amber-400 font-mono">{displaySuspects}</span>
              <span className="text-[10px] text-slate-400 font-mono">Sr. No.</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/90">
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">
              Total Leak
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-400 font-mono">{displayActuals}</span>
              <span className="text-[10px] text-emerald-300/80 font-mono">Verified</span>
            </div>
          </div>
        </div>

        {/* ROW 2: Model Qty & Smog Qty (Directly below Total Suspect) */}
        <div className="grid grid-cols-2 gap-3">
          {/* Model Qty Card */}
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/90 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-bold">
                Model Qty
              </span>
              <Layers className="w-3.5 h-3.5 text-cyan-400/80" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-cyan-300 font-mono">{modelQty}</span>
              <span className="text-[10px] text-slate-400 font-mono">
                {modelQty === 1 ? 'Model' : 'Models'} Scanned
              </span>
            </div>
            <div className="mt-1.5 text-[9px] text-slate-400 font-mono flex items-center justify-between">
              <span>Scanner Data</span>
              <span className="text-cyan-400 font-semibold">{modelQty} Unique</span>
            </div>
          </div>

          {/* Smog Qty Card */}
          <div 
            onClick={() => setIsSmogQtyModalOpen(true)}
            className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/90 shadow-sm hover:border-purple-500/50 transition-all cursor-pointer group"
            title="Click to open Form and upload Smog Qty for this date"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block font-bold">
                Smog Qty
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-purple-400/90 font-mono group-hover:underline">Upload +</span>
                <Cloud className="w-3.5 h-3.5 text-purple-400/80" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-purple-300 font-mono">{currentSmogQty}</span>
              <span className="text-[10px] text-slate-400 font-mono">
                {selectedDate ? selectedDate : 'Total'}
              </span>
            </div>
            <div className="mt-1.5 text-[9px] text-slate-500 font-mono flex items-center justify-between">
              <span>Shift: {shiftFilter === 'all' ? 'All' : shiftFilter}</span>
              <span className="text-purple-400 font-bold group-hover:underline">Open Form →</span>
            </div>
          </div>
        </div>
      </div>

      {/* SHIFT SELECTOR & SEARCH BAR */}
      <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <label className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider shrink-0">Shift:</label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleSelectShiftFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                shiftFilter === 'all'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50 font-black'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>All Shifts</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                shiftFilter === 'all' ? 'bg-slate-950/40 text-slate-950' : 'bg-slate-900 text-slate-300'
              }`}>
                {activeRecordsForMetrics.length}
              </span>
            </button>

            <button
              onClick={() => handleSelectShiftFilter('A')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                shiftFilter === 'A'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50 font-black'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Shift A</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                shiftFilter === 'A' ? 'bg-slate-950/40 text-slate-950' : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
              }`}>
                {countShiftA}
              </span>
            </button>

            <button
              onClick={() => handleSelectShiftFilter('B')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                shiftFilter === 'B'
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-950/50 font-black'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Shift B</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                shiftFilter === 'B' ? 'bg-slate-950/40 text-slate-950' : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {countShiftB}
              </span>
            </button>

            <button
              onClick={() => handleSelectShiftFilter('C')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                shiftFilter === 'C'
                  ? 'bg-indigo-400 text-slate-950 shadow-md shadow-indigo-950/50 font-black'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span>Shift C</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                shiftFilter === 'C' ? 'bg-slate-950/40 text-slate-950' : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
              }`}>
                {countShiftC}
              </span>
            </button>
          </div>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Model, Sr. No., Person..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      {/* ACTIVE SHIFT FILTER TAG (Cards from photo removed as requested) */}
      {shiftFilter !== 'all' && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/70 border border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-300">
            <span>Filtered to:</span>
            <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
              shiftFilter === 'A' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
              shiftFilter === 'B' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
              'bg-indigo-950 text-indigo-300 border border-indigo-800'
            }`}>
              Shift {shiftFilter}
            </span>
            <span className="text-slate-400">
              {selectedDate ? `(${selectedDate})` : '(All Dates)'}
            </span>
          </div>
          <button
            onClick={() => handleSelectShiftFilter('all')}
            className="text-[11px] text-cyan-400 hover:underline cursor-pointer font-bold"
          >
            Show All Shifts ↩
          </button>
        </div>
      )}

      {/* SAVED LEAK UNITS LIST / CARDS VIEW */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Leak Unit Cards ({filteredRecords.length})
          </h3>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/60 rounded-3xl border border-slate-800/80 space-y-3">
            <Cloud className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-400">No Leak Unit records found.</p>
            <button
              onClick={handleOpenLeakModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Leak Unit</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecords.map((record) => (
              <div 
                key={record.id}
                className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-4 shadow-xl relative group"
              >
                {/* Card Header: Shift Badge & Date / Time */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono border ${
                      record.shift === 'A'
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                        : record.shift === 'B'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : 'bg-indigo-950 text-indigo-300 border-indigo-800'
                    }`}>
                      Shift {record.shift}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {record.date} ({record.time})
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteRecord(record.id)}
                    className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* 3-Column Table: Header (Model Name | Location | Leak Qty) & Data Row (Model | Location Name | Leak Qty) */}
                <div className="space-y-1">
                  {(() => {
                    const resolvedModel = (() => {
                      if (record.serialNumbers && record.serialNumbers.length > 0) {
                        for (const sn of record.serialNumbers) {
                          if (sn) {
                            const found = findModelByPrefix(sn);
                            if (found?.modelName) return found.modelName;
                          }
                        }
                      }
                      if (record.modelName && 
                          record.modelName.trim() && 
                          record.modelName !== 'General Location' && 
                          record.modelName !== 'General Smog Unit' &&
                          record.modelName !== record.location) {
                        return record.modelName;
                      }
                      return 'SAC-1.5T-INV-3S';
                    })();

                    const resolvedLocation = (() => {
                      if (record.location && record.location.trim()) {
                        return record.location.trim();
                      }
                      if (record.modelName && (
                        record.modelName.toLowerCase().includes('line') ||
                        record.modelName.toLowerCase().includes('bed') ||
                        record.modelName.toLowerCase().includes('station') ||
                        record.modelName === 'General Location'
                      )) {
                        return record.modelName;
                      }
                      return 'General Location';
                    })();

                    const resolvedLeakQty = record.qty ?? record.suspectCount ?? (record.serialNumbers?.length || 1);

                    return (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden shadow-inner">
                        {/* Header Row: Model Name | Location | Leak Qty */}
                        <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[10px] sm:text-[11px] font-mono font-bold text-slate-400">
                          <div className="col-span-5 text-left truncate">Model Name</div>
                          <div className="col-span-4 text-center truncate">Location</div>
                          <div className="col-span-3 text-right truncate">Leak Qty</div>
                        </div>

                        {/* Data Row: Model Value | Location Value | Leak Qty Value */}
                        <div className="grid grid-cols-12 gap-1 px-3 py-2 items-center bg-slate-950/60">
                          <div 
                            className="col-span-5 text-left text-xs font-black text-white tracking-tight truncate" 
                            title={resolvedModel}
                          >
                            {resolvedModel}
                          </div>
                          <div 
                            className="col-span-4 text-center text-xs font-bold text-slate-200 tracking-tight truncate" 
                            title={resolvedLocation}
                          >
                            {resolvedLocation}
                          </div>
                          <div className="col-span-3 text-right text-xs font-mono font-black text-cyan-400">
                            {resolvedLeakQty}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {record.smogPerson && 
                   !record.smogPerson.includes('Lab Administrator') && 
                   !record.smogPerson.includes('ADMIN01') && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 pt-0.5">
                      <User className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-semibold">{record.smogPerson}</span>
                    </div>
                  )}

                  {/* Production Date & Smog Date Badges */}
                  {(record.productionDate || record.smogDate) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-mono">
                      {record.productionDate && (
                        <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400">
                          Prod: <strong className="text-slate-200">{record.productionDate}</strong>
                        </span>
                      )}
                      {record.smogDate && (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-400">
                          Smog: <strong className="text-emerald-300">{record.smogDate}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* SUSPECT & ACTUAL METRICS DISPLAY */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                  <div className="text-center border-r border-slate-800">
                    <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block font-bold">
                      Suspect
                    </span>
                    <span className="text-xl font-black font-mono text-amber-300 mt-0.5 block">
                      {record.suspectCount}
                    </span>
                    <span className="text-[9px] text-slate-500 block font-mono">Sr. No. in Form</span>
                  </div>

                  <div className="text-center">
                    <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">
                      Actual
                    </span>
                    <span className="text-xl font-black font-mono text-emerald-400 mt-0.5 block">
                      {record.actualCount}
                    </span>
                    <span className="text-[9px] text-slate-500 block font-mono">Passed Sr. No.</span>
                  </div>
                </div>

                {/* View Details Button */}
                <button
                  onClick={() => setSelectedRecordForDetails(record)}
                  className="w-full py-2.5 px-4 rounded-xl font-extrabold text-xs text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                >
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span>View Details</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* LEAK UNIT MODAL FORM (TRIGGERED BY "LEAK UNIT" BUTTON) */}
      {/* ========================================================================= */}
      {isLeakModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Title Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-950 border border-cyan-800 text-cyan-400">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Add Leak Unit Entry</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Log new smog inspection record with shift and serial numbers.</p>
                </div>
              </div>
              <button
                onClick={() => setIsLeakModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeakUnit} className="space-y-4 text-xs">
              {/* 1. SMOG PERSON (PROFILE AUTO-FILLED) */}
              <div>
                <label className="block text-slate-300 font-bold mb-1 flex items-center justify-between">
                  <span>1. Smog Person *</span>
                  <span className="text-[10px] text-cyan-400 font-mono font-normal">Auto-filled from Profile</span>
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 absolute left-3 top-3 text-cyan-400" />
                  <input
                    type="text"
                    required
                    value={smogPerson}
                    onChange={(e) => setSmogPerson(e.target.value)}
                    placeholder="e.g. Indrajit"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* 2. SHIFT SELECTION (A, B, C) */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  2. Shift (A, B, C) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['A', 'B', 'C'] as const).map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setShift(s)}
                      className={`py-2.5 px-3 rounded-xl font-mono font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                        shift === s
                          ? s === 'A'
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-500 shadow-md shadow-cyan-950/50'
                            : s === 'B'
                            ? 'bg-amber-950 text-amber-300 border-amber-500 shadow-md shadow-amber-950/50'
                            : 'bg-indigo-950 text-indigo-300 border-indigo-500 shadow-md shadow-indigo-950/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <span>Shift {s}</span>
                      {shift === s && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. MODEL NAME & LOCATION NAME (2-Column Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    3. Model Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g. SAC-1.5T-INV-3S"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    4. Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="e.g. Line 1, Test Bed 3"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* 5. DYNAMIC SERIAL NUMBER (SR. NO.) LIST WITH (+) BUTTON */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-bold">
                    5. Serial Numbers (Sr. No.) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSerialField}
                    className="flex items-center gap-1 text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Sr. No.</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {serialNumbers.map((sr, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 w-5">#{index + 1}</span>
                      <input
                        type="text"
                        required
                        value={sr}
                        onChange={(e) => handleSerialChange(index, e.target.value)}
                        placeholder={`e.g. A-2026-00${index + 1}`}
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-400"
                      />
                      {serialNumbers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSerialField(index)}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg cursor-pointer"
                          title="Remove this Serial Number"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Remarks / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional inspection details..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Form Actions: Save Button */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsLeakModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-black text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 shadow-md shadow-cyan-950/60 cursor-pointer"
                >
                  Save Leak Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW DETAILS MODAL */}
      {/* ========================================================================= */}
      {selectedRecordForDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Title */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-950 border border-cyan-800 text-cyan-400">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">
                      {selectedRecordForDetails.modelName && 
                       selectedRecordForDetails.modelName !== 'General Location' && 
                       selectedRecordForDetails.modelName !== 'General Smog Unit'
                        ? selectedRecordForDetails.modelName
                        : 'SAC-1.5T-INV-3S'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-800 text-[10px] font-mono font-bold text-cyan-300">
                      Leak Qty: {selectedRecordForDetails.qty ?? selectedRecordForDetails.suspectCount ?? (selectedRecordForDetails.serialNumbers?.length || 1)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-mono mt-0.5 flex items-center gap-2">
                    <span>Loc: <strong className="text-white">{selectedRecordForDetails.location || 'General Location'}</strong></span>
                    <span className="text-slate-500">•</span>
                    <span>Shift {selectedRecordForDetails.shift}</span>
                  </p>
                  {(selectedRecordForDetails.productionDate || selectedRecordForDetails.smogDate) && (
                    <div className="flex items-center gap-2 pt-1 text-[10px] font-mono text-slate-400">
                      {selectedRecordForDetails.productionDate && (
                        <span>Prod: <strong className="text-white">{selectedRecordForDetails.productionDate}</strong></span>
                      )}
                      {selectedRecordForDetails.smogDate && (
                        <span className="text-emerald-400">Smog: <strong className="text-emerald-300">{selectedRecordForDetails.smogDate}</strong></span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedRecordForDetails(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Suspect vs Actual Summary Box */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-amber-400 uppercase font-bold block">Suspect Count</span>
                  <span className="text-2xl font-black font-mono text-amber-300 mt-0.5 block">
                    {selectedRecordForDetails.suspectCount}
                  </span>
                </div>
                <AlertCircle className="w-6 h-6 text-amber-400 opacity-80" />
              </div>

              <div className="flex items-center justify-between pl-3 border-l border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold block">Actual (Passed)</span>
                  <span className="text-2xl font-black font-mono text-emerald-400 mt-0.5 block">
                    {selectedRecordForDetails.actualCount}
                  </span>
                </div>
                <CheckCircle className="w-6 h-6 text-emerald-400 opacity-80" />
              </div>
            </div>

            {/* All Model Sr. No. List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                  Serial Numbers (Sr. No.) Pass Verification
                </label>
                <button
                  onClick={() => handleCopySerial(selectedRecordForDetails.serialNumbers, selectedRecordForDetails.id)}
                  className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === selectedRecordForDetails.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">Copied All!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Serials</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {selectedRecordForDetails.serialNumbers.map((srNo, idx) => {
                  const isPassed = selectedRecordForDetails.passedSerials?.includes(srNo);
                  const matchedModel = findModelByPrefix(srNo)?.modelName || 
                    (selectedRecordForDetails.modelName && 
                     selectedRecordForDetails.modelName !== 'General Location' && 
                     selectedRecordForDetails.modelName !== 'General Smog Unit'
                      ? selectedRecordForDetails.modelName
                      : 'SAC-1.5T-INV-3S');

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isPassed
                          ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-xs font-mono font-bold text-slate-500 mt-0.5">#{idx + 1}</span>
                        <div className="min-w-0">
                          {/* Model Name (Above Sr. No. as requested) */}
                          <div className="text-[11px] font-mono font-extrabold text-cyan-400 truncate flex items-center gap-1">
                            <Layers className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span>{matchedModel}</span>
                          </div>
                          {/* Sr. No. (Where the orange line was drawn in photo) */}
                          <div className="text-sm font-mono font-extrabold text-white flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                              Sr. No:
                            </span>
                            <span className="text-slate-100">{srNo}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleTogglePassSerial(selectedRecordForDetails.id, srNo)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all shrink-0 ${
                          isPassed
                            ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-md shadow-emerald-950/60'
                            : 'bg-slate-800 text-slate-300 hover:bg-emerald-900 hover:text-emerald-300 border border-slate-700'
                        }`}
                      >
                        {isPassed ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-slate-950" />
                            <span>Passed</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4 text-slate-400" />
                            <span>Mark Pass</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedRecordForDetails.notes && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Remarks / Notes</span>
                <p className="text-slate-300 italic">{selectedRecordForDetails.notes}</p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end border-t border-slate-800">
              <button
                onClick={() => setSelectedRecordForDetails(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-slate-800 hover:bg-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMOG BARCODE SCANNER MODAL */}
      <SmogBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSaveLeakUnits={handleSaveScannedUnits}
      />

      {/* SMOG QTY ENTRY POPUP MODAL */}
      <SmogQtyFormModal
        isOpen={isSmogQtyModalOpen}
        onClose={() => setIsSmogQtyModalOpen(false)}
        defaultDate={selectedDate || new Date().toISOString().split('T')[0]}
        defaultShift={shiftFilter !== 'all' ? shiftFilter : 'A'}
        onSaved={(saved) => {
          setToastNotification(`Smog Qty (${saved.smogQty}) successfully uploaded for ${saved.date} (Shift ${saved.shift})`);
          setTimeout(() => setToastNotification(null), 4000);
        }}
        onOpenWhatsAppShare={(data) => {
          setWhatsAppReportParams({
            date: data.date,
            shift: data.shift,
            smogQty: data.smogQty
          });
          setIsWhatsAppReportOpen(true);
        }}
      />

      {/* SMOG WHATSAPP REPORT MODAL */}
      {isWhatsAppReportOpen && (
        <SmogWhatsAppReportModal
          isOpen={isWhatsAppReportOpen}
          onClose={() => setIsWhatsAppReportOpen(false)}
          productionDate={(() => {
            try {
              return localStorage.getItem('smog_scanner_production_date') || (whatsAppReportParams?.date || selectedDate || new Date().toISOString().split('T')[0]);
            } catch {
              return whatsAppReportParams?.date || selectedDate || new Date().toISOString().split('T')[0];
            }
          })()}
          smogDate={whatsAppReportParams?.date || selectedDate || new Date().toISOString().split('T')[0]}
          shift={whatsAppReportParams?.shift || (shiftFilter === 'all' ? 'A' : shiftFilter)}
          smogQty={whatsAppReportParams?.smogQty ?? (currentSmogQty || 0)}
          records={leakRecords}
        />
      )}
    </div>
  );
};
