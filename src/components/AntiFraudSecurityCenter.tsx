import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileWarning,
  Layers,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { deepClean } from '../data';
import { money, dateLabel, toBengaliNumerals, formatBengaliDateTime } from '../accounting';
import { loadPersistedTrayLogs, TRAY_LOGS_UPDATED_EVENT } from './TrayStockRefillModal';
import type { AuditLog, EmployeeAccount, Entry, Product, TrayRefillLogItem } from '../types';

export interface AntiFraudSettings {
  backdatedEntryLockEnabled: boolean; // পুরনো তারিখের এন্ট্রি লক (রাকিব ছাড়া কেউ আগের তারিখে এন্ট্রি দিতে পারবে না)
  mandatoryExpensePhotoEnabled: boolean; // খরচের ভাউচার/রশিদের ছবি বাধ্যতামূলক
  mandatoryExpensePhotoThreshold: number; // কত টাকার উপরে ছবি বাধ্যতামূলক (ডিফল্ট ১০০ টাকা)
  dismissedFlagIds?: string[]; // রাকিব কর্তৃক ডিলিট/পরিষ্কার করা সন্দেহজনক অ্যালার্ট আইডি
  dismissedTrayKeys?: string[]; // রাকিব কর্তৃক পরিষ্কার করা ট্রে গরমিল আইডি
  updatedBy?: string;
  updatedAt?: string;
}

export interface BlindCashCountRecord {
  id: string;
  date: string;
  timestamp: string;
  createdAtMs: number;
  submittedBy: string;
  submittedByName: string;
  submittedByRole: 'admin' | 'employee';
  notesBreakdown: {
    n1000: number;
    n500: number;
    n200: number;
    n100: number;
    n50: number;
    n20: number;
    n10: number;
    n5AndCoins: number;
  };
  physicalDrawerCash: number;
  mobileWalletCash: number;
  totalCountedCash: number;
  expectedSystemCash: number; // শুধুমাত্র রাকিব দেখতে পাবে
  ExpectedTodayNetCash: number;
  difference: number; // totalCountedCash - expectedSystemCash (নেগেটিভ মানে ক্যাশ শর্টেজ)
  comparisonMode: 'today_net' | 'total_drawer';
  note?: string;
}

export interface SurpriseAuditItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  systemMainStock: number;
  systemTrayStock: number;
  expectedTotalStock: number;
  countedPhysicalStock: number;
  missingUnits: number;
  unitPrice: number;
  unitCost: number;
  estimatedLossSellValue: number;
  estimatedLossCostValue: number;
}

export interface SurpriseAuditRecord {
  id: string;
  date: string;
  timestamp: string;
  createdAtMs: number;
  auditedBy: string;
  totalProductsChecked: number;
  discrepancyCount: number;
  totalMissingUnits: number;
  totalLossSellValue: number;
  items: SurpriseAuditItem[];
  note?: string;
}

export interface ShiftHandoverRecord {
  id: string;
  date: string;
  timestamp: string;
  createdAtMs: number;
  outgoingUser: string;
  outgoingUserName: string;
  outgoingRole: 'admin' | 'employee';
  incomingUser: string;
  incomingUserName: string;
  shiftSalesCount: number;
  shiftSalesAmount: number;
  shiftExpensesAmount: number;
  expectedShiftNetCash: number;
  handedOverDrawerCash: number;
  cashDiscrepancy: number; // handedOverDrawerCash - expectedShiftNetCash
  activeTrayCount: number;
  activeTrayTotalPieces: number;
  note?: string;
}

export interface SuspiciousActivityFlagItem {
  id: string;
  severity: 'high' | 'medium';
  category:
    | 'underpriced_sale'
    | 'odd_hour_entry'
    | 'backdated_entry'
    | 'missing_expense_receipt'
    | 'deleted_or_voided'
    | 'cash_shortage'
    | 'tray_mismatch';
  categoryLabelBn: string;
  titleBn: string;
  descriptionBn: string;
  actorName: string;
  date: string;
  timestampBn: string;
  amountOrLoss: number;
  relatedEntry?: Entry;
}

export interface TrayDiscrepancyItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  totalRefilledToTray: number;
  totalReturnedToMain: number;
  totalZeroedAtClose: number;
  currentTrayStock: number;
  netTrayOutflow: number; // ট্রে থেকে বের হওয়া নিট পিস
  recordedSoldQty: number; // বিক্রয় এন্ট্রিতে রেকর্ডকৃত পিস
  unaccountedMissingQty: number; // গরমিল বা নিখোঁজ পিস
  unitPrice: number;
  estimatedMissingValue: number;
  lastUpdatedBy: string;
}

const ANTI_FRAUD_SETTINGS_KEY = 'glowzaa_antifraud_settings_v1';
const BLIND_CASH_LOGS_KEY = 'glowzaa_blind_cash_logs_v1';
const SURPRISE_AUDIT_LOGS_KEY = 'glowzaa_surprise_audit_logs_v1';
const SHIFT_HANDOVER_LOGS_KEY = 'glowzaa_shift_handover_logs_v1';
export const ANTI_FRAUD_UPDATED_EVENT = 'glowzaa_antifraud_updated';

export const DEFAULT_ANTI_FRAUD_SETTINGS: AntiFraudSettings = {
  backdatedEntryLockEnabled: true,
  mandatoryExpensePhotoEnabled: true,
  mandatoryExpensePhotoThreshold: 100,
  dismissedFlagIds: [],
  dismissedTrayKeys: [],
};

export function loadAntiFraudSettings(): AntiFraudSettings {
  try {
    const raw = localStorage.getItem(ANTI_FRAUD_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_ANTI_FRAUD_SETTINGS,
        ...parsed,
      };
    }
  } catch {}
  return DEFAULT_ANTI_FRAUD_SETTINGS;
}

export function loadBlindCashRecords(): BlindCashCountRecord[] {
  try {
    const raw = localStorage.getItem(BLIND_CASH_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function loadSurpriseAuditRecords(): SurpriseAuditRecord[] {
  try {
    const raw = localStorage.getItem(SURPRISE_AUDIT_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function loadShiftHandoverRecords(): ShiftHandoverRecord[] {
  try {
    const raw = localStorage.getItem(SHIFT_HANDOVER_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

async function persistAntiFraudPayloadToFirestore(
  field: 'settings' | 'blindCashLogs' | 'surpriseAuditLogs' | 'shiftHandoverLogs',
  data: any,
  actor: string
) {
  if (!db) return;
  try {
    await setDoc(
      doc(db, 'businessSettings', 'antiFraudCenter'),
      deepClean({
        [field]: data,
        updatedBy: actor,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  } catch (err) {
    console.warn('Anti-fraud Firestore sync warning:', err);
  }
}

export function computeTrayDiscrepancies(
  products: Product[],
  entries: Entry[],
  trayLogs: TrayRefillLogItem[],
  settings?: AntiFraudSettings
): TrayDiscrepancyItem[] {
  const results: TrayDiscrepancyItem[] = [];
  const dismissedSet = new Set(settings?.dismissedTrayKeys || []);

  for (const p of products) {
    const prodLogs = trayLogs.filter((l) => l.productId === p.id);
    const prodSalesEntries = entries.filter(
      (e) => e.status === 'posted' && e.type === 'sale' && e.productId === p.id
    );

    const refilledFromLogs = prodLogs
      .filter((l) => l.actionType === 'scan_refill' || l.actionType === 'tray_setup')
      .reduce((s, l) => s + (Number(l.quantity) || 0), 0);

    const returnedFromLogs = prodLogs
      .filter((l) => l.actionType === 'return_to_stock')
      .reduce((s, l) => s + (Number(l.quantity) || 0), 0);

    const zeroedAtClose = prodLogs
      .filter((l) => l.actionType === 'shop_close_empty')
      .reduce((s, l) => s + (Number(l.quantity) || 0), 0);

    const totalRefilled = Math.max(Number(p.totalTrayRefilled) || 0, refilledFromLogs);
    const currentTray = Number(p.trayStock) || 0;

    if (totalRefilled === 0 && currentTray === 0 && zeroedAtClose === 0) {
      continue;
    }

    const recordedEntrySalesQty = prodSalesEntries.reduce(
      (s, e) => s + (Number(e.quantity) || 0),
      0
    );
    const traySoldStat = Number(p.totalTraySold) || 0;
    const effectiveRecordedSold = Math.max(recordedEntrySalesQty, traySoldStat);

    // Net pieces that left the tray (and did not return to main shelf stock)
    const netTrayOutflow = Math.max(0, totalRefilled - returnedFromLogs - currentTray);

    // Missing pieces = pieces that left the tray without being returned to main stock OR sold
    const unaccountedMissingQty = Math.max(0, netTrayOutflow - effectiveRecordedSold);

    if (unaccountedMissingQty > 0 || zeroedAtClose > effectiveRecordedSold) {
      const finalMissing =
        unaccountedMissingQty > 0
          ? unaccountedMissingQty
          : Math.max(0, zeroedAtClose - effectiveRecordedSold);

      if (finalMissing > 0) {
        const trayKey = `${p.id}:${finalMissing}`;
        if (dismissedSet.has(trayKey) || dismissedSet.has(p.id)) {
          continue;
        }
        const unitPrice = Number(p.sellingPrice) || Number(p.averageCost) || 0;
        results.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku || '—',
          unit: p.unit || 'পিস',
          totalRefilledToTray: totalRefilled,
          totalReturnedToMain: returnedFromLogs,
          totalZeroedAtClose: zeroedAtClose,
          currentTrayStock: currentTray,
          netTrayOutflow,
          recordedSoldQty: effectiveRecordedSold,
          unaccountedMissingQty: finalMissing,
          unitPrice,
          estimatedMissingValue: Math.round(finalMissing * unitPrice * 100) / 100,
          lastUpdatedBy: p.lastTrayUpdatedBy || (prodLogs[0]?.actor ?? 'অজানা'),
        });
      }
    }
  }

  return results.sort((a, b) => b.estimatedMissingValue - a.estimatedMissingValue);
}

export function computeSuspiciousActivities(
  entries: Entry[],
  products: Product[],
  auditLogs: AuditLog[],
  trayLogs: TrayRefillLogItem[],
  blindCashLogs: BlindCashCountRecord[],
  shiftLogs: ShiftHandoverRecord[],
  settings: AntiFraudSettings
): SuspiciousActivityFlagItem[] {
  const flags: SuspiciousActivityFlagItem[] = [];
  const productMap = new Map<string, Product>(products.map((p) => [p.id, p]));

  // 1. Scan Entries for Under-priced sales, Missing Expense Receipt, Backdated or Odd-hour entries, Voided entries
  for (const e of entries) {
    const actor = e.createdBy || e.seller || 'অজানা';
    const createdDateObj =
      e.createdAt && typeof e.createdAt?.toDate === 'function'
        ? e.createdAt.toDate()
        : typeof e.createdAt === 'string' || typeof e.createdAt === 'number'
        ? new Date(e.createdAt)
        : null;

    const timestampBn =
      createdDateObj && !isNaN(createdDateObj.getTime())
        ? formatBengaliDateTime(createdDateObj)
        : dateLabel(e.date);

    // A. Under-priced / Loss Sale Detection
    if (e.status === 'posted' && e.type === 'sale') {
      const prod = e.productId ? productMap.get(e.productId) : undefined;
      const qty = Number(e.quantity) || 1;
      const actualUnitPrice = qty > 0 ? e.amount / qty : e.amount;

      if (prod && prod.sellingPrice > 0 && actualUnitPrice < prod.sellingPrice * 0.85) {
        const expectedTotal = Math.round(qty * prod.sellingPrice * 100) / 100;
        const diffLoss = Math.max(0, expectedTotal - e.amount);
        flags.push({
          id: `underprice-${e.id}`,
          severity: actualUnitPrice < (prod.averageCost || 0) ? 'high' : 'medium',
          category: 'underpriced_sale',
          categoryLabelBn: 'কম দামে বিক্রয় / লোকসান',
          titleBn: `"${prod.name}" নির্ধারিত মূল্যের চেয়ে কম দামে বিক্রয় (${money(e.amount)})`,
          descriptionBn: `নির্ধারিত বিক্রয়মূল্য ${money(prod.sellingPrice)}/${prod.unit} অনুযায়ী ${toBengaliNumerals(qty)} ${prod.unit}-এর দাম হওয়া উচিত ${money(expectedTotal)}, কিন্তু এন্ট্রি করা হয়েছে ${money(e.amount)} (পার্থক্য: ${money(diffLoss)})।`,
          actorName: actor,
          date: e.date,
          timestampBn,
          amountOrLoss: diffLoss,
          relatedEntry: e,
        });
      } else if (
        (e.grossProfit !== undefined && e.grossProfit < 0) ||
        (e.cogsAmount !== undefined && e.amount < e.cogsAmount)
      ) {
        const lossVal = Math.abs(e.grossProfit ?? e.amount - (e.cogsAmount || 0));
        flags.push({
          id: `losssale-${e.id}`,
          severity: 'high',
          category: 'underpriced_sale',
          categoryLabelBn: 'ক্রয়মূল্যের নিচে বিক্রয়',
          titleBn: `ক্রয়মূল্যের চেয়ে কম দামে বিক্রয়: ${e.title}`,
          descriptionBn: `বিক্রয়মূল্য ${money(e.amount)}, কিন্তু ক্রয় খরচ ${money(e.cogsAmount || 0)} — নিট লোকসান ${money(lossVal)}।`,
          actorName: actor,
          date: e.date,
          timestampBn,
          amountOrLoss: lossVal,
          relatedEntry: e,
        });
      }
    }

    // B. High Expense without Receipt Photo
    if (
      e.status === 'posted' &&
      e.type === 'expense' &&
      e.amount >= (settings.mandatoryExpensePhotoThreshold || 100) &&
      !e.receiptImageUrl
    ) {
      flags.push({
        id: `noreceipt-${e.id}`,
        severity: e.amount >= 500 ? 'high' : 'medium',
        category: 'missing_expense_receipt',
        categoryLabelBn: 'ভাউচার ছবি ছাড়া খরচ',
        titleBn: `রশিদ/ভাউচারের ছবি ছাড়া খরচ এন্ট্রি: ${e.title} (${money(e.amount)})`,
        descriptionBn: `${money(settings.mandatoryExpensePhotoThreshold || 100)}-এর বেশি খরচে ভাউচার বা বিলের ছবি সংযুক্ত করা হয়নি।`,
        actorName: actor,
        date: e.date,
        timestampBn,
        amountOrLoss: e.amount,
        relatedEntry: e,
      });
    }

    // C. Odd-hour entry (11:30 PM to 5:59 AM Dhaka Time) or Backdated entry
    if (createdDateObj && !isNaN(createdDateObj.getTime())) {
      const dhakaHourStr = createdDateObj.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Dhaka',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [hh, mm] = dhakaHourStr.split(':').map(Number);
      const totalMins = (hh || 0) * 60 + (mm || 0);
      if (totalMins >= 23 * 60 + 30 || totalMins < 6 * 60) {
        flags.push({
          id: `oddhour-${e.id}`,
          severity: 'medium',
          category: 'odd_hour_entry',
          categoryLabelBn: 'অস্বাভাবিক সময়ে এন্ট্রি',
          titleBn: ` গভীর রাতে/অস্বাভাবিক সময়ে এন্ট্রি: ${e.title} (${money(e.amount)})`,
          descriptionBn: `রাত ১১:৩০ — ভোর ৬:০০ এর মধ্যে (${timestampBn}) এই লেনদেনটি সিস্টেমে এন্ট্রি করা হয়েছে।`,
          actorName: actor,
          date: e.date,
          timestampBn,
          amountOrLoss: e.amount,
          relatedEntry: e,
        });
      }

      const createdDayIso = createdDateObj.toLocaleDateString('en-CA', {
        timeZone: 'Asia/Dhaka',
      });
      if (e.date && createdDayIso && e.date < createdDayIso && actor !== 'Rakib') {
        flags.push({
          id: `backdated-${e.id}`,
          severity: 'high',
          category: 'backdated_entry',
          categoryLabelBn: 'পুরনো তারিখে এন্ট্রি',
          titleBn: `পুরনো তারিখে (${dateLabel(e.date)}) ব্যাকডেটেড এন্ট্রি: ${e.title}`,
          descriptionBn: `এন্ট্রি করা হয়েছে ${dateLabel(createdDayIso)} তারিখে, কিন্তু লেনদেনের তারিখ দেওয়া হয়েছে ${dateLabel(e.date)}।`,
          actorName: actor,
          date: e.date,
          timestampBn,
          amountOrLoss: e.amount,
          relatedEntry: e,
        });
      }
    }

    // D. Voided entry
    if (e.status === 'void') {
      flags.push({
        id: `void-${e.id}`,
        severity: 'medium',
        category: 'deleted_or_voided',
        categoryLabelBn: 'বাতিল (Void) লেনদেন',
        titleBn: `পোস্টেড লেনদেন রিভার্স/বাতিল করা হয়েছে: ${e.title} (${money(e.amount)})`,
        descriptionBn: `কারণ: ${e.voidReason || 'উল্লেখ নেই'} | বাতিলকারী: ${e.voidedBy || actor}`,
        actorName: e.voidedBy || actor,
        date: e.date,
        timestampBn,
        amountOrLoss: e.amount,
        relatedEntry: e,
      });
    }
  }

  // 2. Deleted entries/products from AuditLogs
  for (const log of auditLogs.slice(0, 80)) {
    const act = (log.action || '').toLowerCase();
    if (act.includes('delete') || act.includes('remove') || act.includes('ডিলিট')) {
      flags.push({
        id: `auditdel-${log.id}`,
        severity: 'high',
        category: 'deleted_or_voided',
        categoryLabelBn: 'রেকর্ড ডিলিট অ্যালার্ট',
        titleBn: `সিস্টেম থেকে রেকর্ড ডিলিট: ${log.action}`,
        descriptionBn: `বিবরণ: ${log.reason || 'উল্লেখ নেই'} | রেকর্ড আইডি: ${log.recordId || '—'}`,
        actorName: log.makerName || log.actor || 'অজানা',
        date: (log.formattedTime || '').slice(0, 10) || new Date().toLocaleDateString('en-CA'),
        timestampBn: log.formattedTime || 'সাম্প্রতিক',
        amountOrLoss: Number(log.details?.amount) || 0,
      });
    }
  }

  // 3. Blind Cash Count Shortages
  for (const bc of blindCashLogs) {
    if (bc.difference < 0) {
      const shortage = Math.abs(bc.difference);
      flags.push({
        id: `cashshort-${bc.id}`,
        severity: shortage >= 200 ? 'high' : 'medium',
        category: 'cash_shortage',
        categoryLabelBn: 'ক্যাশ শর্টেজ (ঘাটতি)',
        titleBn: `ব্লাইন্ড ক্যাশ কাউন্টে ${money(shortage)} নগদ ঘাটতি পাওয়া গেছে!`,
        descriptionBn: `${bc.submittedByName} ক্যাশ গুনে জমা দিয়েছেন ${money(bc.totalCountedCash)}, কিন্তু সিস্টেম অনুযায়ী থাকার কথা ছিল ${money(bc.expectedSystemCash)}।`,
        actorName: bc.submittedByName,
        date: bc.date,
        timestampBn: bc.timestamp,
        amountOrLoss: shortage,
      });
    }
  }

  // 4. Shift Handover Shortages
  for (const sh of shiftLogs) {
    if (sh.cashDiscrepancy < 0) {
      const shortage = Math.abs(sh.cashDiscrepancy);
      flags.push({
        id: `shiftshort-${sh.id}`,
        severity: shortage >= 200 ? 'high' : 'medium',
        category: 'cash_shortage',
        categoryLabelBn: 'শিফট হ্যান্ডওভার ক্যাশ ঘাটতি',
        titleBn: `শিফট হস্তান্তরে ${money(shortage)} ক্যাশ কম বুঝিয়ে দেওয়া হয়েছে`,
        descriptionBn: `${sh.outgoingUserName} → ${sh.incomingUserName}: শিফটের নিট ক্যাশ ${money(sh.expectedShiftNetCash)}, কিন্তু ড্রয়ারে বুঝিয়ে দেওয়া হয়েছে ${money(sh.handedOverDrawerCash)}।`,
        actorName: sh.outgoingUserName,
        date: sh.date,
        timestampBn: sh.timestamp,
        amountOrLoss: shortage,
      });
    }
  }

  const dismissedFlagsSet = new Set(settings?.dismissedFlagIds || []);
  return flags.filter((f) => !dismissedFlagsSet.has(f.id));
}

interface AntiFraudSecurityCenterProps {
  mode: 'full_center' | 'blind_cash_modal' | 'shift_handover_modal';
  isRakib: boolean;
  currentAdmin: {
    username: string;
    displayName: string;
    role: 'admin' | 'employee';
  };
  entries: Entry[];
  products: Product[];
  auditLogs: AuditLog[];
  employees: EmployeeAccount[];
  availableBusinessCash: number;
  todayNetCash: number;
  todaySalesAmount: number;
  todaySalesCount: number;
  todayExpensesAmount: number;
  onCloseModal?: () => void;
  onViewEntry?: (entry: Entry) => void;
  onNotifyMessage?: (msg: string) => void;
}

export default function AntiFraudSecurityCenter({
  mode,
  isRakib,
  currentAdmin,
  entries,
  products,
  auditLogs,
  employees,
  availableBusinessCash,
  todayNetCash,
  todaySalesAmount,
  todaySalesCount,
  todayExpensesAmount,
  onCloseModal,
  onViewEntry,
  onNotifyMessage,
}: AntiFraudSecurityCenterProps) {
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

  const [activeSubTab, setActiveSubTab] = useState<
    | 'suspicious_flags'
    | 'tray_discrepancy'
    | 'blind_cash'
    | 'surprise_audit'
    | 'shift_handover'
    | 'receipt_and_locks'
  >('suspicious_flags');

  const [afSettings, setAfSettings] = useState<AntiFraudSettings>(() => loadAntiFraudSettings());
  const [blindCashLogs, setBlindCashLogs] = useState<BlindCashCountRecord[]>(() =>
    loadBlindCashRecords()
  );
  const [surpriseAuditLogs, setSurpriseAuditLogs] = useState<SurpriseAuditRecord[]>(() =>
    loadSurpriseAuditRecords()
  );
  const [shiftHandoverLogs, setShiftHandoverLogs] = useState<ShiftHandoverRecord[]>(() =>
    loadShiftHandoverRecords()
  );
  const [trayLogs, setTrayLogs] = useState<TrayRefillLogItem[]>(() => loadPersistedTrayLogs());

  // Blind Cash Form State
  const [noteCounts, setNoteCounts] = useState({
    n1000: '',
    n500: '',
    n200: '',
    n100: '',
    n50: '',
    n20: '',
    n10: '',
    n5AndCoins: '',
  });
  const [mobileWalletInput, setMobileWalletInput] = useState('');
  const [blindComparisonMode, setBlindComparisonMode] = useState<'today_net' | 'total_drawer'>(
    'today_net'
  );
  const [blindCashNote, setBlindCashNote] = useState('');
  const [blindSubmittedSuccess, setBlindSubmittedSuccess] = useState<BlindCashCountRecord | null>(
    null
  );

  // Surprise Audit State (Rakib Only)
  const [spotSampleSize, setSpotSampleSize] = useState<number>(5);
  const [activeSpotItems, setActiveSpotItems] = useState<
    {
      product: Product;
      physicalCountInput: string;
    }[]
  >([]);
  const [surpriseAuditNote, setSurpriseAuditNote] = useState('');

  // Shift Handover State
  const [incomingPerson, setIncomingPerson] = useState<string>('Rakib');
  const [handedOverCashInput, setHandedOverCashInput] = useState<string>('');
  const [shiftHandoverNote, setShiftHandoverNote] = useState<string>('');
  const [shiftSubmittedSuccess, setShiftSubmittedSuccess] = useState<ShiftHandoverRecord | null>(
    null
  );

  // Receipt Preview Modal
  const [previewReceiptEntry, setPreviewReceiptEntry] = useState<Entry | null>(null);
  const [flagCategoryFilter, setFlagCategoryFilter] = useState<string>('all');

  // Load persisted data from Firestore on mount
  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'businessSettings', 'antiFraudCenter'))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.settings) {
            const merged = { ...DEFAULT_ANTI_FRAUD_SETTINGS, ...data.settings };
            setAfSettings(merged);
            localStorage.setItem(ANTI_FRAUD_SETTINGS_KEY, JSON.stringify(merged));
          }
          if (Array.isArray(data.blindCashLogs)) {
            setBlindCashLogs(data.blindCashLogs);
            localStorage.setItem(BLIND_CASH_LOGS_KEY, JSON.stringify(data.blindCashLogs));
          }
          if (Array.isArray(data.surpriseAuditLogs)) {
            setSurpriseAuditLogs(data.surpriseAuditLogs);
            localStorage.setItem(SURPRISE_AUDIT_LOGS_KEY, JSON.stringify(data.surpriseAuditLogs));
          }
          if (Array.isArray(data.shiftHandoverLogs)) {
            setShiftHandoverLogs(data.shiftHandoverLogs);
            localStorage.setItem(SHIFT_HANDOVER_LOGS_KEY, JSON.stringify(data.shiftHandoverLogs));
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refreshTray = () => setTrayLogs(loadPersistedTrayLogs());
    window.addEventListener(TRAY_LOGS_UPDATED_EVENT, refreshTray);
    return () => window.removeEventListener(TRAY_LOGS_UPDATED_EVENT, refreshTray);
  }, []);

  // Computed denomination sum for Blind Cash Count
  const physicalDrawerTotal = useMemo(() => {
    const n1000 = (Number(noteCounts.n1000) || 0) * 1000;
    const n500 = (Number(noteCounts.n500) || 0) * 500;
    const n200 = (Number(noteCounts.n200) || 0) * 200;
    const n100 = (Number(noteCounts.n100) || 0) * 100;
    const n50 = (Number(noteCounts.n50) || 0) * 50;
    const n20 = (Number(noteCounts.n20) || 0) * 20;
    const n10 = (Number(noteCounts.n10) || 0) * 10;
    const n5 = Number(noteCounts.n5AndCoins) || 0;
    return n1000 + n500 + n200 + n100 + n50 + n20 + n10 + n5;
  }, [noteCounts]);

  const totalCountedCash = useMemo(() => {
    return physicalDrawerTotal + (Number(mobileWalletInput) || 0);
  }, [physicalDrawerTotal, mobileWalletInput]);

  // Tray vs Sales Discrepancies
  const trayDiscrepancies = useMemo(
    () => computeTrayDiscrepancies(products, entries, trayLogs, afSettings),
    [products, entries, trayLogs, afSettings]
  );

  // Suspicious Activity Flags
  const suspiciousFlags = useMemo(
    () =>
      computeSuspiciousActivities(
        entries,
        products,
        auditLogs,
        trayLogs,
        blindCashLogs,
        shiftHandoverLogs,
        afSettings
      ),
    [entries, products, auditLogs, trayLogs, blindCashLogs, shiftHandoverLogs, afSettings]
  );

  const filteredSuspiciousFlags = useMemo(() => {
    if (flagCategoryFilter === 'all') return suspiciousFlags;
    return suspiciousFlags.filter((f) => f.category === flagCategoryFilter);
  }, [suspiciousFlags, flagCategoryFilter]);

  // Staff / Operator Options for Shift Handover
  const staffOptions = useMemo(() => {
    const list: { username: string; displayName: string }[] = [
      { username: 'Rakib', displayName: 'রাকিব (Rakib - সুপার অ্যাডমিন)' },
      { username: 'Limon', displayName: 'লিমন (Limon - পার্টনার অ্যাডমিন)' },
    ];
    for (const emp of employees) {
      if (emp.active) {
        list.push({
          username: emp.username,
          displayName: `👷 ${emp.displayName} (${emp.designation || 'কর্মচারী'})`,
        });
      }
    }
    return list;
  }, [employees]);

  // Submit Blind Cash Closing Verification
  function handleSubmitBlindCashCount(e: React.FormEvent) {
    e.preventDefault();
    if (totalCountedCash <= 0 && !blindCashNote.trim()) {
      return;
    }

    const expectedCash =
      blindComparisonMode === 'today_net'
        ? Math.max(0, todayNetCash)
        : Math.max(0, availableBusinessCash);

    const diff = Math.round((totalCountedCash - expectedCash) * 100) / 100;
    const now = new Date();

    const record: BlindCashCountRecord = {
      id: `bc-${Date.now()}`,
      date: todayIso,
      timestamp: formatBengaliDateTime(now),
      createdAtMs: now.getTime(),
      submittedBy: currentAdmin.username,
      submittedByName: currentAdmin.displayName,
      submittedByRole: currentAdmin.role,
      notesBreakdown: {
        n1000: Number(noteCounts.n1000) || 0,
        n500: Number(noteCounts.n500) || 0,
        n200: Number(noteCounts.n200) || 0,
        n100: Number(noteCounts.n100) || 0,
        n50: Number(noteCounts.n50) || 0,
        n20: Number(noteCounts.n20) || 0,
        n10: Number(noteCounts.n10) || 0,
        n5AndCoins: Number(noteCounts.n5AndCoins) || 0,
      },
      physicalDrawerCash: physicalDrawerTotal,
      mobileWalletCash: Number(mobileWalletInput) || 0,
      totalCountedCash,
      expectedSystemCash: expectedCash,
      ExpectedTodayNetCash: Math.max(0, todayNetCash),
      difference: diff,
      comparisonMode: blindComparisonMode,
      note: blindCashNote.trim() || undefined,
    };

    const nextLogs = [record, ...blindCashLogs].slice(0, 120);
    setBlindCashLogs(nextLogs);
    try {
      localStorage.setItem(BLIND_CASH_LOGS_KEY, JSON.stringify(nextLogs));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('blindCashLogs', nextLogs, currentAdmin.username);

    setBlindSubmittedSuccess(record);
    setNoteCounts({
      n1000: '',
      n500: '',
      n200: '',
      n100: '',
      n50: '',
      n20: '',
      n10: '',
      n5AndCoins: '',
    });
    setMobileWalletInput('');
    setBlindCashNote('');
    onNotifyMessage?.(
      `✅ দোকান বন্ধের ব্লাইন্ড ক্যাশ কাউন্ট (${money(totalCountedCash)}) সফলভাবে জমা হয়েছে!`
    );
  }

  // Generate Random Spot-Check Products (Surprise Stock Audit)
  function handleGenerateSurpriseAuditList(count = spotSampleSize) {
    if (!products.length) return;
    const pool = [...products];
    // Sort with slight random weight + high value / active tray priority
    const shuffled = pool
      .map((p) => {
        const hasTray = (Number(p.trayStock) || 0) > 0 ? 1.5 : 1;
        const valWeight = (Number(p.sellingPrice) || 50) > 100 ? 1.3 : 1;
        return { p, score: Math.random() * hasTray * valWeight };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(count, pool.length))
      .map((item) => ({
        product: item.p,
        physicalCountInput: String(
          (Number(item.p.currentStock) || 0) + (Number(item.p.trayStock) || 0)
        ),
      }));

    setActiveSpotItems(shuffled);
    setSurpriseAuditNote('');
  }

  // Save Surprise Stock Audit Report
  function handleSaveSurpriseAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!isRakib || !activeSpotItems.length) return;

    const auditItems: SurpriseAuditItem[] = activeSpotItems.map(({ product: p, physicalCountInput }) => {
      const sysMain = Number(p.currentStock) || 0;
      const sysTray = Number(p.trayStock) || 0;
      const expectedTotal = sysMain + sysTray;
      const counted = Math.max(0, Number(physicalCountInput) || 0);
      const missing = Math.max(0, expectedTotal - counted);
      const uPrice = Number(p.sellingPrice) || 0;
      const uCost = Number(p.averageCost) || 0;

      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku || '—',
        unit: p.unit || 'পিস',
        systemMainStock: sysMain,
        systemTrayStock: sysTray,
        expectedTotalStock: expectedTotal,
        countedPhysicalStock: counted,
        missingUnits: missing,
        unitPrice: uPrice,
        unitCost: uCost,
        estimatedLossSellValue: Math.round(missing * uPrice * 100) / 100,
        estimatedLossCostValue: Math.round(missing * uCost * 100) / 100,
      };
    });

    const discrepancyItems = auditItems.filter((i) => i.missingUnits > 0);
    const totalMissingUnits = auditItems.reduce((s, i) => s + i.missingUnits, 0);
    const totalLossSellValue = auditItems.reduce((s, i) => s + i.estimatedLossSellValue, 0);
    const now = new Date();

    const record: SurpriseAuditRecord = {
      id: `sa-${Date.now()}`,
      date: todayIso,
      timestamp: formatBengaliDateTime(now),
      createdAtMs: now.getTime(),
      auditedBy: currentAdmin.displayName,
      totalProductsChecked: auditItems.length,
      discrepancyCount: discrepancyItems.length,
      totalMissingUnits,
      totalLossSellValue,
      items: auditItems,
      note: surpriseAuditNote.trim() || undefined,
    };

    const nextLogs = [record, ...surpriseAuditLogs].slice(0, 80);
    setSurpriseAuditLogs(nextLogs);
    try {
      localStorage.setItem(SURPRISE_AUDIT_LOGS_KEY, JSON.stringify(nextLogs));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('surpriseAuditLogs', nextLogs, currentAdmin.username);

    setActiveSpotItems([]);
    setSurpriseAuditNote('');
    onNotifyMessage?.(
      totalMissingUnits > 0
        ? `⚠️ সারপ্রাইজ স্টক অডিট সংরক্ষিত: ${toBengaliNumerals(totalMissingUnits)} পিস পণ্যের গরমিল (${money(totalLossSellValue)}) ধরা পড়েছে!`
        : `✅ সারপ্রাইজ স্টক অডিট সম্পন্ন: সব পণ্যের ফিজিক্যাল ও সিস্টেম স্টক ১০০% মিলেছে!`
    );
  }

  // Submit Shift Handover Sign-Off
  function handleSubmitShiftHandover(e: React.FormEvent) {
    e.preventDefault();
    const handedCash = Number(handedOverCashInput) || 0;
    const expectedNet = Math.max(0, todaySalesAmount - todayExpensesAmount);
    const discrepancy = Math.round((handedCash - expectedNet) * 100) / 100;

    const activeTrays = products.filter((p) => (Number(p.trayStock) || 0) > 0).length;
    const activeTrayPieces = products.reduce((s, p) => s + (Number(p.trayStock) || 0), 0);
    const incomingObj = staffOptions.find((s) => s.username === incomingPerson);
    const now = new Date();

    const record: ShiftHandoverRecord = {
      id: `sh-${Date.now()}`,
      date: todayIso,
      timestamp: formatBengaliDateTime(now),
      createdAtMs: now.getTime(),
      outgoingUser: currentAdmin.username,
      outgoingUserName: currentAdmin.displayName,
      outgoingRole: currentAdmin.role,
      incomingUser: incomingPerson,
      incomingUserName: incomingObj ? incomingObj.displayName : incomingPerson,
      shiftSalesCount: todaySalesCount,
      shiftSalesAmount: todaySalesAmount,
      shiftExpensesAmount: todayExpensesAmount,
      expectedShiftNetCash: expectedNet,
      handedOverDrawerCash: handedCash,
      cashDiscrepancy: discrepancy,
      activeTrayCount: activeTrays,
      activeTrayTotalPieces: activeTrayPieces,
      note: shiftHandoverNote.trim() || undefined,
    };

    const nextLogs = [record, ...shiftHandoverLogs].slice(0, 100);
    setShiftHandoverLogs(nextLogs);
    try {
      localStorage.setItem(SHIFT_HANDOVER_LOGS_KEY, JSON.stringify(nextLogs));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('shiftHandoverLogs', nextLogs, currentAdmin.username);

    setShiftSubmittedSuccess(record);
    setHandedOverCashInput('');
    setShiftHandoverNote('');
    onNotifyMessage?.(
      `🤝 শিফট হ্যান্ডওভার লক সম্পন্ন! ${currentAdmin.displayName} → ${record.incomingUserName}`
    );
  }

  // Update Anti-Fraud Settings (Rakib Only)
  function handleUpdateSettings(partial: Partial<AntiFraudSettings>, customMsg?: string) {
    if (!isRakib) return;
    const updated: AntiFraudSettings = {
      ...afSettings,
      ...partial,
      updatedBy: currentAdmin.username,
      updatedAt: new Date().toISOString(),
    };
    setAfSettings(updated);
    try {
      localStorage.setItem(ANTI_FRAUD_SETTINGS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('settings', updated, currentAdmin.username);
    onNotifyMessage?.(customMsg || '🛡️ জালিয়াতি রোধ সিকিউরিটি সেটিংস আপডেট করা হয়েছে!');
  }

  // Rakib-Only: Dismiss / Delete a single Suspicious Activity Flag
  function handleDismissSingleFlag(flagId: string) {
    if (!isRakib) return;
    const currentList = afSettings.dismissedFlagIds || [];
    if (currentList.includes(flagId)) return;
    const nextList = [...currentList, flagId];
    handleUpdateSettings(
      { dismissedFlagIds: nextList },
      '🗑️ সন্দেহজনক লেনদেন অ্যালার্টটি তালিকা থেকে ডিলিট/পরিষ্কার করা হয়েছে।'
    );
  }

  // Rakib-Only: Clear all visible Suspicious Activity Flags in current filter
  function handleDismissAllVisibleFlags() {
    if (!isRakib || filteredSuspiciousFlags.length === 0) return;
    const currentSet = new Set(afSettings.dismissedFlagIds || []);
    for (const f of filteredSuspiciousFlags) {
      currentSet.add(f.id);
    }
    handleUpdateSettings(
      { dismissedFlagIds: Array.from(currentSet) },
      `🗑️ ${toBengaliNumerals(filteredSuspiciousFlags.length)}টি সন্দেহজনক অ্যালার্ট সফলভাবে ডিলিট ও পরিষ্কার করা হয়েছে!`
    );
  }

  // Rakib-Only: Restore previously dismissed flags
  function handleRestoreDismissedFlags() {
    if (!isRakib) return;
    handleUpdateSettings(
      { dismissedFlagIds: [] },
      '🔄 পূর্বে মুছে ফেলা সকল অ্যালার্ট পুনরায় তালিকায় ফিরিয়ে আনা হয়েছে।'
    );
  }

  // Rakib-Only: Dismiss a single Tray Discrepancy item
  function handleDismissTrayDiscrepancy(item: TrayDiscrepancyItem) {
    if (!isRakib) return;
    const key = `${item.productId}:${item.unaccountedMissingQty}`;
    const currentList = afSettings.dismissedTrayKeys || [];
    if (currentList.includes(key)) return;
    handleUpdateSettings(
      { dismissedTrayKeys: [...currentList, key] },
      `🗑️ "${item.productName}"-এর ট্রে গরমিল অ্যালার্টটি পরিষ্কার করা হয়েছে।`
    );
  }

  // Rakib-Only: Clear all Tray Discrepancies
  function handleClearAllTrayDiscrepancies() {
    if (!isRakib || trayDiscrepancies.length === 0) return;
    const currentSet = new Set(afSettings.dismissedTrayKeys || []);
    for (const item of trayDiscrepancies) {
      currentSet.add(`${item.productId}:${item.unaccountedMissingQty}`);
    }
    handleUpdateSettings(
      { dismissedTrayKeys: Array.from(currentSet) },
      `🗑️ সব (${toBengaliNumerals(trayDiscrepancies.length)}টি) ট্রে গরমিল অ্যালার্ট পরিষ্কার করা হয়েছে!`
    );
  }

  // Rakib-Only: Restore dismissed Tray Discrepancies
  function handleRestoreTrayDiscrepancies() {
    if (!isRakib) return;
    handleUpdateSettings(
      { dismissedTrayKeys: [] },
      '🔄 ট্রে গরমিলের মুছে ফেলা রেকর্ডগুলো পুনরায় ফিরিয়ে আনা হয়েছে।'
    );
  }

  // Rakib-Only: Delete a single Blind Cash Count record
  function handleDeleteBlindCashRecord(id: string) {
    if (!isRakib) return;
    const nextLogs = blindCashLogs.filter((b) => b.id !== id);
    setBlindCashLogs(nextLogs);
    try {
      localStorage.setItem(BLIND_CASH_LOGS_KEY, JSON.stringify(nextLogs));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('blindCashLogs', nextLogs, currentAdmin.username);
    onNotifyMessage?.('🗑️ ব্লাইন্ড ক্যাশ কাউন্ট রেকর্ডটি ডিলিট করা হয়েছে।');
  }

  // Rakib-Only: Clear all Blind Cash Count logs
  function handleClearAllBlindCashLogs() {
    if (!isRakib || blindCashLogs.length === 0) return;
    setBlindCashLogs([]);
    try {
      localStorage.setItem(BLIND_CASH_LOGS_KEY, JSON.stringify([]));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('blindCashLogs', [], currentAdmin.username);
    onNotifyMessage?.('🗑️ সকল ব্লাইন্ড ক্যাশ কাউন্ট ইতিহাস পরিষ্কার করা হয়েছে!');
  }

  // Rakib-Only: Delete a single Surprise Audit record
  function handleDeleteSurpriseAuditRecord(id: string) {
    if (!isRakib) return;
    const nextLogs = surpriseAuditLogs.filter((a) => a.id !== id);
    setSurpriseAuditLogs(nextLogs);
    try {
      localStorage.setItem(SURPRISE_AUDIT_LOGS_KEY, JSON.stringify(nextLogs));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('surpriseAuditLogs', nextLogs, currentAdmin.username);
    onNotifyMessage?.('🗑️ সারপ্রাইজ অডিট রেকর্ডটি ডিলিট করা হয়েছে।');
  }

  // Rakib-Only: Clear all Surprise Audit records
  function handleClearAllSurpriseAuditLogs() {
    if (!isRakib || surpriseAuditLogs.length === 0) return;
    setSurpriseAuditLogs([]);
    try {
      localStorage.setItem(SURPRISE_AUDIT_LOGS_KEY, JSON.stringify([]));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('surpriseAuditLogs', [], currentAdmin.username);
    onNotifyMessage?.('🗑️ সকল সারপ্রাইজ স্টক অডিট ইতিহাস পরিষ্কার করা হয়েছে!');
  }

  // Rakib-Only: Delete a single Shift Handover record
  function handleDeleteShiftHandoverRecord(id: string) {
    if (!isRakib) return;
    const nextLogs = shiftHandoverLogs.filter((s) => s.id !== id);
    setShiftHandoverLogs(nextLogs);
    try {
      localStorage.setItem(SHIFT_HANDOVER_LOGS_KEY, JSON.stringify(nextLogs));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('shiftHandoverLogs', nextLogs, currentAdmin.username);
    onNotifyMessage?.('🗑️ শিফট হ্যান্ডওভার রেকর্ডটি ডিলিট করা হয়েছে।');
  }

  // Rakib-Only: Clear all Shift Handover records
  function handleClearAllShiftHandoverLogs() {
    if (!isRakib || shiftHandoverLogs.length === 0) return;
    setShiftHandoverLogs([]);
    try {
      localStorage.setItem(SHIFT_HANDOVER_LOGS_KEY, JSON.stringify([]));
      window.dispatchEvent(new Event(ANTI_FRAUD_UPDATED_EVENT));
    } catch {}
    persistAntiFraudPayloadToFirestore('shiftHandoverLogs', [], currentAdmin.username);
    onNotifyMessage?.('🗑️ সকল শিফট হ্যান্ডওভার ইতিহাস পরিষ্কার করা হয়েছে!');
  }

  // Rakib-Only: Master Clean All Alerts (Suspicious Flags + Tray Discrepancies)
  function handleClearAllSecurityAlertsAtOnce() {
    if (!isRakib) return;
    const flagSet = new Set(afSettings.dismissedFlagIds || []);
    for (const f of suspiciousFlags) flagSet.add(f.id);
    const traySet = new Set(afSettings.dismissedTrayKeys || []);
    for (const item of trayDiscrepancies) {
      traySet.add(`${item.productId}:${item.unaccountedMissingQty}`);
    }
    handleUpdateSettings(
      {
        dismissedFlagIds: Array.from(flagSet),
        dismissedTrayKeys: Array.from(traySet),
      },
      '✨ সকল অ্যালার্ট ও গরমিল তালিকা সফলভাবে ডিলিট করে পরিষ্কার করা হয়েছে!'
    );
  }

  // Helper to step note denomination counts up or down
  function adjustNoteCount(key: keyof typeof noteCounts, delta: number) {
    setNoteCounts((prev) => {
      const current = Math.max(0, Number(prev[key]) || 0);
      const next = Math.max(0, current + delta);
      return { ...prev, [key]: next === 0 ? '' : String(next) };
    });
  }

  const denominationMeta = [
    { key: 'n1000' as const, label: '৳১০০০ নোট', mult: 1000, badgeBg: '#f3e8ff', badgeColor: '#6b21a8' },
    { key: 'n500' as const, label: '৳৫০০ নোট', mult: 500, badgeBg: '#dcfce7', badgeColor: '#166534' },
    { key: 'n200' as const, label: '৳২০০ নোট', mult: 200, badgeBg: '#fef3c7', badgeColor: '#92400e' },
    { key: 'n100' as const, label: '৳১০০ নোট', mult: 100, badgeBg: '#dbeafe', badgeColor: '#1e40af' },
    { key: 'n50' as const, label: '৳৫০ নোট', mult: 50, badgeBg: '#fee2e2', badgeColor: '#991b1b' },
    { key: 'n20' as const, label: '৳২০ নোট', mult: 20, badgeBg: '#ccfbf1', badgeColor: '#115e59' },
    { key: 'n10' as const, label: '৳১০ নোট', mult: 10, badgeBg: '#fce7f3', badgeColor: '#9d174d' },
  ];

  // ============================================================================
  // MODE 1: STAFF / EMPLOYEE BLIND CASH CLOSING MODAL (Hides Expected System Cash!)
  // ============================================================================
  if (mode === 'blind_cash_modal') {
    return (
      <div className="af-modal-overlay" onClick={onCloseModal}>
        <div className="af-modal-dialog" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="af-modal-header">
            <div>
              <span className="af-badge-active">🔒 ১. ব্লাইন্ড ক্যাশ ক্লোজিং ভেরিফিকেশন</span>
              <h3 style={{ margin: '6px 0 3px', fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
                দোকান বন্ধের সময় ক্যাশ ড্রয়ারের নোট গণনা
              </h3>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#cbd5e1' }}>
                ক্যাশবাক্সে কোন নোট কয়টি আছে তা গুনুন এবং সরাসরি জমা দিন
              </p>
            </div>
            {onCloseModal && (
              <button type="button" className="af-modal-close" onClick={onCloseModal} aria-label="বন্ধ করুন">
                <X size={18} />
              </button>
            )}
          </div>

          <div className="af-modal-body">
            {blindSubmittedSuccess ? (
              <div className="af-empty-state" style={{ borderStyle: 'solid' }}>
                <CheckCircle2 size={44} style={{ color: '#16a34a' }} />
                <h4>✅ ব্লাইন্ড ক্যাশ কাউন্ট সফলভাবে লক ও সংরক্ষিত হয়েছে!</h4>
                <p className="af-num" style={{ marginBottom: '10px' }}>
                  জমা দেওয়া মোট ক্যাশ: <b>{money(blindSubmittedSuccess.totalCountedCash)}</b> (নগদ ড্রয়ার:{' '}
                  {money(blindSubmittedSuccess.physicalDrawerCash)} + মোবাইল ব্যাংকিং:{' '}
                  {money(blindSubmittedSuccess.mobileWalletCash)})
                </p>

                {/* ONLY RAKIB sees the shortage/excess result! */}
                {isRakib ? (
                  <div
                    style={{
                      width: '100%',
                      background:
                        blindSubmittedSuccess.difference < 0
                          ? '#fef2f2'
                          : blindSubmittedSuccess.difference > 0
                          ? '#eff6ff'
                          : '#ffffff',
                      border: `1.5px solid ${
                        blindSubmittedSuccess.difference < 0
                          ? '#fca5a5'
                          : blindSubmittedSuccess.difference > 0
                          ? '#93c5fd'
                          : '#86efac'
                      }`,
                      borderRadius: '12px',
                      padding: '12px 14px',
                      marginBottom: '12px',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                      🛡️ রাকিব অডিট ফলাফল (শুধুমাত্র আপনি দেখতে পাচ্ছেন):
                    </div>
                    <div className="af-num" style={{ fontSize: '13px', color: '#334155' }}>
                      সিস্টেমে প্রত্যাশিত ক্যাশ: <b>{money(blindSubmittedSuccess.expectedSystemCash)}</b> | গণনাকৃত:{' '}
                      <b>{money(blindSubmittedSuccess.totalCountedCash)}</b>
                    </div>
                    <div
                      className="af-num"
                      style={{
                        marginTop: '4px',
                        fontSize: '14px',
                        fontWeight: 900,
                        color:
                          blindSubmittedSuccess.difference < 0
                            ? '#dc2626'
                            : blindSubmittedSuccess.difference > 0
                            ? '#2563eb'
                            : '#059669',
                      }}
                    >
                      {blindSubmittedSuccess.difference < 0
                        ? `⚠️ ক্যাশ শর্টেজ (ঘাটতি): ${money(Math.abs(blindSubmittedSuccess.difference))}`
                        : blindSubmittedSuccess.difference > 0
                        ? `ℹ️ অতিরিক্ত ক্যাশ (Excess): +${money(blindSubmittedSuccess.difference)}`
                        : '✅ ১০০% মিলে গেছে! কোনো ক্যাশ ঘাটতি নেই।'}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #bbf7d0',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: '#166534',
                      marginBottom: '10px',
                    }}
                  >
                    🔒 আপনার গণনাকৃত ক্যাশ রেকর্ড সুপার অ্যাডমিন রাকিবের অডিট প্যানেলে জমা হয়েছে।
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setBlindSubmittedSuccess(null)}
                  >
                    নতুন করে গণনা করুন
                  </button>
                  {onCloseModal && (
                    <button type="button" className="primary" onClick={onCloseModal}>
                      সম্পন্ন (বন্ধ করুন)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitBlindCashCount} style={{ display: 'grid', gap: '14px' }}>
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    color: '#92400e',
                    lineHeight: 1.5,
                  }}
                >
                  🔒 <b>ব্লাইন্ড কাউন্ট নিয়ম:</b> এখানে সিস্টেমের ব্যালান্স লুকানো থাকে। ক্যাশবাক্সে বাস্তবে যে কয়টি নোট আছে, ঠিক সেই সংখ্যাটি লিখুন অথবা <b>+ / −</b> বাটন চাপুন।
                </div>

                {/* Denomination Counter Grid */}
                <div className="af-denom-grid">
                  {denominationMeta.map((item) => {
                    const countVal = noteCounts[item.key];
                    const numCount = Number(countVal) || 0;
                    const subTotal = numCount * item.mult;
                    return (
                      <div
                        key={item.key}
                        className={`af-denom-card ${numCount > 0 ? 'has-val' : ''}`}
                      >
                        <div className="af-denom-head">
                          <span
                            className="af-denom-note-badge"
                            style={{ background: item.badgeBg, color: item.badgeColor }}
                          >
                            {item.label}
                          </span>
                          <span className="af-denom-subtotal">= {money(subTotal)}</span>
                        </div>
                        <div className="af-denom-stepper">
                          <button
                            type="button"
                            className="af-denom-step-btn"
                            onClick={() => adjustNoteCount(item.key, -1)}
                            aria-label="কমান"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="০টি"
                            className="af-denom-input"
                            value={countVal}
                            onChange={(e) =>
                              setNoteCounts((prev) => ({ ...prev, [item.key]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="af-denom-step-btn"
                            onClick={() => adjustNoteCount(item.key, 1)}
                            aria-label="বাড়ান"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* 5 Taka & Coins */}
                  <div
                    className={`af-denom-card ${(Number(noteCounts.n5AndCoins) || 0) > 0 ? 'has-val' : ''}`}
                  >
                    <div className="af-denom-head">
                      <span
                        className="af-denom-note-badge"
                        style={{ background: '#f1f5f9', color: '#334155' }}
                      >
                        খুচরা কয়েন
                      </span>
                      <span className="af-denom-subtotal">
                        = {money(Number(noteCounts.n5AndCoins) || 0)}
                      </span>
                    </div>
                    <div className="af-denom-stepper">
                      <button
                        type="button"
                        className="af-denom-step-btn"
                        onClick={() => adjustNoteCount('n5AndCoins', -5)}
                        aria-label="কমান"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="৳০"
                        className="af-denom-input"
                        value={noteCounts.n5AndCoins}
                        onChange={(e) =>
                          setNoteCounts((prev) => ({ ...prev, n5AndCoins: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="af-denom-step-btn"
                        onClick={() => adjustNoteCount('n5AndCoins', 5)}
                        aria-label="বাড়ান"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Styled Extra Fields Card: Mobile Banking & Closing Note */}
                <div className="af-extra-fields-card">
                  <div className="af-field-group">
                    <label className="af-field-label" htmlFor="bc-mobile-wallet">
                      <span className="af-field-icon-badge teal">📱</span>
                      <span>বিকাশ / নগদ একাউন্টে আজকের জমা (যদি থাকে)</span>
                    </label>
                    <div className="af-input-with-prefix">
                      <span className="af-input-prefix">৳</span>
                      <input
                        id="bc-mobile-wallet"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="০ (মোবাইল ব্যাংকিং জমা)"
                        className="af-modern-input af-num"
                        value={mobileWalletInput}
                        onChange={(e) => setMobileWalletInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="af-field-group">
                    <label className="af-field-label" htmlFor="bc-closing-note">
                      <span className="af-field-icon-badge amber">📝</span>
                      <span>মন্তব্য বা ক্লোজিং নোট (ঐচ্ছিক)</span>
                    </label>
                    <input
                      id="bc-closing-note"
                      type="text"
                      className="af-modern-input"
                      placeholder="যেমন: রাত ১০টায় দোকান বন্ধের হিসাব..."
                      value={blindCashNote}
                      onChange={(e) => setBlindCashNote(e.target.value)}
                    />
                  </div>
                </div>

                {/* Live Counted Total Bar (Without showing expected system cash!) */}
                <div className="af-cash-total-bar">
                  <div className="af-cash-total-metrics">
                    <div className="af-cash-metric-block">
                      <span>নগদ ড্রয়ার মোট</span>
                      <strong style={{ fontSize: '16.5px', color: '#e2e8f0' }}>
                        {money(physicalDrawerTotal)}
                      </strong>
                    </div>
                    <div className="af-cash-metric-block highlight">
                      <span>সর্বমোট গণনাকৃত ক্যাশ (নগদ + মোবাইল)</span>
                      <strong>{money(totalCountedCash)}</strong>
                    </div>
                  </div>
                  <div className="af-cash-submit-row">
                    {onCloseModal && (
                      <button type="button" className="af-btn-cancel" onClick={onCloseModal}>
                        বাতিল
                      </button>
                    )}
                    <button type="submit" className="af-btn-submit">
                      <Lock size={15} /> ব্লাইন্ড ক্যাশ জমা দিন
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODE 2: SHIFT HANDOVER SIGN-OFF MODAL (For Employees & Admins)
  // ============================================================================
  if (mode === 'shift_handover_modal') {
    const activeTrays = products.filter((p) => (Number(p.trayStock) || 0) > 0).length;
    const activeTrayPieces = products.reduce((s, p) => s + (Number(p.trayStock) || 0), 0);

    return (
      <div className="af-modal-overlay" onClick={onCloseModal}>
        <div className="af-modal-dialog indigo-theme" onClick={(e) => e.stopPropagation()}>
          <div className="af-modal-header">
            <div>
              <span
                className="af-badge-active"
                style={{
                  background: 'rgba(165, 180, 252, 0.22)',
                  borderColor: 'rgba(165, 180, 252, 0.45)',
                  color: '#e0e7ff',
                }}
              >
                🤝 ৭. শিফট হ্যান্ডওভার লক (Shift Sign-off)
              </span>
              <h3 style={{ margin: '6px 0 3px', fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
                ডিউটি পরিবর্তন ও দায়িত্ব হস্তান্তর ফর্ম
              </h3>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#c7d2fe' }}>
                পরবর্তী দায়িত্বপ্রাপ্ত ব্যক্তির কাছে ক্যাশ ও ট্রে স্টক বুঝিয়ে দিয়ে সাইন-অফ করুন
              </p>
            </div>
            {onCloseModal && (
              <button type="button" className="af-modal-close" onClick={onCloseModal} aria-label="বন্ধ করুন">
                <X size={18} />
              </button>
            )}
          </div>

          <div className="af-modal-body">
            {shiftSubmittedSuccess ? (
              <div
                className="af-empty-state"
                style={{
                  background: '#eef2ff',
                  borderColor: '#a5b4fc',
                  borderStyle: 'solid',
                  color: '#1e1b4b',
                }}
              >
                <UserCheck size={42} style={{ color: '#4338ca' }} />
                <h4 style={{ color: '#1e1b4b' }}>
                  ✅ শিফট হ্যান্ডওভার সাইন-অফ সফলভাবে লক হয়েছে!
                </h4>
                <p style={{ color: '#312e81' }}>
                  <b>{shiftSubmittedSuccess.outgoingUserName}</b> →{' '}
                  <b>{shiftSubmittedSuccess.incomingUserName}</b>
                </p>
                <div
                  className="af-num"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    borderRadius: '12px',
                    padding: '12px',
                    border: '1px solid #c7d2fe',
                    fontSize: '12.5px',
                    color: '#334155',
                    margin: '6px 0 10px',
                  }}
                >
                  হস্তান্তরকৃত ক্যাশ: <b>{money(shiftSubmittedSuccess.handedOverDrawerCash)}</b> | সচল ট্রে:{' '}
                  <b>
                    {toBengaliNumerals(shiftSubmittedSuccess.activeTrayCount)}টি (
                    {toBengaliNumerals(shiftSubmittedSuccess.activeTrayTotalPieces)} পিস)
                  </b>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShiftSubmittedSuccess(null)}
                  >
                    নতুন হ্যান্ডওভার
                  </button>
                  {onCloseModal && (
                    <button type="button" className="primary" onClick={onCloseModal}>
                      বন্ধ করুন
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitShiftHandover} style={{ display: 'grid', gap: '14px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '10px 12px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 600 }}>
                      দায়িত্ব হস্তান্তরকারী (Outgoing)
                    </span>
                    <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                      👤 {currentAdmin.displayName}
                    </strong>
                  </div>
                  <div
                    style={{
                      background: '#f0fdfa',
                      border: '1px solid #99f6e4',
                      borderRadius: '12px',
                      padding: '10px 12px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#0f766e', display: 'block', fontWeight: 600 }}>
                      আজকের বিক্রয় ও খরচ
                    </span>
                    <strong className="af-num" style={{ fontSize: '13.5px', color: '#0f766e' }}>
                      {toBengaliNumerals(todaySalesCount)}টি বিক্রয় ({money(todaySalesAmount)})
                    </strong>
                  </div>
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '12px',
                      padding: '10px 12px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#92400e', display: 'block', fontWeight: 600 }}>
                      সচল ডিসপ্লে ট্রে স্টক
                    </span>
                    <strong className="af-num" style={{ fontSize: '13.5px', color: '#b45309' }}>
                      🍱 {toBengaliNumerals(activeTrays)}টি ট্রে • {toBengaliNumerals(activeTrayPieces)} পিস
                    </strong>
                  </div>
                </div>

                <div className="af-extra-fields-card">
                  <div className="af-field-group full-span">
                    <label className="af-field-label">
                      <span className="af-field-icon-badge indigo">🤝</span>
                      <span>যাকে দোকানের দায়িত্ব বুঝিয়ে দেওয়া হচ্ছে (Incoming Staff/Admin)</span>
                    </label>
                    <select
                      required
                      className="af-modern-select"
                      value={incomingPerson}
                      onChange={(e) => setIncomingPerson(e.target.value)}
                    >
                      {staffOptions.map((st) => (
                        <option key={st.username} value={st.username}>
                          {st.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="af-field-group">
                    <label className="af-field-label">
                      <span className="af-field-icon-badge teal">💵</span>
                      <span>ড্রয়ারে বুঝিয়ে দেওয়া নগদ টাকা</span>
                    </label>
                    <div className="af-input-with-prefix">
                      <span className="af-input-prefix">৳</span>
                      <input
                        required
                        type="number"
                        min="0"
                        step="1"
                        className="af-modern-input af-num"
                        placeholder="নগদ টাকার পরিমাণ লিখুন"
                        value={handedOverCashInput}
                        onChange={(e) => setHandedOverCashInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="af-field-group">
                    <label className="af-field-label">
                      <span className="af-field-icon-badge amber">📝</span>
                      <span>শিফট নোট / বিশেষ মন্তব্য (ঐচ্ছিক)</span>
                    </label>
                    <input
                      type="text"
                      className="af-modern-input"
                      placeholder="যেমন: দুপুরের শিফট শেষ, সব ট্রে পূর্ণ আছে..."
                      value={shiftHandoverNote}
                      onChange={(e) => setShiftHandoverNote(e.target.value)}
                    />
                  </div>
                </div>

                <div className="af-cash-submit-row">
                  {onCloseModal && (
                    <button type="button" className="af-btn-cancel light" onClick={onCloseModal}>
                      বাতিল
                    </button>
                  )}
                  <button
                    type="submit"
                    className="af-btn-submit indigo"
                  >
                    <UserCheck size={16} /> দায়িত্ব হস্তান্তর ও লক করুন
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODE 3: RAKIB-ONLY FULL ANTI-FRAUD & SECURITY CENTER
  // ============================================================================
  if (!isRakib) {
    return (
      <div
        className="af-surface-card"
        style={{
          padding: '32px 20px',
          textAlign: 'center',
          border: '2px solid #fca5a5',
          background: '#fef2f2',
          alignItems: 'center',
        }}
      >
        <ShieldAlert size={42} style={{ color: '#dc2626' }} />
        <h3 style={{ margin: '4px 0', color: '#991b1b', fontWeight: 900 }}>
          🔒 সংরক্ষিত সিকিউরিটি জোন (শুধুমাত্র রাকিবের জন্য)
        </h3>
        <p style={{ margin: 0, color: '#7f1d1d', fontSize: '13px' }}>
          এই জালিয়াতি রোধ ও গোপন অডিট কন্ট্রোল প্যানেলটি শুধুমাত্র সুপার অ্যাডমিন রাকিব (Rakib) দেখতে পারবেন।
        </p>
      </div>
    );
  }

  const cashShortageCount = blindCashLogs.filter((b) => b.difference < 0).length;
  const expensesMissingPhoto = entries.filter(
    (e) =>
      e.status === 'posted' &&
      e.type === 'expense' &&
      e.amount >= (afSettings.mandatoryExpensePhotoThreshold || 100) &&
      !e.receiptImageUrl
  );
  const expensesWithPhoto = entries.filter((e) => e.receiptImageUrl);
  const trayMissingTotalValue = trayDiscrepancies.reduce((s, d) => s + d.estimatedMissingValue, 0);

  return (
    <div className="af-center-wrap">
      {/* 1. TOP COMMAND HERO BANNER FOR RAKIB */}
      <div className="af-hero-banner">
        <div className="af-hero-top">
          <div>
            <div className="af-hero-badges">
              <span className="af-badge-exclusive">
                <ShieldAlert size={13} /> শুধুমাত্র রাকিব (Rakib Exclusive Security Vault)
              </span>
              <span className="af-badge-active">
                <ShieldCheck size={13} /> ৭টি অ্যান্টি-ফ্রড সিকিউরিটি সক্রিয়
              </span>
            </div>
            <h2 className="af-hero-title">
              ব্যবসায় জালিয়াতি রোধ ও গোপন অডিট কন্ট্রোল সেন্টার
            </h2>
            <p className="af-hero-desc">
              কর্মচারী বা অন্য কেউ ক্যাশ শর্টেজ, ট্রে থেকে পণ্য চুরি, কম দামে বিক্রি, পুরনো তারিখে এন্ট্রি বা রশিদ ছাড়া ভুয়া খরচ দেখাতে পারবে না। এই প্যানেলের গোপন অডিট রিপোর্ট শুধুমাত্র আপনি (রাকিব) দেখতে পাচ্ছেন।
            </p>
          </div>

          <div className="af-hero-actions">
            {(suspiciousFlags.length > 0 || trayDiscrepancies.length > 0) && (
              <button
                type="button"
                className="af-hero-cta danger-cta"
                onClick={handleClearAllSecurityAlertsAtOnce}
              >
                <Trash2 size={15} /> সব অ্যালার্ট পরিষ্কার করুন (
                {toBengaliNumerals(suspiciousFlags.length + trayDiscrepancies.length)}টি)
              </button>
            )}
            <button
              type="button"
              className="af-hero-cta secondary-cta"
              onClick={() => setActiveSubTab('blind_cash')}
            >
              <Banknote size={15} /> ক্যাশ শর্টেজ অডিট
            </button>
            <button
              type="button"
              className="af-hero-cta"
              onClick={() => {
                setActiveSubTab('surprise_audit');
                if (!activeSpotItems.length) {
                  handleGenerateSurpriseAuditList(5);
                }
              }}
            >
              <Sparkles size={15} /> সারপ্রাইজ স্টক অডিট
            </button>
          </div>
        </div>

        {/* 4 KEY SECURITY KPI CARDS */}
        <div className="af-kpi-grid">
          <button
            type="button"
            onClick={() => setActiveSubTab('suspicious_flags')}
            className={`af-kpi-card ${suspiciousFlags.length > 0 ? 'alert-red' : ''} ${
              activeSubTab === 'suspicious_flags' ? 'is-active' : ''
            }`}
          >
            <div className="af-kpi-head">
              <span className="af-kpi-label">🚨 ৬. সন্দেহজনক লেনদেন অ্যালার্ট</span>
            </div>
            <strong className="af-kpi-value">
              {toBengaliNumerals(suspiciousFlags.length)}টি ফ্ল্যাগ
            </strong>
            <span className="af-kpi-sub">
              কম দামে বিক্রয়, ডিলিট ও অস্বাভাবিক এন্ট্রি
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tray_discrepancy')}
            className={`af-kpi-card ${trayDiscrepancies.length > 0 ? 'alert-amber' : ''} ${
              activeSubTab === 'tray_discrepancy' ? 'is-active' : ''
            }`}
          >
            <div className="af-kpi-head">
              <span className="af-kpi-label">🍱 ২. ট্রে বনাম বিক্রির গরমিল</span>
            </div>
            <strong className="af-kpi-value">
              {toBengaliNumerals(trayDiscrepancies.length)}টি পণ্যে গরমিল
            </strong>
            <span className="af-kpi-sub">
              নিখোঁজ মূল্য: {money(trayMissingTotalValue)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('blind_cash')}
            className={`af-kpi-card ${cashShortageCount > 0 ? 'alert-red' : ''} ${
              activeSubTab === 'blind_cash' ? 'is-active' : ''
            }`}
          >
            <div className="af-kpi-head">
              <span className="af-kpi-label">💵 ১. ব্লাইন্ড ক্যাশ ও শর্টেজ</span>
            </div>
            <strong className="af-kpi-value">
              {toBengaliNumerals(cashShortageCount)}টি শর্টেজ • {toBengaliNumerals(blindCashLogs.length)}টি কাউন্ট
            </strong>
            <span className="af-kpi-sub">
              আজকের নিট ক্যাশ: {money(Math.max(0, todayNetCash))}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('receipt_and_locks')}
            className={`af-kpi-card ${
              activeSubTab === 'receipt_and_locks' ? 'is-active' : ''
            }`}
          >
            <div className="af-kpi-head">
              <span className="af-kpi-label">🔒 ৩ ও ৪. তারিখ লক ও ভাউচার প্রুফ</span>
            </div>
            <strong className="af-kpi-value">
              {afSettings.backdatedEntryLockEnabled ? 'তারিখ লক: চালু' : 'তারিখ লক: বন্ধ'}
            </strong>
            <span className="af-kpi-sub">
              ভাউচার ছাড়া: {toBengaliNumerals(expensesMissingPhoto.length)}টি • ছবিসহ:{' '}
              {toBengaliNumerals(expensesWithPhoto.length)}টি
            </span>
          </button>
        </div>
      </div>

      {/* 2. ALL 7 ANTI-FRAUD FEATURES AT A GLANCE STRIP */}
      <div className="af-seven-strip">
        {[
          {
            num: 'ফিচার ১',
            title: 'ব্লাইন্ড ক্যাশ কাউন্ট',
            meta: `${toBengaliNumerals(blindCashLogs.length)}টি রেকর্ড`,
            tab: 'blind_cash' as const,
            warn: cashShortageCount > 0,
          },
          {
            num: 'ফিচার ২',
            title: 'ট্রে ও স্টকের গরমিল',
            meta:
              trayDiscrepancies.length > 0
                ? `${toBengaliNumerals(trayDiscrepancies.length)}টি গরমিল`
                : '১০০% সঠিক',
            tab: 'tray_discrepancy' as const,
            warn: trayDiscrepancies.length > 0,
          },
          {
            num: 'ফিচার ৩',
            title: 'পুরনো তারিখ লক',
            meta: afSettings.backdatedEntryLockEnabled ? 'লক সক্রিয় (ON)' : 'লক বন্ধ',
            tab: 'receipt_and_locks' as const,
            warn: !afSettings.backdatedEntryLockEnabled,
          },
          {
            num: 'ফিচার ৪',
            title: 'ভাউচার ছবি প্রুফ',
            meta: `৳${toBengaliNumerals(afSettings.mandatoryExpensePhotoThreshold)}+ বাধ্যতামূলক`,
            tab: 'receipt_and_locks' as const,
            warn: expensesMissingPhoto.length > 0,
          },
          {
            num: 'ফিচার ৫',
            title: 'সারপ্রাইজ স্টক অডিট',
            meta: `${toBengaliNumerals(surpriseAuditLogs.length)}বার যাচাইকৃত`,
            tab: 'surprise_audit' as const,
            warn: false,
          },
          {
            num: 'ফিচার ৬',
            title: 'সন্দেহজনক লেনদেন',
            meta: `${toBengaliNumerals(suspiciousFlags.length)}টি অ্যালার্ট`,
            tab: 'suspicious_flags' as const,
            warn: suspiciousFlags.length > 0,
          },
          {
            num: 'ফিচার ৭',
            title: 'শিফট হ্যান্ডওভার লক',
            meta: `${toBengaliNumerals(shiftHandoverLogs.length)}টি সাইন-অফ`,
            tab: 'shift_handover' as const,
            warn: shiftHandoverLogs.some((s) => s.cashDiscrepancy < 0),
          },
        ].map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveSubTab(item.tab)}
            className={`af-seven-chip ${activeSubTab === item.tab ? 'active' : ''}`}
          >
            <div className="af-seven-chip-top">
              <span className="af-seven-num">{item.num}</span>
              <span className={`af-seven-status-dot ${item.warn ? 'warn' : ''}`} />
            </div>
            <span className="af-seven-title">{item.title}</span>
            <span className="af-seven-meta">{item.meta}</span>
          </button>
        ))}
      </div>

      {/* 3. SEGMENTED SUB-NAVIGATION BAR */}
      <div className="af-tabs-bar" role="tablist">
        {[
          {
            id: 'suspicious_flags',
            label: '🚨 ৬. সন্দেহজনক লেনদেন অ্যালার্ট',
            count: suspiciousFlags.length,
            danger: suspiciousFlags.length > 0,
          },
          {
            id: 'tray_discrepancy',
            label: '🍱 ২. ট্রে ও স্টকের গরমিল',
            count: trayDiscrepancies.length,
            danger: trayDiscrepancies.length > 0,
          },
          {
            id: 'blind_cash',
            label: '💵 ১. ব্লাইন্ড ক্যাশ কাউন্ট',
            count: blindCashLogs.length,
            danger: cashShortageCount > 0,
          },
          {
            id: 'surprise_audit',
            label: '🎯 ৫. সারপ্রাইজ স্টক অডিট',
            count: surpriseAuditLogs.length,
            danger: false,
          },
          {
            id: 'shift_handover',
            label: '🤝 ৭. শিফট হ্যান্ডওভার লক',
            count: shiftHandoverLogs.length,
            danger: shiftHandoverLogs.some((s) => s.cashDiscrepancy < 0),
          },
          {
            id: 'receipt_and_locks',
            label: '🔒 ৩ ও ৪. তারিখ লক ও ভাউচার ছবি',
            count: expensesWithPhoto.length,
            danger: expensesMissingPhoto.length > 0,
          },
        ].map((t) => {
          const active = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveSubTab(t.id as any)}
              className={`af-tab-btn ${active ? 'active' : ''}`}
            >
              <span>{t.label}</span>
              <span className={`af-tab-count ${t.danger ? 'danger-count' : ''}`}>
                {toBengaliNumerals(t.count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          SUB-TAB 1: SUSPICIOUS ACTIVITY FLAGS (সন্দেহজনক লেনদেনের অটো-অ্যালার্ট)
         ===================================================================== */}
      {activeSubTab === 'suspicious_flags' && (
        <div className="af-surface-card">
          <div className="af-card-head">
            <div className="af-card-title-group">
              <div className="af-card-icon red">
                <ShieldAlert size={20} />
              </div>
              <div className="af-card-title-text">
                <h3>🚨 ৬. সন্দেহজনক লেনদেনের অটো-অ্যালার্ট (Suspicious Activity Flags)</h3>
                <p>
                  নির্ধারিত দামের চেয়ে কম দামে বিক্রয়, গভীর রাতে এন্ট্রি, পুরনো তারিখে এন্ট্রি, ভাউচার ছাড়া বড় খরচ ও ক্যাশ শর্টেজ স্বয়ংক্রিয়ভাবে এখানে ধরা পড়ে
                </p>
              </div>
            </div>

            {isRakib && (
              <div className="af-clean-toolbar">
                {filteredSuspiciousFlags.length > 0 && (
                  <button
                    type="button"
                    className="af-btn-clean-all"
                    onClick={handleDismissAllVisibleFlags}
                  >
                    <Trash2 size={14} /> সব অ্যালার্ট ডিলিট ও পরিষ্কার করুন (
                    {toBengaliNumerals(filteredSuspiciousFlags.length)}টি)
                  </button>
                )}
                {(afSettings.dismissedFlagIds?.length || 0) > 0 && (
                  <button
                    type="button"
                    className="af-btn-restore"
                    onClick={handleRestoreDismissedFlags}
                  >
                    <RefreshCw size={13} /> মুছে ফেলা রিস্টোর (
                    {toBengaliNumerals(afSettings.dismissedFlagIds?.length || 0)}টি)
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="af-filter-pills">
            {[
              { key: 'all', label: 'সব অ্যালার্ট' },
              { key: 'underpriced_sale', label: 'কম দামে বিক্রয়' },
              { key: 'missing_expense_receipt', label: 'ভাউচার ছাড়া খরচ' },
              { key: 'cash_shortage', label: 'ক্যাশ ঘাটতি' },
              { key: 'deleted_or_voided', label: 'ডিলিট / বাতিল' },
              { key: 'odd_hour_entry', label: 'অস্বাভাবিক সময়' },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFlagCategoryFilter(f.key)}
                className={`af-filter-pill ${flagCategoryFilter === f.key ? 'active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredSuspiciousFlags.length === 0 ? (
            <div className="af-empty-state">
              <CheckCircle2 size={38} style={{ color: '#16a34a' }} />
              <h4>কোনো সন্দেহজনক লেনদেন অ্যালার্ট নেই — তালিকা সম্পূর্ণ পরিষ্কার!</h4>
              <p>সকল বিক্রয়মূল্য, খরচের রশিদ এবং ক্যাশ হিসাব সম্পূর্ণ স্বাভাবিক রয়েছে।</p>
            </div>
          ) : (
            <div className="af-flag-list">
              {filteredSuspiciousFlags.map((flag) => (
                <div key={flag.id} className={`af-flag-card ${flag.severity}`}>
                  <div className="af-flag-main">
                    <div className="af-flag-meta-row">
                      <span className="af-flag-cat-badge">{flag.categoryLabelBn}</span>
                      <span className="af-flag-actor">
                        👤 এন্ট্রিকারী: <b>{flag.actorName}</b>
                      </span>
                      <span className="af-flag-time">🕒 {flag.timestampBn}</span>
                    </div>
                    <h4 className="af-flag-title">{flag.titleBn}</h4>
                    <p className="af-flag-desc">{flag.descriptionBn}</p>
                  </div>

                  <div className="af-flag-right">
                    {flag.amountOrLoss > 0 && (
                      <div className="af-flag-amount-box">
                        <span>সংশ্লিষ্ট টাকা / ক্ষতি</span>
                        <strong>{money(flag.amountOrLoss)}</strong>
                      </div>
                    )}
                    <div className="af-flag-action-btns">
                      {flag.relatedEntry && onViewEntry && (
                        <button
                          type="button"
                          className="af-btn-view-entry"
                          onClick={() => onViewEntry(flag.relatedEntry!)}
                        >
                          <Eye size={14} /> এন্ট্রি দেখুন
                        </button>
                      )}
                      {isRakib && (
                        <button
                          type="button"
                          className="af-btn-delete-item"
                          onClick={() => handleDismissSingleFlag(flag.id)}
                          title="এই অ্যালার্টটি তালিকা থেকে ডিলিট করুন (শুধুমাত্র রাকিব)"
                        >
                          <Trash2 size={14} /> ডিলিট
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: TRAY VS SALES DISCREPANCY ALERT (ট্রে ও স্টকের গরমিল সতর্কতা)
         ===================================================================== */}
      {activeSubTab === 'tray_discrepancy' && (
        <div className="af-surface-card">
          <div className="af-card-head">
            <div className="af-card-title-group">
              <div className="af-card-icon amber">
                <Layers size={20} />
              </div>
              <div className="af-card-title-text">
                <h3>🍱 ২. ট্রে বনাম বিক্রির গরমিল সতর্কতা (Tray vs. Sales Discrepancy Alert)</h3>
                <p>
                  দোকানে বা মেলায় ট্রে-তে মোট কত পিস পণ্য তোলা হয়েছে, কত পিস স্টকে ফেরত গেছে, বর্তমানে ট্রে-তে কত পিস আছে এবং প্রকৃতপক্ষে কত পিস বিক্রয় এন্ট্রি হয়েছে — তার স্বয়ংক্রিয় ক্রস-চেক
                </p>
              </div>
            </div>

            <div className="af-clean-toolbar">
              {trayDiscrepancies.length > 0 && (
                <>
                  <div
                    className="af-num"
                    style={{
                      background: '#fef2f2',
                      border: '1.5px solid #fecaca',
                      color: '#b91c1c',
                      padding: '7px 12px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                    }}
                  >
                    ⚠️ মোট নিখোঁজ মূল্য: {money(trayMissingTotalValue)}
                  </div>
                  {isRakib && (
                    <button
                      type="button"
                      className="af-btn-clean-all"
                      onClick={handleClearAllTrayDiscrepancies}
                    >
                      <Trash2 size={14} /> সব গরমিল পরিষ্কার করুন (
                      {toBengaliNumerals(trayDiscrepancies.length)}টি)
                    </button>
                  )}
                </>
              )}
              {isRakib && (afSettings.dismissedTrayKeys?.length || 0) > 0 && (
                <button
                  type="button"
                  className="af-btn-restore"
                  onClick={handleRestoreTrayDiscrepancies}
                >
                  <RefreshCw size={13} /> মুছে ফেলা রিস্টোর (
                  {toBengaliNumerals(afSettings.dismissedTrayKeys?.length || 0)}টি)
                </button>
              )}
            </div>
          </div>

          {trayDiscrepancies.length === 0 ? (
            <div className="af-empty-state">
              <CheckCircle2 size={38} style={{ color: '#16a34a' }} />
              <h4>ট্রে এবং বিক্রয় হিসাবের মধ্যে কোনো গরমিল পাওয়া যায়নি!</h4>
              <p>
                ট্রে-তে তোলা পণ্যের সাথে বর্তমান ট্রে স্টক ও বিক্রিত পণ্যের সংখ্যা ১০০% মিলেছে।
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>পণ্য ও কোড</th>
                    <th>ট্রে-তে মোট রিফিল</th>
                    <th>স্টকে ফেরত</th>
                    <th>বর্তমান ট্রে মজুদ</th>
                    <th>ট্রে থেকে বের হয়েছে</th>
                    <th>বিক্রয় রেকর্ড হয়েছে</th>
                    <th>গরমিল / নিখোঁজ পিস</th>
                    <th>আর্থিক ক্ষতি (৳)</th>
                    {isRakib && <th>অ্যাকশন</th>}
                  </tr>
                </thead>
                <tbody>
                  {trayDiscrepancies.map((item) => (
                    <tr key={item.productId} style={{ background: '#fffafb' }}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{item.productName}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          কোড: #{item.sku} • সর্বশেষ: {item.lastUpdatedBy}
                        </div>
                      </td>
                      <td className="af-num">
                        {toBengaliNumerals(item.totalRefilledToTray)} {item.unit}
                      </td>
                      <td className="af-num">
                        {toBengaliNumerals(item.totalReturnedToMain)} {item.unit}
                      </td>
                      <td className="af-num">
                        {toBengaliNumerals(item.currentTrayStock)} {item.unit}
                      </td>
                      <td className="af-num" style={{ fontWeight: 700 }}>
                        {toBengaliNumerals(item.netTrayOutflow)} {item.unit}
                      </td>
                      <td className="af-num" style={{ color: '#0f766e', fontWeight: 700 }}>
                        {toBengaliNumerals(item.recordedSoldQty)} {item.unit}
                      </td>
                      <td>
                        <span
                          className="af-num"
                          style={{
                            background: '#dc2626',
                            color: '#ffffff',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontWeight: 800,
                            fontSize: '12px',
                            display: 'inline-block',
                          }}
                        >
                          ⚠️ {toBengaliNumerals(item.unaccountedMissingQty)} {item.unit} নিখোঁজ
                        </span>
                      </td>
                      <td className="af-num" style={{ fontWeight: 900, color: '#b91c1c', fontSize: '14px' }}>
                        {money(item.estimatedMissingValue)}
                      </td>
                      {isRakib && (
                        <td>
                          <button
                            type="button"
                            className="af-btn-delete-item"
                            onClick={() => handleDismissTrayDiscrepancy(item)}
                          >
                            <Trash2 size={13} /> ডিলিট
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: BLIND CASH CLOSING VERIFICATION & SHORTAGE HISTORY
         ===================================================================== */}
      {activeSubTab === 'blind_cash' && (
        <div className="af-surface-card">
          <div className="af-card-head">
            <div className="af-card-title-group">
              <div className="af-card-icon teal">
                <Banknote size={20} />
              </div>
              <div className="af-card-title-text">
                <h3>💵 ১. ব্লাইন্ড ক্যাশ কাউন্ট ও ক্যাশ শর্টেজ অডিট (শুধুমাত্র রাকিব)</h3>
                <p>
                  কর্মচারীরা সিস্টেম ব্যালান্স না দেখেই নোট গুনে জমা দেয়। আপনি এখানে সিস্টেমের আসল ক্যাশের সাথে তাদের জমা দেওয়া ক্যাশের পার্থক্য (Shortage / Excess) দেখতে পাচ্ছেন।
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                className="af-num"
                style={{
                  background: '#f0fdfa',
                  border: '1px solid #99f6e4',
                  color: '#0f766e',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                আজকের সিস্টেম নিট ক্যাশ: {money(Math.max(0, todayNetCash))}
              </span>
              <span
                className="af-num"
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                মোট ক্যাশ ব্যালান্স: {money(Math.max(0, availableBusinessCash))}
              </span>
            </div>
          </div>

          {/* Interactive Denomination Counter Box inside Rakib Panel */}
          <form onSubmit={handleSubmitBlindCashCount} className="af-denom-box">
            <div className="af-denom-top">
              <strong style={{ fontSize: '14px', color: '#0f172a', fontWeight: 900 }}>
                🧮 নতুন ক্যাশ ড্রয়ার নোট গণনা ও তাৎক্ষণিক মিলকরণ:
              </strong>
              <div className="af-filter-pills">
                <button
                  type="button"
                  onClick={() => setBlindComparisonMode('today_net')}
                  className="af-filter-pill"
                  style={
                    blindComparisonMode === 'today_net'
                      ? { background: '#ccfbf1', borderColor: '#0f766e', color: '#0f766e', fontWeight: 800 }
                      : undefined
                  }
                >
                  আজকের নিট ক্যাশের সাথে মেলান ({money(Math.max(0, todayNetCash))})
                </button>
                <button
                  type="button"
                  onClick={() => setBlindComparisonMode('total_drawer')}
                  className="af-filter-pill"
                  style={
                    blindComparisonMode === 'total_drawer'
                      ? { background: '#dbeafe', borderColor: '#1d4ed8', color: '#1d4ed8', fontWeight: 800 }
                      : undefined
                  }
                >
                  মোট ব্যবসায়িক ব্যালান্সের সাথে মেলান ({money(Math.max(0, availableBusinessCash))})
                </button>
              </div>
            </div>

            <div className="af-denom-grid">
              {denominationMeta.map((item) => {
                const countVal = noteCounts[item.key];
                const numCount = Number(countVal) || 0;
                const subTotal = numCount * item.mult;
                return (
                  <div
                    key={item.key}
                    className={`af-denom-card ${numCount > 0 ? 'has-val' : ''}`}
                  >
                    <div className="af-denom-head">
                      <span
                        className="af-denom-note-badge"
                        style={{ background: item.badgeBg, color: item.badgeColor }}
                      >
                        {item.label}
                      </span>
                      <span className="af-denom-subtotal">= {money(subTotal)}</span>
                    </div>
                    <div className="af-denom-stepper">
                      <button
                        type="button"
                        className="af-denom-step-btn"
                        onClick={() => adjustNoteCount(item.key, -1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        placeholder="০"
                        className="af-denom-input"
                        value={countVal}
                        onChange={(e) =>
                          setNoteCounts((prev) => ({ ...prev, [item.key]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="af-denom-step-btn"
                        onClick={() => adjustNoteCount(item.key, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}

              <div
                className={`af-denom-card ${(Number(noteCounts.n5AndCoins) || 0) > 0 ? 'has-val' : ''}`}
              >
                <div className="af-denom-head">
                  <span
                    className="af-denom-note-badge"
                    style={{ background: '#f1f5f9', color: '#334155' }}
                  >
                    খুচরা কয়েন
                  </span>
                  <span className="af-denom-subtotal">
                    = {money(Number(noteCounts.n5AndCoins) || 0)}
                  </span>
                </div>
                <div className="af-denom-stepper">
                  <button
                    type="button"
                    className="af-denom-step-btn"
                    onClick={() => adjustNoteCount('n5AndCoins', -5)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    placeholder="৳০"
                    className="af-denom-input"
                    value={noteCounts.n5AndCoins}
                    onChange={(e) =>
                      setNoteCounts((prev) => ({ ...prev, n5AndCoins: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="af-denom-step-btn"
                    onClick={() => adjustNoteCount('n5AndCoins', 5)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="af-extra-fields-card">
              <div className="af-field-group">
                <label className="af-field-label">
                  <span className="af-field-icon-badge teal">📱</span>
                  <span>বিকাশ / নগদ একাউন্টে আজকের জমা (যদি থাকে)</span>
                </label>
                <div className="af-input-with-prefix">
                  <span className="af-input-prefix">৳</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="০ (মোবাইল ব্যাংকিং জমা)"
                    className="af-modern-input af-num"
                    value={mobileWalletInput}
                    onChange={(e) => setMobileWalletInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="af-field-group">
                <label className="af-field-label">
                  <span className="af-field-icon-badge amber">📝</span>
                  <span>অডিট নোট / মন্তব্য (ঐচ্ছিক)</span>
                </label>
                <input
                  type="text"
                  className="af-modern-input"
                  placeholder="যেমন: রাত ১০টায় ক্যাশ মিলকরণ..."
                  value={blindCashNote}
                  onChange={(e) => setBlindCashNote(e.target.value)}
                />
              </div>
            </div>

            <div className="af-cash-total-bar">
              <div className="af-cash-total-metrics">
                <div className="af-cash-metric-block">
                  <span>গণনাকৃত মোট ক্যাশ</span>
                  <strong>{money(totalCountedCash)}</strong>
                </div>
                <div className="af-cash-metric-block highlight">
                  <span>তাৎক্ষণিক পার্থক্য (রাকিব ভিউ)</span>
                  <strong
                    style={{
                      color:
                        totalCountedCash -
                          (blindComparisonMode === 'today_net'
                            ? Math.max(0, todayNetCash)
                            : Math.max(0, availableBusinessCash)) <
                        0
                          ? '#f87171'
                          : '#4ade80',
                    }}
                  >
                    {money(
                      totalCountedCash -
                        (blindComparisonMode === 'today_net'
                          ? Math.max(0, todayNetCash)
                          : Math.max(0, availableBusinessCash))
                    )}
                  </strong>
                </div>
              </div>
              <div className="af-cash-submit-row">
                <button type="submit" className="af-btn-submit">
                  <Lock size={15} /> ক্যাশ কাউন্ট সংরক্ষণ করুন
                </button>
              </div>
            </div>
          </form>

          {/* History Table of Blind Cash Counts */}
          {isRakib && blindCashLogs.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <strong style={{ fontSize: '13.5px', color: '#334155' }}>
                ব্লাইন্ড ক্যাশ কাউন্ট ইতিহাস ({toBengaliNumerals(blindCashLogs.length)}টি)
              </strong>
              <button
                type="button"
                className="af-btn-clean-all"
                onClick={handleClearAllBlindCashLogs}
              >
                <Trash2 size={14} /> সব ক্যাশ কাউন্ট ইতিহাস মুছুন
              </button>
            </div>
          )}
          {blindCashLogs.length === 0 ? (
            <div className="empty">এখনো কোনো ব্লাইন্ড ক্যাশ কাউন্ট জমা পড়েনি।</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>সময় ও তারিখ</th>
                    <th>জমাদানকারী</th>
                    <th>নোটের বিবরণ</th>
                    <th>গণনাকৃত মোট ক্যাশ</th>
                    <th>সিস্টেমে প্রত্যাশিত ক্যাশ</th>
                    <th>শর্টেজ / অতিরিক্ত (শুধু রাকিব)</th>
                    {isRakib && <th>অ্যাকশন</th>}
                  </tr>
                </thead>
                <tbody>
                  {blindCashLogs.map((log) => {
                    const isShort = log.difference < 0;
                    const isExcess = log.difference > 0;
                    return (
                      <tr
                        key={log.id}
                        style={{
                          background: isShort ? '#fffafb' : undefined,
                        }}
                      >
                        <td className="af-num">
                          <b>{dateLabel(log.date)}</b>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{log.timestamp}</div>
                        </td>
                        <td>
                          <b>{log.submittedByName}</b>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {log.submittedByRole === 'employee' ? '👷 কর্মচারী' : '👤 অ্যাডমিন'}
                          </div>
                        </td>
                        <td className="af-num" style={{ fontSize: '11.5px', color: '#334155' }}>
                          {[
                            log.notesBreakdown.n1000 > 0 && `১০০০×${log.notesBreakdown.n1000}`,
                            log.notesBreakdown.n500 > 0 && `৫০০×${log.notesBreakdown.n500}`,
                            log.notesBreakdown.n200 > 0 && `২০০×${log.notesBreakdown.n200}`,
                            log.notesBreakdown.n100 > 0 && `১০০×${log.notesBreakdown.n100}`,
                            log.notesBreakdown.n50 > 0 && `৫০×${log.notesBreakdown.n50}`,
                            log.notesBreakdown.n20 > 0 && `২০×${log.notesBreakdown.n20}`,
                            log.notesBreakdown.n10 > 0 && `১০×${log.notesBreakdown.n10}`,
                            log.notesBreakdown.n5AndCoins > 0 &&
                              `খুচরা ৳${log.notesBreakdown.n5AndCoins}`,
                            log.mobileWalletCash > 0 && `মোবাইল ৳${log.mobileWalletCash}`,
                          ]
                            .filter(Boolean)
                            .join(', ') || '—'}
                          {log.note && (
                            <div style={{ color: '#64748b', marginTop: '2px' }}>নোট: {log.note}</div>
                          )}
                        </td>
                        <td className="af-num" style={{ fontWeight: 800, color: '#0f172a' }}>
                          {money(log.totalCountedCash)}
                        </td>
                        <td className="af-num" style={{ fontWeight: 700, color: '#475569' }}>
                          {money(log.expectedSystemCash)}
                        </td>
                        <td>
                          {isShort ? (
                            <span
                              className="af-num"
                              style={{
                                background: '#dc2626',
                                color: '#ffffff',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontWeight: 800,
                                fontSize: '12px',
                                display: 'inline-block',
                              }}
                            >
                              ⚠️ ঘাটতি (Shortage): -{money(Math.abs(log.difference))}
                            </span>
                          ) : isExcess ? (
                            <span
                              className="af-num"
                              style={{
                                background: '#dbeafe',
                                color: '#1d4ed8',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontWeight: 800,
                                fontSize: '12px',
                                display: 'inline-block',
                              }}
                            >
                              +অতিরিক্ত: {money(log.difference)}
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontWeight: 800,
                                fontSize: '12px',
                                display: 'inline-block',
                              }}
                            >
                              ✅ ১০০% সঠিক
                            </span>
                          )}
                        </td>
                        {isRakib && (
                          <td>
                            <button
                              type="button"
                              className="af-btn-delete-item"
                              onClick={() => handleDeleteBlindCashRecord(log.id)}
                            >
                              <Trash2 size={13} /> ডিলিট
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 4: SURPRISE STOCK AUDIT MODE (সারপ্রাইজ স্টক অডিট মোড)
         ===================================================================== */}
      {activeSubTab === 'surprise_audit' && (
        <div className="af-surface-card">
          <div className="af-card-head">
            <div className="af-card-title-group">
              <div className="af-card-icon teal">
                <Sparkles size={20} />
              </div>
              <div className="af-card-title-text">
                <h3>🎯 ৫. সারপ্রাইজ স্টক অডিট মোড (Random Spot-Check Audit)</h3>
                <p>
                  দোকানের শত শত পণ্যের সব না গুনে যেকোনো মুহূর্তে সিস্টেম থেকে দৈবচয়নে ৫টি বা ৮টি দামি পণ্যের নাম নিয়ে সাথে সাথে ফিজিক্যাল স্টক মিলিয়ে দেখুন
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSpotSampleSize(5);
                  handleGenerateSurpriseAuditList(5);
                }}
              >
                <RefreshCw size={14} /> ৫টি র‍্যান্ডম পণ্য তুলুন
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setSpotSampleSize(8);
                  handleGenerateSurpriseAuditList(8);
                }}
              >
                <Sparkles size={14} /> ৮টি র‍্যান্ডম পণ্য তুলুন
              </button>
            </div>
          </div>

          {activeSpotItems.length > 0 && (
            <form
              onSubmit={handleSaveSurpriseAudit}
              className="af-denom-box"
              style={{ borderColor: '#0d9488', background: '#f0fdfa' }}
            >
              <h4 style={{ margin: 0, fontSize: '14.5px', color: '#0f766e', fontWeight: 900 }}>
                📋 এখনই নিচের {toBengaliNumerals(activeSpotItems.length)}টি পণ্যের বাস্তব মজুদ (তাক + ট্রে) গুনুন:
              </h4>
              <div className="table-wrap" style={{ background: '#ffffff' }}>
                <table>
                  <thead>
                    <tr>
                      <th>পণ্য ও কোড</th>
                      <th>মূল স্টক (তাক)</th>
                      <th>ট্রে স্টক</th>
                      <th>সিস্টেমে মোট থাকার কথা</th>
                      <th>বাস্তবে গুনে পাওয়া গেল (পিস)</th>
                      <th>তাৎক্ষণিক ফলাফল</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSpotItems.map((item, idx) => {
                      const p = item.product;
                      const expected =
                        (Number(p.currentStock) || 0) + (Number(p.trayStock) || 0);
                      const counted = Number(item.physicalCountInput) || 0;
                      const missing = Math.max(0, expected - counted);
                      const lossVal = missing * (Number(p.sellingPrice) || 0);
                      return (
                        <tr key={p.id}>
                          <td>
                            <b>{p.name}</b>
                            <div className="af-num" style={{ fontSize: '11px', color: '#64748b' }}>
                              কোড: #{p.sku || idx + 1} • বিক্রয়মূল্য: {money(p.sellingPrice)}
                            </div>
                          </td>
                          <td className="af-num">
                            {toBengaliNumerals(Number(p.currentStock) || 0)} {p.unit}
                          </td>
                          <td className="af-num">
                            {toBengaliNumerals(Number(p.trayStock) || 0)} {p.unit}
                          </td>
                          <td className="af-num" style={{ fontWeight: 800, color: '#0f172a' }}>
                            {toBengaliNumerals(expected)} {p.unit}
                          </td>
                          <td style={{ maxWidth: '170px' }}>
                            <div className="af-denom-stepper">
                              <button
                                type="button"
                                className="af-denom-step-btn"
                                onClick={() => {
                                  setActiveSpotItems((prev) =>
                                    prev.map((row, rIdx) =>
                                      rIdx === idx
                                        ? {
                                            ...row,
                                            physicalCountInput: String(
                                              Math.max(0, (Number(row.physicalCountInput) || 0) - 1)
                                            ),
                                          }
                                        : row
                                    )
                                  );
                                }}
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="0"
                                className="af-denom-input"
                                value={item.physicalCountInput}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setActiveSpotItems((prev) =>
                                    prev.map((row, rIdx) =>
                                      rIdx === idx ? { ...row, physicalCountInput: val } : row
                                    )
                                  );
                                }}
                                style={{
                                  borderColor: missing > 0 ? '#dc2626' : '#cbd5e1',
                                }}
                              />
                              <button
                                type="button"
                                className="af-denom-step-btn"
                                onClick={() => {
                                  setActiveSpotItems((prev) =>
                                    prev.map((row, rIdx) =>
                                      rIdx === idx
                                        ? {
                                            ...row,
                                            physicalCountInput: String(
                                              (Number(row.physicalCountInput) || 0) + 1
                                            ),
                                          }
                                        : row
                                    )
                                  );
                                }}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>
                            {missing > 0 ? (
                              <span className="af-num" style={{ color: '#dc2626', fontWeight: 800, fontSize: '12px' }}>
                                ⚠️ {toBengaliNumerals(missing)} {p.unit} কম (ক্ষতি: {money(lossVal)})
                              </span>
                            ) : (
                              <span style={{ color: '#16a34a', fontWeight: 800, fontSize: '12px' }}>
                                ✅ মিলেছে
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <input
                  type="text"
                  placeholder="অডিট নোট লিখুন (ঐচ্ছিক)..."
                  value={surpriseAuditNote}
                  onChange={(e) => setSurpriseAuditNote(e.target.value)}
                  style={{ maxWidth: '340px', background: '#ffffff' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setActiveSpotItems([])}
                  >
                    বাতিল
                  </button>
                  <button type="submit" className="primary">
                    <ClipboardCheck size={15} /> সারপ্রাইজ অডিট রিপোর্ট সংরক্ষণ করুন
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Past Surprise Audit Records */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', color: '#334155', fontWeight: 800 }}>
              পূর্ববর্তী সারপ্রাইজ অডিট ইতিহাস ({toBengaliNumerals(surpriseAuditLogs.length)}টি)
            </h4>
            {isRakib && surpriseAuditLogs.length > 0 && (
              <button
                type="button"
                className="af-btn-clean-all"
                onClick={handleClearAllSurpriseAuditLogs}
              >
                <Trash2 size={14} /> সব অডিট ইতিহাস মুছুন
              </button>
            )}
          </div>
          {surpriseAuditLogs.length === 0 ? (
            <div className="empty">
              উপরে &ldquo;৫টি র‍্যান্ডম পণ্য তুলুন&rdquo; বাটনে ক্লিক করে প্রথম সারপ্রাইজ অডিট শুরু করুন।
            </div>
          ) : (
            <div className="af-flag-list">
              {surpriseAuditLogs.map((audit) => (
                <div
                  key={audit.id}
                  className={`af-flag-card ${audit.totalMissingUnits > 0 ? 'high' : ''}`}
                  style={
                    audit.totalMissingUnits === 0
                      ? { background: '#f0fdf4', borderColor: '#86efac', borderLeftColor: '#16a34a' }
                      : undefined
                  }
                >
                  <div className="af-flag-main">
                    <div className="af-flag-meta-row">
                      <strong>📅 {audit.timestamp}</strong>
                      <span className="af-flag-actor">
                        যাচাইকৃত পণ্য: <b>{toBengaliNumerals(audit.totalProductsChecked)}টি</b>
                      </span>
                    </div>
                    {audit.items.some((i) => i.missingUnits > 0) && (
                      <p className="af-flag-desc" style={{ color: '#991b1b', fontWeight: 600 }}>
                        <b>গরমিল পাওয়া পণ্য:</b>{' '}
                        {audit.items
                          .filter((i) => i.missingUnits > 0)
                          .map(
                            (i) =>
                              `${i.productName} (${toBengaliNumerals(i.missingUnits)} ${i.unit} কম = ${money(i.estimatedLossSellValue)})`
                          )
                          .join(' • ')}
                      </p>
                    )}
                  </div>
                  <div className="af-flag-right">
                    {audit.totalMissingUnits > 0 ? (
                      <span
                        className="af-num"
                        style={{
                          background: '#dc2626',
                          color: '#ffffff',
                          padding: '4px 11px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 800,
                        }}
                      >
                        ⚠️ মোট ঘাটতি: {toBengaliNumerals(audit.totalMissingUnits)} পিস (ক্ষতি:{' '}
                        {money(audit.totalLossSellValue)})
                      </span>
                    ) : (
                      <span
                        style={{
                          background: '#16a34a',
                          color: '#ffffff',
                          padding: '4px 11px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 800,
                        }}
                      >
                        ✅ ১০০% সঠিক স্টক
                      </span>
                    )}
                    {isRakib && (
                      <button
                        type="button"
                        className="af-btn-delete-item"
                        onClick={() => handleDeleteSurpriseAuditRecord(audit.id)}
                      >
                        <Trash2 size={13} /> ডিলিট
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 5: SHIFT HANDOVER SIGN-OFF LOGS (শিফট হ্যান্ডওভার লক)
         ===================================================================== */}
      {activeSubTab === 'shift_handover' && (
        <div className="af-surface-card">
          <div className="af-card-head">
            <div className="af-card-title-group">
              <div className="af-card-icon indigo">
                <UserCheck size={20} />
              </div>
              <div className="af-card-title-text">
                <h3>🤝 ৭. শিফট হ্যান্ডওভার লক ও দায়িত্ব হস্তান্তর লগ (Shift Handover Sign-off)</h3>
                <p>
                  একজন কর্মচারী বা পার্টনার ডিউটি শেষ করে অন্যজনকে দোকান বুঝিয়ে দেওয়ার সময়কার ক্যাশ ও ট্রে স্টকের পূর্ণাঙ্গ রেকর্ড
                </p>
              </div>
            </div>
            {isRakib && shiftHandoverLogs.length > 0 && (
              <button
                type="button"
                className="af-btn-clean-all"
                onClick={handleClearAllShiftHandoverLogs}
              >
                <Trash2 size={14} /> সব হ্যান্ডওভার লগ মুছুন
              </button>
            )}
          </div>

          {shiftHandoverLogs.length === 0 ? (
            <div className="empty">এখনো কোনো শিফট হ্যান্ডওভার রেকর্ড জমা পড়েনি।</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>সময় ও তারিখ</th>
                    <th>হস্তান্তরকারী → গ্রহণকারী</th>
                    <th>শিফটের বিক্রয়</th>
                    <th>সচল ট্রে স্টক</th>
                    <th>প্রত্যাশিত নিট ক্যাশ</th>
                    <th>বুঝিয়ে দেওয়া ক্যাশ</th>
                    <th>অডিট স্ট্যাটাস</th>
                    {isRakib && <th>অ্যাকশন</th>}
                  </tr>
                </thead>
                <tbody>
                  {shiftHandoverLogs.map((sh) => (
                    <tr
                      key={sh.id}
                      style={{ background: sh.cashDiscrepancy < 0 ? '#fffafb' : undefined }}
                    >
                      <td className="af-num">
                        <b>{dateLabel(sh.date)}</b>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{sh.timestamp}</div>
                      </td>
                      <td>
                        <b>{sh.outgoingUserName}</b> → <b>{sh.incomingUserName}</b>
                        {sh.note && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>নোট: {sh.note}</div>
                        )}
                      </td>
                      <td className="af-num">
                        {toBengaliNumerals(sh.shiftSalesCount)}টি ({money(sh.shiftSalesAmount)})
                      </td>
                      <td className="af-num">
                        {toBengaliNumerals(sh.activeTrayCount)}টি ট্রে •{' '}
                        {toBengaliNumerals(sh.activeTrayTotalPieces)} পিস
                      </td>
                      <td className="af-num">{money(sh.expectedShiftNetCash)}</td>
                      <td className="af-num" style={{ fontWeight: 800 }}>
                        {money(sh.handedOverDrawerCash)}
                      </td>
                      <td>
                        {sh.cashDiscrepancy < 0 ? (
                          <span
                            className="af-num"
                            style={{
                              background: '#dc2626',
                              color: '#ffffff',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              display: 'inline-block',
                            }}
                          >
                            ⚠️ কম: -{money(Math.abs(sh.cashDiscrepancy))}
                          </span>
                        ) : (
                          <span
                            style={{
                              background: '#dcfce7',
                              color: '#15803d',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              display: 'inline-block',
                            }}
                          >
                            ✅ সঠিক হ্যান্ডওভার
                          </span>
                        )}
                      </td>
                      {isRakib && (
                        <td>
                          <button
                            type="button"
                            className="af-btn-delete-item"
                            onClick={() => handleDeleteShiftHandoverRecord(sh.id)}
                          >
                            <Trash2 size={13} /> ডিলিট
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 6: BACKDATED ENTRY LOCK & MANDATORY EXPENSE PHOTO PROOF
         ===================================================================== */}
      {activeSubTab === 'receipt_and_locks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Security Rule Toggles (Rakib Only) */}
          <div className="af-surface-card">
            <div className="af-card-head">
              <div className="af-card-title-group">
                <div className="af-card-icon teal">
                  <Lock size={20} />
                </div>
                <div className="af-card-title-text">
                  <h3>🔒 ৩ ও ৪. পুরনো তারিখের এন্ট্রি লক এবং খরচের ভাউচার ছবি বাধ্যতামূলক সেটিংস</h3>
                  <p>
                    কর্মচারীদের জন্য পুরনো তারিখে এন্ট্রি বন্ধ রাখুন এবং বড় খরচে রশিদ/ভাউচারের ছবি আপলোড বাধ্যতামূলক করুন
                  </p>
                </div>
              </div>
            </div>

            <div className="af-policy-grid">
              {/* Toggle 1: Backdated Entry Lock */}
              <div
                className={`af-policy-card ${
                  afSettings.backdatedEntryLockEnabled ? 'enabled' : ''
                }`}
              >
                <div className="af-policy-head">
                  <strong>📅 ৩. পুরনো তারিখের এন্ট্রি লক (Backdated Entry Lock)</strong>
                  <button
                    type="button"
                    className={`af-switch-btn ${
                      afSettings.backdatedEntryLockEnabled ? 'on' : 'off'
                    }`}
                    onClick={() =>
                      handleUpdateSettings({
                        backdatedEntryLockEnabled: !afSettings.backdatedEntryLockEnabled,
                      })
                    }
                  >
                    {afSettings.backdatedEntryLockEnabled ? '✅ চালু (ON)' : 'বন্ধ (OFF)'}
                  </button>
                </div>
                <p className="af-policy-desc">
                  এটি চালু থাকলে কর্মচারী বা অন্য কেউ গতকাল বা আগের কোনো তারিখে (Backdated) লেনদেন বা খরচ এন্ট্রি করতে পারবে না। শুধুমাত্র আজকের তারিখেই (<b>{todayIso}</b>) এন্ট্রি দিতে বাধ্য থাকবে। (শুধুমাত্র রাকিব যেকোনো তারিখ ব্যবহার করতে পারবেন)।
                </p>
              </div>

              {/* Toggle 2: Mandatory Expense Photo Proof */}
              <div
                className={`af-policy-card ${
                  afSettings.mandatoryExpensePhotoEnabled ? 'enabled' : ''
                }`}
              >
                <div className="af-policy-head">
                  <strong>📸 ৪. খরচের ভাউচার/রশিদের ছবি বাধ্যতামূলক</strong>
                  <button
                    type="button"
                    className={`af-switch-btn ${
                      afSettings.mandatoryExpensePhotoEnabled ? 'on' : 'off'
                    }`}
                    onClick={() =>
                      handleUpdateSettings({
                        mandatoryExpensePhotoEnabled: !afSettings.mandatoryExpensePhotoEnabled,
                      })
                    }
                  >
                    {afSettings.mandatoryExpensePhotoEnabled ? '✅ চালু (ON)' : 'বন্ধ (OFF)'}
                  </button>
                </div>
                <p className="af-policy-desc">
                  নির্ধারিত টাকার সমান বা বেশি যেকোনো দোকান খরচ এন্ট্রি করার সময় রশিদ/ভাউচারের ছবি আপলোড করা বাধ্যতামূলক থাকবে:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
                    ন্যূনতম টাকার সীমা (৳):
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    className="af-num"
                    value={afSettings.mandatoryExpensePhotoThreshold}
                    onChange={(e) =>
                      handleUpdateSettings({
                        mandatoryExpensePhotoThreshold: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    style={{ width: '110px', padding: '6px 10px', fontWeight: 800, background: '#ffffff' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Expense Voucher Gallery & Audit Table */}
          <div className="af-surface-card">
            <div className="af-card-head">
              <div className="af-card-title-group">
                <div className="af-card-icon indigo">
                  <Camera size={20} />
                </div>
                <div className="af-card-title-text">
                  <h3>
                    🧾 খরচের ভাউচার/রশিদ অডিট তালিকা ({toBengaliNumerals(expensesWithPhoto.length)}টি ছবিসহ •{' '}
                    {toBengaliNumerals(expensesMissingPhoto.length)}টি ছবি ছাড়া)
                  </h3>
                  <p>খরচ এন্ট্রির সাথে সংযুক্ত রশিদ বা ক্যাশ মেমোর ছবি এক ক্লিকে যাচাই করুন</p>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>তারিখ</th>
                    <th>খরচের বিবরণ</th>
                    <th>এন্ট্রিকারী</th>
                    <th>পরিমাণ (৳)</th>
                    <th>ভাউচার / রশিদের ছবি</th>
                  </tr>
                </thead>
                <tbody>
                  {entries
                    .filter((e) => e.type === 'expense' || Boolean(e.receiptImageUrl))
                    .slice(0, 50)
                    .map((e) => (
                      <tr key={e.id}>
                        <td className="af-num">{dateLabel(e.date)}</td>
                        <td>
                          <b>{e.title}</b>
                          {e.notes && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{e.notes}</div>
                          )}
                        </td>
                        <td>{e.createdBy || 'অ্যাডমিন'}</td>
                        <td className="af-num" style={{ fontWeight: 800, color: '#b91c1c' }}>
                          {money(e.amount)}
                        </td>
                        <td>
                          {e.receiptImageUrl ? (
                            <button
                              type="button"
                              className="secondary"
                              style={{
                                padding: '5px 11px',
                                fontSize: '11.5px',
                                borderColor: '#16a34a',
                                color: '#15803d',
                                background: '#f0fdf4',
                                fontWeight: 800,
                              }}
                              onClick={() => setPreviewReceiptEntry(e)}
                            >
                              <Eye size={13} /> ভাউচার ছবি দেখুন
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: '11.5px',
                                fontWeight: 700,
                                color:
                                  e.amount >= (afSettings.mandatoryExpensePhotoThreshold || 100)
                                    ? '#dc2626'
                                    : '#64748b',
                              }}
                            >
                              {e.amount >= (afSettings.mandatoryExpensePhotoThreshold || 100)
                                ? '⚠️ রশিদ সংযুক্ত নেই'
                                : 'সাধারণ খুচরা খরচ'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT IMAGE PREVIEW MODAL */}
      {previewReceiptEntry && previewReceiptEntry.receiptImageUrl && (
        <div className="af-modal-overlay" onClick={() => setPreviewReceiptEntry(null)}>
          <div
            className="af-modal-dialog"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="af-modal-header">
              <div>
                <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#ffffff' }}>
                  🧾 ভাউচার / রশিদের ছবি: {previewReceiptEntry.title}
                </h4>
                <span className="af-num" style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  পরিমাণ: {money(previewReceiptEntry.amount)} • তারিখ:{' '}
                  {dateLabel(previewReceiptEntry.date)}
                </span>
              </div>
              <button
                type="button"
                className="af-modal-close"
                onClick={() => setPreviewReceiptEntry(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="af-modal-body">
              <img
                src={previewReceiptEntry.receiptImageUrl}
                alt={previewReceiptEntry.title}
                style={{
                  width: '100%',
                  maxHeight: '68vh',
                  objectFit: 'contain',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

