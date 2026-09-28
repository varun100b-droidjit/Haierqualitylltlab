import Tesseract from 'tesseract.js';

/**
 * Compresses and resizes high-resolution camera photos down to an optimal size
 * for fast upload and accurate OCR reading without exceeding payload size limits.
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 1800,
  maxHeight = 1800,
  quality = 0.90
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        return reject(new Error('Empty file content'));
      }

      const img = new Image();
      img.onerror = () => {
        const cleanBase64 = src.replace(/^data:[^;]+;base64,/, '');
        resolve({ dataUrl: src, base64: cleanBase64, mimeType: file.type || 'image/jpeg' });
      };
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const cleanBase64 = src.replace(/^data:[^;]+;base64,/, '');
            return resolve({ dataUrl: src, base64: cleanBase64, mimeType: 'image/jpeg' });
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const compressedBase64 = compressedDataUrl.replace(/^data:[^;]+;base64,/, '');

          resolve({
            dataUrl: compressedDataUrl,
            base64: compressedBase64,
            mimeType: 'image/jpeg'
          });
        } catch (err) {
          const cleanBase64 = src.replace(/^data:[^;]+;base64,/, '');
          resolve({ dataUrl: src, base64: cleanBase64, mimeType: 'image/jpeg' });
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Pre-processes an image for OCR by converting to high-contrast grayscale.
 * Extremely helpful for photos of computer monitors/screens with moiré or reflections.
 */
export async function preprocessImageForOcr(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        // High-contrast grayscale and dynamic range stretch
        for (let i = 0; i < d.length; i += 4) {
          // Grayscale luminosity
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Contrast boost (strengthen text against screen moiré)
          const boosted = gray < 135 ? Math.max(0, gray * 0.7) : Math.min(255, gray * 1.25);
          d[i] = boosted;
          d[i + 1] = boosted;
          d[i + 2] = boosted;
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}

/**
 * Robust cleaner and normalizer for an individual model string candidate
 */
function normalizeModelName(raw: string): string {
  let m = raw.trim();

  // Normalize prefix: HSO, HS0, H50, H5O -> 'HSO'
  m = m.replace(/^H(?:S|5)[O0o][\s\-_]*/i, 'HSO');

  // Cut off at bracket / parenthesis
  m = m.replace(/[\(\[\{].*$/, '');

  // Normalize spaces around hyphens and colons (e.g., '3NB - I : AC' -> '3NB-I:AC')
  m = m.replace(/\s*-\s*/g, '-').replace(/\s*:\s*/g, ':');

  // Strip trailing punctuation / non-alphanumeric except hyphen/colon
  m = m.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '');

  // Normalize common OCR misreads in suffix:
  // e.g. -1:AC, -l:AC, -|:AC, -i:ac -> -I:AC
  m = m.replace(/-(?:1|l|\||i):AC$/i, '-I:AC');

  return m.toUpperCase();
}

/**
 * Extracts models starting with "HSO" and their production quantities from raw OCR text.
 * Tolerant to:
 * - Computer screen LCD moiré and glare
 * - 'O' misread as '0' (HS0) or '5' (H50)
 * - Leading checkboxes [ ], ||, ( )
 * - Quantities in parentheses '(900)', brackets '[460]', or adjacent tokens
 * - Strictly ignores 'HSI', 'HTO', '(All)'
 */
export function parseHsoModelsFromText(rawText: string): Array<{ modelName: string; qty: number }> {
  if (!rawText) return [];

  const lines = rawText.split(/\r?\n/);
  const results: Array<{ modelName: string; qty: number }> = [];
  const seenModels = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check if line contains an HSO candidate pattern:
    // HSO or HS0 or H50 followed by numbers (17, 18, 19, 52, etc.) and model suffix
    const hsoRegex = /(?:^|[\s\[\]\(\)\|\{\}_•\-~^,])(H(?:S|5)[O0o][\s\-_]*[0-9]{1,3}[A-Za-z0-9_\-:\/\.\s]{2,})/gi;
    let match: RegExpExecArray | null;

    while ((match = hsoRegex.exec(line)) !== null) {
      let rawCandidate = match[1].trim();

      // STRICT NEGATIVE FILTER: Ignore HSI (Indoor) and HTO or (All)
      if (/^H(?:S|5)I/i.test(rawCandidate)) continue;
      if (/^HTO/i.test(rawCandidate)) continue;
      if (/^\(?All\)?/i.test(rawCandidate)) continue;

      const modelName = normalizeModelName(rawCandidate);
      if (!modelName.startsWith('HSO') || modelName.length < 5) continue;

      // Extract quantity:
      let qty = 0;

      // 1. Try finding quantity inside parentheses/brackets in the line
      const parenMatch = line.match(/[\(\[\{/](\d{1,5})[\)\]\}]/);
      if (parenMatch) {
        qty = parseInt(parenMatch[1], 10);
      } else {
        // 2. Search for numbers after the model in the line
        const textAfter = line.slice(match.index + match[0].length);
        const numMatches = textAfter.match(/\b\d{1,5}\b/g) || line.match(/\b\d{1,5}\b/g);
        if (numMatches) {
          for (const n of numMatches) {
            const val = parseInt(n, 10);
            if (val > 0 && val <= 50000) {
              qty = val;
              break;
            }
          }
        }
      }

      if (qty <= 0) qty = 100;

      if (!seenModels.has(modelName)) {
        seenModels.add(modelName);
        results.push({ modelName, qty });
      }
    }
  }

  // Fallback global regex scan if line-by-line missed joined text
  if (results.length === 0) {
    const globalHsoRegex = /(?:H(?:S|5)[O0o][\s\-_]*[0-9]{1,3}[A-Za-z0-9_\-:\/\.]{2,})[^\d\n\r]*[\(\[\{]?(\d{1,5})[\)\]\}]?/gi;
    let gMatch: RegExpExecArray | null;
    while ((gMatch = globalHsoRegex.exec(rawText)) !== null) {
      const fullMatch = gMatch[0];
      const modelPart = fullMatch.replace(/[\(\[\{]?\d+[\)\]\}]?\s*$/, '');
      const modelName = normalizeModelName(modelPart);
      if (!modelName.startsWith('HSO') || modelName.length < 5) continue;
      const qty = parseInt(gMatch[1], 10) || 100;

      if (!seenModels.has(modelName)) {
        seenModels.add(modelName);
        results.push({ modelName, qty });
      }
    }
  }

  return results;
}

/**
 * Runs client-side OCR on the provided image using Tesseract.js directly in the browser.
 * Works completely offline or when deployed to static hosts like Vercel.
 */
export async function extractHsoModelsClientSide(
  imageDataUrl: string,
  onProgress?: (progressText: string) => void
): Promise<Array<{ modelName: string; qty: number }>> {
  try {
    if (onProgress) onProgress('Enhancing photo clarity for screen reading...');
    // Create high-contrast grayscale version for screen reading
    const preprocessedUrl = await preprocessImageForOcr(imageDataUrl);

    if (onProgress) onProgress('Initializing local OCR engine...');
    const res = await Tesseract.recognize(preprocessedUrl, 'eng', {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          onProgress(`Scanning models on device (${pct}%)...`);
        }
      }
    });

    const ocrText = res?.data?.text || '';
    let extracted = parseHsoModelsFromText(ocrText);

    // If contrast version had zero results, try original image as fallback
    if (extracted.length === 0 && preprocessedUrl !== imageDataUrl) {
      const resRaw = await Tesseract.recognize(imageDataUrl, 'eng');
      const rawText = resRaw?.data?.text || '';
      extracted = parseHsoModelsFromText(rawText);
    }

    return extracted;
  } catch (err) {
    console.error('Client-side Tesseract OCR failed:', err);
    return [];
  }
}
