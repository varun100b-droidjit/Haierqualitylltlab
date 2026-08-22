import React, { useRef } from 'react';
import { 
  X, 
  Download, 
  FileText, 
  Printer, 
  CheckCircle2, 
  Sparkles,
  Award,
  Layers,
  Cpu,
  Package,
  Image as ImageIcon
} from 'lucide-react';
import { downloadFile, downloadElementAsPdf, generateDocxBlob, generateReportBundleZip } from '../../utils/docxGenerator';
import { MasterTemplate, getMasterTemplate } from '../../services/reportTemplateStore';

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterTemplate: MasterTemplate | null;
  reportTitle: string;
  unitData: Record<string, any>;
  photoUrls: Record<string, string>;
}

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  onClose,
  masterTemplate,
  reportTitle,
  unitData,
  photoUrls
}) => {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isZipping, setIsZipping] = React.useState(false);

  if (!isOpen) return null;

  const getEffectiveTemplate = (): MasterTemplate | null => {
    if (masterTemplate && masterTemplate.base64Data) return masterTemplate;
    const isReliability = reportTitle.toLowerCase().includes('reliability') || reportTitle.toLowerCase().includes('experience');
    return getMasterTemplate(isReliability ? 'reliability' : 'proto');
  };

  const handleDownloadDocx = () => {
    const tpl = getEffectiveTemplate();
    if (!tpl?.base64Data) {
      alert("No master template available.");
      return;
    }

    try {
      const docxBlob = generateDocxBlob(tpl.base64Data, unitData, photoUrls);
      const safeName = (unitData.Model_Name || unitData.modelName || 'Proto_Unit').replace(/\s+/g, '_');
      downloadFile(docxBlob, `${reportTitle.replace(/\s+/g, '_')}_${safeName}.docx`);
    } catch (err) {
      console.error(err);
      alert("Failed to generate DOCX report.");
    }
  };

  const handleDownloadZipPackage = async () => {
    const tpl = getEffectiveTemplate();
    if (!tpl?.base64Data) {
      alert("No master template available.");
      return;
    }

    setIsZipping(true);
    try {
      const result = await generateReportBundleZip(
        tpl.base64Data,
        unitData,
        photoUrls,
        reportTitle
      );
      downloadFile(result.blob, result.fileName);
    } catch (err) {
      console.error(err);
      alert("Failed to generate Report ZIP Package.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!previewContainerRef.current) return;
    const safeName = (unitData.Model_Name || unitData.modelName || 'Proto_Unit').replace(/\s+/g, '_');
    await downloadElementAsPdf(previewContainerRef.current, `${reportTitle.replace(/\s+/g, '_')}_${safeName}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95">
        
        {/* Modal Top Toolbar */}
        <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>{reportTitle}</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-bold uppercase">
                  Live Preview
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Official Laboratory Inspection Report Preview
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isZipping}
              onClick={handleDownloadZipPackage}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer ring-1 ring-cyan-400/40"
              title="Download full package with DOCX report and named Photos folder"
            >
              {isZipping ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Package className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{isZipping ? 'Packing...' : 'Download Package (.ZIP)'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadDocx}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">DOCX</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content / Printable Document Area */}
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto bg-slate-950/60">
          <div 
            ref={previewContainerRef}
            className="max-w-4xl mx-auto bg-white text-slate-900 rounded-xl shadow-2xl p-6 sm:p-12 space-y-8 font-sans border border-slate-200"
            style={{ minHeight: '1000px' }}
          >
            {/* Document Header */}
            <div className="border-b-4 border-cyan-800 pb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-2xl text-cyan-900 tracking-wider">LLT LABS</span>
                  <span className="text-xs font-bold text-slate-500 uppercase border-l-2 border-slate-300 pl-2">Industrial Test Division</span>
                </div>
                <h1 className="text-xl font-extrabold text-slate-900 mt-2 uppercase tracking-wide">
                  OFFICIAL {reportTitle.toUpperCase()}
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Document Reference: <strong className="text-slate-800 font-mono">{unitData.Report_No || 'PRT-2026-001'}</strong>
                </p>
              </div>

              <div className="text-right space-y-1">
                <div className="inline-block px-3 py-1 rounded bg-slate-100 border border-slate-300 text-slate-800 font-mono font-extrabold text-xs">
                  {unitData.Model_Name || 'MODEL-X'}
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  Station: {unitData.Station || 'Station 01'}
                </p>
                <p className="text-[10px] text-emerald-700 font-bold uppercase">
                  Status: VERIFIED & COMPLIANT
                </p>
              </div>
            </div>

            {/* General Unit Information Grid */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-cyan-900 bg-cyan-50 p-2 rounded border-l-4 border-cyan-700 mb-3">
                1. General Sample Details
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block font-bold">Model Name:</span>
                  <strong className="text-slate-900 text-sm">{unitData.Model_Name || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold">Sample Type:</span>
                  <strong className="text-cyan-900 font-bold">{unitData.Sample_Type || unitData["Sample Type"] || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold">Report Number:</span>
                  <strong className="text-slate-900 font-mono">{unitData.Report_No || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold">Requested By:</span>
                  <strong className="text-slate-900">{unitData.Request_By || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold">Sample Received:</span>
                  <strong className="text-slate-900 font-mono">{unitData.Sample_Received || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold">Test Commenced:</span>
                  <strong className="text-slate-900 font-mono">{unitData.Test_Commenced || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold">Test Completed:</span>
                  <strong className="text-slate-900 font-mono">{unitData.Test_Completed || 'N/A'}</strong>
                </div>
              </div>
            </div>

            {/* Performance Specifications */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-cyan-900 bg-cyan-50 p-2 rounded border-l-4 border-cyan-700 mb-3">
                2. Rating & Performance Metrics
              </h3>
              <table className="w-full text-left text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px]">
                    <th className="p-2.5 border border-slate-200">Parameter</th>
                    <th className="p-2.5 border border-slate-200">Value</th>
                    <th className="p-2.5 border border-slate-200">Parameter</th>
                    <th className="p-2.5 border border-slate-200">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="p-2.5 font-bold border border-slate-200">Cooling Capacity:</td>
                    <td className="p-2.5 font-mono text-cyan-900 font-extrabold border border-slate-200">{unitData.Cooling_capacity || unitData.Cooling_Capacity || 'N/A'}</td>
                    <td className="p-2.5 font-bold border border-slate-200">Power Mode:</td>
                    <td className="p-2.5 border border-slate-200">{unitData.Power_mode || unitData.Power_Mode || unitData.powerMode || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold border border-slate-200">Refrigerant:</td>
                    <td className="p-2.5 font-mono border border-slate-200">{unitData.Refrigerant || unitData.refrigerant || 'N/A'}</td>
                    <td className="p-2.5 font-bold border border-slate-200">Gas Injection Volume:</td>
                    <td className="p-2.5 font-mono border border-slate-200">{unitData.Gas_injection_Volume || unitData.Gas_Injection_Volume || unitData.gasInjectionVolume || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold border border-slate-200">ISEER Rating:</td>
                    <td className="p-2.5 font-mono text-emerald-800 font-bold border border-slate-200">{unitData.ISEER || unitData.iseer || 'N/A'}</td>
                    <td className="p-2.5 font-bold border border-slate-200">Compressor Spec:</td>
                    <td className="p-2.5 border border-slate-200">{unitData.Compressor_Spec || unitData["Compressor _Spec"] || unitData.compressorSpec || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Parts & Components Specification Table */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-cyan-900 bg-cyan-50 p-2 rounded border-l-4 border-cyan-700 mb-3">
                3. Sub-Assembly & Parts Bill of Materials (BOM)
              </h3>
              <table className="w-full text-left text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold uppercase text-[11px]">
                    <th className="p-2 border border-slate-200">Sub-Assembly</th>
                    <th className="p-2 border border-slate-200">Specification</th>
                    <th className="p-2 border border-slate-200">Part Code</th>
                    <th className="p-2 border border-slate-200">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  <tr>
                    <td className="p-2 font-bold border border-slate-200">IDU Motor</td>
                    <td className="p-2 border border-slate-200">{unitData.IDU_Motor_Spec || 'BLDC 230V'}</td>
                    <td className="p-2 font-mono text-cyan-900 border border-slate-200">{unitData.IDU_Motor_Part_Code || 'N/A'}</td>
                    <td className="p-2 border border-slate-200">{unitData.IDU_Motor_Supplier || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border border-slate-200">IDU PCB</td>
                    <td className="p-2 border border-slate-200">Main Control Micro-Controller</td>
                    <td className="p-2 font-mono text-cyan-900 border border-slate-200">{unitData.IDU_PCB_Part_Code || 'N/A'}</td>
                    <td className="p-2 border border-slate-200">{unitData.IDU_PCB_Supplier || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border border-slate-200">ODU Motor</td>
                    <td className="p-2 border border-slate-200">{unitData.ODU_Motor_Spec || 'Axial Fan Motor'}</td>
                    <td className="p-2 font-mono text-cyan-900 border border-slate-200">{unitData.ODU_Motor_Part_Code || 'N/A'}</td>
                    <td className="p-2 border border-slate-200">{unitData.ODU_Motor_Supplier || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border border-slate-200">ODU PCB</td>
                    <td className="p-2 border border-slate-200">Inverter Drive Power Board</td>
                    <td className="p-2 font-mono text-cyan-900 border border-slate-200">{unitData.ODU_PCB_Part_Code || 'N/A'}</td>
                    <td className="p-2 border border-slate-200">{unitData.ODU_PCB_Supplier || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border border-slate-200">Compressor</td>
                    <td className="p-2 border border-slate-200">{unitData.Compressor_Spec || 'Rotary Inverter'}</td>
                    <td className="p-2 font-mono text-cyan-900 border border-slate-200">{unitData.Compressor_Part_Code || 'N/A'}</td>
                    <td className="p-2 border border-slate-200">{unitData.Compressor_Supplier || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold border border-slate-200">EEV Valve</td>
                    <td className="p-2 border border-slate-200">{unitData.EEV_Spec || 'Pulse Expansion Valve'}</td>
                    <td className="p-2 font-mono text-cyan-900 border border-slate-200">{unitData.EEV_Part_Code || 'N/A'}</td>
                    <td className="p-2 border border-slate-200">{unitData.EEV_Supplier || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Section 4: Automatic Photo Placement Gallery (Fixed 6cm x 4cm aspect ratio, centered) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-cyan-50 p-2.5 rounded-lg border-l-4 border-cyan-700">
                <h3 className="text-xs font-black uppercase tracking-wider text-cyan-950">
                  4. Sample Photographs Gallery
                </h3>
                <span className="text-[10px] font-bold text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded border border-cyan-300">
                  11 Inspection Photos
                </span>
              </div>

              {/* Packaging Photos */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1">
                  📦 Packaging & Unboxing
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Product Packing', key: 'PHOTO_Product_Packing', url: photoUrls.PHOTO_Product_Packing || photoUrls.productPhoto },
                    { label: 'Packing Box', key: 'PHOTO_Packing_Box', url: photoUrls.PHOTO_Packing_Box || photoUrls.packingBoxPhoto }
                  ].map((item, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col items-center justify-center space-y-1.5">
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="text-[11px] font-bold text-slate-800">{item.label}</span>
                        {item.url && item.url !== 'NA' && (
                          <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Attached</span>
                        )}
                      </div>
                      <div className="w-[226px] h-[151px] bg-white border border-slate-300 rounded overflow-hidden flex items-center justify-center shadow-inner">
                        {item.url && item.url !== 'NA' ? (
                          <img src={item.url} alt={item.label} className="w-full h-full object-contain p-1" />
                        ) : (
                          <div className="text-[10px] text-slate-400 font-medium text-center p-2 flex flex-col items-center justify-center gap-1">
                            <ImageIcon className="w-6 h-6 text-slate-300 opacity-60" />
                            <span>No Photo Attached</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* IDU Photos */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1">
                  🏢 Indoor Unit (IDU) Assembly
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'IDU Motor', key: 'PHOTO_IDU_Motor', url: photoUrls.PHOTO_IDU_Motor || photoUrls.iduMotorPhoto || photoUrls.motorPhoto },
                    { label: 'IDU PCB', key: 'PHOTO_IDU_PCB', url: photoUrls.PHOTO_IDU_PCB || photoUrls.iduPcbPhoto },
                    { label: 'IDU Name Plate', key: 'PHOTO_IDU_Product_Name_Plate', url: photoUrls.PHOTO_IDU_Product_Name_Plate || photoUrls.PHOTO_IDU_Name_Plate || photoUrls.iduNameplatePhoto },
                    { label: 'Remote', key: 'PHOTO_Remote', url: photoUrls.PHOTO_Remote || photoUrls.remotePhoto || photoUrls.stickerPhoto }
                  ].map((item, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-col items-center justify-center space-y-1.5">
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="text-[10px] font-bold text-slate-800 truncate">{item.label}</span>
                        {item.url && item.url !== 'NA' && (
                          <span className="text-[8px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">Attached</span>
                        )}
                      </div>
                      <div className="w-[180px] h-[120px] bg-white border border-slate-300 rounded overflow-hidden flex items-center justify-center shadow-inner">
                        {item.url && item.url !== 'NA' ? (
                          <img src={item.url} alt={item.label} className="w-full h-full object-contain p-1" />
                        ) : (
                          <div className="text-[9px] text-slate-400 font-medium text-center p-2 flex flex-col items-center justify-center gap-1">
                            <ImageIcon className="w-5 h-5 text-slate-300 opacity-60" />
                            <span>No Photo</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ODU Photos */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1">
                  ⚙️ Outdoor Unit (ODU) Assembly
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'ODU Name Plate', key: 'PHOTO_ODU_Name_Plate', url: photoUrls.PHOTO_ODU_Name_Plate || photoUrls.oduNameplatePhoto },
                    { label: 'ODU Motor', key: 'PHOTO_ODU_Motor', url: photoUrls.PHOTO_ODU_Motor || photoUrls.oduMotorPhoto },
                    { label: 'ODU PCB', key: 'PHOTO_ODU_PCB', url: photoUrls.PHOTO_ODU_PCB || photoUrls.oduPcbPhoto }
                  ].map((item, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-col items-center justify-center space-y-1.5">
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="text-[10px] font-bold text-slate-800 truncate">{item.label}</span>
                        {item.url && item.url !== 'NA' && (
                          <span className="text-[8px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">Attached</span>
                        )}
                      </div>
                      <div className="w-[180px] h-[120px] bg-white border border-slate-300 rounded overflow-hidden flex items-center justify-center shadow-inner">
                        {item.url && item.url !== 'NA' ? (
                          <img src={item.url} alt={item.label} className="w-full h-full object-contain p-1" />
                        ) : (
                          <div className="text-[9px] text-slate-400 font-medium text-center p-2 flex flex-col items-center justify-center gap-1">
                            <ImageIcon className="w-5 h-5 text-slate-300 opacity-60" />
                            <span>No Photo</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Refrigeration & Valves */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1">
                  ❄️ Refrigeration & Expansion Circuit
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Electronic Expansion Valve (EEV)', key: 'PHOTO_Electronic_Expansion_Valve', url: photoUrls.PHOTO_Electronic_Expansion_Valve || photoUrls.PHOTO_EEV || photoUrls.oduEevPhoto || photoUrls.eevPhoto },
                    { label: 'ODU Compressor', key: 'PHOTO_ODU_Compressor', url: photoUrls.PHOTO_ODU_Compressor || photoUrls.PHOTO_Compressor || photoUrls.oduCompressorPhoto || photoUrls.compressorPhoto }
                  ].map((item, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col items-center justify-center space-y-1.5">
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="text-[11px] font-bold text-slate-800">{item.label}</span>
                        {item.url && item.url !== 'NA' && (
                          <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Attached</span>
                        )}
                      </div>
                      <div className="w-[226px] h-[151px] bg-white border border-slate-300 rounded overflow-hidden flex items-center justify-center shadow-inner">
                        {item.url && item.url !== 'NA' ? (
                          <img src={item.url} alt={item.label} className="w-full h-full object-contain p-1" />
                        ) : (
                          <div className="text-[10px] text-slate-400 font-medium text-center p-2 flex flex-col items-center justify-center gap-1">
                            <ImageIcon className="w-6 h-6 text-slate-300 opacity-60" />
                            <span>No Photo Attached</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 5: Test Conclusion */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                5. Final Test Conclusion
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed italic font-medium">
                "{unitData.Test_Conclusion || 'Sample unit underwent complete performance and thermal stress testing according to standard protocols. All components and electrical parameters met design specifications without defects.'}"
              </p>
            </div>

            {/* Signatures Footer */}
            <div className="pt-8 border-t border-slate-300 flex items-end justify-between text-xs text-slate-600">
              <div>
                <p><strong>Tested By:</strong> Indrajit Sharma (Testing Lead)</p>
                <p><strong>LLT Quality Lab:</strong> Certified Pass</p>
              </div>

              <div className="text-right">
                <p className="font-mono text-[10px]">Date Generated: {new Date().toLocaleDateString()}</p>
                <div className="mt-6 border-t border-slate-400 pt-1 font-bold text-slate-800 inline-block px-4">
                  Authorized Signatory Signature
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
