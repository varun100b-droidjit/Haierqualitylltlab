import React, { useState, useEffect } from 'react';
import { 
  ArrowLeftRight, 
  Send, 
  RotateCcw, 
  Search, 
  ScanBarcode, 
  Download, 
  Clock, 
  CheckCircle2, 
  Layers, 
  Cpu, 
  Calendar,
  Trash2,
  Filter,
  RefreshCw
} from 'lucide-react';
import { 
  ELTRecord, 
  BSRRecord, 
  subscribeELTRecords, 
  subscribeBSRRecords, 
  deleteELTRecord, 
  deleteBSRRecord, 
  returnMachineToBSR 
} from '../../services/eltBsrStore';
import * as XLSX from 'xlsx';

interface InOutUnitsModuleProps {
  onOpenScanner?: () => void;
}

export type InOutTab = 'ELT_RECORD' | 'BSR_RECORD';

export const InOutUnitsModule: React.FC<InOutUnitsModuleProps> = ({
  onOpenScanner
}) => {
  // Requirement 8: Top 2 buttons/tabs: 1. ELT RECORD, 2. BSR RECORD. Default tab: ELT RECORD
  const [activeTab, setActiveTab] = useState<InOutTab>('ELT_RECORD');
  const [eltRecords, setEltRecords] = useState<ELTRecord[]>([]);
  const [bsrRecords, setBsrRecords] = useState<BSRRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isProcessingAction, setIsProcessingAction] = useState<string | null>(null);

  useEffect(() => {
    const unsubELT = subscribeELTRecords((records) => {
      setEltRecords(records);
    });
    const unsubBSR = subscribeBSRRecords((records) => {
      setBsrRecords(records);
    });
    return () => {
      unsubELT();
      unsubBSR();
    };
  }, []);

  // Filtered lists
  const filteredELT = eltRecords.filter(r => {
    const term = searchTerm.toLowerCase();
    return (
      r.serialNumber.toLowerCase().includes(term) ||
      r.modelName.toLowerCase().includes(term) ||
      r.materialCode.toLowerCase().includes(term) ||
      r.eltDate.toLowerCase().includes(term)
    );
  });

  const filteredBSR = bsrRecords.filter(r => {
    const term = searchTerm.toLowerCase();
    return (
      r.serialNumber.toLowerCase().includes(term) ||
      r.modelName.toLowerCase().includes(term) ||
      r.materialCode.toLowerCase().includes(term) ||
      r.originalELTDateTime.toLowerCase().includes(term) ||
      r.bsrReturnDateTime.toLowerCase().includes(term)
    );
  });

  // Quick Action: Return from BSR directly from table
  const handleQuickReturnBSR = async (serialNumber: string) => {
    if (window.confirm(`Confirm BSR return for machine ${serialNumber}?`)) {
      setIsProcessingAction(serialNumber);
      try {
        await returnMachineToBSR(serialNumber);
      } catch (err) {
        console.error(err);
      } finally {
        setIsProcessingAction(null);
      }
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const eltData = eltRecords.map((r, i) => ({
      'S.No': i + 1,
      'Serial Number': r.serialNumber,
      'Model Name': r.modelName,
      'Material Code / Prefix': r.materialCode,
      'Process Type': r.processType,
      'ELT Send Date': r.eltDate,
      'ELT Send Time': r.eltTime,
      'Status': r.status,
      'Created At': r.createdAt
    }));
    const wsELT = XLSX.utils.json_to_sheet(eltData);
    XLSX.utils.book_append_sheet(wb, wsELT, 'ELT Records');

    const bsrData = bsrRecords.map((r, i) => ({
      'S.No': i + 1,
      'Serial Number': r.serialNumber,
      'Model Name': r.modelName,
      'Material Code / Prefix': r.materialCode,
      'Process Type': r.processType,
      'Original ELT Date & Time': r.originalELTDateTime,
      'BSR Return Date & Time': r.bsrReturnDateTime,
      'Status': r.status,
      'Created At': r.createdAt
    }));
    const wsBSR = XLSX.utils.json_to_sheet(bsrData);
    XLSX.utils.book_append_sheet(wb, wsBSR, 'BSR Records');

    XLSX.writeFile(wb, `LLT_Lab_InOut_Records_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner & Tab Controls */}
      <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-950/60">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                In/Out Units
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  ELT & BSR
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Track machines dispatched to ELT and returned back to BSR with barcode verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950/60 transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <ScanBarcode className="w-4 h-4" />
                <span>Barcode Scanner</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
              title="Export all records to Excel (.xlsx)"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          </div>
        </div>

        {/* 2 MAIN TOP BUTTONS / TABS (Requirement 8) */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => setActiveTab('ELT_RECORD')}
              className={`py-3 px-5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2.5 transition-all cursor-pointer border ${
                activeTab === 'ELT_RECORD'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-lg shadow-cyan-950/80 ring-2 ring-cyan-400/40'
                  : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Send className="w-4 h-4 text-cyan-300" />
              <span>1. ELT RECORD</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                activeTab === 'ELT_RECORD' ? 'bg-cyan-950 text-cyan-300 border border-cyan-700' : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}>
                {eltRecords.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('BSR_RECORD')}
              className={`py-3 px-5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2.5 transition-all cursor-pointer border ${
                activeTab === 'BSR_RECORD'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-lg shadow-emerald-950/80 ring-2 ring-emerald-400/40'
                  : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-emerald-300" />
              <span>2. BSR RECORD</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                activeTab === 'BSR_RECORD' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}>
                {bsrRecords.length}
              </span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === 'ELT_RECORD'
                ? "Search ELT records by Serial Number, Model Name, or Prefix..."
                : "Search BSR records by Serial Number, Model Name, or Return Date..."
            }
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-3.5 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

      </div>

      {/* =========================================================================
          TAB 1: ELT RECORD (Currently available ELT machines)
          ========================================================================= */}
      {activeTab === 'ELT_RECORD' && (
        <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-cyan-400" />
              <span>Currently in ELT ({filteredELT.length} Units)</span>
            </h2>
            <span className="text-[11px] text-slate-400">
              Machines sent to ELT awaiting BSR return
            </span>
          </div>

          {filteredELT.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 space-y-2">
              <Layers className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">No ELT Machine Records Found</p>
              <p className="text-xs text-slate-500">
                {searchTerm ? 'Try a different search term.' : 'Use the Barcode Scanner icon in header to scan and send machines to ELT.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
                    <th className="py-3 px-3.5">#</th>
                    <th className="py-3 px-3.5">Serial Number</th>
                    <th className="py-3 px-3.5">Model Name</th>
                    <th className="py-3 px-3.5">Material Code / Prefix</th>
                    <th className="py-3 px-3.5">ELT Send Date</th>
                    <th className="py-3 px-3.5">ELT Send Time</th>
                    <th className="py-3 px-3.5">Status</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {filteredELT.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3.5 text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3 px-3.5 font-mono font-bold text-white text-xs">
                        <span className="text-cyan-300">{r.serialNumber}</span>
                      </td>
                      <td className="py-3 px-3.5 font-semibold text-slate-200">
                        {r.modelName}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-400 text-xs">
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-400">
                          {r.materialCode}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-300 font-mono text-[11px]">
                        {r.eltDate}
                      </td>
                      <td className="py-3 px-3.5 text-slate-300 font-mono text-[11px]">
                        {r.eltTime}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-950 text-cyan-400 border border-cyan-800 inline-flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          {r.status || 'Sent to ELT'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isProcessingAction === r.serialNumber}
                          onClick={() => handleQuickReturnBSR(r.serialNumber)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 hover:text-white text-[11px] font-bold transition-all cursor-pointer"
                          title="Return this machine to BSR"
                        >
                          {isProcessingAction === r.serialNumber ? (
                            <RefreshCw className="w-3 h-3 animate-spin inline" />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" />
                              <span>BSR Return</span>
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete record for ${r.serialNumber}?`)) {
                              deleteELTRecord(r.id);
                            }
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: BSR RECORD (Returned machines data)
          ========================================================================= */}
      {activeTab === 'BSR_RECORD' && (
        <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-emerald-400" />
              <span>Returned to BSR ({filteredBSR.length} Units)</span>
            </h2>
            <span className="text-[11px] text-slate-400">
              Machines completed in ELT and returned to BSR
            </span>
          </div>

          {filteredBSR.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">No BSR Return Records Found</p>
              <p className="text-xs text-slate-500">
                {searchTerm ? 'Try a different search term.' : 'Use Barcode Scanner (RETURN BSR) to return machines from ELT.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
                    <th className="py-3 px-3.5">#</th>
                    <th className="py-3 px-3.5">Serial Number</th>
                    <th className="py-3 px-3.5">Model Name</th>
                    <th className="py-3 px-3.5">Material Code / Prefix</th>
                    <th className="py-3 px-3.5">ELT Send Date & Time</th>
                    <th className="py-3 px-3.5">BSR Return Date & Time</th>
                    <th className="py-3 px-3.5">Status</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {filteredBSR.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3.5 text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3 px-3.5 font-mono font-bold text-white text-xs">
                        <span className="text-emerald-300">{r.serialNumber}</span>
                      </td>
                      <td className="py-3 px-3.5 font-semibold text-slate-200">
                        {r.modelName}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-400 text-xs">
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400">
                          {r.materialCode}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-300 font-mono text-[11px]">
                        {r.originalELTDateTime}
                      </td>
                      <td className="py-3 px-3.5 text-emerald-400 font-mono text-[11px] font-semibold">
                        {r.bsrReturnDateTime}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-950 text-emerald-400 border border-emerald-800 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {r.status || 'Returned from BSR'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete BSR record for ${r.serialNumber}?`)) {
                              deleteBSRRecord(r.id);
                            }
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Delete BSR record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
