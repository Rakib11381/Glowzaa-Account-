import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  Entry,
  Investor,
  Product,
  ProfitDistribution,
  AuditLog,
  UserProfile,
  BusinessSettings,
  ApprovalRequest,
  EmailTriggerConfig,
  EmailNotificationLog,
  AiChatSession,
} from './types';
import { formatBengaliDateTime, calculateCashBalance } from './accounting';

const requireDb = () => {
  if (!db) throw new Error('Firebase ডেটাবেস সংযোগ পাওয়া যায়নি।');
  return db;
};

// Recursively remove undefined fields so Firestore NEVER fails with "Unsupported field value: undefined"
export function deepClean<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  // Preserve Firestore FieldValues (like serverTimestamp()), Timestamps, Dates, or any non-plain class instances
  if (
    obj instanceof Date ||
    (obj as any)?._methodName ||
    typeof (obj as any)?.toMillis === 'function' ||
    ((obj as any)?.constructor && (obj as any).constructor !== Object && !Array.isArray(obj))
  ) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => deepClean(item)) as any;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      result[key] = deepClean(val);
    }
  }
  return result as any;
}

function cleanObject<T extends Record<string, any>>(obj: T): Record<string, any> {
  return deepClean(obj);
}

// Instant 0ms localStorage cache helpers so data is rendered immediately on page open
const CACHE_KEYS = {
  entries: 'glowzaa_entries_cache_v1',
  investors: 'glowzaa_investors_cache_v1',
  products: 'glowzaa_products_cache_v1',
  distributions: 'glowzaa_distributions_cache_v1',
  auditLogs: 'glowzaa_audit_logs_cache_v1',
};

function readCache<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache<T>(key: string, rows: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Ignore quota errors (e.g., if base64 product images exceed storage)
  }
}

export function getCachedEntries(): Entry[] {
  return readCache<Entry>(CACHE_KEYS.entries);
}

export function getCachedInvestors(): Investor[] {
  return readCache<Investor>(CACHE_KEYS.investors);
}

export function getCachedProducts(): Product[] {
  return readCache<Product>(CACHE_KEYS.products);
}

export function getCachedDistributions(): ProfitDistribution[] {
  return readCache<ProfitDistribution>(CACHE_KEYS.distributions);
}

export function getCachedAuditLogs(): AuditLog[] {
  return readCache<AuditLog>(CACHE_KEYS.auditLogs);
}

// Entries listener
export function watchEntries(cb: (rows: Entry[]) => void, error: (e: Error) => void): Unsubscribe {
  const cached = getCachedEntries();
  if (cached.length > 0) cb(cached);

  const d = requireDb();
  const path = 'entries';
  return onSnapshot(
    collection(d, path),
    (s) => {
      const rows = s.docs
        .map((x) => ({ id: x.id, ...(x.data() as Omit<Entry, 'id'>) }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      writeCache(CACHE_KEYS.entries, rows);
      cb(rows);
    },
    (e) => {
      try {
        handleFirestoreError(e, OperationType.LIST, path);
      } catch (err) {
        error(err as Error);
      }
    }
  );
}

// Investors listener
export function watchInvestors(cb: (rows: Investor[]) => void, error: (e: Error) => void): Unsubscribe {
  const cached = getCachedInvestors();
  if (cached.length > 0) cb(cached);

  const d = requireDb();
  const path = 'investors';
  return onSnapshot(
    collection(d, path),
    (s) => {
      const rows = s.docs
        .map((x) => ({ id: x.id, ...(x.data() as Omit<Investor, 'id'>) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'bn'));
      writeCache(CACHE_KEYS.investors, rows);
      cb(rows);
    },
    (e) => {
      try {
        handleFirestoreError(e, OperationType.LIST, path);
      } catch (err) {
        error(err as Error);
      }
    }
  );
}

// Products / Inventory listener
export function watchProducts(cb: (rows: Product[]) => void, error: (e: Error) => void): Unsubscribe {
  const cached = getCachedProducts();
  if (cached.length > 0) cb(cached);

  const d = requireDb();
  const path = 'products';
  return onSnapshot(
    collection(d, path),
    (s) => {
      const rows = s.docs
        .map((x) => ({ id: x.id, ...(x.data() as Omit<Product, 'id'>) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'bn'));
      writeCache(CACHE_KEYS.products, rows);
      cb(rows);
    },
    (e) => {
      try {
        handleFirestoreError(e, OperationType.LIST, path);
      } catch (err) {
        error(err as Error);
      }
    }
  );
}

// Profit distributions listener
export function watchDistributions(cb: (rows: ProfitDistribution[]) => void, error: (e: Error) => void): Unsubscribe {
  const cached = getCachedDistributions();
  if (cached.length > 0) cb(cached);

  const d = requireDb();
  const path = 'profitDistributions';
  return onSnapshot(
    collection(d, path),
    (s) => {
      const rows = s.docs
        .map((x) => ({ id: x.id, ...(x.data() as Omit<ProfitDistribution, 'id'>) }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      writeCache(CACHE_KEYS.distributions, rows);
      cb(rows);
    },
    (e) => {
      try {
        handleFirestoreError(e, OperationType.LIST, path);
      } catch (err) {
        error(err as Error);
      }
    }
  );
}

// Audit Logs listener
export function watchAuditLogs(cb: (rows: AuditLog[]) => void, error: (e: Error) => void): Unsubscribe {
  const cached = getCachedAuditLogs();
  if (cached.length > 0) cb(cached);

  const d = requireDb();
  const path = 'auditLogs';
  return onSnapshot(
    collection(d, path),
    (s) => {
      const rows = s.docs
        .map((x) => ({ id: x.id, ...(x.data() as Omit<AuditLog, 'id'>) }))
        .sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return tB - tA;
        });
      writeCache(CACHE_KEYS.auditLogs, rows.slice(0, 100));
      cb(rows);
    },
    (e) => {
      try {
        handleFirestoreError(e, OperationType.LIST, path);
      } catch (err) {
        error(err as Error);
      }
    }
  );
}

// Add Entry with optional Inventory Stock update and automatic Backend Email Trigger
export async function addEntry(
  row: Omit<Entry, 'id' | 'createdAt'>,
  uid: string,
  userEmail?: string,
  approverName?: string
) {
  const d = requireDb();
  const path = 'entries';
  try {
    const batch = writeBatch(d);
    const entryRef = doc(collection(d, path));

    const newEntry = cleanObject({
      ...row,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(entryRef, newEntry);

    // If sale or purchase of an inventoried product, update stock in batch
    if (row.productId && row.quantity && row.quantity > 0 && row.status === 'posted') {
      const prodRef = doc(d, 'products', row.productId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const prodData = prodSnap.data() as Product;
        const curStock = prodData.currentStock || 0;
        const curAvgCost = prodData.averageCost || 0;

        if (row.type === 'purchase') {
          const purchaseQty = row.quantity;
          const purchaseUnitCost = row.unitCost || (row.amount / purchaseQty);
          const newStock = curStock + purchaseQty;
          const totalCost = (curStock * curAvgCost) + (purchaseQty * purchaseUnitCost);
          const newAvgCost = newStock > 0 ? totalCost / newStock : curAvgCost;

          batch.update(prodRef, cleanObject({
            currentStock: newStock,
            averageCost: Math.round(newAvgCost * 100) / 100,
            updatedAt: serverTimestamp(),
          }));
        } else if (row.type === 'sale') {
          const newStock = Math.max(0, curStock - row.quantity);
          batch.update(prodRef, cleanObject({
            currentStock: newStock,
            updatedAt: serverTimestamp(),
          }));
        }
      }
    }

    await batch.commit();

    // Trigger backend email summary to Rakib & Limon when a non-demo transaction is posted
    if (row.status === 'posted' && !row.demo) {
      const actorDisplay =
        uid === 'Rakib'
          ? 'রাকিব (Rakib)'
          : uid === 'Limon'
          ? 'লিমন (Limon)'
          : userEmail || uid || 'অ্যাডমিন';
      const invList = getCachedInvestors();
      const matchedPartner = row.investorId ? invList.find((i) => i.id === row.investorId)?.name : undefined;

      triggerBackendEmailSummary({
        eventType: 'transaction_posted',
        title: row.title,
        entryType: row.type,
        amount: Number(row.amount) || 0,
        date: row.date,
        actorName: actorDisplay,
        approverName,
        partnerName: matchedPartner,
        category: row.category,
        notes: row.notes,
        profitAmount: row.grossProfit ?? row.profit,
        costAmount: row.cogsAmount,
        pendingAddedEntry: { id: entryRef.id, ...(row as any) },
      }).catch((err) => console.warn('Email trigger warning on addEntry:', err));
    }

    return entryRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
}

// Add Investor
export async function addInvestor(row: Omit<Investor, 'id' | 'createdAt'>) {
  const d = requireDb();
  const path = 'investors';
  try {
    return await addDoc(collection(d, path), cleanObject({
      ...row,
      createdAt: serverTimestamp(),
    }));
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
}

// Remove Investor
export async function removeInvestor(id: string, uid: string, email?: string) {
  const d = requireDb();
  const path = `investors/${id}`;
  try {
    const ref = doc(d, 'investors', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Investor;

    const batch = writeBatch(d);
    batch.delete(ref);
    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'delete_investor',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: 'Investor removed by authorized admin',
      createdAt: serverTimestamp(),
      details: { name: data.name },
    }));

    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

// Update Investor
export async function updateInvestor(id: string, patch: Partial<Investor>, uid: string, email?: string) {
  const d = requireDb();
  const path = `investors/${id}`;
  try {
    const batch = writeBatch(d);
    batch.update(doc(d, 'investors', id), cleanObject({
      ...patch,
      updatedAt: serverTimestamp(),
    }));
    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'edit_investor',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: 'Investor edited by authorized admin',
      createdAt: serverTimestamp(),
      details: patch,
    }));
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
}

// Add Product
export async function addProduct(row: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
  const d = requireDb();
  const path = 'products';
  try {
    return await addDoc(collection(d, path), cleanObject({
      ...row,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
}

// Update Product
export async function updateProduct(id: string, patch: Partial<Product>, uid: string, email?: string) {
  const d = requireDb();
  const path = `products/${id}`;
  try {
    const batch = writeBatch(d);
    batch.update(doc(d, 'products', id), cleanObject({
      ...patch,
      updatedAt: serverTimestamp(),
    }));
    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'edit_product',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: 'Product edited by authorized admin',
      createdAt: serverTimestamp(),
      details: patch,
    }));
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
}

// Remove Product
export async function removeProduct(id: string, uid: string, email?: string) {
  const d = requireDb();
  const path = `products/${id}`;
  try {
    const ref = doc(d, 'products', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Product;

    const batch = writeBatch(d);
    batch.delete(ref);
    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'delete_product',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: 'Product permanently removed by authorized admin',
      createdAt: serverTimestamp(),
      details: { name: data.name, currentStock: data.currentStock },
    }));
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

// Add Profit Distribution
export async function addProfitDistribution(
  dist: Omit<ProfitDistribution, 'id' | 'createdAt'>,
  uid: string
) {
  const d = requireDb();
  const path = 'profitDistributions';
  try {
    return await addDoc(collection(d, path), cleanObject({
      ...dist,
      createdBy: uid,
      createdAt: serverTimestamp(),
    }));
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, path);
  }
}

// Remove Profit Distribution
export async function removeProfitDistribution(id: string, uid: string, email?: string) {
  const d = requireDb();
  const path = `profitDistributions/${id}`;
  try {
    const ref = doc(d, 'profitDistributions', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as ProfitDistribution;

    const batch = writeBatch(d);
    batch.delete(ref);
    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'delete_distribution',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: 'Profit distribution permanently removed by authorized admin',
      createdAt: serverTimestamp(),
      details: { periodName: data.periodName, distributedAmount: data.distributedAmount },
    }));
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

// Update Entry with automatic inventory stock reconciliation when status, product, or quantity changes
export async function updateEntry(id: string, patch: Partial<Entry>, uid: string, email?: string) {
  const d = requireDb();
  const path = `entries/${id}`;
  try {
    const entryRef = doc(d, 'entries', id);
    const oldSnap = await getDoc(entryRef);
    const oldData = oldSnap.exists() ? (oldSnap.data() as Entry) : null;

    const batch = writeBatch(d);
    batch.update(entryRef, cleanObject({
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }));

    // Reconcile inventory stock if old or new state involves a posted sale/purchase with a product
    if (oldData) {
      const merged: Entry = { ...oldData, ...patch, id };
      const oldPosted = oldData.status === 'posted' && oldData.productId && (oldData.quantity || 0) > 0;
      const newPosted = merged.status === 'posted' && merged.productId && (merged.quantity || 0) > 0;

      if (oldPosted || newPosted) {
        const productDeltas = new Map<string, number>();

        // 1. Reverse old entry's stock effect
        if (oldPosted && oldData.productId) {
          const oldQty = Number(oldData.quantity) || 0;
          if (oldData.type === 'purchase') {
            productDeltas.set(oldData.productId, (productDeltas.get(oldData.productId) || 0) - oldQty);
          } else if (oldData.type === 'sale') {
            productDeltas.set(oldData.productId, (productDeltas.get(oldData.productId) || 0) + oldQty);
          }
        }

        // 2. Apply new entry's stock effect
        if (newPosted && merged.productId) {
          const newQty = Number(merged.quantity) || 0;
          if (merged.type === 'purchase') {
            productDeltas.set(merged.productId, (productDeltas.get(merged.productId) || 0) + newQty);
          } else if (merged.type === 'sale') {
            productDeltas.set(merged.productId, (productDeltas.get(merged.productId) || 0) - newQty);
          }
        }

        for (const [prodId, delta] of productDeltas.entries()) {
          if (delta !== 0) {
            const prodRef = doc(d, 'products', prodId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const curStock = (prodSnap.data() as Product).currentStock || 0;
              batch.update(prodRef, cleanObject({
                currentStock: Math.max(0, curStock + delta),
                updatedAt: serverTimestamp(),
              }));
            }
          }
        }
      }
    }

    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: patch.status === 'void' ? 'void_entry' : 'edit_entry',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: patch.voidReason || 'Record edited by authorized admin',
      createdAt: serverTimestamp(),
      details: patch,
    }));

    await batch.commit();

    // If a draft entry was just promoted to posted, trigger email summary to Rakib & Limon
    if (oldData && oldData.status !== 'posted' && patch.status === 'posted') {
      const merged: Entry = { ...oldData, ...patch, id };
      const actorDisplay =
        uid === 'Rakib'
          ? 'রাকিব (Rakib)'
          : uid === 'Limon'
          ? 'লিমন (Limon)'
          : email || uid || 'অ্যাডমিন';
      triggerBackendEmailSummary({
        eventType: 'transaction_posted',
        title: merged.title,
        entryType: merged.type,
        amount: Number(merged.amount) || 0,
        date: merged.date,
        actorName: actorDisplay,
        category: merged.category,
        notes: merged.notes,
        profitAmount: merged.grossProfit ?? merged.profit,
        costAmount: merged.cogsAmount,
      }).catch((err) => console.warn('Email trigger warning on updateEntry:', err));
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
}

// Only Drafts may be deleted. Guarded for audit safety.
export async function removeDraftEntry(id: string, uid: string, email?: string) {
  const d = requireDb();
  const path = `entries/${id}`;
  try {
    const ref = doc(d, 'entries', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Entry;

    const batch = writeBatch(d);
    batch.delete(ref);
    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'delete_draft',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: 'Draft entry permanently removed by authorized admin',
      createdAt: serverTimestamp(),
      details: { title: data.title, amount: data.amount, type: data.type },
    }));

    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

// Universal entry removal for any valid record in transactions tab with inventory stock adjustment and audit trail
export async function removeEntry(id: string, uid: string, email?: string) {
  const d = requireDb();
  const path = `entries/${id}`;
  try {
    const ref = doc(d, 'entries', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Entry;

    const batch = writeBatch(d);
    batch.delete(ref);
    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'delete_entry',
      recordId: id,
      actor: uid,
      actorEmail: email || '',
      reason: 'Entry permanently removed by authorized admin',
      createdAt: serverTimestamp(),
      details: { title: data.title, amount: data.amount, type: data.type, status: data.status },
    }));

    if (data.status === 'posted' && data.productId && data.quantity && data.quantity > 0) {
      const prodRef = doc(d, 'products', data.productId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const curStock = (prodSnap.data() as Product).currentStock || 0;
        if (data.type === 'purchase') {
          batch.update(prodRef, cleanObject({
            currentStock: Math.max(0, curStock - data.quantity),
            updatedAt: serverTimestamp(),
          }));
        } else if (data.type === 'sale') {
          batch.update(prodRef, cleanObject({
            currentStock: curStock + data.quantity,
            updatedAt: serverTimestamp(),
          }));
        }
      }
    }

    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

// Audit-safe void/reversal for posted financial transactions
export async function voidPostedEntry(entry: Entry, reason: string, uid: string, email?: string) {
  const d = requireDb();
  const path = `entries/${entry.id}`;
  try {
    const batch = writeBatch(d);
    batch.update(doc(d, 'entries', entry.id), cleanObject({
      status: 'void',
      voidReason: reason,
      voidedBy: uid,
      voidedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    batch.set(doc(collection(d, 'auditLogs')), cleanObject({
      action: 'void_entry',
      recordId: entry.id,
      actor: uid,
      actorEmail: email || '',
      reason,
      createdAt: serverTimestamp(),
      details: {
        title: entry.title,
        amount: entry.amount,
        type: entry.type,
        investorId: entry.investorId || null,
        previousStatus: entry.status,
      },
    }));

    if (entry.productId && entry.quantity && entry.quantity > 0) {
      const prodRef = doc(d, 'products', entry.productId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const curStock = (prodSnap.data() as Product).currentStock || 0;
        if (entry.type === 'purchase') {
          batch.update(prodRef, cleanObject({
            currentStock: Math.max(0, curStock - entry.quantity),
            updatedAt: serverTimestamp(),
          }));
        } else if (entry.type === 'sale') {
          batch.update(prodRef, cleanObject({
            currentStock: curStock + entry.quantity,
            updatedAt: serverTimestamp(),
          }));
        }
      }
    }

    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, path);
  }
}

// Bulk delete draft entries
export async function bulkRemoveDraftEntries(ids: string[], uid: string, email?: string) {
  const d = requireDb();
  const batch = writeBatch(d);

  for (const id of ids) {
    const ref = doc(d, 'entries', id);
    batch.delete(ref);
  }

  batch.set(doc(collection(d, 'auditLogs')), cleanObject({
    action: 'bulk_delete_drafts',
    recordId: 'multiple',
    actor: uid,
    actorEmail: email || '',
    reason: `Bulk deleted ${ids.length} draft entries`,
    createdAt: serverTimestamp(),
    details: { count: ids.length, ids },
  }));

  await batch.commit();
}

export interface DemoCleanupPreview {
  entriesCount: number;
  entriesTotalAmount: number;
  investorsCount: number;
  productsCount: number;
  distributionsCount: number;
  entryItems: { id: string; title: string; type: string; amount: number; status: string }[];
}

// Get preview of all demo data across collections before deletion
export async function getDemoDataPreview(): Promise<DemoCleanupPreview> {
  const d = requireDb();
  const [entriesSnap, invSnap, prodSnap, distSnap] = await Promise.all([
    getDocs(query(collection(d, 'entries'), where('demo', '==', true))),
    getDocs(query(collection(d, 'investors'), where('demo', '==', true))),
    getDocs(query(collection(d, 'products'), where('demo', '==', true))),
    getDocs(query(collection(d, 'profitDistributions'), where('demo', '==', true))),
  ]);

  let totalAmount = 0;
  const entryItems = entriesSnap.docs.map((docSnap) => {
    const data = docSnap.data() as Entry;
    totalAmount += data.amount || 0;
    return {
      id: docSnap.id,
      title: data.title,
      type: data.type,
      amount: data.amount,
      status: data.status,
    };
  });

  return {
    entriesCount: entriesSnap.size,
    entriesTotalAmount: Math.round(totalAmount * 100) / 100,
    investorsCount: invSnap.size,
    productsCount: prodSnap.size,
    distributionsCount: distSnap.size,
    entryItems,
  };
}

// Complete secure demo-data cleanup across all collections with audit trail
export async function deleteDemoData(uid: string, email?: string): Promise<{ deletedEntries: number; deletedInvestors: number; deletedProducts: number }> {
  const d = requireDb();
  const [entriesSnap, invSnap, prodSnap, distSnap] = await Promise.all([
    getDocs(query(collection(d, 'entries'), where('demo', '==', true))),
    getDocs(query(collection(d, 'investors'), where('demo', '==', true))),
    getDocs(query(collection(d, 'products'), where('demo', '==', true))),
    getDocs(query(collection(d, 'profitDistributions'), where('demo', '==', true))),
  ]);

  const batch = writeBatch(d);
  entriesSnap.docs.forEach((s) => batch.delete(s.ref));
  invSnap.docs.forEach((s) => batch.delete(s.ref));
  prodSnap.docs.forEach((s) => batch.delete(s.ref));
  distSnap.docs.forEach((s) => batch.delete(s.ref));

  batch.set(doc(collection(d, 'auditLogs')), cleanObject({
    action: 'cleanup_demo_data',
    recordId: 'all_demo',
    actor: uid,
    actorEmail: email || '',
    reason: 'Demo dataset cleared by admin',
    createdAt: serverTimestamp(),
    details: {
      deletedEntries: entriesSnap.size,
      deletedInvestors: invSnap.size,
      deletedProducts: prodSnap.size,
      deletedDistributions: distSnap.size,
    },
  }));

  await batch.commit();

  return {
    deletedEntries: entriesSnap.size,
    deletedInvestors: invSnap.size,
    deletedProducts: prodSnap.size,
  };
}

// Seed clean demo data for initial testing and demonstration
export async function seedDemoDataset(uid: string) {
  const d = requireDb();
  const batch = writeBatch(d);

  const inv1Ref = doc(collection(d, 'investors'));
  const inv2Ref = doc(collection(d, 'investors'));
  const inv3Ref = doc(collection(d, 'investors'));

  batch.set(inv1Ref, cleanObject({ name: 'আহমেদ হাসান (প্রধান অংশীদার)', phone: '01711-234567', active: true, demo: true, createdAt: serverTimestamp() }));
  batch.set(inv2Ref, cleanObject({ name: 'মাহমুদুল করিম (বিনিয়োগকারী)', phone: '01819-876543', active: true, demo: true, createdAt: serverTimestamp() }));
  batch.set(inv3Ref, cleanObject({ name: 'রফিকুর রহমান (সাইলেন্ট পার্টনার)', phone: '01912-345678', active: true, demo: true, createdAt: serverTimestamp() }));

  const prod1Ref = doc(collection(d, 'products'));
  const prod2Ref = doc(collection(d, 'products'));

  batch.set(prod1Ref, cleanObject({ name: 'প্রিমিয়াম এক্সপোর্ট টি-শার্ট', sku: 'TS-001', unit: 'পিস', currentStock: 150, averageCost: 280, sellingPrice: 550, demo: true, createdAt: serverTimestamp() }));
  batch.set(prod2Ref, cleanObject({ name: 'জেনুইন লেদার ওয়ালেট', sku: 'WL-002', unit: 'পিস', currentStock: 45, averageCost: 420, sellingPrice: 950, demo: true, createdAt: serverTimestamp() }));

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

  const e1 = doc(collection(d, 'entries'));
  batch.set(e1, cleanObject({
    type: 'investment',
    title: 'প্রাথমিক মূলধন বিনিয়োগ (Rakib 5,000৳)',
    amount: 5000,
    date: todayStr,
    investorId: inv1Ref.id,
    status: 'posted',
    demo: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
  }));

  const e2 = doc(collection(d, 'entries'));
  batch.set(e2, cleanObject({
    type: 'investment',
    title: 'অংশীদারী মূলধন বিনিয়োগ',
    amount: 300000,
    date: todayStr,
    investorId: inv2Ref.id,
    status: 'posted',
    demo: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
  }));

  const e3 = doc(collection(d, 'entries'));
  batch.set(e3, cleanObject({
    type: 'investment',
    title: 'পার্টনারশিপ ইকুইটি',
    amount: 200000,
    date: todayStr,
    investorId: inv3Ref.id,
    status: 'posted',
    demo: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
  }));

  const e4 = doc(collection(d, 'entries'));
  batch.set(e4, cleanObject({
    type: 'purchase',
    title: 'টি-শার্ট স্টক ক্রয় (২০০ পিস)',
    amount: 56000,
    date: todayStr,
    productId: prod1Ref.id,
    quantity: 200,
    unitCost: 280,
    status: 'posted',
    demo: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
  }));

  const e5 = doc(collection(d, 'entries'));
  batch.set(e5, cleanObject({
    type: 'sale',
    title: 'অনলাইন শপ বাল্ক বিক্রয় (৫০ পিস টি-শার্ট)',
    amount: 27500,
    date: todayStr,
    productId: prod1Ref.id,
    quantity: 50,
    unitPrice: 550,
    cogsAmount: 14000,
    grossProfit: 13500,
    status: 'posted',
    demo: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
  }));

  const e6 = doc(collection(d, 'entries'));
  batch.set(e6, cleanObject({
    type: 'expense',
    title: 'শোরুম ও অফিস ভাড়া',
    amount: 15000,
    date: todayStr,
    category: 'ভাড়া',
    status: 'posted',
    demo: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
  }));

  const e7 = doc(collection(d, 'entries'));
  batch.set(e7, cleanObject({
    type: 'draft',
    title: 'আসন্ন সাপ্লায়ার পেমেন্ট ড্রাফট',
    amount: 8500,
    date: todayStr,
    status: 'draft',
    demo: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
  }));

  await batch.commit();
}

// Bootstrap user profile & authorization
export async function syncUserProfile(uid: string, email: string, displayName?: string): Promise<UserProfile> {
  const fallbackProfile: UserProfile = {
    uid,
    email: email || 'admin@glowzaabd.shop',
    displayName: displayName || (email ? email.split('@')[0] : 'Admin'),
    role: 'admin',
    active: true,
    createdAt: new Date().toISOString(),
  };

  try {
    const d = requireDb();
    const userRef = doc(d, 'users', uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      const newProfile: UserProfile = {
        uid,
        email: email || 'admin@glowzaabd.shop',
        displayName: displayName || (email ? email.split('@')[0] : 'Admin'),
        role: 'admin',
        active: true,
        createdAt: serverTimestamp(),
      };

      await setDoc(userRef, cleanObject(newProfile));
      return newProfile;
    }

    const existing = snap.data() as UserProfile;
    if (existing.role !== 'admin') {
      await updateDoc(userRef, cleanObject({ role: 'admin', active: true }));
      existing.role = 'admin';
      existing.active = true;
    }

    return existing;
  } catch {
    return fallbackProfile;
  }
}

// Reset all website data across collections with chunked batch processing
export async function resetAllWebsiteData(uid: string, email?: string) {
  const d = requireDb();
  const collectionsToClear = ['entries', 'investors', 'products', 'profitDistributions', 'auditLogs'];
  const summary: Record<string, number> = {};

  for (const colName of collectionsToClear) {
    try {
      const snap = await getDocs(collection(d, colName));
      summary[colName] = snap.size;
      const docs = snap.docs;
      const chunkSize = 400;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(d);
        for (const docSnap of chunk) {
          batch.delete(docSnap.ref);
        }
        await batch.commit();
      }
    } catch (err) {
      console.warn(`Error clearing collection ${colName}:`, err);
    }
  }

  // Clear local caches when resetting website data
  try {
    Object.values(CACHE_KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('glowzaa_approval_requests_cache');
  } catch {}

  // Create a fresh audit log entry for the reset action
  try {
    await addDoc(collection(d, 'auditLogs'), cleanObject({
      action: 'reset_all_data',
      recordId: 'all',
      actor: uid,
      actorEmail: email || '',
      reason: 'Full website data reset by admin',
      createdAt: serverTimestamp(),
      details: summary,
    }));
  } catch (err) {
    console.warn('Could not write reset audit log:', err);
  }
}

export interface AdminAuthDoc {
  rakibPassword?: string;
  limonPassword?: string;
  rakibAvatar?: string;
  limonAvatar?: string;
  updatedAt?: any;
}

// Get admin passwords and avatars from Firestore with local fallback
export async function getAdminAuthData(): Promise<{
  rakib: string;
  limon: string;
  rakibAvatar?: string;
  limonAvatar?: string;
}> {
  const local = localStorage.getItem('glowzaa_admin_auth');
  const fallback: { rakib: string; limon: string; rakibAvatar?: string; limonAvatar?: string } = {
    rakib: 'G120',
    limon: 'G120',
    rakibAvatar: '',
    limonAvatar: '',
  };
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (parsed.rakib) fallback.rakib = parsed.rakib;
      if (parsed.limon) fallback.limon = parsed.limon;
      if (parsed.rakibAvatar) fallback.rakibAvatar = parsed.rakibAvatar;
      if (parsed.limonAvatar) fallback.limonAvatar = parsed.limonAvatar;
    } catch {}
  }

  try {
    const d = requireDb();
    const docRef = doc(d, 'businessSettings', 'adminAuth');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AdminAuthDoc;
      const res = {
        rakib: data.rakibPassword || fallback.rakib || 'G120',
        limon: data.limonPassword || fallback.limon || 'G120',
        rakibAvatar: data.rakibAvatar ?? fallback.rakibAvatar ?? '',
        limonAvatar: data.limonAvatar ?? fallback.limonAvatar ?? '',
      };
      localStorage.setItem('glowzaa_admin_auth', JSON.stringify(res));
      return res;
    } else {
      await setDoc(docRef, cleanObject({
        rakibPassword: fallback.rakib || 'G120',
        limonPassword: fallback.limon || 'G120',
        rakibAvatar: fallback.rakibAvatar || '',
        limonAvatar: fallback.limonAvatar || '',
        updatedAt: serverTimestamp(),
      }));
      return fallback;
    }
  } catch (e) {
    console.warn('Could not read adminAuth from Firestore, using local cache:', e);
    return fallback;
  }
}

// Update admin personal password in Firestore and localStorage
export async function updateAdminPasswordInDb(
  admin: 'Rakib' | 'Limon',
  newPass: string,
  uid?: string
): Promise<void> {
  const current = await getAdminAuthData();
  const updated = {
    ...current,
    rakib: admin === 'Rakib' ? newPass : current.rakib,
    limon: admin === 'Limon' ? newPass : current.limon,
  };

  localStorage.setItem('glowzaa_admin_auth', JSON.stringify(updated));

  try {
    const d = requireDb();
    const docRef = doc(d, 'businessSettings', 'adminAuth');
    await setDoc(
      docRef,
      cleanObject({
        rakibPassword: updated.rakib || 'G120',
        limonPassword: updated.limon || 'G120',
        updatedAt: serverTimestamp(),
        lastUpdatedBy: admin || uid || 'admin',
      }),
      { merge: true }
    );

    await addDoc(collection(d, 'auditLogs'), cleanObject({
      action: 'admin_password_change',
      recordId: admin.toLowerCase(),
      actor: uid || admin || 'admin',
      actorEmail: `${admin.toLowerCase()}@glowzaa.shop`,
      reason: `${admin} updated personal admin password`,
      createdAt: serverTimestamp(),
    }));
  } catch (err) {
    console.warn('Firestore password update warning:', err);
  }
}

// Update admin profile photo in Firestore and localStorage
export async function updateAdminAvatarInDb(
  admin: 'Rakib' | 'Limon',
  avatarDataUrl: string,
  uid?: string
): Promise<void> {
  const current = await getAdminAuthData();
  const updated = {
    ...current,
    rakibAvatar: admin === 'Rakib' ? avatarDataUrl : (current.rakibAvatar || ''),
    limonAvatar: admin === 'Limon' ? avatarDataUrl : (current.limonAvatar || ''),
  };

  localStorage.setItem('glowzaa_admin_auth', JSON.stringify(updated));

  try {
    const d = requireDb();
    const docRef = doc(d, 'businessSettings', 'adminAuth');
    await setDoc(
      docRef,
      cleanObject({
        rakibAvatar: updated.rakibAvatar || '',
        limonAvatar: updated.limonAvatar || '',
        updatedAt: serverTimestamp(),
        lastUpdatedBy: admin || uid || 'admin',
      }),
      { merge: true }
    );
  } catch (err) {
    console.warn('Firestore avatar update warning:', err);
  }
}

// Ensure Rakib and Limon have partner records in investors collection
export async function ensureAdminInvestors(uid: string): Promise<void> {
  try {
    const d = requireDb();
    const snap = await getDocs(collection(d, 'investors'));
    const names = snap.docs.map((d) => (d.data() as Investor).name.toLowerCase());

    const hasRakib = names.some((n) => n.includes('rakib') || n.includes('রাকিব'));
    const hasLimon = names.some((n) => n.includes('limon') || n.includes('লিমন'));

    const batch = writeBatch(d);
    let needCommit = false;

    if (!hasRakib) {
      const ref = doc(collection(d, 'investors'));
      batch.set(ref, cleanObject({
        name: 'Rakib (অ্যাডমিন)',
        phone: '০১৭১১-০১২২৩৩',
        active: true,
        equityShare: 50,
        createdAt: serverTimestamp(),
      }));
      needCommit = true;
    }

    if (!hasLimon) {
      const ref = doc(collection(d, 'investors'));
      batch.set(ref, cleanObject({
        name: 'Limon (অ্যাডমিন)',
        phone: '০১৮১৯-৪৫৫৬৬৭',
        active: true,
        equityShare: 50,
        createdAt: serverTimestamp(),
      }));
      needCommit = true;
    }

    if (needCommit) {
      await batch.commit();
    }
  } catch (e) {
    console.warn('Could not ensure admin investors in Firestore:', e);
  }
}

// -------------------------------------------------------------
// DUAL-ADMIN APPROVAL WORKFLOW (Rakib & Limon 4-Eyes Principle)
// -------------------------------------------------------------

const LOCAL_STORAGE_APPROVALS_KEY = 'glowzaa_approval_requests_cache';

export function getLocalApprovalRequests(): ApprovalRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_APPROVALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLocalApprovalRequests(reqs: ApprovalRequest[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_APPROVALS_KEY, JSON.stringify(reqs));
  } catch (e) {
    console.warn('Could not cache approvals locally', e);
  }
}

export function watchApprovalRequests(
  cb: (rows: ApprovalRequest[]) => void,
  error: (e: Error) => void
): Unsubscribe {
  // Pre-load from local storage
  const cached = getLocalApprovalRequests();
  if (cached.length > 0) {
    cb(cached);
  }

  if (!db) {
    return () => {};
  }

  const path = 'approvalRequests';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ApprovalRequest, 'id'>) }))
        .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
      saveLocalApprovalRequests(rows);
      cb(rows);
    },
    (err) => {
      console.warn('Firestore approval listener error:', err);
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        error(e as Error);
      }
    }
  );
}

// Create a new Dual-Approval Request (Maker submits)
export async function createApprovalRequest(
  data: Omit<ApprovalRequest, 'id' | 'createdAt'>
): Promise<string> {
  const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();
  const formattedTime = formatBengaliDateTime(now);

  const cleanReq = cleanObject({
    ...data,
    requestedAt: data.requestedAt || now.toISOString(),
    requestedAtFormatted: data.requestedAtFormatted || formattedTime,
    createdAt: serverTimestamp(),
  });

  // Always save in local storage first
  const current = getLocalApprovalRequests();
  const newRow: ApprovalRequest = { id: reqId, ...(cleanReq as any) };
  saveLocalApprovalRequests([newRow, ...current.filter((r) => r.id !== reqId)]);

  if (db) {
    try {
      const d = db;
      const batch = writeBatch(d);
      const reqRef = doc(d, 'approvalRequests', reqId);
      batch.set(reqRef, cleanReq);

      // Record in immutable Audit Logs
      const auditRef = doc(collection(d, 'auditLogs'));
      batch.set(auditRef, cleanObject({
        action: `request_${data.actionType}`,
        recordId: reqId,
        actor: data.requestedBy,
        actorEmail: `${data.requestedBy.toLowerCase()}@glowzaa.shop`,
        maker: data.requestedBy,
        makerName: data.requestedByName,
        approver: data.targetApprover,
        approverName: data.targetApproverName,
        formattedTime,
        reason: data.reason || 'অনুরোধ তৈরি করা হয়েছে',
        createdAt: serverTimestamp(),
        details: cleanObject({
          title: data.title,
          description: data.description,
          actionType: data.actionType,
          targetCollection: data.targetCollection,
          targetId: data.targetId || null,
          payload: data.payload,
          previousData: data.previousData || null,
        }),
      }));

      await batch.commit();
    } catch (e) {
      console.error('Error saving approval request to Firestore:', e);
    }
  }

  // Trigger Backend Email Summary to Rakib & Limon if:
  // 1) A high-value withdrawal or special loan request is created (or any withdrawal request >= threshold)
  // 2) Or if notifyOnAllTransactionRequests is enabled for a new transaction request
  if (data.actionType === 'create_entry' && data.payload) {
    const pType = String(data.payload.type || '');
    const pAmount = Number(data.payload.amount) || 0;
    const emailCfg = getEmailTriggerConfig();
    const isWithdrawalOrLoan = pType === 'withdrawal' || pType === 'loan';
    const isHighValue = isWithdrawalOrLoan && pAmount >= (emailCfg.highValueWithdrawalThreshold || 5000);

    if (isHighValue && emailCfg.notifyOnHighValueWithdrawal) {
      const invList = getCachedInvestors();
      const matchedPartner = data.payload.investorId
        ? invList.find((i) => i.id === data.payload.investorId)?.name
        : data.requestedByName;

      triggerBackendEmailSummary({
        eventType: 'high_value_withdrawal_request',
        title: data.title || data.payload.title || 'উচ্চ-মূল্যের উত্তোলনের অনুরোধ',
        entryType: pType,
        amount: pAmount,
        date: data.payload.date || now.toISOString().slice(0, 10),
        actorName: data.requestedByName,
        approverName: `${data.targetApproverName} (অনুমোদন অপেক্ষমান)`,
        partnerName: matchedPartner,
        category: data.payload.category,
        reason: data.reason,
        notes: data.payload.notes || data.description,
      }).catch((err) => console.warn('High-value withdrawal email trigger warning:', err));
    } else if (emailCfg.notifyOnAllTransactionRequests) {
      triggerBackendEmailSummary({
        eventType: isWithdrawalOrLoan ? 'high_value_withdrawal_request' : 'transaction_posted',
        title: `[অনুমোদনের অনুরোধ] ${data.title}`,
        entryType: pType,
        amount: pAmount,
        date: data.payload.date || now.toISOString().slice(0, 10),
        actorName: data.requestedByName,
        approverName: `${data.targetApproverName} (অনুমোদন অপেক্ষমান)`,
        category: data.payload.category,
        reason: data.reason,
        notes: data.payload.notes || data.description,
      }).catch((err) => console.warn('Transaction request email trigger warning:', err));
    }
  }

  return reqId;
}

// Approve & execute a Dual-Approval Request (Checker approves)
export async function approveApprovalRequest(
  req: ApprovalRequest,
  reviewer: 'Rakib' | 'Limon',
  reviewerName: string,
  reviewNote?: string
): Promise<void> {
  // STRICT RULE: An admin CANNOT approve their own request!
  if (req.requestedBy === reviewer) {
    throw new Error('আপনি নিজের অনুরোধ নিজেই অনুমোদন করতে পারবেন না! অপর অ্যাডমিনের অনুমোদন আবশ্যক।');
  }

  const now = new Date();
  const approvedAtFormatted = formatBengaliDateTime(now);

  // 1. Execute the actual underlying action
  switch (req.actionType) {
    case 'create_entry':
      await addEntry(
        req.payload,
        req.requestedBy,
        `${req.requestedBy.toLowerCase()}@glowzaa.shop`,
        reviewerName
      );
      break;

    case 'edit_entry':
      if (req.targetId) {
        await updateEntry(
          req.targetId,
          req.payload,
          req.requestedBy,
          `${req.requestedBy.toLowerCase()}@glowzaa.shop`
        );
      }
      break;

    case 'delete_entry':
      if (req.targetId) {
        await removeEntry(
          req.targetId,
          req.requestedBy,
          `${req.requestedBy.toLowerCase()}@glowzaa.shop`
        );
      }
      break;

    case 'create_product':
      if (Array.isArray(req.payload?.batchProducts)) {
        for (const item of req.payload.batchProducts) {
          await addProduct(item);
        }
      } else {
        await addProduct(req.payload);
      }
      break;

    case 'edit_product':
      if (req.targetId) {
        await updateProduct(
          req.targetId,
          req.payload,
          req.requestedBy,
          `${req.requestedBy.toLowerCase()}@glowzaa.shop`
        );
      }
      break;

    case 'delete_product':
      if (req.targetId) {
        await removeProduct(
          req.targetId,
          req.requestedBy,
          `${req.requestedBy.toLowerCase()}@glowzaa.shop`
        );
      }
      break;

    case 'create_investor':
      await addInvestor(req.payload);
      break;

    case 'edit_investor':
      if (req.targetId) {
        await updateInvestor(
          req.targetId,
          req.payload,
          req.requestedBy,
          `${req.requestedBy.toLowerCase()}@glowzaa.shop`
        );
      }
      break;

    case 'delete_investor':
      if (req.targetId) {
        await removeInvestor(
          req.targetId,
          req.requestedBy,
          `${req.requestedBy.toLowerCase()}@glowzaa.shop`
        );
      }
      break;

    case 'distribute_profit':
      await addProfitDistribution(
        req.payload,
        req.requestedBy
      );
      break;

    case 'delete_distribution':
      if (req.targetId) {
        await removeProfitDistribution(
          req.targetId,
          req.requestedBy,
          `${req.requestedBy.toLowerCase()}@glowzaa.shop`
        );
      }
      break;

    case 'record_waste': {
      const { productId, quantity, lossAmount, reason, productName, unit, date, notes } = req.payload || {};
      const d = requireDb();
      if (productId && quantity > 0) {
        const prodRef = doc(d, 'products', productId);
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          const curStock = (prodSnap.data() as Product).currentStock || 0;
          const newStock = Math.max(0, curStock - Number(quantity));
          await updateDoc(prodRef, cleanObject({
            currentStock: newStock,
            updatedAt: serverTimestamp(),
          }));
        }
      }
      // Record expense entry for the spoiled/broken item so net profit reflects this loss accurately
      await addEntry(
        {
          type: 'expense',
          title: `নষ্ট পণ্য ক্ষতি: ${productName || 'পণ্য'} (${quantity} ${unit || 'পিস'})`,
          amount: Number(lossAmount) || 0,
          date: date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }),
          status: 'posted',
          productId: productId || undefined,
          quantity: Number(quantity) || undefined,
          category: 'নষ্ট/ক্ষতিগ্রস্থ পণ্য',
          notes: `নষ্টের কারণ: ${reason || 'ক্ষতিগ্রস্থ'}${notes ? ` | নোট: ${notes}` : ''} (অনুমোদনকারী: ${reviewerName})`,
          demo: false,
        },
        req.requestedBy,
        `${req.requestedBy.toLowerCase()}@glowzaa.shop`
      );
      break;
    }
  }

  // 2. Mark the approval request as approved in Firestore and Audit Logs
  if (db) {
    try {
      const d = db;
      const batch = writeBatch(d);
      const reqRef = doc(d, 'approvalRequests', req.id);

      batch.update(reqRef, cleanObject({
        status: 'approved',
        reviewedBy: reviewer,
        reviewedByName: reviewerName,
        reviewedAt: now.toISOString(),
        reviewedAtFormatted: approvedAtFormatted,
        reviewNote: reviewNote || 'অনুমোদিত ও ওয়েবসাইটে কার্যকর করা হয়েছে।',
        updatedAt: serverTimestamp(),
      }));

      // High-priority dual-approval immutable audit trail
      const auditRef = doc(collection(d, 'auditLogs'));
      batch.set(auditRef, cleanObject({
        action: `dual_approved_${req.actionType}`,
        recordId: req.targetId || req.id,
        actor: reviewer,
        actorEmail: `${reviewer.toLowerCase()}@glowzaa.shop`,
        maker: req.requestedBy,
        makerName: req.requestedByName,
        approver: reviewer,
        approverName: reviewerName,
        formattedTime: req.requestedAtFormatted,
        approvedAtFormatted,
        reason: `[দ্বৈত অনুমোদন সম্পন্ন] ${req.requestedByName} (${req.requestedAtFormatted}) তৈরি করেছিলেন এবং ${reviewerName} (${approvedAtFormatted}) অনুমোদন দিয়েছেন।`,
        createdAt: serverTimestamp(),
        details: {
          title: req.title,
          actionType: req.actionType,
          targetCollection: req.targetCollection,
          targetId: req.targetId || null,
          maker: req.requestedBy,
          makerTime: req.requestedAtFormatted,
          approver: reviewer,
          approverTime: approvedAtFormatted,
          makerReason: req.reason,
          approverNote: reviewNote || '',
          payload: req.payload,
          previousData: req.previousData || null,
        },
      }));

      await batch.commit();
    } catch (e) {
      console.warn('Error recording approval in Firestore:', e);
    }
  }

  // Update local cache
  const localList = getLocalApprovalRequests();
  const updated = localList.map((r) =>
    r.id === req.id
      ? {
          ...r,
          status: 'approved' as const,
          reviewedBy: reviewer,
          reviewedByName: reviewerName,
          reviewedAt: now.toISOString(),
          reviewedAtFormatted: approvedAtFormatted,
          reviewNote: reviewNote || 'অনুমোদিত',
        }
      : r
  );
  saveLocalApprovalRequests(updated);
}

// Reject a Dual-Approval Request
export async function rejectApprovalRequest(
  req: ApprovalRequest,
  reviewer: 'Rakib' | 'Limon',
  reviewerName: string,
  reason: string
): Promise<void> {
  // STRICT RULE: An admin CANNOT reject their own request!
  if (req.requestedBy === reviewer) {
    throw new Error('আপনি নিজের অনুরোধ প্রত্যাখ্যান করতে পারবেন না! এটি অপর অ্যাডমিনের এখতিয়ার।');
  }

  const now = new Date();
  const rejectedAtFormatted = formatBengaliDateTime(now);

  if (db) {
    try {
      const d = db;
      const batch = writeBatch(d);
      const reqRef = doc(d, 'approvalRequests', req.id);

      batch.update(reqRef, cleanObject({
        status: 'rejected',
        reviewedBy: reviewer,
        reviewedByName: reviewerName,
        reviewedAt: now.toISOString(),
        reviewedAtFormatted: rejectedAtFormatted,
        reviewNote: reason,
        updatedAt: serverTimestamp(),
      }));

      // Record rejection in Audit Log
      const auditRef = doc(collection(d, 'auditLogs'));
      batch.set(auditRef, cleanObject({
        action: `dual_rejected_${req.actionType}`,
        recordId: req.targetId || req.id,
        actor: reviewer,
        actorEmail: `${reviewer.toLowerCase()}@glowzaa.shop`,
        maker: req.requestedBy,
        makerName: req.requestedByName,
        approver: reviewer,
        approverName: reviewerName,
        formattedTime: req.requestedAtFormatted,
        approvedAtFormatted: rejectedAtFormatted,
        reason: `[অনুরোধ বাতিল/প্রত্যাখ্যাত] কারণ: ${reason}`,
        createdAt: serverTimestamp(),
        details: {
          title: req.title,
          actionType: req.actionType,
          targetCollection: req.targetCollection,
          targetId: req.targetId || null,
          maker: req.requestedBy,
          makerTime: req.requestedAtFormatted,
          rejecter: reviewer,
          rejecterTime: rejectedAtFormatted,
          rejectionReason: reason,
          makerReason: req.reason,
          payload: req.payload,
          previousData: req.previousData || null,
        },
      }));

      await batch.commit();
    } catch (e) {
      console.warn('Error recording rejection in Firestore:', e);
    }
  }

  // Update local cache
  const localList = getLocalApprovalRequests();
  const updated = localList.map((r) =>
    r.id === req.id
      ? {
          ...r,
          status: 'rejected' as const,
          reviewedBy: reviewer,
          reviewedByName: reviewerName,
          reviewedAt: now.toISOString(),
          reviewedAtFormatted: rejectedAtFormatted,
          reviewNote: reason,
        }
      : r
  );
  saveLocalApprovalRequests(updated);
}

// -------------------------------------------------------------
// BACKEND EMAIL NOTIFICATION TRIGGER & CONFIGURATION HELPERS
// -------------------------------------------------------------

const EMAIL_CONFIG_STORAGE_KEY = 'glowzaa_email_trigger_config_v1';
const EMAIL_LOGS_STORAGE_KEY = 'glowzaa_email_logs_cache_v1';

export const DEFAULT_EMAIL_TRIGGER_CONFIG: EmailTriggerConfig = {
  rakibEmail: 'rakib.glowzaa@gmail.com',
  limonEmail: 'limon.glowzaa@gmail.com',
  ccEmail: 'glowzaabd.shop@gmail.com',
  highValueWithdrawalThreshold: 5000,
  notifyOnTransactionPosted: true,
  notifyOnHighValueWithdrawal: true,
  notifyOnAllTransactionRequests: false,
};

export function getEmailTriggerConfig(): EmailTriggerConfig {
  try {
    const raw = localStorage.getItem(EMAIL_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EMAIL_TRIGGER_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      rakibEmail: parsed.rakibEmail || DEFAULT_EMAIL_TRIGGER_CONFIG.rakibEmail,
      limonEmail: parsed.limonEmail || DEFAULT_EMAIL_TRIGGER_CONFIG.limonEmail,
      ccEmail: parsed.ccEmail ?? DEFAULT_EMAIL_TRIGGER_CONFIG.ccEmail,
      highValueWithdrawalThreshold:
        Number(parsed.highValueWithdrawalThreshold) > 0
          ? Number(parsed.highValueWithdrawalThreshold)
          : DEFAULT_EMAIL_TRIGGER_CONFIG.highValueWithdrawalThreshold,
      notifyOnTransactionPosted:
        typeof parsed.notifyOnTransactionPosted === 'boolean'
          ? parsed.notifyOnTransactionPosted
          : DEFAULT_EMAIL_TRIGGER_CONFIG.notifyOnTransactionPosted,
      notifyOnHighValueWithdrawal:
        typeof parsed.notifyOnHighValueWithdrawal === 'boolean'
          ? parsed.notifyOnHighValueWithdrawal
          : DEFAULT_EMAIL_TRIGGER_CONFIG.notifyOnHighValueWithdrawal,
      notifyOnAllTransactionRequests:
        typeof parsed.notifyOnAllTransactionRequests === 'boolean'
          ? parsed.notifyOnAllTransactionRequests
          : DEFAULT_EMAIL_TRIGGER_CONFIG.notifyOnAllTransactionRequests,
      updatedBy: parsed.updatedBy,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { ...DEFAULT_EMAIL_TRIGGER_CONFIG };
  }
}

export async function loadEmailTriggerConfigFromDb(): Promise<EmailTriggerConfig> {
  const local = getEmailTriggerConfig();
  if (!db) return local;
  try {
    const snap = await getDoc(doc(db, 'businessSettings', 'emailConfig'));
    if (snap.exists()) {
      const data = snap.data() as Partial<EmailTriggerConfig>;
      const merged: EmailTriggerConfig = {
        rakibEmail: data.rakibEmail || local.rakibEmail,
        limonEmail: data.limonEmail || local.limonEmail,
        ccEmail: data.ccEmail ?? local.ccEmail,
        highValueWithdrawalThreshold:
          Number(data.highValueWithdrawalThreshold) > 0
            ? Number(data.highValueWithdrawalThreshold)
            : local.highValueWithdrawalThreshold,
        notifyOnTransactionPosted:
          typeof data.notifyOnTransactionPosted === 'boolean'
            ? data.notifyOnTransactionPosted
            : local.notifyOnTransactionPosted,
        notifyOnHighValueWithdrawal:
          typeof data.notifyOnHighValueWithdrawal === 'boolean'
            ? data.notifyOnHighValueWithdrawal
            : local.notifyOnHighValueWithdrawal,
        notifyOnAllTransactionRequests:
          typeof data.notifyOnAllTransactionRequests === 'boolean'
            ? data.notifyOnAllTransactionRequests
            : local.notifyOnAllTransactionRequests,
      };
      localStorage.setItem(EMAIL_CONFIG_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (e) {
    console.warn('Could not read emailConfig from Firestore:', e);
  }
  return local;
}

export async function saveEmailTriggerConfig(
  cfg: EmailTriggerConfig,
  actorUid: string
): Promise<EmailTriggerConfig> {
  const normalized: EmailTriggerConfig = {
    rakibEmail: (cfg.rakibEmail || DEFAULT_EMAIL_TRIGGER_CONFIG.rakibEmail).trim(),
    limonEmail: (cfg.limonEmail || DEFAULT_EMAIL_TRIGGER_CONFIG.limonEmail).trim(),
    ccEmail: (cfg.ccEmail || '').trim(),
    highValueWithdrawalThreshold: Math.max(100, Number(cfg.highValueWithdrawalThreshold) || 5000),
    notifyOnTransactionPosted: Boolean(cfg.notifyOnTransactionPosted),
    notifyOnHighValueWithdrawal: Boolean(cfg.notifyOnHighValueWithdrawal),
    notifyOnAllTransactionRequests: Boolean(cfg.notifyOnAllTransactionRequests),
    updatedBy: actorUid,
  };

  try {
    localStorage.setItem(EMAIL_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}

  if (db) {
    try {
      await setDoc(
        doc(db, 'businessSettings', 'emailConfig'),
        cleanObject({
          ...normalized,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    } catch (e) {
      console.warn('Could not save emailConfig to Firestore:', e);
    }
  }

  return normalized;
}

export function getLocalEmailLogs(): EmailNotificationLog[] {
  try {
    const raw = localStorage.getItem(EMAIL_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalEmailLogs(logs: EmailNotificationLog[]) {
  try {
    localStorage.setItem(EMAIL_LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 50)));
  } catch {}
}

type EmailLogSubscriber = (logs: EmailNotificationLog[]) => void;
const emailLogSubscribers = new Set<EmailLogSubscriber>();

export function subscribeEmailLogs(cb: EmailLogSubscriber): () => void {
  emailLogSubscribers.add(cb);
  cb(getLocalEmailLogs());
  return () => {
    emailLogSubscribers.delete(cb);
  };
}

function notifyEmailLogSubscribers(logs: EmailNotificationLog[]) {
  emailLogSubscribers.forEach((cb) => {
    try {
      cb(logs);
    } catch {}
  });
}

export async function fetchBackendEmailHistory(): Promise<{
  logs: EmailNotificationLog[];
  smtpConfigured: boolean;
}> {
  const localLogs = getLocalEmailLogs();
  try {
    const res = await fetch('/api/notifications/history');
    if (res.ok) {
      const data = await res.json();
      const serverLogs: EmailNotificationLog[] = Array.isArray(data.logs) ? data.logs : [];
      const mergedMap = new Map<string, EmailNotificationLog>();
      for (const item of [...serverLogs, ...localLogs]) {
        if (item && item.id && !mergedMap.has(item.id)) {
          mergedMap.set(item.id, item);
        }
      }
      const merged = Array.from(mergedMap.values()).sort((a, b) =>
        (b.sentAt || '').localeCompare(a.sentAt || '')
      );
      saveLocalEmailLogs(merged);
      notifyEmailLogSubscribers(merged);
      return {
        logs: merged,
        smtpConfigured: Boolean(data.smtpConfigured),
      };
    }
  } catch (e) {
    console.warn('Could not fetch backend email history:', e);
  }
  return { logs: localLogs, smtpConfigured: false };
}

export async function triggerBackendEmailSummary(params: {
  eventType: 'transaction_posted' | 'high_value_withdrawal_request' | 'test_summary';
  title: string;
  entryType?: string;
  amount: number;
  date?: string;
  actorName?: string;
  approverName?: string;
  partnerName?: string;
  category?: string;
  notes?: string;
  reason?: string;
  profitAmount?: number;
  costAmount?: number;
  pendingAddedEntry?: Entry;
}): Promise<EmailNotificationLog | null> {
  const cfg = getEmailTriggerConfig();

  if (params.eventType === 'transaction_posted' && !cfg.notifyOnTransactionPosted) {
    return null;
  }
  if (params.eventType === 'high_value_withdrawal_request' && !cfg.notifyOnHighValueWithdrawal) {
    return null;
  }

  // Compute live financial summary including the newly posted entry if provided
  const cachedEntries = getCachedEntries();
  const cachedProducts = getCachedProducts();
  const entriesForCalc = params.pendingAddedEntry
    ? [params.pendingAddedEntry, ...cachedEntries.filter((e) => e.id !== params.pendingAddedEntry?.id)]
    : cachedEntries;

  const cashSnap = calculateCashBalance(entriesForCalc, cachedProducts);

  const response = await fetch('/api/notifications/trigger-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: params.eventType,
      title: params.title,
      entryType: params.entryType || 'sale',
      amount: params.amount,
      date: params.date,
      actorName: params.actorName,
      approverName: params.approverName,
      partnerName: params.partnerName,
      category: params.category,
      notes: params.notes,
      reason: params.reason,
      profitAmount: params.profitAmount,
      costAmount: params.costAmount,
      highValueThreshold: cfg.highValueWithdrawalThreshold,
      recipients: {
        rakibEmail: cfg.rakibEmail,
        limonEmail: cfg.limonEmail,
        ccEmail: cfg.ccEmail,
      },
      financialSummary: {
        availableCash: cashSnap.availableCash,
        totalInvestments: cashSnap.totalInvestments,
        netProfit: cashSnap.netProfit,
        totalWithdrawals: cashSnap.totalWithdrawals + cashSnap.totalLoans,
        totalSales: cashSnap.totalSales,
        totalExpenses: cashSnap.totalExpenses,
      },
    }),
  });

  if (!response.ok) {
    throw new Error('ইমেইল ট্রিগার সার্ভারে পাঠানো যায়নি');
  }

  const data = await response.json();
  if (data.ok && data.emailLog) {
    const newLog: EmailNotificationLog = data.emailLog;
    const updatedLogs = [newLog, ...getLocalEmailLogs().filter((l) => l.id !== newLog.id)].slice(0, 50);
    saveLocalEmailLogs(updatedLogs);
    notifyEmailLogSubscribers(updatedLogs);

    // Also record in Firestore Audit Logs for full partner transparency
    if (db) {
      try {
        await addDoc(
          collection(db, 'auditLogs'),
          cleanObject({
            action:
              params.eventType === 'high_value_withdrawal_request'
                ? 'email_alert_high_withdrawal'
                : params.eventType === 'test_summary'
                ? 'email_test_summary'
                : 'email_summary_transaction',
            recordId: newLog.id,
            actor: params.actorName || 'Backend Trigger',
            actorEmail: `${cfg.rakibEmail}, ${cfg.limonEmail}`,
            formattedTime: newLog.sentAtFormatted,
            reason: `📧 ইমেইল সারাংশ পাঠানো হয়েছে (প্রাপক: Rakib ও Limon) — ${newLog.subject}`,
            createdAt: serverTimestamp(),
            details: {
              title: newLog.title,
              subject: newLog.subject,
              recipients: newLog.recipients,
              amount: newLog.amount,
              eventType: newLog.eventType,
              deliveryMode: newLog.deliveryMode,
            },
          })
        );
      } catch (e) {
        console.warn('Could not write email audit log:', e);
      }
    }

    return newLog;
  }

  return null;
}

// ============================================================================
// AI BUSINESS ASSISTANT CONVERSATION HISTORY & AUDIT LOGGING
// ============================================================================
const AI_CHAT_CACHE_PREFIX = 'glowzaa_ai_chats_v1_';

export function getCachedAiChatSessions(ownerId: string): AiChatSession[] {
  const safeOwner = (ownerId || 'Rakib').trim();
  return readCache<AiChatSession>(`${AI_CHAT_CACHE_PREFIX}${safeOwner}`);
}

function writeCachedAiChatSessions(ownerId: string, sessions: AiChatSession[]) {
  const safeOwner = (ownerId || 'Rakib').trim();
  writeCache(`${AI_CHAT_CACHE_PREFIX}${safeOwner}`, sessions.slice(0, 40));
}

export function watchAiChatSessions(
  ownerId: string,
  cb: (sessions: AiChatSession[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const safeOwner = (ownerId || 'Rakib').trim();
  const cached = getCachedAiChatSessions(safeOwner);
  if (cached.length > 0) {
    cb(cached);
  }

  if (!db) {
    cb(cached);
    return () => {};
  }

  const q = query(collection(db, 'aiChatSessions'), where('ownerId', '==', safeOwner));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AiChatSession, 'id'>) }))
        .filter((s) => s.ownerId === safeOwner)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      writeCachedAiChatSessions(safeOwner, rows);
      cb(rows);
    },
    (err) => {
      if (onError) onError(err as Error);
      cb(getCachedAiChatSessions(safeOwner));
    }
  );
}

export async function saveAiChatSession(session: AiChatSession): Promise<void> {
  const safeOwner = (session.ownerId || 'Rakib').trim();
  const existing = getCachedAiChatSessions(safeOwner);
  const updated = [session, ...existing.filter((s) => s.id !== session.id)].sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  writeCachedAiChatSessions(safeOwner, updated);

  if (db) {
    try {
      await setDoc(
        doc(db, 'aiChatSessions', session.id),
        cleanObject({
          ...session,
          ownerId: safeOwner,
          updatedAt: session.updatedAt || new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (e) {
      console.warn('Could not sync AI chat session to Firestore (saved locally):', e);
    }
  }
}

export async function renameAiChatSession(
  sessionId: string,
  ownerId: string,
  newTitle: string
): Promise<void> {
  const safeOwner = (ownerId || 'Rakib').trim();
  const cleanTitle = (newTitle || '').trim() || 'ব্যবসার হিসাব আলোচনা';
  const nowIso = new Date().toISOString();

  const existing = getCachedAiChatSessions(safeOwner).map((s) =>
    s.id === sessionId && s.ownerId === safeOwner
      ? { ...s, title: cleanTitle, updatedAt: nowIso }
      : s
  );
  writeCachedAiChatSessions(safeOwner, existing);

  if (db) {
    try {
      const ref = doc(db, 'aiChatSessions', sessionId);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data()?.ownerId === safeOwner) {
        await updateDoc(ref, {
          title: cleanTitle,
          updatedAt: nowIso,
        });
      }
    } catch (e) {
      console.warn('Could not rename AI chat session in Firestore:', e);
    }
  }
}

export async function deleteAiChatSession(sessionId: string, ownerId: string): Promise<void> {
  const safeOwner = (ownerId || 'Rakib').trim();
  const filtered = getCachedAiChatSessions(safeOwner).filter(
    (s) => !(s.id === sessionId && s.ownerId === safeOwner)
  );
  writeCachedAiChatSessions(safeOwner, filtered);

  if (db) {
    try {
      const ref = doc(db, 'aiChatSessions', sessionId);
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data()?.ownerId === safeOwner) {
        await deleteDoc(ref);
      }
    } catch (e) {
      console.warn('Could not delete AI chat session from Firestore:', e);
    }
  }
}

export async function recordAiAssistantAuditLog(params: {
  actor: string;
  actorName: string;
  question: string;
  toolUsed: string;
  dateRangeBn: string;
}): Promise<void> {
  if (!db) return;
  try {
    await addDoc(
      collection(db, 'auditLogs'),
      cleanObject({
        action: 'ai_assistant_query',
        recordId: `ai_q_${Date.now()}`,
        actor: params.actorName || params.actor,
        actorEmail: `${(params.actor || 'admin').toLowerCase()}@glowzaa.shop`,
        formattedTime: formatBengaliDateTime(new Date()),
        reason: `🤖 AI Business Assistant প্রশ্ন: "${params.question.slice(0, 120)}" (টুল: ${params.toolUsed} | সময়সীমা: ${params.dateRangeBn})`,
        createdAt: serverTimestamp(),
      })
    );
  } catch {
    // Non-blocking audit log write
  }
}