import React, { useState, useRef, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Check, 
  Sparkles,
  X
} from 'lucide-react';
import { LeakUnitRecord } from './SmogModule';

interface SmogUniqueCalendarProps {
  selectedDate: string; // 'YYYY-MM-DD' or '' for all
  onSelectDate: (date: string) => void;
  records: LeakUnitRecord[];
}

export const SmogUniqueCalendar: React.FC<SmogUniqueCalendarProps> = ({
  selectedDate,
  onSelectDate,
  records
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize viewing month/year based on selectedDate or current date
  const initialDate = selectedDate ? new Date(selectedDate) : new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0-11

  // Update viewing month if selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      const d = new Date(selectedDate);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [selectedDate]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Dates with activity count map
  const recordCountMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach(r => {
      const d = r.date || r.smogDate || (r.createdAt ? r.createdAt.split('T')[0] : '');
      if (d) {
        map[d] = (map[d] || 0) + (r.suspectCount || 1);
      }
    });
    return map;
  }, [records]);

  // Helper date formatters
  const todayISO = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayISO = yesterdayDate.toISOString().split('T')[0];

  const formatDisplayDate = (iso: string) => {
    if (!iso) return 'All Dates (Full Data)';
    if (iso === todayISO) return 'Today, ' + formatDateLabel(iso);
    if (iso === yesterdayISO) return 'Yesterday, ' + formatDateLabel(iso);
    return formatDateLabel(iso);
  };

  const formatDateLabel = (iso: string) => {
    try {
      const [y, m, d] = iso.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  // Day navigation (+1 / -1)
  const handleStepDay = (step: number) => {
    let baseDate: Date;
    if (selectedDate) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      baseDate = new Date(y, m - 1, d);
    } else {
      baseDate = new Date();
    }
    baseDate.setDate(baseDate.getDate() + step);
    const y = baseDate.getFullYear();
    const m = String(baseDate.getMonth() + 1).padStart(2, '0');
    const d = String(baseDate.getDate()).padStart(2, '0');
    onSelectDate(`${y}-${m}-${d}`);
  };

  // Calendar Grid Generation
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    onSelectDate(`${viewYear}-${mStr}-${dStr}`);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* UNIQUE CALENDAR TRIGGER BAR */}
      <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 hover:border-cyan-500/60 rounded-xl p-1 shadow-inner transition-all">
        
        {/* Quick Prev Day Arrow */}
        <button
          type="button"
          onClick={() => handleStepDay(-1)}
          className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Previous Day"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Main Display Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
            selectedDate 
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm shadow-cyan-950' 
              : 'text-slate-300 hover:bg-slate-900'
          }`}
          title="Click to open Unique Calendar Picker"
        >
          <div className="relative">
            <CalendarIcon className={`w-3.5 h-3.5 ${selectedDate ? 'text-cyan-400' : 'text-slate-400'}`} />
            {selectedDate && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
            )}
          </div>
          <span className="truncate max-w-[150px] sm:max-w-[200px]">
            {formatDisplayDate(selectedDate)}
          </span>
        </button>

        {/* Quick Next Day Arrow */}
        <button
          type="button"
          onClick={() => handleStepDay(1)}
          className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Next Day"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Quick Action Pills: Today / All */}
        <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-slate-800">
          <button
            type="button"
            onClick={() => onSelectDate(todayISO)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
              selectedDate === todayISO 
                ? 'bg-emerald-500 text-slate-950 font-black' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Jump to Today"
          >
            Today
          </button>

          {selectedDate && (
            <button
              type="button"
              onClick={() => onSelectDate('')}
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              title="Clear Filter (Show All Records)"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* UNIQUE CALENDAR POPUP MODAL / DROPDOWN */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-72 sm:w-80 bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header: Month & Year Navigator */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 font-extrabold text-sm text-white tracking-wide">
              <span>{monthNames[viewMonth]}</span>
              <span className="text-cyan-400 font-mono">{viewYear}</span>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Presets Bar */}
          <div className="flex items-center justify-between gap-1.5 py-2.5 border-b border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                onSelectDate(todayISO);
                setIsOpen(false);
              }}
              className="flex-1 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 text-[10px] font-mono font-bold text-cyan-300 text-center transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectDate(yesterdayISO);
                setIsOpen(false);
              }}
              className="flex-1 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 text-[10px] font-mono font-bold text-amber-300 text-center transition-colors cursor-pointer"
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectDate('');
                setIsOpen(false);
              }}
              className="flex-1 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-[10px] font-mono font-bold text-slate-400 text-center transition-colors cursor-pointer"
            >
              All Dates
            </button>
          </div>

          {/* Weekday Labels (Su, Mo, Tu, We, Th, Fr, Sa) */}
          <div className="grid grid-cols-7 gap-1 pt-3 pb-1 text-center text-[10px] font-mono font-black text-slate-500 uppercase tracking-wider">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty prefix cells before 1st day of month */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}

            {/* Days of the month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const mStr = String(viewMonth + 1).padStart(2, '0');
              const dStr = String(dayNum).padStart(2, '0');
              const cellISO = `${viewYear}-${mStr}-${dStr}`;

              const isSelected = selectedDate === cellISO;
              const isToday = cellISO === todayISO;
              const recordCount = recordCountMap[cellISO] || 0;

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={`h-8 rounded-xl font-mono text-xs font-bold relative flex flex-col items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-400 text-slate-950 font-black shadow-md shadow-cyan-500/40 scale-105 z-10'
                      : isToday
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 hover:bg-emerald-900'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={`${cellISO}${recordCount ? ` (${recordCount} Suspect Units)` : ''}`}
                >
                  <span>{dayNum}</span>

                  {/* Indicator Dot if records exist on this day */}
                  {recordCount > 0 && (
                    <span 
                      className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${
                        isSelected ? 'bg-slate-950' : 'bg-cyan-400 ring-1 ring-cyan-300 shadow-[0_0_6px_#22d3ee]'
                      }`} 
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Note */}
          <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Days with Smog units</span>
            </span>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
