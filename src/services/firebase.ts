import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { 
  initializeFirestore,
  getFirestore, 
  setLogLevel,
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs, 
  getDocFromServer,
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  writeBatch 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword,
  User as FirebaseUser
} from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';

const metaEnv = (import.meta as any).env || {};

// Standard Firebase config loaded from env or local applet json config
export const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey || "",
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain || "",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || "",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket || "",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId || "",
  appId: metaEnv.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId || ""
};

const databaseId = firebaseAppletConfig.firestoreDatabaseId || "ai-studio-lltlab-6543a0bb-a2bd-4e99-a313-9e88870d61a6";

export const isFirebaseConfigured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);

let app: any = null;
let db: any = null;
let auth: any = null;

if (isFirebaseConfigured) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    
    // Suppress non-critical WebChannel timeout warnings in browser iframe/sandboxed environments
    try {
      setLogLevel('error');
    } catch {}

    try {
      // Force long-polling to prevent WebChannel 10-second backend timeout in browser iframe/proxy environments
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
      }, databaseId);
    } catch (e1) {
      try {
        db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
      } catch (e2) {
        db = getFirestore(app);
      }
    }
    auth = getAuth(app);
    console.log("Firebase initialized successfully for LLT Lab with long-polling transport");

    // Test connection asynchronously without blocking app startup
    setTimeout(async () => {
      try {
        if (db) {
          await getDocFromServer(doc(db, 'system_settings', 'active_shift'));
        }
      } catch (error: any) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("Client offline; operating in offline cache mode.");
        }
      }
    }, 100);
  } catch (error) {
    console.warn("Firebase initialization note:", error);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Info: ', JSON.stringify(errInfo));
  return errInfo;
}

export { 
  app, 
  db, 
  auth, 
  initializeApp,
  deleteApp,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy, 
  writeBatch,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword
};
export type { FirebaseUser };


