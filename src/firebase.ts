import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
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

// Non-essential cache keys that can be safely evicted whenever localStorage nears its 5MB quota
const EVICTABLE_CACHE_KEYS = [
  'glowzaa_products_cache_v1',
  'glowzaa_entries_cache_v1',
  'glowzaa_audit_logs_cache_v1',
  'glowzaa_distributions_cache_v1',
  'glowzaa_investors_cache_v1',
  'glowzaa_approval_requests_cache',
  'glowzaa_custom_trending_photos_v1',
  'glowzaa_google_verified_photos_v1',
  'glowzaa_auto_live_trending_items_v3',
  'glowzaa_email_notification_logs_v1',
];

export function cleanupStorageQuota(aggressive = false): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      // Always remove leftover Firestore multi-tab WebStorage keys that cause b815 QuotaExceededError
      if (
        k.startsWith('firestore_') ||
        k.includes('firestore_targets_') ||
        k.includes('firestore_clients_') ||
        k.includes('firestore_mutations_') ||
        k.includes('firestore_online_state_') ||
        k.includes('firestore_sequence_number_')
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });

    if (aggressive) {
      for (const k of EVICTABLE_CACHE_KEYS) {
        try {
          window.localStorage.removeItem(k);
        } catch {}
      }
      return;
    }

    // Check total localStorage usage; if > 2.2M chars (~4.4MB UTF-16), evict heavy caches proactively
    let totalChars = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const val = window.localStorage.getItem(k);
      totalChars += k.length + (val ? val.length : 0);
    }
    if (totalChars > 1800000) {
      for (const k of EVICTABLE_CACHE_KEYS) {
        try {
          window.localStorage.removeItem(k);
        } catch {}
      }
    }
  } catch {
    // Ignore storage inspection errors
  }
}

function installSafeStorageGuard(): void {
  if (typeof window === 'undefined' || !window.Storage) return;
  const proto = window.Storage.prototype as any;
  if (proto.__glowzaaQuotaGuarded) return;
  const originalSetItem = proto.setItem;
  proto.setItem = function (key: string, value: string) {
    try {
      return originalSetItem.call(this, key, value);
    } catch (err: any) {
      // Evict caches and stale firestore_* keys, then retry
      cleanupStorageQuota(true);
      try {
        // Only retry if the single item itself isn't excessively huge (< 1.5M chars)
        if (typeof value === 'string' && value.length < 1500000) {
          return originalSetItem.call(this, key, value);
        }
      } catch {
        // Swallow QuotaExceededError so Firestore internal state (b815) or UI never crashes
      }
    }
  };
  proto.__glowzaaQuotaGuarded = true;
}

// Run immediately before Firebase initializes
installSafeStorageGuard();
cleanupStorageQuota(false);

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
    // Explicitly pass firestoreDatabaseId if configured.
    // Use persistentSingleTabManager (IndexedDB only, never writes firestore_targets_* to 5MB localStorage)
    // with automatic fallback to memoryLocalCache to prevent b815 QuotaExceededError.
    const databaseId = (firebaseConfigJson as { firestoreDatabaseId?: string }).firestoreDatabaseId;
    const primarySettings = {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
      experimentalAutoDetectLongPolling: true,
    };
    const fallbackMemorySettings = {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
    };
    try {
      db = databaseId
        ? initializeFirestore(app, primarySettings, databaseId)
        : initializeFirestore(app, primarySettings);
    } catch {
      try {
        db = databaseId
          ? initializeFirestore(app, fallbackMemorySettings, databaseId)
          : initializeFirestore(app, fallbackMemorySettings);
      } catch {
        db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
      }
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

  // If QuotaExceededError or b815 ever occurs, automatically purge localStorage bloat
  if (
    message.includes('QuotaExceededError') ||
    message.includes('exceeded the quota') ||
    message.includes('INTERNAL ASSERTION FAILED') ||
    message.includes('b815')
  ) {
    cleanupStorageQuota(true);
    throw new Error('ব্রাউজারের লোকাল মেমোরি পূর্ণ হয়ে গিয়েছিল। অপ্রয়োজনীয় ক্যাশ পরিষ্কার করা হয়েছে—অনুগ্রহ করে পেজটি একবার রিলোড (Refresh) করুন।');
  }

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