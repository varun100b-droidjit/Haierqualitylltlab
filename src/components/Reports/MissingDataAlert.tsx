import React, { useState } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  FileText, 
  Image as ImageIcon, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Check, 
  AlertTriangle,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';

export interface PlaceholderMappingItem {
  tag: string; // e.g. {{Report No}}, {{PHOTO_ODU_Compressor}}
  type: 'text' | 'photo';
  fieldName: string; // e.g. "Report Number", "ODU Compressor Photo"
  currentValue: string;
  isMapped: boolean;
  status: 'mapped' | 'missing' | 'unmatched';
}

interface MissingDataAlertProps {
  missingFields: string[];
  missingPhotos: string[];
  isTemplateMissing?: boolean;
  isUnitMissing?: boolean;
  detectedTextPlaceholders?: string[];
  detectedPhotoPlaceholders?: string[];
  dataValuesMap?: Record<string, string>;
  photosMap?: Record<string, string>;
}

export const MissingDataAlert: React.FC<MissingDataAlertProps> = ({
  missingFields,
  missingPhotos,
  isTemplateMissing,
  isUnitMissing,
  detectedTextPlaceholders = [],
  detectedPhotoPlaceholders = [],
  dataValuesMap = {},
  photosMap = {}
}) => {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [inspectorFilter, setInspectorFilter] = useState<'all' | 'text' | 'photo' | 'missing'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const totalMissingCount = (isTemplateMissing ? 1 : 0) + (isUnitMissing ? 1 : 0) + missingFields.length + missingPhotos.length;

  // Build mapping items for all detected or standard placeholders
  const mappingItems: PlaceholderMappingItem[] = React.useMemo(() => {
    const items: PlaceholderMappingItem[] = [];
    const seenTags = new Set<string>();

    // 1. Process detected text placeholders
    detectedTextPlaceholders.forEach(tag => {
      const cleanTag = tag.trim().replace(/^\{\{|\}\}$/g, '');
      const val = dataValuesMap[cleanTag] || dataValuesMap[cleanTag.replace(/[\s_]+/g, '_')] || dataValuesMap[cleanTag.replace(/_/g, ' ')] || '';
      const isMapped = Boolean(val && val.trim() !== '' && val !== 'NA');
      seenTags.add(tag);
      items.push({
        tag: tag.startsWith('{{') ? tag : `{{${tag}}}`,
        type: 'text',
        fieldName: cleanTag.replace(/_/g, ' '),
        currentValue: val || '(Empty)',
        isMapped,
        status: isMapped ? 'mapped' : 'missing'
      });
    });

    // 2. If no detected text placeholders passed, include standard ones
    if (detectedTextPlaceholders.length === 0) {
      const defaultTextKeys = [
        'Report No', 'Model_Name', 'Sample_Type', 'Sample_Code_IDU', 'Sample_CodeI_ODU',
        'Sample_Received', 'Test_Commenced', 'Test_Completed', 'Cooling_capacity', 'Refrigerant',
        'ISEER', 'IDU_Motor_Spec', 'IDU_Motor_Part_Code', 'IDU_Motor_Supplier',
        'IDU_PCB_Part_Code', 'IDU_PCB_Supplier', 'ODU_Motor_Spec', 'ODU_Motor_Part_Code',
        'ODU_Motor_Supplier', 'ODU_PCB_Part_Code', 'ODU_PCB_Supplier', 'Compressor_Spec',
        'Compressor_Part_Code', 'Compressor_Supplier', 'EEV_Spec', 'EEV_Part_Code',
        'IDU_Serial_Number', 'ODU_Serial_Number'
      ];
      defaultTextKeys.forEach(key => {
        const val = dataValuesMap[key] || dataValuesMap[key.replace(/_/g, ' ')] || '';
        const isMapped = Boolean(val && val.trim() !== '' && val !== 'NA');
        items.push({
          tag: `{{${key}}}`,
          type: 'text',
          fieldName: key.replace(/_/g, ' '),
          currentValue: val || '(Empty)',
          isMapped,
          status: isMapped ? 'mapped' : 'missing'
        });
      });
    }

    // 3. Process photo placeholders
    const standardPhotoKeys = [
      { tag: '{{PHOTO_ Product_Packing}}', key: 'PHOTO_Product_Packing', name: 'Product Packing Photo' },
      { tag: '{{PHOTO_Packing_Box}}', key: 'PHOTO_Packing_Box', name: 'Packing Box Photo' },
      { tag: '{{PHOTO_IDU_Motor}}', key: 'PHOTO_IDU_Motor', name: 'IDU Motor Photo' },
      { tag: '{{PHOTO_IDU_PCB}}', key: 'PHOTO_IDU_PCB', name: 'IDU PCB Photo' },
      { tag: '{{PHOTO_IDU_Product_Name_Plate}}', key: 'PHOTO_IDU_Product_Name_Plate', name: 'IDU Product Name Plate' },
      { tag: '{{PHOTO_Remote}}', key: 'PHOTO_Remote', name: 'Remote Controller Photo' },
      { tag: '{{PHOTO_ODU_Name_Plate}}', key: 'PHOTO_ODU_Name_Plate', name: 'ODU Name Plate Photo' },
      { tag: '{{PHOTO_ODU_Motor}}', key: 'PHOTO_ODU_Motor', name: 'ODU Motor Photo' },
      { tag: '{{PHOTO_ODU_PCB}}', key: 'PHOTO_ODU_PCB', name: 'ODU PCB Photo' },
      { tag: '{{PHOTO_Electronic_Expansion_Valve}}', key: 'PHOTO_Electronic_Expansion_Valve', name: 'Electronic Expansion Valve Photo' },
      { tag: '{{PHOTO_ODU_Compressor}}', key: 'PHOTO_ODU_Compressor', name: 'ODU Compressor Photo' }
    ];

    standardPhotoKeys.forEach(p => {
      const val = photosMap[p.key] || photosMap[p.tag] || '';
      const isMapped = Boolean(val && val.trim() !== '' && val !== 'NA');
      items.push({
        tag: p.tag,
        type: 'photo',
        fieldName: p.name,
        currentValue: isMapped ? 'Photo Uploaded (HD Image Ready)' : '(No Photo Uploaded)',
        isMapped,
        status: isMapped ? 'mapped' : 'missing'
      });
    });

    return items;
  }, [detectedTextPlaceholders, detectedPhotoPlaceholders, dataValuesMap, photosMap]);

  const textMappedCount = mappingItems.filter(i => i.type === 'text' && i.isMapped).length;
  const textTotalCount = mappingItems.filter(i => i.type === 'text').length;
  const photoMappedCount = mappingItems.filter(i => i.type === 'photo' && i.isMapped).length;
  const photoTotalCount = mappingItems.filter(i => i.type === 'photo').length;

  const filteredItems = mappingItems.filter(item => {
    if (inspectorFilter === 'text' && item.type !== 'text') return false;
    if (inspectorFilter === 'photo' && item.type !== 'photo') return false;
    if (inspectorFilter === 'missing' && item.isMapped) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.tag.toLowerCase().includes(q) || item.fieldName.toLowerCase().includes(q) || item.currentValue.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* 4 Status Cards Dashboard (Requirement 10) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Text Mapped */}
        <div className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
          textMappedCount === textTotalCount && textTotalCount > 0
            ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
            : 'bg-slate-900/80 border-slate-800 text-slate-200'
        }`}>
          <div className={`p-2 rounded-lg shrink-0 ${
            textMappedCount === textTotalCount && textTotalCount > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
          }`}>
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">✓ Text Mapped</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base sm:text-lg font-black text-white font-mono">{textMappedCount}</span>
              <span className="text-xs text-slate-500 font-mono">/ {textTotalCount}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Photo Mapped */}
        <div className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
          photoMappedCount === photoTotalCount && photoTotalCount > 0
            ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
            : 'bg-slate-900/80 border-slate-800 text-slate-200'
        }`}>
          <div className={`p-2 rounded-lg shrink-0 ${
            photoMappedCount === photoTotalCount && photoTotalCount > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/20 text-cyan-400'
          }`}>
            <ImageIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">✓ Photo Mapped</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base sm:text-lg font-black text-white font-mono">{photoMappedCount}</span>
              <span className="text-xs text-slate-500 font-mono">/ {photoTotalCount}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Missing Data Warning */}
        <div className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
          missingFields.length > 0
            ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
            : 'bg-slate-900/80 border-slate-800 text-slate-400'
        }`}>
          <div className={`p-2 rounded-lg shrink-0 ${
            missingFields.length > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">⚠ Missing Data</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`text-base sm:text-lg font-black font-mono ${missingFields.length > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                {missingFields.length}
              </span>
              <span className="text-xs text-slate-500">field{missingFields.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Missing Photo Warning */}
        <div className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
          missingPhotos.length > 0
            ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
            : 'bg-slate-900/80 border-slate-800 text-slate-400'
        }`}>
          <div className={`p-2 rounded-lg shrink-0 ${
            missingPhotos.length > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
          }`}>
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">⚠ Missing Photo</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`text-base sm:text-lg font-black font-mono ${missingPhotos.length > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                {missingPhotos.length}
              </span>
              <span className="text-xs text-slate-500">photo{missingPhotos.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Missing Items Alert Box if any */}
      {totalMissingCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/80 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400 font-extrabold">
              <ShieldAlert className="w-4 h-4" />
              <span>Validation Warning: {totalMissingCount} item{totalMissingCount > 1 ? 's' : ''} not filled</span>
            </div>
            <button
              type="button"
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              <span>{isInspectorOpen ? 'Hide Mapping Inspector' : 'Inspect Placeholder Mappings'}</span>
              {isInspectorOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {isTemplateMissing && (
              <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10px] font-bold">
                • Master DOCX Template Required
              </span>
            )}
            {isUnitMissing && (
              <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10px] font-bold">
                • Unit Serial Number Required
              </span>
            )}
            {missingFields.map((f, i) => (
              <span key={`f-${i}`} className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-medium">
                • Missing Field: {f}
              </span>
            ))}
            {missingPhotos.map((p, i) => (
              <span key={`p-${i}`} className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-medium">
                • Missing Photo: {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Accordion / Drawer for Placeholder Mapping Inspector (Requirement 10) */}
      <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-md">
        <div 
          onClick={() => setIsInspectorOpen(!isInspectorOpen)}
          className="p-3 bg-slate-900/90 hover:bg-slate-900 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-slate-800"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-black text-white">
              DOCX Exact-Key Placeholder Mapping Inspector
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
              {mappingItems.length} Placeholders Detected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              {isInspectorOpen ? 'Close Table' : 'View Full Placeholder Map'}
            </span>
            {isInspectorOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {isInspectorOpen && (
          <div className="p-3.5 space-y-3">
            {/* Inspector Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 self-start text-xs">
                {[
                  { id: 'all', label: `All (${mappingItems.length})` },
                  { id: 'text', label: `Text (${textTotalCount})` },
                  { id: 'photo', label: `Photos (${photoTotalCount})` },
                  { id: 'missing', label: `Missing (${mappingItems.filter(i => !i.isMapped).length})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInspectorFilter(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      inspectorFilter === tab.id
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter tag or field..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Mapping Table */}
            <div className="border border-slate-800 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/90 text-slate-400 text-[10px] uppercase font-bold sticky top-0 border-b border-slate-800 z-10">
                  <tr>
                    <th className="p-2.5">DOCX Placeholder Tag</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Mapped Website Field</th>
                    <th className="p-2.5">Live Value / Attachment</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500 font-sans">
                        No placeholders match the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <tr key={`map-${idx}`} className="hover:bg-slate-900/50 transition-colors">
                        <td className="p-2.5 font-bold text-cyan-300">
                          {item.tag}
                        </td>
                        <td className="p-2.5 font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            item.type === 'photo' ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="p-2.5 font-sans text-slate-300 font-medium">
                          {item.fieldName}
                        </td>
                        <td className="p-2.5 text-slate-300 max-w-xs truncate">
                          {item.isMapped ? (
                            <span className="text-emerald-300 font-sans font-medium">{item.currentValue}</span>
                          ) : (
                            <span className="text-slate-500 italic font-sans">(Empty / Pending)</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {item.isMapped ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold font-sans">
                              <Check className="w-3 h-3" /> Mapped
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800 text-[10px] font-bold font-sans">
                              <AlertTriangle className="w-3 h-3" /> Empty
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
