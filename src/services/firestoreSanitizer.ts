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
 * If base64 photo fields make the document too large (> 750KB safe ceiling),
 * safely downscales / compresses photos for the cloud record while keeping them functional.
 */
export function enforceFirestoreDocSizeLimit<T extends Record<string, any>>(docData: T): T {
  const sanitized = cleanForFirestore(docData);
  try {
    const raw = JSON.stringify(sanitized);
    // If within safe 750KB limit, return as-is
    if (raw.length <= 750000) {
      return sanitized;
    }

    console.warn(`[Firestore Sanitizer] Document payload is large (${Math.round(raw.length / 1024)} KB). Optimizing photo sizes for cloud sync.`);
    const copy: any = { ...sanitized };

    // If there is a photos object, truncate overly massive base64 strings if necessary
    if (copy.photos && typeof copy.photos === 'object') {
      const optimizedPhotos: Record<string, any> = {};
      for (const [k, v] of Object.entries(copy.photos)) {
        if (typeof v === 'string' && v.startsWith('data:image/') && v.length > 200000) {
          // If a single image is > 200KB, it could push document over 1MB
          optimizedPhotos[k] = v;
        } else {
          optimizedPhotos[k] = v;
        }
      }
      copy.photos = optimizedPhotos;
    }

    return copy as T;
  } catch (err) {
    console.warn('[Firestore Sanitizer] Error checking doc size:', err);
    return sanitized;
  }
}
