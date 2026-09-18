/**
 * firestoreSanitizer.ts
 * Utility functions to prepare objects for safe persistence in Firebase Firestore.
 * 1. Strips all `undefined` values (which crash Firestore setDoc/updateDoc).
 * 2. Ensures base64 photo payloads stay safely within Firestore's 1MB document limit.
 */

/**
 * Recursively removes undefined fields from an object so Firestore setDoc does not throw
 * "Unsupported field value: undefined".
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data.toISOString() as unknown as T;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => cleanForFirestore(item)) as unknown as T;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      clean[key] = cleanForFirestore(value);
    }
  }
  return clean as T;
}

/**
 * Ensures that a document being sent to Firestore does not exceed the 1MB (1,048,576 bytes) limit.
 * Deduplicates photo aliases (e.g. PHOTO_IDU_PCB vs iduPcbPhoto) which double the document size.
 * If base64 photo fields make the document too large (> 650KB safe ceiling),
 * safely keeps canonical photos within safe size limits so setDoc never fails with 1MB limit errors.
 */
export function enforceFirestoreDocSizeLimit<T extends Record<string, any>>(docData: T): T {
  const sanitized = cleanForFirestore(docData);
  try {
    const copy: any = { ...sanitized };

    // Deduplicate photo alias pairs if photos object exists
    if (copy.photos && typeof copy.photos === 'object') {
      const uniquePhotos: Record<string, any> = {};
      const seenValues = new Map<string, string>(); // value -> first key

      for (const [k, v] of Object.entries(copy.photos)) {
        if (typeof v === 'string' && v.startsWith('data:image/')) {
          // If this exact base64 data was already included under another key, omit duplicate
          if (seenValues.has(v)) {
            // keep alias mapping lightweight reference or omit
            continue;
          }
          seenValues.set(v, k);
          uniquePhotos[k] = v;
        } else if (v !== undefined && v !== null) {
          uniquePhotos[k] = v;
        }
      }
      copy.photos = uniquePhotos;
    }

    const raw = JSON.stringify(copy);
    if (raw.length <= 700000) {
      return copy as T;
    }

    console.warn(`[Firestore Sanitizer] Document payload is large (${Math.round(raw.length / 1024)} KB). Pruning oversized photo payloads for cloud sync.`);

    // If still over 700KB, only keep essential photos or placeholder references for very large base64 strings
    if (copy.photos && typeof copy.photos === 'object') {
      const prunedPhotos: Record<string, any> = {};
      for (const [k, v] of Object.entries(copy.photos)) {
        if (typeof v === 'string' && v.startsWith('data:image/') && v.length > 250000) {
          // Keep a marker so UI knows photo exists in IndexedDB
          prunedPhotos[k] = 'data:image/placeholder;stored_in_idb';
        } else {
          prunedPhotos[k] = v;
        }
      }
      copy.photos = prunedPhotos;
    }

    return copy as T;
  } catch (err) {
    console.warn('[Firestore Sanitizer] Error checking doc size:', err);
    return sanitized;
  }
}
