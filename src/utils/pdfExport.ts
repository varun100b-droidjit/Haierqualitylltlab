import { jsPDF } from 'jspdf';
import { toJpeg } from 'html-to-image';
import { PHOTO_FIELD_DEFINITIONS, getPhotoUrlForContentControl } from './photoManager';
import { isPhotoMissing, getPictureNotAvailableDataUrlSync } from './placeholderImage';
import { getMachineStartDateTime, getMachineEndDateTime, getTestCommencedDate, getTestCompletedDate } from './dateFormatter';
import { NamePlateDetails, ProtoUnitParts, ProtoUnitPhotos, ObservationNote } from '../types';

export interface PDFExportData {
  title?: string;
  unitType?: string;
  unit?: any;
  modelName: string;
  serialNumber?: string;
  iduSerialNumber?: string;
  oduSerialNumber?: string;
  station?: string;
  sampleType?: string;
  materialCode?: string;
  version?: string;
  quantity?: number;
  status?: string;
  requiredHour?: number | string;
  elapsedHours?: number | string;
  pendingHours?: number | string;
  doneHour?: number | string;
  requestBy?: string;
  testPurpose?: string;
  testCommenced?: string;
  testCompleted?: string;
  endDateTime?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  details?: { label: string; value: string }[];
  remarks?: string;
  purpose?: string;
  namePlate?: NamePlateDetails;
  partsInfo?: ProtoUnitParts;
  photos?: ProtoUnitPhotos | { [key: string]: any };
  observations?: { id?: string; text?: string; message?: string; timestamp?: string; time?: string }[];
  timeline?: any[];
  extraInfo?: { label: string; value: string }[];
  fourWaySwing?: string;
  rpm?: string;
}

function showPdfToast(message: string, isError = false) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('pdf-export-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'pdf-export-toast';
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.zIndex = '999999';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '12px';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '700';
  toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  toast.style.transition = 'all 0.3s ease';

  if (isError) {
    toast.style.background = '#450a0a';
    toast.style.color = '#fecaca';
    toast.style.border = '1px solid #dc2626';
    toast.innerHTML = `<span>⚠️</span> <span>${message}</span>`;
  } else {
    toast.style.background = '#022c22';
    toast.style.color = '#a7f3d0';
    toast.style.border = '1px solid #059669';
    toast.innerHTML = `<span>📄</span> <span>${message}</span>`;
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

export async function exportUnitToPDF(rawInput: PDFExportData) {
  showPdfToast('Preparing & downloading full machine PDF (A to Z)...');

  // Enrich data from unit object if provided
  const unit = rawInput.unit || {};
  const modelName = rawInput.modelName || unit.modelName || 'Unknown_Model';
  const iduSerial = rawInput.iduSerialNumber || unit.iduSerialNumber || '';
  const oduSerial = rawInput.oduSerialNumber || unit.oduSerialNumber || '';
  const serialNumber = rawInput.serialNumber || (iduSerial && oduSerial ? `IDU: ${iduSerial} | ODU: ${oduSerial}` : (iduSerial || oduSerial || unit.serialNumber || 'N/A'));
  
  const title = rawInput.title || 'Comprehensive Machine Inspection Report';
  const unitType = rawInput.unitType || 'Air Conditioner Testing Unit';
  const station = rawInput.station || unit.station || 'Station 01';
  const status = (rawInput.status || unit.status || 'LIVE TESTING').toString().toUpperCase();
  const sampleType = rawInput.sampleType || unit.sampleType || 'Proto Type';
  const requestBy = rawInput.requestBy || unit.requestBy || unit.rdPerson || unit.bsrPerson || 'R&D Department';
  const testPurpose = rawInput.testPurpose || rawInput.purpose || unit.testPurpose || 'Comprehensive Reliability & Performance Testing';
  
  const requiredHour = rawInput.requiredHour ?? unit.requiredHour ?? (unit.dayDuration ? `${unit.dayDuration * 24} Hours` : 'N/A');
  const elapsedHours = rawInput.elapsedHours ?? (unit.doneHour !== undefined ? `${unit.doneHour} Hours` : 'N/A');
  const pendingHours = rawInput.pendingHours ?? 'N/A';
  
  const mergedUnit = { ...unit, ...rawInput };
  const machineStart = getMachineStartDateTime(mergedUnit);
  const machineEnd = getMachineEndDateTime(mergedUnit);

  const testCommenced = machineStart !== 'N/A' && machineStart !== '-' ? machineStart : (rawInput.testCommenced || unit.reportDetails?.testCommenced || unit.createdAt || '-');
  const testCompleted = machineEnd;
  const remarks = rawInput.remarks || unit.remarks || unit.notes || 'Standard testing protocol followed. All functional components validated.';

  const namePlate: NamePlateDetails = rawInput.namePlate || unit.namePlate || {};
  const partsInfo: ProtoUnitParts = rawInput.partsInfo || unit.partsInfo || {};
  const photosData = rawInput.photos || unit.photos || {};

  // Extract all observations
  const observations = rawInput.observations || unit.observations || [];

  // Extract timeline if available (e.g. R&D units)
  const timeline = rawInput.timeline || unit.timeline || [];

  // Extract all 12 photos
  const fallbackPlaceholder = getPictureNotAvailableDataUrlSync();
  const resolvedPhotos = PHOTO_FIELD_DEFINITIONS.map((def, idx) => {
    const rawUrl = getPhotoUrlForContentControl(photosData, def.photoKey);
    const isMissing = isPhotoMissing(rawUrl);
    return {
      index: idx + 1,
      label: def.label,
      section: def.section,
      photoKey: def.photoKey,
      url: (!isMissing && rawUrl) ? rawUrl.trim() : fallbackPlaceholder,
      isUploaded: !isMissing && Boolean(rawUrl)
    };
  });

  const uploadedCount = resolvedPhotos.filter(p => p.isUploaded).length;
  const safeFileName = `${modelName}_${iduSerial || oduSerial || 'Machine'}_Full_Report`.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Build the complete HTML markup
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; background: #ffffff; width: 800px; padding: 28px 32px; box-sizing: border-box; line-height: 1.45; font-size: 11px;">
      
      <!-- Top Branding Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0891b2; padding-bottom: 14px; margin-bottom: 18px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; background: #0891b2; border-radius: 3px;"></span>
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #0891b2;">Quality Assurance & Testing Division</span>
          </div>
          <h1 style="margin: 4px 0 2px 0; font-size: 20px; font-weight: 900; color: #0e7490; letter-spacing: -0.5px;">${title}</h1>
          <p style="margin: 0; font-size: 11px; color: #475569; font-weight: 600;">
            ${unitType} &bull; Complete Machine Record (A to Z) &bull; Model: <span style="color: #0891b2; font-weight: 800;">${modelName}</span>
          </p>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; background: ${status.includes('PASS') ? '#ecfdf5' : '#f0fdf4'}; color: ${status.includes('PASS') ? '#047857' : '#0891b2'}; border: 1.5px solid ${status.includes('PASS') ? '#a7f3d0' : '#a5f3fc'};">
            ${status}
          </div>
          <p style="margin: 6px 0 0 0; font-size: 10px; color: #64748b; font-weight: 500;">
            Report Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p style="margin: 2px 0 0 0; font-size: 9px; color: #94a3b8; font-family: monospace;">
            ID: REP-${modelName.slice(0, 6)}-${Date.now().toString().slice(-6)}
          </p>
        </div>
      </div>

      <!-- Section A: General Machine & Testing Information -->
      <div style="margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0e7490; background: #f0fdfa; border-left: 4px solid #0891b2; padding: 4px 10px; margin-bottom: 8px;">
          Section A: Machine Identification & Testing Overview
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1px solid #e2e8f0;">
          <tbody>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 10px; font-weight: 700; color: #475569; width: 22%;">Model Name:</td>
              <td style="padding: 6px 10px; font-weight: 800; color: #0f172a; width: 28%;">${modelName}</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #475569; width: 22%;">Testing Station:</td>
              <td style="padding: 6px 10px; font-weight: 800; color: #0891b2; width: 28%;">${station}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">IDU Serial Number:</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #0f172a; font-family: monospace;">${iduSerial || 'N/A'}</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">ODU Serial Number:</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #0f172a; font-family: monospace;">${oduSerial || serialNumber}</td>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">Sample Type:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">${sampleType}</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">Requested By:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">${requestBy}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">Start Date & Time (Test Commenced):</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #0f172a; font-family: monospace;">${testCommenced}</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">End Date & Time (Test Completed):</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #047857; font-family: monospace;">${testCompleted}</td>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">Required Duration:</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #0f172a;">${requiredHour}</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">Elapsed / Done Hours:</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #047857;">${elapsedHours}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">Pending Hours:</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #b45309;">${pendingHours}</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #475569;">Current Status:</td>
              <td style="padding: 6px 10px; font-weight: 800; color: #0e7490;">${status}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; font-weight: 700; color: #475569; vertical-align: top;">Testing Purpose:</td>
              <td colspan="3" style="padding: 6px 10px; font-weight: 500; color: #334155; line-height: 1.4;">${testPurpose}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Section B: Technical & Nameplate Specifications -->
      <div style="margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0e7490; background: #f0fdfa; border-left: 4px solid #0891b2; padding: 4px 10px; margin-bottom: 8px;">
          Section B: Nameplate & Electrical Technical Specifications
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #e0f2fe; color: #0369a1; text-align: left; font-weight: 800; border-bottom: 1px solid #bae6fd;">
              <th style="padding: 6px 10px; width: 25%;">Parameter</th>
              <th style="padding: 6px 10px; width: 25%;">Value</th>
              <th style="padding: 6px 10px; width: 25%;">Parameter</th>
              <th style="padding: 6px 10px; width: 25%;">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Cooling Capacity</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.coolingCapacity || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Rated Cooling Power</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.ratedCoolingPower || 'N/A'}</td>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Rated Total Power</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.ratedPower || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Rated Current</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.ratedCurrent || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Operating Voltage</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.voltage || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">ISEER Rating</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.iseer || 'N/A'}</td>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Refrigerant Type</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.refrigerant || 'R32'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Gas / Refrigerant Quantity</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.gasQty || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Gas Injection Volume</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.gasInjectionVolume || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Power Mode</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.powerMode || 'N/A'}</td>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Main Checksum (IDU)</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0e7490; font-family: monospace;">${namePlate.mainProgramChecksumIdu || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Main Checksum (ODU)</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0e7490; font-family: monospace;">${namePlate.mainProgramChecksumOdu || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">EE Checksum (IDU)</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #475569; font-family: monospace;">${namePlate.eeChecksumIdu || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">EE Checksum (ODU)</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #475569; font-family: monospace;">${namePlate.eeChecksumOdu || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">4-Way Swing</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.fourWaySwing || rawInput.fourWaySwing || partsInfo.fourWaySwing || partsInfo.iduFourWaySwing || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #475569;">Fan RPM</td>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">${namePlate.rpm || rawInput.rpm || partsInfo.rpm || partsInfo.iduRpm || 'N/A'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Section C: Key Component Parts & Supplier Information -->
      <div style="margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0e7490; background: #f0fdfa; border-left: 4px solid #0891b2; padding: 4px 10px; margin-bottom: 8px;">
          Section C: Key Components & Bill of Materials (BOM)
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #e0f2fe; color: #0369a1; text-align: left; font-weight: 800; border-bottom: 1px solid #bae6fd;">
              <th style="padding: 6px 10px; width: 22%;">Component Name</th>
              <th style="padding: 6px 10px; width: 28%;">Specification / Model</th>
              <th style="padding: 6px 10px; width: 25%;">Part Code</th>
              <th style="padding: 6px 10px; width: 25%;">Supplier / Manufacturer</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">IDU Fan Motor</td>
              <td style="padding: 5px 10px; color: #334155;">${partsInfo.iduMotorSpec || 'Standard IDU Motor'}</td>
              <td style="padding: 5px 10px; font-family: monospace; font-weight: 600; color: #475569;">${partsInfo.iduMotorPartCode || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #0f172a;">${partsInfo.iduMotorSupplier || 'N/A'}</td>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">IDU Control PCB</td>
              <td style="padding: 5px 10px; color: #334155;">Inverter Indoor Mainboard</td>
              <td style="padding: 5px 10px; font-family: monospace; font-weight: 600; color: #475569;">${partsInfo.iduPcbPartCode || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #0f172a;">${partsInfo.iduPcbSupplier || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">ODU Fan Motor</td>
              <td style="padding: 5px 10px; color: #334155;">${partsInfo.oduMotorSpec || 'Standard ODU Motor'}</td>
              <td style="padding: 5px 10px; font-family: monospace; font-weight: 600; color: #475569;">${partsInfo.oduMotorPartCode || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #0f172a;">${partsInfo.oduMotorSupplier || 'N/A'}</td>
            </tr>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">ODU Power PCB</td>
              <td style="padding: 5px 10px; color: #334155;">Inverter Outdoor Mainboard</td>
              <td style="padding: 5px 10px; font-family: monospace; font-weight: 600; color: #475569;">${partsInfo.oduPcbPartCode || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #0f172a;">${partsInfo.oduPcbSupplier || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">Rotary Compressor</td>
              <td style="padding: 5px 10px; color: #334155;">${partsInfo.compressorSpec || partsInfo.oduCompressorSpec || 'Inverter Rotary Compressor'}</td>
              <td style="padding: 5px 10px; font-family: monospace; font-weight: 600; color: #475569;">${partsInfo.compressorPartCode || partsInfo.oduCompressorPartCode || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #0f172a;">${partsInfo.compressorSupplier || partsInfo.oduCompressorSupplier || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 5px 10px; font-weight: 700; color: #0f172a;">Expansion Valve (EEV)</td>
              <td style="padding: 5px 10px; color: #334155;">${partsInfo.eevSpec || partsInfo.oduEevSpec || 'Pulse Stepper EEV'}</td>
              <td style="padding: 5px 10px; font-family: monospace; font-weight: 600; color: #475569;">${partsInfo.eevPartCode || partsInfo.oduEevPartCode || 'N/A'}</td>
              <td style="padding: 5px 10px; font-weight: 600; color: #0f172a;">${partsInfo.eevSupplier || partsInfo.oduEevSupplier || 'N/A'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Section D: 12-Slot Standard Inspection Photos Gallery -->
      <div style="margin-bottom: 18px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f0fdfa; border-left: 4px solid #0891b2; padding: 4px 10px; margin-bottom: 8px;">
          <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0e7490;">
            Section D: Standard 12-Slot Component Inspection Photos
          </div>
          <div style="font-size: 10px; font-weight: 700; color: #0e7490;">
            Uploaded: ${uploadedCount} / 12 Photos
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          ${resolvedPhotos.map(photo => `
            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px; background: #ffffff; text-align: center; box-sizing: border-box;">
              <div style="font-size: 9px; font-weight: 800; color: #1e293b; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${photo.label}">
                #${photo.index}. ${photo.label}
              </div>
              <div style="width: 100%; height: 95px; background: #f1f5f9; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0;">
                <img 
                  src="${photo.url}" 
                  alt="${photo.label}" 
                  style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" 
                  crossOrigin="anonymous" 
                />
              </div>
              <div style="margin-top: 4px; font-size: 8px; font-weight: 800; text-transform: uppercase; color: ${photo.isUploaded ? '#059669' : '#94a3b8'};">
                ${photo.isUploaded ? '✓ Verified Photo' : 'No Photo Uploaded'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Section E: Observation Notes & Chronological Test Records -->
      <div style="margin-bottom: 18px; page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0e7490; background: #f0fdfa; border-left: 4px solid #0891b2; padding: 4px 10px; margin-bottom: 8px;">
          Section E: Observation Notes & Quality Log History (${observations.length} Entries)
        </div>
        ${observations.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #e2e8f0;">
            <thead>
              <tr style="background: #e0f2fe; color: #0369a1; text-align: left; font-weight: 800; border-bottom: 1px solid #bae6fd;">
                <th style="padding: 6px 10px; width: 8%;">#</th>
                <th style="padding: 6px 10px; width: 24%;">Date & Timestamp</th>
                <th style="padding: 6px 10px; width: 68%;">Observation Note / Findings</th>
              </tr>
            </thead>
            <tbody>
              ${observations.map((obs: any, i: number) => `
                <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 6px 10px; font-weight: 700; color: #64748b;">${i + 1}</td>
                  <td style="padding: 6px 10px; font-family: monospace; font-weight: 600; color: #0e7490;">${obs.timestamp || obs.time || 'Logged'}</td>
                  <td style="padding: 6px 10px; color: #1e293b; font-weight: 500;">${obs.text || obs.message || 'Observation logged.'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <div style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #64748b; font-style: italic; font-size: 10px;">
            No specific anomalies or defects observed during testing. Unit operation remained stable.
          </div>
        `}
      </div>

      <!-- Section F: Timeline & Transfer History (If Present) -->
      ${timeline.length > 0 ? `
        <div style="margin-bottom: 18px; page-break-inside: avoid;">
          <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0e7490; background: #f0fdfa; border-left: 4px solid #0891b2; padding: 4px 10px; margin-bottom: 8px;">
            Section F: R&D Transfer & Stage Progression History
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #e2e8f0;">
            <thead>
              <tr style="background: #e0f2fe; color: #0369a1; text-align: left; font-weight: 800; border-bottom: 1px solid #bae6fd;">
                <th style="padding: 5px 8px; width: 10%;">Stage</th>
                <th style="padding: 5px 8px; width: 22%;">Stage Name</th>
                <th style="padding: 5px 8px; width: 12%;">Dept</th>
                <th style="padding: 5px 8px; width: 18%;">Person</th>
                <th style="padding: 5px 8px; width: 18%;">Date & Time</th>
                <th style="padding: 5px 8px; width: 20%;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${timeline.map((step: any, i: number) => `
                <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 5px 8px; font-weight: 700; color: #0e7490;">${step.stageIndex !== undefined ? step.stageIndex + 1 : i + 1}</td>
                  <td style="padding: 5px 8px; font-weight: 700; color: #1e293b;">${step.stageName || 'Stage'}</td>
                  <td style="padding: 5px 8px; font-weight: 600; color: #475569;">${step.department || 'R&D'}</td>
                  <td style="padding: 5px 8px; color: #0f172a;">${step.personName || 'N/A'}</td>
                  <td style="padding: 5px 8px; font-family: monospace; color: #64748b;">${step.date} ${step.time || ''}</td>
                  <td style="padding: 5px 8px; color: #475569;">${step.remarks || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Section G: Remarks & Authorization Sign-off -->
      <div style="margin-bottom: 16px; page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #0e7490; background: #f0fdfa; border-left: 4px solid #0891b2; padding: 4px 10px; margin-bottom: 8px;">
          Section G: Inspection Remarks & Authorization Sign-off
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px;">
          <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">Engineer Remarks & Notes:</div>
          <div style="font-size: 11px; color: #1e293b; font-weight: 500; line-height: 1.4;">${remarks}</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px;">
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #ffffff; text-align: center;">
            <div style="height: 35px; border-bottom: 1px dashed #94a3b8; margin-bottom: 6px; display: flex; align-items: flex-end; justify-content: center; font-family: monospace; font-size: 11px; color: #047857; font-weight: 700;">
              ${requestBy}
            </div>
            <div style="font-size: 10px; font-weight: 800; color: #0f172a;">Inspected / Tested By</div>
            <div style="font-size: 8.5px; color: #64748b;">R&D Test Engineer</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #ffffff; text-align: center;">
            <div style="height: 35px; border-bottom: 1px dashed #94a3b8; margin-bottom: 6px; display: flex; align-items: flex-end; justify-content: center; font-family: monospace; font-size: 11px; color: #0e7490; font-weight: 700;">
              QA Verified
            </div>
            <div style="font-size: 10px; font-weight: 800; color: #0f172a;">Quality Verification</div>
            <div style="font-size: 8.5px; color: #64748b;">Quality Assurance Lead</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #ffffff; text-align: center;">
            <div style="height: 35px; border-bottom: 1px dashed #94a3b8; margin-bottom: 6px; display: flex; align-items: flex-end; justify-content: center; font-family: monospace; font-size: 11px; color: #0e7490; font-weight: 700;">
              Authorized
            </div>
            <div style="font-size: 10px; font-weight: 800; color: #0f172a;">Approved By</div>
            <div style="font-size: 8.5px; color: #64748b;">Laboratory In-Charge / Manager</div>
          </div>
        </div>
      </div>

      <!-- Footer Stamp -->
      <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8;">
        <div>AIR CONDITIONER RELIABILITY & PROTO TESTING LABORATORY &bull; CONFIDENTIAL</div>
        <div>Generated via Lab Information Management System &bull; Page 1 of 1</div>
      </div>

    </div>
  `;

  try {
    // Create an off-screen container for rendering
    const container = document.createElement('div');
    container.id = 'temp-pdf-export-container';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.style.background = '#ffffff';
    container.style.zIndex = '-9999';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Ensure all internal images finish loading
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );

    // Convert DOM element to high-res JPEG
    const dataUrl = await toJpeg(container, {
      quality: 0.95,
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      cacheBust: true,
      skipAutoScale: true
    });

    // Cleanup offscreen DOM
    container.remove();

    // Create jsPDF document
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const naturalWidth = img.naturalWidth || 800;
    const naturalHeight = img.naturalHeight || 1200;
    const imgWidth = pdfWidth;
    const imgHeight = (naturalHeight * pdfWidth) / naturalWidth;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(dataUrl, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pdfHeight;

    while (heightLeft > 5) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(dataUrl, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;
    }

    // Trigger direct browser download of the PDF file
    pdf.save(`${safeFileName}.pdf`);
    showPdfToast('✓ PDF downloaded successfully!');

  } catch (err) {
    console.warn("Direct canvas PDF download encountered an issue, launching print window fallback:", err);
    
    // Fallback: Open print window if direct canvas download is constrained
    const printWindow = window.open('', '_blank', 'width=850,height=950');
    if (printWindow) {
      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${safeFileName}</title>
            <style>
              @page { size: A4; margin: 10mm; }
              body { margin: 0; padding: 0; background: #ffffff; }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            ${htmlContent}
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 300);
              };
            </script>
          </body>
        </html>
      `;
      printWindow.document.open();
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      showPdfToast('Opened print / save dialog.');
    } else {
      showPdfToast('Failed to download PDF. Please allow popups.', true);
    }
  }
}
