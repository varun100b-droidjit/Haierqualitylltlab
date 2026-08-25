import { createDefaultMasterDocxBase64 } from '../utils/docxGenerator';
import { db, isFirebaseConfigured, doc, setDoc, getDoc, getDocs, collection, deleteDoc, onSnapshot } from './firebase';

export interface MasterTemplate {
  id: string;
  reportType: string; // e.g. 'proto', 'reliability', 'field', 'bee', 'remote', 'pcb'
  fileName: string;
  fileSize: number;
  uploadedAt: string; // YYYY-MM-DD HH:mm
  base64Data: string; // base64 encoded docx file
  isFirebaseSynced?: boolean;
}

const DB_NAME = 'LLTLabReportTemplatesDB';
const DB_VERSION = 1;
const STORE_NAME = 'templates';
const FIREBASE_COLLECTION = 'master_templates';
const CHUNK_SIZE = 600000; // ~600KB chunk size to stay safely within Firestore's 1MB doc limit

// In-memory cache for ultra-fast sync access
const templateCache: Record<string, MasterTemplate> = {};
let isCacheInitialized = false;
let isFirestoreListenerActive = false;
const listeners = new Set<(templates: Record<string, MasterTemplate>) => void>();

export function subscribeToMasterTemplates(callback: (templates: Record<string, MasterTemplate>) => void): () => void {
  listeners.add(callback);
  callback(templateCache);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb({ ...templateCache });
    } catch (e) {
      console.error('Error notifying template listener:', e);
    }
  });
}

export function getDefaultMasterTemplate(reportType: string = 'proto'): MasterTemplate {
  const isExp = reportType === 'reliability' || reportType === 'ce-report';
  const name = isExp ? 'Master Customer Experience Template (Auto-Mapped).docx' : 'Master Customer Simulation Template (Auto-Mapped).docx';
  return {
    id: `default-tpl-${reportType}`,
    reportType,
    fileName: name,
    fileSize: 18450,
    uploadedAt: 'Built-in Master Format',
    base64Data: createDefaultMasterDocxBase64(reportType),
    isFirebaseSynced: false
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME, { keyPath: 'reportType' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initializes in-memory cache from IndexedDB + Firebase Firestore
 */
export async function initMasterTemplateStore(): Promise<Record<string, MasterTemplate>> {
  // 1. First quickly hydrate from IndexedDB/localStorage for instant rendering
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    await new Promise<void>((resolve) => {
      request.onsuccess = () => {
        const items: MasterTemplate[] = request.result || [];
        items.forEach((item) => {
          if (item.uploadedAt === 'Built-in Master Format' || item.id?.startsWith('default-tpl-')) {
            templateCache[item.reportType] = getDefaultMasterTemplate(item.reportType);
          } else {
            templateCache[item.reportType] = item;
          }
        });
        isCacheInitialized = true;
        resolve();
      };
      request.onerror = () => {
        loadFromLocalStorageFallback();
        resolve();
      };
    });
  } catch (e) {
    loadFromLocalStorageFallback();
  }

  // 2. Fetch and sync from Firebase Firestore
  if (isFirebaseConfigured && db) {
    try {
      await fetchTemplatesFromFirebase();
      initFirebaseRealtimeSync();
    } catch (fbErr) {
      console.warn('Firebase Master Templates fetch note:', fbErr);
    }
  }

  notifyListeners();
  return templateCache;
}

/**
 * Loads all templates from Firebase Firestore and updates cache + IndexedDB
 */
async function fetchTemplatesFromFirebase(): Promise<void> {
  if (!db) return;
  try {
    const colRef = collection(db, FIREBASE_COLLECTION);
    const snapshot = await getDocs(colRef);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.reportType) {
        let base64 = '';
        if (data.isChunked && Array.isArray(data.chunks)) {
          base64 = data.chunks.join('');
        } else {
          base64 = data.base64Data || '';
        }

        if (base64) {
          const tpl: MasterTemplate = {
            id: data.id || `fb-${data.reportType}`,
            reportType: data.reportType,
            fileName: data.fileName || 'Master Template.docx',
            fileSize: Number(data.fileSize) || base64.length,
            uploadedAt: data.uploadedAt || 'Firebase Cloud',
            base64Data: base64,
            isFirebaseSynced: true
          };
          templateCache[tpl.reportType] = tpl;
          persistToIndexedDB(tpl);
        }
      }
    });
    notifyListeners();
  } catch (err: any) {
    // If permissions are not granted or offline, log warning and use local/cached master templates
    console.warn('Note on fetching master templates from Firebase:', err?.message || err);
  }
}

/**
 * Sets up a realtime snapshot listener on Firestore master_templates collection
 */
function initFirebaseRealtimeSync() {
  if (isFirestoreListenerActive || !db) return;
  try {
    const colRef = collection(db, FIREBASE_COLLECTION);
    onSnapshot(colRef, (snapshot) => {
      let changed = false;
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const rType = data.reportType || change.doc.id;
        if (change.type === 'removed') {
          if (templateCache[rType] && templateCache[rType].uploadedAt !== 'Built-in Master Format') {
            delete templateCache[rType];
            changed = true;
          }
        } else {
          let base64 = '';
          if (data.isChunked && Array.isArray(data.chunks)) {
            base64 = data.chunks.join('');
          } else {
            base64 = data.base64Data || '';
          }

          if (base64) {
            const tpl: MasterTemplate = {
              id: data.id || `fb-${rType}`,
              reportType: rType,
              fileName: data.fileName || 'Master Template.docx',
              fileSize: Number(data.fileSize) || base64.length,
              uploadedAt: data.uploadedAt || 'Firebase Cloud',
              base64Data: base64,
              isFirebaseSynced: true
            };
            templateCache[rType] = tpl;
            persistToIndexedDB(tpl);
            changed = true;
          }
        }
      });
      if (changed) {
        notifyListeners();
      }
    }, (err) => {
      console.warn('Realtime sync on master_templates encountered error:', err);
    });
    isFirestoreListenerActive = true;
  } catch (err) {
    console.warn('Could not attach Firestore realtime listener for master_templates:', err);
  }
}

function loadFromLocalStorageFallback() {
  try {
    const raw = localStorage.getItem('llt_master_report_templates_v1');
    if (raw) {
      const map: Record<string, MasterTemplate> = JSON.parse(raw);
      Object.assign(templateCache, map);
    }
  } catch (err) {
    console.warn('LocalStorage fallback failed:', err);
  }
  isCacheInitialized = true;
}

/**
 * Synchronously returns cached master template
 */
export function getMasterTemplate(reportType: string = 'proto'): MasterTemplate {
  if (templateCache[reportType]) {
    return templateCache[reportType];
  }

  // Synchronous attempt from localStorage fallback
  try {
    const raw = localStorage.getItem('llt_master_report_templates_v1');
    if (raw) {
      const map: Record<string, MasterTemplate> = JSON.parse(raw);
      if (map[reportType]) {
        templateCache[reportType] = map[reportType];
        return map[reportType];
      }
    }
  } catch (e) {
    // Ignore
  }

  const defaultTpl = getDefaultMasterTemplate(reportType);
  templateCache[reportType] = defaultTpl;
  return defaultTpl;
}

/**
 * Async fetch master template from Firebase or IndexedDB
 */
export async function getMasterTemplateAsync(reportType: string = 'proto'): Promise<MasterTemplate> {
  if (templateCache[reportType]) {
    return templateCache[reportType];
  }

  // Check Firebase first if configured
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, FIREBASE_COLLECTION, reportType);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        let base64 = '';
        if (data.isChunked && Array.isArray(data.chunks)) {
          base64 = data.chunks.join('');
        } else {
          base64 = data.base64Data || '';
        }

        if (base64) {
          const tpl: MasterTemplate = {
            id: data.id || `fb-${reportType}`,
            reportType,
            fileName: data.fileName || 'Master Template.docx',
            fileSize: Number(data.fileSize) || base64.length,
            uploadedAt: data.uploadedAt || 'Firebase Cloud',
            base64Data: base64,
            isFirebaseSynced: true
          };
          templateCache[reportType] = tpl;
          persistToIndexedDB(tpl);
          return tpl;
        }
      }
    } catch (fbErr) {
      console.warn('Firebase getMasterTemplateAsync check note:', fbErr);
    }
  }

  // Fallback to IndexedDB
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(reportType);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const result = request.result as MasterTemplate | undefined;
        if (result) {
          templateCache[reportType] = result;
          resolve(result);
        } else {
          resolve(getMasterTemplate(reportType));
        }
      };
      request.onerror = () => {
        resolve(getMasterTemplate(reportType));
      };
    });
  } catch (e) {
    return getMasterTemplate(reportType);
  }
}

async function persistToIndexedDB(template: MasterTemplate): Promise<void> {
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(template);
  } catch (e) {
    console.error('Failed to save master template to IndexedDB:', e);
  }
}

/**
 * Saves master template into Firebase Firestore + IndexedDB
 */
export async function saveMasterTemplateAsync(template: MasterTemplate): Promise<void> {
  const updatedTemplate: MasterTemplate = {
    ...template,
    isFirebaseSynced: isFirebaseConfigured
  };

  // 1. Update in-memory cache immediately
  templateCache[template.reportType] = updatedTemplate;
  notifyListeners();

  // 2. Persist in IndexedDB
  await persistToIndexedDB(updatedTemplate);

  // 3. Persist to Firebase Firestore
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, FIREBASE_COLLECTION, template.reportType);
      const isLarge = template.base64Data.length > CHUNK_SIZE;

      let payload: any = {
        id: template.id,
        reportType: template.reportType,
        fileName: template.fileName,
        fileSize: template.fileSize,
        uploadedAt: template.uploadedAt,
        updatedAt: new Date().toISOString()
      };

      if (isLarge) {
        const chunks: string[] = [];
        for (let i = 0; i < template.base64Data.length; i += CHUNK_SIZE) {
          chunks.push(template.base64Data.slice(i, i + CHUNK_SIZE));
        }
        payload.isChunked = true;
        payload.chunks = chunks;
      } else {
        payload.isChunked = false;
        payload.base64Data = template.base64Data;
      }

      await setDoc(docRef, payload);
      console.log(`Master template for "${template.reportType}" saved to Firebase Firestore successfully.`);
    } catch (fbErr) {
      console.error('Failed to save master template to Firebase Firestore:', fbErr);
    }
  }

  // 4. Update localStorage as secondary fallback
  try {
    const map = { [template.reportType]: updatedTemplate };
    localStorage.setItem('llt_master_report_templates_v1', JSON.stringify(map));
  } catch (e) {
    // LocalStorage full, ignore since Firestore & IndexedDB have it
  }
}

/**
 * Sync wrapper for saving
 */
export function saveMasterTemplate(template: MasterTemplate): void {
  saveMasterTemplateAsync(template);
}

/**
 * Deletes master template from Firebase Firestore, IndexedDB, and cache
 */
export async function deleteMasterTemplateAsync(reportType: string = 'proto'): Promise<void> {
  delete templateCache[reportType];
  notifyListeners();

  // 1. Delete from Firebase Firestore
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, FIREBASE_COLLECTION, reportType);
      await deleteDoc(docRef);
      console.log(`Master template for "${reportType}" deleted from Firebase Firestore.`);
    } catch (fbErr) {
      console.error('Failed to delete master template from Firebase Firestore:', fbErr);
    }
  }

  // 2. Delete from IndexedDB
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(reportType);
  } catch (e) {
    console.error('Failed to delete master template from IndexedDB:', e);
  }

  // 3. Delete from localStorage fallback
  try {
    localStorage.removeItem('llt_master_report_templates_v1');
  } catch (e) {
    // ignore
  }
}

export function deleteMasterTemplate(reportType: string = 'proto'): void {
  deleteMasterTemplateAsync(reportType);
}

// Auto init on import in browser
if (typeof window !== 'undefined') {
  initMasterTemplateStore();
}
