import React from 'react';
import { Cpu, Box, Layers } from 'lucide-react';
import { PpUnit } from '../../types';
import { getIduOduMatchingPairs } from '../../services/ppUnitStore';

interface IduOduMatchingSectionProps {
  units: PpUnit[];
}

export const IduOduMatchingSection: React.FC<IduOduMatchingSectionProps> = ({ units }) => {
  const matchingPairs = getIduOduMatchingPairs(units);

  if (matchingPairs.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center space-y-2">
        <Layers className="w-8 h-8 text-slate-500 mx-auto" />
        <h4 className="text-sm font-bold text-slate-300">No Matched Models Found</h4>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matchingPairs.map((pair) => {
        const iduModel = pair.iduModel || 'N/A';
        const iduVer = pair.iduItem?.version || 'V1.0';
        const oduModel = pair.oduModel || 'N/A';
        const oduVer = pair.oduItem?.version || 'V1.0';

        return (
          <div 
            key={pair.id}
            className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
          >
            {/* IDU Details */}
            <div className="flex-1 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">IDU Model</span>
                  <span className="text-xs font-mono font-black text-white truncate block">{iduModel}</span>
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                <span className="text-[11px] font-mono font-bold text-emerald-400">Ver: {iduVer}</span>
              </div>
            </div>

            <div className="text-slate-500 font-black text-center text-sm hidden md:block px-1">+</div>

            {/* ODU Details */}
            <div className="flex-1 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Box className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">ODU Model</span>
                  <span className="text-xs font-mono font-black text-white truncate block">{oduModel}</span>
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                <span className="text-[11px] font-mono font-bold text-emerald-400">Ver: {oduVer}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
