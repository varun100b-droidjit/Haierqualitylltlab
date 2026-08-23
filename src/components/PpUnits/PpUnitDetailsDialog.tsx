import React, { useState } from 'react';
import { 
  X, 
  Cpu, 
  Clock, 
  User, 
  FileText, 
  Settings, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Plus, 
  Trash2,
  Zap,
  Box,
  Layers,
  ArrowRightLeft,
  Calendar,
  Sparkles
} from 'lucide-react';
import { PpUnit } from '../../types';
import { updatePpUnit, togglePpUnitStatus } from '../../services/ppUnitStore';
import { exportUnitToPDF } from '../../utils/pdfExport';
import { formatShortDateTime } from '../../utils/dateFormatter';
import { formatHoursToHHMM } from '../../services/shiftStore';

interface PpUnitDetailsDialogProps {
  unit: PpUnit | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateUnit?: (updatedUnit: PpUnit) => void;
  onStatusChanged?: () => void;
}

export const PpUnitDetailsDialog: React.FC<PpUnitDetailsDialogProps> = ({
  unit,
  isOpen,
  onClose,
  onUpdateUnit,
  onStatusChanged,
}) => {
  const [currentUnit, setCurrentUnit] = useState<PpUnit | null>(unit);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; label: string } | null>(null);
  const [observationInput, setObservationInput] = useState('');

  // Keep internal state synced when prop changes
  React.useEffect(() => {
    setCurrentUnit(unit);
  }, [unit]);

  if (!isOpen || !currentUnit) return null;

  const reqHours = typeof currentUnit.requiredHour === 'number' 
    ? currentUnit.requiredHour 
    : parseFloat(currentUnit.requiredHour) || 0;

  // Calculate elapsed and pending hours
  let elapsedHours = 0;
  let pendingHours = reqHours;

  if (currentUnit.status === 'finished') {
    elapsedHours = reqHours;
    pendingHours = 0;
  } else {
    let createdMs = NaN;
    if (currentUnit.createdAt) {
      createdMs = new Date(currentUnit.createdAt.replace(' ', 'T')).getTime();
      if (isNaN(createdMs)) {
        createdMs = new Date(currentUnit.createdAt).getTime();
      }
    }
    const nowMs = Date.now();

    if (!isNaN(createdMs) && createdMs <= nowMs) {
      let endCalculatedMs = nowMs;
      if (currentUnit.status === 'stopped' && currentUnit.updatedAt) {
        let updatedMs = new Date(currentUnit.updatedAt.replace(' ', 'T')).getTime();
        if (isNaN(updatedMs)) {
          updatedMs = new Date(currentUnit.updatedAt).getTime();
        }
        if (!isNaN(updatedMs) && updatedMs >= createdMs) {
          endCalculatedMs = updatedMs;
        }
      }

      const calculatedHours = Math.max(0, (endCalculatedMs - createdMs) / (1000 * 60 * 60));
      elapsedHours = Math.min(reqHours, calculatedHours);
    }
    pendingHours = Math.max(0, reqHours - elapsedHours);
  }

  const doneHHMM = formatHoursToHHMM(elapsedHours);
  const pendingHHMM = formatHoursToHHMM(pendingHours);

  const handleToggleStatus = () => {
    const newStatus = currentUnit.status === 'live' ? 'finished' : 'live';
    const updated = togglePpUnitStatus(currentUnit.id, newStatus);
    if (updated) {
      setCurrentUnit(updated);
      if (onUpdateUnit) onUpdateUnit(updated);
    }
  };

  const handleAddObservation = () => {
    if (!observationInput.trim()) return;
    const newObs = {
      id: Date.now().toString(),
      text: observationInput.trim(),
      timestamp: new Date().toLocaleString(),
    };
    const updatedObservations = [...(currentUnit.observations || []), newObs];
    const updated = updatePpUnit(currentUnit.id, { observations: updatedObservations });
    if (updated) {
      setCurrentUnit(updated);
      if (onUpdateUnit) onUpdateUnit(updated);
    }
    setObservationInput('');
  };

  const handleDeleteObservation = (id: string) => {
    const updatedObservations = (currentUnit.observations || []).filter(o => o.id !== id);
    const updated = updatePpUnit(currentUnit.id, { observations: updatedObservations });
    if (updated) {
      setCurrentUnit(updated);
      if (onUpdateUnit) onUpdateUnit(updated);
    }
  };

  const photoList: { label: string; url: string }[] = [];
  if (currentUnit.photos) {
    const p = currentUnit.photos;
    if (p.PHOTO_Indoor_Unit || p.indoorUnitPhoto) photoList.push({ label: '1. Indoor Unit', url: (p.PHOTO_Indoor_Unit || p.indoorUnitPhoto)! });
    if (p.PHOTO_Product_Packing || p.productPhoto) photoList.push({ label: '2. Product Packing', url: (p.PHOTO_Product_Packing || p.productPhoto)! });
    if (p.PHOTO_Packing_Box || p.packingBoxPhoto) photoList.push({ label: '3. Packing Box', url: (p.PHOTO_Packing_Box || p.packingBoxPhoto)! });
    if (p.PHOTO_IDU_Motor || p.iduMotorPhoto) photoList.push({ label: '4. IDU Motor', url: (p.PHOTO_IDU_Motor || p.iduMotorPhoto)! });
    if (p.PHOTO_IDU_PCB || p.iduPcbPhoto) photoList.push({ label: '5. IDU PCB', url: (p.PHOTO_IDU_PCB || p.iduPcbPhoto)! });
    if (p.PHOTO_IDU_Product_Name_Plate || p.PHOTO_IDU_Name_Plate || p.iduNameplatePhoto) photoList.push({ label: '6. IDU Product Name Plate', url: (p.PHOTO_IDU_Product_Name_Plate || p.PHOTO_IDU_Name_Plate || p.iduNameplatePhoto)! });
    if (p.PHOTO_Remote || p.remotePhoto || p.stickerPhoto) photoList.push({ label: '7. Remote', url: (p.PHOTO_Remote || p.remotePhoto || p.stickerPhoto)! });
    if (p.PHOTO_ODU_Name_Plate || p.oduNameplatePhoto) photoList.push({ label: '8. ODU Name Plate', url: (p.PHOTO_ODU_Name_Plate || p.oduNameplatePhoto)! });
    if (p.PHOTO_ODU_Motor || p.oduMotorPhoto) photoList.push({ label: '9. ODU Motor', url: (p.PHOTO_ODU_Motor || p.oduMotorPhoto)! });
    if (p.PHOTO_ODU_PCB || p.oduPcbPhoto) photoList.push({ label: '10. ODU PCB', url: (p.PHOTO_ODU_PCB || p.oduPcbPhoto)! });
    if (p.PHOTO_Electronic_Expansion_Valve || p.PHOTO_EEV || p.oduEevPhoto || p.eevPhoto) photoList.push({ label: '11. Electronic Expansion Valve', url: (p.PHOTO_Electronic_Expansion_Valve || p.PHOTO_EEV || p.oduEevPhoto || p.eevPhoto)! });
    if (p.PHOTO_ODU_Compressor || p.PHOTO_Compressor || p.oduCompressorPhoto || p.compressorPhoto) photoList.push({ label: '12. ODU Compressor', url: (p.PHOTO_ODU_Compressor || p.PHOTO_Compressor || p.oduCompressorPhoto || p.compressorPhoto)! });
  }

  const observationsList = currentUnit.observations || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-cyan-950/50 to-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white">{currentUnit.modelName}</h2>
                {(currentUnit.sampleType || currentUnit.reportDetails?.sampleType) && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {currentUnit.sampleType || currentUnit.reportDetails?.sampleType}
                  </span>
                )}
                {currentUnit.unitType && (
                  <span className={`px-2 py-0.5 text-[10px] font-black rounded-md border ${
                    currentUnit.unitType === 'IDU'
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                      : currentUnit.unitType === 'ODU'
                      ? 'bg-blue-950 text-blue-300 border-blue-800'
                      : 'bg-indigo-950 text-indigo-300 border-indigo-800'
                  }`}>
                    {currentUnit.unitType}
                  </span>
                )}
                {currentUnit.materialCode && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-slate-950 text-slate-300 border border-slate-800">
                    {currentUnit.materialCode}
                  </span>
                )}
                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                  currentUnit.status === 'live' 
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800 animate-pulse' 
                    : currentUnit.status === 'stopped'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {currentUnit.status === 'live' ? '🟢 LIVE' : currentUnit.status === 'stopped' ? '⏸️ STOPPED' : '✅ PASSED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Created: <span className="text-slate-200 font-mono">{formatShortDateTime(currentUnit.createdAt)}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Key Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Testing Station</span>
              <span className="text-xs font-extrabold text-cyan-300">📍 {currentUnit.station || 'Station 01'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">IDU Serial No</span>
              <span className="text-xs font-mono font-bold text-cyan-300">{currentUnit.iduSerialNumber}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">ODU Serial No</span>
              <span className="text-xs font-mono font-bold text-cyan-300">{currentUnit.oduSerialNumber}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Requested By</span>
              <span className="text-xs font-semibold text-indigo-300">{currentUnit.requestBy}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Required Duration</span>
              <span className="text-xs font-mono font-bold text-amber-300">{currentUnit.requiredHour} Hours</span>
            </div>
          </div>

          {/* Running Hours Progress Pill */}
          <div className="flex items-center justify-between gap-4 bg-slate-950/90 px-4 py-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-300 font-bold">Testing Progress:</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="text-emerald-400 font-bold">
                Done: <strong className="text-emerald-300">{doneHHMM}</strong>
              </div>
              <div className="text-slate-600">|</div>
              <div className="text-amber-300 font-bold">
                Pending: <strong className="text-amber-200">{pendingHHMM}</strong>
              </div>
            </div>
          </div>

          {/* Test Purpose */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">Test Purpose</span>
            <p className="text-xs text-slate-200 leading-relaxed font-medium">{currentUnit.testPurpose || 'Standard PP Trial Unit Verification'}</p>
          </div>

          {/* Report Details */}
          {currentUnit.reportDetails && (currentUnit.reportDetails.reportNo || currentUnit.reportDetails.sampleType || currentUnit.reportDetails.sampleReceived || currentUnit.reportDetails.testCommenced || currentUnit.reportDetails.testCompleted || currentUnit.sampleType) && (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">Report & Timeline Details</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Report No</span>
                  <span className="text-cyan-300 font-mono font-bold">{currentUnit.reportDetails.reportNo || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Sample Type</span>
                  <span className="text-emerald-300 font-semibold">{currentUnit.sampleType || currentUnit.reportDetails.sampleType || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Sample Received</span>
                  <span className="text-white font-medium">{currentUnit.reportDetails.sampleReceived || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Test Commenced</span>
                  <span className="text-white font-medium">{currentUnit.reportDetails.testCommenced || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Test Completed</span>
                  <span className="text-white font-medium">{currentUnit.reportDetails.testCompleted || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Name Plate & Technical Specs */}
          {currentUnit.namePlate && (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Nameplate & Technical Specifications</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {currentUnit.namePlate.coolingCapacity && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Cooling Capacity</span>
                    <span className="text-white font-mono font-bold">{currentUnit.namePlate.coolingCapacity}</span>
                  </div>
                )}
                {currentUnit.namePlate.ratedPower && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Rated Power</span>
                    <span className="text-white font-mono font-bold">{currentUnit.namePlate.ratedPower}</span>
                  </div>
                )}
                {currentUnit.namePlate.ratedCurrent && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Rated Current</span>
                    <span className="text-white font-mono font-bold">{currentUnit.namePlate.ratedCurrent}</span>
                  </div>
                )}
                {currentUnit.namePlate.voltage && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Voltage</span>
                    <span className="text-white font-mono font-bold">{currentUnit.namePlate.voltage}</span>
                  </div>
                )}
                {currentUnit.namePlate.iseer && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">ISEER</span>
                    <span className="text-white font-bold">{currentUnit.namePlate.iseer}</span>
                  </div>
                )}
                {currentUnit.namePlate.gasQty && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Gas Qty</span>
                    <span className="text-white font-mono font-bold">{currentUnit.namePlate.gasQty}</span>
                  </div>
                )}
                {currentUnit.namePlate.refrigerant && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Refrigerant</span>
                    <span className="text-white font-medium">{currentUnit.namePlate.refrigerant}</span>
                  </div>
                )}
                {currentUnit.namePlate.powerMode && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Power Mode</span>
                    <span className="text-white font-medium">{currentUnit.namePlate.powerMode}</span>
                  </div>
                )}
                {currentUnit.namePlate.mainProgramChecksumIdu && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Main Program Checksum IDU</span>
                    <span className="text-emerald-300 font-mono font-bold">{currentUnit.namePlate.mainProgramChecksumIdu}</span>
                  </div>
                )}
                {currentUnit.namePlate.mainProgramChecksumOdu && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Main Program Checksum ODU</span>
                    <span className="text-emerald-300 font-mono font-bold">{currentUnit.namePlate.mainProgramChecksumOdu}</span>
                  </div>
                )}
                {currentUnit.namePlate.eeChecksumIdu && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">EE Checksum IDU</span>
                    <span className="text-emerald-300 font-mono font-bold">{currentUnit.namePlate.eeChecksumIdu}</span>
                  </div>
                )}
                {currentUnit.namePlate.eeChecksumOdu && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">EE Checksum ODU</span>
                    <span className="text-emerald-300 font-mono font-bold">{currentUnit.namePlate.eeChecksumOdu}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* IDU Component Details */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider">IDU Component Details</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">IDU Motor Spec</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.iduMotorSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU Motor Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{currentUnit.partsInfo?.iduMotorPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU Motor Supplier</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.iduMotorSupplier || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU PCB Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{currentUnit.partsInfo?.iduPcbPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">IDU PCB Supplier</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.iduPcbSupplier || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* ODU Component Details */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider">ODU Component Details</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">ODU Motor Spec</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.oduMotorSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU Motor Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{currentUnit.partsInfo?.oduMotorPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU Motor Supplier</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.oduMotorSupplier || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU PCB Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{currentUnit.partsInfo?.oduPcbPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ODU PCB Supplier</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.oduPcbSupplier || 'N/A'}</span>
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
                <span className="text-white font-medium">{currentUnit.partsInfo?.compressorSpec || currentUnit.partsInfo?.oduCompressorSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Compressor Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{currentUnit.partsInfo?.compressorPartCode || currentUnit.partsInfo?.oduCompressorPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Compressor Supplier</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.compressorSupplier || currentUnit.partsInfo?.oduCompressorSupplier || 'N/A'}</span>
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
                <span className="text-white font-medium">{currentUnit.partsInfo?.eevSpec || currentUnit.partsInfo?.oduEevSpec || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">EEV Part Code</span>
                <span className="text-cyan-300 font-mono font-bold">{currentUnit.partsInfo?.eevPartCode || currentUnit.partsInfo?.oduEevPartCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">EEV Supplier</span>
                <span className="text-white font-medium">{currentUnit.partsInfo?.eevSupplier || currentUnit.partsInfo?.oduEevSupplier || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Photos Attachments */}
          {photoList.length > 0 && (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-3">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">
                Attached Component Photos ({photoList.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photoList.map((photo, index) => (
                  <div
                    key={index}
                    onClick={() => photo.url && setSelectedPhoto({ url: photo.url, label: photo.label })}
                    className="group relative bg-slate-900 border border-slate-800 rounded-xl p-2 cursor-pointer hover:border-cyan-500 transition-all flex flex-col items-center justify-between gap-1.5"
                  >
                    <div className="w-full h-24 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center p-1">
                      <img src={photo.url} alt={photo.label} className="w-full h-full object-contain" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 truncate w-full text-center">
                      {photo.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observation Notes & Logs */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-3">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
              Observation Notes & Quality Records
            </span>

            {/* Input to add observation note */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type testing observation note..."
                value={observationInput}
                onChange={(e) => setObservationInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddObservation()}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleAddObservation}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Add Note</span>
              </button>
            </div>

            {/* Existing Notes List */}
            {observationsList.length > 0 ? (
              <div className="space-y-2 mt-2">
                {observationsList.map((obs) => (
                  <div key={obs.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-200 font-medium">{obs.text}</p>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{obs.timestamp}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteObservation(obs.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">No custom observation notes added yet.</p>
            )}
          </div>

          {/* Remarks */}
          {currentUnit.remarks && (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
              <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Remarks</span>
              <p className="text-xs text-slate-300 font-medium">{currentUnit.remarks}</p>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="flex-none px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => {
              exportUnitToPDF({
                title: 'PP Unit Inspection Report',
                unitType: 'PP Testing Unit',
                modelName: currentUnit.modelName,
                serialNumber: `IDU: ${currentUnit.iduSerialNumber} | ODU: ${currentUnit.oduSerialNumber}`,
                status: currentUnit.status === 'finished' ? 'PASSED' : currentUnit.status.toUpperCase(),
                details: [
                  { label: 'Testing Station', value: currentUnit.station || 'Station 01' },
                  { label: 'Requested By', value: currentUnit.requestBy },
                  { label: 'Required Duration', value: `${currentUnit.requiredHour} Hours` },
                  { label: 'Created At', value: currentUnit.createdAt }
                ],
                purpose: currentUnit.testPurpose,
                remarks: currentUnit.remarks || 'No remarks provided.',
                extraInfo: [
                  { label: 'Rated Power / Current', value: `${currentUnit.namePlate?.ratedPower || 'N/A'} / ${currentUnit.namePlate?.ratedCurrent || 'N/A'}` },
                  { label: 'Cooling Capacity / Voltage', value: `${currentUnit.namePlate?.coolingCapacity || 'N/A'} / ${currentUnit.namePlate?.voltage || 'N/A'}` },
                  { label: 'ISEER / Gas Qty', value: `${currentUnit.namePlate?.iseer || 'N/A'} / ${currentUnit.namePlate?.gasQty || 'N/A'}` },
                  { label: 'Refrigerant / Power Mode', value: `${currentUnit.namePlate?.refrigerant || 'N/A'} / ${currentUnit.namePlate?.powerMode || 'N/A'}` },
                  { label: 'Main Checksums (IDU / ODU)', value: `${currentUnit.namePlate?.mainProgramChecksumIdu || 'N/A'} / ${currentUnit.namePlate?.mainProgramChecksumOdu || 'N/A'}` },
                  { label: 'IDU PCB Supplier / Code', value: `${currentUnit.partsInfo?.iduPcbSupplier || 'N/A'} (${currentUnit.partsInfo?.iduPcbPartCode || 'N/A'})` },
                  { label: 'IDU Motor Supplier / Code', value: `${currentUnit.partsInfo?.iduMotorSupplier || 'N/A'} (${currentUnit.partsInfo?.iduMotorPartCode || 'N/A'})` },
                  { label: 'ODU PCB Supplier / Code', value: `${currentUnit.partsInfo?.oduPcbSupplier || 'N/A'} (${currentUnit.partsInfo?.oduPcbPartCode || 'N/A'})` },
                  { label: 'ODU Motor Supplier / Code', value: `${currentUnit.partsInfo?.oduMotorSupplier || 'N/A'} (${currentUnit.partsInfo?.oduMotorPartCode || 'N/A'})` },
                  { label: 'Compressor Supplier / Code', value: `${currentUnit.partsInfo?.compressorSupplier || currentUnit.partsInfo?.oduCompressorSupplier || 'N/A'} (${currentUnit.partsInfo?.compressorPartCode || currentUnit.partsInfo?.oduCompressorPartCode || 'N/A'})` },
                  { label: 'EEV Supplier / Code', value: `${currentUnit.partsInfo?.eevSupplier || currentUnit.partsInfo?.oduEevSupplier || 'N/A'} (${currentUnit.partsInfo?.eevPartCode || currentUnit.partsInfo?.oduEevPartCode || 'N/A'})` },
                ],
                observations: currentUnit.observations || []
              });
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-800/80 hover:bg-cyan-900 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Download PDF Report</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleStatus}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                currentUnit.status === 'live'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800 hover:bg-cyan-900'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Mark as {currentUnit.status === 'live' ? 'Finished (Pass)' : 'Live'}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>

      {/* Photo View Modal */}
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
