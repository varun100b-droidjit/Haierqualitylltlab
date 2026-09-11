import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ScanBarcode, 
  Camera, 
  CameraOff, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Clock, 
  User, 
  SwitchCamera, 
  Upload, 
  Image as ImageIcon,
  Layers,
  Sparkles,
  RefreshCw,
  MapPin,
  Hash
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { findModelByPrefix, getAllModels } from '../../services/modelMasterStore';
import { useAuth } from '../../context/AuthContext';
import { LeakUnitRecord } from './SmogModule';

interface SmogBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveLeakUnits: (records: LeakUnitRecord[]) => void;
}

export interface ScannedMachineItem {
  id: string;
  serialNumber: string;
  modelName: string;
  prefix: string;
  materialCode: string;
}

// Utility to get next day (YYYY-MM-DD)
export function getNextDayISO(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 1);
    const nextY = date.getFullYear();
    const nextM = String(date.getMonth() + 1).padStart(2, '0');
    const nextD = String(date.getDate()).padStart(2, '0');
    return `${nextY}-${nextM}-${nextD}`;
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
}

const STORAGE_KEY_PROD_DATE = 'smog_scanner_production_date';
const STORAGE_KEY_SMOG_DATE = 'smog_scanner_smog_date';
const STORAGE_KEY_SHIFT = 'smog_scanner_shift';
const STORAGE_KEY_LEAK_LOCATION = 'smog_scanner_leak_location';
const STORAGE_KEY_LEAK_QTY = 'smog_scanner_leak_qty';

export const SmogBarcodeScannerModal: React.FC<SmogBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onSaveLeakUnits
}) => {
  const { user } = useAuth();
  const operatorUserId = user?.userId || 'ADMIN01';
  const operatorName = user?.name || 'Admin Operator';

  // Persistent Date & Shift Setup - stays locked across day changes until manually edited
  const [shift, setShift] = useState<'A' | 'B' | 'C'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SHIFT);
      if (saved === 'A' || saved === 'B' || saved === 'C') return saved;
    } catch {}
    return 'A';
  });

  const [productionDate, setProductionDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROD_DATE);
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    return new Date().toISOString().split('T')[0];
  });

  const [smogDate, setSmogDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SMOG_DATE);
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    const today = new Date().toISOString().split('T')[0];
    return getNextDayISO(today);
  });

  // Leak Unit Location & Qty - Required to open scanner
  const [leakLocation, setLeakLocation] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LEAK_LOCATION);
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    return '';
  });
  const [leakQty, setLeakQty] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LEAK_QTY);
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    return '1';
  });
  const [locationError, setLocationError] = useState<boolean>(false);
  const locationInputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync persistent dates, location and qty whenever scanner modal is opened
  useEffect(() => {
    if (isOpen) {
      try {
        const savedProd = localStorage.getItem(STORAGE_KEY_PROD_DATE);
        if (savedProd && savedProd.trim()) {
          setProductionDate(savedProd.trim());
        }
        const savedSmog = localStorage.getItem(STORAGE_KEY_SMOG_DATE);
        if (savedSmog && savedSmog.trim()) {
          setSmogDate(savedSmog.trim());
        }
        const savedShift = localStorage.getItem(STORAGE_KEY_SHIFT);
        if (savedShift === 'A' || savedShift === 'B' || savedShift === 'C') {
          setShift(savedShift);
        }
        const savedLoc = localStorage.getItem(STORAGE_KEY_LEAK_LOCATION);
        if (savedLoc && savedLoc.trim()) {
          setLeakLocation(savedLoc.trim());
        }
        const savedQty = localStorage.getItem(STORAGE_KEY_LEAK_QTY);
        if (savedQty && savedQty.trim()) {
          setLeakQty(savedQty.trim());
        }
      } catch {}
    }
  }, [isOpen]);

  const handleLeakQtyChange = (val: string) => {
    setLeakQty(val);
    try {
      localStorage.setItem(STORAGE_KEY_LEAK_QTY, val);
    } catch {}
  };

  // Scanned list
  const [scannedMachines, setScannedMachines] = useState<ScannedMachineItem[]>([]);
  const [manualSerialInput, setManualSerialInput] = useState('');
  const [manualModelInput, setManualModelInput] = useState('');

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
  const scannerContainerId = 'smog-barcode-reader-viewfinder';

  // Throttling and duplicate prevention
  const lastScannedBarcodeRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);
  const isProcessingScanRef = useRef<boolean>(false);
  const [toastFeedback, setToastFeedback] = useState<{ serial: string; model: string } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Audio feedback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playScanBeep = () => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }
      const audioCtx = audioCtxRef.current;
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 30, 40]);
      }
    } catch {
      // Audio fallback safe
    }
  };

  // Synchronize and persist Production Date - stays locked and does not auto-change across days
  const handleProductionDateChange = (newProdDate: string) => {
    const trimmed = newProdDate.trim();
    setProductionDate(trimmed);
    try {
      localStorage.setItem(STORAGE_KEY_PROD_DATE, trimmed);
    } catch {}
  };

  // Synchronize and persist Smog Date - stays locked until operator manually changes it
  const handleSmogDateChange = (newSmogDate: string) => {
    const trimmed = newSmogDate.trim();
    setSmogDate(trimmed);
    try {
      localStorage.setItem(STORAGE_KEY_SMOG_DATE, trimmed);
    } catch {}
  };

  // Synchronize and persist Shift
  const handleShiftChange = (newShift: 'A' | 'B' | 'C') => {
    setShift(newShift);
    try {
      localStorage.setItem(STORAGE_KEY_SHIFT, newShift);
    } catch {}
  };

  // Synchronize and persist Leak Unit Location
  const handleLeakLocationChange = (newLoc: string) => {
    setLeakLocation(newLoc);
    setLocationError(false);
    try {
      localStorage.setItem(STORAGE_KEY_LEAK_LOCATION, newLoc);
    } catch {}
  };

  // Add a scanned machine item
  const addScannedMachine = (serial: string, explicitModel?: string) => {
    const cleanSerial = serial.trim().toUpperCase();
    if (!cleanSerial) return;

    // Check duplicate in active batch
    if (scannedMachines.some(m => m.serialNumber === cleanSerial)) {
      setToastFeedback({ serial: cleanSerial, model: 'Already scanned in this batch!' });
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToastFeedback(null), 2000);
      return;
    }

    // Lookup Model from Model Master (check first 9 chars and full barcode)
    let modelName = explicitModel || '';
    let materialCode = '';
    let prefix = '';

    if (!modelName) {
      const match = findModelByPrefix(cleanSerial);
      if (match) {
        modelName = match.modelName;
        materialCode = match.materialCode;
        prefix = match.materialCode;
      } else {
        modelName = 'General Smog Unit';
      }
    }

    playScanBeep();

    const newItem: ScannedMachineItem = {
      id: `smog-scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serialNumber: cleanSerial,
      modelName,
      prefix,
      materialCode
    };

    setScannedMachines(prev => [newItem, ...prev]);
    setManualSerialInput('');
    setManualModelInput('');

    setToastFeedback({ serial: cleanSerial, model: modelName });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastFeedback(null), 2500);
  };

  // Handle barcode scanned from camera or scanner gun
  const handleBarcodeScanned = (rawBarcode: string) => {
    if (!rawBarcode) return;
    const cleanBarcode = rawBarcode.trim().toUpperCase();
    if (!cleanBarcode) return;

    const now = Date.now();

    // Prevent immediate duplicate reading
    if (cleanBarcode === lastScannedBarcodeRef.current && now - lastScanTimeRef.current < 2200) {
      return;
    }

    if (isProcessingScanRef.current || now - lastScanTimeRef.current < 600) {
      return;
    }

    isProcessingScanRef.current = true;
    lastScannedBarcodeRef.current = cleanBarcode;
    lastScanTimeRef.current = now;

    addScannedMachine(cleanBarcode);

    setTimeout(() => {
      isProcessingScanRef.current = false;
    }, 600);
  };

  const handleBarcodeScannedRef = useRef(handleBarcodeScanned);
  useEffect(() => {
    handleBarcodeScannedRef.current = handleBarcodeScanned;
  });

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
        console.warn('Camera stop notice:', e);
      }
      try {
        await scanner.clear();
      } catch (e) {
        console.warn('Camera clear notice:', e);
      }
      html5QrCodeRef.current = null;
    }
    isScanningRef.current = false;
    setIsCameraActive(false);
  };

  // Start Camera with Multi-Tier Fallback and Fresh Instance per Attempt
  const startCamera = async (targetCameraId?: string) => {
    if (!leakLocation.trim()) {
      setLocationError(true);
      if (locationInputRef.current) {
        locationInputRef.current.focus();
      }
      return;
    }

    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null);

    try {
      // 1. Clean up any existing scanner
      await stopCamera();

      // 2. Wait for DOM container
      const container = document.getElementById(scannerContainerId);
      if (!container) {
        isStartingRef.current = false;
        return;
      }

      // 3. Supported barcode formats (both 1D industrial and 2D)
      const formats = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.DATA_MATRIX
      ];

      // Wide barcode scan area optimized for horizontal machine serials
      const qrConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const w = Math.min(Math.floor(viewfinderWidth * 0.88), 360);
          const h = Math.min(Math.floor(viewfinderHeight * 0.65), 180);
          return { width: Math.max(w, 200), height: Math.max(h, 100) };
        }
      };

      // 4. Enumerate cameras
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
        console.warn('Camera enumeration notice:', camErr);
      }

      // Multi-tier attempts:
      // Priority 1: Specified targetCameraId if user explicitly tapped switch
      // Priority 2: { facingMode: 'environment' } (Rear camera WebRTC standard)
      // Priority 3: Explicit back camera ID from enumeration
      // Priority 4: { facingMode: 'user' }
      // Priority 5: {}
      const attempts: any[] = [];
      if (targetCameraId) {
        attempts.push(targetCameraId);
      } else {
        attempts.push({ facingMode: 'environment' });
        if (cameraList.length > 0) {
          const backCam = cameraList.find(c => /back|rear|environment|main/i.test(c.label)) || cameraList[0];
          attempts.push(backCam.id);
        }
        attempts.push({ facingMode: 'user' });
        attempts.push({});
      }

      let started = false;
      let lastErr: any = null;

      for (const config of attempts) {
        try {
          // Create a fresh Html5Qrcode instance for each config to avoid corrupted state machines
          const scanner = new Html5Qrcode(scannerContainerId, {
            formatsToSupport: formats,
            verbose: false
          });
          html5QrCodeRef.current = scanner;

          await scanner.start(
            config,
            qrConfig,
            (decodedText) => {
              if (handleBarcodeScannedRef.current) {
                handleBarcodeScannedRef.current(decodedText);
              }
            },
            () => {
              // Frame decoding in progress
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
        } catch (attemptErr) {
          lastErr = attemptErr;
          try {
            if (html5QrCodeRef.current) {
              await html5QrCodeRef.current.clear();
            }
          } catch {}
          html5QrCodeRef.current = null;
        }
      }

      if (!started) {
        throw lastErr || new Error('Could not access camera video stream');
      }
    } catch (err: any) {
      console.warn('Camera start error:', err);
      isScanningRef.current = false;
      setIsCameraActive(false);
      const errMsg = err?.message || String(err);
      if (err?.name === 'NotAllowedError' || errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('denied')) {
        setCameraError('Camera permission was blocked. Tap "Activate Camera" below to grant permission, or use "Snap Photo".');
      } else {
        setCameraError('Camera feed in standby. Tap "Activate Camera" or snap a barcode photo directly.');
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  // Flip / Switch Camera
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

  // Snap / Upload Photo scan
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileScanning(true);
    setCameraError(null);

    try {
      // Create temporary scanner instance for file
      const tempScanner = new Html5Qrcode('smog-file-scanner-temp', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A
        ],
        verbose: false
      });

      const decodedText = await tempScanner.scanFile(file, true);
      try { await tempScanner.clear(); } catch {}

      if (decodedText) {
        handleBarcodeScanned(decodedText);
      }
    } catch (err: any) {
      console.warn('File scan error:', err);
      setCameraError('Could not decode barcode from photo. Please enter serial number manually.');
    } finally {
      setIsFileScanning(false);
      if (e.target) e.target.value = '';
    }
  };

  // Clean up camera on modal close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setScannedMachines([]);
      setManualSerialInput('');
      setManualModelInput('');
      setLocationError(false);
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Remove single row
  const handleDeleteMachine = (id: string) => {
    setScannedMachines(prev => prev.filter(m => m.id !== id));
  };

  // Save all scanned machines
  const handleConfirmSave = () => {
    if (scannedMachines.length === 0) {
      alert('Please scan at least 1 machine barcode before saving.');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const parsedQty = parseInt(leakQty, 10);
    const validQty = (!isNaN(parsedQty) && parsedQty > 0) ? parsedQty : 1;

    // Each scanned unit becomes a LeakUnitRecord
    // This ensures: Total Leak Units increases by scannedMachines.length
    // And Total Suspect increases by quantity
    const newRecords: LeakUnitRecord[] = scannedMachines.map((machine, idx) => ({
      id: `leak-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      smogPerson: (operatorName && operatorName !== 'Lab Administrator' && operatorUserId !== 'ADMIN01') ? `${operatorName} (${operatorUserId})` : '',
      shift: shift,
      modelName: machine.modelName || 'SAC-1.5T-INV-3S',
      serialNumbers: [machine.serialNumber],
      passedSerials: [], // Initially 0 passed
      suspectCount: validQty,   // Sets Qty entered by user
      actualCount: 0,
      date: smogDate,    // Categorized under Smog Date
      month: smogDate.substring(0, 7),
      time: timeStr,
      createdAt: now.toISOString(),
      notes: `Scanned via Smog Barcode Scanner [Prod: ${productionDate} | Smog: ${smogDate} | Shift: ${shift}${leakLocation.trim() ? ` | Loc: ${leakLocation.trim()}` : ''} | Qty: ${validQty}]`,
      productionDate,
      smogDate,
      operatorUserId,
      location: leakLocation.trim() || 'General Location',
      qty: validQty
    }));

    onSaveLeakUnits(newRecords);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Hidden container for file-based decoding */}
        <div id="smog-file-scanner-temp" className="hidden" />

        {/* MODAL HEADER */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400 shadow-md shadow-cyan-950/50">
              <ScanBarcode className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Smog Leak Unit Scanner
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* ULTRA-COMPACT SECTION 1: SHIFT & DATE SETUP */}
          <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-950/95 border border-slate-800 space-y-2 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Shift Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Shift:
                </span>
                <div className="inline-flex rounded-xl bg-slate-900 p-0.5 border border-slate-800">
                  {(['A', 'B', 'C'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleShiftChange(s)}
                      className={`px-3 py-1 rounded-lg text-xs font-black font-mono transition-all cursor-pointer ${
                        shift === s
                          ? s === 'A'
                            ? 'bg-cyan-500 text-slate-950 shadow-sm font-black'
                            : s === 'B'
                            ? 'bg-amber-400 text-slate-950 shadow-sm font-black'
                            : 'bg-indigo-400 text-slate-950 shadow-sm font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Shift {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operator info badge */}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                <User className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="font-semibold text-slate-300 truncate max-w-[140px]">{operatorName}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-mono">
                  {operatorUserId}
                </span>
              </div>
            </div>

            {/* Compact 2-column Date row on mobile and desktop */}
            <div className="grid grid-cols-2 gap-2">
              {/* Production Date */}
              <div className="p-1.5 px-2.5 rounded-xl bg-slate-900/90 border border-slate-800 focus-within:border-cyan-500/60 transition-colors">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5 text-cyan-400" />
                    <span>Prod Date</span>
                  </span>
                  <span className="text-[9px] text-cyan-400 font-mono font-bold">Locked</span>
                </div>
                <input
                  type="date"
                  value={productionDate}
                  onChange={(e) => handleProductionDateChange(e.target.value)}
                  className="w-full bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer p-0"
                />
              </div>

              {/* Smog Date */}
              <div className="p-1.5 px-2.5 rounded-xl bg-slate-900/90 border border-emerald-900/60 focus-within:border-emerald-500/60 transition-colors">
                <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Smog Date</span>
                  </span>
                  <span className="text-[9px] text-emerald-400 font-mono font-bold">Locked</span>
                </div>
                <input
                  type="date"
                  value={smogDate}
                  onChange={(e) => handleSmogDateChange(e.target.value)}
                  className="w-full bg-transparent text-xs font-mono font-bold text-emerald-300 focus:outline-none cursor-pointer p-0"
                />
              </div>
            </div>

            {/* LOCATION NAME & QTY (LEFT & RIGHT IN ONE LINE) */}
            <div className={`p-2.5 rounded-xl bg-slate-900/90 border transition-all ${
              locationError && !leakLocation.trim()
                ? 'border-rose-500/80 ring-1 ring-rose-500/30'
                : 'border-slate-800 focus-within:border-cyan-500/80'
            }`}>
              <div className="flex items-center gap-2">
                {/* Left: Location Name Input */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
                    <span className="flex items-center gap-1 text-cyan-400 font-mono">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">Location Name</span>
                    </span>
                    {leakLocation.trim() && (
                      <span className="text-[9px] font-mono text-emerald-400 font-bold flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Ready
                      </span>
                    )}
                  </div>
                  <input
                    ref={locationInputRef}
                    type="text"
                    value={leakLocation}
                    onChange={(e) => handleLeakLocationChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        startCamera();
                      }
                    }}
                    placeholder="Enter Location Name (e.g. Line 1, Test Bed)..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-white placeholder:text-slate-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Right: Qty Input */}
                <div className="w-24 sm:w-28 shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-cyan-400 font-mono flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Qty</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={leakQty}
                    onChange={(e) => handleLeakQtyChange(e.target.value)}
                    placeholder="1"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-white text-center placeholder:text-slate-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {locationError && !leakLocation.trim() && (
                <p className="text-[10px] text-rose-400 font-mono mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Scanner open karne ke liye Location Name fill karein.
                </p>
              )}
            </div>
          </div>

          {/* SECTION 2: LIVE CAMERA SCANNER */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span>Camera Barcode / QR Scanner</span>
              </span>

              <div className="flex items-center gap-1.5">
                {isCameraActive && availableCameras.length > 1 && (
                  <button
                    type="button"
                    onClick={switchCamera}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-800 flex items-center gap-1 cursor-pointer"
                    title="Switch Camera (Front / Rear)"
                  >
                    <SwitchCamera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Flip</span>
                  </button>
                )}

                {isCameraActive && (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    <span>Stop Camera</span>
                  </button>
                )}
              </div>
            </div>

            {/* Camera Viewfinder Box with Stable Height */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 min-h-[220px] sm:min-h-[250px] flex items-center justify-center">
              
              {/* Dedicated Html5Qrcode host container */}
              <div 
                id={scannerContainerId} 
                className="w-full min-h-[220px] sm:min-h-[250px] flex items-center justify-center overflow-hidden" 
              />

              {/* Scanning visual overlay with laser */}
              {isCameraActive && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  <div className="w-[82%] max-w-[320px] h-28 border-2 border-dashed border-cyan-400/90 rounded-xl relative overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.3)]">
                    {/* Laser scanning line animation */}
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent absolute top-0 animate-[bounce_2s_infinite]" />
                    <div className="absolute bottom-1 right-2 text-[9px] font-mono text-cyan-400 font-bold drop-shadow">
                      Point at Machine Barcode
                    </div>
                  </div>
                </div>
              )}

              {/* User gesture overlay when camera is paused or standby */}
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xs text-center z-10">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-950/90 border border-cyan-800 flex items-center justify-center text-cyan-400 mb-3 shadow-lg shadow-cyan-950/50">
                    <Camera className="w-6 h-6" />
                  </div>

                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
                      !leakLocation.trim()
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        : 'bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-cyan-950/50'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Activate Camera</span>
                  </button>

                  {!leakLocation.trim() && (
                    <p className="text-[10px] text-amber-400 font-mono mt-2">
                      Enter Leak Unit Location above to activate scanner
                    </p>
                  )}
                </div>
              )}

              {/* Instant Scan Toast Feedback */}
              {toastFeedback && (
                <div className="absolute top-2.5 inset-x-3 z-20 flex items-center justify-between p-2.5 bg-emerald-950/95 border border-emerald-500 rounded-xl shadow-2xl text-emerald-200 text-xs animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-mono font-black text-white">{toastFeedback.serial}</span>
                      <span className="text-emerald-300 ml-1.5 font-semibold">({toastFeedback.model})</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded-md shrink-0 border border-emerald-700">
                    Next Ready 🎯
                  </span>
                </div>
              )}
            </div>

            {/* Hidden File Input for Snap Photo fallback */}
            <input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*" 
              capture="environment"
              className="hidden" 
              onChange={handleFileScan}
            />
          </div>

          {/* SECTION 3: MANUAL BARCODE ENTRY / BARCODE GUN INPUT */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 shadow-inner">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Series No. (Barcode / Gun Input):
            </span>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <ScanBarcode className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={manualSerialInput}
                  onChange={(e) => setManualSerialInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addScannedMachine(manualSerialInput, manualModelInput);
                    }
                  }}
                  placeholder="Scan barcode or type Series No..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <input
                type="text"
                value={manualModelInput}
                onChange={(e) => setManualModelInput(e.target.value)}
                placeholder="Model Name (Auto-detected if empty)"
                className="w-full sm:w-56 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />

              <button
                type="button"
                onClick={() => addScannedMachine(manualSerialInput, manualModelInput)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 shrink-0 shadow-md shadow-cyan-950/50"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add (+)</span>
              </button>
            </div>
          </div>

          {/* SECTION 4: SCANNED MACHINES LIST (SUSPECT COUNT ADDITION) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Scanned Machines ({scannedMachines.length} Units)</span>
              </span>

              {scannedMachines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScannedMachines([])}
                  className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {scannedMachines.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-slate-950/50 border border-dashed border-slate-800 text-slate-500 text-xs">
                No machines scanned yet. Aim camera at machine barcode or enter Series No. above.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {scannedMachines.map((m, idx) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-300">{m.serialNumber}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-400 border border-amber-800 font-mono">
                            Suspect (Leak)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          Model: <strong className="text-slate-200">{m.modelName}</strong>
                          {m.materialCode && <span className="text-slate-500 ml-1 font-mono">[{m.materialCode}]</span>}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteMachine(m.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MODAL FOOTER: SAVE ACTIONS */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
            <span>Total Units: <strong className="text-cyan-300 text-sm">{scannedMachines.length}</strong></span>
            <span className="text-slate-600">•</span>
            <span>Adds: <strong className="text-amber-400">+{scannedMachines.length} Suspect</strong></span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={scannedMachines.length === 0}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-950/60 transform active:scale-95 transition-all cursor-pointer"
            >
              Confirm & Save {scannedMachines.length} Leak Units
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
