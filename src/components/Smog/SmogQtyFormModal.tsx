import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileText, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Layers, 
  ArrowRight,
  UploadCloud,
  Share2,
  Sparkles
} from 'lucide-react';
import { saveSmogQtyRecord, SmogQtyRecord } from '../../services/smogQtyStore';

interface SmogQtyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string | null;
  defaultShift?: 'A' | 'B' | 'C' | 'all';
  onSaved?: (record: SmogQtyRecord) => void;
  onOpenWhatsAppShare?: (data: { date: string; shift: 'A' | 'B' | 'C'; smogQty: number }) => void;
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
  const [shift, setShift] = useState<'A' | 'B' | 'C'>('A');
  const [smogQty, setSmogQty] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closedRecord, setClosedRecord] = useState<SmogQtyRecord | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDate(defaultDate || today);
      if (defaultShift && defaultShift !== 'all') {
        setShift(defaultShift);
      } else {
        setShift('A');
      }
      setSmogQty('');
      setNotes('');
      setError(null);
      setClosedRecord(null);
    }
  }, [isOpen, defaultDate, defaultShift, today]);

  if (!isOpen) return null;

  const handleOperationClose = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qtyNumber = Number(smogQty);
    if (!smogQty || isNaN(qtyNumber) || qtyNumber <= 0) {
      setError('Please enter a valid Smog Qty (greater than 0).');
      return;
    }

    if (!date) {
      setError('Please choose a valid Date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = saveSmogQtyRecord({
        date: date.trim(),
        shift,
        smogQty: qtyNumber,
        notes: notes.trim()
      });

      if (onSaved) {
        onSaved(saved);
      }

      // Transition to Operation Closed view with Share WhatsApp button
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
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
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
                {closedRecord ? 'Data uploaded successfully' : 'Upload Smog Qty for selected Date & Shift'}
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
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-extrabold text-white">
                Operation Closed Successfully!
              </h4>
              <p className="text-xs text-emerald-300 font-mono">
                Smog Qty data has been saved and updated across the system.
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
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Smog Qty</span>
                <span className="text-sm font-black text-purple-400 mt-0.5 block">{closedRecord.smogQty}</span>
              </div>
            </div>

            {/* Share WhatsApp Button (As explicitly requested by user) */}
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
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Date Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Target Date</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                required
              />
            </div>

            {/* Shift Choose Options */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Shift Choose Options</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['A', 'B', 'C'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setShift(s)}
                    className={`py-2.5 px-3 rounded-xl font-mono text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                      shift === s
                        ? s === 'A'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-950/50'
                          : s === 'B'
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-950/50'
                          : 'bg-indigo-400 text-slate-950 border-indigo-300 shadow-md shadow-indigo-950/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${
                      shift === s ? 'bg-slate-950' : s === 'A' ? 'bg-cyan-400' : s === 'B' ? 'bg-amber-400' : 'bg-indigo-400'
                    }`} />
                    <span>Shift {s}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Smog Qty Text Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-purple-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Smog Qty (Number) *</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={smogQty}
                onChange={(e) => setSmogQty(e.target.value)}
                placeholder="Enter Smog Qty (e.g. 50, 100)"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-purple-400 rounded-xl text-sm font-mono font-bold text-white placeholder:text-slate-600 focus:outline-none"
                autoFocus
                required
              />
              <p className="text-[10px] font-mono text-slate-500">
                This quantity will be uploaded and reflected in the Smog Qty Cardview for {date}.
              </p>
            </div>

            {/* Optional Note / Remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-semibold text-slate-400">
                Remarks / Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Day shift batch target"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Operation Close Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 hover:from-purple-300 hover:to-cyan-300 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2"
              >
                <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                <span>Operation Close</span>
              </button>
              <p className="text-[10px] text-center text-slate-500 mt-2 font-mono">
                Clicking "Operation Close" uploads this data and unlocks the Share WhatsApp Report.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
