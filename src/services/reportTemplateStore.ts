import { createDefaultMasterDocxBase64 } from '../utils/docxGenerator';

export interface MasterTemplate {
  id: string;
  reportType: string; // e.g. 'proto', 'reliability', 'field', 'bee', 'remote', 'pcb'
  fileName: string;
  fileSize: number;
  uploadedAt: string; // YYYY-MM-DD HH:mm
  base64Data: string; // base64 encoded docx file
}

const DB_NAME = 'LLTLabReportTemplatesDB';
const DB_VERSION = 1;
const STORE_NAME = 'templates';

// In-memory cache for ultra-fast sync access
const templateCache: Record<string, MasterTemplate> = {};
let isCacheInitialized = false;

export function getDefaultMasterTemplate(reportType: string = 'proto'): MasterTemplate {
  const isExp = reportType === 'reliability' || reportType === 'ce-report';
  const name = isExp ? 'Master Customer Experience Template (Auto-Mapped).docx' : 'Master Customer Simulation Template (Auto-Mapped).docx';
  return {
    id: `default-tpl-${reportType}`,
    reportType,
    fileName: name,
    fileSize: 18450,
    uploadedAt: 'Built-in Master Format',
    base64Data: createDefaultMasterDocxBase64(reportType)
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
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'reportType' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initializes in-memory cache from IndexedDB (or fallback localStorage)
 */
export async function initMasterTemplateStore(): Promise<Record<string, MasterTemplate>> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const items: MasterTemplate[] = request.result || [];
        items.forEach((item) => {
          templateCache[item.reportType] = item;
        });
        isCacheInitialized = true;
        resolve(templateCache);
      };
      request.onerror = () => {
        loadFromLocalStorageFallback();
        resolve(templateCache);
      };
    });
  } catch (e) {
    loadFromLocalStorageFallback();
    return templateCache;
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
    // Ignore quota or read errors
  }

  const defaultTpl = getDefaultMasterTemplate(reportType);
  templateCache[reportType] = defaultTpl;
  return defaultTpl;
}

/**
 * Async fetch master template from IndexedDB
 */
export async function getMasterTemplateAsync(reportType: string = 'proto'): Promise<MasterTemplate> {
  if (templateCache[reportType]) {
    return templateCache[reportType];
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
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

/**
 * Saves master template into IndexedDB (supports large .docx files without localStorage quota limits)
 */
export async function saveMasterTemplateAsync(template: MasterTemplate): Promise<void> {
  // 1. Update in-memory cache immediately
  templateCache[template.reportType] = template;

  // 2. Persist in IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(template);
  } catch (e) {
    console.error('Failed to save master template to IndexedDB:', e);
  }

  // 3. Optional attempt to update localStorage (safely ignoring QuotaExceededError)
  try {
    const map = { [template.reportType]: template };
    localStorage.setItem('llt_master_report_templates_v1', JSON.stringify(map));
  } catch (e) {
    // Gracefully handle QuotaExceededError - IndexedDB is our primary storage
    console.warn('LocalStorage full, stored in IndexedDB successfully.');
  }
}

/**
 * Sync wrapper for saving
 */
export function saveMasterTemplate(template: MasterTemplate): void {
  saveMasterTemplateAsync(template);
}

/**
 * Deletes master template from IndexedDB and cache
 */
export async function deleteMasterTemplateAsync(reportType: string = 'proto'): Promise<void> {
  delete templateCache[reportType];

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(reportType);
  } catch (e) {
    console.error('Failed to delete master template from IndexedDB:', e);
  }

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
