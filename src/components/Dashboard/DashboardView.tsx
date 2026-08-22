import React, { useState, useMemo, useEffect } from 'react';
import { 
  Boxes, 
  Activity, 
  CheckCircle2, 
  RotateCcw, 
  Clock, 
  CheckCheck,
  Plus,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Calendar,
  Cpu,
  Compass,
  Layers,
  Cloud,
  OctagonAlert,
  Flame,
  BarChart2,
  ExternalLink,
  ChevronDown,
  X,
  Check,
  Filter,
  Play,
  PauseCircle,
  Power
} from 'lucide-react';
import { Unit, ActivityLog, LabNotification, ProtoUnit, FieldUnit, PpUnit } from '../../types';
import { getActiveLabShift, LAB_SHIFTS } from '../../services/shiftStore';
import { addShiftActivityLog } from '../../services/unitStore';
import { 
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie,
  Legend,
  CartesianGrid
} from 'recharts';
import { getProtoUnits, subscribeProtoUnitStore } from '../../services/protoUnitStore';
import { getPpUnits, subscribePpUnitStore, calculatePpUnitMetrics } from '../../services/ppUnitStore';
import { getFieldUnits, subscribeFieldUnitStore } from '../../services/fieldUnitStore';
import { getSmogUnits } from '../Smog/SmogModule';
import { extractYearAndMonth } from '../../utils/dateFormatter';
import { calculateRemainingDays, isUnitOverdue } from '../../services/unitStore';

interface DashboardViewProps {
  units: Unit[];
  activityLogs: ActivityLog[];
  notifications?: LabNotification[];
  onNavigateToRDUnits: () => void;
  onNavigateToProtoUnits: () => void;
  onNavigateToPpUnits?: () => void;
  onNavigateToFieldUnits: () => void;
  onNavigateToSmog: () => void;
  onOpenAddUnitModal: () => void;
}

interface CircularProgressRingProps {
  percentage: number;
  colorClass: string;
  strokeColor: string;
  glowColor: string;
  size?: number;
  strokeWidth?: number;
  icon?: React.ElementType;
}

const CircularProgressRing: React.FC<CircularProgressRingProps> = ({
  percentage,
  colorClass,
  strokeColor,
  glowColor,
  size = 42,
  strokeWidth = 3.5,
  icon: Icon
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const validPercentage = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (validPercentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full" viewBox={`0 0 ${size} ${size}`}>
        {/* Background Track Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="text-slate-800"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
        />
        {/* Animated Progress Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={strokeColor}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 5px ${glowColor})`
          }}
        />
      </svg>
      {Icon && (
        <div className={`absolute inset-0 flex items-center justify-center ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  units,
  activityLogs,
  notifications,
  onNavigateToRDUnits,
  onNavigateToProtoUnits,
  onNavigateToPpUnits,
  onNavigateToFieldUnits,
  onNavigateToSmog,
  onOpenAddUnitModal
}) => {
  // Active Section for Section-wise Analysis ('proto' | 'pp' | 'field' | 'rd' | 'smog')
  const [activeSection, setActiveSection] = useState<'proto' | 'pp' | 'field' | 'rd' | 'smog'>('proto');
  // Selected Year & Month Filter for Section Analysis
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);
  // Monthly chart view preferences
  const [chartType, setChartType] = useState<'area' | 'line' | 'bar'>('area');
  const [selectedMetric, setSelectedMetric] = useState<'all' | 'Total' | 'Live' | 'Finished' | 'Stop'>('all');

  // Load section-specific unit collections with live subscriptions
  const [protoUnits, setProtoUnits] = useState<ProtoUnit[]>(() => getProtoUnits());
  const [ppUnits, setPpUnits] = useState<PpUnit[]>(() => getPpUnits());
  const [fieldUnits, setFieldUnits] = useState<FieldUnit[]>(() => getFieldUnits());
  const [smogUnits, setSmogUnits] = useState<any[]>(() => getSmogUnits());

  useEffect(() => {
    const unsubProto = subscribeProtoUnitStore(() => setProtoUnits(getProtoUnits()));
    const unsubPp = subscribePpUnitStore(() => setPpUnits(getPpUnits()));
    const unsubField = subscribeFieldUnitStore(() => setFieldUnits(getFieldUnits()));
    return () => {
      unsubProto();
      unsubPp();
      unsubField();
    };
  }, []);

  // Calculate Overall Dashboard Metrics
  const validUnits = (units || []).filter((u): u is Unit => Boolean(u && typeof u === 'object'));
  const totalUnits = validUnits.length;
  const liveUnits = validUnits.filter(u => u.status === 'transferred' || u.status === 'live').length;
  const receivedUnits = validUnits.filter(u => u.status === 'received').length;
  const reworkUnits = validUnits.filter(u => u.status === 'rework').length;
  const completedUnits = validUnits.filter(u => (u.currentStageIndex ?? 0) >= 9 || u.status === 'completed' || u.status === 'received').length;
  const pendingVerification = validUnits.filter(u => u.status === 'pending_verification' || u.currentStageIndex === 6 || u.currentStageIndex === 7).length;

  // Helper to filter any list of units by Year and/or Month
  const filterListByYearMonth = <T extends Record<string, any>>(
    list: T[],
    dateFields: string[],
    yr: string,
    mo: string
  ): T[] => {
    if (yr === 'All' && mo === 'All') return list;
    return list.filter(item => {
      let dateVal: string | null = null;
      for (const field of dateFields) {
        if (item[field] && typeof item[field] === 'string') {
          dateVal = item[field];
          break;
        }
      }
      const { year, monthShort } = extractYearAndMonth(dateVal);
      if (yr !== 'All' && year !== null && year.toString() !== yr) return false;
      if (mo !== 'All' && monthShort !== null && monthShort !== mo) return false;
      return true;
    });
  };

  // Active Section Analysis Metrics & Monthly Data Generation
  const sectionAnalysis = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (activeSection === 'proto') {
      const filtered = filterListByYearMonth(protoUnits, ['createdAt', 'updatedAt'], selectedYear, selectedMonth);
      const total = filtered.length;
      const live = filtered.filter(u => u.status === 'live').length;
      const finished = filtered.filter(u => u.status === 'finished').length;
      const stop = filtered.filter(u => u.status === 'stopped').length;

      const monthly = months.map(m => {
        const mList = filterListByYearMonth(protoUnits, ['createdAt', 'updatedAt'], selectedYear, m);
        return {
          month: m,
          Total: mList.length,
          Live: mList.filter(u => u.status === 'live').length,
          Finished: mList.filter(u => u.status === 'finished').length,
          Stop: mList.filter(u => u.status === 'stopped').length,
        };
      });

      return {
        id: 'proto',
        title: 'Proto Unit Analysis',
        subtitle: 'Prototype IDU/ODU Testing & Stress Verification Analytics',
        icon: Cpu,
        color: 'text-cyan-400',
        activeBorder: 'border-cyan-400 shadow-cyan-950/80 bg-cyan-950/30',
        activeBadge: 'bg-cyan-950 text-cyan-300 border-cyan-700',
        total,
        stop,
        live,
        finished,
        onNavigate: onNavigateToProtoUnits,
        monthly
      };
    } else if (activeSection === 'pp') {
      const filtered = filterListByYearMonth(ppUnits, ['createdAt', 'updatedAt'], selectedYear, selectedMonth) as PpUnit[];
      const total = filtered.length;
      const live = filtered.filter(u => u.status === 'live').length;
      const finished = filtered.filter(u => u.status === 'finished').length;
      const { bothQty } = calculatePpUnitMetrics(filtered);
      const stop = Math.max(0, bothQty - finished);

      const monthly = months.map(m => {
        const mList = filterListByYearMonth(ppUnits, ['createdAt', 'updatedAt'], selectedYear, m) as PpUnit[];
        const mFinished = mList.filter(u => u.status === 'finished').length;
        const { bothQty: mBoth } = calculatePpUnitMetrics(mList);
        return {
          month: m,
          Total: mList.length,
          Live: mList.filter(u => u.status === 'live').length,
          Finished: mFinished,
          Stop: Math.max(0, mBoth - mFinished),
        };
      });

      return {
        id: 'pp',
        title: 'PP Unit Analysis',
        subtitle: 'Pre-Production Batch Trial & Station Performance Analytics',
        icon: Cpu,
        color: 'text-indigo-400',
        activeBorder: 'border-indigo-400 shadow-indigo-950/80 bg-indigo-950/30',
        activeBadge: 'bg-indigo-950 text-indigo-300 border-indigo-700',
        total,
        stop,
        live,
        finished,
        onNavigate: onNavigateToPpUnits,
        monthly
      };
    } else if (activeSection === 'field') {
      const filtered = filterListByYearMonth(fieldUnits, ['startDateTime', 'createdAt'], selectedYear, selectedMonth);
      const total = filtered.length;
      const live = filtered.filter(u => u.status === 'live').length;
      const finished = filtered.filter(u => u.status === 'finished').length;
      const stop = filtered.filter(u => u.status === 'stopped').length;

      const monthly = months.map(m => {
        const mList = filterListByYearMonth(fieldUnits, ['startDateTime', 'createdAt'], selectedYear, m);
        return {
          month: m,
          Total: mList.length,
          Live: mList.filter(u => u.status === 'live').length,
          Finished: mList.filter(u => u.status === 'finished').length,
          Stop: mList.filter(u => u.status === 'stopped').length,
        };
      });

      return {
        id: 'field',
        title: 'Field Units Analysis',
        subtitle: 'On-Field Site Telemetry & Real-World Operating Tests Analytics',
        icon: Compass,
        color: 'text-emerald-400',
        activeBorder: 'border-emerald-400 shadow-emerald-950/80 bg-emerald-950/30',
        activeBadge: 'bg-emerald-950 text-emerald-300 border-emerald-700',
        total,
        stop,
        live,
        finished,
        onNavigate: onNavigateToFieldUnits,
        monthly
      };
    } else if (activeSection === 'rd') {
      const filtered = filterListByYearMonth(validUnits, ['transferDate', 'createdAt'], selectedYear, selectedMonth) as Unit[];
      const total = filtered.length;
      const stop = filtered.filter(u => isUnitOverdue(u)).length;
      const live = filtered.filter(u => u.status !== 'received' && u.status !== 'completed' && (u.currentStageIndex ?? 0) < 10 && !isUnitOverdue(u)).length;
      const finished = filtered.filter(u => u.status === 'completed' || u.status === 'received' || (u.currentStageIndex ?? 0) >= 10).length;

      const monthly = months.map(m => {
        const mList = filterListByYearMonth(validUnits, ['transferDate', 'createdAt'], selectedYear, m) as Unit[];
        return {
          month: m,
          Total: mList.length,
          Live: mList.filter(u => u.status !== 'received' && u.status !== 'completed' && (u.currentStageIndex ?? 0) < 10 && !isUnitOverdue(u)).length,
          Finished: mList.filter(u => u.status === 'completed' || u.status === 'received' || (u.currentStageIndex ?? 0) >= 10).length,
          Stop: mList.filter(u => isUnitOverdue(u)).length,
        };
      });

      return {
        id: 'rd',
        title: 'R&D Units Analysis',
        subtitle: '10-Stage Lab Handoff Workflow & Quality Audit Analytics',
        icon: Layers,
        color: 'text-blue-400',
        activeBorder: 'border-blue-400 shadow-blue-950/80 bg-blue-950/30',
        activeBadge: 'bg-blue-950 text-blue-300 border-blue-700',
        total,
        stop,
        live,
        finished,
        onNavigate: onNavigateToRDUnits,
        monthly
      };
    } else {
      // Smog Section
      const filtered = filterListByYearMonth(smogUnits, ['date', 'createdAt'], selectedYear, selectedMonth);
      const total = filtered.length;
      const live = filtered.filter(u => u.status === 'normal' && u.smogLevelPpm < 30).length;
      const finished = filtered.filter(u => u.status === 'normal' || u.filterEfficiencyPercent >= 90).length;
      const stop = filtered.filter(u => u.status === 'warning' || u.status === 'hazard').length;

      const monthly = months.map(m => {
        const mList = filterListByYearMonth(smogUnits, ['date', 'createdAt'], selectedYear, m);
        return {
          month: m,
          Total: mList.length,
          Live: mList.filter(u => u.status === 'normal' && u.smogLevelPpm < 30).length,
          Finished: mList.filter(u => u.status === 'normal' || u.filterEfficiencyPercent >= 90).length,
          Stop: mList.filter(u => u.status === 'warning' || u.status === 'hazard').length,
        };
      });

      return {
        id: 'smog',
        title: 'Smog Section Analysis',
        subtitle: 'Smoke Density, Filter Efficiency & Opacity AQI Sensor Analytics',
        icon: Cloud,
        color: 'text-amber-400',
        activeBorder: 'border-amber-400 shadow-amber-950/80 bg-amber-950/30',
        activeBadge: 'bg-amber-950 text-amber-300 border-amber-700',
        total,
        stop,
        live,
        finished,
        onNavigate: onNavigateToSmog,
        monthly
      };
    }
  }, [activeSection, selectedYear, selectedMonth, protoUnits, ppUnits, fieldUnits, smogUnits, validUnits, onNavigateToProtoUnits, onNavigateToPpUnits, onNavigateToFieldUnits, onNavigateToRDUnits, onNavigateToSmog]);

  const ppMetrics = useMemo(() => {
    const filtered = filterListByYearMonth(ppUnits, ['createdAt', 'updatedAt'], selectedYear, selectedMonth) as PpUnit[];
    return calculatePpUnitMetrics(filtered);
  }, [ppUnits, selectedYear, selectedMonth]);

  // Compute month/year-filtered metrics for the 4 dashboard cards
  const displayedMetrics = useMemo(() => {
    return {
      total: sectionAnalysis.total,
      stop: sectionAnalysis.stop,
      live: sectionAnalysis.live,
      finished: sectionAnalysis.finished,
      monthLabel: selectedYear === 'All' && selectedMonth === 'All' 
        ? 'Section Total' 
        : selectedYear !== 'All' && selectedMonth === 'All' 
        ? `Year ${selectedYear} Total`
        : `${selectedMonth} ${selectedYear === 'All' ? '' : selectedYear} Total`
    };
  }, [sectionAnalysis, selectedYear, selectedMonth]);

  // Chart 1: Stage distribution
  const stageCounts = [
    { name: 'BSR In', count: validUnits.filter(u => u.currentStageIndex === 0).length, color: '#0ea5e9' },
    { name: 'ELT Pre', count: validUnits.filter(u => u.currentStageIndex === 1).length, color: '#6366f1' },
    { name: 'R&D Lead', count: validUnits.filter(u => u.currentStageIndex === 2).length, color: '#8b5cf6' },
    { name: 'Area R&D', count: validUnits.filter(u => u.currentStageIndex === 3).length, color: '#ec4899' },
    { name: 'Received', count: validUnits.filter(u => u.currentStageIndex === 4).length, color: '#10b981' },
    { name: 'R&D Test', count: validUnits.filter(u => u.currentStageIndex === 5).length, color: '#f59e0b' },
    { name: 'ELT Post', count: validUnits.filter(u => u.currentStageIndex === 6).length, color: '#3b82f6' },
    { name: 'OQC Insp', count: validUnits.filter(u => u.currentStageIndex === 7).length, color: '#14b8a6' },
    { name: 'BSR Return', count: validUnits.filter(u => u.currentStageIndex === 8).length, color: '#84cc16' },
    { name: 'Final Rec', count: validUnits.filter(u => u.currentStageIndex === 9).length, color: '#06b6d4' },
  ];

  // Chart 2: Status distribution for Donut Chart
  const statusPieData = [
    { name: 'Live', value: liveUnits, color: '#3b82f6' },
    { name: 'Received', value: receivedUnits, color: '#10b981' },
    { name: 'Rework', value: reworkUnits, color: '#f43f5e' },
    { name: 'Pending Verification', value: pendingVerification, color: '#eab308' },
  ].filter(d => d.value > 0);



  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 4 Navigation Section Buttons (Proto Unit, Field Units, R&D Units, Smog) - Horizontal Side Scroll */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 relative">
          <div className="flex items-center gap-3 sm:gap-3.5">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Select Section Analysis
            </h3>

            {/* Calendar Icon Year & Month Filter directly on the right side of Select Section Analysis */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)] text-slate-100 text-xs font-mono font-bold transition-all hover:bg-slate-800 active:scale-95 cursor-pointer group"
              >
                <Calendar className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                <span>
                  {selectedYear === 'All' && selectedMonth === 'All'
                    ? '📅 All Time'
                    : selectedYear !== 'All' && selectedMonth === 'All'
                    ? `📅 Year ${selectedYear}`
                    : selectedYear === 'All' && selectedMonth !== 'All'
                    ? `📅 ${selectedMonth} (All Yrs)`
                    : `📅 ${selectedMonth} ${selectedYear}`}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-cyan-400 transition-transform duration-200 ${isMonthPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* High Quality Year & Month Selection Popup UI */}
              {isMonthPickerOpen && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" 
                    onClick={() => setIsMonthPickerOpen(false)} 
                  />

                  {/* Dropdown Card */}
                  <div className="absolute left-0 top-full mt-2 z-50 w-80 p-4 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-cyan-500/40 shadow-[0_10px_35px_rgba(0,0,0,0.9),0_0_20px_rgba(6,182,212,0.2)] animate-in fade-in zoom-in-95 duration-150 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <span className="text-xs font-mono font-extrabold uppercase text-cyan-300">
                          Select Year & Month
                        </span>
                      </div>
                      <button
                        onClick={() => setIsMonthPickerOpen(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        aria-label="Close Selector"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Section 1: Year Selector */}
                    <div>
                      <div className="text-[10px] font-mono text-cyan-400 font-bold mb-1.5 uppercase tracking-wider flex items-center justify-between">
                        <span>1. Filter By Year</span>
                        {selectedYear !== 'All' && <span className="text-[9px] text-cyan-300">Active: {selectedYear}</span>}
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {['All', '2026', '2025', '2024'].map(yr => (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => setSelectedYear(yr)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                              selectedYear === yr
                                ? 'bg-cyan-500 text-slate-950 font-extrabold shadow-md shadow-cyan-500/30'
                                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-cyan-300 border border-slate-800'
                            }`}
                          >
                            {yr === 'All' ? 'All Yrs' : yr}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Section 2: Month Selector */}
                    <div>
                      <div className="text-[10px] font-mono text-cyan-400 font-bold mb-1.5 uppercase tracking-wider flex items-center justify-between">
                        <span>2. Filter By Month</span>
                        {selectedMonth !== 'All' && <span className="text-[9px] text-cyan-300">Active: {selectedMonth}</span>}
                      </div>

                      {/* All Months Option */}
                      <button
                        type="button"
                        onClick={() => setSelectedMonth('All')}
                        className={`w-full mb-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center justify-between transition-all cursor-pointer ${
                          selectedMonth === 'All'
                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-900/60 ring-1 ring-cyan-400'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-cyan-300 border border-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <span>📅</span> All Months ({selectedYear === 'All' ? 'Complete' : `Year ${selectedYear}`})
                        </span>
                        {selectedMonth === 'All' && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                      </button>

                      {/* 12 Months Grid */}
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { short: 'Jan', full: 'January' },
                          { short: 'Feb', full: 'February' },
                          { short: 'Mar', full: 'March' },
                          { short: 'Apr', full: 'April' },
                          { short: 'May', full: 'May' },
                          { short: 'Jun', full: 'June' },
                          { short: 'Jul', full: 'July' },
                          { short: 'Aug', full: 'August' },
                          { short: 'Sep', full: 'September' },
                          { short: 'Oct', full: 'October' },
                          { short: 'Nov', full: 'November' },
                          { short: 'Dec', full: 'December' },
                        ].map((m) => {
                          const isSelected = selectedMonth === m.short;
                          const isCurrent = new Date().toLocaleString('en-US', { month: 'short' }) === m.short;
                          return (
                            <button
                              key={m.short}
                              type="button"
                              onClick={() => setSelectedMonth(m.short)}
                              className={`px-2 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-center cursor-pointer flex flex-col items-center justify-center relative ${
                                isSelected
                                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/40 scale-[1.02]'
                                  : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-cyan-300 border border-slate-800/80 hover:border-cyan-500/50'
                              }`}
                              title={`${m.full}${isCurrent ? ' (Current Month)' : ''}`}
                            >
                              <span>{m.short}</span>
                              {isCurrent && (
                                <span className={`text-[7px] leading-none font-extrabold mt-0.5 ${isSelected ? 'text-slate-900' : 'text-cyan-400'}`}>
                                  • Current
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Done / Apply Button */}
                    <button
                      type="button"
                      onClick={() => setIsMonthPickerOpen(false)}
                      className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-extrabold text-xs shadow-md shadow-cyan-950/60 active:scale-95 transition-all text-center cursor-pointer"
                    >
                      Apply Filter
                    </button>
                  </div>
                </>
              )}
            </div>

            {selectedMonth !== 'All' && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800 animate-in fade-in duration-200 hidden sm:inline-block">
                {selectedMonth} Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[10px] font-mono text-cyan-400 hidden sm:flex items-center gap-1">
              <span>Scroll Horizontally</span> →
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 overflow-x-auto pb-3 pt-1 px-1 scrollbar-thin scrollbar-thumb-cyan-900/50 scrollbar-track-slate-900 snap-x">
          {/* 1. Proto Unit Button */}
          <button
            onClick={() => setActiveSection('proto')}
            className={`min-w-[260px] sm:min-w-[280px] flex-1 p-4 rounded-2xl border transition-all flex items-center justify-between group shadow-lg text-left cursor-pointer active:scale-[0.98] shrink-0 snap-start ${
              activeSection === 'proto'
                ? 'bg-slate-900 border-cyan-400 shadow-cyan-950/80 ring-1 ring-cyan-500/50'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-cyan-500/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl border transition-colors ${
                activeSection === 'proto'
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                  : 'bg-cyan-950 text-cyan-400 border-cyan-800 group-hover:bg-cyan-500 group-hover:text-slate-950'
              }`}>
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-extrabold text-white group-hover:text-cyan-300">Proto Unit</h4>
                  {activeSection === 'proto' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Prototype Testing & IDU/ODU</p>
              </div>
            </div>
            <ArrowRight className={`w-4 h-4 transition-all ${
              activeSection === 'proto' ? 'text-cyan-400 translate-x-1' : 'text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1'
            }`} />
          </button>

          {/* 2. PP Unit Button */}
          <button
            onClick={() => setActiveSection('pp')}
            className={`min-w-[260px] sm:min-w-[280px] flex-1 p-4 rounded-2xl border transition-all flex items-center justify-between group shadow-lg text-left cursor-pointer active:scale-[0.98] shrink-0 snap-start ${
              activeSection === 'pp'
                ? 'bg-slate-900 border-indigo-400 shadow-indigo-950/80 ring-1 ring-indigo-500/50'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-indigo-500/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl border transition-colors ${
                activeSection === 'pp'
                  ? 'bg-indigo-500 text-slate-950 border-indigo-300'
                  : 'bg-indigo-950 text-indigo-400 border-indigo-800 group-hover:bg-indigo-500 group-hover:text-slate-950'
              }`}>
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-extrabold text-white group-hover:text-indigo-300">PP Unit</h4>
                  {activeSection === 'pp' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Pre-Production Testing & Stations</p>
              </div>
            </div>
            <ArrowRight className={`w-4 h-4 transition-all ${
              activeSection === 'pp' ? 'text-indigo-400 translate-x-1' : 'text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1'
            }`} />
          </button>

          {/* 2. Field Units Button */}
          <button
            onClick={() => setActiveSection('field')}
            className={`min-w-[260px] sm:min-w-[280px] flex-1 p-4 rounded-2xl border transition-all flex items-center justify-between group shadow-lg text-left cursor-pointer active:scale-[0.98] shrink-0 snap-start ${
              activeSection === 'field'
                ? 'bg-slate-900 border-emerald-400 shadow-emerald-950/80 ring-1 ring-emerald-500/50'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-emerald-500/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl border transition-colors ${
                activeSection === 'field'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                  : 'bg-emerald-950 text-emerald-400 border-emerald-800 group-hover:bg-emerald-500 group-hover:text-slate-950'
              }`}>
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-extrabold text-white group-hover:text-emerald-300">Field Units</h4>
                  {activeSection === 'field' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">On-Field Telemetry & Live Tests</p>
              </div>
            </div>
            <ArrowRight className={`w-4 h-4 transition-all ${
              activeSection === 'field' ? 'text-emerald-400 translate-x-1' : 'text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1'
            }`} />
          </button>

          {/* 3. R&D Units Button */}
          <button
            onClick={() => setActiveSection('rd')}
            className={`min-w-[260px] sm:min-w-[280px] flex-1 p-4 rounded-2xl border transition-all flex items-center justify-between group shadow-lg text-left cursor-pointer active:scale-[0.98] shrink-0 snap-start ${
              activeSection === 'rd'
                ? 'bg-slate-900 border-blue-400 shadow-blue-950/80 ring-1 ring-blue-500/50'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-blue-500/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl border transition-colors ${
                activeSection === 'rd'
                  ? 'bg-blue-500 text-slate-950 border-blue-300'
                  : 'bg-blue-950 text-blue-400 border-blue-800 group-hover:bg-blue-500 group-hover:text-slate-950'
              }`}>
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-extrabold text-white group-hover:text-blue-300">R&D Units</h4>
                  {activeSection === 'rd' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Lab Handoffs & Timelines</p>
              </div>
            </div>
            <ArrowRight className={`w-4 h-4 transition-all ${
              activeSection === 'rd' ? 'text-blue-400 translate-x-1' : 'text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1'
            }`} />
          </button>

          {/* 4. Smog Section Button */}
          <button
            onClick={() => setActiveSection('smog')}
            className={`min-w-[260px] sm:min-w-[280px] flex-1 p-4 rounded-2xl border transition-all flex items-center justify-between group shadow-lg text-left cursor-pointer active:scale-[0.98] shrink-0 snap-start ${
              activeSection === 'smog'
                ? 'bg-slate-900 border-amber-400 shadow-amber-950/80 ring-1 ring-amber-500/50'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-amber-500/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl border transition-colors ${
                activeSection === 'smog'
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-amber-950 text-amber-400 border-amber-800 group-hover:bg-amber-500 group-hover:text-slate-950'
              }`}>
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-extrabold text-white group-hover:text-amber-300">Smog Section</h4>
                  {activeSection === 'smog' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Smoke, Opacity & AQI Sensors</p>
              </div>
            </div>
            <ArrowRight className={`w-4 h-4 transition-all ${
              activeSection === 'smog' ? 'text-amber-400 translate-x-1' : 'text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* SECTION SPECIFIC ANALYSIS DASHBOARD PANEL */}
      <div className="p-6 rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* If PP Unit: 6 Cards (Pending, Live Units, Finished Units, Both Qty, IDU Qty, ODU Qty) */}
        {/* If Other Sections: 4 Cards (Total Units, Stop/Overdue Units, Live Units, Finished Units) */}
        {activeSection === 'pp' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5">
            {/* Card 1: Pending */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-rose-500/30 hover:border-rose-400 shadow-[0_4px_15px_rgba(244,63,94,0.1)] hover:shadow-[0_0_20px_rgba(244,63,94,0.2)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-full blur-xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">Pending</span>
                <span className="text-[10px] font-mono text-rose-400/80 block truncate">Model Pending</span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-[0_2px_8px_rgba(244,63,94,0.3)]">
                  {displayedMetrics.stop}
                </div>
                <CircularProgressRing
                  percentage={displayedMetrics.total > 0 ? (displayedMetrics.stop / displayedMetrics.total) * 100 : 0}
                  colorClass="text-rose-400"
                  strokeColor="#f43f5e"
                  glowColor="rgba(244,63,94,0.6)"
                  icon={OctagonAlert}
                  size={40}
                />
              </div>
            </div>

            {/* Card 2: Live Units */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-amber-500/30 hover:border-amber-400 shadow-[0_4px_15px_rgba(245,158,11,0.1)] hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">Live Units</span>
                <span className="text-[10px] font-mono text-amber-400/80 block truncate">
                  {selectedMonth === 'All' ? 'In Testing' : `${selectedMonth} Live`}
                </span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-[0_2px_8px_rgba(245,158,11,0.3)]">
                  {displayedMetrics.live}
                </div>
                <CircularProgressRing
                  percentage={displayedMetrics.total > 0 ? (displayedMetrics.live / displayedMetrics.total) * 100 : 0}
                  colorClass="text-amber-400"
                  strokeColor="#f59e0b"
                  glowColor="rgba(245,158,11,0.6)"
                  icon={Flame}
                  size={40}
                />
              </div>
            </div>

            {/* Card 3: Finished Units */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-emerald-500/30 hover:border-emerald-400 shadow-[0_4px_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">Finished Units</span>
                <span className="text-[10px] font-mono text-emerald-400/80 block truncate">
                  {selectedMonth === 'All' ? 'Validated' : `${selectedMonth} Validated`}
                </span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)]">
                  {displayedMetrics.finished}
                </div>
                <CircularProgressRing
                  percentage={displayedMetrics.total > 0 ? (displayedMetrics.finished / displayedMetrics.total) * 100 : 0}
                  colorClass="text-emerald-400"
                  strokeColor="#10b981"
                  glowColor="rgba(16,185,129,0.6)"
                  icon={CheckCircle2}
                  size={40}
                />
              </div>
            </div>

            {/* Card 4: Both Qty */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-cyan-500/30 hover:border-cyan-400 shadow-[0_4px_15px_rgba(6,182,212,0.1)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">Both Qty</span>
                <span className="text-[10px] font-mono text-cyan-400/80 block truncate">Matched Sets</span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-cyan-300 font-mono tracking-tight">{ppMetrics.bothQty}</div>
                <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-300 shadow-md"><Cpu className="w-5 h-5" /></div>
              </div>
            </div>

            {/* Card 5: IDU Qty */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-indigo-500/30 hover:border-indigo-400 shadow-[0_4px_15px_rgba(99,102,241,0.1)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">IDU Qty</span>
                <span className="text-[10px] font-mono text-indigo-400/80 block truncate">Indoor Models</span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-indigo-300 font-mono tracking-tight">{ppMetrics.iduQty}</div>
                <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-800 flex items-center justify-center text-indigo-300 shadow-md"><Cpu className="w-5 h-5" /></div>
              </div>
            </div>

            {/* Card 6: ODU Qty */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-blue-500/30 hover:border-blue-400 shadow-[0_4px_15px_rgba(59,130,246,0.1)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">ODU Qty</span>
                <span className="text-[10px] font-mono text-blue-400/80 block truncate">Outdoor Models</span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-blue-300 font-mono tracking-tight">{ppMetrics.oduQty}</div>
                <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-800 flex items-center justify-center text-blue-300 shadow-md"><Cpu className="w-5 h-5" /></div>
              </div>
            </div>
          </div>
        ) : (
          /* Standard 4 Cards for non-PP sections (Proto, Field, R&D, SMOG) */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
            {/* Card 1: Total Units */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-cyan-500/30 hover:border-cyan-400 shadow-[0_4px_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.2)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">Total Units</span>
                <span className="text-[10px] font-mono text-slate-400 block truncate">
                  {selectedMonth === 'All' ? 'Section Total' : `${selectedMonth} Total`}
                </span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-[0_2px_8px_rgba(6,182,212,0.3)]">
                  {displayedMetrics.total}
                </div>
                <CircularProgressRing
                  percentage={100}
                  colorClass="text-cyan-400"
                  strokeColor="#06b6d4"
                  glowColor="rgba(6,182,212,0.6)"
                  icon={Boxes}
                  size={40}
                />
              </div>
            </div>

            {/* Card 2: Stop Units / Overdue Units */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-rose-500/30 hover:border-rose-400 shadow-[0_4px_15px_rgba(244,63,94,0.1)] hover:shadow-[0_0_20px_rgba(244,63,94,0.2)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-full blur-xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">
                  {activeSection === 'rd' ? 'Overdue Units' : 'Stop Units'}
                </span>
                <span className="text-[10px] font-mono text-rose-400/80 block truncate">
                  {activeSection === 'rd'
                    ? (selectedMonth === 'All' ? 'Target Overdue Qty' : `${selectedMonth} Overdue`)
                    : (selectedMonth === 'All' ? 'Hold / Rework' : `${selectedMonth} Hold`)}
                </span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-[0_2px_8px_rgba(244,63,94,0.3)]">
                  {displayedMetrics.stop}
                </div>
                <CircularProgressRing
                  percentage={displayedMetrics.total > 0 ? (displayedMetrics.stop / displayedMetrics.total) * 100 : 0}
                  colorClass="text-rose-400"
                  strokeColor="#f43f5e"
                  glowColor="rgba(244,63,94,0.6)"
                  icon={OctagonAlert}
                  size={40}
                />
              </div>
            </div>

            {/* Card 3: Live Units */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-amber-500/30 hover:border-amber-400 shadow-[0_4px_15px_rgba(245,158,11,0.1)] hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">Live Units</span>
                <span className="text-[10px] font-mono text-amber-400/80 block truncate">
                  {selectedMonth === 'All' ? 'In Testing' : `${selectedMonth} Live`}
                </span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-[0_2px_8px_rgba(245,158,11,0.3)]">
                  {displayedMetrics.live}
                </div>
                <CircularProgressRing
                  percentage={displayedMetrics.total > 0 ? (displayedMetrics.live / displayedMetrics.total) * 100 : 0}
                  colorClass="text-amber-400"
                  strokeColor="#f59e0b"
                  glowColor="rgba(245,158,11,0.6)"
                  icon={Flame}
                  size={40}
                />
              </div>
            </div>

            {/* Card 4: Finished Units */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-950 border border-emerald-500/30 hover:border-emerald-400 shadow-[0_4px_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
              <div className="z-10">
                <span className="text-xs font-extrabold text-white tracking-wide block truncate">Finished Units</span>
                <span className="text-[10px] font-mono text-emerald-400/80 block truncate">
                  {selectedMonth === 'All' ? 'Validated' : `${selectedMonth} Validated`}
                </span>
              </div>
              <div className="z-10 mt-3 flex items-center justify-between gap-2">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-[0_2px_8px_rgba(16,185,129,0.3)]">
                  {displayedMetrics.finished}
                </div>
                <CircularProgressRing
                  percentage={displayedMetrics.total > 0 ? (displayedMetrics.finished / displayedMetrics.total) * 100 : 0}
                  colorClass="text-emerald-400"
                  strokeColor="#10b981"
                  glowColor="rgba(16,185,129,0.6)"
                  icon={CheckCircle2}
                  size={40}
                />
              </div>
            </div>
          </div>
        )}

        {/* SECTION MONTHLY WISE GRAPH (Jan - Dec) - Modern Smooth Trend Analytics */}
        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400 shrink-0" />
              <div>
                <h4 className="text-sm font-extrabold text-white">
                  Monthly Performance Trend (Jan - Dec)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Month-by-month unit volume, Live testing, Finished passes, and {activeSection === 'rd' ? 'Overdue units' : 'Stop holds'} for {sectionAnalysis.title}
                </p>
              </div>
            </div>

            {/* Chart Mode & Metric Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0">
              {/* Type Switcher */}
              <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300">
                <button
                  type="button"
                  onClick={() => setChartType('area')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    chartType === 'area'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                      : 'hover:text-white'
                  }`}
                >
                  Area Curve
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('line')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    chartType === 'line'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                      : 'hover:text-white'
                  }`}
                >
                  Trend Line
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    chartType === 'bar'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                      : 'hover:text-white'
                  }`}
                >
                  Bars
                </button>
              </div>

              {/* Metric Filter Badges */}
              <div className="flex items-center gap-1.5 text-[11px] font-mono overflow-x-auto py-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedMetric('all')}
                  className={`px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    selectedMetric === 'all'
                      ? 'bg-slate-800 text-white border-slate-600 font-bold'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMetric(selectedMetric === 'Total' ? 'all' : 'Total')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    selectedMetric === 'Total'
                      ? 'bg-sky-950 text-sky-300 border-sky-500 font-bold'
                      : 'bg-slate-900/60 text-sky-400/80 border-slate-800 hover:text-sky-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                  Total
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMetric(selectedMetric === 'Live' ? 'all' : 'Live')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    selectedMetric === 'Live'
                      ? 'bg-amber-950 text-amber-300 border-amber-500 font-bold'
                      : 'bg-slate-900/60 text-amber-400/80 border-slate-800 hover:text-amber-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Live
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMetric(selectedMetric === 'Finished' ? 'all' : 'Finished')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    selectedMetric === 'Finished'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500 font-bold'
                      : 'bg-slate-900/60 text-emerald-400/80 border-slate-800 hover:text-emerald-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  Finished
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMetric(selectedMetric === 'Stop' ? 'all' : 'Stop')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    selectedMetric === 'Stop'
                      ? 'bg-rose-950 text-rose-300 border-rose-500 font-bold'
                      : 'bg-slate-900/60 text-rose-400/80 border-slate-800 hover:text-rose-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                  {activeSection === 'rd' ? 'Overdue' : 'Pending'}
                </button>
              </div>
            </div>
          </div>

          <div className="h-72 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={sectionAnalysis.monthly} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradLive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradFinished" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradStop" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#64748b" 
                    tick={{ fontSize: 11, fill: '#94a3b8' }} 
                  />
                  <YAxis 
                    stroke="#64748b" 
                    tick={{ fontSize: 11, fill: '#94a3b8' }} 
                    allowDecimals={false} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#020617', 
                      borderColor: '#1e293b', 
                      borderRadius: '16px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}
                  />
                  {(selectedMetric === 'all' || selectedMetric === 'Total') && (
                    <Area 
                      type="monotone" 
                      dataKey="Total" 
                      stroke="#38bdf8" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#gradTotal)" 
                      name="Total Units" 
                      dot={{ r: 3, fill: '#38bdf8', strokeWidth: 1, stroke: '#020617' }} 
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {(selectedMetric === 'all' || selectedMetric === 'Live') && (
                    <Area 
                      type="monotone" 
                      dataKey="Live" 
                      stroke="#f59e0b" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#gradLive)" 
                      name="Live Units" 
                      dot={{ r: 3, fill: '#f59e0b', strokeWidth: 1, stroke: '#020617' }} 
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {(selectedMetric === 'all' || selectedMetric === 'Finished') && (
                    <Area 
                      type="monotone" 
                      dataKey="Finished" 
                      stroke="#10b981" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#gradFinished)" 
                      name="Finished Units" 
                      dot={{ r: 3, fill: '#10b981', strokeWidth: 1, stroke: '#020617' }} 
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {(selectedMetric === 'all' || selectedMetric === 'Stop') && (
                    <Area 
                      type="monotone" 
                      dataKey="Stop" 
                      stroke="#f43f5e" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#gradStop)" 
                      name={activeSection === 'rd' ? "Overdue Units" : "Pending Models"} 
                      dot={{ r: 3, fill: '#f43f5e', strokeWidth: 1, stroke: '#020617' }} 
                      activeDot={{ r: 6 }}
                    />
                  )}
                </AreaChart>
              ) : chartType === 'line' ? (
                <LineChart data={sectionAnalysis.monthly} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#64748b" 
                    tick={{ fontSize: 11, fill: '#94a3b8' }} 
                  />
                  <YAxis 
                    stroke="#64748b" 
                    tick={{ fontSize: 11, fill: '#94a3b8' }} 
                    allowDecimals={false} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#020617', 
                      borderColor: '#1e293b', 
                      borderRadius: '16px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}
                  />
                  {(selectedMetric === 'all' || selectedMetric === 'Total') && (
                    <Line type="monotone" dataKey="Total" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} name="Total Units" />
                  )}
                  {(selectedMetric === 'all' || selectedMetric === 'Live') && (
                    <Line type="monotone" dataKey="Live" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} name="Live Units" />
                  )}
                  {(selectedMetric === 'all' || selectedMetric === 'Finished') && (
                    <Line type="monotone" dataKey="Finished" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} name="Finished Units" />
                  )}
                  {(selectedMetric === 'all' || selectedMetric === 'Stop') && (
                    <Line type="monotone" dataKey="Stop" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} name={activeSection === 'rd' ? "Overdue Units" : "Pending Models"} />
                  )}
                </LineChart>
              ) : (
                <BarChart data={sectionAnalysis.monthly} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#64748b" 
                    tick={{ fontSize: 11, fill: '#94a3b8' }} 
                  />
                  <YAxis 
                    stroke="#64748b" 
                    tick={{ fontSize: 11, fill: '#94a3b8' }} 
                    allowDecimals={false} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#020617', 
                      borderColor: '#1e293b', 
                      borderRadius: '16px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}
                    cursor={{ fill: 'rgba(30, 41, 59, 0.4)' }}
                  />
                  {(selectedMetric === 'all' || selectedMetric === 'Total') && <Bar dataKey="Total" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Total Units" />}
                  {(selectedMetric === 'all' || selectedMetric === 'Live') && <Bar dataKey="Live" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Live Units" />}
                  {(selectedMetric === 'all' || selectedMetric === 'Finished') && <Bar dataKey="Finished" fill="#10b981" radius={[4, 4, 0, 0]} name="Finished Units" />}
                  {(selectedMetric === 'all' || selectedMetric === 'Stop') && <Bar dataKey="Stop" fill="#f43f5e" radius={[4, 4, 0, 0]} name={activeSection === 'rd' ? "Overdue Units" : "Pending Models"} />}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Logs */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              Recent Laboratory Activity Feed
            </h3>
            <p className="text-xs text-slate-400">
              Audit trail of unit creations, transfers, shift start/off operations, and rework requests
            </p>
          </div>
        </div>

        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {activityLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No recent activity logged.
            </div>
          ) : (
            activityLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                    log.type === 'shift_start' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                    log.type === 'shift_off' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                    log.type === 'shift_change' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                    log.type === 'transfer' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                    log.type === 'received' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                    log.type === 'rework' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {log.type === 'shift_start' ? <Play className="w-4 h-4 text-emerald-400 fill-emerald-400/20" /> :
                     log.type === 'shift_off' ? <PauseCircle className="w-4 h-4 text-amber-400" /> :
                     log.type === 'shift_change' ? <Clock className="w-4 h-4 text-cyan-400" /> :
                     log.type === 'transfer' ? <Boxes className="w-4 h-4" /> :
                     log.type === 'received' ? <CheckCircle2 className="w-4 h-4" /> :
                     log.type === 'rework' ? <RotateCcw className="w-4 h-4" /> :
                     <Activity className="w-4 h-4" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white font-mono">{log.serialNumber}</span>
                      <span className="text-xs text-slate-300 font-medium">({log.modelName})</span>
                      {log.type === 'shift_start' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-800 uppercase tracking-wide">
                          🟢 SHIFT START
                        </span>
                      )}
                      {log.type === 'shift_off' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-800 uppercase tracking-wide">
                          ⏸️ SHIFT OFF
                        </span>
                      )}
                      {log.type === 'shift_change' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-wide">
                          🔄 SHIFT CHANGE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {log.action}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-right text-xs shrink-0 self-end sm:self-center">
                  <div className="text-right">
                    <div className="font-semibold text-slate-200">{log.performedBy}</div>
                    <div className="text-[10px] text-slate-500">{log.timestamp}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
