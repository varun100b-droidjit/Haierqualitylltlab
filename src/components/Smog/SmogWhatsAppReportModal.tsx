import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  Copy, 
  Check, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Layers, 
  MapPin, 
  Hash,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { LeakUnitRecord } from './SmogModule';

export interface SmogWhatsAppReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  productionDate: string;
  smogDate: string;
  shift: 'A' | 'B' | 'C' | 'all';
  smogQty: number;
  records: LeakUnitRecord[];
}

export const SmogWhatsAppReportModal: React.FC<SmogWhatsAppReportModalProps> = ({
  isOpen,
  onClose,
  productionDate,
  smogDate,
  shift,
  smogQty,
  records
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  // Filter records relevant to this shift & date
  const filteredRecords = records.filter(r => {
    const shiftMatch = shift === 'all' || r.shift === shift;
    const dateMatch = !smogDate || r.smogDate === smogDate || r.date === smogDate;
    return shiftMatch && dateMatch;
  });

  // Calculate totals
  const totalLeakQty = filteredRecords.reduce((sum, r) => {
    const q = r.qty ?? r.suspectCount ?? (r.serialNumbers?.length || 1);
    return sum + q;
  }, 0);

  const totalPassed = filteredRecords.reduce((sum, r) => {
    return sum + (r.passedSerials?.length || 0);
  }, 0);

  // Location wise aggregation
  const locationMap = new Map<string, { qty: number; count: number; models: Set<string> }>();
  filteredRecords.forEach(r => {
    const loc = (r.location && r.location.trim()) || 'General Location';
    const q = r.qty ?? r.suspectCount ?? (r.serialNumbers?.length || 1);
    const existing = locationMap.get(loc) || { qty: 0, count: 0, models: new Set<string>() };
    existing.qty += q;
    existing.count += (r.serialNumbers?.length || 1);
    if (r.modelName && r.modelName !== 'General Location' && r.modelName !== 'SAC-1.5T-INV-3S') {
      existing.models.add(r.modelName);
    }
    locationMap.set(loc, existing);
  });

  const locationList = Array.from(locationMap.entries()).map(([loc, data]) => ({
    location: loc,
    qty: data.qty,
    count: data.count,
    modelNames: Array.from(data.models).join(', ')
  }));

  // Build formatted text message for WhatsApp
  const generateWhatsAppTextMessage = () => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let text = `🚨 *SMOG & LEAK OPERATION REPORT* 🚨\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚙️ *Operation Status:* OPERATION CLOSED\n`;
    text += `📅 *Production Date:* ${productionDate || 'N/A'}\n`;
    text += `📅 *Smog Date:* ${smogDate || 'N/A'}\n`;
    text += `⏰ *Shift:* Shift ${shift === 'all' ? 'All' : shift}\n`;
    text += `🕒 *Closed Time:* ${nowStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 *QUANTITY SUMMARY:*\n`;
    text += `💨 *Smog Qty:* ${smogQty}\n`;
    text += `🚨 *Total Leak Qty:* ${totalLeakQty}\n`;
    text += `✅ *Actual Passed:* ${totalPassed}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📍 *LEAK LOCATION WISE QTY:*\n`;
    if (locationList.length === 0) {
      text += `• No leak locations logged for this shift.\n`;
    } else {
      locationList.forEach((item, idx) => {
        text += `${idx + 1}. *${item.location}*: ${item.qty} units\n`;
      });
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `✅ *Verified by Smog Inspection System*`;
    return text;
  };

  // Safe RoundRect helper supporting all browser environments
  const safeRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  };

  // Render Image onto Canvas
  useEffect(() => {
    if (!isOpen) return;

    setIsGenerating(true);
    try {
      const canvas = document.createElement('canvas');
      const width = 1080;
      const minHeight = 1250;
      // calculate dynamic height based on number of locations
      const height = Math.max(minHeight, 1100 + locationList.length * 60);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsGenerating(false);
        return;
      }

      // 1. Background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, '#0a0f1d');
      bgGradient.addColorStop(0.5, '#070b14');
      bgGradient.addColorStop(1, '#05070c');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Decorative background glow
      const glowGradient = ctx.createRadialGradient(width / 2, 100, 10, width / 2, 100, 450);
      glowGradient.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
      glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGradient;
      ctx.fillRect(0, 0, width, 500);

      // Outer border
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, width - 32, height - 32);

      // Inner subtle border
      ctx.strokeStyle = '#0e7490';
      ctx.lineWidth = 1;
      ctx.strokeRect(24, 24, width - 48, height - 48);

      // 2. Header Banner
      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LEAK TESTING & SMOG INSPECTION REPORT', width / 2, 70);

      // Big Title
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 42px sans-serif';
      ctx.fillText('SMOG OPERATION SUMMARY', width / 2, 125);

      // Operation Closed Pill Badge
      const badgeW = 320;
      const badgeH = 42;
      const badgeX = (width - badgeW) / 2;
      const badgeY = 145;
      ctx.fillStyle = '#064e3b';
      ctx.beginPath();
      safeRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 21);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('● STATUS: OPERATION CLOSED', width / 2, badgeY + 27);

      // Divider Line
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 215);
      ctx.lineTo(width - 50, 215);
      ctx.stroke();

      // 3. Info Parameters Grid (Prod Date, Smog Date, Shift)
      const cardY = 240;
      const colW = (width - 100 - 40) / 3;

      // Card 1: Production Date
      drawParamCard(ctx, 50, cardY, colW, 90, 'PRODUCTION DATE', productionDate || 'N/A', '#38bdf8');
      // Card 2: Smog Date
      drawParamCard(ctx, 50 + colW + 20, cardY, colW, 90, 'SMOG DATE', smogDate || 'N/A', '#34d399');
      // Card 3: Shift
      drawParamCard(ctx, 50 + (colW + 20) * 2, cardY, colW, 90, 'SHIFT', `SHIFT ${shift === 'all' ? 'ALL' : shift}`, '#fbbf24');

      // 4. Primary Metric Highlights (Smog Qty, Leak Qty, Passed)
      const metricY = 355;
      const mColW = (width - 100 - 40) / 3;

      drawMetricCard(ctx, 50, metricY, mColW, 130, 'SMOG QTY', String(smogQty), 'Total Shift Output', '#c084fc', '#581c87');
      drawMetricCard(ctx, 50 + mColW + 20, metricY, mColW, 130, 'TOTAL LEAK QTY', String(totalLeakQty), 'Suspect Units', '#f87171', '#7f1d1d');
      drawMetricCard(ctx, 50 + (mColW + 20) * 2, metricY, mColW, 130, 'ACTUAL PASSED', String(totalPassed), 'Verified Units', '#4ade80', '#14532d');

      // 5. Leak Unit Location Wise Breakdown Section
      const sectionY = 520;
      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('LEAK UNIT LOCATION & LOCATION-WISE QTY', 50, sectionY);

      // Table Header
      const tableY = sectionY + 20;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      safeRoundRect(ctx, 50, tableY, width - 100, 44, 10);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 15px monospace';
      ctx.fillText('#', 75, tableY + 27);
      ctx.fillText('LEAK UNIT LOCATION', 125, tableY + 27);
      ctx.textAlign = 'right';
      ctx.fillText('QTY (UNITS)', width - 210, tableY + 27);
      ctx.fillText('STATUS', width - 80, tableY + 27);

      // Table Rows
      let curRowY = tableY + 54;
      if (locationList.length === 0) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        safeRoundRect(ctx, 50, curRowY, width - 100, 56, 10);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.font = 'italic 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No leak unit locations logged for this shift & date', width / 2, curRowY + 34);
        curRowY += 70;
      } else {
        locationList.forEach((item, idx) => {
          // Row background
          ctx.fillStyle = idx % 2 === 0 ? '#0f172a' : '#141d33';
          ctx.beginPath();
          safeRoundRect(ctx, 50, curRowY, width - 100, 52, 10);
          ctx.fill();
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Index
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(String(idx + 1), 75, curRowY + 32);

          // Location Name
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 18px sans-serif';
          const locName = item.location.length > 36 ? item.location.slice(0, 34) + '...' : item.location;
          ctx.fillText(locName, 125, curRowY + 32);

          // Quantity
          ctx.fillStyle = '#38bdf8';
          ctx.font = '900 20px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(String(item.qty), width - 210, curRowY + 32);

          // Badge: Logged
          ctx.fillStyle = '#065f46';
          ctx.beginPath();
          safeRoundRect(ctx, width - 140, curRowY + 12, 65, 28, 6);
          ctx.fill();
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 13px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('LEAK', width - 108, curRowY + 30);

          curRowY += 60;
        });
      }

      // 6. Smog Operation Details Box
      const opBoxY = curRowY + 20;
      ctx.fillStyle = '#091021';
      ctx.beginPath();
      safeRoundRect(ctx, 50, opBoxY, width - 100, 110, 14);
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SMOG OPERATION DETAILS', 75, opBoxY + 32);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '15px monospace';
      const now = new Date();
      const formattedStamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
      ctx.fillText(`• Operation Status: CLOSED & UPLOADED`, 75, opBoxY + 62);
      ctx.fillText(`• Timestamp: ${formattedStamp}`, 75, opBoxY + 88);

      ctx.textAlign = 'right';
      ctx.fillText(`• Shift In-charge: Indrajit`, width - 75, opBoxY + 62);
      ctx.fillText(`• Locations Monitored: ${locationList.length}`, width - 75, opBoxY + 88);

      // 7. Footer
      ctx.fillStyle = '#475569';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SMOG & LEAK TESTING AUTOMATED REPORT • POWERED BY LLT LAB SYSTEM', width / 2, height - 42);

      // Save as data URL
      const dataUrl = canvas.toDataURL('image/png');
      setGeneratedImageUrl(dataUrl);
    } catch (e) {
      console.error('Failed to generate report canvas:', e);
    } finally {
      setIsGenerating(false);
    }
  }, [isOpen, productionDate, smogDate, shift, smogQty, filteredRecords.length]);

  // Helper to draw parameter cards
  function drawParamCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    val: string,
    accentColor: string
  ) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    safeRoundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 16, y + 28);

    ctx.fillStyle = accentColor;
    ctx.font = '900 22px monospace';
    ctx.fillText(val, x + 16, y + 64);
  }

  // Helper to draw metric cards
  function drawMetricCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    val: string,
    sub: string,
    textColor: string,
    borderColor: string
  ) {
    ctx.fillStyle = '#0b1120';
    ctx.beginPath();
    safeRoundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 18, y + 32);

    ctx.fillStyle = textColor;
    ctx.font = '900 42px monospace';
    ctx.fillText(val, x + 18, y + 84);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px monospace';
    ctx.fillText(sub, x + 18, y + 112);
  }

  // Handle WhatsApp Share
  const handleShareWhatsApp = async () => {
    const text = generateWhatsAppTextMessage();
    const fileName = `Smog_Report_${smogDate || 'Today'}_Shift_${shift}.png`;

    try {
      if (generatedImageUrl) {
        // Try Web Share API with File
        const res = await fetch(generatedImageUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Smog Operation Report',
            text: text,
            files: [file]
          });
          setShareSuccess('Report image shared successfully!');
          return;
        }
      }
    } catch (e) {
      console.warn('Web share failed or canceled, falling back to direct link:', e);
    }

    // Fallback: Trigger download of image and open WhatsApp with prefilled message
    handleDownloadImage();
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
    setShareSuccess('Image downloaded! WhatsApp opened with report summary.');
  };

  // Handle Download Image
  const handleDownloadImage = () => {
    if (!generatedImageUrl) return;
    const a = document.createElement('a');
    a.href = generatedImageUrl;
    a.download = `Smog_Operation_Report_${smogDate || 'date'}_Shift_${shift}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Copy text to clipboard
  const handleCopyText = () => {
    const text = generateWhatsAppTextMessage();
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>Share WhatsApp Report</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Image Ready
                </span>
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                Production Date, Smog Date, Shift, Leak Qty, Smog Qty & Locations
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

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {shareSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{shareSuccess}</span>
            </div>
          )}

          {/* Quick Metrics Summary Bar */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-center">
            <div>
              <span className="text-[10px] text-purple-400 uppercase font-bold block">Smog Qty</span>
              <span className="text-xl font-black text-purple-300">{smogQty}</span>
            </div>
            <div className="border-x border-slate-800">
              <span className="text-[10px] text-rose-400 uppercase font-bold block">Leak Qty</span>
              <span className="text-xl font-black text-rose-300">{totalLeakQty}</span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-400 uppercase font-bold block">Locations</span>
              <span className="text-xl font-black text-emerald-300">{locationList.length}</span>
            </div>
          </div>

          {/* Generated Image Preview Container */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Generated Report Image Preview</span>
              </span>
              <span className="text-[10px] text-slate-500">1080px High-Res PNG</span>
            </div>

            <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-2 overflow-hidden flex items-center justify-center max-h-72">
              {isGenerating ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs font-mono">
                  <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Generating Report Image...</span>
                </div>
              ) : generatedImageUrl ? (
                <img 
                  src={generatedImageUrl} 
                  alt="Smog Operation Report" 
                  className="w-full h-auto max-h-68 object-contain rounded-xl border border-slate-800/80 shadow-lg"
                />
              ) : (
                <div className="py-10 text-slate-500 text-xs font-mono">Failed to render image</div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {/* WhatsApp Share Button */}
            <button
              onClick={handleShareWhatsApp}
              className="w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-400 to-green-500 hover:from-emerald-300 hover:to-green-400 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 stroke-[2.5]" />
              <span>Share on WhatsApp</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              {/* Download PNG Button */}
              <button
                onClick={handleDownloadImage}
                className="py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Download PNG</span>
              </button>

              {/* Copy Report Text */}
              <button
                onClick={handleCopyText}
                className="py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
