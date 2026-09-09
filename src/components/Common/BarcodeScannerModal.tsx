import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ScanBarcode, 
  Send, 
  RotateCcw, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Camera, 
  CameraOff, 
  Sparkles,
  Layers,
  ArrowRight,
  RefreshCw,
  Search,
  Check
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { findModelByPrefix, getAllModels } from '../../services/modelMasterStore';
import { 
  sendMachinesToELT, 
  returnMachineToBSR, 
  findInELTRecords, 
  ELTRecord, 
  BSRRecord 
} from '../../services/eltBsrStore';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessNavigate?: (tab: 'elt' | 'bsr') => void;
}

export type ScannerProcess = 'SEND_ELT' | 'RETURN_BSR';

interface StagedMachine {
  modelName: string;
  materialCode: string;
  serialNumber: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccessNavigate
}) => {
  // Process Selector: Initial Screen
  const [selectedProcess, setSelectedProcess] = useState<ScannerProcess>('SEND_ELT');

  // Camera & Scanner state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isPermissionRequested, setIsPermissionRequested] = useState<boolean>(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'llt-barcode-reader-viewfinder';

  // Active Scanned Input state
  const [scannedSerial, setScannedSerial] = useState<string>('');
  const [detectedModelName, setDetectedModelName] = useState<string>('');
  const [detectedPrefix, setDetectedPrefix] = useState<string>('');
  const [modelMatchStatus, setModelMatchStatus] = useState<'idle' | 'matched' | 'not_found'>('idle');

  // SEND ELT Multiple Machines Staging Batch
  const [stagedMachines, setStagedMachines] = useState<StagedMachine[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isSubmittingELT, setIsSubmittingELT] = useState<boolean>(false);

  // RETURN BSR State
  const [bsrFoundRecord, setBsrFoundRecord] = useState<ELTRecord | null>(null);
  const [bsrValidationState, setBsrValidationState] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [bsrErrorMessage, setBsrErrorMessage] = useState<string>('');
  const [isSubmittingBSR, setIsSubmittingBSR] = useState<boolean>(false);

  // Success Toast Banner
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Sound feedback
  const playScanBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 30, 40]);
      }
    } catch {
      // AudioContext unavailable
    }
  };

  // Start Camera Function
  const startCamera = async () => {
    setCameraError(null);
    setIsPermissionRequested(true);

    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch {}
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX
        ],
        verbose: false
      });

      html5QrCodeRef.current = html5QrCode;

      const qrConfig = {
        fps: 15,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.777778
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        qrConfig,
        (decodedText) => {
          handleBarcodeScanned(decodedText);
        },
        () => {
          // Frame decode error - normal while scanning
        }
      );

      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setIsCameraActive(false);
      setCameraError(
        err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser, or type the barcode manually below.'
          : 'Could not activate camera. You can also manually enter barcodes or use a USB scanner.'
      );
    }
  };

  // Stop Camera Function
  const stopCamera = async () => {
    if (html5QrCodeRef.current && isCameraActive) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        console.warn('Camera stop warning:', e);
      }
      setIsCameraActive(false);
    }
  };

  // Start scanner when modal opens and clean up when modal closes
  useEffect(() => {
    if (isOpen) {
      // Short delay for DOM container to mount
      const t = setTimeout(() => {
        startCamera();
      }, 350);
      return () => {
        clearTimeout(t);
        stopCamera();
      };
    } else {
      stopCamera();
      resetForm();
    }
  }, [isOpen, selectedProcess]);

  const resetForm = () => {
    setScannedSerial('');
    setDetectedModelName('');
    setDetectedPrefix('');
    setModelMatchStatus('idle');
    setBatchError(null);
    setBsrValidationState('idle');
    setBsrErrorMessage('');
    setBsrFoundRecord(null);
    setSuccessBanner(null);
  };

  // Process Barcode Scanned (from camera or manual input)
  const handleBarcodeScanned = (rawBarcode: string) => {
    if (!rawBarcode) return;
    const cleanBarcode = rawBarcode.trim().toUpperCase();
    if (!cleanBarcode) return;

    playScanBeep();
    setScannedSerial(cleanBarcode);
    setSuccessBanner(null);

    if (selectedProcess === 'SEND_ELT') {
      // 1. EXTRACT FIRST 9 CHARACTERS
      const prefix9 = cleanBarcode.length >= 9 ? cleanBarcode.slice(0, 9) : cleanBarcode;
      setDetectedPrefix(prefix9);

      // 2. CHECK MODEL SHEET / FIREBASE MODEL MASTER
      const matched = findModelByPrefix(prefix9);

      if (matched && matched.modelName) {
        setDetectedModelName(matched.modelName);
        setModelMatchStatus('matched');
        setBatchError(null);
      } else {
        setDetectedModelName('');
        setModelMatchStatus('not_found');
        setBatchError(`Model not found for this Serial Number (Prefix: ${prefix9}). Please verify Model Sheet.`);
      }
    } else {
      // RETURN BSR PROCESS: Check in ELT Records
      const existingInELT = findInELTRecords(cleanBarcode);
      if (existingInELT) {
        // CASE 1: FOUND IN ELT RECORD -> GREEN HIGHLIGHT
        setBsrFoundRecord(existingInELT);
        setDetectedModelName(existingInELT.modelName);
        setDetectedPrefix(existingInELT.materialCode);
        setBsrValidationState('valid');
        setBsrErrorMessage('');
      } else {
        // CASE 2: NOT FOUND IN ELT RECORD -> RED HIGHLIGHT
        setBsrFoundRecord(null);
        setDetectedModelName('');
        setDetectedPrefix('');
        setBsrValidationState('invalid');
        setBsrErrorMessage('Serial Number not found in ELT Record');
      }
    }
  };

  // MULTIPLE MACHINE ADD: Add Current Machine to Batch (+)
  const handleAddCurrentToBatch = () => {
    if (!scannedSerial) {
      setBatchError('Please scan or enter a Serial Number first.');
      return;
    }
    if (modelMatchStatus !== 'matched' || !detectedModelName) {
      setBatchError('Cannot add: Valid Model Name required from Model Sheet.');
      return;
    }

    const cleanSerial = scannedSerial.trim().toUpperCase();

    // Check duplicate in current staged batch
    if (stagedMachines.some(m => m.serialNumber === cleanSerial)) {
      setBatchError(`Machine ${cleanSerial} is already in the current batch list.`);
      return;
    }

    // Check duplicate in Firebase ELT Records
    if (findInELTRecords(cleanSerial)) {
      setBatchError(`Serial Number ${cleanSerial} is already registered in ELT Record.`);
      return;
    }

    const newMachine: StagedMachine = {
      modelName: detectedModelName,
      materialCode: detectedPrefix || cleanSerial.slice(0, 9),
      serialNumber: cleanSerial
    };

    setStagedMachines(prev => [...prev, newMachine]);
    // Clear active entry for next scan
    setScannedSerial('');
    setDetectedModelName('');
    setDetectedPrefix('');
    setModelMatchStatus('idle');
    setBatchError(null);
  };

  // Remove machine from staged batch
  const handleRemoveStaged = (index: number) => {
    setStagedMachines(prev => prev.filter((_, i) => i !== index));
  };

  // SEND ELT: Submit all added machines to Firebase
  const handleSendELT = async () => {
    setBatchError(null);

    // If staged machines is empty, check if current single scanned machine is valid
    let machinesToSubmit = [...stagedMachines];
    if (machinesToSubmit.length === 0) {
      if (scannedSerial && detectedModelName && modelMatchStatus === 'matched') {
        const cleanSerial = scannedSerial.trim().toUpperCase();
        if (findInELTRecords(cleanSerial)) {
          setBatchError(`Serial Number ${cleanSerial} is already in ELT Record.`);
          return;
        }
        machinesToSubmit = [{
          modelName: detectedModelName,
          materialCode: detectedPrefix || cleanSerial.slice(0, 9),
          serialNumber: cleanSerial
        }];
      } else {
        setBatchError('Please add at least one valid machine to send to ELT.');
        return;
      }
    }

    setIsSubmittingELT(true);
    try {
      const res = await sendMachinesToELT(machinesToSubmit);
      if (res.success) {
        setSuccessBanner(`Successfully sent ${res.addedCount} machine(s) to ELT Record.`);
        setStagedMachines([]);
        resetForm();

        if (onSuccessNavigate) {
          setTimeout(() => {
            onSuccessNavigate('elt');
            onClose();
          }, 1200);
        }
      } else if (res.duplicates && res.duplicates.length > 0) {
        setBatchError(`Duplicate Serial Number(s) rejected: ${res.duplicates.join(', ')}`);
      } else {
        setBatchError('Failed to record machines in ELT.');
      }
    } catch (e: any) {
      setBatchError(e.message || 'An error occurred while saving to ELT.');
    } finally {
      setIsSubmittingELT(false);
    }
  };

  // RETURN BSR: Execute return and record transfer
  const handleReturnBSR = async () => {
    if (bsrValidationState !== 'valid' || !scannedSerial) {
      return;
    }

    setIsSubmittingBSR(true);
    try {
      const res = await returnMachineToBSR(scannedSerial);
      if (res.success) {
        setSuccessBanner(`Machine ${scannedSerial} successfully returned from BSR and transferred.`);
        resetForm();

        if (onSuccessNavigate) {
          setTimeout(() => {
            onSuccessNavigate('bsr');
            onClose();
          }, 1200);
        }
      } else {
        setBsrErrorMessage(res.error || 'Failed to process BSR Return.');
      }
    } catch (e: any) {
      setBsrErrorMessage(e.message || 'Error occurred during BSR return.');
    } finally {
      setIsSubmittingBSR(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-cyan-950/40 text-slate-100 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950/80 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-950/50">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-wide flex items-center gap-2">
                Barcode / QR Scanner
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80">
                  LLT Station
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Mobile real-time scanner for ELT & BSR tracking</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close Scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* STEP 1: Process Selection Buttons (SEND ELT vs RETURN BSR) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select Workflow Process:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedProcess('SEND_ELT');
                  resetForm();
                }}
                className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                  selectedProcess === 'SEND_ELT'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-lg shadow-cyan-950/80 ring-2 ring-cyan-400/40'
                    : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Send className="w-4 h-4 text-cyan-300" />
                <span>1. SEND ELT</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedProcess('RETURN_BSR');
                  resetForm();
                }}
                className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                  selectedProcess === 'RETURN_BSR'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-lg shadow-emerald-950/80 ring-2 ring-emerald-400/40'
                    : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <RotateCcw className="w-4 h-4 text-emerald-300" />
                <span>2. RETURN BSR</span>
              </button>
            </div>
          </div>

          {/* Success Banner Alert */}
          {successBanner && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/80 rounded-xl flex items-center gap-2.5 text-xs text-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold">{successBanner}</span>
            </div>
          )}

          {/* Real-Time Camera Viewfinder */}
          <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex flex-col items-center">
            {/* Viewfinder Container for Html5Qrcode */}
            <div 
              id={scannerContainerId} 
              className="w-full min-h-[190px] sm:min-h-[220px] bg-slate-950 flex items-center justify-center"
            >
              {!isCameraActive && !cameraError && (
                <div className="flex flex-col items-center gap-2 text-slate-500 py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">Initializing camera feed...</span>
                </div>
              )}
            </div>

            {/* Camera Controls Bar */}
            <div className="w-full px-3 py-2 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-slate-400 text-[11px]">
                  {isCameraActive ? 'Live Scanner Ready' : 'Camera Standby'}
                </span>
              </div>

              <button
                type="button"
                onClick={isCameraActive ? stopCamera : startCamera}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isCameraActive ? (
                  <>
                    <CameraOff className="w-3.5 h-3.5 text-rose-400" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Restart Camera</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Camera Error / Permission Fallback Note */}
          {cameraError && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{cameraError}</p>
                <p className="text-[11px] text-amber-400/80 mt-0.5">
                  You can type the barcode into the textbox below or scan with a handheld device.
                </p>
              </div>
            </div>
          )}

          {/* Manual Barcode / Serial Number Input with Simulation / Enter Button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Scanned Barcode / Serial Number:
              </label>
              {detectedPrefix && (
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-800 px-2 py-0.5 rounded-md">
                  Prefix (9 chars): {detectedPrefix}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={scannedSerial}
                  onChange={(e) => handleBarcodeScanned(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBarcodeScanned(scannedSerial);
                    }
                  }}
                  placeholder="Scan or type barcode (e.g. AADUU2000100HS9WNQK)..."
                  className={`w-full px-3.5 py-2.5 bg-slate-950 rounded-xl font-mono text-xs sm:text-sm border transition-all ${
                    selectedProcess === 'RETURN_BSR' && bsrValidationState === 'valid'
                      ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300 ring-2 ring-emerald-500/30'
                      : selectedProcess === 'RETURN_BSR' && bsrValidationState === 'invalid'
                      ? 'border-rose-500 bg-rose-950/30 text-rose-300 ring-2 ring-rose-500/30'
                      : 'border-slate-800 text-white focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* Multiple Machine Add (+) Button for SEND ELT */}
              {selectedProcess === 'SEND_ELT' && (
                <button
                  type="button"
                  onClick={handleAddCurrentToBatch}
                  title="Add this machine to batch (+)"
                  className="px-3.5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-md shadow-cyan-950/50 transition-all cursor-pointer shrink-0 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add</span>
                </button>
              )}
            </div>
          </div>

          {/* Model Name CardView Field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Matching Model Name:
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={detectedModelName || (modelMatchStatus === 'not_found' ? 'Model Not Found in Sheet' : '—')}
                placeholder="Automatically extracted from Model Sheet..."
                className={`w-full px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm border bg-slate-950/90 ${
                  detectedModelName
                    ? 'text-cyan-300 border-cyan-800/80 bg-cyan-950/20'
                    : modelMatchStatus === 'not_found'
                    ? 'text-rose-400 border-rose-800 bg-rose-950/20'
                    : 'text-slate-500 border-slate-800'
                }`}
              />
              {detectedModelName && (
                <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[11px] font-mono text-cyan-400">
                  <Check className="w-3.5 h-3.5" />
                  <span>Matched</span>
                </div>
              )}
            </div>
          </div>

          {/* BSR Process Specific Feedback */}
          {selectedProcess === 'RETURN_BSR' && (
            <div>
              {bsrValidationState === 'valid' && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/80 text-xs text-emerald-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Valid Return Machine Found in ELT Record!</span>
                  </div>
                  <div className="text-[11px] text-emerald-400/90 pl-6 space-y-0.5">
                    <div>Model: <span className="font-semibold text-white">{bsrFoundRecord?.modelName}</span></div>
                    <div>ELT Send Date: <span className="font-mono text-emerald-300">{bsrFoundRecord?.eltDate} {bsrFoundRecord?.eltTime}</span></div>
                  </div>
                </div>
              )}

              {bsrValidationState === 'invalid' && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/80 text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="font-bold">{bsrErrorMessage || 'Serial Number not found in ELT Record'}</span>
                </div>
              )}
            </div>
          )}

          {/* Batch Error Banner */}
          {batchError && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{batchError}</span>
            </div>
          )}

          {/* SEND ELT: Multiple Machines Added Staging List */}
          {selectedProcess === 'SEND_ELT' && stagedMachines.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Staged Machines Batch ({stagedMachines.length})
                </span>
                <span className="text-[10px] text-slate-500">Ready to Send to ELT</span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {stagedMachines.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-mono font-bold text-white text-[11px] truncate">
                        {m.serialNumber}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="text-cyan-400 font-semibold">{m.modelName}</span>
                        <span>&bull;</span>
                        <span className="font-mono text-slate-400">{m.materialCode}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveStaged(idx)}
                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Remove from batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Action Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {selectedProcess === 'SEND_ELT' ? (
            <button
              type="button"
              disabled={isSubmittingELT || (stagedMachines.length === 0 && (!scannedSerial || modelMatchStatus !== 'matched'))}
              onClick={handleSendELT}
              className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95"
            >
              {isSubmittingELT ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Saving to ELT...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>SEND ELT {stagedMachines.length > 0 ? `(${stagedMachines.length} Units)` : ''}</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmittingBSR || bsrValidationState !== 'valid'}
              onClick={handleReturnBSR}
              className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95"
            >
              {isSubmittingBSR ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Processing BSR Return...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>BSR RETURN</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
