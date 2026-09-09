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
  Check,
  Upload,
  SwitchCamera,
  Image as ImageIcon
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { findModelByPrefix, getAllModels } from '../../services/modelMasterStore';
import { 
  sendMachinesToELT, 
  returnMachineToBSR, 
  returnMultipleMachinesToBSR,
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

export interface MachineEntryRow {
  id: string;
  serialNumber: string;
  modelName: string;
  materialCode: string;
  prefix: string;
  matchStatus: 'idle' | 'matched' | 'not_found';
  originalELTDateTime?: string;
  error?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccessNavigate
}) => {
  // Process Selector: Initial Screen
  const [selectedProcess, setSelectedProcess] = useState<ScannerProcess>('SEND_ELT');

  // Dynamic Machine Rows for SEND ELT (Each row has Model Name and Series No. text boxes)
  const [machineRows, setMachineRows] = useState<MachineEntryRow[]>([
    { id: 'row-1', serialNumber: '', modelName: '', materialCode: '', prefix: '', matchStatus: 'idle' }
  ]);
  const [activeRowId, setActiveRowId] = useState<string>('row-1');

  // Camera & Scanner state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [isFileScanning, setIsFileScanning] = useState<boolean>(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const isScanningRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerContainerId = 'llt-barcode-reader-viewfinder';

  const selectedProcessRef = useRef<ScannerProcess>(selectedProcess);
  useEffect(() => {
    selectedProcessRef.current = selectedProcess;
  }, [selectedProcess]);

  // Active Scanned Input state (used for RETURN_BSR single scan)
  const [scannedSerial, setScannedSerial] = useState<string>('');
  const [detectedModelName, setDetectedModelName] = useState<string>('');
  const [detectedPrefix, setDetectedPrefix] = useState<string>('');
  const [modelMatchStatus, setModelMatchStatus] = useState<'idle' | 'matched' | 'not_found'>('idle');

  // SEND ELT Error / Submitting states
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

  // Start Camera Function with multi-tier fallback for mobile browsers
  const startCamera = async (targetCameraId?: string) => {
    if (isStartingRef.current) return;

    const container = document.getElementById(scannerContainerId);
    if (!container) return;

    setCameraError(null);
    isStartingRef.current = true;

    try {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning || isScanningRef.current) {
            await html5QrCodeRef.current.stop();
          }
        } catch {}
        try {
          await html5QrCodeRef.current.clear();
        } catch {}
        html5QrCodeRef.current = null;
      }

      // Re-verify container still mounted in DOM
      if (!document.getElementById(scannerContainerId)) {
        isStartingRef.current = false;
        return;
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

      // Dynamic qrbox that calculates bounds relative to actual camera viewfinder dimensions
      // Do NOT set a hardcoded landscape aspectRatio to prevent OverconstrainedError on portrait screens
      const qrConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.max(Math.floor(minEdge * 0.75), 140);
          return {
            width: Math.min(boxSize * 1.3, viewfinderWidth - 16),
            height: Math.min(boxSize * 0.8, viewfinderHeight - 16)
          };
        }
      };

      // Detect available cameras on the device
      let cameraList: { id: string; label: string }[] = [];
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          cameraList = devices.map((d, i) => ({
            id: d.id,
            label: d.label || `Camera ${i + 1}`
          }));
          setAvailableCameras(cameraList);
        }
      } catch (camErr) {
        console.warn('Camera enumeration note:', camErr);
      }

      // Multi-fallback order:
      // 1. Specified target cameraId if requested
      // 2. Rear / back camera ID if detected
      // 3. { facingMode: 'environment' }
      // 4. { facingMode: 'user' } (front camera fallback)
      // 5. {} (any available camera stream)
      const attempts: any[] = [];
      if (targetCameraId) {
        attempts.push(targetCameraId);
      } else if (cameraList.length > 0) {
        const backCam = cameraList.find(c => /back|rear|environment|main|standard/i.test(c.label)) || cameraList[cameraList.length - 1];
        attempts.push(backCam.id);
        setActiveCameraId(backCam.id);
      }
      attempts.push({ facingMode: 'environment' });
      attempts.push({ facingMode: 'user' });
      attempts.push({});

      let started = false;
      let lastErr: any = null;

      for (const config of attempts) {
        try {
          await html5QrCode.start(
            config,
            qrConfig,
            (decodedText) => {
              handleBarcodeScanned(decodedText);
            },
            () => {
              // Frame decode error - normal while scanning
            }
          );
          started = true;
          isScanningRef.current = true;
          setIsCameraActive(true);
          setCameraError(null);
          if (typeof config === 'string') {
            setActiveCameraId(config);
          }
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!started) {
        throw lastErr || new Error("Could not initialize video stream");
      }
    } catch (err: any) {
      console.warn('Camera start error:', err);
      isScanningRef.current = false;
      setIsCameraActive(false);
      const errMsg = err?.message || String(err);
      if (err?.name === 'NotAllowedError' || errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('denied')) {
        setCameraError('Camera permission was blocked. Tap "Activate Camera" to grant access, or use "Snap Photo" below.');
      } else {
        setCameraError('Could not start live camera feed. Tap "Activate Camera" or use "Snap / Upload Photo" to read barcodes.');
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  // Switch between available cameras (e.g. rear and front)
  const switchCamera = async () => {
    if (availableCameras.length < 2) return;
    const currentIndex = availableCameras.findIndex(c => c.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[nextIndex];
    if (nextCamera) {
      await stopCamera();
      await startCamera(nextCamera.id);
    }
  };

  // Stop Camera Function
  const stopCamera = async () => {
    isStartingRef.current = false;
    const scanner = html5QrCodeRef.current;
    if (scanner) {
      try {
        if (scanner.isScanning || isScanningRef.current) {
          await scanner.stop();
        }
      } catch (e) {
        console.warn('Camera stop warning:', e);
      }
      try {
        await scanner.clear();
      } catch (e) {
        // Safe to ignore
      }
      html5QrCodeRef.current = null;
    }
    isScanningRef.current = false;
    setIsCameraActive(false);
  };

  // Scan directly from photo or gallery upload (100% reliable fallback)
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileScanning(true);
    setCameraError(null);

    try {
      let scanner = html5QrCodeRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(scannerContainerId, {
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
        html5QrCodeRef.current = scanner;
      }

      const decoded = await scanner.scanFile(file, false);
      if (decoded) {
        handleBarcodeScanned(decoded);
      }
    } catch (err: any) {
      console.warn("File scan error:", err);
      setCameraError("Could not decode barcode from this photo. Please ensure barcode is sharp and well lit, or type the code manually.");
    } finally {
      setIsFileScanning(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Start scanner when modal opens and clean up when modal closes
  useEffect(() => {
    let isMounted = true;
    let timer: any = null;

    if (isOpen) {
      // Delay to ensure modal DOM container is fully painted
      timer = setTimeout(() => {
        if (isMounted) {
          startCamera();
        }
      }, 350);
    } else {
      stopCamera();
      resetForm();
    }

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      stopCamera();
    };
  }, [isOpen]);

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
    const initialId = `row-${Date.now()}`;
    setMachineRows([
      { id: initialId, serialNumber: '', modelName: '', materialCode: '', prefix: '', matchStatus: 'idle' }
    ]);
    setActiveRowId(initialId);
  };

  // Dynamically Add New Machine Box (+) for next machine scan
  const handleAddNewRow = () => {
    const newId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setMachineRows(prev => [
      ...prev,
      { id: newId, serialNumber: '', modelName: '', materialCode: '', prefix: '', matchStatus: 'idle' }
    ]);
    setActiveRowId(newId);
    setBatchError(null);
  };

  // Remove or clear a machine row
  const handleDeleteRow = (id: string) => {
    setMachineRows(prev => {
      if (prev.length <= 1) {
        const freshId = `row-${Date.now()}`;
        setActiveRowId(freshId);
        return [{ id: freshId, serialNumber: '', modelName: '', materialCode: '', prefix: '', matchStatus: 'idle' }];
      }
      const filtered = prev.filter(r => r.id !== id);
      if (activeRowId === id && filtered.length > 0) {
        setActiveRowId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  // Update Series No. in a machine row (and auto-match Model Name from Model Sheet or ELT Record)
  const handleUpdateRowSerial = (id: string, rawSerial: string) => {
    const cleanSerial = rawSerial.trim().toUpperCase();
    const currentProcess = selectedProcessRef.current;

    let modelName = '';
    let materialCode = '';
    let prefix = '';
    let matchStatus: 'idle' | 'matched' | 'not_found' = 'idle';
    let error: string | undefined = undefined;
    let originalELTDateTime: string | undefined = undefined;

    if (currentProcess === 'SEND_ELT') {
      const prefix9 = cleanSerial.length >= 9 ? cleanSerial.slice(0, 9) : cleanSerial;
      prefix = prefix9;
      materialCode = prefix9;

      if (cleanSerial.length >= 9) {
        const matched = findModelByPrefix(prefix9);
        if (matched && matched.modelName) {
          modelName = matched.modelName;
          matchStatus = 'matched';
        } else {
          matchStatus = 'not_found';
          error = `Prefix "${prefix9}" not found in Model Sheet`;
        }
      }

      if (cleanSerial.length > 0 && findInELTRecords(cleanSerial)) {
        error = `Already registered in ELT Record!`;
      }
    } else {
      // RETURN_BSR: Lookup machine in ELT Records
      if (cleanSerial.length > 0) {
        const existingInELT = findInELTRecords(cleanSerial);
        if (existingInELT) {
          modelName = existingInELT.modelName;
          materialCode = existingInELT.materialCode;
          prefix = existingInELT.materialCode;
          matchStatus = 'matched';
          originalELTDateTime = `${existingInELT.eltDate} ${existingInELT.eltTime}`;
        } else {
          matchStatus = 'not_found';
          error = 'Serial Number not found in ELT Record';
        }
      }
    }

    setMachineRows(prev => prev.map(r => {
      if (r.id === id) {
        return {
          ...r,
          serialNumber: cleanSerial,
          prefix,
          materialCode,
          modelName,
          matchStatus,
          originalELTDateTime,
          error
        };
      }
      return r;
    }));
  };

  // Process Barcode Scanned (from camera or manual barcode input)
  const handleBarcodeScanned = (rawBarcode: string) => {
    if (!rawBarcode) return;
    const cleanBarcode = rawBarcode.trim().toUpperCase();
    if (!cleanBarcode) return;

    playScanBeep();
    setSuccessBanner(null);

    const currentProcess = selectedProcessRef.current;

    let modelName = '';
    let materialCode = '';
    let prefix = '';
    let matchStatus: 'idle' | 'matched' | 'not_found' = 'idle';
    let rowError: string | undefined = undefined;
    let originalELTDateTime: string | undefined = undefined;

    if (currentProcess === 'SEND_ELT') {
      // 1. EXTRACT FIRST 9 CHARACTERS & LOOKUP MODEL MASTER
      const prefix9 = cleanBarcode.length >= 9 ? cleanBarcode.slice(0, 9) : cleanBarcode;
      prefix = prefix9;
      materialCode = prefix9;
      const matched = findModelByPrefix(prefix9);

      if (matched && matched.modelName) {
        modelName = matched.modelName;
        matchStatus = 'matched';
      } else {
        matchStatus = 'not_found';
        rowError = `Prefix "${prefix9}" not in Model Sheet`;
      }

      if (findInELTRecords(cleanBarcode)) {
        rowError = `Already in ELT Record!`;
      }
    } else {
      // RETURN BSR PROCESS: Check in ELT Records
      const existingInELT = findInELTRecords(cleanBarcode);
      if (existingInELT) {
        modelName = existingInELT.modelName;
        materialCode = existingInELT.materialCode;
        prefix = existingInELT.materialCode;
        matchStatus = 'matched';
        originalELTDateTime = `${existingInELT.eltDate} ${existingInELT.eltTime}`;
      } else {
        matchStatus = 'not_found';
        rowError = 'Serial Number not found in ELT Record';
      }
    }

    setMachineRows(prev => {
      // Check duplicate within the active batch
      if (prev.some(r => r.serialNumber === cleanBarcode)) {
        setBatchError(`Machine ${cleanBarcode} already scanned in this list.`);
        return prev;
      }

      // Fill into active row if empty, or first empty row
      let targetIndex = prev.findIndex(r => r.id === activeRowId && !r.serialNumber);
      if (targetIndex === -1) {
        targetIndex = prev.findIndex(r => !r.serialNumber);
      }

      if (targetIndex !== -1) {
        const updated = [...prev];
        const targetId = updated[targetIndex].id;
        updated[targetIndex] = {
          ...updated[targetIndex],
          serialNumber: cleanBarcode,
          prefix,
          materialCode,
          modelName,
          matchStatus,
          originalELTDateTime,
          error: rowError
        };
        setActiveRowId(targetId);
        setBatchError(null);
        return updated;
      } else {
        // All rows filled: automatically append a new machine box for this scanned unit!
        const newRowId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setActiveRowId(newRowId);
        setBatchError(null);
        return [
          ...prev,
          {
            id: newRowId,
            serialNumber: cleanBarcode,
            prefix,
            materialCode,
            modelName,
            matchStatus,
            originalELTDateTime,
            error: rowError
          }
        ];
      }
    });
  };

  // SEND ELT: Submit all valid machines to Firebase
  const handleSendELT = async () => {
    setBatchError(null);

    const filledRows = machineRows.filter(r => r.serialNumber.trim().length > 0);
    if (filledRows.length === 0) {
      setBatchError('Please scan or enter at least one machine Series No.');
      return;
    }

    // Validate Model Sheet match
    const invalidModel = filledRows.find(r => r.matchStatus !== 'matched' || !r.modelName);
    if (invalidModel) {
      setBatchError(`Machine "${invalidModel.serialNumber}": Valid Model Name required from Model Sheet.`);
      return;
    }

    // Check duplicate serials in current batch
    const serials = filledRows.map(r => r.serialNumber.trim().toUpperCase());
    const duplicatesInBatch = serials.filter((item, index) => serials.indexOf(item) !== index);
    if (duplicatesInBatch.length > 0) {
      setBatchError(`Duplicate Serial Number in current list: ${duplicatesInBatch[0]}`);
      return;
    }

    // Check duplicate in Firebase ELT Records
    const alreadyInELT = filledRows.find(r => findInELTRecords(r.serialNumber.trim().toUpperCase()));
    if (alreadyInELT) {
      setBatchError(`Serial Number ${alreadyInELT.serialNumber} is already registered in ELT Record.`);
      return;
    }

    const machinesToSubmit = filledRows.map(r => ({
      modelName: r.modelName,
      materialCode: r.materialCode || r.serialNumber.trim().slice(0, 9),
      serialNumber: r.serialNumber.trim().toUpperCase()
    }));

    setIsSubmittingELT(true);
    try {
      const res = await sendMachinesToELT(machinesToSubmit);
      if (res.success) {
        setSuccessBanner(`Successfully sent ${res.addedCount} machine(s) to ELT Record.`);
        const freshId = `row-${Date.now()}`;
        setMachineRows([
          { id: freshId, serialNumber: '', modelName: '', materialCode: '', prefix: '', matchStatus: 'idle' }
        ]);
        setActiveRowId(freshId);

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

  // RETURN BSR: Execute return and record transfer for all scanned machines
  const handleReturnBSR = async () => {
    setBatchError(null);

    const filledRows = machineRows.filter(r => r.serialNumber.trim().length > 0);
    if (filledRows.length === 0) {
      setBatchError('Please scan or enter at least one machine Series No. to return.');
      return;
    }

    // Validate that all machines exist in ELT Records
    const invalidRows = filledRows.filter(r => r.matchStatus !== 'matched' || !findInELTRecords(r.serialNumber.trim().toUpperCase()));
    if (invalidRows.length > 0) {
      setBatchError(`Machine "${invalidRows[0].serialNumber}" not found in ELT Record. Cannot return.`);
      return;
    }

    // Check duplicate serials in current batch
    const serials = filledRows.map(r => r.serialNumber.trim().toUpperCase());
    const duplicatesInBatch = serials.filter((item, index) => serials.indexOf(item) !== index);
    if (duplicatesInBatch.length > 0) {
      setBatchError(`Duplicate Serial Number in current list: ${duplicatesInBatch[0]}`);
      return;
    }

    setIsSubmittingBSR(true);
    try {
      const res = await returnMultipleMachinesToBSR(serials);
      if (res.success) {
        setSuccessBanner(`Successfully returned ${res.returnedCount} machine(s) to BSR.`);
        const freshId = `row-${Date.now()}`;
        setMachineRows([
          { id: freshId, serialNumber: '', modelName: '', materialCode: '', prefix: '', matchStatus: 'idle' }
        ]);
        setActiveRowId(freshId);

        if (onSuccessNavigate) {
          setTimeout(() => {
            onSuccessNavigate('bsr');
            onClose();
          }, 1200);
        }
      } else {
        setBatchError(res.errors?.[0] || 'Failed to process BSR Return.');
      }
    } catch (e: any) {
      setBatchError(e.message || 'Error occurred during BSR return.');
    } finally {
      setIsSubmittingBSR(false);
    }
  };

  // Safe close handler ensuring camera hardware stream is detached
  const handleCloseModal = async () => {
    await stopCamera();
    onClose();
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
              <p className="text-[11px] text-slate-400">Mobile real-time scanner for ELT &amp; BSR tracking</p>
            </div>
          </div>

          <button
            onClick={handleCloseModal}
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
            {/* Viewfinder Relative Container */}
            <div className="relative w-full min-h-[210px] sm:min-h-[240px] bg-slate-950 flex items-center justify-center overflow-hidden">
              {/* Dedicated Html5Qrcode host container - strictly NO React children inside */}
              <div 
                id={scannerContainerId} 
                className="w-full min-h-[210px] sm:min-h-[240px]"
              />

              {/* Status & User-Action Overlay when camera is paused/inactive */}
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs text-center z-10">
                  {isFileScanning ? (
                    <div className="flex flex-col items-center gap-2 text-cyan-400">
                      <RefreshCw className="w-7 h-7 animate-spin" />
                      <span className="text-xs font-semibold">Decoding photo barcode...</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-11 h-11 rounded-2xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400 mb-2 shadow-lg shadow-cyan-950/50">
                        <Camera className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-slate-200 mb-1">
                        {cameraError ? 'Camera Standby / Permission' : 'Live Camera Ready'}
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-xs mb-3.5 leading-relaxed">
                        Tap below to start the camera scanner, or snap a photo of the barcode directly.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Activate Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-700 active:scale-95 transition-transform"
                        >
                          <Upload className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Snap / Upload Photo</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Hidden native camera capture input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileScan}
              className="hidden"
            />

            {/* Camera Controls Bar */}
            <div className="w-full px-3 py-2 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-slate-400 text-[11px] truncate">
                  {isCameraActive ? 'Live Scanner Active' : 'Camera Standby'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {availableCameras.length > 1 && (
                  <button
                    type="button"
                    onClick={switchCamera}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Switch Lens"
                  >
                    <SwitchCamera className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="hidden sm:inline">Switch</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Take photo of barcode"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Snap Photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => (isCameraActive ? stopCamera() : startCamera())}
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
                      <span>Restart</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Camera Error / Permission Fallback Note */}
          {cameraError && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{cameraError}</p>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    You can also type the barcode into the textbox below or scan with a USB/Bluetooth scanner.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => startCamera()}
                className="shrink-0 px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* =================================================================
              PROCESS 1: SEND ELT - DYNAMIC MACHINE BOXES
              "jab bhi + ke button per click hoga tab model Name aur Serial No. 
               Ka Text Box Add hoga agli machine Scanner ka data Capture krne ke liye"
              ================================================================= */}
          {selectedProcess === 'SEND_ELT' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    Machines to Send ({machineRows.length})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Tap a box to make it the scan target
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Machine (+)</span>
                </button>
              </div>

              {/* Dynamic Machine Rows List */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {machineRows.map((row, index) => {
                  const isTarget = row.id === activeRowId;
                  return (
                    <div
                      key={row.id}
                      onClick={() => setActiveRowId(row.id)}
                      className={`p-3.5 rounded-xl border transition-all space-y-2.5 cursor-pointer ${
                        isTarget
                          ? 'bg-slate-950/90 border-cyan-500/80 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-950/40'
                          : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Row Header with Machine #, Scan Target badge, and Action (+) & Trash buttons */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-[11px]">
                            Machine #{index + 1}
                          </span>
                          {isTarget && (
                            <span className="font-bold text-cyan-400 text-[10px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                              <span>Active Target 🎯</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* (+) Button to add next machine row right from here */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddNewRow();
                            }}
                            title="Add next machine (+)"
                            className="p-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 hover:text-white transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          {/* Trash button to delete/clear this row */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRow(row.id);
                            }}
                            title={machineRows.length > 1 ? 'Remove this machine' : 'Clear'}
                            className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 1. Model Name Field (Auto-extracted from Model Sheet) */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Model Name:
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly
                            value={row.modelName || (row.matchStatus === 'not_found' ? 'Model Not Found in Sheet' : '—')}
                            placeholder="Automatically extracted from Model Sheet..."
                            className={`w-full px-3 py-2 rounded-xl font-semibold text-xs border bg-slate-900 ${
                              row.modelName
                                ? 'text-cyan-300 border-cyan-800/80 bg-cyan-950/30'
                                : row.matchStatus === 'not_found'
                                ? 'text-rose-400 border-rose-800 bg-rose-950/30'
                                : 'text-slate-500 border-slate-800'
                            }`}
                          />
                          {row.modelName && (
                            <div className="absolute right-2.5 top-2 flex items-center gap-1 text-[10px] font-mono text-cyan-400">
                              <Check className="w-3 h-3" />
                              <span>Matched</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Series No. / Barcode Input with (+) Button */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Series No. (Barcode):
                          </label>
                          {row.materialCode && (
                            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-800 px-1.5 py-0.2 rounded">
                              Prefix: {row.materialCode}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={row.serialNumber}
                            onFocus={() => setActiveRowId(row.id)}
                            onChange={(e) => handleUpdateRowSerial(row.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNewRow();
                              }
                            }}
                            placeholder="Scan barcode or type Series No..."
                            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddNewRow();
                            }}
                            title="Add next machine (+)"
                            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-md shadow-cyan-950/50 transition-all cursor-pointer active:scale-95 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Add</span>
                          </button>
                        </div>
                        {row.error && (
                          <p className="text-[10px] text-rose-400 font-semibold mt-0.5">{row.error}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =================================================================
              PROCESS 2: RETURN BSR - DYNAMIC MULTI-MACHINE BATCH RETURN
              ================================================================= */}
          {selectedProcess === 'RETURN_BSR' && (
            <div className="space-y-3">
              {/* Header with Title & Top (+) Button */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                    Machines to Return ({machineRows.length})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Tap a box to make it the scan target
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Machine (+)</span>
                </button>
              </div>

              {/* Dynamic Machine Rows List */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {machineRows.map((row, index) => {
                  const isTarget = row.id === activeRowId;
                  const isMatched = row.matchStatus === 'matched';
                  const isNotFound = row.matchStatus === 'not_found';
                  return (
                    <div
                      key={row.id}
                      onClick={() => setActiveRowId(row.id)}
                      className={`p-3.5 rounded-xl border transition-all space-y-2.5 cursor-pointer ${
                        isTarget
                          ? 'bg-slate-950/90 border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-950/40'
                          : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Row Header with Machine #, Scan Target badge, and Action (+) & Trash buttons */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-[11px]">
                            Machine #{index + 1}
                          </span>
                          {isTarget && (
                            <span className="font-bold text-emerald-400 text-[10px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                              <span>Active Target 🎯</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* (+) Button to add next machine row right from here */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddNewRow();
                            }}
                            title="Add next machine (+)"
                            className="p-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 hover:text-white transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          {/* Trash button to delete/clear this row */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRow(row.id);
                            }}
                            title={machineRows.length > 1 ? 'Remove this machine' : 'Clear'}
                            className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 1. Model Name Field (Auto-retrieved from ELT Record upon scan) */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Model Name:
                          </label>
                          {row.originalELTDateTime && (
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-1.5 py-0.2 rounded">
                              ELT: {row.originalELTDateTime}
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly
                            value={row.modelName || (isNotFound ? 'Serial Number Not Found in ELT' : '—')}
                            placeholder="Auto-retrieved from ELT Record upon scan..."
                            className={`w-full px-3 py-2 rounded-xl font-semibold text-xs border bg-slate-900 ${
                              isMatched
                                ? 'text-emerald-300 border-emerald-800/80 bg-emerald-950/30'
                                : isNotFound
                                ? 'text-rose-400 border-rose-800 bg-rose-950/30'
                                : 'text-slate-500 border-slate-800'
                            }`}
                          />
                          {isMatched && (
                            <div className="absolute right-2.5 top-2 flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                              <Check className="w-3 h-3" />
                              <span>Found in ELT</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Series No. / Barcode Input with (+) Button */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Series No. (Barcode):
                          </label>
                          {row.materialCode && (
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.2 rounded">
                              Prefix: {row.materialCode}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={row.serialNumber}
                            onFocus={() => setActiveRowId(row.id)}
                            onChange={(e) => handleUpdateRowSerial(row.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNewRow();
                              }
                            }}
                            placeholder="Scan barcode or type Series No..."
                            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddNewRow();
                            }}
                            title="Add next machine (+)"
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-950/50 transition-all cursor-pointer active:scale-95 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Add</span>
                          </button>
                        </div>
                        {row.error && (
                          <p className="text-[10px] text-rose-400 font-semibold mt-0.5">{row.error}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Batch Error Banner */}
          {batchError && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{batchError}</span>
            </div>
          )}

        </div>

        {/* Modal Bottom Action Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCloseModal}
            className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {selectedProcess === 'SEND_ELT' ? (
            <button
              type="button"
              disabled={isSubmittingELT || machineRows.filter(r => r.serialNumber.trim().length > 0).length === 0}
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
                  <span>
                    SEND ELT ({machineRows.filter(r => r.serialNumber.trim().length > 0).length || 1} Machine{machineRows.filter(r => r.serialNumber.trim().length > 0).length > 1 ? 's' : ''})
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmittingBSR || machineRows.filter(r => r.serialNumber.trim().length > 0 && r.matchStatus === 'matched').length === 0}
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
                  <span>
                    BSR RETURN ({machineRows.filter(r => r.serialNumber.trim().length > 0 && r.matchStatus === 'matched').length || 1} Machine{machineRows.filter(r => r.serialNumber.trim().length > 0 && r.matchStatus === 'matched').length > 1 ? 's' : ''})
                  </span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
