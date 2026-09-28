import Tesseract from 'tesseract.js';

/**
 * Compresses and resizes high-resolution camera photos down to an optimal size
 * for fast upload and accurate OCR reading without exceeding payload size limits.
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.85
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
        // If image loading fails, return raw dataUrl
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

          // Draw with high quality
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
 * Extracts models starting with "HSO" and their production quantities from raw OCR text.
 * Handles various industrial sheet formats:
 * e.g. "HSO17-3NB-I:AC (900)", "HSO18-4NB-I 460", "HSO19-5NB-I:AC: 250", etc.
 */
export function parseHsoModelsFromText(rawText: string): Array<{ modelName: string; qty: number }> {
  if (!rawText) return [];

  const lines = rawText.split(/\r?\n/);
  const results: Array<{ modelName: string; qty: number }> = [];
  const seenModels = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Look for HSO model pattern
    // Match HSO followed by alphanumeric, hyphens, colons, slashes
    const match = line.match(/\b(HSO[A-Za-z0-9_\-:\/.]{3,})/i);
    if (!match) continue;

    let modelName = match[1].toUpperCase().trim();
    // Clean trailing punctuation or OCR artifacts
    modelName = modelName.replace(/[,;.:\-_]+$/, '');
    if (modelName.length < 5) continue;

    // Parse quantity
    let qty = 0;
    // 1. Check for quantity in parentheses e.g. "(900)"
    const parenMatch = line.match(/\((\d+)\)/);
    if (parenMatch) {
      qty = parseInt(parenMatch[1], 10);
    } else {
      // 2. Look for numbers appearing after or near the model name
      const textAfterModel = line.slice(line.indexOf(match[0]) + match[0].length);
      const numMatches = textAfterModel.match(/\b\d{1,5}\b/g) || line.match(/\b\d{1,5}\b/g);
      if (numMatches && numMatches.length > 0) {
        for (const numStr of numMatches) {
          const parsedNum = parseInt(numStr, 10);
          // Reasonable production batch size check
          if (parsedNum > 0 && parsedNum <= 50000) {
            qty = parsedNum;
            break;
          }
        }
      }
    }

    if (qty <= 0) {
      qty = 100; // Sensible default if quantity not discernible
    }

    if (!seenModels.has(modelName)) {
      seenModels.add(modelName);
      results.push({ modelName, qty });
    }
  }

  return results;
}

/**
 * Runs client-side OCR on the provided image using Tesseract.js directly in the browser.
 * Works even when completely offline or when deployed to static hosts like Vercel.
 */
export async function extractHsoModelsClientSide(
  imageDataUrl: string,
  onProgress?: (progressText: string) => void
): Promise<Array<{ modelName: string; qty: number }>> {
  try {
    if (onProgress) onProgress('Initializing local OCR engine...');

    const res = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          onProgress(`Scanning image on device (${pct}%)...`);
        }
      }
    });

    const ocrText = res?.data?.text || '';
    return parseHsoModelsFromText(ocrText);
  } catch (err) {
    console.error('Client-side Tesseract OCR failed:', err);
    return [];
  }
}
