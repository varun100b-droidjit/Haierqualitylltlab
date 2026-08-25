import { initializeApp, getApps, getApp } from 'firebase/app';
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
  orderBy,
  writeBatch 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';

const metaEnv = (import.meta as any).env || {};

// Standard Firebase config loaded from env or local applet json config
const firebaseConfig = {
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
    db = getFirestore(app, databaseId);
    auth = getAuth(app);
    console.log("Firebase initialized successfully for LLT Lab with Database ID:", databaseId);
  } catch (error) {
    console.warn("Firebase initialization note:", error);
  }
}

export { app, db, auth, collection, doc, setDoc, getDoc, getDocs, onSnapshot, updateDoc, deleteDoc, query, orderBy, writeBatch };

