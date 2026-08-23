import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Cpu, 
  RefreshCw, 
  Upload, 
  Trash2, 
  Eye, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Settings, 
  Clock, 
  User, 
  Tag, 
  Save,
  Image as ImageIcon,
  ClipboardList,
  Award,
  Box,
  Zap,
  Sliders
} from 'lucide-react';
import { ProtoUnit, ProtoUnitParts, ProtoUnitPhotos, ReportDetails, NamePlateDetails } from '../../types';
import { addProtoUnit, generate5DigitSerial, getProtoUnits } from '../../services/protoUnitStore';
import { ALL_STATIONS, getOccupiedStations } from '../../utils/stationManager';
import { PhotoUploadSection } from '../Common/PhotoUploadSection';

interface AddProtoUnitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (status?: 'live' | 'stopped' | 'finished') => void;
}

export const AddProtoUnitDialog: React.FC<AddProtoUnitDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Basic Information
  const [modelName, setModelName] = useState('');
  const [sampleType, setSampleType] = useState('');
  const [station, setStation] = useState('');
  const [iduSerialNumber, setIduSerialNumber] = useState('');
  const [oduSerialNumber, setOduSerialNumber] = useState('');
  const [requestBy, setRequestBy] = useState('');
  const [testPurpose, setTestPurpose] = useState('');
  const [requiredHour, setRequiredHour] = useState<string>('72');
  const [doneHour, setDoneHour] = useState<string>('0');

  // Report Details
  const [reportNo, setReportNo] = useState('');
  const [sampleReceived, setSampleReceived] = useState('');
  const [testCommenced, setTestCommenced] = useState('');
  const [testCompleted, setTestCompleted] = useState('');

  // Name Plate Details
  const [coolingCapacity, setCoolingCapacity] = useState('');
  const [mainProgramChecksumIdu, setMainProgramChecksumIdu] = useState('');
  const [mainProgramChecksumOdu, setMainProgramChecksumOdu] = useState('');
  const [gasInjectionVolume, setGasInjectionVolume] = useState('');
  const [powerMode, setPowerMode] = useState('');
  const [eeChecksumIdu, setEeChecksumIdu] = useState('');
  const [eeChecksumOdu, setEeChecksumOdu] = useState('');
  const [refrigerant, setRefrigerant] = useState('');
  const [iseer, setIseer] = useState('');

  // IDU Details
  const [iduMotorSpec, setIduMotorSpec] = useState('');
  const [iduMotorPartCode, setIduMotorPartCode] = useState('');
  const [iduMotorSupplier, setIduMotorSupplier] = useState('');
  const [iduPcbPartCode, setIduPcbPartCode] = useState('');
  const [iduPcbSupplier, setIduPcbSupplier] = useState('');

  // ODU Details
  const [oduMotorSpec, setOduMotorSpec] = useState('');
  const [oduMotorPartCode, setOduMotorPartCode] = useState('');
  const [oduMotorSupplier, setOduMotorSupplier] = useState('');
  const [oduPcbPartCode, setOduPcbPartCode] = useState('');
  const [oduPcbSupplier, setOduPcbSupplier] = useState('');

  // Compressor Details
  const [compressorSpec, setCompressorSpec] = useState('');
  const [compressorPartCode, setCompressorPartCode] = useState('');
  const [compressorSupplier, setCompressorSupplier] = useState('');

  // EEV Details
  const [eevSpec, setEevSpec] = useState('');
  const [eevPartCode, setEevPartCode] = useState('');
  const [eevSupplier, setEevSupplier] = useState('');

  // Parts Picture Upload
  const [photos, setPhotos] = useState<ProtoUnitPhotos>({
    indoorUnitPhoto: '',
    productPhoto: '',
    packingBoxPhoto: '',
    iduNameplatePhoto: '',
    oduNameplatePhoto: '',
    iduPcbPhoto: '',
    iduMotorPhoto: '',
    oduPcbPhoto: '',
    oduMotorPhoto: '',
    oduCompressorPhoto: '',
    oduEevPhoto: '',
    stickerPhoto: '',
  });

  // Additional Information
  const [remarks, setRemarks] = useState('');

  // Form errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Preview full size image modal state
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Compute live occupied stations across Proto & Field units
  const liveOccupiedStations = getOccupiedStations();

  // Auto generate 5 digit serials, set default station, and auto detect start/completed dates when modal opens
  useEffect(() => {
    if (isOpen) {
      setIduSerialNumber(generate5DigitSerial());
      setOduSerialNumber(generate5DigitSerial());
      setErrors({});
      
      const occupied = getOccupiedStations();
      const firstAvailable = ALL_STATIONS.find(s => !occupied.has(s)) || ALL_STATIONS[0];
      setStation(firstAvailable);

      // Auto-detect Start Date for Sample Received & Test Commenced (Same Date)
      const todayStr = new Date().toISOString().split('T')[0];
      setSampleReceived(todayStr);
      setTestCommenced(todayStr);
      setDoneHour('0');

      // Auto-calculate Test Complete Date (Start Date + Pending Hours)
      const req = Number(requiredHour) || 72;
      const done = 0;
      const pending = Math.max(0, req - done);
      const compDate = new Date(Date.now() + pending * 3600 * 1000);
      setTestCompleted(compDate.toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const handleSampleReceivedChange = (dateVal: string) => {
    setSampleReceived(dateVal);
    setTestCommenced(dateVal); // Same start date in both
    if (dateVal) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const req = Number(requiredHour) || 72;
        const done = Number(doneHour) || 0;
        const pending = Math.max(0, req - done);
        const compDate = new Date(d.getTime() + pending * 3600 * 1000);
        setTestCompleted(compDate.toISOString().split('T')[0]);
      }
    }
  };

  const handleTestCommencedChange = (dateVal: string) => {
    setTestCommenced(dateVal);
    setSampleReceived(dateVal); // Same start date in both
    if (dateVal) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const req = Number(requiredHour) || 72;
        const done = Number(doneHour) || 0;
        const pending = Math.max(0, req - done);
        const compDate = new Date(d.getTime() + pending * 3600 * 1000);
        setTestCompleted(compDate.toISOString().split('T')[0]);
      }
    }
  };

  const handleRequiredHourChange = (val: string) => {
    setRequiredHour(val);
    const startStr = sampleReceived || testCommenced;
    if (startStr) {
      const d = new Date(startStr);
      if (!isNaN(d.getTime())) {
        const req = Number(val) || 0;
        const done = Number(doneHour) || 0;
        const pending = Math.max(0, req - done);
        const compDate = new Date(d.getTime() + pending * 3600 * 1000);
        setTestCompleted(compDate.toISOString().split('T')[0]);
      }
    }
  };

  const handleDoneHourChange = (val: string) => {
    setDoneHour(val);
    const startStr = sampleReceived || testCommenced;
    if (startStr) {
      const d = new Date(startStr);
      if (!isNaN(d.getTime())) {
        const req = Number(requiredHour) || 72;
        const done = Number(val) || 0;
        const pending = Math.max(0, req - done);
        const compDate = new Date(d.getTime() + pending * 3600 * 1000);
        setTestCompleted(compDate.toISOString().split('T')[0]);
      }
    }
  };

  if (!isOpen) return null;

  const handleRegenerateIduSerial = () => {
    setIduSerialNumber(generate5DigitSerial());
  };

  const handleRegenerateOduSerial = () => {
    setOduSerialNumber(generate5DigitSerial());
  };

  const handleFileUpload = (key: keyof ProtoUnitPhotos, file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPhotos(prev => ({ ...prev, [key]: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (key: keyof ProtoUnitPhotos) => {
    setPhotos(prev => ({ ...prev, [key]: '' }));
  };

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!station) {
      errs.station = 'Testing Station selection is required';
    } else if (liveOccupiedStations.has(station)) {
      errs.station = 'Selected Station is currently occupied in Live section';
    }
    if (requiredHour && (isNaN(Number(requiredHour)) || Number(requiredHour) <= 0)) {
      errs.requiredHour = 'Valid Required Hour is required (e.g., 24, 72)';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveUnit = (targetStatus: 'live' | 'stopped') => {
    if (!validate()) {
      return;
    }

    const val = (v?: string | null): string => {
      if (!v) return 'NA';
      const trimmed = v.trim();
      return trimmed === '' ? 'NA' : trimmed;
    };

    const reportDetails: ReportDetails = {
      reportNo: val(reportNo),
      sampleType: val(sampleType),
      sampleReceived: val(sampleReceived),
      testCommenced: val(testCommenced),
      testCompleted: val(testCompleted),
    };

    const namePlate: NamePlateDetails = {
      coolingCapacity: val(coolingCapacity),
      mainProgramChecksumIdu: val(mainProgramChecksumIdu),
      mainProgramChecksumOdu: val(mainProgramChecksumOdu),
      gasInjectionVolume: val(gasInjectionVolume),
      powerMode: val(powerMode),
      eeChecksumIdu: val(eeChecksumIdu),
      eeChecksumOdu: val(eeChecksumOdu),
      refrigerant: val(refrigerant),
      iseer: val(iseer),
    };

    const partsInfo: ProtoUnitParts = {
      iduMotorSpec: val(iduMotorSpec),
      iduMotorPartCode: val(iduMotorPartCode),
      iduMotorSupplier: val(iduMotorSupplier),
      iduPcbPartCode: val(iduPcbPartCode),
      iduPcbSupplier: val(iduPcbSupplier),

      oduMotorSpec: val(oduMotorSpec),
      oduMotorPartCode: val(oduMotorPartCode),
      oduMotorSupplier: val(oduMotorSupplier),
      oduPcbPartCode: val(oduPcbPartCode),
      oduPcbSupplier: val(oduPcbSupplier),

      compressorSpec: val(compressorSpec),
      compressorPartCode: val(compressorPartCode),
      compressorSupplier: val(compressorSupplier),
      oduCompressorSupplier: val(compressorSupplier),
      oduCompressorPartCode: val(compressorPartCode),

      eevSpec: val(eevSpec),
      eevPartCode: val(eevPartCode),
      eevSupplier: val(eevSupplier),
      oduEevSupplier: val(eevSupplier),
      oduEevPartCode: val(eevPartCode),
    };

    addProtoUnit({
      modelName: val(modelName),
      sampleType: val(sampleType),
      station: station || ALL_STATIONS[0],
      iduSerialNumber: val(iduSerialNumber),
      oduSerialNumber: val(oduSerialNumber),
      requestBy: val(requestBy),
      testPurpose: val(testPurpose),
      requiredHour: Number(requiredHour) || 72,
      doneHour: Number(doneHour) || 0,
      reportDetails,
      namePlate,
      partsInfo,
      photos,
      remarks: val(remarks),
      status: targetStatus,
    });

    // Reset Form
    setModelName('');
    setSampleType('');
    setStation('');
    setRequestBy('');
    setTestPurpose('');
    setRequiredHour('72');
    setDoneHour('0');

    setReportNo('');
    setSampleReceived('');
    setTestCommenced('');
    setTestCompleted('');

    setCoolingCapacity('');
    setMainProgramChecksumIdu('');
    setMainProgramChecksumOdu('');
    setGasInjectionVolume('');
    setPowerMode('');
    setEeChecksumIdu('');
    setEeChecksumOdu('');
    setRefrigerant('');
    setIseer('');

    setIduMotorSpec('');
    setIduMotorPartCode('');
    setIduMotorSupplier('');
    setIduPcbPartCode('');
    setIduPcbSupplier('');

    setOduMotorSpec('');
    setOduMotorPartCode('');
    setOduMotorSupplier('');
    setOduPcbPartCode('');
    setOduPcbSupplier('');

    setCompressorSpec('');
    setCompressorPartCode('');
    setCompressorSupplier('');

    setEevSpec('');
    setEevPartCode('');
    setEevSupplier('');

    setPhotos({
      indoorUnitPhoto: '',
      productPhoto: '',
      packingBoxPhoto: '',
      iduNameplatePhoto: '',
      oduNameplatePhoto: '',
      iduPcbPhoto: '',
      iduMotorPhoto: '',
      oduPcbPhoto: '',
      oduMotorPhoto: '',
      oduCompressorPhoto: '',
      oduEevPhoto: '',
      stickerPhoto: '',
    });
    setRemarks('');

    onSuccess(targetStatus);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveUnit('live');
  };

  const photoUploadFields: { key: keyof ProtoUnitPhotos; label: string }[] = [
    { key: 'indoorUnitPhoto', label: 'Indoor Unit' },
    { key: 'productPhoto', label: 'Product Photo' },
    { key: 'packingBoxPhoto', label: 'Packing Box' },
    { key: 'iduNameplatePhoto', label: 'IDU Nameplate' },
    { key: 'oduNameplatePhoto', label: 'ODU Nameplate' },
    { key: 'iduPcbPhoto', label: 'IDU PCB' },
    { key: 'iduMotorPhoto', label: 'IDU Motor' },
    { key: 'oduPcbPhoto', label: 'ODU PCB' },
    { key: 'oduMotorPhoto', label: 'ODU Motor' },
    { key: 'oduCompressorPhoto', label: 'ODU Compressor' },
    { key: 'oduEevPhoto', label: 'ODU EEV' },
    { key: 'stickerPhoto', label: 'Extra Sticker / Remote' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header (Pinned Top) */}
        <div className="flex-none flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">New Proto Unit Entry</h2>
              <p className="text-xs text-slate-400">Enter proto unit technical parameters, component info & photos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* SECTION 1: Basic Information */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Tag className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">Basic Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Station Selection (01 to 20) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Testing Station (01 to 20) <span className="text-rose-400">*</span>
                </label>
                <select
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  className={`w-full px-3.5 py-2.5 bg-slate-900 border ${
                    errors.station ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl text-xs font-semibold text-cyan-300 focus:outline-none focus:border-cyan-500 transition-colors`}
                >
                  <option value="" disabled>Select Station...</option>
                  {ALL_STATIONS.map((st) => {
                    const isOccupied = liveOccupiedStations.has(st);
                    return (
                      <option 
                        key={st} 
                        value={st} 
                        disabled={isOccupied}
                        className={isOccupied ? 'text-slate-500 bg-slate-950 font-normal' : 'text-slate-100 bg-slate-900 font-semibold'}
                      >
                        {st} {isOccupied ? '🔴 (Occupied in Live)' : ''}
                      </option>
                    );
                  })}
                </select>
                {errors.station ? (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" /> {errors.station}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">
                    * Stations occupied in Live section are unselectable.
                  </p>
                )}
              </div>

              {/* Model Name */}
              <div className="lg:col-span-1">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Model Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. HSI19T-S2NB-F"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className={`w-full px-3.5 py-2.5 bg-slate-900 border ${
                    errors.modelName ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                />
                {errors.modelName && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.modelName}
                  </p>
                )}
              </div>

              {/* Sample Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Sample Type
                </label>
                <input
                  type="text"
                  placeholder="e.g. Proto / Engineering / Pilot"
                  value={sampleType}
                  onChange={(e) => setSampleType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* Request By */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Request By (Person) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mohit Sharma"
                  value={requestBy}
                  onChange={(e) => setRequestBy(e.target.value)}
                  className={`w-full px-3.5 py-2.5 bg-slate-900 border ${
                    errors.requestBy ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                />
                {errors.requestBy && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.requestBy}
                  </p>
                )}
              </div>

              {/* Required Hour & Done Hour (Side-by-Side) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Required Hour */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 truncate">
                    Required Hour (Hours) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 72"
                      value={requiredHour}
                      onChange={(e) => handleRequiredHourChange(e.target.value)}
                      className={`w-full px-3.5 py-2.5 bg-slate-900 border ${
                        errors.requiredHour ? 'border-rose-500' : 'border-slate-700'
                      } rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors pr-10`}
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">hrs</span>
                  </div>
                  {errors.requiredHour && (
                    <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.requiredHour}
                    </p>
                  )}
                </div>

                {/* Done Hour */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300 truncate">
                      Done Hour (Hours)
                    </label>
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/60">
                      Pending: {Math.max(0, (Number(requiredHour) || 0) - (Number(doneHour) || 0))} hrs
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max={Number(requiredHour) || 9999}
                      placeholder="0"
                      value={doneHour}
                      onChange={(e) => handleDoneHourChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors pr-10"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">hrs</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>Default: 0</span>
                    <span className="text-cyan-400 font-semibold">
                      Pending: {Math.max(0, (Number(requiredHour) || 0) - (Number(doneHour) || 0))} hrs
                    </span>
                  </p>
                </div>
              </div>

              {/* IDU Serial Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  IDU Serial Number (5-Digit) <span className="text-rose-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="5-digit number"
                    value={iduSerialNumber}
                    onChange={(e) => setIduSerialNumber(e.target.value)}
                    className={`w-full px-3.5 py-2.5 bg-slate-900 border ${
                      errors.iduSerialNumber ? 'border-rose-500' : 'border-slate-700'
                    } rounded-xl text-xs font-mono font-bold text-cyan-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateIduSerial}
                    title="Generate Random 5-Digit Number"
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-cyan-400 shrink-0 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                {errors.iduSerialNumber && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.iduSerialNumber}
                  </p>
                )}
              </div>

              {/* ODU Serial Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ODU Serial Number (5-Digit) <span className="text-rose-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="5-digit number"
                    value={oduSerialNumber}
                    onChange={(e) => setOduSerialNumber(e.target.value)}
                    className={`w-full px-3.5 py-2.5 bg-slate-900 border ${
                      errors.oduSerialNumber ? 'border-rose-500' : 'border-slate-700'
                    } rounded-xl text-xs font-mono font-bold text-cyan-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateOduSerial}
                    title="Generate Random 5-Digit Number"
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-cyan-400 shrink-0 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                {errors.oduSerialNumber && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.oduSerialNumber}
                  </p>
                )}
              </div>

              {/* Test Purpose */}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Test Purpose <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Performance & Acoustic Stress Validation"
                  value={testPurpose}
                  onChange={(e) => setTestPurpose(e.target.value)}
                  className={`w-full px-3.5 py-2.5 bg-slate-900 border ${
                    errors.testPurpose ? 'border-rose-500' : 'border-slate-700'
                  } rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                />
                {errors.testPurpose && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.testPurpose}
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* SECTION 2: Report Details */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <ClipboardList className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">Report Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Report No</label>
                <input
                  type="text"
                  placeholder="e.g. LLT-REP-2026-089"
                  value={reportNo}
                  onChange={(e) => setReportNo(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sample Received</label>
                <input
                  type="date"
                  value={sampleReceived}
                  onChange={(e) => handleSampleReceivedChange(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Test Commenced</label>
                <input
                  type="date"
                  value={testCommenced}
                  onChange={(e) => handleTestCommencedChange(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Test Completed</label>
                <input
                  type="date"
                  value={testCompleted}
                  onChange={(e) => setTestCompleted(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Name Plate */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Award className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wider">Name Plate</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Cooling Capacity</label>
                <input
                  type="text"
                  placeholder="e.g. 5200 W"
                  value={coolingCapacity}
                  onChange={(e) => setCoolingCapacity(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Main Program Checksum IDU</label>
                <input
                  type="text"
                  placeholder="e.g. 0xA4F2"
                  value={mainProgramChecksumIdu}
                  onChange={(e) => setMainProgramChecksumIdu(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Main Program Checksum ODU</label>
                <input
                  type="text"
                  placeholder="e.g. 0xB8E1"
                  value={mainProgramChecksumOdu}
                  onChange={(e) => setMainProgramChecksumOdu(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Gas Injection Volume</label>
                <input
                  type="text"
                  placeholder="e.g. 850g"
                  value={gasInjectionVolume}
                  onChange={(e) => setGasInjectionVolume(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Power Mode</label>
                <input
                  type="text"
                  placeholder="e.g. Inverter Eco / Boost"
                  value={powerMode}
                  onChange={(e) => setPowerMode(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">EE Checksum IDU</label>
                <input
                  type="text"
                  placeholder="e.g. 0x1102"
                  value={eeChecksumIdu}
                  onChange={(e) => setEeChecksumIdu(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">EE Checksum ODU</label>
                <input
                  type="text"
                  placeholder="e.g. 0x9920"
                  value={eeChecksumOdu}
                  onChange={(e) => setEeChecksumOdu(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Refrigerant</label>
                <input
                  type="text"
                  placeholder="e.g. R32 / R410A"
                  value={refrigerant}
                  onChange={(e) => setRefrigerant(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ISEER</label>
                <input
                  type="text"
                  placeholder="e.g. 5.15"
                  value={iseer}
                  onChange={(e) => setIseer(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: IDU Details */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Box className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider">IDU Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">IDU Motor Spec</label>
                <input
                  type="text"
                  placeholder="e.g. 30W DC Brushless"
                  value={iduMotorSpec}
                  onChange={(e) => setIduMotorSpec(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">IDU Motor Part Code</label>
                <input
                  type="text"
                  placeholder="e.g. MTR-IDU-2201"
                  value={iduMotorPartCode}
                  onChange={(e) => setIduMotorPartCode(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">IDU Motor Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Nidec"
                  value={iduMotorSupplier}
                  onChange={(e) => setIduMotorSupplier(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">IDU PCB Part Code</label>
                <input
                  type="text"
                  placeholder="e.g. PCB-IDU-8841"
                  value={iduPcbPartCode}
                  onChange={(e) => setIduPcbPartCode(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">IDU PCB Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Sanken Electric"
                  value={iduPcbSupplier}
                  onChange={(e) => setIduPcbSupplier(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 5: ODU Details */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Box className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider">ODU Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ODU Motor Spec</label>
                <input
                  type="text"
                  placeholder="e.g. 60W DC Fan Motor"
                  value={oduMotorSpec}
                  onChange={(e) => setOduMotorSpec(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ODU Motor Part Code</label>
                <input
                  type="text"
                  placeholder="e.g. MTR-ODU-3310"
                  value={oduMotorPartCode}
                  onChange={(e) => setOduMotorPartCode(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ODU Motor Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Nidec"
                  value={oduMotorSupplier}
                  onChange={(e) => setOduMotorSupplier(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ODU PCB Part Code</label>
                <input
                  type="text"
                  placeholder="e.g. PCB-ODU-9902"
                  value={oduPcbPartCode}
                  onChange={(e) => setOduPcbPartCode(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ODU PCB Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Delta"
                  value={oduPcbSupplier}
                  onChange={(e) => setOduPcbSupplier(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 6: Compressor Details */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider">Compressor Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Compressor Spec</label>
                <input
                  type="text"
                  placeholder="e.g. Twin Rotary Inverter 1.5T"
                  value={compressorSpec}
                  onChange={(e) => setCompressorSpec(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Compressor Part Code</label>
                <input
                  type="text"
                  placeholder="e.g. CMP-ODU-7721"
                  value={compressorPartCode}
                  onChange={(e) => setCompressorPartCode(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Compressor Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Panasonic / Highly"
                  value={compressorSupplier}
                  onChange={(e) => setCompressorSupplier(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 7: EEV Details */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Sliders className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wider">EEV Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">EEV Spec</label>
                <input
                  type="text"
                  placeholder="e.g. 500 Pulse Electronic Expansion Valve"
                  value={eevSpec}
                  onChange={(e) => setEevSpec(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">EEV Part Code</label>
                <input
                  type="text"
                  placeholder="e.g. EEV-ODU-1022"
                  value={eevPartCode}
                  onChange={(e) => setEevPartCode(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">EEV Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Sanhua / DunAn"
                  value={eevSupplier}
                  onChange={(e) => setEevSupplier(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Photo Upload Section (11 Standard Fields) */}
          <PhotoUploadSection
            photos={photos}
            onChange={(updated) => setPhotos(updated as ProtoUnitPhotos)}
            title="Proto Unit Photo Uploads"
          />

          {/* SECTION 5: Additional Information */}
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider">Additional Information</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Remarks</label>
              <textarea
                rows={3}
                placeholder="Enter any special notes, testing observations or comments..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
              />
            </div>
          </div>
          </div>

          {/* Submit Action Buttons (Pinned Bottom) */}
          <div className="flex-none px-6 py-4 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveUnit('stopped')}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold text-amber-300 bg-amber-950/80 border border-amber-800/80 hover:bg-amber-900 shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Save className="w-4 h-4 text-amber-400" />
              <span>Save Draft</span>
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-extrabold text-slate-900 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 shadow-lg shadow-cyan-950/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Submit Proto Unit</span>
            </button>
          </div>

        </form>
      </div>

      {/* Modal for image preview */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white">{previewImage.title}</h4>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center rounded-xl bg-slate-950 p-2">
              <img src={previewImage.url} alt={previewImage.title} className="max-h-[65vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
