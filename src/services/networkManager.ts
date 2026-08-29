/**
 * Network Connectivity & Cloud Direct-Save Manager
 * Ensures all mutations are persisted directly to Firebase Firestore & Supabase.
 * Actively monitors network connectivity in real-time (instant event + heartbeat probe)
 * Triggers interactive "No Internet Connection" modal when offline even if user is idle.
 */

type NetworkModalListener = (isOpen: boolean, context?: string) => void;
type ConnectionStateListener = (isOnline: boolean) => void;

let isOnlineState: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isModalOpenState: boolean = false;
let currentModalContext: string = '';

const modalListeners = new Set<NetworkModalListener>();
const connectionListeners = new Set<ConnectionStateListener>();

function notifyConnectionListeners(online: boolean) {
  connectionListeners.forEach((fn) => {
    try { fn(online); } catch {}
  });
}

function notifyModalListeners() {
  modalListeners.forEach((fn) => {
    try { fn(isModalOpenState, currentModalContext); } catch {}
  });
}

/**
 * Checks whether the browser has an active network connection.
 */
export function isNetworkOnline(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.onLine && isOnlineState;
  }
  return true;
}

/**
 * Explicitly triggers the "No Internet Connection" Popup Modal
 */
export function triggerNoInternetModal(actionContext?: string) {
  isModalOpenState = true;
  currentModalContext = actionContext || 'Network connection lost';
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
 * Actively tests connectivity by pinging a lightweight endpoint
 */
export async function testActiveConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    isOnlineState = false;
    notifyConnectionListeners(false);
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    // Ping fast 204 endpoint or cache-busting timestamp
    await fetch(`https://www.gstatic.com/generate_204?t=${Date.now()}`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    const wasOffline = !isOnlineState;
    isOnlineState = true;
    notifyConnectionListeners(true);
    
    // If modal was opened automatically due to background drop, auto close on recovery
    if (wasOffline && isModalOpenState && currentModalContext.includes('Network connection lost')) {
      setTimeout(() => {
        closeNoInternetModal();
      }, 600);
    }
    
    return true;
  } catch (err) {
    const wasOnline = isOnlineState;
    isOnlineState = false;
    notifyConnectionListeners(false);
    
    // If connection dropped in background while idle, show popup immediately
    if (wasOnline || !isModalOpenState) {
      triggerNoInternetModal('Internet connection lost');
    }
    return false;
  }
}

// -------------------------------------------------------------
// Real-Time Background Listeners & Heartbeat Engine
// -------------------------------------------------------------
if (typeof window !== 'undefined') {
  // 1. Immediate OS / Browser Offline event
  window.addEventListener('offline', () => {
    console.warn('[NetworkManager] Browser entered OFFLINE mode');
    isOnlineState = false;
    notifyConnectionListeners(false);
    triggerNoInternetModal('Internet connection disconnected');
  });

  // 2. Immediate OS / Browser Online event
  window.addEventListener('online', () => {
    console.log('[NetworkManager] Browser entered ONLINE mode, verifying ping...');
    testActiveConnection();
  });

  // 3. Initial check on startup
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    isOnlineState = false;
    setTimeout(() => {
      triggerNoInternetModal('No initial internet connection');
    }, 400);
  }

  // 4. Continuous Background Heartbeat (every 4 seconds)
  // Even if user does no activity, detects silent network drops immediately
  setInterval(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (isOnlineState || !isModalOpenState) {
        isOnlineState = false;
        notifyConnectionListeners(false);
        triggerNoInternetModal('Network disconnected');
      }
      return;
    }

    // Fast background verification probe
    testActiveConnection();
  }, 4000);
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
