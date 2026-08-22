import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Upload, 
  FileSpreadsheet, 
  RefreshCw, 
  Check, 
  Zap,
  AlertCircle
} from 'lucide-react';
import { PpUnit } from '../../types';
import { passPpUnitWithDetails } from '../../services/ppUnitStore';
import { processExcelValueSheet, fetchMeasurementRecords } from '../../services/graphStore';

interface PassPpUnitModalProps {
  unit: PpUnit | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PassPpUnitModal: React.FC<PassPpUnitModalProps> = ({
  unit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [isUploaded, setIsUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format YYYY-MM-DD HH:mm to YYYY-MM-DDTHH:mm for datetime-local input
  const formatToInputDate = (dateStr?: string): string => {
    if (!dateStr) {
      const now = new Date();
      return now.toISOString().slice(0, 16);
    }
    const normalized = dateStr.replace(' ', 'T');
    if (normalized.length >= 16) {
      return normalized.slice(0, 16);
    }
    const d = new Date(normalized);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return now.toISOString().slice(0, 16);
    }
    return d.toISOString().slice(0, 16);
  };

  // Format YYYY-MM-DDTHH:mm back to YYYY-MM-DD HH:mm
  const formatToStorageDate = (inputStr: string): string => {
    if (!inputStr) return '';
    return inputStr.replace('T', ' ');
  };

  useEffect(() => {
    if (isOpen && unit) {
      setStartDate(formatToInputDate(unit.createdAt));
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setEndDate(`${year}-${month}-${day}T${hours}:${minutes}`);

      // Check if value sheet already uploaded
      checkExistingUpload(unit.id);
    }
  }, [isOpen, unit]);

  // Calculate live total test duration (Request Hour) between Start & End Time
  const calculatedHours = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return 0;
    const diffHours = (endMs - startMs) / (1000 * 60 * 60);
    return Number(diffHours.toFixed(1));
  }, [startDate, endDate]);

  const checkExistingUpload = async (unitId: string) => {
    try {
      const records = await fetchMeasurementRecords(unitId);
      if (records && records.length > 0) {
        setIsUploaded(true);
        setUploadMsg(`✓ Value Sheet already uploaded (${records.length} records in Graph)`);
      } else {
        setIsUploaded(false);
        setUploadMsg(null);
      }
    } catch (e) {
      setIsUploaded(false);
    }
  };

  if (!isOpen || !unit) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !unit) return;

    e.target.value = '';
    setIsUploading(true);
    setUploadMsg('Parsing Value Sheet & saving measurement records...');

    try {
      const result = await processExcelValueSheet(file, unit.id, unit.requestBy || 'PP Operator');
      setIsUploaded(true);
      setUploadMsg(`✓ Value Sheet Uploaded Successfully! (${result.count} records imported to Graph)`);
    } catch (err) {
      console.error('Value Sheet upload error:', err);
      setUploadMsg('❌ Failed to upload Value Sheet. Please check file format.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unit) return;

    const formattedStart = formatToStorageDate(startDate);
    const formattedEnd = formatToStorageDate(endDate);

    const hoursToSave = calculatedHours > 0 ? calculatedHours : unit.requiredHour;

    passPpUnitWithDetails(unit.id, formattedStart, formattedEnd, hoursToSave);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl transition-all">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-950/80 border border-emerald-800/80 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Pass PP Unit Test
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {unit.modelName} &bull; Station: {unit.station || '01'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePassSubmit} className="p-6 space-y-5">
          
          {/* Unit Overview Badge */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">IDU Serial</span>
              <strong className="text-cyan-300 font-bold">{unit.iduSerialNumber || 'N/A'}</strong>
            </div>
            <div className="h-6 w-[1px] bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[10px]">ODU Serial</span>
              <strong className="text-cyan-300 font-bold">{unit.oduSerialNumber || 'N/A'}</strong>
            </div>
            <div className="h-6 w-[1px] bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[10px]">Calculated Req. Hours</span>
              <strong className="text-emerald-300 font-extrabold text-xs block">
                {calculatedHours > 0 ? `${calculatedHours}h` : `${unit.requiredHour || 0}h`}
              </strong>
            </div>
          </div>

          {/* Start Time & Date Select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Start Time / Date</span>
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* End Time & Date Select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>End Time / Date</span>
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Live Calculated Request Hour Preview */}
          <div className="p-3 bg-slate-950/90 border border-emerald-500/40 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200">Counted Total Duration (Request Hour):</span>
            </div>
            <span className="text-sm font-black font-mono text-emerald-400 bg-emerald-950 px-2.5 py-0.5 rounded-lg border border-emerald-800">
              {calculatedHours > 0 ? `${calculatedHours} Hours` : `${unit.requiredHour || 0} Hours`}
            </span>
          </div>

          {/* Upload Value Sheet Button Section */}
          <div className="bg-slate-950/90 p-4 rounded-xl border border-cyan-800/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-extrabold text-cyan-300 uppercase tracking-wider">
                  Upload Value Sheet
                </span>
              </div>
              {isUploaded && (
                <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400 stroke-[3]" /> Uploaded
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              Attach Excel (.xlsx), CSV, or JSON data sheet. Uploading here will automatically sync measurement records to the Graph view.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls,.json,.csv"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-extrabold text-xs shadow-md transition-all cursor-pointer ${
                isUploaded 
                  ? 'bg-emerald-950 hover:bg-emerald-900 border border-emerald-600 text-emerald-300' 
                  : 'bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white'
              }`}
            >
              {isUploading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : isUploaded ? (
                <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
              ) : (
                <Upload className="w-4 h-4 text-white" />
              )}
              <span>
                {isUploading 
                  ? 'Uploading Value Sheet...' 
                  : isUploaded 
                  ? '✓ Value Sheet Uploaded (Click to Re-upload)' 
                  : 'Upload Value Sheet (.xlsx / .csv)'}
              </span>
            </button>

            {uploadMsg && (
              <p className={`text-[11px] font-medium ${uploadMsg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {uploadMsg}
              </p>
            )}
          </div>

          {/* Submit Pass Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-sm text-slate-900 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 shadow-lg shadow-emerald-950/60 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
            >
              <Check className="w-5 h-5 stroke-[3] text-slate-900" />
              <span>Pass PP Unit &amp; Move to Finished</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
