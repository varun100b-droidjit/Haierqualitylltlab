import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { 
  getFirestore, 
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
    try {
      db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
    } catch (e1) {
      console.warn("Named database fallback to default getFirestore(app):", e1);
      db = getFirestore(app);
    }
    auth = getAuth(app);
    console.log("Firebase initialized successfully for LLT Lab");
  } catch (error) {
    console.warn("Firebase initialization note:", error);
  }
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


