import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  doc,
  getDoc,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfigJson from '../firebase-applet-config.json';

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

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let firebaseConfigured = false;

try {
  // Suppress noisy internal @firebase/firestore WebChannel 10s offline/transport console errors
  setLogLevel('silent');

  const config = {
    apiKey: firebaseConfigJson.apiKey || import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: firebaseConfigJson.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: firebaseConfigJson.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: firebaseConfigJson.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: firebaseConfigJson.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: firebaseConfigJson.appId || import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (config.apiKey && config.projectId && config.appId) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    // Explicitly pass firestoreDatabaseId if configured and enable auto long-polling for iframe/mobile proxy stability
    const databaseId = (firebaseConfigJson as { firestoreDatabaseId?: string }).firestoreDatabaseId;
    try {
      db = databaseId
        ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, databaseId)
        : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } catch {
      db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
    }
    firebaseConfigured = true;
  }
} catch (e) {
  console.warn('Firebase initialization warning:', e);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const message = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo:
        auth?.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  if (
    !message.includes('client is offline') &&
    !message.includes('Could not reach Cloud Firestore backend') &&
    !message.includes('unavailable')
  ) {
    console.warn('Firestore Operation Warning: ', JSON.stringify(errInfo));
  }
  throw new Error(errInfo.error);
}

// Test connection on boot with offline-safe cache fallback
export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  try {
    await getDoc(doc(db, 'test', 'connection'));
    return true;
  } catch {
    return false;
  }
}

export { app, auth, db, firebaseConfigured };