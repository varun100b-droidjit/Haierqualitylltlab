import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  User, 
  Eye, 
  Trash2, 
  PauseCircle,
  Play,
  Check,
  FileText
} from 'lucide-react';
import { ProtoUnit } from '../../types';
import { formatShortDateTime } from '../../utils/dateFormatter';
import { exportUnitToPDF } from '../../utils/pdfExport';
import { 
  getProtoUnits, 
  subscribeProtoUnitStore, 
  updateProtoUnitStatus, 
  deleteProtoUnit 
} from '../../services/protoUnitStore';
import { findSavedReportForUnit } from '../../services/reportRoomStore';
import { AddProtoUnitDialog } from './AddProtoUnitDialog';
import { ProtoUnitDetailsDialog } from './ProtoUnitDetailsDialog';
import { 
  calculateShiftElapsedExactHours, 
  formatHoursToHHMM, 
  useActiveLabShift, 
  useIsShiftActiveNow 
} from '../../services/shiftStore';


interface ProtoUnitsModuleProps {
  onOpenAddModal?: () => void;
  defaultSection?: 'live' | 'stopped' | 'finished';
  onNavigateToGenerateReport?: (serialNo: string) => void;
}

export const ProtoUnitsModule: React.FC<ProtoUnitsModuleProps> = ({
  onOpenAddModal,
  defaultSection = 'live',
  onNavigateToGenerateReport,
}) => {
  const [activeSection, setActiveSection] = useState<'live' | 'stopped' | 'finished'>(defaultSection);
  const [protoUnits, setProtoUnits] = useState<ProtoUnit[]>(getProtoUnits());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Sync activeSection if defaultSection prop changes
  useEffect(() => {
    if (defaultSection) {
      setActiveSection(defaultSection);
    }
  }, [defaultSection]);

  // Dialog States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<ProtoUnit | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Live timer tick every 1 sec for running mode actual live time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeProtoUnitStore(() => {
      setProtoUnits(getProtoUnits());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleOpenAdd = () => {
    if (onOpenAddModal) {
      onOpenAddModal();
    } else {
      setIsAddDialogOpen(true);
    }
  };

  const handleAddSuccess = (status?: 'live' | 'stopped' | 'finished') => {
    setActiveSection(status || 'live');
  };

  const handleStopUnit = (id: string, currentElapsedHours?: number) => {
    updateProtoUnitStatus(id, 'stopped', currentElapsedHours);
  };

  const handlePassUnit = (id: string, currentElapsedHours?: number) => {
    updateProtoUnitStatus(id, 'finished', currentElapsedHours);
  };

  const handleResumeUnit = (id: string) => {
    updateProtoUnitStatus(id, 'live');
  };

  const handleDelete = (id: string, modelName: string) => {
    if (window.confirm(`Are you sure you want to delete Proto Unit record for "${modelName}"?`)) {
      deleteProtoUnit(id);
    }
  };

  // Filter units based on section and search term
  const sectionUnits = protoUnits.filter(u => u.status === activeSection);
  const filteredUnits = sectionUnits.filter(u => {
    const q = searchTerm.toLowerCase();
    return (
      u.modelName.toLowerCase().includes(q) ||
      (u.station && u.station.toLowerCase().includes(q)) ||
      (u.iduSerialNumber && u.iduSerialNumber.toLowerCase().includes(q)) ||
      (u.oduSerialNumber && u.oduSerialNumber.toLowerCase().includes(q)) ||
      (u.requestBy && u.requestBy.toLowerCase().includes(q)) ||
      (u.testPurpose && u.testPurpose.toLowerCase().includes(q))
    );
  });

  const liveCount = protoUnits.filter(u => u.status === 'live').length;
  const [activeShift] = useActiveLabShift();
  const isShiftActive = useIsShiftActiveNow();
  const stoppedCount = protoUnits.filter(u => u.status === 'stopped').length;
  const finishedCount = protoUnits.filter(u => u.status === 'finished').length;

  return (
    <div className="space-y-6">

      {/* Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800">
        
        {/* Section Tabs (Live, Stop, Finished) */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800/80 w-full sm:w-auto">
          <button
            onClick={() => setActiveSection('live')}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSection === 'live'
                ? 'bg-gradient-to-r from-cyan-950 to-slate-900 text-cyan-300 border border-cyan-800 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              isShiftActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`} />
            <span>Live {isShiftActive ? '' : '(Paused)'}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeSection === 'live' ? 'bg-cyan-900/80 text-cyan-200' : 'bg-slate-800 text-slate-400'
            }`}>
              {liveCount}
            </span>
          </button>


          <button
            onClick={() => setActiveSection('stopped')}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSection === 'stopped'
                ? 'bg-gradient-to-r from-amber-950 to-slate-900 text-amber-300 border border-amber-800 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Stop</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeSection === 'stopped' ? 'bg-amber-900/80 text-amber-200' : 'bg-slate-800 text-slate-400'
            }`}>
              {stoppedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('finished')}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSection === 'finished'
                ? 'bg-gradient-to-r from-cyan-950 to-slate-900 text-cyan-300 border border-cyan-800 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Finished</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeSection === 'finished' ? 'bg-cyan-900/80 text-cyan-200' : 'bg-slate-800 text-slate-400'
            }`}>
              {finishedCount}
            </span>
          </button>
        </div>

        {/* Search Bar & Add Button */}
        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search Model, Requester..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-extrabold text-xs text-slate-900 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 shadow-md shadow-cyan-950/50 hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Proto Unit</span>
          </button>
        </div>

      </div>

      {/* Proto Unit Cards List Grid */}
      {filteredUnits.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredUnits.map((unit) => {
            const reqHours = typeof unit.requiredHour === 'number' ? unit.requiredHour : parseFloat(unit.requiredHour) || 0;
            const initialDone = typeof unit.doneHour === 'number' ? unit.doneHour : parseFloat((unit as any).doneHour) || 0;
            
            let createdMs = NaN;
            if (unit.createdAt) {
              createdMs = new Date(unit.createdAt.replace(' ', 'T')).getTime();
              if (isNaN(createdMs)) {
                createdMs = new Date(unit.createdAt).getTime();
              }
            }
            const nowMs = currentTime;

            let elapsedHours = initialDone;
            if (unit.status === 'finished') {
              if (typeof unit.doneHour === 'number' && unit.doneHour >= 0) {
                elapsedHours = Math.min(reqHours, unit.doneHour);
              } else if (!isNaN(createdMs)) {
                let finishedMs = nowMs;
                if (unit.updatedAt) {
                  const upMs = new Date(unit.updatedAt.replace(' ', 'T')).getTime();
                  if (!isNaN(upMs) && upMs >= createdMs) {
                    finishedMs = upMs;
                  }
                }
                const shiftCalculatedHours = calculateShiftElapsedExactHours(createdMs, finishedMs, activeShift);
                elapsedHours = Math.min(reqHours, initialDone + shiftCalculatedHours);
              } else {
                elapsedHours = Math.min(reqHours, initialDone);
              }
            } else if (unit.status === 'stopped') {
              if (typeof unit.doneHour === 'number' && unit.doneHour >= 0) {
                elapsedHours = Math.min(reqHours, unit.doneHour);
              } else if (!isNaN(createdMs) && createdMs <= nowMs) {
                let endCalculatedMs = nowMs;
                if (unit.updatedAt) {
                  const upMs = new Date(unit.updatedAt.replace(' ', 'T')).getTime();
                  if (!isNaN(upMs) && upMs >= createdMs) {
                    endCalculatedMs = upMs;
                  }
                }
                const shiftCalculatedHours = calculateShiftElapsedExactHours(createdMs, endCalculatedMs, activeShift);
                elapsedHours = Math.min(reqHours, initialDone + shiftCalculatedHours);
              } else {
                elapsedHours = Math.min(reqHours, initialDone);
              }
            } else {
              // Live status
              if (!isNaN(createdMs) && createdMs <= nowMs) {
                const shiftCalculatedHours = calculateShiftElapsedExactHours(createdMs, nowMs, activeShift);
                elapsedHours = Math.min(reqHours, initialDone + shiftCalculatedHours);
              } else {
                elapsedHours = Math.min(reqHours, initialDone);
              }
            }

            const pendingHours = Math.max(0, reqHours - elapsedHours);
            const progressPercent = reqHours > 0 ? Math.min(100, Math.round((elapsedHours / reqHours) * 100)) : 0;
            const doneHHMM = formatHoursToHHMM(elapsedHours);
            const pendingHHMM = formatHoursToHHMM(pendingHours);
            
            return (
              <div
                key={unit.id}
                className="group relative bg-slate-900 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-800/80 rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between gap-4"
              >
                
                {/* Header Card Content */}
                <div className="space-y-3.5">
                  
                  {/* Top Row: Station No on Far Left, Live status on Far Right */}
                  <div className="flex items-center justify-between gap-4 w-full pb-1">
                    
                    {/* Station No on Left (e.g., St. No: 01) */}
                    <span className="px-3 py-1.5 rounded-full text-xs font-black bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1.5 shrink-0 shadow-sm">
                      📍 St. No: {unit.station ? unit.station.replace(/^Station\s*/i, '') : '01'}
                    </span>

                    {/* Live Status on Top Right */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-3 py-1.5 text-xs font-extrabold rounded-full border shadow-sm flex items-center gap-1.5 ${
                        unit.status === 'live' 
                          ? isShiftActive 
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800 animate-pulse' 
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                          : unit.status === 'stopped'
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {unit.status === 'live' 
                          ? (isShiftActive ? '🟢 Live' : '⏸️ Paused') 
                          : unit.status === 'stopped' 
                          ? '⏸️ Stopped' 
                          : '✅ Finished'}
                      </span>


                      {/* Delete icon shown only in Stop section / status */}
                      {unit.status === 'stopped' && (
                        <button
                          onClick={() => handleDelete(unit.id, unit.modelName)}
                          className="p-1.5 text-rose-300 hover:text-white bg-rose-950 border border-rose-800 hover:border-rose-600 hover:bg-rose-900 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
                          title="Delete Card & Database Record"
                        >
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Model Name Title */}
                  <div>
                    <h3 className="text-lg font-black text-white group-hover:text-cyan-300 transition-colors leading-snug">
                      {unit.modelName}
                    </h3>
                  </div>

                  {/* Metadata Info Box: Start Date/Time, End Date/Time (if finished/stopped) & Request By */}
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                    {unit.status === 'finished' || unit.status === 'stopped' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2.5 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Start Date & Time</span>
                          <span className="font-mono text-[11px] font-bold text-slate-200 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                            {formatShortDateTime(unit.createdAt)}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            {unit.status === 'finished' ? 'End Date & Time' : 'Stop Date & Time'}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-emerald-300 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                            {formatShortDateTime(unit.updatedAt || unit.createdAt)}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Request By</span>
                          <span className="font-semibold text-indigo-300 flex items-center gap-1 truncate mt-0.5">
                            <User className="w-3 h-3 text-indigo-400 shrink-0" />
                            {unit.requestBy}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-8 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Start Date & Time</span>
                          <span className="font-mono text-[11px] font-bold text-slate-200 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                            {formatShortDateTime(unit.createdAt)}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-400 block font-medium">Request By</span>
                          <span className="font-semibold text-indigo-300 flex items-center justify-end gap-1 truncate mt-0.5">
                            <User className="w-3 h-3 text-indigo-400 shrink-0" />
                            {unit.requestBy}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Separate Horizontal Row for Done & Pending Hours in Running format */}
                  <div className="flex items-center justify-between gap-2 text-xs font-mono bg-slate-950/90 px-3.5 py-2 rounded-xl border border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <span>✅ Done:</span>
                      <span className="text-emerald-300 font-black">{doneHHMM}</span>
                    </div>
                    <div className="h-3 w-[1px] bg-slate-800" />
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                      <span>⏳ Pending:</span>
                      <span className="text-amber-200 font-black">{pendingHHMM}</span>
                    </div>
                  </div>

                  {/* Required Hours & Progress Bar */}
                  <div className="space-y-2 bg-slate-950/90 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Required Hour: <strong className="text-amber-300 font-extrabold">{unit.requiredHour}h</strong>
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${
                        unit.status === 'live'
                          ? isShiftActive
                            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                            : 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                          : unit.status === 'stopped'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                      }`}>
                        {unit.status === 'finished' 
                          ? `Passed (${progressPercent}%)` 
                          : unit.status === 'stopped' 
                          ? `Stopped (${progressPercent}%)` 
                          : isShiftActive
                          ? `Running (${progressPercent}%)`
                          : `Paused (${progressPercent}%)`}
                      </span>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="w-full bg-slate-900 border border-slate-800 rounded-full h-2.5 overflow-hidden p-0.5">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          unit.status === 'live'
                            ? isShiftActive
                              ? 'bg-gradient-to-r from-cyan-500 to-emerald-400 animate-pulse'
                              : 'bg-gradient-to-r from-amber-500 to-amber-600'
                            : unit.status === 'stopped'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />

                    </div>
                  </div>

                </div>

                {/* Footer Buttons: View Details, Stop, Pass */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => {
                      setSelectedUnit(unit);
                      setIsDetailsOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                    title="View Details"
                  >
                    <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>View</span>
                  </button>

                  {/* Report (for Finished) or Stop / Resume (for Live / Stopped) */}
                  {unit.status === 'finished' ? (
                    <button
                      onClick={() => {
                        const serial = unit.iduSerialNumber || unit.oduSerialNumber || unit.id;
                        if (onNavigateToGenerateReport) {
                          onNavigateToGenerateReport(serial);
                        } else {
                          exportUnitToPDF({
                            title: 'Proto Unit Inspection Report',
                            unitType: 'Proto Testing Unit',
                            modelName: unit.modelName,
                            serialNumber: `IDU: ${unit.iduSerialNumber} | ODU: ${unit.oduSerialNumber}`,
                            status: 'PASSED',
                            details: [
                              { label: 'Testing Station', value: unit.station || 'Station 01' },
                              { label: 'Requested By', value: unit.requestBy },
                              { label: 'Required Duration', value: `${unit.requiredHour} Hours` },
                              { label: 'Created At', value: unit.createdAt }
                            ],
                            purpose: unit.testPurpose,
                            remarks: unit.remarks || 'No remarks provided.',
                            extraInfo: [
                              { label: 'IDU PCB Supplier / Code', value: `${unit.partsInfo?.iduPcbSupplier || 'N/A'} (${unit.partsInfo?.iduPcbPartCode || 'N/A'})` },
                              { label: 'IDU Motor Supplier / Code', value: `${unit.partsInfo?.iduMotorSupplier || 'N/A'} (${unit.partsInfo?.iduMotorPartCode || 'N/A'})` },
                              { label: 'ODU PCB Supplier / Code', value: `${unit.partsInfo?.oduPcbSupplier || 'N/A'} (${unit.partsInfo?.oduPcbPartCode || 'N/A'})` },
                              { label: 'ODU Compressor Supplier / Code', value: `${unit.partsInfo?.oduCompressorSupplier || 'N/A'} (${unit.partsInfo?.oduCompressorPartCode || 'N/A'})` },
                              { label: 'ODU Motor Supplier / Code', value: `${unit.partsInfo?.oduMotorSupplier || 'N/A'} (${unit.partsInfo?.oduMotorPartCode || 'N/A'})` },
                              { label: 'ODU EEV Supplier / Code', value: `${unit.partsInfo?.oduEevSupplier || 'N/A'} (${unit.partsInfo?.oduEevPartCode || 'N/A'})` }
                            ],
                            observations: unit.observations || []
                          });
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-black text-cyan-300 bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-800/80 transition-all shadow-sm cursor-pointer active:scale-95"
                      title="Open Generate Report Screen for this Unit"
                    >
                      <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Report</span>
                    </button>
                  ) : unit.status === 'live' ? (
                    <button
                      onClick={() => handleStopUnit(unit.id, elapsedHours)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-bold text-amber-200 bg-amber-950/90 hover:bg-amber-900 border border-amber-800/80 transition-all shadow-sm cursor-pointer"
                      title="Stop Running Test"
                    >
                      <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResumeUnit(unit.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-bold text-cyan-200 bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-800/80 transition-all shadow-sm cursor-pointer"
                      title="Resume to Live"
                    >
                      <Play className="w-3.5 h-3.5 text-cyan-400 shrink-0 fill-cyan-400" />
                      <span>Resume</span>
                    </button>
                  )}

                  {/* Pass Button */}
                  {unit.status !== 'finished' && (
                    <button
                      onClick={() => handlePassUnit(unit.id, elapsedHours)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-bold text-emerald-200 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-800/80 transition-all shadow-sm cursor-pointer"
                      title="Pass Test & Move to Finished"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3] shrink-0" />
                      <span>Pass</span>
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
          <Cpu className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">
            No Proto Units in {activeSection === 'live' ? 'Live' : activeSection === 'stopped' ? 'Stop' : 'Finished'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm 
              ? 'No matching proto units found for your search query.' 
              : activeSection === 'live'
                ? 'Click "Add Proto Unit" above to enter a new proto unit test record.'
                : activeSection === 'stopped'
                ? 'Units will appear here when you click "Stop" on a running test.'
                : 'Completed test records will appear here when you click "Pass".'}
          </p>
          {!searchTerm && activeSection === 'live' && (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-900 bg-cyan-400 hover:bg-cyan-300 transition-colors mt-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Proto Unit Now</span>
            </button>
          )}
        </div>
      )}

      {/* Add Dialog */}
      <AddProtoUnitDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={handleAddSuccess}
      />

      {/* Details Dialog */}
      <ProtoUnitDetailsDialog
        unit={selectedUnit}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedUnit(null);
        }}
        onStatusChanged={() => {
          setProtoUnits(getProtoUnits());
        }}
      />

    </div>
  );
};
