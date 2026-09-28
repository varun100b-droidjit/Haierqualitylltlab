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
  AlertCircle,
  Check,
  Lock,
  Unlock,
  RefreshCw,
  PlusCircle,
  CornerDownLeft,
  Scan
} from 'lucide-react';
import { 
  saveSmogQtyRecord, 
  getSmogQtyRecords, 
  SmogQtyRecord 
} from '../../services/smogQtyStore';
import { compressImage, extractHsoModelsClientSide } from '../../utils/imageOcr';

interface SmogQtyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string | null;
  defaultShift?: 'A' | 'B' | 'all';
  onSaved?: (record: SmogQtyRecord) => void;
  onOpenWhatsAppShare?: (data: { 
    date: string; 
    shift: 'A' | 'B'; 
    smogQty: number;
    prQty?: number;
    pendingQty?: number;
  }) => void;
  onOpenScanner?: () => void;
}

export interface LocalHsoModel {
  id: string;
  modelName: string;
  prQty: number;      // Pr. Qty (photo se lega)
  smogQty: number;    // Smog Qty (PopUp se add hoga)
  pendingQty: number; // Pending Qty: Pr. Qty - Smog Qty
}

export const SmogQtyFormModal: React.FC<SmogQtyFormModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  defaultShift,
  onSaved,
  onOpenWhatsAppShare,
  onOpenScanner
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState<string>(defaultDate || today);
  const [shift, setShift] = useState<'A' | 'B' | ''>(
    (defaultShift && (defaultShift === 'A' || defaultShift === 'B')) ? defaultShift : 'A'
  );
  const [notes, setNotes] = useState<string>('');
  const [hsoModels, setHsoModels] = useState<LocalHsoModel[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState<string>('Analyzing photo with AI...');
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closedRecord, setClosedRecord] = useState<SmogQtyRecord | null>(null);

  // PopUp State for Model Qty Addition (Per User Request)
  const [isQtyPopUpOpen, setIsQtyPopUpOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [enteredQty, setEnteredQty] = useState<string>('');
  const [popUpError, setPopUpError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popUpInputRef = useRef<HTMLInputElement>(null);

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
      setIsQtyPopUpOpen(false);
      setSelectedModelId(null);
      setEnteredQty('');
      setActionNotice(null);

      // Check if there is already an existing record for this date & shift
      const allRecords = getSmogQtyRecords();
      const existing = allRecords.find(r => r.date === initialDate && r.shift === initialShift);
      if (existing && existing.models && existing.models.length > 0) {
        setHsoModels(
          existing.models.map((m, idx) => {
            const pr = Number(m.prQty ?? m.qty) || 0;
            const smog = Number(m.smogQty ?? (m.prQty ? m.qty : 0)) || 0;
            const pending = m.pendingQty !== undefined ? Number(m.pendingQty) : Math.max(0, pr - smog);
            return {
              id: `hso-${idx}-${Date.now()}`,
              modelName: m.modelName,
              prQty: pr,
              smogQty: smog,
              pendingQty: pending
            };
          })
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
    setIsQtyPopUpOpen(false);

    if (newDate && (newShift === 'A' || newShift === 'B')) {
      const allRecords = getSmogQtyRecords();
      const existing = allRecords.find(r => r.date === newDate && r.shift === newShift);
      if (existing && existing.models && existing.models.length > 0) {
        setHsoModels(
          existing.models.map((m, idx) => {
            const pr = Number(m.prQty ?? m.qty) || 0;
            const smog = Number(m.smogQty ?? (m.prQty ? m.qty : 0)) || 0;
            const pending = m.pendingQty !== undefined ? Number(m.pendingQty) : Math.max(0, pr - smog);
            return {
              id: `hso-${idx}-${Date.now()}`,
              modelName: m.modelName,
              prQty: pr,
              smogQty: smog,
              pendingQty: pending
            };
          })
        );
        if (existing.notes) setNotes(existing.notes);
      }
    }
  };

  // Focus popup input when popup opens
  useEffect(() => {
    if (isQtyPopUpOpen) {
      setTimeout(() => {
        popUpInputRef.current?.focus();
      }, 80);
    }
  }, [isQtyPopUpOpen]);

  if (!isOpen) return null;

  // Auto-calculated Totals
  const totalPrQty = hsoModels.reduce((sum, item) => sum + (Number(item.prQty) || 0), 0);
  const totalSmogQty = hsoModels.reduce((sum, item) => sum + (Number(item.smogQty) || 0), 0);
  const totalPendingQty = Math.max(0, totalPrQty - totalSmogQty);

  // Active selected model for popup
  const activeModel = hsoModels.find(m => m.id === selectedModelId) || null;

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
    setIsScanning(true);
    setScanStatusText('Optimizing photo for reading...');

    try {
      // Step 1: Compress high-res camera photo (e.g., from 15MB down to ~250KB)
      // This prevents 413 Payload Too Large and network timeouts on mobile
      const compressed = await compressImage(file, 1600, 1600, 0.85);

      // Clear file input immediately
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';

      let items: Array<{ modelName: string; qty: number }> = [];
      let extractionSource = 'AI Vision';

      // Step 2: Attempt Server/API Extraction (Gemini AI Vision)
      try {
        setScanStatusText('Scanning photo with AI vision model...');
        const response = await fetch('/api/smog/extract-hso-models', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            imageBase64: compressed.dataUrl,
            mimeType: compressed.mimeType
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.items) && data.items.length > 0) {
            items = data.items;
            extractionSource = 'AI Cloud Vision';
          } else if (data.useClientFallback) {
            console.log('Server indicated client fallback:', data.note || data.error);
          }
        } else {
          console.warn(`Server returned ${response.status}, falling back to on-device scan.`);
        }
      } catch (serverErr) {
        console.warn('Server OCR route unreachable or offline. Falling back to device OCR:', serverErr);
      }

      // Step 3: On-Device Smart OCR Fallback (Tesseract.js directly in browser)
      // If server is offline, static hosted (e.g. Vercel), or server API returned empty
      if (items.length === 0) {
        setScanStatusText('Analyzing photo directly on device...');
        try {
          const clientItems = await extractHsoModelsClientSide(compressed.dataUrl, (prog) => {
            setScanStatusText(prog);
          });

          if (clientItems && clientItems.length > 0) {
            items = clientItems;
            extractionSource = 'On-Device Smart OCR';
          }
        } catch (clientOcrErr) {
          console.error('On-device OCR note:', clientOcrErr);
        }
      }

      // Step 4: Populate extracted models
      if (items.length > 0) {
        const existingSmogMap = new Map<string, number>();
        hsoModels.forEach(m => {
          existingSmogMap.set(m.modelName.trim().toUpperCase(), m.smogQty);
        });

        const formatted: LocalHsoModel[] = items.map((it, idx) => {
          const rawPr = Number(it.qty) || 0;
          const modelKey = it.modelName.trim().toUpperCase();
          const prevSmog = existingSmogMap.get(modelKey) || 0;
          const pending = Math.max(0, rawPr - prevSmog);

          return {
            id: `hso-${Date.now()}-${idx}`,
            modelName: modelKey,
            prQty: rawPr,       // Pr. Qty from photo
            smogQty: prevSmog,  // Smog Qty
            pendingQty: pending // Pr. Qty - Smog Qty
          };
        });

        const totalPr = formatted.reduce((sum, m) => sum + m.prQty, 0);
        setHsoModels(formatted);
        setScanSuccessMessage(
          `Extracted ${formatted.length} Models from photo [${extractionSource}] (Total Pr. Qty: ${totalPr}). Tap any model name to add Smog Qty.`
        );
      } else {
        setError(
          'No models starting with "HSO" found in this photo. Please ensure the list is clearly visible, or tap "+ Add Model" below to add manually.'
        );
      }
    } catch (err: any) {
      console.error('Error during photo scan:', err);
      setError('Unable to read photo. Please ensure the photo is clear, or add models manually below.');
    } finally {
      setIsScanning(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Add a manual HSO row
  const handleAddManualRow = () => {
    const nextIdx = hsoModels.length + 1;
    const newRow: LocalHsoModel = {
      id: `hso-manual-${Date.now()}-${nextIdx}`,
      modelName: `HSO${nextIdx > 9 ? nextIdx : '0' + nextIdx}-3NB-I:AC`,
      prQty: 100,
      smogQty: 0,
      pendingQty: 100
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

  // Edit Pr. Qty directly in table
  const handleModelPrQtyChange = (index: number, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setHsoModels(prev => {
      const updated = [...prev];
      const cur = updated[index];
      const newPending = Math.max(0, num - cur.smogQty);
      updated[index] = { ...cur, prQty: num, pendingQty: newPending };
      return updated;
    });
  };

  // Remove a row
  const handleRemoveRow = (id: string) => {
    setHsoModels(prev => prev.filter(m => m.id !== id));
    if (selectedModelId === id) {
      setIsQtyPopUpOpen(false);
      setSelectedModelId(null);
    }
  };

  // Open PopUp when tapping the circled Model Name
  // "aur jaha circle mark kiya hun waha tab krne per PopUp open hoga Qty add krne ke liye"
  const handleOpenQtyPopUp = (model: LocalHsoModel) => {
    setSelectedModelId(model.id);
    setEnteredQty('');
    setPopUpError(null);
    setIsQtyPopUpOpen(true);
  };

  // Submit Qty from PopUp
  const handleSubmitPopUpQty = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeModel) return;

    const val = parseInt(enteredQty.trim(), 10);
    if (isNaN(val) || val <= 0) {
      setPopUpError('Please enter a valid quantity greater than 0.');
      return;
    }

    setHsoModels(prev => prev.map(m => {
      if (m.id === activeModel.id) {
        const nextSmog = m.smogQty + val;
        const nextPending = Math.max(0, m.prQty - nextSmog);
        return {
          ...m,
          smogQty: nextSmog,
          pendingQty: nextPending
        };
      }
      return m;
    }));

    const nextSmog = activeModel.smogQty + val;
    const nextPending = Math.max(0, activeModel.prQty - nextSmog);

    setActionNotice(`Added ${val} to ${activeModel.modelName} (Smog: ${nextSmog} | Pending: ${nextPending})`);
    setIsQtyPopUpOpen(false);
    setSelectedModelId(null);
    setEnteredQty('');

    setTimeout(() => {
      setActionNotice(null);
    }, 4000);
  };

  // Quick Addition helper for popup
  const handleQuickAdd = (amount: number) => {
    const cur = parseInt(enteredQty, 10) || 0;
    setEnteredQty(String(cur + amount));
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
      setError(`Model "${invalidModel.modelName}" does not start with "HSO". All models must start with HSO.`);
      return;
    }

    if (totalPrQty <= 0 && totalSmogQty <= 0) {
      setError('Pr. Qty or Smog Qty must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formattedModels = hsoModels.map(m => ({
        modelName: m.modelName.trim().toUpperCase(),
        qty: m.smogQty, // fallback
        prQty: m.prQty,
        smogQty: m.smogQty,
        pendingQty: m.pendingQty
      }));

      const record = saveSmogQtyRecord({
        date,
        shift: shift as 'A' | 'B',
        smogQty: totalSmogQty,
        prQty: totalPrQty,
        pendingQty: totalPendingQty,
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
      {/* 1. TOP COMPACT HEADER (Clean website dark slate style) */}
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
                : 'bg-slate-800 border-slate-700 text-cyan-400'
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

        {/* Right: Close Button (Status badges hidden per user mark) */}
        <div className="flex items-center gap-2">
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

      {/* 2. MAIN SCREEN CONTENT */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 space-y-3 pb-8">
        {/* View when Operation Close is Completed */}
        {closedRecord ? (
          <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
            {/* Compact Success Banner */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/40 text-center space-y-2 shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Operation Closed Successfully!
              </h2>
              <p className="text-xs text-emerald-400 font-mono">
                Smog Qty ({closedRecord.smogQty}) synchronized with Dashboard.
              </p>
            </div>

            {/* Closed Info Badges: Pr. Qty, Smog Qty, Pending Qty */}
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center font-mono">
              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Pr. Qty</span>
                <span className="text-base sm:text-lg font-black text-white mt-0.5 block">{closedRecord.prQty ?? closedRecord.smogQty}</span>
              </div>
              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Smog Qty</span>
                <span className="text-base sm:text-lg font-black text-cyan-400 mt-0.5 block">{closedRecord.smogQty}</span>
              </div>
              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Pending Qty</span>
                <span className="text-base sm:text-lg font-black text-amber-400 mt-0.5 block">{closedRecord.pendingQty ?? 0}</span>
              </div>
            </div>

            {/* Models Breakdown */}
            {closedRecord.models && closedRecord.models.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-200 font-mono flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Models Breakdown ({closedRecord.models.length})</span>
                  </span>
                  <span className="text-xs font-mono font-black text-cyan-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    Smog Qty: {closedRecord.smogQty}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 font-mono text-xs">
                  {closedRecord.models.map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-bold text-[10px]">#{i + 1}</span>
                        <span className="text-slate-200 font-bold">{m.modelName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          Pr: {m.prQty ?? m.qty}
                        </span>
                        <span className="text-cyan-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          Smog: {m.smogQty ?? m.qty}
                        </span>
                        <span className="text-amber-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          Pending: {m.pendingQty ?? 0}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenWhatsAppShare) {
                    onOpenWhatsAppShare({
                      date: closedRecord.date,
                      shift: closedRecord.shift,
                      smogQty: closedRecord.smogQty,
                      prQty: closedRecord.prQty,
                      pendingQty: closedRecord.pendingQty
                    });
                  }
                }}
                className="py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-950 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 sm:col-span-2"
              >
                <Share2 className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Share WhatsApp Report</span>
              </button>

              <button
                type="button"
                onClick={() => setClosedRecord(null)}
                className="py-2.5 px-3 rounded-xl font-bold text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer border border-slate-700 flex items-center justify-center gap-1"
                title="Edit or Re-open"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Edit / Re-open</span>
              </button>
            </div>
          </div>
        ) : (
          /* Normal Form Screen */
          <form onSubmit={handleOperationClose} className="space-y-3">
            {error && (
              <div className="p-3 rounded-xl bg-slate-900 border border-rose-500/50 text-rose-300 text-xs font-medium flex items-center gap-2 shadow-sm animate-in fade-in">
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

            {/* UNIFIED CONTROL PANEL (Date + Shift + Camera Scan in Website Theme) */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-2.5">
              {/* Row 1: Date and Shift side-by-side */}
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
                    className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      shift === 'A'
                        ? 'bg-cyan-500 text-slate-950 font-extrabold shadow-sm'
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
                    className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      shift === 'B'
                        ? 'bg-cyan-500 text-slate-950 font-extrabold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${shift === 'B' ? 'bg-slate-950' : 'bg-cyan-400'}`} />
                    <span>Shift B</span>
                    <span className={`text-[10px] font-mono ${shift === 'B' ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                      (Night)
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Camera Trigger & Actions Toolbar */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                {/* Left: Lock / Unlock status indicator */}
                <div className="flex items-center gap-1.5">
                  {isCameraEnabled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-emerald-400 text-[10px] font-mono font-medium">
                      <Unlock className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Camera Ready: Click photo to load Pr. Qty</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-amber-400 text-[10px] font-mono font-medium">
                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                      <span>Select Date & Shift to Unlock Camera</span>
                    </span>
                  )}
                </div>

                {/* Right: Action Buttons in Clean Website Dark Slate Style */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                  {/* Camera Button (Clean Cyan / Slate - No rainbow gradient) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isCameraEnabled) return;
                      cameraInputRef.current?.click();
                    }}
                    disabled={!isCameraEnabled || isScanning}
                    className={`flex-1 sm:flex-none py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                      isCameraEnabled && !isScanning
                        ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 cursor-pointer active:scale-95'
                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                    }`}
                    title={isCameraEnabled ? "Click Photo to Auto-Scan Pr. Qty" : "Select Production Date & Shift first"}
                  >
                    <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Click Photo (Pr. Qty)</span>
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

                  {/* Leak Scanner Button (Replaced Add Model as requested) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenScanner) {
                        onOpenScanner();
                      }
                    }}
                    className="py-1.5 px-3 rounded-xl text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                    title="Open Leak Scanner"
                  >
                    <Scan className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Leak Scanner</span>
                  </button>
                </div>
              </div>

              {/* Hidden file inputs */}
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
                <div className="p-2.5 rounded-xl bg-slate-950 border border-cyan-500/40 flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                  <span className="text-xs text-cyan-300 font-mono font-medium">
                    {scanStatusText || 'Analyzing photo with AI... Extracting Pr. Qty, photo will auto-delete.'}
                  </span>
                </div>
              )}

              {/* Scan Success Message */}
              {scanSuccessMessage && !isScanning && (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-slate-300 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{scanSuccessMessage}</span>
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

            {/* THREE TOTAL SUMMARY CARDS (Website dark slate theme - No rainbow circus) */}
            <div className="grid grid-cols-3 gap-2">
              {/* Pr. Qty */}
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center font-mono shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Pr. Qty
                </span>
                <span className="text-xl sm:text-2xl font-black text-white mt-0.5 block">
                  {totalPrQty}
                </span>
                <span className="text-[9px] text-slate-500 block">From Photo</span>
              </div>

              {/* Smog Qty */}
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center font-mono shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Smog Qty
                </span>
                <span className="text-xl sm:text-2xl font-black text-cyan-400 mt-0.5 block">
                  {totalSmogQty}
                </span>
                <span className="text-[9px] text-slate-500 block">Tested / Passed</span>
              </div>

              {/* Pending Qty */}
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center font-mono shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Pending Qty
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5 block">
                  {totalPendingQty}
                </span>
                <span className="text-[9px] text-slate-500 block">Pr - Smog</span>
              </div>
            </div>

            {/* ACTION NOTICE TOAST */}
            {actionNotice && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between gap-2 text-slate-200 text-xs font-mono animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{actionNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionNotice(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* EXTRACTED HSO MODELS & QUANTITIES TABLE */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-extrabold text-white">
                    HSO Models List
                  </h2>
                  {hsoModels.length > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-mono font-bold border border-slate-700">
                      {hsoModels.length} {hsoModels.length === 1 ? 'Model' : 'Models'}
                    </span>
                  )}
                </div>
              </div>

              {/* Models List Table */}
              {hsoModels.length > 0 ? (
                <div className="space-y-1.5 border border-slate-800 rounded-xl p-2 bg-slate-950">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-1.5 px-2 py-1 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                    <span className="col-span-1 text-center">#</span>
                    <span className="col-span-4">Model Name</span>
                    <span className="col-span-2 text-right">Pr. Qty</span>
                    <span className="col-span-2 text-right">Smog Qty</span>
                    <span className="col-span-2 text-right text-amber-400">Pending Qty</span>
                    <span className="col-span-1 text-center">Del</span>
                  </div>

                  {/* Rows */}
                  {hsoModels.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-1.5 items-center p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
                    >
                      {/* Index */}
                      <div className="col-span-1 text-center">
                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          {index + 1}
                        </span>
                      </div>
                      
                      {/* Model Name: Small text, no plus symbol, tap opens PopUp */}
                      <div className="col-span-4 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleOpenQtyPopUp(item)}
                          className="w-full text-left bg-slate-950 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 px-2 py-1.5 rounded-lg border border-slate-800 hover:border-cyan-500/50 font-mono font-bold text-[10px] sm:text-[11px] leading-tight block transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                          title="Click to open PopUp and add Smog Qty"
                        >
                          <span className="truncate block">{item.modelName}</span>
                        </button>
                      </div>

                      {/* Pr. Qty (Editable input from photo) */}
                      <div className="col-span-2 text-right">
                        <input
                          type="number"
                          min="0"
                          value={item.prQty}
                          onChange={(e) => handleModelPrQtyChange(index, e.target.value)}
                          title="Pr. Qty (from photo)"
                          className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-lg text-xs font-mono font-bold text-white text-right focus:outline-none"
                          required
                        />
                      </div>

                      {/* Smog Qty (Displays current added Smog Qty) */}
                      <div className="col-span-2 text-right">
                        <div 
                          onClick={() => handleOpenQtyPopUp(item)}
                          className="w-full px-1.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono font-black text-cyan-400 text-right cursor-pointer hover:border-slate-700 transition-colors"
                          title="Click to add Smog Qty via PopUp"
                        >
                          {item.smogQty}
                        </div>
                      </div>

                      {/* Pending Qty (Clear, full 2 columns with bold text) */}
                      <div className="col-span-2 text-right">
                        <div className="w-full px-1.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono font-black text-amber-400 text-right">
                          {item.pendingQty}
                        </div>
                      </div>

                      {/* Delete Action */}
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(item.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Remove this model"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Summary Bar */}
                  <div className="flex items-center justify-between p-2 px-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs">
                    <span className="text-slate-400 font-bold">Totals:</span>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold">Pr: {totalPrQty}</span>
                      <span className="text-slate-700">|</span>
                      <span className="text-cyan-400 font-black">Smog: {totalSmogQty}</span>
                      <span className="text-slate-700">|</span>
                      <span className="text-amber-400 font-bold">Pending: {totalPendingQty}</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty state when no models loaded */
                <div className="p-4 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center space-y-1.5">
                  <p className="text-xs font-mono font-bold text-slate-300">
                    No HSO Models Added Yet
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                    Click <span className="text-cyan-400 font-bold">"Click Photo"</span> to auto-scan Pr. Qty from Excel sheet, or click <span className="text-slate-300 font-bold">"Add Model"</span> to add manually.
                  </p>
                </div>
              )}
            </div>

            {/* REMARKS / NOTES */}
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
                className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider text-slate-950 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving & Closing Operation...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                    <span>Operation Close (Upload {totalSmogQty} Smog Qty | {totalPendingQty} Pending)</span>
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

      {/* 3. POPUP MODAL FOR ADDING SMOG QTY (Opened on tapping circled Model Name) */}
      {/* "aur jaha circle mark kiya hun waha tab krne per PopUp open hoga Qty add krne ke liye" */}
      {isQtyPopUpOpen && activeModel && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-4 sm:p-5 shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-150">
            {/* Header: Model Name & Close Button */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                    Add Smog Quantity
                  </h3>
                  <p className="text-sm font-mono font-extrabold text-white truncate">
                    {activeModel.modelName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsQtyPopUpOpen(false);
                  setSelectedModelId(null);
                  setEnteredQty('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close PopUp"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Model Current Metrics Banner */}
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center font-mono">
              <div className="p-1">
                <span className="text-[9px] text-slate-400 block font-bold uppercase">Pr. Qty</span>
                <span className="text-xs sm:text-sm font-bold text-white mt-0.5 block">{activeModel.prQty}</span>
              </div>
              <div className="p-1 border-x border-slate-800">
                <span className="text-[9px] text-slate-400 block font-bold uppercase">Smog Qty</span>
                <span className="text-xs sm:text-sm font-bold text-cyan-400 mt-0.5 block">{activeModel.smogQty}</span>
              </div>
              <div className="p-1">
                <span className="text-[9px] text-slate-400 block font-bold uppercase">Pending</span>
                <span className="text-xs sm:text-sm font-bold text-amber-400 mt-0.5 block">{activeModel.pendingQty}</span>
              </div>
            </div>

            {popUpError && (
              <div className="p-2 rounded-lg bg-slate-950 border border-rose-500/50 text-rose-300 text-xs font-mono flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>{popUpError}</span>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSubmitPopUpQty} className="space-y-3">
              <div>
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Enter Quantity to Add:
                </label>
                <input
                  ref={popUpInputRef}
                  type="number"
                  min="1"
                  placeholder="e.g. 50"
                  value={enteredQty}
                  onChange={(e) => {
                    setEnteredQty(e.target.value);
                    setPopUpError(null);
                  }}
                  className="w-full bg-slate-950 px-3 py-2 text-base font-mono font-bold text-white rounded-xl border border-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                  required
                />
              </div>

              {/* Quick Add Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
                {[10, 20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleQuickAdd(amt)}
                    className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold transition-colors cursor-pointer text-center"
                  >
                    +{amt}
                  </button>
                ))}
                {activeModel.pendingQty > 0 && (
                  <button
                    type="button"
                    onClick={() => setEnteredQty(String(activeModel.pendingQty))}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold transition-colors cursor-pointer shrink-0"
                  >
                    All ({activeModel.pendingQty})
                  </button>
                )}
              </div>

              {/* Action Buttons: Cancel & Submit */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsQtyPopUpOpen(false);
                    setSelectedModelId(null);
                    setEnteredQty('');
                  }}
                  className="py-2.5 px-3 rounded-xl font-mono font-bold text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!enteredQty.trim()}
                  className="py-2.5 px-3 rounded-xl font-mono font-bold text-xs uppercase tracking-wider text-slate-950 bg-cyan-500 hover:bg-cyan-400 transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <span>Submit</span>
                  <CornerDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const SmogQtyFormScreen = SmogQtyFormModal;
