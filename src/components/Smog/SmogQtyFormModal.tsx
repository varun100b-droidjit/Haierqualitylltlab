import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft,
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
  Check,
  Lock,
  Unlock,
  RefreshCw
} from 'lucide-react';
import { 
  saveSmogQtyRecord, 
  getSmogQtyRecords, 
  SmogQtyRecord 
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
  const [shift, setShift] = useState<'A' | 'B' | ''>(
    (defaultShift && (defaultShift === 'A' || defaultShift === 'B')) ? defaultShift : 'A'
  );
  const [notes, setNotes] = useState<string>('');
  const [hsoModels, setHsoModels] = useState<LocalHsoModel[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closedRecord, setClosedRecord] = useState<SmogQtyRecord | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera is enabled strictly when Production Date AND Shift are selected
  const isCameraEnabled = Boolean(date && date.trim() !== '' && (shift === 'A' || shift === 'B'));

  // Load existing records if any when screen opens
  useEffect(() => {
    if (isOpen) {
      const initialDate = defaultDate || today;
      const initialShift: 'A' | 'B' = (defaultShift && defaultShift === 'B') ? 'B' : 'A';
      setDate(initialDate);
      setShift(initialShift);
      setNotes('');
      setError(null);
      setClosedRecord(null);
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
  const handleDateOrShiftChange = (newDate: string, newShift: 'A' | 'B' | '') => {
    setDate(newDate);
    setShift(newShift);
    setError(null);
    setScanSuccessMessage(null);

    if (newDate && (newShift === 'A' || newShift === 'B')) {
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
    }
  };

  if (!isOpen) return null;

  // Auto-calculated Total Smog Qty strictly from all HSO models
  const totalSmogQty = hsoModels.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  // Handle Photo Capture / File Selection & AI OCR Extraction
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isCameraEnabled) {
      setError('Please select Production Date and Shift first before using the Camera.');
      return;
    }

    setError(null);
    setScanSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
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

        // DELETION RULE AS REQUESTED:
        // "Aur jab Photo se Model Collect ho jata hai tab wo photo Delete ho jayega."
        // Once the photo is read and processed, we do not keep or store the image.
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (data.success && Array.isArray(data.items) && data.items.length > 0) {
          const formatted: LocalHsoModel[] = data.items.map((it: { modelName: string; qty: number }, idx: number) => ({
            id: `hso-${Date.now()}-${idx}`,
            modelName: it.modelName,
            qty: Number(it.qty) || 1
          }));

          setHsoModels(formatted);
          setScanSuccessMessage(
            `Extracted ${formatted.length} HSO Models (${data.totalQty} Total Qty)! Photo deleted automatically.`
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
        if (e.target) {
          e.target.value = '';
        }
      }
    };

    reader.onerror = () => {
      setError('Could not read image file. Please try again.');
      setIsScanning(false);
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

    if (!date) {
      setError('Please select a valid Production Date.');
      return;
    }

    if (shift !== 'A' && shift !== 'B') {
      setError('Please select Shift A or Shift B.');
      return;
    }

    if (hsoModels.length === 0) {
      setError('Please scan a photo or click "+ Add Model" to add at least one HSO model.');
      return;
    }

    // Validate that models start with HSO
    const invalidModel = hsoModels.find(m => !m.modelName.trim().toUpperCase().startsWith('HSO'));
    if (invalidModel) {
      setError(`Model "${invalidModel.modelName}" does not start with "HSO". All models in this section must start with HSO.`);
      return;
    }

    if (totalSmogQty <= 0) {
      setError('Total Smog Qty must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formattedModels = hsoModels.map(m => ({
        modelName: m.modelName.trim().toUpperCase(),
        qty: m.qty
      }));

      const record = saveSmogQtyRecord({
        date,
        shift: shift as 'A' | 'B',
        smogQty: totalSmogQty,
        models: formattedModels,
        notes: notes.trim() ? notes.trim() : undefined
      });

      setClosedRecord(record);
      if (onSaved) {
        onSaved(record);
      }
    } catch (err: any) {
      setError(err?.message || 'Error saving Smog Qty record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-y-auto animate-in fade-in duration-200">
      {/* 1. TOP COMPACT HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-md">
        {/* Left: Back Button & Screen Title */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Return to Smog Dashboard"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Back</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              closedRecord 
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                : 'bg-purple-500/20 border-purple-500/40 text-purple-400'
            }`}>
              {closedRecord ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-extrabold text-white tracking-tight leading-tight">
                {closedRecord ? 'Smog Operation Closed' : 'Smog Production Qty Form'}
              </h1>
            </div>
          </div>
        </div>

        {/* Right: Selected Status Badges & Close Button */}
        <div className="flex items-center gap-2">
          {/* Status Badges */}
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="px-2 py-0.5 rounded-lg bg-slate-800/90 border border-slate-700 text-cyan-300 flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5 text-cyan-400" />
              <span>{date || 'No Date'}</span>
            </span>
            <span className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
              shift 
                ? 'bg-amber-400/10 border-amber-400/30 text-amber-300 font-bold' 
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <Clock className="w-2.5 h-2.5 text-amber-400" />
              <span>{shift ? `Shift ${shift}` : 'No Shift'}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Close Screen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. MAIN SCREEN CONTENT (COMPACT & SPACE SAVING) */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 space-y-3">
        {/* View when Operation Close is Completed */}
        {closedRecord ? (
          <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
            {/* Compact Success Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-emerald-950/60 to-slate-900 border border-emerald-500/40 text-center space-y-2 shadow-xl shadow-emerald-950/30">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Operation Closed Successfully!
              </h2>
              <p className="text-xs text-emerald-300 font-mono">
                Smog Qty ({closedRecord.smogQty}) synchronized with Dashboard.
              </p>
            </div>

            {/* Closed Info Badges */}
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center font-mono">
              <div className="p-1.5">
                <span className="text-[9px] text-slate-400 block font-bold uppercase">Date</span>
                <span className="text-xs sm:text-sm font-black text-white mt-0.5 block">{closedRecord.date}</span>
              </div>
              <div className="p-1.5 border-x border-slate-800">
                <span className="text-[9px] text-slate-400 block font-bold uppercase">Shift</span>
                <span className="text-xs sm:text-sm font-black text-amber-400 mt-0.5 block">Shift {closedRecord.shift}</span>
              </div>
              <div className="p-1.5">
                <span className="text-[9px] text-slate-400 block font-bold uppercase">Total Qty</span>
                <span className="text-xs sm:text-sm font-black text-purple-400 mt-0.5 block">{closedRecord.smogQty}</span>
              </div>
            </div>

            {/* HSO Models Breakdown in Closed View */}
            {closedRecord.models && closedRecord.models.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-200 font-mono flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>HSO Models ({closedRecord.models.length})</span>
                  </span>
                  <span className="text-xs font-mono font-black text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                    Total: {closedRecord.smogQty}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 font-mono text-xs">
                  {closedRecord.models.map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-950 border border-slate-800/90 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-bold text-[10px]">#{i + 1}</span>
                        <span className="text-cyan-300 font-bold">{m.modelName}</span>
                      </div>
                      <span className="text-amber-400 font-black px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-xs">
                        {m.qty} Qty
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons: WhatsApp & Return */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
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
                className="py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-400 to-green-500 hover:from-emerald-300 hover:to-green-400 active:scale-[0.98] transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 sm:col-span-2"
              >
                <Share2 className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Share WhatsApp Report</span>
              </button>

              <button
                type="button"
                onClick={() => setClosedRecord(null)}
                className="py-2.5 px-3 rounded-xl font-bold text-xs text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-950/70 transition-all cursor-pointer border border-purple-800/40 flex items-center justify-center gap-1"
                title="Edit or Re-open"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Edit / Re-open</span>
              </button>
            </div>
          </div>
        ) : (
          /* Normal Form Screen: SMART & HIGH-DENSITY COMPACT LAYOUT */
          <form onSubmit={handleOperationClose} className="space-y-3">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2 shadow-sm">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span className="flex-1">{error}</span>
                <button 
                  type="button" 
                  onClick={() => setError(null)}
                  className="text-slate-400 hover:text-white p-0.5 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* UNIFIED COMPACT CONTROL PANEL (Date + Shift + Camera Scan in ONE sleek card) */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-2.5">
              {/* Row 1: Date and Shift side-by-side in high density */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                {/* Production Date Input */}
                <div className="sm:col-span-6 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between leading-none mb-1">
                      <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">Production Date</span>
                      <button
                        type="button"
                        onClick={() => handleDateOrShiftChange(today, shift)}
                        className="text-[9px] text-cyan-400 hover:underline font-mono font-bold cursor-pointer"
                      >
                        Today
                      </button>
                    </div>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => handleDateOrShiftChange(e.target.value, shift)}
                      className="w-full bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer"
                      required
                    />
                  </div>
                </div>

                {/* Shift Segmented Toggle */}
                <div className="sm:col-span-6 bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDateOrShiftChange(date, 'A')}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      shift === 'A'
                        ? 'bg-cyan-500 text-slate-950 shadow-sm font-black'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${shift === 'A' ? 'bg-slate-950' : 'bg-cyan-400'}`} />
                    <span>Shift A</span>
                    <span className={`text-[10px] font-mono ${shift === 'A' ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                      (Day)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDateOrShiftChange(date, 'B')}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      shift === 'B'
                        ? 'bg-amber-400 text-slate-950 shadow-sm font-black'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${shift === 'B' ? 'bg-slate-950' : 'bg-amber-400'}`} />
                    <span>Shift B</span>
                    <span className={`text-[10px] font-mono ${shift === 'B' ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                      (Night)
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Camera Trigger & Actions Toolbar */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                {/* Left: Lock / Unlock status indicator */}
                <div className="flex items-center gap-1.5">
                  {isCameraEnabled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                      <Unlock className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Camera Unlocked</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-semibold">
                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                      <span>Select Date & Shift to Unlock Camera</span>
                    </span>
                  )}
                </div>

                {/* Right: Quick Action Buttons */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                  {/* Camera Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isCameraEnabled) return;
                      cameraInputRef.current?.click();
                    }}
                    disabled={!isCameraEnabled || isScanning}
                    className={`flex-1 sm:flex-none py-1.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                      isCameraEnabled && !isScanning
                        ? 'bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 cursor-pointer active:scale-95 shadow-cyan-950/40'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                    }`}
                    title={isCameraEnabled ? "Click Photo with Camera" : "Select Production Date & Shift first"}
                  >
                    <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Click Photo</span>
                  </button>

                  {/* Upload File Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isCameraEnabled) return;
                      fileInputRef.current?.click();
                    }}
                    disabled={!isCameraEnabled || isScanning}
                    className={`p-1.5 rounded-xl border text-xs flex items-center justify-center transition-all ${
                      isCameraEnabled && !isScanning
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700 cursor-pointer active:scale-95'
                        : 'bg-slate-850 text-slate-600 border-slate-800 cursor-not-allowed opacity-60'
                    }`}
                    title="Upload image from file/gallery"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                  </button>

                  {/* Add Model Quick Button */}
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="py-1.5 px-2.5 rounded-xl text-xs font-mono font-bold text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/40 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                    title="Add manual HSO model row"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                    <span>Add Model</span>
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
                disabled={!isCameraEnabled || isScanning}
                onChange={handleFileChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!isCameraEnabled || isScanning}
                onChange={handleFileChange}
              />

              {/* Scanning Active State */}
              {isScanning && (
                <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/50 flex items-center gap-2.5 animate-pulse">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                  <span className="text-xs text-cyan-200 font-mono font-bold">
                    Analyzing photo with Gemini AI... Models extracted, photo deleted immediately.
                  </span>
                </div>
              )}

              {/* Scan Success Message (Confirms extraction and automatic deletion of photo) */}
              {scanSuccessMessage && !isScanning && (
                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-between gap-2 text-emerald-300 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold">{scanSuccessMessage}</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setScanSuccessMessage(null)}
                    className="text-slate-400 hover:text-white p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* EXTRACTED HSO MODELS & QUANTITIES TABLE (HIGH DENSITY & DIRECTLY VISIBLE) */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <h2 className="text-xs sm:text-sm font-extrabold text-white">
                    HSO Models & Quantities
                  </h2>
                  {hsoModels.length > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-mono font-extrabold border border-purple-500/30">
                      {hsoModels.length} {hsoModels.length === 1 ? 'Model' : 'Models'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {totalSmogQty > 0 && (
                    <span className="text-xs font-mono font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/30">
                      Total: {totalSmogQty}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 hover:bg-cyan-950 border border-cyan-800/50 px-2 py-1 rounded-lg transition-all cursor-pointer"
                    title="Add Model row"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Models List Table */}
              {hsoModels.length > 0 ? (
                <div className="space-y-1.5 border border-slate-800/80 rounded-xl p-2 bg-slate-950/70">
                  <div className="grid grid-cols-12 gap-1.5 px-2 py-1 text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    <span className="col-span-1 text-center">#</span>
                    <span className="col-span-7">HSO Model Name</span>
                    <span className="col-span-3 text-right">Quantity</span>
                    <span className="col-span-1 text-center">Del</span>
                  </div>

                  {hsoModels.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-1.5 items-center p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
                    >
                      <span className="col-span-1 text-[11px] font-mono font-bold text-slate-500 text-center">
                        {index + 1}
                      </span>
                      
                      <div className="col-span-7">
                        <input
                          type="text"
                          value={item.modelName}
                          onChange={(e) => handleModelNameChange(index, e.target.value)}
                          placeholder="HSO17-3NB-I:AC"
                          className="w-full bg-slate-950 px-2 py-1 text-xs font-mono font-bold text-cyan-300 rounded border border-slate-800 focus:border-cyan-400 focus:outline-none uppercase"
                          required
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleModelQtyChange(index, e.target.value)}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-800 focus:border-amber-400 rounded text-xs font-mono font-black text-amber-300 text-right focus:outline-none"
                          required
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(index)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 transition-colors cursor-pointer"
                          title="Remove this HSO model"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Calculated Total Smog Qty Strip */}
                  <div className="flex items-center justify-between p-2 px-3 rounded-lg bg-purple-950/50 border border-purple-800/60 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs font-bold text-slate-200">
                        Total Smog Qty:
                      </span>
                    </div>
                    <span className="text-sm font-black text-purple-300 bg-purple-500/20 px-2.5 py-0.5 rounded-lg border border-purple-500/40">
                      {totalSmogQty}
                    </span>
                  </div>
                </div>
              ) : (
                /* Empty state when no models loaded */
                <div className="p-4 rounded-xl bg-slate-950/80 border border-dashed border-slate-800 text-center space-y-1.5">
                  <p className="text-xs font-mono font-bold text-slate-300">
                    No HSO Models Added Yet
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                    Click <span className="text-cyan-400 font-bold">"Click Photo"</span> to auto-scan Excel list, or click <span className="text-purple-300 font-bold">"Add Model"</span> to enter manually.
                  </p>
                </div>
              )}
            </div>

            {/* REMARKS / NOTES (COMPACT) */}
            <div className="p-2.5 px-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider shrink-0">Notes:</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional operational remarks..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-600 focus:outline-none font-mono py-0.5"
              />
            </div>

            {/* OPERATION CLOSE ACTION BUTTON */}
            <div className="pt-1 space-y-1.5">
              <button
                type="submit"
                disabled={isSubmitting || isScanning || hsoModels.length === 0}
                className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider text-slate-950 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 hover:from-purple-300 hover:to-cyan-300 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving & Closing Operation...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                    <span>Operation Close (Upload {totalSmogQty} Qty)</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-center text-slate-500 font-mono">
                Clicking uploads data to Dashboard and enables WhatsApp sharing.
              </p>
            </div>
          </form>
        )}
      </main>
    </div>
  );
};

// Also export as SmogQtyFormScreen for semantic clarity
export const SmogQtyFormScreen = SmogQtyFormModal;

