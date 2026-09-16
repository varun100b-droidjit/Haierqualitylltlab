import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  FileText, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Layers, 
  UploadCloud, 
  Share2, 
  Camera, 
  Loader2, 
  Plus, 
  Trash2, 
  Sparkles, 
  AlertCircle,
  Check
} from 'lucide-react';
import { 
  saveSmogQtyRecord, 
  getSmogQtyRecords, 
  SmogQtyRecord, 
  SmogModelQtyItem 
} from '../../services/smogQtyStore';

interface SmogQtyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string | null;
  defaultShift?: 'A' | 'B' | 'all';
  onSaved?: (record: SmogQtyRecord) => void;
  onOpenWhatsAppShare?: (data: { date: string; shift: 'A' | 'B'; smogQty: number }) => void;
}

interface LocalHsoModel {
  id: string;
  modelName: string;
  qty: number;
}

export const SmogQtyFormModal: React.FC<SmogQtyFormModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  defaultShift,
  onSaved,
  onOpenWhatsAppShare
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState<string>(defaultDate || today);
  const [shift, setShift] = useState<'A' | 'B'>('A');
  const [notes, setNotes] = useState<string>('');
  const [hsoModels, setHsoModels] = useState<LocalHsoModel[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closedRecord, setClosedRecord] = useState<SmogQtyRecord | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing records if any when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialDate = defaultDate || today;
      const initialShift = (defaultShift && defaultShift !== 'all') ? (defaultShift as 'A' | 'B') : 'A';
      setDate(initialDate);
      setShift(initialShift);
      setNotes('');
      setError(null);
      setClosedRecord(null);
      setPhotoPreview(null);
      setScanSuccessMessage(null);

      // Check if there is already an existing record for this date & shift
      const allRecords = getSmogQtyRecords();
      const existing = allRecords.find(r => r.date === initialDate && r.shift === initialShift);
      if (existing && existing.models && existing.models.length > 0) {
        setHsoModels(
          existing.models.map((m, idx) => ({
            id: `hso-${idx}-${Date.now()}`,
            modelName: m.modelName,
            qty: m.qty
          }))
        );
        if (existing.notes) setNotes(existing.notes);
      } else {
        setHsoModels([]);
      }
    }
  }, [isOpen, defaultDate, defaultShift, today]);

  // When date or shift changes, refresh existing models if available
  const handleDateOrShiftChange = (newDate: string, newShift: 'A' | 'B') => {
    setDate(newDate);
    setShift(newShift);
    const allRecords = getSmogQtyRecords();
    const existing = allRecords.find(r => r.date === newDate && r.shift === newShift);
    if (existing && existing.models && existing.models.length > 0) {
      setHsoModels(
        existing.models.map((m, idx) => ({
          id: `hso-${idx}-${Date.now()}`,
          modelName: m.modelName,
          qty: m.qty
        }))
      );
      if (existing.notes) setNotes(existing.notes);
    }
  };

  if (!isOpen) return null;

  // Auto-calculated Total Smog Qty strictly from all HSO models
  const totalSmogQty = hsoModels.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  // Handle Photo Capture / File Selection & AI OCR Extraction
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setScanSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setPhotoPreview(base64Data);
      setIsScanning(true);

      try {
        const response = await fetch('/api/smog/extract-hso-models', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            imageBase64: base64Data,
            mimeType: file.type || 'image/jpeg'
          })
        });

        const data = await response.json();

        if (data.success && Array.isArray(data.items) && data.items.length > 0) {
          const formatted: LocalHsoModel[] = data.items.map((it: { modelName: string; qty: number }, idx: number) => ({
            id: `hso-${Date.now()}-${idx}`,
            modelName: it.modelName,
            qty: Number(it.qty) || 1
          }));

          setHsoModels(formatted);
          setScanSuccessMessage(
            `Extracted ${formatted.length} HSO Models! Total Smog Qty: ${data.totalQty}`
          );
        } else {
          setError(
            data.note || 
            data.error || 
            'No models starting with "HSO" found in this photo. Please ensure the Excel filter shows HSO models, or add them manually below.'
          );
        }
      } catch (err: any) {
        console.error('Error during OCR extraction:', err);
        setError('Network or server error while scanning photo. You can add HSO models manually below.');
      } finally {
        setIsScanning(false);
        // Reset input value so same file can be chosen again if needed
        if (e.target) {
          e.target.value = '';
        }
      }
    };

    reader.onerror = () => {
      setError('Could not read image file. Please try again.');
    };

    reader.readAsDataURL(file);
  };

  // Add a manual HSO row
  const handleAddManualRow = () => {
    const nextIdx = hsoModels.length + 1;
    const newRow: LocalHsoModel = {
      id: `hso-manual-${Date.now()}-${nextIdx}`,
      modelName: `HSO${nextIdx > 9 ? nextIdx : '0' + nextIdx}-3NB-I:AC`,
      qty: 100
    };
    setHsoModels(prev => [...prev, newRow]);
    setError(null);
  };

  // Edit Model Name
  const handleModelNameChange = (index: number, val: string) => {
    setHsoModels(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], modelName: val.toUpperCase() };
      return updated;
    });
  };

  // Edit Model Qty
  const handleModelQtyChange = (index: number, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setHsoModels(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], qty: num };
      return updated;
    });
  };

  // Remove a row
  const handleRemoveRow = (index: number) => {
    setHsoModels(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Operation Close
  const handleOperationClose = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (hsoModels.length === 0) {
      setError('Please click the Camera icon above to scan HSO models from photo, or click "+ Add Model" to enter models.');
      return;
    }

    if (totalSmogQty <= 0) {
      setError('Total Smog Qty must be greater than 0. Please verify the quantities of your HSO models.');
      return;
    }

    if (!date) {
      setError('Please choose a valid Target Date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const modelsToSave: SmogModelQtyItem[] = hsoModels.map(m => ({
        modelName: m.modelName.trim(),
        qty: Number(m.qty) || 0
      }));

      const saved = saveSmogQtyRecord({
        date: date.trim(),
        shift,
        smogQty: totalSmogQty,
        models: modelsToSave,
        notes: notes.trim()
      });

      if (onSaved) {
        onSaved(saved);
      }

      // Transition to Operation Closed view
      setClosedRecord(saved);
    } catch (err) {
      console.error('Error saving smog qty:', err);
      setError('Failed to upload Smog Qty data. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              closedRecord 
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                : 'bg-purple-500/20 border-purple-500/40 text-purple-400'
            }`}>
              {closedRecord ? <CheckCircle2 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white tracking-tight">
                {closedRecord ? 'Operation Closed' : 'Smog Qty Form'}
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                {closedRecord ? 'Data uploaded successfully' : 'Upload Smog Qty via HSO Model Camera Scan'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View when Operation Close is Completed */}
        {closedRecord ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-extrabold text-white">
                Operation Closed Successfully!
              </h4>
              <p className="text-xs text-emerald-300 font-mono">
                Smog Qty ({closedRecord.smogQty}) data has been uploaded and synchronized.
              </p>
            </div>

            {/* Closed Info Badges */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Date</span>
                <span className="text-xs font-black text-white mt-0.5 block">{closedRecord.date}</span>
              </div>
              <div className="border-x border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Shift</span>
                <span className="text-xs font-black text-amber-400 mt-0.5 block">Shift {closedRecord.shift}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Total Smog Qty</span>
                <span className="text-sm font-black text-purple-400 mt-0.5 block">{closedRecord.smogQty}</span>
              </div>
            </div>

            {/* HSO Models Breakdown in Closed View */}
            {closedRecord.models && closedRecord.models.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 font-mono flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>Uploaded HSO Models ({closedRecord.models.length})</span>
                  </span>
                  <span className="text-xs font-mono font-black text-purple-300">
                    Total: {closedRecord.smogQty}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {closedRecord.models.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-mono py-1 px-2 rounded-lg bg-slate-900 border border-slate-800/80">
                      <span className="text-cyan-300 font-bold truncate">{m.modelName}</span>
                      <span className="text-amber-400 font-black px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">{m.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Share WhatsApp Button */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenWhatsAppShare) {
                    onOpenWhatsAppShare({
                      date: closedRecord.date,
                      shift: closedRecord.shift,
                      smogQty: closedRecord.smogQty
                    });
                  }
                }}
                className="w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-400 to-green-500 hover:from-emerald-300 hover:to-green-400 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4 stroke-[2.5]" />
                <span>Share WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Done / Close
              </button>
            </div>
          </div>
        ) : (
          /* Normal Form Body before Operation Close */
          <form onSubmit={handleOperationClose} className="p-5 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* 1. CAMERA ICON / SCANNER BAR (DIRECTLY ABOVE TARGET DATE) */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/70 via-slate-900 to-cyan-950/70 border border-purple-800/40 space-y-2.5 shadow-inner">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-sm">
                    <Camera className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-extrabold text-white block tracking-tight">
                      Camera Photo Scan
                    </span>
                    <span className="text-[10px] text-purple-300/80 font-mono block truncate">
                      Click photo to auto-extract HSO models & Qty
                    </span>
                  </div>
                </div>

                {/* Camera Click & Upload Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Primary Camera Button */}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isScanning}
                    className="py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950/60 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                    title="Open Camera to Click Photo"
                  >
                    <Camera className="w-4 h-4 stroke-[2.5]" />
                    <span>Click Photo</span>
                  </button>

                  {/* Upload Image Button (for saved photos / gallery) */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanning}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                    title="Upload Photo / File"
                  >
                    <UploadCloud className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Hidden file inputs for Camera and File selection */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Scanning Active State */}
              {isScanning && (
                <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/50 flex items-center gap-2.5 animate-pulse">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                  <span className="text-xs text-cyan-200 font-mono font-bold">
                    Analyzing photo with AI... Extracting models starting with "HSO" & Quantities...
                  </span>
                </div>
              )}

              {/* Scan Success Message */}
              {scanSuccessMessage && !isScanning && (
                <div className="p-2 px-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center gap-2 text-emerald-300 text-xs font-mono">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold">{scanSuccessMessage}</span>
                </div>
              )}

              {/* Photo Preview Strip if selected */}
              {photoPreview && !isScanning && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <img
                      src={photoPreview}
                      alt="Scanned filter"
                      className="w-10 h-10 object-cover rounded-lg border border-slate-700 shrink-0"
                    />
                    <div className="truncate">
                      <span className="text-slate-200 font-bold block text-[11px] font-mono">Photo Attached</span>
                      <span className="text-[10px] text-slate-400 font-mono truncate block">
                        {hsoModels.length > 0 ? `${hsoModels.length} HSO models captured` : 'Ready to analyze or re-capture'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview(null);
                      setScanSuccessMessage(null);
                    }}
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-colors"
                    title="Remove photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 2. TARGET DATE (Directly below Camera bar) */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Target Date</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => handleDateOrShiftChange(e.target.value, shift)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-400 transition-colors"
                required
              />
            </div>

            {/* 3. SHIFT CHOOSE OPTIONS */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Shift Choose Options</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Select Shift A or B</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDateOrShiftChange(date, 'A')}
                  className={`py-2.5 px-3 rounded-xl font-mono text-xs font-extrabold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 border ${
                    shift === 'A'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-950/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${shift === 'A' ? 'bg-slate-950' : 'bg-cyan-400'}`} />
                    <span className="font-black text-sm">Shift A</span>
                  </div>
                  <span className={`text-[10px] font-mono ${shift === 'A' ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                    07:00 AM – 07:00 PM
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDateOrShiftChange(date, 'B')}
                  className={`py-2.5 px-3 rounded-xl font-mono text-xs font-extrabold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 border ${
                    shift === 'B'
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-950/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${shift === 'B' ? 'bg-slate-950' : 'bg-amber-400'}`} />
                    <span className="font-black text-sm">Shift B</span>
                  </div>
                  <span className={`text-[10px] font-mono ${shift === 'B' ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                    07:00 PM – 07:00 AM
                  </span>
                </button>
              </div>
            </div>

            {/* 4. EXTRACTED HSO MODELS & QUANTITIES (DIRECTLY BELOW SHIFT AS REQUESTED) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-purple-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>HSO Models & Qty (from Photo)</span>
                  {hsoModels.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-mono font-extrabold border border-purple-500/30">
                      {hsoModels.length} {hsoModels.length === 1 ? 'Model' : 'Models'}
                    </span>
                  )}
                </label>

                {/* Add Manual Row Button */}
                <button
                  type="button"
                  onClick={handleAddManualRow}
                  className="text-[11px] font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 hover:bg-cyan-950 border border-cyan-800/50 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Add an HSO Model manually"
                >
                  <Plus className="w-3 h-3 stroke-[2.5]" />
                  <span>Add Model</span>
                </button>
              </div>

              {/* Models List Table / Cards */}
              {hsoModels.length > 0 ? (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 border border-slate-800/80 rounded-2xl p-2 bg-slate-950/60">
                  <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] font-mono font-bold text-slate-500 uppercase">
                    <span className="col-span-1 text-center">#</span>
                    <span className="col-span-7">HSO Model Name</span>
                    <span className="col-span-3 text-right">Qty</span>
                    <span className="col-span-1 text-center">Del</span>
                  </div>

                  {hsoModels.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
                    >
                      <span className="col-span-1 text-[10px] font-mono font-bold text-slate-500 text-center">
                        {index + 1}
                      </span>
                      
                      <div className="col-span-7">
                        <input
                          type="text"
                          value={item.modelName}
                          onChange={(e) => handleModelNameChange(index, e.target.value)}
                          placeholder="HSO17-3NB-I:AC"
                          className="w-full bg-slate-950 px-2 py-1.5 text-xs font-mono font-extrabold text-cyan-300 rounded-lg border border-slate-800 focus:border-cyan-400 focus:outline-none uppercase"
                          required
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleModelQtyChange(index, e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-lg text-xs font-mono font-black text-amber-300 text-right focus:outline-none"
                          required
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(index)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 transition-colors"
                          title="Remove this HSO model"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Calculated Total Smog Qty Strip */}
                  <div className="flex items-center justify-between p-2.5 px-3 rounded-xl bg-purple-950/50 border border-purple-800/60 mt-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs font-bold text-slate-200">
                        Total Smog Qty (Sum of HSO Models):
                      </span>
                    </div>
                    <span className="text-sm font-black text-purple-300 bg-purple-500/20 px-2.5 py-0.5 rounded-lg border border-purple-500/40">
                      {totalSmogQty}
                    </span>
                  </div>
                </div>
              ) : (
                /* Empty state */
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-dashed border-slate-800 text-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                    <Camera className="w-5 h-5 text-purple-400/80" />
                  </div>
                  <div>
                    <p className="text-xs font-mono font-bold text-slate-300">
                      No HSO Models Loaded Yet
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1 max-w-sm mx-auto">
                      Click the <span className="text-cyan-400 font-bold">"Click Photo"</span> button above Target Date to snap a photo of the Excel filter list, or click <span className="text-cyan-400 font-bold">"+ Add Model"</span> to enter manually.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 5. OPTIONAL REMARKS / NOTES */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-semibold text-slate-400">
                Remarks / Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Day shift batch target from Excel filter"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 transition-colors font-mono"
              />
            </div>

            {/* 6. OPERATION CLOSE BUTTON */}
            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={isSubmitting || isScanning}
                className="w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 hover:from-purple-300 hover:to-cyan-300 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                    <span>Operation Close (Upload {totalSmogQty} Smog Qty)</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-center text-slate-500 font-mono">
                Clicking "Operation Close" uploads this data and unlocks the Share WhatsApp Report.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
