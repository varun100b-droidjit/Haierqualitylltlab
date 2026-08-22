import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Camera, 
  Trash2, 
  Eye, 
  RefreshCw, 
  CheckCircle2, 
  ImageIcon, 
  X, 
  ZoomIn,
  Sparkles,
  AlertCircle,
  Layers,
  FileCheck,
  FolderArchive,
  Grid3X3,
  SlidersHorizontal,
  Download,
  Tag,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ProtoUnitPhotos } from '../../types';
import { 
  PHOTO_FIELD_DEFINITIONS, 
  REPORT_PHOTO_SECTIONS, 
  ReportSectionCategory, 
  PhotoDefinition,
  findBestMatchingPhotoKey,
  calculatePhotoCoverageStats,
  getPhotosGroupedBySection
} from '../../utils/photoManager';

export interface PhotoFieldConfig {
  key: string;
  label: string;
  legacyKey?: string;
  description?: string;
  section: ReportSectionCategory;
  documentPage: string;
  suggestedFilename: string;
}

/**
 * Standardized filename generator based on parameter name
 */
export const getStandardizedFilename = (key: string, label: string): string => {
  const map: { [key: string]: string } = {
    PHOTO_Product_Packing: 'product_packing.jpg',
    PHOTO_Packing_Box: 'packing_box.jpg',
    PHOTO_IDU_Motor: 'idu_motor.jpg',
    PHOTO_IDU_PCB: 'idu_pcb.jpg',
    PHOTO_IDU_Product_Name_Plate: 'idu_nameplate.jpg',
    PHOTO_Remote: 'remote.jpg',
    PHOTO_ODU_Name_Plate: 'odu_nameplate.jpg',
    PHOTO_ODU_Motor: 'odu_motor.jpg',
    PHOTO_ODU_PCB: 'odu_pcb.jpg',
    PHOTO_Electronic_Expansion_Valve: 'electronic_expansion_valve.jpg',
    PHOTO_ODU_Compressor: 'odu_compressor.jpg',
  };
  return map[key] || `${label.toLowerCase().replace(/[^a-z0-9]/g, '_')}.jpg`;
};

/**
 * Exact 11 Photo Upload Fields organized with section mappings
 */
export const PHOTO_UPLOAD_CONFIGS: PhotoFieldConfig[] = PHOTO_FIELD_DEFINITIONS.map(def => ({
  key: def.photoKey,
  legacyKey: def.id,
  label: def.label,
  description: def.documentPage + ' - ' + REPORT_PHOTO_SECTIONS[def.section].title,
  section: def.section,
  documentPage: def.documentPage,
  suggestedFilename: getStandardizedFilename(def.photoKey, def.label)
}));

export interface PhotoUploadSectionProps {
  photos: Record<string, string | undefined>;
  onChange: (updatedPhotos: Record<string, string>) => void;
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  defaultOpen?: boolean;
}

export const PhotoUploadSection: React.FC<PhotoUploadSectionProps> = ({
  photos,
  onChange,
  title = 'Photo Upload Section',
  subtitle = 'Upload the 11 standard test photos. These map directly to Word Report placeholders {{PHOTO_*}}.',
  readOnly = false,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<'all' | ReportSectionCategory>('all');
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<{ url: string; label: string; key: string; section?: string; page?: string } | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ [key: string]: string }>({});
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);

  // Hidden file inputs references
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const cameraInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to get photo URL from either exact key or legacy camelCase key
  const getPhotoValue = (config: PhotoFieldConfig): string => {
    if (photos[config.key] && photos[config.key] !== 'NA' && photos[config.key]?.trim() !== '') {
      return photos[config.key]!.trim();
    }
    if (config.legacyKey && photos[config.legacyKey] && photos[config.legacyKey] !== 'NA' && photos[config.legacyKey]?.trim() !== '') {
      return photos[config.legacyKey]!.trim();
    }
    // Also check aliases
    if (config.key === 'PHOTO_Electronic_Expansion_Valve') {
      if (photos.PHOTO_EEV && photos.PHOTO_EEV !== 'NA') return photos.PHOTO_EEV;
      if (photos.eevPhoto && photos.eevPhoto !== 'NA') return photos.eevPhoto;
    }
    if (config.key === 'PHOTO_ODU_Compressor') {
      if (photos.PHOTO_Compressor && photos.PHOTO_Compressor !== 'NA') return photos.PHOTO_Compressor;
      if (photos.compressorPhoto && photos.compressorPhoto !== 'NA') return photos.compressorPhoto;
    }
    if (config.key === 'PHOTO_IDU_Product_Name_Plate') {
      if (photos.PHOTO_IDU_Name_Plate && photos.PHOTO_IDU_Name_Plate !== 'NA') return photos.PHOTO_IDU_Name_Plate;
    }
    if (config.key === 'PHOTO_Remote') {
      if (photos.stickerPhoto && photos.stickerPhoto !== 'NA') return photos.stickerPhoto;
    }
    return '';
  };

  const processSingleFile = async (file: File): Promise<string | null> => {
    if (!file) return null;
    if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|bmp|gif|heic|heif)$/i)) {
      return null;
    }

    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          resolve('');
          return;
        }

        // Fast canvas resize/compression for huge photos (>2MB)
        if (file.size > 2 * 1024 * 1024) {
          const img = new window.Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1600;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.88));
              return;
            }
            resolve(dataUrl);
          };
          img.onerror = () => resolve(dataUrl);
          img.src = dataUrl;
        } else {
          resolve(dataUrl);
        }
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (config: PhotoFieldConfig, file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|bmp|gif|heic|heif)$/i)) {
      alert(`Invalid format for ${config.label}. Please select an image file (JPG, PNG, WEBP, etc.).`);
      return;
    }

    const dataUrl = await processSingleFile(file);
    if (dataUrl) {
      savePhotoToState(config, dataUrl, file.size, file.name);
    }
  };

  const savePhotoToState = (config: PhotoFieldConfig, dataUrl: string, originalSize: number, originalFileName?: string) => {
    const updated = { ...photos };
    // Save under exact Word key
    updated[config.key] = dataUrl;
    // Also save under legacy key for complete backward compatibility
    if (config.legacyKey) {
      updated[config.legacyKey] = dataUrl;
    }
    // Specific aliases
    if (config.key === 'PHOTO_Electronic_Expansion_Valve') {
      updated.PHOTO_EEV = dataUrl;
      updated.oduEevPhoto = dataUrl;
      updated.eevPhoto = dataUrl;
    }
    if (config.key === 'PHOTO_ODU_Compressor') {
      updated.PHOTO_Compressor = dataUrl;
      updated.oduCompressorPhoto = dataUrl;
      updated.compressorPhoto = dataUrl;
    }
    if (config.key === 'PHOTO_IDU_Product_Name_Plate') {
      updated.PHOTO_IDU_Name_Plate = dataUrl;
      updated.iduNameplatePhoto = dataUrl;
    }
    if (config.key === 'PHOTO_Remote') {
      updated.stickerPhoto = dataUrl;
      updated.remotePhoto = dataUrl;
    }

    onChange(updated);

    const standardName = config.suggestedFilename;
    setUploadFeedback(prev => ({
      ...prev,
      [config.key]: `Auto-renamed to "${standardName}" (${Math.round(originalSize / 1024)} KB)`
    }));

    setTimeout(() => {
      setUploadFeedback(prev => {
        const next = { ...prev };
        delete next[config.key];
        return next;
      });
    }, 4000);
  };

  // Direct download photo with standardized name (e.g. odu_compressor.jpg)
  const downloadSinglePhoto = (config: PhotoFieldConfig, url: string) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = config.suggestedFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download all uploaded photos as standardized filenames
  const downloadAllRenamedPhotos = () => {
    PHOTO_UPLOAD_CONFIGS.forEach((config, idx) => {
      const url = getPhotoValue(config);
      if (url) {
        setTimeout(() => {
          downloadSinglePhoto(config, url);
        }, idx * 250);
      }
    });
  };

  // Batch Auto-Match Upload
  const handleBatchFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    let matchedCount = 0;
    const updated = { ...photos };
    const messages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const matchedDef = findBestMatchingPhotoKey(file.name);
      if (matchedDef) {
        const dataUrl = await processSingleFile(file);
        if (dataUrl) {
          updated[matchedDef.photoKey] = dataUrl;
          if (matchedDef.id) updated[matchedDef.id] = dataUrl;
          matchedCount++;
          messages.push(`${file.name} ➔ ${matchedDef.label}`);
        }
      }
    }

    if (matchedCount > 0) {
      onChange(updated);
      setBatchFeedback(`Auto-mapped ${matchedCount} photos successfully: ${messages.slice(0, 2).join(', ')}${messages.length > 2 ? ` (+${messages.length - 2} more)` : ''}`);
      setTimeout(() => setBatchFeedback(null), 5000);
    } else {
      alert('Could not automatically determine target sections from filenames. Please upload photos directly into their respective boxes.');
    }
  };

  const handleFileSelect = (config: PhotoFieldConfig, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(config, file);
    }
    e.target.value = '';
  };

  const handleRemovePhoto = (config: PhotoFieldConfig) => {
    const updated = { ...photos };
    delete updated[config.key];
    if (config.legacyKey) {
      delete updated[config.legacyKey];
    }
    if (config.key === 'PHOTO_Electronic_Expansion_Valve') {
      delete updated.PHOTO_EEV;
      delete updated.oduEevPhoto;
      delete updated.eevPhoto;
    }
    if (config.key === 'PHOTO_ODU_Compressor') {
      delete updated.PHOTO_Compressor;
      delete updated.oduCompressorPhoto;
      delete updated.compressorPhoto;
    }
    if (config.key === 'PHOTO_IDU_Product_Name_Plate') {
      delete updated.PHOTO_IDU_Name_Plate;
      delete updated.iduNameplatePhoto;
    }
    if (config.key === 'PHOTO_Remote') {
      delete updated.stickerPhoto;
      delete updated.remotePhoto;
    }
    onChange(updated);
  };

  // Drag and drop handlers
  const handleDragOver = (key: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverKey(key);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverKey(null);
  };

  const handleDrop = (config: PhotoFieldConfig, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverKey(null);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(config, file);
    }
  };

  const coverage = calculatePhotoCoverageStats(photos);
  const filteredConfigs = activeTab === 'all' 
    ? PHOTO_UPLOAD_CONFIGS 
    : PHOTO_UPLOAD_CONFIGS.filter(cfg => cfg.section === activeTab);

  return (
    <div className="bg-slate-950/70 rounded-2xl border border-slate-800 shadow-lg overflow-hidden transition-all duration-300">
      {/* Collapsible Header Banner */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-900/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
              {title}
              <span className="text-[11px] font-mono font-normal text-purple-400 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded-full">
                11 Standard Placeholders
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Status Badge, Action Buttons & Dropdown Toggle */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0" onClick={(e) => e.stopPropagation()}>
          {!readOnly && isOpen && (
            <>
              <input
                ref={batchInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleBatchFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => batchInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition-all cursor-pointer"
                title="Select multiple images and let the system auto-match them by name"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Auto-Match Batch</span>
              </button>
            </>
          )}

          {!readOnly && isOpen && coverage.uploaded > 0 && (
            <button
              type="button"
              onClick={downloadAllRenamedPhotos}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-700/40 text-xs font-semibold flex items-center gap-1.5 shadow transition-all cursor-pointer"
              title="Download all uploaded photos renamed to their standard match names"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save Renamed ({coverage.uploaded})</span>
            </button>
          )}

          <div className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 ${
            coverage.uploaded === 11 
              ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300' 
              : coverage.uploaded > 0 
                ? 'bg-amber-950/40 border-amber-700/50 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            {coverage.uploaded === 11 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
            <span>Mapped: <strong>{coverage.uploaded}</strong> / 11 ({coverage.percentage}%)</span>
          </div>

          {/* Expand / Collapse Dropdown Button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              isOpen
                ? 'bg-purple-950/80 hover:bg-purple-900 text-purple-300 border-purple-700/60 shadow-sm'
                : 'bg-gradient-to-r from-purple-900/60 to-indigo-900/60 hover:from-purple-800/80 hover:to-indigo-800/80 text-purple-200 border-purple-500/40 shadow'
            }`}
          >
            <span>{isOpen ? 'Collapse Gallery' : 'Open Photo Gallery'}</span>
            <ChevronDown className={`w-4 h-4 text-purple-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Collapsible Content Area */}
      {isOpen && (
        <div className="p-4 sm:p-6 pt-0 space-y-5 border-t border-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-200">
          {batchFeedback && (
            <div className="p-3 rounded-xl bg-purple-950/70 border border-purple-500/60 text-purple-200 text-xs flex items-center gap-2 animate-in fade-in">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{batchFeedback}</span>
            </div>
          )}

          {/* Dynamic Document Section Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-slate-800/80 scrollbar-thin">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>All 11 Placeholders</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30">{coverage.uploaded}/11</span>
            </button>

            {(Object.keys(REPORT_PHOTO_SECTIONS) as ReportSectionCategory[]).map(secKey => {
              const sec = REPORT_PHOTO_SECTIONS[secKey];
              const stats = coverage.sectionStats[secKey];
              const isComplete = stats.uploaded === stats.total;

              return (
                <button
                  key={secKey}
                  type="button"
                  onClick={() => setActiveTab(secKey)}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                    activeTab === secKey
                      ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40 shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{sec.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isComplete ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-900 text-slate-300'
                  }`}>
                    {stats.uploaded}/{stats.total}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Section Description Bar when a specific tab is active */}
          {activeTab !== 'all' && (
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <div>
                <span className="font-bold text-cyan-300 mr-2">{REPORT_PHOTO_SECTIONS[activeTab].title}</span>
                <span className="text-slate-400">{REPORT_PHOTO_SECTIONS[activeTab].description}</span>
              </div>
              <span className="text-[11px] font-mono text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60 shrink-0">
                {REPORT_PHOTO_SECTIONS[activeTab].page}
              </span>
            </div>
          )}

          {/* 2-Column Card Grid on Desktop, 1-Column on Mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredConfigs.map((config, index) => {
          const photoUrl = getPhotoValue(config);
          const isUploaded = Boolean(photoUrl);
          const isDragging = dragOverKey === config.key;
          const feedback = uploadFeedback[config.key];
          const globalIdx = PHOTO_UPLOAD_CONFIGS.findIndex(c => c.key === config.key);

          return (
            <div
              key={config.key}
              onDragOver={(e) => handleDragOver(config.key, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(config, e)}
              className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                isDragging
                  ? 'bg-purple-950/30 border-purple-500 ring-2 ring-purple-500/20'
                  : isUploaded
                    ? 'bg-slate-900/90 border-slate-700/80 hover:border-slate-600'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0">
                    {globalIdx + 1}
                  </span>
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-100">
                    {config.label}
                  </h4>
                </div>

                {/* Status Indicator */}
                <div>
                  {isUploaded ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      Uploaded
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/60 border border-slate-700/60 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      Not Uploaded
                    </span>
                  )}
                </div>
              </div>

              {/* Hidden file inputs for manual selection and mobile camera */}
              <input
                ref={(el) => {
                  fileInputRefs.current[config.key] = el;
                }}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFileSelect(config, e)}
              />
              <input
                ref={(el) => {
                  cameraInputRefs.current[config.key] = el;
                }}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(config, e)}
              />

              {/* Card Body: Preview or Upload Dropzone */}
              {isUploaded ? (
                <div className="space-y-2.5">
                  {/* Photo Preview Container (Fixed 6cm x 4cm proportional display) */}
                  <div className="relative group w-full h-36 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center">
                    <img
                      src={photoUrl}
                      alt={config.label}
                      className="w-full h-full object-contain p-1 transition-transform group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Hover overlay with Quick Actions */}
                    <div className="absolute inset-0 bg-slate-950/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 backdrop-blur-[2px]">
                      <button
                        type="button"
                        onClick={() => setPreviewModal({ 
                          url: photoUrl, 
                          label: config.label, 
                          key: config.key,
                          section: REPORT_PHOTO_SECTIONS[config.section].title,
                          page: config.documentPage
                        })}
                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-md"
                        title="View Full Resolution"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>

                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            onClick={() => downloadSinglePhoto(config, photoUrl)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-md border border-amber-700/50"
                            title={`Download photo saved as "${config.suggestedFilename}"`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Save as {config.suggestedFilename}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[config.key]?.click()}
                            className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-md"
                            title="Replace Photo"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Replace</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(config)}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-md"
                            title="Remove Photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  {!readOnly && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[config.key]?.click()}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3 text-blue-400" />
                          <span>Replace</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraInputRefs.current[config.key]?.click()}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
                          title="Take Photo with Camera"
                        >
                          <Camera className="w-3 h-3 text-purple-400" />
                          <span>Camera</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(config)}
                        className="px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 rounded-lg text-xs font-medium flex items-center gap-1 border border-rose-800/60 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}

                  {feedback && (
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1 animate-fade-in">
                      <CheckCircle2 className="w-3 h-3" />
                      {feedback}
                    </p>
                  )}
                </div>
              ) : (
                /* Empty state - Upload Zone */
                <div className="space-y-3">
                  <div
                    onClick={() => !readOnly && fileInputRefs.current[config.key]?.click()}
                    className={`w-full h-28 border border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 p-3 text-center transition-all ${
                      readOnly 
                        ? 'border-slate-800 bg-slate-950/40 text-slate-500 cursor-not-allowed'
                        : 'border-slate-700/80 bg-slate-950/50 hover:bg-slate-950/80 hover:border-purple-500/60 text-slate-400 cursor-pointer group'
                    }`}
                  >
                    <div className="p-2 rounded-full bg-slate-900 group-hover:bg-purple-950/60 group-hover:text-purple-300 text-slate-400 transition-colors">
                      <Upload className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                      Click or Drag photo here
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Auto-converts to 6cm × 4cm standard
                    </span>
                  </div>

                  {/* Upload Action Buttons */}
                  {!readOnly && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[config.key]?.click()}
                        className="flex-1 py-1.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Photo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => cameraInputRefs.current[config.key]?.click()}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
                        title="Open Camera on Mobile"
                      >
                        <Camera className="w-3.5 h-3.5 text-purple-400" />
                        <span>Camera</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
          </div>
        </div>
      )}

      {/* Full Image Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
          <div className="relative max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-white">{previewModal.label}</h4>
                <span className="text-xs font-mono text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800">
                  {`{{${previewModal.key}}}`}
                </span>
                {previewModal.page && (
                  <span className="text-xs font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                    {previewModal.page}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Image View */}
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950">
              <img
                src={previewModal.url}
                alt={previewModal.label}
                className="max-w-full max-h-[70vh] object-contain rounded-lg border border-slate-800"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-t border-slate-800 text-xs text-slate-400">
              <span>Section: <strong className="text-slate-200">{previewModal.section || 'Lab Photographs'}</strong> (Standard 6 cm × 4 cm Fixed Aspect Ratio)</span>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

