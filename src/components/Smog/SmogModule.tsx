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
  AlertCircle
} from 'lucide-react';
import { UserProfile } from '../../types';
import { 
  syncLeakUnitToSupabase, 
  deleteLeakUnitFromSupabase, 
  fetchLeakUnitsFromSupabase,
  broadcastLabRealtimeEvent,
  subscribeToLabRealtimeEvents 
} from '../../lib/supabase';

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
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = today.substring(0, 7);
      
      const initial: LeakUnitRecord[] = [
        {
          id: 'leak-101',
          smogPerson: 'Indrajit',
          shift: 'A',
          modelName: 'SAC-1.5T-INV-3S',
          serialNumbers: ['A-2026-901', 'A-2026-902', 'A-2026-903'],
          passedSerials: ['A-2026-901', 'A-2026-902'],
          suspectCount: 3,
          actualCount: 2,
          date: today,
          month: currentMonth,
          time: '09:30 AM',
          createdAt: new Date().toISOString(),
          notes: 'Evaporator coil micro-leak detected during test.'
        },
        {
          id: 'leak-102',
          smogPerson: 'Raju (ELT)',
          shift: 'B',
          modelName: 'H-SMOG-900 PRO',
          serialNumbers: ['A889021-SMG', 'A889022-SMG'],
          passedSerials: ['A889021-SMG'],
          suspectCount: 2,
          actualCount: 1,
          date: today,
          month: currentMonth,
          time: '02:15 PM',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          notes: 'Joint brazing pressure test.'
        },
        {
          id: 'leak-103',
          smogPerson: 'Marcus Thorne',
          shift: 'C',
          modelName: 'ECO-SMOG 200',
          serialNumbers: ['A-SMG-771'],
          passedSerials: [],
          suspectCount: 1,
          actualCount: 0,
          date: '2026-07-30',
          month: '2026-07',
          time: '11:45 PM',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          notes: 'Compressor discharge pipe leakage.'
        }
      ];
      localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return parsed.map((item: any) => ({
      ...item,
      passedSerials: item.passedSerials || [],
      suspectCount: item.suspectCount || (item.serialNumbers ? item.serialNumbers.length : 0),
      actualCount: item.actualCount || (item.passedSerials ? item.passedSerials.length : 0)
    }));
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
  if (localSmogBus) {
    try { localSmogBus.postMessage({ timestamp: Date.now() }); } catch {}
  }
  broadcastLabRealtimeEvent('smog_units_change', { timestamp: Date.now() });
}

interface SmogModuleProps {
  currentUser?: UserProfile;
  onNavigateToDashboard?: () => void;
}

export const SmogModule: React.FC<SmogModuleProps> = ({ 
  currentUser,
}) => {
  const [leakRecords, setLeakRecords] = useState<LeakUnitRecord[]>(getSmogUnits());
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'syncing' | 'idle'>('idle');

  // Add Leak Modal State
  const [isLeakModalOpen, setIsLeakModalOpen] = useState(false);
  
  // View Details Modal State
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<LeakUnitRecord | null>(null);

  // Form State
  const [smogPerson, setSmogPerson] = useState(currentUser?.name || 'Indrajit');
  const [shift, setShift] = useState<'A' | 'B' | 'C'>('A');
  const [modelName, setModelName] = useState('');
  const [serialNumbers, setSerialNumbers] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync profile name when currentUser changes
  useEffect(() => {
    if (currentUser?.name) {
      setSmogPerson(currentUser.name);
    }
  }, [currentUser]);

  // Initial load, Supabase sync, and Real-time listener
  useEffect(() => {
    const loadFromSupabase = async () => {
      setSupabaseStatus('syncing');
      const remoteData = await fetchLeakUnitsFromSupabase();
      if (remoteData && remoteData.length > 0) {
        setLeakRecords(remoteData);
        try { localStorage.setItem(STORAGE_KEY_SMOG_UNITS, JSON.stringify(remoteData)); } catch {}
        setSupabaseStatus('connected');
      } else {
        // Sync local records to Supabase
        const local = getSmogUnits();
        setLeakRecords(local);
        for (const record of local) {
          await syncLeakUnitToSupabase(record);
        }
        setSupabaseStatus('connected');
      }
    };

    loadFromSupabase();

    // Listen to inter-tab changes
    if (localSmogBus) {
      localSmogBus.onmessage = () => {
        setLeakRecords(getSmogUnits());
      };
    }

    // Subscribe to cross-device realtime broadcast
    const unsubscribe = subscribeToLabRealtimeEvents((event) => {
      if (event === 'smog_units_change') {
        loadFromSupabase();
      }
    });

    // Periodic sync (every 8s)
    const interval = setInterval(() => {
      loadFromSupabase();
    }, 8000);

    return () => {
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
      modelName: modelName.trim(),
      serialNumbers: validSerials,
      passedSerials: [],
      suspectCount: validSerials.length,
      actualCount: 0,
      date: dateStr,
      month: monthStr,
      time: timeStr,
      createdAt: now.toISOString(),
      notes: notes.trim() || undefined
    };

    const updated = [newRecord, ...leakRecords];
    setLeakRecords(updated);
    saveSmogUnits(updated);

    // Sync to Supabase
    setSupabaseStatus('syncing');
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
      // Delete from Supabase
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

      // Sync updated record to Supabase
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

  // Filtered Records
  const filteredRecords = leakRecords.filter(record => {
    const matchSearch = searchQuery === '' ||
      record.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.smogPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.serialNumbers.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchShift = shiftFilter === 'all' || record.shift === shiftFilter;

    return matchSearch && matchShift;
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = leakRecords.filter(r => r.date === todayStr).length;
  const totalSuspects = leakRecords.reduce((sum, r) => sum + r.suspectCount, 0);
  const totalActuals = leakRecords.reduce((sum, r) => sum + r.actualCount, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Main Action Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Cloud className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Smog - Leak Unit Management
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400">
                  Log & track leak units with Suspect & Actual passed verification.
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                  <Database className="w-3 h-3 text-emerald-400" />
                  <span>Supabase Live Sync</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* TOP ACTION BAR: Leak Unit Button */}
        <div className="flex items-center gap-3 z-10">
          <button
            onClick={handleOpenLeakModal}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 shadow-xl shadow-cyan-950/70 transform active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Leak Unit</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Total Leak Units</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-white font-mono">{leakRecords.length}</span>
            <span className="text-[10px] text-cyan-400 font-bold">Records</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Today's Units</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-400 font-mono">{todayCount}</span>
            <span className="text-[10px] text-slate-400 font-mono">Logged</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
          <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block">Total Suspect</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-400 font-mono">{totalSuspects}</span>
            <span className="text-[10px] text-slate-400 font-mono">Sr. No.</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">Total Actual (Passed)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-400 font-mono">{totalActuals}</span>
            <span className="text-[10px] text-emerald-300/80 font-mono">Verified</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Shift:</label>
          <div className="flex items-center gap-1.5">
            {(['all', 'A', 'B', 'C'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setShiftFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  shiftFilter === s
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'All Shifts' : `Shift ${s}`}
              </button>
            ))}
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

                {/* Model Name & Smog Person */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Model Name</span>
                  <h4 className="text-base font-extrabold text-white tracking-tight">
                    {record.modelName}
                  </h4>
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 pt-1">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-semibold">{record.smogPerson}</span>
                  </div>
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

              {/* 3. MODEL NAME */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  3. Model Name *
                </label>
                <input
                  type="text"
                  required
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. SAC-1.5T-INVERTER"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* 4. DYNAMIC SERIAL NUMBER (SR. NO.) LIST WITH (+) BUTTON */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-bold">
                    4. Serial Numbers (Sr. No.) *
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
                  <h3 className="text-base font-extrabold text-white">
                    {selectedRecordForDetails.modelName}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Smog Person: <strong className="text-cyan-300">{selectedRecordForDetails.smogPerson}</strong> • Shift {selectedRecordForDetails.shift}
                  </p>
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
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between ${
                        isPassed
                          ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-slate-500">#{idx + 1}</span>
                        <span className="text-sm font-mono font-extrabold text-white">{srNo}</span>
                      </div>

                      <button
                        onClick={() => handleTogglePassSerial(selectedRecordForDetails.id, srNo)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
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
    </div>
  );
};
