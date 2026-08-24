import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cpu, 
  Tag, 
  Clock, 
  User, 
  FileText, 
  Settings, 
  ImageIcon, 
  CheckCircle2, 
  Calendar, 
  Eye, 
  ArrowRightLeft,
  Plus,
  Trash2,
  Download
} from 'lucide-react';
import { ProtoUnit } from '../../types';
import { formatShortDateTime } from '../../utils/dateFormatter';
import { updateProtoUnitStatus, addProtoUnitObservation, deleteProtoUnitObservation } from '../../services/protoUnitStore';
import { exportUnitToPDF } from '../../utils/pdfExport';
import { useIsShiftActiveNow } from '../../services/shiftStore';


interface ProtoUnitDetailsDialogProps {
  unit: ProtoUnit | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChanged?: () => void;
}

export const ProtoUnitDetailsDialog: React.FC<ProtoUnitDetailsDialogProps> = ({
  unit,
  isOpen,
  onClose,
  onStatusChanged,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; label: string } | null>(null);
  const [currentUnit, setCurrentUnit] = useState<ProtoUnit | null>(unit);
  const [observationInput, setObservationInput] = useState('');

  const isShiftActive = useIsShiftActiveNow();

  useEffect(() => {
    setCurrentUnit(unit);
    setObservationInput('');
  }, [unit]);

  if (!isOpen || !currentUnit) return null;

  const handleToggleStatus = () => {
    const nextStatus = currentUnit.status === 'live' ? 'finished' : 'live';
    updateProtoUnitStatus(currentUnit.id, nextStatus);
    if (onStatusChanged) onStatusChanged();
    onClose();
  };

  const handleAddObservation = () => {
    if (!observationInput.trim() || !currentUnit) return;
    const updated = addProtoUnitObservation(currentUnit.id, observationInput.trim());
    if (updated) {
      setCurrentUnit(updated);
      setObservationInput('');
      if (onStatusChanged) onStatusChanged();
    }
  };

  const handleDeleteObservation = (obsId: string) => {
    if (!currentUnit) return;
    const updated = deleteProtoUnitObservation(currentUnit.id, obsId);
    if (updated) {
      setCurrentUnit(updated);
      if (onStatusChanged) onStatusChanged();
    }
  };

  const photoList: { label: string; url?: string }[] = [
    { label: 'Indoor Unit', url: currentUnit.photos?.PHOTO_Indoor_Unit || currentUnit.photos?.indoorUnitPhoto },
    { label: '1. Product Packing', url: currentUnit.photos?.PHOTO_Product_Packing || currentUnit.photos?.productPhoto },
    { label: '2. Packing Box', url: currentUnit.photos?.PHOTO_Packing_Box || currentUnit.photos?.packingBoxPhoto },
    { label: '3. IDU Motor', url: currentUnit.photos?.PHOTO_IDU_Motor || currentUnit.photos?.iduMotorPhoto },
    { label: '4. IDU PCB', url: currentUnit.photos?.PHOTO_IDU_PCB || currentUnit.photos?.iduPcbPhoto },
    { label: '5. IDU Product Name Plate', url: currentUnit.photos?.PHOTO_IDU_Product_Name_Plate || currentUnit.photos?.PHOTO_IDU_Name_Plate || currentUnit.photos?.iduNameplatePhoto },
    { label: '6. Remote', url: currentUnit.photos?.PHOTO_Remote || currentUnit.photos?.remotePhoto || currentUnit.photos?.stickerPhoto },
    { label: '7. ODU Name Plate', url: currentUnit.photos?.PHOTO_ODU_Name_Plate || currentUnit.photos?.oduNameplatePhoto },
    { label: '8. ODU Motor', url: currentUnit.photos?.PHOTO_ODU_Motor || currentUnit.photos?.oduMotorPhoto },
    { label: '9. ODU PCB', url: currentUnit.photos?.PHOTO_ODU_PCB || currentUnit.photos?.oduPcbPhoto },
    { label: '10. Electronic Expansion Valve', url: currentUnit.photos?.PHOTO_Electronic_Expansion_Valve || currentUnit.photos?.PHOTO_EEV || currentUnit.photos?.oduEevPhoto || currentUnit.photos?.eevPhoto },
    { label: '11. ODU Compressor', url: currentUnit.photos?.PHOTO_ODU_Compressor || currentUnit.photos?.PHOTO_Compressor || currentUnit.photos?.oduCompressorPhoto || currentUnit.photos?.compressorPhoto },
  ].filter(p => Boolean(p.url));

  const observationsList = currentUnit.observations || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-cyan-950/50 to-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-white">{unit.modelName}</h2>
                {(unit.sampleType || unit.reportDetails?.sampleType) && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {unit.sampleType || unit.reportDetails?.sampleType}
                  </span>
                )}
                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                  unit.status === 'live' 
                    ? isShiftActive 
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800 animate-pulse' 
                      : 'bg-amber-950 text-amber-300 border-amber-800'
                    : unit.status === 'stopped'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {unit.status === 'live' ? (isShiftActive ? '🟢 LIVE' : '⏸️ PAUSED') : unit.status === 'stopped' ? '⏸️ STOPPED' : '✅ PASSED'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Created on: <span className="text-slate-200 font-mono">{formatShortDateTime(unit.createdAt)}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Key Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Station</span>
              <span className="text-xs font-extrabold text-cyan-300">📍 {unit.station || 'Station 01'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">IDU Serial No</span>
              <span className="text-xs font-mono font-bold text-cyan-300">{unit.iduSerialNumber}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">ODU Serial No</span>
              <span className="text-xs font-mono font-bold text-cyan-300">{unit.oduSerialNumber}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Requested By</span>
              <span className="text-xs font-semibold text-indigo-300">{unit.requestBy}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Required / Done</span>
              <span className="text-xs font-bold text-amber-300">
                {unit.requiredHour}h <span className="text-slate-400 font-normal">/ {unit.doneHour || 0}h done</span>
              </span>
            </div>
          </div>

          {/* Test Purpose */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">Test Purpose</span>
            <p className="text-xs text-slate-200 leading-relaxed font-medium">{unit.testPurpose}</p>
          </div>

          {/* Report Details */}
          {unit.reportDetails && (unit.reportDetails.reportNo || unit.reportDetails.sampleType || unit.reportDetails.sampleReceived || unit.reportDetails.testCommenced || unit.reportDetails.testCompleted || unit.sampleType) && (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">Report Details</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Report No</span>
                  <span className="text-cyan-300 font-mono font-bold">{unit.reportDetails.reportNo || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Sample Type</span>
                  <span className="text-emerald-300 font-semibold">{unit.sampleType || unit.reportDetails.sampleType || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Sample Received</span>
                  <span className="text-white font-medium">{unit.reportDetails.sampleReceived || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Test Commenced</span>
                  <span className="text-white font-medium">{unit.reportDetails.testCommenced || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Test Completed</span>
                  <span className="text-white font-medium">{unit.reportDetails.testCompleted || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Name Plate Details */}
          {unit.namePlate && (unit.namePlate.coolingCapacity || unit.namePlate.ratedCoolingPower || unit.namePlate.ratedPower || unit.namePlate.mainProgramChecksumIdu || unit.namePlate.mainProgramChecksumOdu || unit.namePlate.gasInjectionVolume || unit.namePlate.powerMode || unit.namePlate.eeChecksumIdu || unit.namePlate.eeChecksumOdu || unit.namePlate.refrigerant || unit.namePlate.iseer) && (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Name Plate Details</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Cooling Capacity</span>
                  <span className="text-white font-medium">{unit.namePlate.coolingCapacity || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Rated Cooling Power</span>
                  <span className="text-amber-300 font-bold">{unit.namePlate.ratedCoolingPower || unit.namePlate.ratedPower || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Main Program Checksum IDU</span>
                  <span className="text-emerald-300 font-mono font-bold">{unit.namePlate.mainProgramChecksumIdu || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Main Program Checksum ODU</span>
                  <span className="text-emerald-300 font-mono font-bold">{unit.namePlate.mainProgramChecksumOdu || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Gas Injection Volume</span>
                  <span className="text-white font-medium">{unit.namePlate.gasInjectionVolume || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Power Mode</span>
                  <span className="text-white font-medium">{unit.namePlate.powerMode || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">EE Checksum IDU</span>
                  <span className="text-emerald-300 font-mono font-bold">{unit.namePlate.eeChecksumIdu || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">EE Checksum ODU</span>
                  <span className="text-emerald-300 font-mono font-bold">{unit.namePlate.eeChecksumOdu || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Refrigerant</span>
                  <span className="text-white font-medium">{unit.namePlate.refrigerant || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">ISEER</span>
                  <span className="text-white font-medium">{unit.namePlate.iseer || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          {/* IDU Details */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider">IDU Component Details</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">IDU Motor Spec</span>
                <span className="text-white font-medium">{unit.partsInfo?.iduMotorSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU Motor Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{unit.partsInfo?.iduMotorPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU Motor Supplier</span>
                <span className="text-white font-medium">{unit.partsInfo?.iduMotorSupplier || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU PCB Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{unit.partsInfo?.iduPcbPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU PCB Supplier</span>
                <span className="text-white font-medium">{unit.partsInfo?.iduPcbSupplier || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* ODU Details */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider">ODU Component Details</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">ODU Motor Spec</span>
                <span className="text-white font-medium">{unit.partsInfo?.oduMotorSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU Motor Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{unit.partsInfo?.oduMotorPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU Motor Supplier</span>
                <span className="text-white font-medium">{unit.partsInfo?.oduMotorSupplier || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU PCB Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{unit.partsInfo?.oduPcbPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU PCB Supplier</span>
                <span className="text-white font-medium">{unit.partsInfo?.oduPcbSupplier || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Compressor Details */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Compressor Details</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Compressor Spec</span>
                <span className="text-white font-medium">{unit.partsInfo?.compressorSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Compressor Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{unit.partsInfo?.compressorPartCode || unit.partsInfo?.oduCompressorPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Compressor Supplier</span>
                <span className="text-white font-medium">{unit.partsInfo?.compressorSupplier || unit.partsInfo?.oduCompressorSupplier || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* EEV Details */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings className="w-4 h-4 text-rose-400" />
              <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">EEV Details</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">EEV Spec</span>
                <span className="text-white font-medium">{unit.partsInfo?.eevSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">EEV Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{unit.partsInfo?.eevPartCode || unit.partsInfo?.oduEevPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">EEV Supplier</span>
                <span className="text-white font-medium">{unit.partsInfo?.eevSupplier || unit.partsInfo?.oduEevSupplier || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Parts Pictures */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider">Unit Photos Gallery (Fixed 6 cm × 4 cm Centered View)</h4>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">6cm × 4cm</span>
            </div>
            {photoList.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photoList.map((p, idx) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col items-center gap-2">
                    <span className="text-[10px] text-slate-300 font-bold uppercase block truncate w-full text-center">{p.label}</span>
                    <div 
                      onClick={() => setSelectedPhoto({ url: p.url!, label: p.label })}
                      className="w-[150px] h-[100px] bg-slate-950 rounded border border-slate-800 flex items-center justify-center overflow-hidden cursor-pointer relative group"
                    >
                      <img src={p.url} alt={p.label} className="w-full h-full object-contain p-1" />
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-5 h-5 text-cyan-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No component photos uploaded for this record.</p>
            )}
          </div>

          {/* Remarks */}
          {currentUnit.remarks && (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">Remarks</span>
              <p className="text-xs text-slate-300 leading-relaxed">{currentUnit.remarks}</p>
            </div>
          )}

          {/* Observation Textbox & Add Note Section */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Observation Notes
              </span>
              {observationsList.length > 0 && (
                <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/80 px-2.5 py-0.5 rounded-md border border-cyan-800/80">
                  {observationsList.length} {observationsList.length === 1 ? 'Note' : 'Notes'}
                </span>
              )}
            </div>

            {/* Input Box & Add Note Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                placeholder="Enter observation note here..."
                value={observationInput}
                onChange={(e) => setObservationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddObservation();
                  }
                }}
                className="flex-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handleAddObservation}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all shrink-0 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Add Note</span>
              </button>
            </div>

            {/* List of Observations */}
            {observationsList.length > 0 ? (
              <div className="space-y-2.5 mt-3 pt-3 border-t border-slate-800/80 max-h-52 overflow-y-auto pr-1">
                {observationsList.map((obs) => (
                  <div 
                    key={obs.id} 
                    className="bg-slate-900/90 border border-slate-800/90 p-3 rounded-xl flex items-start justify-between gap-3 text-xs shadow-sm"
                  >
                    <div className="space-y-1 flex-1">
                      <p className="text-slate-200 font-medium leading-relaxed">{obs.text}</p>
                      <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                        {obs.timestamp}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteObservation(obs.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors shrink-0 cursor-pointer"
                      title="Delete Observation Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic pt-1">
                No observation notes added yet. Type an observation above and click "Add Note".
              </p>
            )}
          </div>

        </div>

        {/* Footer Actions with strictly 2 buttons: Save PDF and Close */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-t border-slate-800 gap-3">
          <button
            onClick={() => {
              let targetUnit = currentUnit;
              if (observationInput.trim()) {
                const updated = addProtoUnitObservation(currentUnit.id, observationInput.trim());
                if (updated) {
                  targetUnit = updated;
                  setCurrentUnit(updated);
                  setObservationInput('');
                }
              }
              exportUnitToPDF({
                title: 'Proto Unit Inspection Report',
                unitType: 'Proto Testing Unit',
                modelName: targetUnit.modelName,
                serialNumber: `IDU: ${targetUnit.iduSerialNumber} | ODU: ${targetUnit.oduSerialNumber}`,
                status: targetUnit.status === 'live' ? 'LIVE TESTING' : targetUnit.status === 'stopped' ? 'STOPPED' : 'PASSED',
                details: [
                  { label: 'Testing Station', value: targetUnit.station || 'Station 01' },
                  { label: 'Requested By', value: targetUnit.requestBy },
                  { label: 'Required Duration', value: `${targetUnit.requiredHour} Hours` },
                  { label: 'Created At', value: targetUnit.createdAt }
                ],
                purpose: targetUnit.testPurpose,
                remarks: targetUnit.remarks || 'No remarks provided.',
                extraInfo: [
                  { label: 'IDU PCB Supplier / Code', value: `${targetUnit.partsInfo?.iduPcbSupplier || 'N/A'} (${targetUnit.partsInfo?.iduPcbPartCode || 'N/A'})` },
                  { label: 'IDU Motor Supplier / Code', value: `${targetUnit.partsInfo?.iduMotorSupplier || 'N/A'} (${targetUnit.partsInfo?.iduMotorPartCode || 'N/A'})` },
                  { label: 'ODU PCB Supplier / Code', value: `${targetUnit.partsInfo?.oduPcbSupplier || 'N/A'} (${targetUnit.partsInfo?.oduPcbPartCode || 'N/A'})` },
                  { label: 'ODU Compressor Supplier / Code', value: `${targetUnit.partsInfo?.oduCompressorSupplier || 'N/A'} (${targetUnit.partsInfo?.oduCompressorPartCode || 'N/A'})` },
                  { label: 'ODU Motor Supplier / Code', value: `${targetUnit.partsInfo?.oduMotorSupplier || 'N/A'} (${targetUnit.partsInfo?.oduMotorPartCode || 'N/A'})` },
                  { label: 'ODU EEV Supplier / Code', value: `${targetUnit.partsInfo?.oduEevSupplier || 'N/A'} (${targetUnit.partsInfo?.oduEevPartCode || 'N/A'})` }
                ],
                observations: targetUnit.observations || []
              });
            }}
            className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <FileText className="w-4 h-4 stroke-[2.5]" />
            <span>{currentUnit.status === 'finished' ? 'Generate Report' : 'Save PDF'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>

      {/* Image viewer modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white">{selectedPhoto.label}</h4>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center rounded-xl bg-slate-950 p-2">
              <img src={selectedPhoto.url} alt={selectedPhoto.label} className="max-h-[65vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
