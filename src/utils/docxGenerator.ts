import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  PHOTO_FIELD_DEFINITIONS, 
  PhotoInsertionLog, 
  PhotoDefinition,
  fetchImageBinary,
  getPhotoUrlForContentControl
} from './photoManager';

export interface ReportDataValues {
  [key: string]: any;
}

export interface DocxGenerationResult {
  blob: Blob;
  logs: PhotoInsertionLog[];
  insertedCount: number;
  totalPhotos: number;
}

/**
 * Converts a Base64 string back to Uint8Array/ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64.split(',').pop() || base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Converts a data URL (e.g. data:image/png;base64,...) to Uint8Array binary and extension
 * Optimized for high performance and minimal memory allocations
 */
const binaryDecodeCache = new Map<string, { bytes: Uint8Array; extension: string }>();

export function dataURLToBinary(dataUrl: string): { bytes: Uint8Array; extension: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string' || dataUrl === 'NA') return null;
  const trimmed = dataUrl.trim();
  if (!trimmed || trimmed === 'NA') return null;

  // Use fast cache key based on length and sample
  const cacheKey = trimmed.length > 200 ? `${trimmed.length}_${trimmed.slice(0, 80)}_${trimmed.slice(-40)}` : trimmed;
  if (binaryDecodeCache.has(cacheKey)) {
    return binaryDecodeCache.get(cacheKey)!;
  }

  try {
    if (trimmed.startsWith('data:')) {
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx !== -1) {
        const header = trimmed.slice(0, commaIdx).toLowerCase();
        const base64Str = trimmed.slice(commaIdx + 1);
        let extension = 'png';
        if (header.includes('jpeg') || header.includes('jpg')) extension = 'jpeg';
        else if (header.includes('png')) extension = 'png';
        else if (header.includes('webp')) extension = 'png';
        
        let binaryString: string;
        try {
          binaryString = window.atob(base64Str);
        } catch {
          binaryString = window.atob(base64Str.replace(/[\s\r\n]+/g, ''));
        }

        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const result = { bytes, extension };
        // Limit cache size to prevent memory leaks
        if (binaryDecodeCache.size > 50) binaryDecodeCache.clear();
        binaryDecodeCache.set(cacheKey, result);
        return result;
      }
    }
    
    // Raw base64 string
    if (trimmed.length > 50 && !trimmed.startsWith('http')) {
      let binaryString: string;
      try {
        binaryString = window.atob(trimmed);
      } catch {
        binaryString = window.atob(trimmed.replace(/[\s\r\n]+/g, ''));
      }
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const result = { bytes, extension: 'png' };
      if (binaryDecodeCache.size > 50) binaryDecodeCache.clear();
      binaryDecodeCache.set(cacheKey, result);
      return result;
    }
  } catch (e) {
    console.error('Error converting dataURL to binary:', e);
    return null;
  }
  return null;
}

export interface DetectedPlaceholders {
  all: string[];
  textPlaceholders: string[];
  photoPlaceholders: string[];
  sdtTags: string[];
  pendingTags: string[];
}

/**
 * Extracts and categorizes all placeholders (Text, Photos, SDTs, Pending) from a DOCX base64 string
 */
export function extractPlaceholdersFromDocx(base64Template: string): DetectedPlaceholders {
  const result: DetectedPlaceholders = {
    all: [],
    textPlaceholders: [],
    photoPlaceholders: [],
    sdtTags: [],
    pendingTags: []
  };

  if (!base64Template) return result;

  try {
    const arrayBuffer = base64ToArrayBuffer(base64Template);
    const zip = new PizZip(arrayBuffer);
    const xmlFiles = Object.keys(zip.files).filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name));

    const seenAll = new Set<string>();
    const seenText = new Set<string>();
    const seenPhoto = new Set<string>();
    const seenSdt = new Set<string>();
    const seenPending = new Set<string>();

    for (const fileName of xmlFiles) {
      let fileXml = zip.file(fileName)?.asText() || '';
      if (!fileXml) continue;
      
      fileXml = cleanSplitTagsInXml(fileXml);

      // 1. Scan {{...}} placeholders
      const mustacheRegex = /\{\{([^{}]+)\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = mustacheRegex.exec(fileXml)) !== null) {
        const rawTag = match[1].trim();
        if (!rawTag || seenAll.has(rawTag)) continue;
        seenAll.add(rawTag);

        const clean = rawTag.replace(/[\s_]+/g, '').toLowerCase();
        const isPhoto = clean.startsWith('photo') || PHOTO_FIELD_DEFINITIONS.some(def =>
          def.photoKey.replace(/[\s_]+/g, '').toLowerCase() === clean ||
          def.id.replace(/[\s_]+/g, '').toLowerCase() === clean ||
          def.aliases.some(a => a.replace(/[\s_]+/g, '').toLowerCase() === clean)
        );

        if (isPhoto) {
          seenPhoto.add(rawTag);
        } else {
          seenText.add(rawTag);
        }
      }

      // 2. Scan <w:sdt> structured document tags
      const sdtRegex = /<w:sdt\b[\s\S]*?<\/w:sdt>/gi;
      let sdtMatch: RegExpExecArray | null;
      while ((sdtMatch = sdtRegex.exec(fileXml)) !== null) {
        const sdtBlock = sdtMatch[0];
        const tagMatch = sdtBlock.match(/<w:tag\s+[^>]*w:val="([^"]+)"/i);
        const aliasMatch = sdtBlock.match(/<w:alias\s+[^>]*w:val="([^"]+)"/i);
        const val = tagMatch ? tagMatch[1] : (aliasMatch ? aliasMatch[1] : '');
        if (val && !seenSdt.has(val)) {
          seenSdt.add(val);
        }
      }

      // 3. Scan [Pending: ...] tags
      const pendingRegex = /\[Pending:?\s*([^\]]+)\]/gi;
      let pendingMatch: RegExpExecArray | null;
      while ((pendingMatch = pendingRegex.exec(fileXml)) !== null) {
        const val = pendingMatch[1].trim();
        if (val && !seenPending.has(val)) {
          seenPending.add(val);
        }
      }
    }

    result.all = Array.from(seenAll);
    result.textPlaceholders = Array.from(seenText);
    result.photoPlaceholders = Array.from(seenPhoto);
    result.sdtTags = Array.from(seenSdt);
    result.pendingTags = Array.from(seenPending);
  } catch (err) {
    console.error('Failed to extract placeholders from DOCX:', err);
  }

  return result;
}

/**
 * Creates OpenXML DrawingML string for an inline image (6 cm x 4 cm standard photo box)
 * 1 cm = 360,000 EMUs -> 6cm = 2,160,000 EMUs, 4cm = 1,440,000 EMUs
 */
export function createDrawingML(
  rId: string, 
  imgId: number, 
  imgName: string, 
  cx: number = 2160000, 
  cy: number = 1440000
): string {
  return `<w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <wp:extent cx="${cx}" cy="${cy}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="${imgId}" name="${imgName}"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
      </wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="${imgId}" name="${imgName}"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="${cx}" cy="${cy}"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>`;
}

/**
 * Injects photos into the DOCX zip package (updating Content_Types, rels, and media files)
 * and generates verification logs for each photo field.
 */
export function injectPhotosIntoZip(
  zip: PizZip, 
  photos: Record<string, string> = {},
  logsMap?: Map<string, PhotoInsertionLog>
): Map<string, string> {
  const photoRIdMap = new Map<string, string>(); // photoKey -> rId

  // 1. Ensure Content_Types has png & jpeg defaults
  let contentTypesXml = zip.file('[Content_Types].xml')?.asText() || '';
  if (contentTypesXml) {
    if (!contentTypesXml.includes('Extension="png"')) {
      contentTypesXml = contentTypesXml.replace('</Types>', '  <Default Extension="png" ContentType="image/png"/>\n</Types>');
    }
    if (!contentTypesXml.includes('Extension="jpeg"')) {
      contentTypesXml = contentTypesXml.replace('</Types>', '  <Default Extension="jpeg" ContentType="image/jpeg"/>\n</Types>');
    }
    if (!contentTypesXml.includes('Extension="jpg"')) {
      contentTypesXml = contentTypesXml.replace('</Types>', '  <Default Extension="jpg" ContentType="image/jpeg"/>\n</Types>');
    }
    zip.file('[Content_Types].xml', contentTypesXml);
  }

  // 2. Read or create word/_rels/document.xml.rels
  let relsXml = zip.file('word/_rels/document.xml.rels')?.asText() || '';
  if (!relsXml) {
    relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>`;
  }

  // 3. Process each standard photo field from PHOTO_FIELD_DEFINITIONS
  PHOTO_FIELD_DEFINITIONS.forEach((def, index) => {
    const rawUrl = getPhotoUrlForContentControl(photos, def.photoKey);
    const foundInDb = Boolean(rawUrl && rawUrl !== 'NA' && rawUrl.trim() !== '');
    const hasUrl = foundInDb;

    const logEntry: PhotoInsertionLog = {
      photoKey: def.photoKey,
      label: def.label,
      foundInDatabase: foundInDb,
      hasImageUrl: hasUrl,
      imageDownloaded: false,
      contentControlFound: false,
      imageInserted: false,
      status: 'missing'
    };

    if (rawUrl && rawUrl !== 'NA' && rawUrl.trim() !== '') {
      const parsed = dataURLToBinary(rawUrl);
      if (parsed) {
        logEntry.imageDownloaded = true;
        const rId = `rIdPhoto_${def.photoKey}`;
        const mediaFileName = `media/photo_${def.photoKey}.${parsed.extension}`;

        // Write image binary to zip media directory
        zip.file(`word/${mediaFileName}`, parsed.bytes);
        
        // Map main photoKey and all aliases
        photoRIdMap.set(def.photoKey, rId);
        photoRIdMap.set(def.id, rId);
        def.aliases.forEach(alias => photoRIdMap.set(alias, rId));

        // Add relationship if not present
        if (!relsXml.includes(`Id="${rId}"`)) {
          const relEntry = `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaFileName}"/>\n`;
          relsXml = relsXml.replace('</Relationships>', `${relEntry}</Relationships>`);
        }
      } else {
        logEntry.details = 'Failed to decode image data format';
      }
    } else {
      logEntry.details = 'Photo not uploaded';
    }

    if (logsMap) {
      logsMap.set(def.photoKey, logEntry);
    }
  });

  // 4. Also process any other custom keys in photos dictionary
  Object.entries(photos).forEach(([customKey, rawUrl]) => {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl === 'NA' || rawUrl.trim() === '') return;
    if (photoRIdMap.has(customKey)) return;

    const parsed = dataURLToBinary(rawUrl);
    if (parsed) {
      const safeKey = customKey.replace(/[^a-zA-Z0-9_]/g, '_');
      const rId = `rIdPhoto_custom_${safeKey}`;
      const mediaFileName = `media/photo_custom_${safeKey}.${parsed.extension}`;

      zip.file(`word/${mediaFileName}`, parsed.bytes);
      photoRIdMap.set(customKey, rId);

      if (!relsXml.includes(`Id="${rId}"`)) {
        const relEntry = `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaFileName}"/>\n`;
        relsXml = relsXml.replace('</Relationships>', `${relEntry}</Relationships>`);
      }
    }
  });

  zip.file('word/_rels/document.xml.rels', relsXml);
  return photoRIdMap;
}

/**
 * Replaces Word Picture Content Controls (<w:sdt>), named Drawing shapes,
 * template photo tags, and table cells under photo labels with embedded image drawings.
 */
export function insertPhotosIntoContentControls(
  docXml: string,
  photoRIdMap: Map<string, string>,
  logsMap?: Map<string, PhotoInsertionLog>
): string {
  let modifiedXml = docXml;

  // 1. Process Structured Document Tags (<w:sdt>) - Word Picture Content Controls
  modifiedXml = modifiedXml.replace(/<w:sdt\b[\s\S]*?<\/w:sdt>/gi, (sdtBlock) => {
    const tagMatch = sdtBlock.match(/<w:tag\s+[^>]*w:val="([^"]+)"/i);
    const aliasMatch = sdtBlock.match(/<w:alias\s+[^>]*w:val="([^"]+)"/i);
    
    const tagVal = tagMatch ? tagMatch[1] : '';
    const aliasVal = aliasMatch ? aliasMatch[1] : '';
    const searchKeys = [tagVal, aliasVal].filter(Boolean);

    let matchedDef: PhotoDefinition | null = null;
    for (const key of searchKeys) {
      const cleanSearch = key.trim().replace(/[\s_]+/g, '').toLowerCase();
      const found = PHOTO_FIELD_DEFINITIONS.find(def => 
        def.photoKey.replace(/[\s_]+/g, '').toLowerCase() === cleanSearch ||
        def.id.replace(/[\s_]+/g, '').toLowerCase() === cleanSearch ||
        def.aliases.some(a => a.replace(/[\s_]+/g, '').toLowerCase() === cleanSearch)
      );
      if (found) {
        matchedDef = found;
        break;
      }
    }

    if (!matchedDef) {
      return sdtBlock;
    }

    const log = logsMap?.get(matchedDef.photoKey);
    if (log) log.contentControlFound = true;

    const rId = photoRIdMap.get(matchedDef.photoKey);
    if (!rId) {
      if (log) {
        log.imageInserted = false;
        log.status = log.hasImageUrl ? 'error' : 'missing';
      }
      return sdtBlock;
    }

    let newSdt = sdtBlock;
    if (/<a:blip\b[^>]*r:embed="[^"]+"/i.test(newSdt)) {
      newSdt = newSdt.replace(/(<a:blip\b[^>]*r:embed=")([^"]+)(")/gi, `$1${rId}$3`);
      if (log) {
        log.imageInserted = true;
        log.status = 'inserted';
      }
      return newSdt;
    }

    const drawingXml = createDrawingML(rId, 600, matchedDef.photoKey, 2160000, 1440000);
    const replacementContent = `<w:sdtContent><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r>${drawingXml}</w:r></w:p></w:sdtContent>`;
    
    if (/<w:sdtContent[\s\S]*?<\/w:sdtContent>/i.test(newSdt)) {
      newSdt = newSdt.replace(/<w:sdtContent[\s\S]*?<\/w:sdtContent>/i, replacementContent);
    } else {
      newSdt = newSdt.replace(/<\/w:sdtPr>/i, `</w:sdtPr>${replacementContent}`);
    }

    if (log) {
      log.imageInserted = true;
      log.status = 'inserted';
    }

    return newSdt;
  });

  // 2. Scan and replace DrawingML shapes named after photo keys
  PHOTO_FIELD_DEFINITIONS.forEach(def => {
    const rId = photoRIdMap.get(def.photoKey);
    const log = logsMap?.get(def.photoKey);

    const aliasesPattern = [def.photoKey, def.id, ...def.aliases].map(a => a.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
    const docPrRegex = new RegExp(`(<wp:docPr[^>]*name=["'](?:${aliasesPattern})["'][\\s\\S]*?<a:blip[^>]*r:embed=["'])([^"']+)(["'])`, 'gi');
    if (docPrRegex.test(modifiedXml)) {
      if (log) log.contentControlFound = true;
      if (rId) {
        modifiedXml = modifiedXml.replace(docPrRegex, `$1${rId}$3`);
        if (log) {
          log.imageInserted = true;
          log.status = 'inserted';
        }
      }
    }
  });

  // Helper function to safely replace text occurrences with OpenXML Drawing runs without nesting in <w:t>
  const replaceTextWithDrawingRun = (xml: string, targetText: string, drawingML: string): string => {
    if (!xml.includes(targetText)) return xml;
    const escaped = targetText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // Pattern 1: Exact <w:r> containing only or mostly this tag
    const runRegex = new RegExp(`(<w:r\\b[^>]*>(?:(?!<\\/w:r>)[\\s\\S])*?<w:t[^>]*>)[^<]*${escaped}[^<]*(<\\/w:t>(?:(?!<\\/w:r>)[\\s\\S])*?<\\/w:r>)`, 'gi');
    if (runRegex.test(xml)) {
      return xml.replace(runRegex, `<w:r>${drawingML}</w:r>`);
    }
    
    // Pattern 2: Replace text by closing text run, inserting drawing run, and reopening text run
    return xml.split(targetText).join(`</w:t></w:r><w:r>${drawingML}</w:r><w:r><w:t>`);
  };

  // 3. Scan and replace mustache / placeholder photo tags (e.g. {{PHOTO_Product_Packing}}, {{PHOTO_ Product Packing}}, {{PHOTO_IDU Motor}}, [Pending: ...])
  PHOTO_FIELD_DEFINITIONS.forEach((def, idx) => {
    const rId = photoRIdMap.get(def.photoKey);
    const log = logsMap?.get(def.photoKey);

    const allVariants = new Set<string>();
    const baseNames = [def.photoKey, def.id, def.label, ...def.aliases];

    baseNames.forEach(name => {
      allVariants.add(`{{${name}}}`);
      allVariants.add(`{{ ${name} }}`);
      allVariants.add(`{{${name.toLowerCase()}}}`);
      allVariants.add(`{{${name.replace(/\s+/g, '_')}}}`);
      allVariants.add(`{{${name.replace(/_/g, ' ')}}}`);
      allVariants.add(`{{photo_${name}}}`);
      allVariants.add(`{{photo_${name.toLowerCase()}}}`);
      allVariants.add(`{{photo_${name.replace(/\s+/g, '_')}}}`);
      allVariants.add(`{{PHOTO_${name}}}`);
      allVariants.add(`{{PHOTO_ ${name}}}`);
      allVariants.add(`{{PHOTO_${name.replace(/_/g, ' ')}}}`);
      allVariants.add(`{{PHOTO_ ${name.replace(/_/g, ' ')}}}`);
      allVariants.add(`[Pending: ${name}]`);
      allVariants.add(`[Pending: ${name.toLowerCase()}]`);
      allVariants.add(`[Pending: photo_${name}]`);
      allVariants.add(`[Pending: ${def.label}]`);
      allVariants.add(`[Pending: ${def.label.toLowerCase()}]`);
    });

    allVariants.forEach(tag => {
      if (modifiedXml.includes(tag)) {
        if (log) log.contentControlFound = true;
        if (rId) {
          const drawingXml = createDrawingML(rId, 700 + idx, def.photoKey, 2160000, 1440000);
          modifiedXml = replaceTextWithDrawingRun(modifiedXml, tag, drawingXml);
          if (log) {
            log.imageInserted = true;
            log.status = 'inserted';
          }
        }
      }
    });

    // Fuzzy Regex search for {{PHOTO_...}} with arbitrary spaces/underscores
    const cleanKeyPattern = def.label.replace(/[^a-zA-Z0-9]/g, '[\\s_]*');
    const fuzzyPhotoRegex = new RegExp(`(<w:r\\b[^>]*>(?:(?!<\\/w:r>)[\\s\\S])*?<w:t[^>]*>[^<]*)\\{\\{\\s*PHOTO_[\\s_]*${cleanKeyPattern}\\s*\\}\\}([^<]*<\\/w:t>(?:(?!<\\/w:r>)[\\s\\S])*?<\\/w:r>)`, 'gi');
    if (fuzzyPhotoRegex.test(modifiedXml)) {
      if (log) log.contentControlFound = true;
      if (rId) {
        const drawingXml = createDrawingML(rId, 750 + idx, def.photoKey, 2160000, 1440000);
        modifiedXml = modifiedXml.replace(fuzzyPhotoRegex, `<w:r>${drawingXml}</w:r>`);
        if (log) {
          log.imageInserted = true;
          log.status = 'inserted';
        }
      }
    }
  });

  // 4. Contextual Table Cell & Paragraph Replacement for "[Pending: field]" under Photo Labels
  PHOTO_FIELD_DEFINITIONS.forEach((def, idx) => {
    const rId = photoRIdMap.get(def.photoKey);
    const log = logsMap?.get(def.photoKey);

    const labelKeywords = [
      def.label,
      def.label.replace(/\s+/g, '_'),
      def.photoKey,
      def.id,
      ...def.aliases
    ];

    for (const keyword of labelKeywords) {
      const escapedKw = keyword.replace(/&/g, '&amp;').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

      if (rId) {
        // Pattern A: Table cell with Label header followed by [Pending: field] inside the same cell
        const singleCellRegex = new RegExp(`(<w:tc\\b[\\s\\S]*?${escapedKw}[\\s\\S]*?<w:p\\b[\\s\\S]*?)(?:<w:r\\b[^>]*><w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t><\\/w:r>|<w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t>)(<\\/w:p>[\\s\\S]*?<\\/w:tc>)`, 'gi');
        if (singleCellRegex.test(modifiedXml)) {
          if (log) log.contentControlFound = true;
          const drawingXml = createDrawingML(rId, 800 + idx, def.photoKey, 2160000, 1440000);
          modifiedXml = modifiedXml.replace(singleCellRegex, `$1<w:r>${drawingXml}</w:r>$2`);
          if (log) {
            log.imageInserted = true;
            log.status = 'inserted';
          }
        }

        // Pattern B: Row 1 has label badge, Row 2 has content cell with [Pending: field]
        const rowRegex = new RegExp(`(<w:tr\\b[\\s\\S]*?${escapedKw}[\\s\\S]*?<\\/w:tr>\\s*<w:tr\\b[\\s\\S]*?<w:tc\\b[\\s\\S]*?)(?:<w:r\\b[^>]*><w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t><\\/w:r>|<w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t>)([\\s\\S]*?<\\/w:tc>)`, 'gi');
        if (rowRegex.test(modifiedXml)) {
          if (log) log.contentControlFound = true;
          const drawingXml = createDrawingML(rId, 850 + idx, def.photoKey, 2160000, 1440000);
          modifiedXml = modifiedXml.replace(rowRegex, `$1<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${drawingXml}</w:r></w:p>$2`);
          if (log) {
            log.imageInserted = true;
            log.status = 'inserted';
          }
        }

        // Pattern C: Paragraphs where label header is followed by [Pending: field] paragraph
        const paraRegex = new RegExp(`(<w:p\\b[\\s\\S]*?${escapedKw}[\\s\\S]*?<\\/w:p>\\s*<w:p\\b[\\s\\S]*?)(?:<w:r\\b[^>]*><w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t><\\/w:r>|<w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t>)([\\s\\S]*?<\\/w:p>)`, 'gi');
        if (paraRegex.test(modifiedXml)) {
          if (log) log.contentControlFound = true;
          const drawingXml = createDrawingML(rId, 900 + idx, def.photoKey, 2160000, 1440000);
          modifiedXml = modifiedXml.replace(paraRegex, `$1<w:r>${drawingXml}</w:r>$2`);
          if (log) {
            log.imageInserted = true;
            log.status = 'inserted';
          }
        }
      } else {
        // Photo not uploaded: replace raw [Pending: ...] with a clean placeholder
        const notUploadedText = `<w:r><w:rPr><w:color w:val="94A3B8"/><w:i/></w:rPr><w:t>[ Photo Not Uploaded ]</w:t></w:r>`;
        const fallbackRegex = new RegExp(`(<w:tc\\b[\\s\\S]*?${escapedKw}[\\s\\S]*?<w:p\\b[\\s\\S]*?)(?:<w:r\\b[^>]*><w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t><\\/w:r>|<w:t>[^<]*\\[Pending[^\\]]*\\]<\\/w:t>)(<\\/w:p>[\\s\\S]*?<\\/w:tc>)`, 'gi');
        if (fallbackRegex.test(modifiedXml)) {
          modifiedXml = modifiedXml.replace(fallbackRegex, `$1${notUploadedText}$2`);
        }
      }
    }
  });

  // 5. Intelligent match for any remaining [Pending: <Name>] tags anywhere in the document
  modifiedXml = modifiedXml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>[^<]*\[Pending:?\s*([^\]]+)\][^<]*<\/w:t>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/gi, (match, pendingLabel) => {
    const cleanPending = String(pendingLabel || '').trim().replace(/[\s_]+/g, '').toLowerCase();
    const matchedDef = PHOTO_FIELD_DEFINITIONS.find(def => 
      def.photoKey.replace(/[\s_]+/g, '').toLowerCase() === cleanPending ||
      def.id.replace(/[\s_]+/g, '').toLowerCase() === cleanPending ||
      def.label.replace(/[\s_]+/g, '').toLowerCase() === cleanPending ||
      def.aliases.some(a => a.replace(/[\s_]+/g, '').toLowerCase() === cleanPending)
    );

    if (matchedDef) {
      const rId = photoRIdMap.get(matchedDef.photoKey);
      const log = logsMap?.get(matchedDef.photoKey);
      if (log) log.contentControlFound = true;
      if (rId) {
        const drawingXml = createDrawingML(rId, 950, matchedDef.photoKey, 2160000, 1440000);
        if (log) {
          log.imageInserted = true;
          log.status = 'inserted';
        }
        return `<w:r>${drawingXml}</w:r>`;
      }
    }
    return `<w:r><w:rPr><w:color w:val="94A3B8"/><w:i/></w:rPr><w:t>[ Photo Not Uploaded ]</w:t></w:r>`;
  });

  // 6. Clean any remaining unmapped [Pending: ...] tags in the document so it never shows raw to the user
  modifiedXml = modifiedXml.replace(/<w:t>[^<]*\[Pending:[^\]]*\]<\/w:t>/gi, '<w:t>[ Photo Not Uploaded ]</w:t>');

  return modifiedXml;
}

/**
 * Builds the official 2-column "Sample Photographs (with Part Sticker/Nameplate)" OpenXML Table
 */
export function createSamplePhotographsTableXml(
  photoRIdMap: Map<string, string>, 
  photos: Record<string, string> = {},
  logsMap?: Map<string, PhotoInsertionLog>
): string {
  let rowsXml = '';
  for (let i = 0; i < PHOTO_FIELD_DEFINITIONS.length; i += 2) {
    const left = PHOTO_FIELD_DEFINITIONS[i];
    const right = PHOTO_FIELD_DEFINITIONS[i + 1];

    const leftRId = photoRIdMap.get(left.photoKey);
    const leftDrawing = leftRId 
      ? `<w:r>${createDrawingML(leftRId, 200 + i, left.label, 2160000, 1440000)}</w:r>` 
      : `<w:r><w:rPr><w:color w:val="94A3B8"/><w:i/><w:sz w:val="18"/></w:rPr><w:t>[ Photo Not Uploaded ]</w:t></w:r>`;

    if (leftRId && logsMap) {
      const lLog = logsMap.get(left.photoKey);
      if (lLog) {
        lLog.contentControlFound = true;
        lLog.imageInserted = true;
        lLog.status = 'inserted';
      }
    }

    const rightRId = right ? photoRIdMap.get(right.photoKey) : null;
    const rightDrawing = right
      ? (rightRId 
          ? `<w:r>${createDrawingML(rightRId, 201 + i, right.label, 2160000, 1440000)}</w:r>` 
          : `<w:r><w:rPr><w:color w:val="94A3B8"/><w:i/><w:sz w:val="18"/></w:rPr><w:t>[ Photo Not Uploaded ]</w:t></w:r>`)
      : `<w:r><w:t></w:t></w:r>`;

    if (right && rightRId && logsMap) {
      const rLog = logsMap.get(right.photoKey);
      if (rLog) {
        rLog.contentControlFound = true;
        rLog.imageInserted = true;
        rLog.status = 'inserted';
      }
    }

    rowsXml += `
      <w:tr>
        <!-- Left Photo Title Badge -->
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>${left.label}</w:t></w:r></w:p>
        </w:tc>
        <!-- Right Photo Title Badge -->
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>${right ? right.label : ''}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <!-- Left Photo Box (6cm x 4cm) -->
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>${leftDrawing}</w:p>
        </w:tc>
        <!-- Right Photo Box (6cm x 4cm) -->
        <w:tc>
          <w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>${rightDrawing}</w:p>
        </w:tc>
      </w:tr>
    `;
  }

  return `
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="0F4C81"/></w:rPr><w:t>Sample Photographs (with Part Sticker/Nameplate)</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9600" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        </w:tblBorders>
      </w:tblPr>
      ${rowsXml}
    </w:tbl>
  `;
}

/**
 * Prints formatted debug logs to browser console for every photo field
 */
export function printPhotoInsertionDebugLogs(logs: PhotoInsertionLog[]) {
  console.group('%c📸 WORD REPORT PHOTO INSERTION DEBUG LOGS', 'color: #0284c7; font-weight: bold; font-size: 14px; padding: 4px;');
  logs.forEach(log => {
    const isSuccess = log.imageInserted;
    const headerStyle = isSuccess 
      ? 'color: #10b981; font-weight: bold; font-size: 12px;'
      : (log.hasImageUrl ? 'color: #f59e0b; font-weight: bold; font-size: 12px;' : 'color: #94a3b8; font-weight: bold; font-size: 12px;');

    console.log(
      `%c${log.photoKey}%c (${log.label})\n` +
      `  → Found in database: ${log.foundInDatabase ? 'YES' : 'NO'}\n` +
      `  → Image URL: ${log.hasImageUrl ? 'YES' : 'NO'}\n` +
      `  → Image downloaded: ${log.imageDownloaded ? 'YES' : 'NO'}\n` +
      `  → Picture Content Control found: ${log.contentControlFound ? 'YES' : 'NO'}\n` +
      `  → Image inserted: ${log.imageInserted ? 'YES' : 'NO'}` +
      (log.details ? `\n  → Details: ${log.details}` : ''),
      headerStyle,
      'color: #64748b; font-style: italic;'
    );
  });
  console.groupEnd();
}

/**
 * Cleans Word-specific XML artefacts and collapses tags split across XML runs
 */
export function cleanSplitTagsInXml(xml: string): string {
  if (!xml) return '';
  let cleaned = xml
    .replace(/<w:proofErr[^>]*\/>/g, '')
    .replace(/<w:noProof[^>]*\/>/g, '')
    .replace(/<w:lastRenderedPageBreak\/>/g, '');

  // Collapse split mustache tags across <w:r> and <w:t> boundaries
  // Matches e.g. {{</w:t></w:r><w:r><w:t>Compressor_Spec}} or {{Power_</w:t>...<w:t>mode}}
  cleaned = cleaned.replace(/\{(?:\s*<[^>]+>\s*)*\{([\s\S]*?)\}(?:\s*<[^>]+>\s*)*\}/g, (match) => {
    const rawInner = match.replace(/<[^>]+>/g, '').replace(/[\{\}]/g, '').trim();
    if (!rawInner) return match;
    return `{{${rawInner}}}`;
  });

  // Collapse split [Pending: ...] tags across <w:r> and <w:t> boundaries
  cleaned = cleaned.replace(/\[(?:\s*<[^>]+>\s*)*Pending:?([\s\S]*?)\]/gi, (match) => {
    const rawInner = match.replace(/<[^>]+>/g, '').replace(/[\[\]]/g, '').trim();
    if (!rawInner) return match;
    return `[${rawInner}]`;
  });

  return cleaned;
}

/**
 * Robust XML string replacer for all data parameters
 */
export function replaceAllRemainingPlaceholders(xml: string, dataMap: Record<string, any>): string {
  if (!xml) return '';
  let result = xml;

  const entries = Object.entries(dataMap);

  // 1. Gas injection volume explicit regex
  const gasVol = dataMap.Gas_injection_Volume || dataMap.Gas_Injection_Volume || dataMap.gasInjectionVolume || dataMap.gas_injection_volume || dataMap['Gas Injection Volume'] || dataMap.Gas_Injection || dataMap.gas_injection || '';
  if (gasVol) {
    const escaped = escapeXml(String(gasVol));
    result = result.replace(/\{\{\s*Gas[\s_]*injection[\s_]*Volume\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*Gas[\s_]*Injection\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*Gas[\s_]*Injection[\s_]*Vol\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*Gas[\s_]*Vol\s*\}\}/gi, escaped);
  }

  // 2. Compressor spec explicit regex (including spaced underscore {{Compressor _Spec}})
  const compSpec = dataMap['Compressor _Spec'] || dataMap.Compressor_Spec || dataMap.compressorSpec || dataMap.compressor_spec || dataMap['Compressor Spec'] || dataMap.Compressor || dataMap.compressor || '';
  if (compSpec) {
    const escaped = escapeXml(String(compSpec));
    result = result.replace(/\{\{\s*Compressor\s*[_\s]*Spec\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*Compressor[\s_]*Specification\s*\}\}/gi, escaped);
  }

  // 3. Power mode explicit regex
  const powerMode = dataMap.Power_mode || dataMap.Power_Mode || dataMap.powerMode || dataMap.power_mode || dataMap['Power Mode'] || dataMap.PowerMode || '';
  if (powerMode) {
    const escaped = escapeXml(String(powerMode));
    result = result.replace(/\{\{\s*Power[\s_]*mode\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*Power[\s_]*Mode\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*PowerMode\s*\}\}/gi, escaped);
  }

  // 4. Sample Code IDU & ODU
  const iduSerial = dataMap.Sample_Code_IDU || dataMap.IDU_Serial_No || dataMap.iduSerialNumber || dataMap.IDU_Serial || '';
  if (iduSerial) {
    const escaped = escapeXml(String(iduSerial));
    result = result.replace(/\{\{\s*Sample[\s_]*Code[\s_]*IDU\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*IDU[\s_]*Serial[\s_]*No\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*IDU[\s_]*Serial\s*\}\}/gi, escaped);
  }
  const oduSerial = dataMap.Sample_CodeI_ODU || dataMap.Sample_Code_ODU || dataMap.ODU_Serial_No || dataMap.oduSerialNumber || dataMap.ODU_Serial || '';
  if (oduSerial) {
    const escaped = escapeXml(String(oduSerial));
    result = result.replace(/\{\{\s*Sample[\s_]*CodeI?[\s_]*ODU\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*ODU[\s_]*Serial[\s_]*No\s*\}\}/gi, escaped);
    result = result.replace(/\{\{\s*ODU[\s_]*Serial\s*\}\}/gi, escaped);
  }

  // 5. Replace all other explicit entries in dataMap
  for (const [key, val] of entries) {
    if (val === undefined || val === null) continue;
    const valStr = escapeXml(String(val));
    const cleanKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\{\\{\\s*${cleanKey}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, valStr);
  }

  // 6. Generic case-insensitive and space/underscore agnostic scanner for any remaining {{tag}}
  result = result.replace(/\{\{([^{}]+)\}\}/g, (match, rawTag) => {
    const trimmed = rawTag.trim();
    const clean = trimmed.replace(/[\s_]+/g, '').toLowerCase();

    // Do NOT strip photo tags if they still need to be processed
    if (clean.startsWith('photo') || PHOTO_FIELD_DEFINITIONS.some(def => 
      def.photoKey.replace(/[\s_]+/g, '').toLowerCase() === clean ||
      def.id.replace(/[\s_]+/g, '').toLowerCase() === clean ||
      def.aliases.some(a => a.replace(/[\s_]+/g, '').toLowerCase() === clean)
    )) {
      return match;
    }

    for (const [k, v] of entries) {
      if (k.trim().replace(/[\s_]+/g, '').toLowerCase() === clean && v !== undefined && v !== null && v !== '') {
        return escapeXml(String(v));
      }
    }
    return '';
  });

  return result;
}

/**
 * Generates populated DOCX Blob using docxtemplater + PizZip + Native Picture Content Control Insertion
 */
export function generateDocxBlob(
  base64Template: string, 
  dataValues: ReportDataValues,
  photos: Record<string, string> = {},
  onLogResult?: (result: DocxGenerationResult) => void
): Blob {
  const logsMap = new Map<string, PhotoInsertionLog>();

  try {
    const arrayBuffer = base64ToArrayBuffer(base64Template);
    const zip = new PizZip(arrayBuffer);

    // 1. Inject photos into zip & get relationship map + populate logsMap
    const photoRIdMap = injectPhotosIntoZip(zip, photos, logsMap);

    // Normalize data keys (provide exact, underscored, spaced, lowercase, and capitalized variants)
    const normalizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(dataValues)) {
      const valStr = value !== undefined && value !== null ? String(value) : '';
      normalizedData[key] = valStr;
      
      const underscoredKey = key.replace(/\s+/g, '_');
      normalizedData[underscoredKey] = valStr;

      const spacedKey = key.replace(/_/g, ' ');
      normalizedData[spacedKey] = valStr;

      normalizedData[key.toLowerCase()] = valStr;
      normalizedData[underscoredKey.toLowerCase()] = valStr;
      normalizedData[spacedKey.toLowerCase()] = valStr;
    }

    // Explicit gas injection volume aliases
    const gasVol = dataValues.Gas_injection_Volume || dataValues.Gas_Injection_Volume || dataValues.gasInjectionVolume || dataValues.gas_injection_volume || dataValues.Gas_Injection || dataValues.gas_injection || '';
    if (gasVol) {
      normalizedData['Gas_injection_Volume'] = gasVol;
      normalizedData['Gas_Injection_Volume'] = gasVol;
      normalizedData['gas_injection_volume'] = gasVol;
      normalizedData['gasInjectionVolume'] = gasVol;
      normalizedData['Gas Injection Volume'] = gasVol;
      normalizedData['Gas_Injection'] = gasVol;
      normalizedData['GasInjectionVolume'] = gasVol;
      normalizedData['Gas_Injection_Vol'] = gasVol;
    }

    // Explicit compressor spec aliases (including spaced underscore e.g. {{Compressor _Spec}})
    const compSpec = dataValues['Compressor _Spec'] || dataValues.Compressor_Spec || dataValues.compressorSpec || dataValues.compressor_spec || dataValues['Compressor Spec'] || dataValues.Compressor || '';
    if (compSpec) {
      normalizedData['Compressor _Spec'] = compSpec;
      normalizedData['Compressor_Spec'] = compSpec;
      normalizedData['Compressor_spec'] = compSpec;
      normalizedData['compressor_spec'] = compSpec;
      normalizedData['compressor _spec'] = compSpec;
      normalizedData['Compressor Spec'] = compSpec;
      normalizedData['compressorSpec'] = compSpec;
      normalizedData['Compressor'] = compSpec;
      normalizedData['Compressor_Specification'] = compSpec;
    }

    // Explicit power mode aliases
    const pMode = dataValues.Power_mode || dataValues.Power_Mode || dataValues.powerMode || dataValues.power_mode || dataValues['Power Mode'] || '';
    if (pMode) {
      normalizedData['Power_mode'] = pMode;
      normalizedData['Power_Mode'] = pMode;
      normalizedData['power_mode'] = pMode;
      normalizedData['powerMode'] = pMode;
      normalizedData['Power Mode'] = pMode;
      normalizedData['PowerMode'] = pMode;
    }

    // Explicit Sample Code placeholder mappings for IDU & ODU serial numbers
    const iduSerial = dataValues.Sample_Code_IDU || dataValues.IDU_Serial_No || dataValues.iduSerialNumber || dataValues.IDU_Serial || '';
    const oduSerial = dataValues.Sample_CodeI_ODU || dataValues.Sample_Code_ODU || dataValues.ODU_Serial_No || dataValues.oduSerialNumber || dataValues.ODU_Serial || '';
    
    if (iduSerial) {
      normalizedData.Sample_Code_IDU = iduSerial;
      normalizedData.sample_code_idu = iduSerial;
      normalizedData.Sample_CodeIDU = iduSerial;
      normalizedData["Sample Code IDU"] = iduSerial;
    }
    if (oduSerial) {
      normalizedData.Sample_CodeI_ODU = oduSerial;
      normalizedData.Sample_Code_ODU = oduSerial;
      normalizedData.sample_codei_odu = oduSerial;
      normalizedData.sample_code_odu = oduSerial;
      normalizedData.Sample_CodeODU = oduSerial;
      normalizedData["Sample Code ODU"] = oduSerial;
    }

    // Pre-process all XML parts to clean tags and inject photos
    const xmlFiles = Object.keys(zip.files).filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name));
    for (const fileName of xmlFiles) {
      let fileXml = zip.file(fileName)?.asText() || '';
      if (fileXml) {
        fileXml = cleanSplitTagsInXml(fileXml);
        fileXml = insertPhotosIntoContentControls(fileXml, photoRIdMap, logsMap);
        zip.file(fileName, fileXml);
      }
    }

    // 2. Initialize docxtemplater with flexible, case-insensitive and space/underscore-tolerant tag resolver
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      parser: (tag: string) => ({
        get: (scope: any) => {
          if (!scope) return '';
          const trimmed = tag.trim();
          const cleanTag = trimmed.replace(/[\s_]+/g, '').toLowerCase();

          // Check if this tag represents a photo field
          const isPhotoTag = cleanTag.startsWith('photo') || PHOTO_FIELD_DEFINITIONS.some(def => 
            def.photoKey.replace(/[\s_]+/g, '').toLowerCase() === cleanTag ||
            def.id.replace(/[\s_]+/g, '').toLowerCase() === cleanTag ||
            def.aliases.some(a => a.replace(/[\s_]+/g, '').toLowerCase() === cleanTag)
          );

          if (isPhotoTag) {
            return `{{${tag}}}`;
          }
          // 1. Direct match
          if (scope[tag] !== undefined && scope[tag] !== null && scope[tag] !== '') {
            return String(scope[tag]);
          }
          // 2. Trimmed match
          if (scope[trimmed] !== undefined && scope[trimmed] !== null && scope[trimmed] !== '') {
            return String(scope[trimmed]);
          }
          // 3. Normalized alphanumeric lookup (removes spaces, underscores, and ignores casing)
          for (const [k, v] of Object.entries(scope)) {
            const cleanK = k.trim().replace(/[\s_]+/g, '').toLowerCase();
            if (cleanK === cleanTag && v !== undefined && v !== null && v !== '') {
              return String(v);
            }
          }
          // 4. Special fallback aliases for common HVAC / Report parameters
          if (cleanTag.includes('gasinjection') || cleanTag === 'gasinjectionvolume') {
            return String(scope.Gas_injection_Volume || scope.Gas_Injection_Volume || scope.gasInjectionVolume || scope.Gas_Injection || scope.gas_injection_volume || '');
          }
          if (cleanTag.includes('compressorspec') || cleanTag === 'compressorspec' || cleanTag === 'compressor' || cleanTag === 'compressorspecification') {
            return String(scope['Compressor _Spec'] || scope.Compressor_Spec || scope.compressorSpec || scope.compressor_spec || '');
          }
          if (cleanTag.includes('powermode') || cleanTag === 'power_mode' || cleanTag === 'powersupply') {
            return String(scope.Power_mode || scope.Power_Mode || scope.powerMode || scope.power_mode || '');
          }
          return '';
        }
      }),
      nullGetter: (tag: any) => {
        const tagName = String(tag?.name || tag || '');
        const cleanName = tagName.replace(/[\s_]+/g, '').toLowerCase();
        const isPhotoTag = cleanName.startsWith('photo') || PHOTO_FIELD_DEFINITIONS.some(def => 
          def.photoKey.replace(/[\s_]+/g, '').toLowerCase() === cleanName ||
          def.id.replace(/[\s_]+/g, '').toLowerCase() === cleanName ||
          def.aliases.some(a => a.replace(/[\s_]+/g, '').toLowerCase() === cleanName)
        );
        if (isPhotoTag) {
          return `{{${tagName}}}`;
        }
        return '';
      }
    });

    doc.render(normalizedData);

    // 3. Post-process all XML parts in the zip (document.xml + headers/footers)
    for (const fileName of xmlFiles) {
      let fileXml = doc.getZip().file(fileName)?.asText() || '';
      if (fileXml) {
        fileXml = insertPhotosIntoContentControls(fileXml, photoRIdMap, logsMap);
        fileXml = replaceAllRemainingPlaceholders(fileXml, normalizedData);

        if (fileName === 'word/document.xml') {
          // Check if any uploaded photo with an image has NOT been inserted in the body
          const uninsertedUploadedPhotos = Array.from(logsMap.values()).filter(l => l.hasImageUrl && !l.imageInserted);
          const hasGallery = fileXml.includes('Sample Photographs') || fileXml.includes('Sample Photographs (with Part Sticker/Nameplate)');
          
          if ((!hasGallery || uninsertedUploadedPhotos.length > 0) && photoRIdMap.size > 0) {
            const photoTableXml = createSamplePhotographsTableXml(photoRIdMap, photos, logsMap);
            fileXml = fileXml.replace('</w:body>', `${photoTableXml}</w:body>`);
          }
        }

        doc.getZip().file(fileName, fileXml);
      }
    }

    const out = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'STORE'
    });

    const logs = Array.from(logsMap.values());
    printPhotoInsertionDebugLogs(logs);

    if (onLogResult) {
      onLogResult({
        blob: out,
        logs,
        insertedCount: logs.filter(l => l.imageInserted).length,
        totalPhotos: PHOTO_FIELD_DEFINITIONS.length
      });
    }

    return out;
  } catch (err: any) {
    console.error('Error rendering docx with docxtemplater:', err);
    return generateFallbackDocxBlob(base64Template, dataValues, photos, logsMap, onLogResult);
  }
}

/**
 * Fallback DOCX generator performing raw XML string replacement across all XML files
 */
function generateFallbackDocxBlob(
  base64Template: string, 
  dataValues: ReportDataValues,
  photos: Record<string, string> = {},
  logsMap: Map<string, PhotoInsertionLog> = new Map(),
  onLogResult?: (result: DocxGenerationResult) => void
): Blob {
  const arrayBuffer = base64ToArrayBuffer(base64Template);
  const zip = new PizZip(arrayBuffer);

  const photoRIdMap = injectPhotosIntoZip(zip, photos, logsMap);

  // Normalize data keys
  const normalizedData: Record<string, any> = {};
  for (const [key, value] of Object.entries(dataValues)) {
    const valStr = value !== undefined && value !== null ? String(value) : '';
    normalizedData[key] = valStr;
    normalizedData[key.replace(/\s+/g, '_')] = valStr;
    normalizedData[key.replace(/_/g, ' ')] = valStr;
    normalizedData[key.toLowerCase()] = valStr;
  }

  // Explicit aliases
  const gasVol = dataValues.Gas_injection_Volume || dataValues.Gas_Injection_Volume || dataValues.gasInjectionVolume || dataValues.gas_injection_volume || dataValues['Gas Injection Volume'] || '';
  if (gasVol) {
    normalizedData.Gas_injection_Volume = gasVol;
    normalizedData.Gas_Injection_Volume = gasVol;
    normalizedData.gasInjectionVolume = gasVol;
    normalizedData['Gas Injection Volume'] = gasVol;
  }
  const compSpec = dataValues['Compressor _Spec'] || dataValues.Compressor_Spec || dataValues.compressorSpec || dataValues.compressor_spec || dataValues['Compressor Spec'] || '';
  if (compSpec) {
    normalizedData['Compressor _Spec'] = compSpec;
    normalizedData.Compressor_Spec = compSpec;
    normalizedData.compressorSpec = compSpec;
    normalizedData['Compressor Spec'] = compSpec;
  }
  const powerMode = dataValues.Power_mode || dataValues.Power_Mode || dataValues.powerMode || dataValues.power_mode || dataValues['Power Mode'] || '';
  if (powerMode) {
    normalizedData.Power_mode = powerMode;
    normalizedData.Power_Mode = powerMode;
    normalizedData.powerMode = powerMode;
    normalizedData['Power Mode'] = powerMode;
  }

  const xmlFiles = Object.keys(zip.files).filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name));
  for (const fileName of xmlFiles) {
    let fileXml = zip.file(fileName)?.asText() || '';
    if (fileXml) {
      fileXml = cleanSplitTagsInXml(fileXml);
      fileXml = insertPhotosIntoContentControls(fileXml, photoRIdMap, logsMap);
      fileXml = replaceAllRemainingPlaceholders(fileXml, normalizedData);

      if (fileName === 'word/document.xml' && photoRIdMap.size > 0) {
        const photoTableXml = createSamplePhotographsTableXml(photoRIdMap, photos, logsMap);
        fileXml = fileXml.replace('</w:body>', `${photoTableXml}</w:body>`);
      }

      zip.file(fileName, fileXml);
    }
  }

  const out = zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'STORE'
  });

  const logs = Array.from(logsMap.values());
  printPhotoInsertionDebugLogs(logs);

  if (onLogResult) {
    onLogResult({
      blob: out,
      logs,
      insertedCount: logs.filter(l => l.imageInserted).length,
      totalPhotos: PHOTO_FIELD_DEFINITIONS.length
    });
  }

  return out;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Downloads a Blob as a file in the browser
 */
export function downloadFile(blob: Blob, fileName: string) {
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.position = 'fixed';
    a.style.top = '-9999px';
    a.style.left = '-9999px';
    a.style.opacity = '0';
    a.href = url;
    a.download = fileName;
    a.setAttribute('download', fileName);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch {}
    }, 60000);
  } catch (err) {
    console.error('Download error:', err);
  }
}

/**
 * Generates and downloads PDF from an HTML container element using html2canvas + jsPDF
 */
export async function downloadElementAsPdf(element: HTMLElement, fileName: string) {
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(fileName);
  } catch (err) {
    console.error("PDF export error:", err);
    window.print();
  }
}

/**
 * Creates a valid default Master Report Template .docx base64 string with full specifications and Photo Gallery
 */
export function createDefaultMasterDocxBase64(reportType: string = 'proto'): string {
  const isExperience = reportType === 'reliability' || reportType === 'ce-report';
  const reportTypeName = isExperience ? 'Customer Experience (CE) Report' : 'Customer Simulation (CS) Report';
  const tagTitle = isExperience ? 'C Experience Report' : 'C Simulation Report';

  const zip = new PizZip();

  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  // word/_rels/document.xml.rels
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  // word/document.xml with complete Master Report Template structure and placeholders
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0F4C81"/></w:rPr><w:t>Haier Appliances (India) Pvt Ltd</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1E293B"/></w:rPr><w:t>TEST REPORT</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:t>${reportTypeName} | Tag: ${tagTitle} | Official Laboratory Evaluation</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    
    <!-- 1. Technical Specifications Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9600" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        </w:tblBorders>
      </w:tblPr>
      
      <w:tr>
        <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="0F4C81"/><w:tcW w:w="3200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Parameter / Specification</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="0F4C81"/><w:tcW w:w="6400" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Value / Test Record (Auto-Mapped)</w:t></w:r></w:p></w:tc>
      </w:tr>

      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Model Name</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Model_Name}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Sample Type</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Sample_Type}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Report Number</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Report_No}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Sample Received Date</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Sample_Received}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Test Commenced Date</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Test_Commenced}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Test Completed Date</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Test_Completed}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Cooling Capacity</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Cooling_capacity}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Power Mode</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Power_mode}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Refrigerant</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Refrigerant}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Gas Injection Volume</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Gas_injection_Volume}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ISEER Rating</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{ISEER}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>IDU Motor Specification</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{IDU_Motor_Spec}} (Code: {{IDU_Motor_Part_Code}}, Supplier: {{IDU_Motor_Supplier}})</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>IDU PCB</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Code: {{IDU_PCB_Part_Code}} | Supplier: {{IDU_PCB_Supplier}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ODU Motor Specification</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{ODU_Motor_Spec}} (Code: {{ODU_Motor_Part_Code}}, Supplier: {{ODU_Motor_Supplier}})</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ODU PCB</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Code: {{ODU_PCB_Part_Code}} | Supplier: {{ODU_PCB_Supplier}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Compressor Specification</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Compressor_Spec}} (Code: {{Compressor_Part_Code}}, Supplier: {{Compressor_Supplier}})</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Expansion Valve (EEV)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{EEV_Spec}} (Code: {{EEV_Part_Code}}, Supplier: {{EEV_Supplier}})</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Testing Station</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Station}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Requested By</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Request_By}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Test Conclusion &amp; Observations</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{Test_Conclusion}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t>Verified &amp; Generated by LLT Lab System (ISO / IEC 17025 Compliance Format)</w:t></w:r>
    </w:p>

    <!-- 2. Sample Photographs (with Part Sticker/Nameplate) Placeholders -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="0F4C81"/></w:rPr><w:t>Sample Photographs (with Part Sticker/Nameplate)</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9600" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>Product Packing Box</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>Bare Packing Box (IDU&amp;ODU)</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_productPhoto}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_packingBoxPhoto}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>IDU Product Nameplate</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>ODU Product Nameplate</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_iduNameplatePhoto}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_oduNameplatePhoto}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>IDU PCB</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>IDU Motor</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_iduPcbPhoto}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_iduMotorPhoto}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>ODU PCB</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>ODU Motor</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_oduPcbPhoto}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_oduMotorPhoto}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>ODU Compressor</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>ODU EEV</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_oduCompressorPhoto}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_oduEevPhoto}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>Sticker / Extra</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>{{photo_stickerPhoto}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);

  const buffer = zip.generate({ type: 'arraybuffer' });
  return arrayBufferToBase64(buffer);
}

/**
 * Standard component clean naming dictionary for photos in the report package
 */
export const COMPONENT_PHOTO_FILENAMES: Record<string, string> = {
  PHOTO_Product_Packing: '01_Product_Packing',
  productPhoto: '01_Product_Packing',
  productPacking: '01_Product_Packing',
  photo_productPhoto: '01_Product_Packing',
  PHOTO_Packing_Box: '02_Packing_Box',
  packingBoxPhoto: '02_Packing_Box',
  packingBox: '02_Packing_Box',
  photo_packingBoxPhoto: '02_Packing_Box',
  PHOTO_IDU_Motor: '03_IDU_Motor',
  iduMotorPhoto: '03_IDU_Motor',
  iduMotor: '03_IDU_Motor',
  photo_iduMotorPhoto: '03_IDU_Motor',
  PHOTO_IDU_PCB: '04_IDU_PCB',
  iduPcbPhoto: '04_IDU_PCB',
  iduPcb: '04_IDU_PCB',
  photo_iduPcbPhoto: '04_IDU_PCB',
  PHOTO_IDU_Product_Name_Plate: '05_IDU_Product_Name_Plate',
  iduNameplatePhoto: '05_IDU_Product_Name_Plate',
  iduProductPlate: '05_IDU_Product_Name_Plate',
  photo_iduNameplatePhoto: '05_IDU_Product_Name_Plate',
  PHOTO_Remote: '06_Remote_Controller',
  remotePhoto: '06_Remote_Controller',
  remoteController: '06_Remote_Controller',
  photo_remotePhoto: '06_Remote_Controller',
  PHOTO_ODU_Name_Plate: '07_ODU_Name_Plate',
  oduNameplatePhoto: '07_ODU_Name_Plate',
  oduNamePlate: '07_ODU_Name_Plate',
  photo_oduNameplatePhoto: '07_ODU_Name_Plate',
  PHOTO_ODU_Motor: '08_ODU_Motor',
  oduMotorPhoto: '08_ODU_Motor',
  oduMotor: '08_ODU_Motor',
  photo_oduMotorPhoto: '08_ODU_Motor',
  PHOTO_ODU_PCB: '09_ODU_PCB',
  oduPcbPhoto: '09_ODU_PCB',
  oduPcb: '09_ODU_PCB',
  photo_oduPcbPhoto: '09_ODU_PCB',
  PHOTO_Electronic_Expansion_Valve: '10_Electronic_Expansion_Valve_EEV',
  oduEevPhoto: '10_Electronic_Expansion_Valve_EEV',
  eev: '10_Electronic_Expansion_Valve_EEV',
  photo_oduEevPhoto: '10_Electronic_Expansion_Valve_EEV',
  PHOTO_ODU_Compressor: '11_Compressor',
  oduCompressorPhoto: '11_Compressor',
  compressor: '11_Compressor',
  oduCompressor: '11_Compressor',
  photo_oduCompressorPhoto: '11_Compressor'
};

export interface ReportBundleZipResult {
  blob: Blob;
  fileName: string;
  folderName: string;
  photoCount: number;
}

/**
 * Builds a human-readable text file summary of the generated report package
 */
function buildReportSummaryText(
  dataValues: ReportDataValues,
  folderName: string,
  docxFileName: string,
  photoCount: number,
  photoFiles: string[]
): string {
  const model = dataValues.Model_Name || dataValues.modelName || 'N/A';
  const reportNo = dataValues['Report No'] || dataValues.reportNo || 'Draft';
  const sampleType = dataValues.Sample_Type || dataValues.sampleType || 'Proto Unit';
  const iduSerial = dataValues.IDU_Serial_Number || dataValues.iduSerialNumber || dataValues.IDU_Serial_No || dataValues.Sample_Code_IDU || 'N/A';
  const oduSerial = dataValues.ODU_Serial_Number || dataValues.oduSerialNumber || dataValues.ODU_Serial_No || dataValues.Sample_CodeI_ODU || 'N/A';
  const cooling = dataValues.Cooling_capacity || dataValues.coolingCapacity || 'N/A';
  const refrigerant = dataValues.Refrigerant || dataValues.refrigerant || 'N/A';
  const iseer = dataValues.ISEER || dataValues.iseer || 'N/A';
  const compSpec = dataValues.Compressor_Spec || dataValues['Compressor _Spec'] || dataValues.compressorSpec || 'N/A';
  const compSupplier = dataValues.Compressor_Supplier || dataValues.compressorSupplier || 'N/A';
  const iduMotorSpec = dataValues.IDU_Motor_Spec || dataValues.iduMotorSpec || 'N/A';
  const oduMotorSpec = dataValues.ODU_Motor_Spec || dataValues.oduMotorSpec || 'N/A';
  const testCommenced = dataValues.Test_Commenced || dataValues.testCommenced || 'N/A';
  const testCompleted = dataValues.Test_Completed || dataValues.testCompleted || 'N/A';
  const station = dataValues.Station || dataValues.station || 'Station 01';
  const requestBy = dataValues.Request_By || dataValues.requestBy || 'Engineering Team';

  const photoListFormatted = photoFiles.length > 0 
    ? photoFiles.map((p, idx) => `   ${idx + 1}. ${p}`).join('\n')
    : '   (No photos uploaded for this sample)';

  return `================================================================================
                    HVAC LAB TEST REPORT & PHOTO ARCHIVE PACKAGE
================================================================================
Report Number       : ${reportNo}
Model Name          : ${model}
Sample Type         : ${sampleType}
Testing Station     : ${station}
Requested By        : ${requestBy}
Generation Date     : ${new Date().toLocaleString()}

--------------------------------------------------------------------------------
1. UNIT SPECIFICATIONS SUMMARY
--------------------------------------------------------------------------------
• IDU Serial Number : ${iduSerial}
• ODU Serial Number : ${oduSerial}
• Cooling Capacity  : ${cooling}
• Refrigerant Type  : ${refrigerant}
• ISEER Rating      : ${iseer}
• Compressor Spec   : ${compSpec} (Supplier: ${compSupplier})
• IDU Motor Spec    : ${iduMotorSpec}
• ODU Motor Spec    : ${oduMotorSpec}
• Test Period       : ${testCommenced} to ${testCompleted}

--------------------------------------------------------------------------------
2. FOLDER PACKAGE CONTENTS (${folderName}/)
--------------------------------------------------------------------------------
📄 1. ${docxFileName}
   - Master DOCX formatted test report with embedded 6cm x 4cm photo gallery.

📄 2. Report_Summary.txt
   - Technical parameter specification index (this document).

📁 3. Photos/ (${photoCount} Component Photos Included)
${photoListFormatted}

================================================================================
HVAC Lab Evaluation System — ISO / IEC 17025 Test Protocol
================================================================================`;
}

/**
 * Generates a full .ZIP Package containing:
 *  - The filled Master Test Report DOCX
 *  - A dedicated "Photos/" folder with all component images clearly named (e.g. Compressor.png, IDU_Motor.png)
 *  - A "Report_Summary.txt" overview file
 */
export async function generateReportBundleZip(
  base64Template: string,
  dataValues: ReportDataValues,
  photos: Record<string, string> = {},
  reportTitle: string = 'Test_Report'
): Promise<ReportBundleZipResult> {
  // 1. Generate the filled DOCX blob
  const docxBlob = generateDocxBlob(base64Template, dataValues, photos);
  const docxBuffer = await docxBlob.arrayBuffer();

  const safeModel = (dataValues.Model_Name || dataValues.modelName || 'Unit').toString().trim().replace(/[\s/\\?%*:|"<>]+/g, '_');
  const safeReportNo = (dataValues['Report No'] || dataValues.reportNo || 'Draft').toString().trim().replace(/[\s/\\?%*:|"<>]+/g, '_');
  const safeTitle = (reportTitle || 'Test_Report').trim().replace(/[\s/\\?%*:|"<>]+/g, '_');

  const folderName = `${safeTitle}_${safeModel}_${safeReportNo}`;
  const docxFileName = `${safeTitle}_${safeModel}_${safeReportNo}.docx`;

  const zip = new PizZip();

  // 2. Put DOCX into the main folder inside the zip
  zip.file(`${folderName}/${docxFileName}`, docxBuffer);

  // 3. Put all photos into the Photos/ subfolder with explicit, component names
  const photoFileList: string[] = [];
  const processedKeys = new Set<string>();

  // A. First process standard 11 fields
  PHOTO_FIELD_DEFINITIONS.forEach((def) => {
    const url = getPhotoUrlForContentControl(photos, def.photoKey);
    if (url && url !== 'NA') {
      const bin = dataURLToBinary(url);
      if (bin) {
        const cleanBaseName = COMPONENT_PHOTO_FILENAMES[def.photoKey] || def.photoKey.replace(/^PHOTO_/i, '');
        const filename = `${cleanBaseName}.${bin.extension}`;
        zip.file(`${folderName}/Photos/${filename}`, bin.bytes, { binary: true });
        photoFileList.push(filename);
        processedKeys.add(def.photoKey);
        def.aliases.forEach(a => processedKeys.add(a));
        processedKeys.add(def.id);
      }
    }
  });

  // B. Process any additional or custom photos
  Object.entries(photos).forEach(([key, val]) => {
    if (!val || val === 'NA' || typeof val !== 'string') return;
    if (processedKeys.has(key)) return;

    const bin = dataURLToBinary(val);
    if (bin) {
      const cleanKey = COMPONENT_PHOTO_FILENAMES[key] || key.replace(/^PHOTO_/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanKey}.${bin.extension}`;
      zip.file(`${folderName}/Photos/${filename}`, bin.bytes, { binary: true });
      photoFileList.push(filename);
      processedKeys.add(key);
    }
  });

  // 4. Create and put Report_Summary.txt
  const summaryText = buildReportSummaryText(dataValues, folderName, docxFileName, photoFileList.length, photoFileList);
  zip.file(`${folderName}/Report_Summary.txt`, summaryText);

  // 5. Generate ZIP Blob (Fast STORE mode for immediate download)
  const zipBlob = zip.generate({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'STORE'
  });

  return {
    blob: zipBlob,
    fileName: `${folderName}.zip`,
    folderName,
    photoCount: photoFileList.length
  };
}
