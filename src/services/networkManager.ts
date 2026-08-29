/**
 * Network Connectivity & Cloud Direct-Save Manager
 * Ensures all mutations are persisted directly to Firebase Firestore & Supabase.
 * Triggers interactive "No Internet Connection" modal when offline.
 */

type NetworkModalListener = (isOpen: boolean, context?: string) => void;
type ConnectionStateListener = (isOnline: boolean) => void;

let isOnlineState: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isModalOpenState: boolean = false;
let currentModalContext: string = '';

const modalListeners = new Set<NetworkModalListener>();
const connectionListeners = new Set<ConnectionStateListener>();

// Initialize network event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnlineState = true;
    notifyConnectionListeners(true);
  });

  window.addEventListener('offline', () => {
    isOnlineState = false;
    notifyConnectionListeners(false);
    triggerNoInternetModal('Network connection was lost');
  });
}

function notifyConnectionListeners(online: boolean) {
  connectionListeners.forEach((fn) => fn(online));
}

function notifyModalListeners() {
  modalListeners.forEach((fn) => fn(isModalOpenState, currentModalContext));
}

/**
 * Checks whether the browser has an active network connection.
 */
export function isNetworkOnline(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Actively tests connectivity by pinging a lightweight endpoint
 */
export async function testActiveConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    // Ping public status / no-cors head request
    await fetch('https://www.gstatic.com/generate_204', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    isOnlineState = true;
    notifyConnectionListeners(true);
    return true;
  } catch (err) {
    // If gstatic fails or timeout occurs, check navigator.onLine as backup
    const online = typeof navigator !== 'undefined' ? navigator.onLine : false;
    isOnlineState = online;
    notifyConnectionListeners(online);
    return online;
  }
}

/**
 * Explicitly triggers the "No Internet Connection" Popup Modal
 */
export function triggerNoInternetModal(actionContext?: string) {
  isModalOpenState = true;
  currentModalContext = actionContext || 'Cloud Database Sync';
  notifyModalListeners();
}

/**
 * Closes the "No Internet Connection" Modal
 */
export function closeNoInternetModal() {
  isModalOpenState = false;
  currentModalContext = '';
  notifyModalListeners();
}

/**
 * Guard function before saving to Cloud.
 * If offline, opens modal and returns false.
 */
export function requireOnlineForSave(actionDescription: string): boolean {
  if (!isNetworkOnline()) {
    triggerNoInternetModal(`Cannot save "${actionDescription}" while offline`);
    return false;
  }
  return true;
}

/**
 * Subscribe to Modal Open/Close events
 */
export function subscribeNoInternetModal(listener: NetworkModalListener) {
  modalListeners.add(listener);
  // Emit current state immediately
  listener(isModalOpenState, currentModalContext);
  return () => {
    modalListeners.delete(listener);
  };
}

/**
 * Subscribe to Online/Offline state changes
 */
export function subscribeConnectionState(listener: ConnectionStateListener) {
  connectionListeners.add(listener);
  listener(isOnlineState);
  return () => {
    connectionListeners.delete(listener);
  };
}
