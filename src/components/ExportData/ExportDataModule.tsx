import React, { useState } from 'react';
import { 
  Download, 
  FileSpreadsheet, 
  FileJson, 
  Printer, 
  Search, 
  Filter, 
  Boxes, 
  Cpu, 
  Compass, 
  Cloud, 
  History, 
  Database,
  CheckCircle2,
  Calendar,
  Layers,
  FileText
} from 'lucide-react';
import { Unit, ProtoUnit, FieldUnit, PpUnit, WORKFLOW_STAGES } from '../../types';
import { getProtoUnits } from '../../services/protoUnitStore';
import { getPpUnits, getIduOduMatchingPairs } from '../../services/ppUnitStore';
import { getFieldUnits } from '../../services/fieldUnitStore';
import { getSmogUnits } from '../Smog/SmogModule';
import { getActivityLogs } from '../../services/unitStore';

export type ExportCategory = 'rd-units' | 'proto-units' | 'pp-units' | 'pp-models' | 'field-units' | 'smog-units' | 'activity-logs' | 'full-backup';

interface ExportDataModuleProps {
  units: Unit[];
  onNavigateToDashboard?: () => void;
}

export const ExportDataModule: React.FC<ExportDataModuleProps> = ({ units }) => {
  const [selectedCategory, setSelectedCategory] = useState<ExportCategory>('rd-units');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isExportSuccess, setIsExportSuccess] = useState<string | null>(null);

  // Retrieve all datasets
  const protoUnits = getProtoUnits();
  const ppUnits = getPpUnits();
  const fieldUnits = getFieldUnits();
  const smogUnits = getSmogUnits();
  const activityLogs = getActivityLogs();

  // Helper for CSV download
  const handleExportCSV = (filename: string, rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) {
      alert('No records available to export for the selected filter.');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map(row => 
        headers.map(h => {
          let val = row[h];
          if (val === null || val === undefined) val = '';
          if (typeof val === 'object') val = JSON.stringify(val);
          const escaped = ('' + val).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      )
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    triggerSuccessNotification(`Successfully exported ${rows.length} rows to CSV!`);
  };

  // Helper for JSON download
  const handleExportJSON = (filename: string, data: any) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    triggerSuccessNotification(`Successfully exported JSON backup file!`);
  };

  // Helper for Printable PDF Report
  const handlePrintPDFReport = (title: string, columns: string[], dataRows: Record<string, any>[]) => {
    const printWindow = window.open('', '_blank', 'width=950,height=1000');
    if (!printWindow) {
      alert('Please allow popups to view and print the report.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title} - LLT Lab Report</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: 11px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0891b2; padding-bottom: 12px; margin-bottom: 16px; }
            .header h1 { margin: 0; font-size: 22px; color: #0891b2; letter-spacing: -0.5px; }
            .header p { margin: 3px 0 0 0; color: #64748b; font-size: 11px; }
            .meta { font-size: 10px; text-align: right; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #0891b2; color: #ffffff; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; uppercase; text-transform: uppercase; }
            td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .footer { margin-top: 25px; padding-top: 12px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 9px; color: #64748b; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; }
            .badge-success { background: #dcfce7; color: #166534; }
            .badge-live { background: #e0f2fe; color: #0369a1; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>LLT LAB DATA REPORT</h1>
              <p>Official Testing Laboratory Audit & Section Dataset - ${title}</p>
            </div>
            <div class="meta">
              <strong>Generated On:</strong> ${new Date().toLocaleString()}<br/>
              <strong>Total Records:</strong> ${dataRows.length}<br/>
              <strong>Status:</strong> Verified Official Export
            </div>
          </div>

          <table>
            <thead>
              <tr>
                ${columns.map(c => `<th>${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${dataRows.map(row => `
                <tr>
                  ${columns.map(c => {
                    let val = row[c] ?? '-';
                    if (typeof val === 'object') val = JSON.stringify(val);
                    return `<td>${val}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <span>LLT Lab Operational Monitoring System &copy; ${new Date().getFullYear()}</span>
            <span>Document ID: LLT-EXP-${Math.floor(100000 + Math.random() * 900000)}</span>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const triggerSuccessNotification = (msg: string) => {
    setIsExportSuccess(msg);
    setTimeout(() => {
      setIsExportSuccess(null);
    }, 4000);
  };

  // Filter datasets based on category, search, month, and status
  const getFilteredData = () => {
    switch (selectedCategory) {
      case 'rd-units': {
        return units.filter(u => {
          const matchSearch = searchQuery === '' || 
            u.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.bsrPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.eltPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.rdPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.currentHolder.toLowerCase().includes(searchQuery.toLowerCase());
          
          const matchStatus = statusFilter === 'all' || 
            (statusFilter === 'live' && u.status !== 'completed' && u.status !== 'received') ||
            (statusFilter === 'completed' && (u.status === 'completed' || u.status === 'received'));

          return matchSearch && matchStatus;
        }).map(u => {
          const latestStep = u.timeline && u.timeline.length > 0 ? u.timeline[u.timeline.length - 1] : null;
          const stageInfo = WORKFLOW_STAGES[u.currentStageIndex] || { stageName: `Stage ${u.currentStageIndex + 1}` };
          const obsText = u.observations && u.observations.length > 0 
            ? u.observations.map(o => `[${o.timestamp}] ${o.text}`).join(' | ') 
            : 'None';

          return {
            'Unit ID': u.id,
            'Model Name': u.modelName,
            'Serial Number': u.serialNumber,
            'Status': u.status.toUpperCase(),
            'Current Stage': stageInfo.stageName,
            'Current Holder': u.currentHolder || 'Unassigned',
            'Priority': u.priority || 'Normal',
            'Required Date': u.requiredBy,
            'Day Duration': `${u.dayDuration} Days`,
            'Transfer Date': u.transferDate || 'N/A',
            'BSR Person': u.bsrPerson || 'N/A',
            'ELT Person': u.eltPerson || 'N/A',
            'R&D Contact': u.rdPerson || 'N/A',
            'OQC Inspector': u.oqcPerson || 'N/A',
            'Notes / Remarks': u.notes || 'None',
            'Tracking Steps Count': u.timeline ? u.timeline.length : 0,
            'Latest Tracking Step': latestStep ? `${latestStep.stageName} by ${latestStep.personName} (${latestStep.date} ${latestStep.time})` : 'Initial Stage',
            'Observations': obsText,
            'Created At': u.createdAt,
            'Updated At': u.updatedAt
          };
        });
      }

      case 'proto-units': {
        return protoUnits.filter(p => {
          const matchSearch = searchQuery === '' || 
            p.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.iduSerialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.oduSerialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.requestBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.partsInfo?.iduPcbSupplier || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.partsInfo?.oduCompressorSupplier || '').toLowerCase().includes(searchQuery.toLowerCase());

          const matchStatus = statusFilter === 'all' || p.status === statusFilter;
          return matchSearch && matchStatus;
        }).map(p => {
          const parts = p.partsInfo || {};
          const obsText = p.observations && p.observations.length > 0 
            ? p.observations.map(o => `[${o.timestamp}] ${o.text}`).join(' | ') 
            : 'None';

          return {
            'Proto ID': p.id,
            'Model Name': p.modelName,
            'Station': p.station || 'N/A',
            'IDU Serial Number': p.iduSerialNumber,
            'ODU Serial Number': p.oduSerialNumber,
            'Requested By': p.requestBy,
            'Test Purpose': p.testPurpose,
            'Required Hours': `${p.requiredHour} hrs`,
            'Status': p.status.toUpperCase(),
            // Complete Supplier & Part Code Information
            'IDU PCB Supplier': parts.iduPcbSupplier || 'N/A',
            'IDU PCB Part Code': parts.iduPcbPartCode || 'N/A',
            'IDU Motor Supplier': parts.iduMotorSupplier || 'N/A',
            'IDU Motor Part Code': parts.iduMotorPartCode || 'N/A',
            'ODU PCB Supplier': parts.oduPcbSupplier || 'N/A',
            'ODU PCB Part Code': parts.oduPcbPartCode || 'N/A',
            'ODU Compressor Supplier': parts.oduCompressorSupplier || 'N/A',
            'ODU Compressor Part Code': parts.oduCompressorPartCode || 'N/A',
            'ODU Motor Supplier': parts.oduMotorSupplier || 'N/A',
            'ODU Motor Part Code': parts.oduMotorPartCode || 'N/A',
            'ODU EEV Supplier': parts.oduEevSupplier || 'N/A',
            'ODU EEV Part Code': parts.oduEevPartCode || 'N/A',
            'Remarks': p.remarks || 'None',
            'Observations': obsText,
            'Created At': p.createdAt,
            'Updated At': p.updatedAt
          };
        });
      }

      case 'pp-units': {
        return ppUnits.filter(p => {
          const matchSearch = searchQuery === '' || 
            p.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.iduSerialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.oduSerialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.requestBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.partsInfo?.iduPcbSupplier || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.partsInfo?.oduCompressorSupplier || '').toLowerCase().includes(searchQuery.toLowerCase());

          const matchStatus = statusFilter === 'all' || p.status === statusFilter;
          return matchSearch && matchStatus;
        }).map(p => {
          const parts = p.partsInfo || {};
          const namePlate = p.namePlate || {};
          const report = p.reportDetails || {};
          const obsText = p.observations && p.observations.length > 0 
            ? p.observations.map(o => `[${o.timestamp}] ${o.text}`).join(' | ') 
            : 'None';

          return {
            'PP ID': p.id,
            'Model Name': p.modelName,
            'Station': p.station || 'N/A',
            'IDU Serial Number': p.iduSerialNumber,
            'ODU Serial Number': p.oduSerialNumber,
            'Requested By': p.requestBy,
            'Test Purpose': p.testPurpose,
            'Required Hours': `${p.requiredHour} hrs`,
            'Status': p.status.toUpperCase(),
            // Nameplate & Electrical / Gas Specs
            'Rated Power': namePlate.ratedPower || 'N/A',
            'Rated Current': namePlate.ratedCurrent || 'N/A',
            'Cooling Capacity': namePlate.coolingCapacity || 'N/A',
            'Voltage': namePlate.voltage || 'N/A',
            'ISEER Rating': namePlate.iseer || 'N/A',
            'Gas Qty': namePlate.gasQty || 'N/A',
            'Refrigerant': namePlate.refrigerant || 'N/A',
            'Main Program Checksum IDU': namePlate.mainProgramChecksumIdu || 'N/A',
            'Main Program Checksum ODU': namePlate.mainProgramChecksumOdu || 'N/A',
            'EE Checksum IDU': namePlate.eeChecksumIdu || 'N/A',
            'EE Checksum ODU': namePlate.eeChecksumOdu || 'N/A',
            // Report Details
            'Report No': report.reportNo || 'N/A',
            'Sample Received': report.sampleReceived || 'N/A',
            'Test Commenced': report.testCommenced || 'N/A',
            'Test Completed': report.testCompleted || 'N/A',
            // Supplier & Part Code Information
            'IDU Motor Spec': parts.iduMotorSpec || 'N/A',
            'IDU Motor Supplier': parts.iduMotorSupplier || 'N/A',
            'IDU Motor Part Code': parts.iduMotorPartCode || 'N/A',
            'IDU PCB Supplier': parts.iduPcbSupplier || 'N/A',
            'IDU PCB Part Code': parts.iduPcbPartCode || 'N/A',
            'ODU Motor Spec': parts.oduMotorSpec || 'N/A',
            'ODU Motor Supplier': parts.oduMotorSupplier || 'N/A',
            'ODU Motor Part Code': parts.oduMotorPartCode || 'N/A',
            'ODU PCB Supplier': parts.oduPcbSupplier || 'N/A',
            'ODU PCB Part Code': parts.oduPcbPartCode || 'N/A',
            'Compressor Spec': parts.compressorSpec || (parts as any).oduCompressorSpec || 'N/A',
            'Compressor Supplier': parts.compressorSupplier || (parts as any).oduCompressorSupplier || 'N/A',
            'Compressor Part Code': parts.compressorPartCode || (parts as any).oduCompressorPartCode || 'N/A',
            'EEV Spec': parts.eevSpec || (parts as any).oduEevSpec || 'N/A',
            'EEV Supplier': parts.eevSupplier || (parts as any).oduEevSupplier || 'N/A',
            'EEV Part Code': parts.eevPartCode || (parts as any).oduEevPartCode || 'N/A',
            'Remarks': p.remarks || 'None',
            'Observations': obsText,
            'Created At': p.createdAt,
            'Updated At': p.updatedAt
          };
        });
      }

      case 'pp-models': {
        return ppUnits.filter(p => {
          const matchSearch = searchQuery === '' || 
            p.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.materialCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.version || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.unitType || '').toLowerCase().includes(searchQuery.toLowerCase());

          const matchStatus = statusFilter === 'all' || 
            (statusFilter === 'live' && (p.unitType === 'IDU' || p.unitType === 'ODU')) ||
            (statusFilter === 'completed' && p.unitType === 'BOTH');

          return matchSearch && matchStatus;
        }).map((p, idx) => ({
          'S.No': idx + 1,
          'Model ID': p.id,
          'Model Name': p.modelName,
          'Unit Type': p.unitType || (p.iduSerialNumber && !p.oduSerialNumber ? 'IDU' : p.oduSerialNumber && !p.iduSerialNumber ? 'ODU' : 'BOTH'),
          'Material Code': p.materialCode || 'MAT-1001',
          'Version': p.version || 'V1.0',
          'Quantity': typeof p.quantity === 'number' ? p.quantity : 1,
          'Station Assigned': p.station || 'Station 01',
          'Status': (p.status || 'Active').toUpperCase(),
          'Created Date': p.createdAt || 'N/A'
        }));
      }

      case 'field-units': {
        return fieldUnits.filter(f => {
          const matchSearch = searchQuery === '' || 
            f.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.requestBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.station.toLowerCase().includes(searchQuery.toLowerCase());

          const matchStatus = statusFilter === 'all' || f.status === statusFilter;
          return matchSearch && matchStatus;
        }).map(f => {
          const obsText = f.observations && f.observations.length > 0 
            ? f.observations.map(o => `[${o.timestamp}] ${o.text}`).join(' | ') 
            : 'None';

          return {
            'Field ID': f.id,
            'Model Name': f.modelName,
            'Product Type': f.productType,
            'Serial Number': f.serialNumber,
            'IDU Serial': f.iduSerialNumber || 'N/A',
            'ODU Serial': f.oduSerialNumber || 'N/A',
            'Requested By': f.requestBy,
            'Station': f.station,
            'Start Date Time': f.startDateTime,
            'End Date Time': f.endDateTime || 'In Progress',
            'Required Hours': `${f.requiredHour} hrs`,
            'Status': f.status.toUpperCase(),
            'Remarks': f.remarks || 'None',
            'Observations': obsText,
            'Created At': f.createdAt,
            'Updated At': f.updatedAt
          };
        });
      }

      case 'smog-units': {
        return smogUnits.filter(s => {
          const serialsStr = Array.isArray(s.serialNumbers) ? s.serialNumbers.join(', ') : (s as any).serialNumber || '';
          const person = s.smogPerson || (s as any).inspectorName || '';
          const matchSearch = searchQuery === '' || 
            s.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            serialsStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
            person.toLowerCase().includes(searchQuery.toLowerCase());

          return matchSearch;
        }).map(s => ({
          'Leak Unit ID': s.id,
          'Model Name': s.modelName,
          'Shift': s.shift,
          'Smog Person': s.smogPerson || (s as any).inspectorName || 'N/A',
          'Serial Numbers': Array.isArray(s.serialNumbers) ? s.serialNumbers.join(', ') : (s as any).serialNumber || 'N/A',
          'Suspect Count': s.suspectCount || (s.serialNumbers ? s.serialNumbers.length : 0),
          'Actual (Passed) Count': s.actualCount || (s.passedSerials ? s.passedSerials.length : 0),
          'Date': s.date,
          'Time': s.time,
          'Notes': s.notes || 'N/A'
        }));
      }

      case 'activity-logs': {
        return activityLogs.filter(a => {
          return searchQuery === '' || 
            a.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.performedBy.toLowerCase().includes(searchQuery.toLowerCase());
        }).map(a => ({
          'Log ID': a.id,
          'Action': a.action,
          'Model Name': a.modelName,
          'Serial Number': a.serialNumber,
          'Performed By': a.performedBy,
          'Stage Name': a.stageName || 'N/A',
          'Type': a.type.toUpperCase(),
          'Unit ID': a.unitId || 'N/A',
          'Timestamp': a.timestamp
        }));
      }

      case 'full-backup': {
        return [{
          'System Version': 'LLT Lab v2.5',
          'Backup Time': new Date().toISOString(),
          'Total R&D Units': units.length,
          'Total Proto Units': protoUnits.length,
          'Total PP Units': ppUnits.length,
          'Total PP Model List': ppUnits.length,
          'Total Field Units': fieldUnits.length,
          'Total Smog Units': smogUnits.length,
          'Total Activity Logs': activityLogs.length
        }];
      }

      default:
        return [];
    }
  };

  const filteredRows = getFilteredData();
  const columnsList = filteredRows.length > 0 ? Object.keys(filteredRows[0]) : [];

  const handleExecuteExportCSV = () => {
    handleExportCSV(`LLT_Lab_${selectedCategory.toUpperCase()}`, filteredRows);
  };

  const handleExecuteExportJSON = () => {
    if (selectedCategory === 'full-backup') {
      const fullBackupData = {
        exportedAt: new Date().toISOString(),
        system: 'LLT Lab Operational System',
        data: {
          rdUnits: units,
          protoUnits,
          ppUnits,
          ppModelList: ppUnits,
          fieldUnits,
          smogUnits,
          activityLogs
        }
      };
      handleExportJSON('LLT_Lab_Full_System_Backup', fullBackupData);
    } else {
      handleExportJSON(`LLT_Lab_${selectedCategory.toUpperCase()}`, filteredRows);
    }
  };

  const handleExecutePrintReport = () => {
    if (filteredRows.length === 0) {
      alert('No records to print in the report.');
      return;
    }
    handlePrintPDFReport(`LLT Lab ${selectedCategory.toUpperCase()} Report`, columnsList, filteredRows);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/60 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="p-3 rounded-2xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-lg shadow-cyan-950/50">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 font-mono tracking-tight flex items-center gap-2">
              Export Data Center
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-extrabold uppercase">
                CSV • JSON • PDF
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any laboratory section, filter datasets, and download formatted reports or raw backups.
            </p>
          </div>
        </div>

        {/* Action Export Buttons */}
        <div className="flex flex-wrap items-center gap-2 relative z-10">
          <button
            type="button"
            onClick={handleExecuteExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs shadow-md shadow-emerald-950/60 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExecuteExportJSON}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs shadow-md shadow-cyan-950/60 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <FileJson className="w-4 h-4" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handleExecutePrintReport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-mono font-bold text-xs shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            <span>Print PDF Report</span>
          </button>
        </div>
      </div>

      {/* Export Success Notification Toast */}
      {isExportSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 text-xs font-mono font-bold flex items-center gap-2 animate-in fade-in duration-200 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{isExportSuccess}</span>
        </div>
      )}

      {/* Category Selection Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {[
          { id: 'rd-units' as ExportCategory, label: 'R&D Units', icon: Boxes, count: units.length, color: 'text-cyan-400' },
          { id: 'proto-units' as ExportCategory, label: 'Proto Units', icon: Cpu, count: protoUnits.length, color: 'text-blue-400' },
          { id: 'pp-units' as ExportCategory, label: 'PP Units', icon: Cpu, count: ppUnits.length, color: 'text-indigo-400' },
          { id: 'pp-models' as ExportCategory, label: 'Model List', icon: Layers, count: ppUnits.length, color: 'text-teal-400' },
          { id: 'field-units' as ExportCategory, label: 'Field Units', icon: Compass, count: fieldUnits.length, color: 'text-amber-400' },
          { id: 'smog-units' as ExportCategory, label: 'Smog Section', icon: Cloud, count: smogUnits.length, color: 'text-purple-400' },
          { id: 'activity-logs' as ExportCategory, label: 'Activity Logs', icon: History, count: activityLogs.length, color: 'text-emerald-400' },
          { id: 'full-backup' as ExportCategory, label: 'Full Backup', icon: Database, count: 'ALL', color: 'text-rose-400' },
        ].map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const IconComp = cat.icon;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between gap-2 cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 border-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/50 scale-[1.02]'
                  : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <IconComp className={`w-5 h-5 ${cat.color}`} />
                <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300">
                  {cat.count}
                </span>
              </div>
              <div>
                <div className="text-xs font-mono font-bold text-slate-200">
                  {cat.label}
                </div>
                <div className="text-[10px] text-slate-400">
                  {isSelected ? 'Selected' : 'Click to View'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      {selectedCategory !== 'full-backup' && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${selectedCategory.replace('-', ' ')}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none text-xs font-bold cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Statuses</option>
                <option value="live" className="bg-slate-900">Live / Active</option>
                <option value="completed" className="bg-slate-900">Completed / Received</option>
              </select>
            </div>

            <div className="text-xs font-mono font-bold text-cyan-400 px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-800/60">
              {filteredRows.length} Records Ready
            </div>
          </div>
        </div>
      )}

      {/* Live Data Preview Table */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="uppercase">{selectedCategory.replace('-', ' ')} Live Preview</span>
          </div>

          <span className="text-[11px] font-mono text-slate-400">
            Showing {filteredRows.length} exported items
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-mono text-xs">
            No matching records found for the selected category and search filters.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950/90 text-slate-400 font-mono text-[11px] uppercase sticky top-0 z-10 border-b border-slate-800">
                <tr>
                  {columnsList.map((col) => (
                    <th key={col} className="px-4 py-3 whitespace-nowrap font-bold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono text-slate-300">
                {filteredRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    {columnsList.map((col) => {
                      const val = row[col];
                      const isStatus = col.toLowerCase().includes('status');
                      return (
                        <td key={col} className="px-4 py-3 whitespace-nowrap max-w-xs truncate">
                          {isStatus ? (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-extrabold uppercase">
                              {String(val)}
                            </span>
                          ) : (
                            String(val ?? '-')
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
