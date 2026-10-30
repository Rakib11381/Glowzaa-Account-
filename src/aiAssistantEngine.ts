import {
  toPaisa,
  fromPaisa,
  money,
  toBengaliNumerals,
  dateLabel,
  shares,
  summary,
  calculateCashBalance,
  calculatePartnerAccountBalances,
  matchInvestorIdForEntry,
  getEntrySeller,
} from './accounting';
import type {
  Entry,
  Investor,
  Product,
  ProfitDistribution,
  ApprovalRequest,
  RecordType,
  EntryStatus,
  Role,
  AiEvidenceTransaction,
  AiTableData,
  AiIntegrityNotice,
  AiAssistantStructuredResponse,
} from './types';

export interface AssistantAuthContext {
  authenticated: boolean;
  actorUid: string;
  actorName: string;
  role: Role;
  /**
   * When role === 'investor' (or restricted partner view), the user is only allowed
   * to view their own private partner summary/withdrawals and cannot access another partner's private ledger.
   * Owners / full Dual-Admins ('admin') can view business-wide and partner summaries.
   */
  restrictedPartnerId?: string;
}

export interface BusinessDataset {
  entries: Entry[];
  investors: Investor[];
  products: Product[];
  distributions?: ProfitDistribution[];
  approvalRequests?: ApprovalRequest[];
  referenceDate?: string; // YYYY-MM-DD in Asia/Dhaka, defaults to current Dhaka date
}

export interface TransactionHistoryFilters {
  startDate?: string;
  endDate?: string;
  type?: RecordType | 'all' | 'pending_approval';
  category?: string;
  partner?: string;
  minAmount?: number;
  maxAmount?: number;
  paymentMethod?: string;
  status?: EntryStatus | 'all' | 'pending';
  keyword?: string;
  limit?: number;
}

export interface PeriodRange {
  startDate: string;
  endDate: string;
  label?: string;
}

export const RECORD_TYPE_LABELS_BN: Record<RecordType, string> = {
  investment: 'মূলধন বিনিয়োগ',
  sale: 'পণ্য বিক্রয়',
  purchase: 'মাল ক্রয় (স্টক)',
  expense: 'অতিরিক্ত ও পরিচালন খরচ',
  withdrawal: 'লাভাংশ উত্তোলন',
  loan: 'বিশেষ লোন',
  other: 'অন্যান্য লেনদেন',
};

export function bnToEnDigits(input: string): string {
  const map: Record<string, string> = {
    '০': '0',
    '১': '1',
    '২': '2',
    '৩': '3',
    '৪': '4',
    '৫': '5',
    '৬': '6',
    '৭': '7',
    '৮': '8',
    '৯': '9',
  };
  return String(input || '').replace(/[০-৯]/g, (d) => map[d] || d);
}

export function getDhakaTodayStr(overrideDate?: string): string {
  if (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    return overrideDate;
  }
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function isValidIsoDate(d?: string | null): boolean {
  if (!d) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = new Date(`${d}T12:00:00Z`);
  return !isNaN(parsed.getTime());
}

function shiftDays(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function getMonthBounds(year: number, month1To12: number): { startDate: string; endDate: string } {
  const ym = `${year}-${String(month1To12).padStart(2, '0')}`;
  const lastDay = new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
  return {
    startDate: `${ym}-01`,
    endDate: `${ym}-${String(lastDay).padStart(2, '0')}`,
  };
}

const MONTH_NAME_MAP: Array<{ pattern: RegExp; month: number; labelBn: string }> = [
  { pattern: /জানুয়ারি|জানুয়ারি|january|\bjan\b/i, month: 1, labelBn: 'জানুয়ারি' },
  { pattern: /ফেব্রুয়ারি|ফেব্রুয়ারি|february|\bfeb\b/i, month: 2, labelBn: 'ফেব্রুয়ারি' },
  { pattern: /মার্চ|march|\bmar\b/i, month: 3, labelBn: 'মার্চ' },
  { pattern: /এপ্রিল|april|\bapr\b/i, month: 4, labelBn: 'এপ্রিল' },
  { pattern: /মে|\bmay\b/i, month: 5, labelBn: 'মে' },
  { pattern: /জুন|june|\bjun\b/i, month: 6, labelBn: 'জুন' },
  { pattern: /জুলাই|july|\bjul\b/i, month: 7, labelBn: 'জুলাই' },
  { pattern: /আগস্ট|অগাস্ট|august|\baug\b/i, month: 8, labelBn: 'আগস্ট' },
  { pattern: /সেপ্টেম্বর|september|\bsep\b|\bsept\b/i, month: 9, labelBn: 'সেপ্টেম্বর' },
  { pattern: /অক্টোবর|october|\boct\b/i, month: 10, labelBn: 'অক্টোবর' },
  { pattern: /নভেম্বর|november|\bnov\b/i, month: 11, labelBn: 'নভেম্বর' },
  { pattern: /ডিসেম্বর|december|\bdec\b/i, month: 12, labelBn: 'ডিসেম্বর' },
];

export interface ParsedDateRange {
  startDate?: string;
  endDate?: string;
  labelBn: string;
  isSpecificRange: boolean;
  comparisonPeriods?: {
    periodA: PeriodRange;
    periodB: PeriodRange;
  };
}

/**
 * Parses Bengali, English, and Banglish date/time expressions into exact YYYY-MM-DD ranges
 * in the Asia/Dhaka timezone.
 */
export function parseNaturalDateRange(queryText: string, referenceDate?: string): ParsedDateRange {
  const todayStr = getDhakaTodayStr(referenceDate);
  const [curYearStr, curMonthStr] = todayStr.split('-');
  const curYear = Number(curYearStr);
  const curMonth = Number(curMonthStr);

  const normalized = bnToEnDigits(queryText || '').trim();
  const lower = normalized.toLowerCase();

  // Check for explicit YYYY-MM-DD to YYYY-MM-DD range
  const isoMatches = Array.from(normalized.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)).map((m) => m[1]);
  if (isoMatches.length >= 2) {
    const sorted = [isoMatches[0], isoMatches[1]].sort();
    return {
      startDate: sorted[0],
      endDate: sorted[1],
      labelBn: `${dateLabel(sorted[0])} থেকে ${dateLabel(sorted[1])}`,
      isSpecificRange: true,
    };
  }
  if (isoMatches.length === 1) {
    return {
      startDate: isoMatches[0],
      endDate: isoMatches[0],
      labelBn: `${dateLabel(isoMatches[0])} (${isoMatches[0]})`,
      isSpecificRange: true,
    };
  }

  // Check for "গত মাসের তুলনায় এই মাস" / "গত মাসের সঙ্গে এই মাসের তুলনা" / month-over-month comparison
  if (
    (lower.includes('গত মাস') || lower.includes('last month') || lower.includes('agoto mas') || lower.includes('goto mas')) &&
    (lower.includes('এই মাস') || lower.includes('চলতি মাস') || lower.includes('this month') || lower.includes('ei mas') || lower.includes('তুলনা') || lower.includes('compare'))
  ) {
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const periodA = getMonthBounds(prevYear, prevMonth);
    const periodB = getMonthBounds(curYear, curMonth);
    const prevMonthLabel = MONTH_NAME_MAP.find((m) => m.month === prevMonth)?.labelBn || 'গত মাস';
    const curMonthLabel = MONTH_NAME_MAP.find((m) => m.month === curMonth)?.labelBn || 'এই মাস';
    return {
      startDate: periodA.startDate,
      endDate: periodB.endDate,
      labelBn: `গত মাস (${prevMonthLabel}) বনাম এই মাস (${curMonthLabel})`,
      isSpecificRange: true,
      comparisonPeriods: {
        periodA: { ...periodA, label: `গত মাস (${prevMonthLabel} ${toBengaliNumerals(prevYear)})` },
        periodB: { ...periodB, label: `এই মাস (${curMonthLabel} ${toBengaliNumerals(curYear)})` },
      },
    };
  }

  // Check for specific day + month name (e.g., "১৫ অক্টোবর", "15 October", "October 15", "১৫ অক্টোবর ২০২৬")
  for (const mInfo of MONTH_NAME_MAP) {
    if (mInfo.pattern.test(normalized)) {
      const mSource = mInfo.pattern.source;
      const dayBeforeRegex = new RegExp(`\\b(\\d{1,2})\\s*(?:ই|শে|তারিখ|tarikh|th|st|nd|rd)?\\s*(?:${mSource})(?:\\s*(20\\d{2}))?`, 'i');
      const dayAfterRegex = new RegExp(`(?:${mSource})\\s*(?:মাসের)?\\s*(\\d{1,2})(?:\\s*(?:তারিখ|th|st|nd|rd))?(?:[,\\s]+(20\\d{2}))?`, 'i');

      const beforeMatch = normalized.match(dayBeforeRegex);
      const afterMatch = !beforeMatch ? normalized.match(dayAfterRegex) : null;
      const match = beforeMatch || afterMatch;

      if (match) {
        const dayNum = Number(match[1]);
        const yearNum = match[2] ? Number(match[2]) : curYear;
        if (dayNum >= 1 && dayNum <= 31) {
          const exactDate = `${yearNum}-${String(mInfo.month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          return {
            startDate: exactDate,
            endDate: exactDate,
            labelBn: `${toBengaliNumerals(dayNum)} ${mInfo.labelBn} ${toBengaliNumerals(yearNum)} (${exactDate})`,
            isSpecificRange: true,
          };
        }
      }

      // Whole month match (e.g., "অক্টোবর মাসে", "in October 2026")
      const yearMatch = normalized.match(/\b(20\d{2})\b/);
      const yearNum = yearMatch ? Number(yearMatch[1]) : curYear;
      const bounds = getMonthBounds(yearNum, mInfo.month);
      return {
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        labelBn: `${mInfo.labelBn} ${toBengaliNumerals(yearNum)} (${bounds.startDate} থেকে ${bounds.endDate})`,
        isSpecificRange: true,
      };
    }
  }

  // "আজ পর্যন্ত" / "এখন পর্যন্ত" / "শুরু থেকে আজ পর্যন্ত" / "till today" / "so far" -> All time up to today
  if (
    /আজ\s*পর্যন্ত|এখন\s*পর্যন্ত|শুরু\s*থেকে|সর্বমোট|মোট\s*কত|till\s*today|up\s*to\s*today|all\s*time|so\s*far|aj\s*porjonto|ekhon\s*porjonto/i.test(
      normalized
    ) &&
    !/আজকে|আজকের|এই\s*মাসে|গত\s*মাসে|গতকাল/i.test(normalized)
  ) {
    return {
      startDate: undefined,
      endDate: todayStr,
      labelBn: `শুরু থেকে আজ পর্যন্ত (${dateLabel(todayStr)})`,
      isSpecificRange: false,
    };
  }

  // "গতকাল" / "yesterday" / "gotokal"
  if (/গতকাল|yesterday|\bgotokal\b|\bgoto\s*kal\b/i.test(normalized)) {
    const yest = shiftDays(todayStr, -1);
    return {
      startDate: yest,
      endDate: yest,
      labelBn: `গতকাল (${dateLabel(yest)})`,
      isSpecificRange: true,
    };
  }

  // "আজ" / "আজকে" / "আজকের" / "today" / "ajke" (when not "আজ পর্যন্ত")
  if (
    (/\bআজ\b|আজকে|আজকের|\btoday\b|\bajke\b|\baaj\b/i.test(normalized)) &&
    !/আজ\s*পর্যন্ত|aj\s*porjonto/i.test(normalized)
  ) {
    return {
      startDate: todayStr,
      endDate: todayStr,
      labelBn: `আজ (${dateLabel(todayStr)})`,
      isSpecificRange: true,
    };
  }

  // "গত ৭ দিন" / "এই সপ্তাহ" / "last 7 days" / "this week"
  if (/গত\s*7\s*দিন|গত\s*সাত\s*দিন|এই\s*সপ্তাহ|চলতি\s*সপ্তাহ|last\s*7\s*days|this\s*week|past\s*week/i.test(normalized)) {
    const start7 = shiftDays(todayStr, -6);
    return {
      startDate: start7,
      endDate: todayStr,
      labelBn: `সর্বশেষ ৭ দিন (${dateLabel(start7)} থেকে ${dateLabel(todayStr)})`,
      isSpecificRange: true,
    };
  }

  // "গত ৩০ দিন" / "last 30 days"
  if (/গত\s*30\s*দিন|গত\s*ত্রিশ\s*দিন|last\s*30\s*days/i.test(normalized)) {
    const start30 = shiftDays(todayStr, -29);
    return {
      startDate: start30,
      endDate: todayStr,
      labelBn: `সর্বশেষ ৩০ দিন (${dateLabel(start30)} থেকে ${dateLabel(todayStr)})`,
      isSpecificRange: true,
    };
  }

  // "গত মাস" / "last month" / "goto mas"
  if (/গত\s*মাস|পূর্বের\s*মাস|আগের\s*মাস|last\s*month|previous\s*month|\bgoto\s*mas\b|\bgoto\s*mash\b/i.test(normalized)) {
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const bounds = getMonthBounds(prevYear, prevMonth);
    const mLabel = MONTH_NAME_MAP.find((m) => m.month === prevMonth)?.labelBn || 'গত মাস';
    return {
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      labelBn: `গত মাস — ${mLabel} ${toBengaliNumerals(prevYear)} (${bounds.startDate} থেকে ${bounds.endDate})`,
      isSpecificRange: true,
    };
  }

  // "এই মাস" / "চলতি মাস" / "this month" / "ei mas"
  if (/এই\s*মাস|চলতি\s*মাস|বর্তমান\s*মাস|this\s*month|current\s*month|\bei\s*mas\b|\bei\s*mash\b/i.test(normalized)) {
    const bounds = getMonthBounds(curYear, curMonth);
    const mLabel = MONTH_NAME_MAP.find((m) => m.month === curMonth)?.labelBn || 'চলতি মাস';
    return {
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      labelBn: `এই মাস — ${mLabel} ${toBengaliNumerals(curYear)} (${bounds.startDate} থেকে ${bounds.endDate})`,
      isSpecificRange: true,
    };
  }

  // "এই বছর" / "চলতি বছর" / "this year"
  if (/এই\s*বছর|চলতি\s*বছর|this\s*year|current\s*year|\bei\s*bochor\b/i.test(normalized)) {
    return {
      startDate: `${curYear}-01-01`,
      endDate: `${curYear}-12-31`,
      labelBn: `এই বছর — ${toBengaliNumerals(curYear)} (${curYear}-01-01 থেকে ${curYear}-12-31)`,
      isSpecificRange: true,
    };
  }

  // "গত বছর" / "last year"
  if (/গত\s*বছর|আগের\s*বছর|last\s*year|previous\s*year|\bgoto\s*bochor\b/i.test(normalized)) {
    const lastYr = curYear - 1;
    return {
      startDate: `${lastYr}-01-01`,
      endDate: `${lastYr}-12-31`,
      labelBn: `গত বছর — ${toBengaliNumerals(lastYr)} (${lastYr}-01-01 থেকে ${lastYr}-12-31)`,
      isSpecificRange: true,
    };
  }

  return {
    startDate: undefined,
    endDate: undefined,
    labelBn: 'শুরু থেকে আজ পর্যন্ত (সকল পোস্টেড রেকর্ড)',
    isSpecificRange: false,
  };
}

export function formatDateRangeLabelBn(startDate?: string | null, endDate?: string | null): string {
  if (startDate && endDate) {
    if (startDate === endDate) {
      return `${dateLabel(startDate)} (${startDate})`;
    }
    return `${dateLabel(startDate)} থেকে ${dateLabel(endDate)} (${startDate} – ${endDate})`;
  }
  if (startDate) {
    return `${dateLabel(startDate)} থেকে বর্তমান পর্যন্ত`;
  }
  if (endDate) {
    return `শুরু থেকে ${dateLabel(endDate)} পর্যন্ত`;
  }
  return 'শুরু থেকে আজ পর্যন্ত (সম্পূর্ণ মেয়াদ)';
}

/**
 * Enforces authentication on every AI Assistant tool/request.
 */
export function verifyAssistantAuth(authContext?: AssistantAuthContext | null): AssistantAuthContext {
  if (!authContext || !authContext.authenticated || !authContext.actorUid) {
    throw new Error('UNAUTHORIZED: এই তথ্যে প্রবেশের জন্য অনুমোদিত অ্যাকাউন্টে লগইন করা আবশ্যক।');
  }
  return authContext;
}

/**
 * Canonical partner matching ("Rakib" | "Limon" | investor ID/name)
 */
export function normalizePartnerQueryKey(raw?: string | null): 'rakib' | 'limon' | string {
  if (!raw) return '';
  const s = String(raw).trim().toLowerCase();
  if (s.includes('rakib') || s.includes('রাকিব')) return 'rakib';
  if (s.includes('limon') || s.includes('লিমন')) return 'limon';
  return s;
}

export function doesPartnerMatchQuery(
  investor: { id: string; name: string },
  partnerQuery?: string | null
): boolean {
  if (!partnerQuery) return true;
  const qKey = normalizePartnerQueryKey(partnerQuery);
  if (!qKey || qKey === 'all' || qKey === 'both') return true;
  const invKey = normalizePartnerQueryKey(`${investor.id} ${investor.name}`);
  if (qKey === 'rakib' || qKey === 'limon') {
    return invKey === qKey;
  }
  return (
    investor.id.toLowerCase() === qKey ||
    investor.name.toLowerCase().includes(qKey)
  );
}

/**
 * Enforces partner-level access control:
 * If the caller has `role === 'investor'` or `restrictedPartnerId`, they may only access their own partner record,
 * and cannot query another partner's private summary or withdrawals.
 */
export function enforcePartnerAccessControl(
  requestedPartnerId?: string | null,
  authContext?: AssistantAuthContext | null
): void {
  const ctx = verifyAssistantAuth(authContext);
  if (ctx.role === 'investor' || ctx.restrictedPartnerId) {
    const allowedPartnerKey = normalizePartnerQueryKey(ctx.restrictedPartnerId || ctx.actorUid || ctx.actorName);
    if (!requestedPartnerId) {
      throw new Error(
        'FORBIDDEN_PARTNER_ACCESS: আপনার অ্যাকাউন্ট থেকে শুধুমাত্র আপনার নিজস্ব অংশীদারী হিসাব দেখার অনুমতি রয়েছে।'
      );
    }
    const reqKey = normalizePartnerQueryKey(requestedPartnerId);
    if (reqKey && allowedPartnerKey && reqKey !== allowedPartnerKey) {
      throw new Error(
        `FORBIDDEN_PARTNER_ACCESS: অন্য অংশীদারের (${requestedPartnerId}) ব্যক্তিগত তথ্যে প্রবেশের অনুমতি নেই।`
      );
    }
  }
}

export function filterEntriesByDateRange(
  entries: Entry[],
  startDate?: string | null,
  endDate?: string | null
): Entry[] {
  return entries.filter((e) => {
    const d = e.date || '';
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });
}

export function resolvePartnerDisplayName(entry: Entry, investors: Investor[]): string {
  const matchedId = matchInvestorIdForEntry(entry, investors);
  if (matchedId) {
    const found = investors.find((i) => i.id === matchedId);
    if (found) return found.name;
  }
  const combined = `${entry.investorId || ''} ${entry.title || ''} ${entry.notes || ''}`.toLowerCase();
  if (combined.includes('rakib') || combined.includes('রাকিব')) return 'রাকিব (Rakib)';
  if (combined.includes('limon') || combined.includes('লিমন')) return 'লিমন (Limon)';
  return 'সাধারণ / উল্লেখ নেই';
}

export function toEvidenceTransaction(entry: Entry, investors: Investor[]): AiEvidenceTransaction {
  const profitVal =
    entry.type === 'sale'
      ? entry.grossProfit !== undefined && !isNaN(Number(entry.grossProfit))
        ? Number(entry.grossProfit)
        : entry.profit !== undefined && !isNaN(Number(entry.profit))
        ? Number(entry.profit)
        : entry.cogsAmount !== undefined && !isNaN(Number(entry.cogsAmount))
        ? Math.max(0, Number(entry.amount) - Number(entry.cogsAmount))
        : undefined
      : undefined;

  const cogsVal =
    entry.type === 'sale'
      ? entry.cogsAmount !== undefined && !isNaN(Number(entry.cogsAmount))
        ? Number(entry.cogsAmount)
        : profitVal !== undefined
        ? Math.max(0, Number(entry.amount) - profitVal)
        : undefined
      : undefined;

  return {
    id: entry.id,
    date: entry.date,
    type: entry.type,
    typeLabelBn: RECORD_TYPE_LABELS_BN[entry.type] || entry.type,
    title: entry.title,
    amount: fromPaisa(toPaisa(entry.amount)),
    status: entry.status,
    partnerName:
      entry.type === 'investment' || entry.type === 'withdrawal' || entry.type === 'loan'
        ? resolvePartnerDisplayName(entry, investors)
        : undefined,
    category: entry.category || undefined,
    seller: entry.type === 'sale' ? getEntrySeller(entry) : undefined,
    profit: profitVal !== undefined ? fromPaisa(toPaisa(profitVal)) : undefined,
    cogs: cogsVal !== undefined ? fromPaisa(toPaisa(cogsVal)) : undefined,
    notes: entry.notes || undefined,
  };
}

/**
 * Comprehensive Data Integrity & Discrepancy Check
 */
export interface DataIntegrityReport {
  duplicateEntries: Array<{ original: Entry; duplicate: Entry }>;
  voidEntries: Entry[];
  draftEntries: Entry[];
  pendingApprovalRequests: ApprovalRequest[];
  missingPartnerEntries: Entry[];
  uncategorizedExpenseEntries: Entry[];
  invalidAmountEntries: Entry[];
  ownershipShareMismatches: Array<{
    investorName: string;
    storedEquityShare: number;
    calculatedCapitalShare: number;
  }>;
  balanceReconciliationOk: boolean;
  notices: AiIntegrityNotice[];
}

export function checkFinancialDataIntegrity(
  dataset: BusinessDataset,
  startDate?: string | null,
  endDate?: string | null
): DataIntegrityReport {
  const scopedEntries = filterEntriesByDateRange(dataset.entries || [], startDate, endDate);
  const posted = scopedEntries.filter((e) => e.status === 'posted');
  const draftEntries = scopedEntries.filter((e) => e.status === 'draft');
  const voidEntries = scopedEntries.filter((e) => e.status === 'void');
  const pendingApprovalRequests = (dataset.approvalRequests || []).filter((r) => r.status === 'pending');

  const duplicateEntries: Array<{ original: Entry; duplicate: Entry }> = [];
  const seenKeyMap = new Map<string, Entry>();
  for (const e of posted) {
    const key = `${e.date}|${e.type}|${toPaisa(e.amount)}|${(e.title || '').trim().toLowerCase()}|${e.investorId || ''}`;
    const existing = seenKeyMap.get(key);
    if (existing && existing.id !== e.id) {
      duplicateEntries.push({ original: existing, duplicate: e });
    } else {
      seenKeyMap.set(key, e);
    }
  }

  const missingPartnerEntries = posted.filter((e) => {
    if (e.type !== 'investment' && e.type !== 'withdrawal' && e.type !== 'loan') return false;
    const matched = matchInvestorIdForEntry(e, dataset.investors || []);
    if (matched) return false;
    const resolved = resolvePartnerDisplayName(e, dataset.investors || []);
    return resolved === 'সাধারণ / উল্লেখ নেই';
  });

  const uncategorizedExpenseEntries = posted.filter(
    (e) => e.type === 'expense' && (!e.category || !e.category.trim())
  );

  const invalidAmountEntries = scopedEntries.filter(
    (e) => e.type !== 'other' && (!Number.isFinite(Number(e.amount)) || Number(e.amount) <= 0)
  );

  const ledgers = shares(dataset.investors || [], dataset.entries || []);
  const ownershipShareMismatches: Array<{
    investorName: string;
    storedEquityShare: number;
    calculatedCapitalShare: number;
  }> = [];

  for (const l of ledgers) {
    if (l.equityShare !== undefined && Number.isFinite(Number(l.equityShare))) {
      const diff = Math.abs(Number(l.equityShare) - l.share);
      if (diff >= 0.5 && l.capital > 0) {
        ownershipShareMismatches.push({
          investorName: l.name,
          storedEquityShare: Number(l.equityShare),
          calculatedCapitalShare: l.share,
        });
      }
    }
  }

  const cash = calculateCashBalance(dataset.entries || [], dataset.products || []);
  const expectedAvailablePaisa =
    toPaisa(cash.totalInvestments) +
    toPaisa(cash.netProfit) -
    toPaisa(cash.totalWithdrawals) -
    Math.abs(toPaisa(cash.totalLoans)) +
    (toPaisa(cash.otherInflow) - toPaisa(cash.otherOutflow));
  const balanceReconciliationOk = expectedAvailablePaisa === toPaisa(cash.availableCash);

  const notices: AiIntegrityNotice[] = [];

  if (duplicateEntries.length > 0) {
    notices.push({
      level: 'warning',
      code: 'DUPLICATE_TRANSACTIONS',
      messageBn: `সতর্কতা: একই তারিখ, শিরোনাম ও টাকার পরিমাণের ${toBengaliNumerals(duplicateEntries.length)}টি সম্ভাব্য ডুপ্লিকেট (দ্বৈত) লেনদেন শনাক্ত হয়েছে।`,
    });
  }

  if (draftEntries.length > 0 || pendingApprovalRequests.length > 0) {
    const totalPendingCount = draftEntries.length + pendingApprovalRequests.length;
    notices.push({
      level: 'info',
      code: 'PENDING_TRANSACTIONS_EXCLUDED',
      messageBn: `তথ্য: ${toBengaliNumerals(totalPendingCount)}টি অনুমোদনের অপেক্ষমাণ / ড্রাফট লেনদেন চূড়ান্ত হিসাবের বাইরে রাখা হয়েছে (শুধুমাত্র অনুমোদিত 'Posted' রেকর্ড গণনা করা হয়েছে)।`,
    });
  }

  if (voidEntries.length > 0) {
    notices.push({
      level: 'info',
      code: 'VOID_TRANSACTIONS_EXCLUDED',
      messageBn: `তথ্য: ${toBengaliNumerals(voidEntries.length)}টি বাতিল/রিভার্সকৃত (Void) লেনদেন মূল হিসাব থেকে বাদ দেওয়া হয়েছে।`,
    });
  }

  if (missingPartnerEntries.length > 0) {
    notices.push({
      level: 'warning',
      code: 'MISSING_PARTNER_REFERENCE',
      messageBn: `অসামঞ্জস্য সতর্কতা: ${toBengaliNumerals(missingPartnerEntries.length)}টি বিনিয়োগ/উত্তোলন রেকর্ডে নির্দিষ্ট অংশীদারের নাম উল্লেখ নেই।`,
    });
  }

  if (ownershipShareMismatches.length > 0) {
    const details = ownershipShareMismatches
      .map(
        (m) =>
          `${m.investorName} (প্রোফাইল শেয়ার: ${toBengaliNumerals(m.storedEquityShare.toFixed(2))}%, প্রকৃত মূলধন অনুপাত: ${toBengaliNumerals(m.calculatedCapitalShare.toFixed(2))}%)`
      )
      .join('; ');
    notices.push({
      level: 'info',
      code: 'OWNERSHIP_SHARE_CAPITAL_BASIS',
      messageBn: `মালিকানা অনুপাত নোট: প্রকৃত জমাকৃত মূলধন অনুযায়ী শেয়ার হিসাব করা হয়েছে — ${details}।`,
    });
  }

  return {
    duplicateEntries,
    voidEntries,
    draftEntries,
    pendingApprovalRequests,
    missingPartnerEntries,
    uncategorizedExpenseEntries,
    invalidAmountEntries,
    ownershipShareMismatches,
    balanceReconciliationOk,
    notices,
  };
}

// ============================================================================
// TOOL 1: getInvestmentSummary(startDate, endDate)
// ============================================================================
export interface InvestmentSummaryResult {
  startDate: string | null;
  endDate: string | null;
  dateRangeBn: string;
  totalInvestment: number;
  investmentCount: number;
  partnerBreakdown: Array<{
    partnerId: string;
    partnerName: string;
    totalInvested: number;
    transactionCount: number;
    ownershipPercentage: number;
    latestInvestmentDate: string | null;
    latestInvestmentAmount: number;
  }>;
  unassignedInvestment: number;
  latestInvestment: {
    id: string;
    title: string;
    amount: number;
    date: string;
    partnerName: string;
  } | null;
  records: AiEvidenceTransaction[];
}

export function getInvestmentSummary(
  dataset: BusinessDataset,
  startDate?: string | null,
  endDate?: string | null,
  authContext?: AssistantAuthContext | null
): InvestmentSummaryResult {
  verifyAssistantAuth(authContext);

  const filtered = filterEntriesByDateRange(dataset.entries || [], startDate, endDate);
  const postedInvestments = filtered
    .filter((e) => e.status === 'posted' && e.type === 'investment')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalPaisa = postedInvestments.reduce((sum, e) => sum + toPaisa(e.amount), 0);

  const partnerMap = new Map<
    string,
    {
      partnerId: string;
      partnerName: string;
      paisa: number;
      count: number;
      latestDate: string | null;
      latestAmount: number;
    }
  >();

  for (const inv of dataset.investors || []) {
    partnerMap.set(inv.id, {
      partnerId: inv.id,
      partnerName: inv.name,
      paisa: 0,
      count: 0,
      latestDate: null,
      latestAmount: 0,
    });
  }

  let unassignedPaisa = 0;

  for (const e of postedInvestments) {
    const matchedId = matchInvestorIdForEntry(e, dataset.investors || []);
    const p = toPaisa(e.amount);
    if (matchedId && partnerMap.has(matchedId)) {
      const cur = partnerMap.get(matchedId)!;
      cur.paisa += p;
      cur.count += 1;
      if (!cur.latestDate || e.date >= cur.latestDate) {
        cur.latestDate = e.date;
        cur.latestAmount = fromPaisa(p);
      }
    } else {
      const resolvedName = resolvePartnerDisplayName(e, dataset.investors || []);
      if (resolvedName !== 'সাধারণ / উল্লেখ নেই') {
        const key = normalizePartnerQueryKey(resolvedName) || resolvedName;
        const cur = partnerMap.get(key) || {
          partnerId: key,
          partnerName: resolvedName,
          paisa: 0,
          count: 0,
          latestDate: null,
          latestAmount: 0,
        };
        cur.paisa += p;
        cur.count += 1;
        if (!cur.latestDate || e.date >= cur.latestDate) {
          cur.latestDate = e.date;
          cur.latestAmount = fromPaisa(p);
        }
        partnerMap.set(key, cur);
      } else {
        unassignedPaisa += p;
      }
    }
  }

  const partnerBreakdown = Array.from(partnerMap.values()).map((item) => ({
    partnerId: item.partnerId,
    partnerName: item.partnerName,
    totalInvested: fromPaisa(item.paisa),
    transactionCount: item.count,
    ownershipPercentage: totalPaisa > 0 ? Number(((item.paisa / totalPaisa) * 100).toFixed(2)) : 0,
    latestInvestmentDate: item.latestDate,
    latestInvestmentAmount: item.latestAmount,
  }));

  const latestEntry = postedInvestments[0] || null;

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    dateRangeBn: formatDateRangeLabelBn(startDate, endDate),
    totalInvestment: fromPaisa(totalPaisa),
    investmentCount: postedInvestments.length,
    partnerBreakdown,
    unassignedInvestment: fromPaisa(unassignedPaisa),
    latestInvestment: latestEntry
      ? {
          id: latestEntry.id,
          title: latestEntry.title,
          amount: fromPaisa(toPaisa(latestEntry.amount)),
          date: latestEntry.date,
          partnerName: resolvePartnerDisplayName(latestEntry, dataset.investors || []),
        }
      : null,
    records: postedInvestments.map((e) => toEvidenceTransaction(e, dataset.investors || [])),
  };
}

// ============================================================================
// TOOL 2: getExpenseSummary(startDate, endDate)
// ============================================================================
export interface ExpenseSummaryResult {
  startDate: string | null;
  endDate: string | null;
  dateRangeBn: string;
  totalExpense: number;
  expenseCount: number;
  categoryBreakdown: Array<{
    category: string;
    totalAmount: number;
    count: number;
    sharePercentage: number;
  }>;
  highestExpenseCategory: {
    category: string;
    totalAmount: number;
    count: number;
    sharePercentage: number;
  } | null;
  averageDailyExpense: number;
  averagePerTransaction: number;
  largestSingleExpense: AiEvidenceTransaction | null;
  records: AiEvidenceTransaction[];
}

export function getExpenseSummary(
  dataset: BusinessDataset,
  startDate?: string | null,
  endDate?: string | null,
  authContext?: AssistantAuthContext | null
): ExpenseSummaryResult {
  verifyAssistantAuth(authContext);

  const filtered = filterEntriesByDateRange(dataset.entries || [], startDate, endDate);
  const postedExpenses = filtered
    .filter((e) => e.status === 'posted' && e.type === 'expense')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalPaisa = postedExpenses.reduce((sum, e) => sum + toPaisa(e.amount), 0);

  const catMap = new Map<string, { paisa: number; count: number }>();
  let largestEntry: Entry | null = null;

  for (const e of postedExpenses) {
    const cat = (e.category || '').trim() || 'সাধারণ ও পরিচালন খরচ';
    const p = toPaisa(e.amount);
    const cur = catMap.get(cat) || { paisa: 0, count: 0 };
    cur.paisa += p;
    cur.count += 1;
    catMap.set(cat, cur);

    if (!largestEntry || p > toPaisa(largestEntry.amount)) {
      largestEntry = e;
    }
  }

  const categoryBreakdown = Array.from(catMap.entries())
    .map(([category, info]) => ({
      category,
      totalAmount: fromPaisa(info.paisa),
      count: info.count,
      sharePercentage: totalPaisa > 0 ? Number(((info.paisa / totalPaisa) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // Calculate active days in range for daily average
  let daySpan = 1;
  if (startDate && endDate) {
    const s = new Date(`${startDate}T12:00:00Z`).getTime();
    const e = new Date(`${endDate}T12:00:00Z`).getTime();
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      daySpan = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
    }
  } else if (postedExpenses.length > 1) {
    const dates = postedExpenses.map((x) => x.date).filter(Boolean).sort();
    if (dates.length >= 2) {
      const s = new Date(`${dates[0]}T12:00:00Z`).getTime();
      const e = new Date(`${dates[dates.length - 1]}T12:00:00Z`).getTime();
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        daySpan = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
      }
    }
  }

  const averageDailyExpense = fromPaisa(Math.round(totalPaisa / daySpan));
  const averagePerTransaction =
    postedExpenses.length > 0 ? fromPaisa(Math.round(totalPaisa / postedExpenses.length)) : 0;

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    dateRangeBn: formatDateRangeLabelBn(startDate, endDate),
    totalExpense: fromPaisa(totalPaisa),
    expenseCount: postedExpenses.length,
    categoryBreakdown,
    highestExpenseCategory: categoryBreakdown[0] || null,
    averageDailyExpense,
    averagePerTransaction,
    largestSingleExpense: largestEntry ? toEvidenceTransaction(largestEntry, dataset.investors || []) : null,
    records: postedExpenses.map((e) => toEvidenceTransaction(e, dataset.investors || [])),
  };
}

// ============================================================================
// TOOL 3: getProfitAndLoss(startDate, endDate)
// ============================================================================
export interface ProfitAndLossResult {
  startDate: string | null;
  endDate: string | null;
  dateRangeBn: string;
  totalSales: number;
  salesCount: number;
  totalPurchases: number;
  purchaseCount: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  expenseCount: number;
  netProfit: number;
  isLoss: boolean;
  profitMarginPercentage: number;
  partnerProfitShares: Array<{
    partnerId: string;
    partnerName: string;
    sharePercentage: number;
    allocatedProfit: number;
  }>;
  records: AiEvidenceTransaction[];
}

export function getProfitAndLoss(
  dataset: BusinessDataset,
  startDate?: string | null,
  endDate?: string | null,
  authContext?: AssistantAuthContext | null
): ProfitAndLossResult {
  verifyAssistantAuth(authContext);

  const filtered = filterEntriesByDateRange(dataset.entries || [], startDate, endDate);
  const posted = filtered.filter((e) => e.status === 'posted');
  const fin = summary(posted, dataset.products || []);

  // Partner ownership shares come from total business capital (or equal fallback)
  const partnerLedgers = shares(dataset.investors || [], dataset.entries || []);
  const netProfitPaisa = toPaisa(fin.netProfit);

  const partnerProfitShares = partnerLedgers.map((inv) => ({
    partnerId: inv.id,
    partnerName: inv.name,
    sharePercentage: Number(inv.share.toFixed(2)),
    allocatedProfit: fromPaisa(Math.round((netProfitPaisa * inv.share) / 100)),
  }));

  const pnlEntries = posted.filter(
    (e) => e.type === 'sale' || e.type === 'purchase' || e.type === 'expense'
  );

  const profitMarginPercentage =
    fin.sales > 0 ? Number(((fin.netProfit / fin.sales) * 100).toFixed(2)) : 0;

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    dateRangeBn: formatDateRangeLabelBn(startDate, endDate),
    totalSales: fin.sales,
    salesCount: posted.filter((e) => e.type === 'sale').length,
    totalPurchases: fin.purchases,
    purchaseCount: posted.filter((e) => e.type === 'purchase').length,
    cogs: fin.cogs,
    grossProfit: fin.grossProfit,
    operatingExpenses: fin.expenses,
    expenseCount: posted.filter((e) => e.type === 'expense').length,
    netProfit: fin.netProfit,
    isLoss: fin.netProfit < 0,
    profitMarginPercentage,
    partnerProfitShares,
    records: pnlEntries.map((e) => toEvidenceTransaction(e, dataset.investors || [])),
  };
}

// ============================================================================
// TOOL 4: getCurrentFinancialPosition()
// ============================================================================
export interface CurrentFinancialPositionResult {
  totalCapital: number;
  totalSalesRevenue: number;
  totalPurchases: number;
  totalCogs: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  netProfit: number;
  totalWithdrawals: number;
  totalPartnerLoans: number;
  currentCashBalance: number;
  inventoryValuation: number;
  totalStockUnits: number;
  productCount: number;
  netBusinessWorth: number;
  postedTransactionCount: number;
  draftTransactionCount: number;
  voidTransactionCount: number;
  pendingApprovalCount: number;
  partnerBalances: Array<{
    partnerId: string;
    partnerName: string;
    capital: number;
    sharePercentage: number;
    allocatedProfit: number;
    withdrawals: number;
    loans: number;
    withdrawableLimit: number;
    accountBalance: number;
  }>;
  records: AiEvidenceTransaction[];
}

export function getCurrentFinancialPosition(
  dataset: BusinessDataset,
  authContext?: AssistantAuthContext | null
): CurrentFinancialPositionResult {
  verifyAssistantAuth(authContext);

  const entries = dataset.entries || [];
  const products = dataset.products || [];
  const investors = dataset.investors || [];

  const fin = summary(entries, products);
  const cash = calculateCashBalance(entries, products);
  const partnerAccs = calculatePartnerAccountBalances(investors, entries, products);

  const totalStockUnits = products.reduce((sum, p) => sum + (Number(p.currentStock) || 0), 0);
  const netBusinessWorth = fromPaisa(toPaisa(cash.availableCash) + toPaisa(fin.inventoryValuation));

  const postedEntries = entries
    .filter((e) => e.status === 'posted')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const pendingApprovals = (dataset.approvalRequests || []).filter((r) => r.status === 'pending');

  return {
    totalCapital: cash.totalInvestments,
    totalSalesRevenue: cash.totalSales,
    totalPurchases: cash.totalPurchases,
    totalCogs: cash.totalCogs,
    grossProfit: cash.totalSalesProfit,
    totalOperatingExpenses: cash.totalExpenses,
    netProfit: cash.netProfit,
    totalWithdrawals: cash.totalWithdrawals,
    totalPartnerLoans: cash.totalLoans,
    currentCashBalance: cash.availableCash,
    inventoryValuation: fin.inventoryValuation,
    totalStockUnits,
    productCount: products.length,
    netBusinessWorth,
    postedTransactionCount: fin.postedCount,
    draftTransactionCount: fin.draftCount,
    voidTransactionCount: fin.voidCount,
    pendingApprovalCount: pendingApprovals.length,
    partnerBalances: partnerAccs.map((p) => ({
      partnerId: p.id,
      partnerName: p.name,
      capital: p.capital,
      sharePercentage: Number(p.share.toFixed(2)),
      allocatedProfit: p.allocatedProfit,
      withdrawals: p.withdrawals,
      loans: p.loans,
      withdrawableLimit: p.withdrawableLimit,
      accountBalance: p.accountBalance,
    })),
    records: postedEntries.slice(0, 25).map((e) => toEvidenceTransaction(e, investors)),
  };
}

// ============================================================================
// TOOL 5: getWithdrawals(startDate, endDate, partnerId)
// ============================================================================
export interface WithdrawalsSummaryResult {
  startDate: string | null;
  endDate: string | null;
  dateRangeBn: string;
  partnerFilter: string | null;
  totalWithdrawals: number;
  totalLoans: number;
  combinedOutflow: number;
  withdrawalCount: number;
  loanCount: number;
  partnerBreakdown: Array<{
    partnerId: string;
    partnerName: string;
    periodWithdrawals: number;
    periodLoans: number;
    allTimeAllocatedProfit: number;
    allTimeWithdrawals: number;
    allTimeLoans: number;
    remainingWithdrawableProfit: number;
  }>;
  pendingWithdrawalRequests: Array<{
    id: string;
    title: string;
    requestedByName: string;
    requestedAtFormatted: string;
    amount: number;
  }>;
  records: AiEvidenceTransaction[];
}

export function getWithdrawals(
  dataset: BusinessDataset,
  startDate?: string | null,
  endDate?: string | null,
  partnerId?: string | null,
  authContext?: AssistantAuthContext | null
): WithdrawalsSummaryResult {
  verifyAssistantAuth(authContext);
  if (partnerId) {
    enforcePartnerAccessControl(partnerId, authContext);
  } else if (authContext?.role === 'investor' || authContext?.restrictedPartnerId) {
    partnerId = authContext.restrictedPartnerId || authContext.actorUid;
  }

  const investors = dataset.investors || [];
  const filteredByDate = filterEntriesByDateRange(dataset.entries || [], startDate, endDate);
  const postedWithdrawalsAndLoans = filteredByDate
    .filter((e) => e.status === 'posted' && (e.type === 'withdrawal' || e.type === 'loan'))
    .filter((e) => {
      if (!partnerId) return true;
      const matchedId = matchInvestorIdForEntry(e, investors);
      const matchedInv = matchedId ? investors.find((i) => i.id === matchedId) : null;
      if (matchedInv) {
        return doesPartnerMatchQuery(matchedInv, partnerId);
      }
      const resolved = resolvePartnerDisplayName(e, investors);
      return normalizePartnerQueryKey(resolved) === normalizePartnerQueryKey(partnerId);
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalWithdrawalsPaisa = postedWithdrawalsAndLoans
    .filter((e) => e.type === 'withdrawal')
    .reduce((sum, e) => sum + toPaisa(e.amount), 0);

  const totalLoansPaisa = postedWithdrawalsAndLoans
    .filter((e) => e.type === 'loan')
    .reduce((sum, e) => sum + toPaisa(e.amount), 0);

  const partnerAccs = calculatePartnerAccountBalances(
    investors,
    dataset.entries || [],
    dataset.products || []
  );

  const relevantPartners = partnerAccs.filter((p) => doesPartnerMatchQuery(p, partnerId));

  const partnerBreakdown = relevantPartners.map((p) => {
    const pEntries = postedWithdrawalsAndLoans.filter(
      (e) => matchInvestorIdForEntry(e, investors) === p.id
    );
    const periodWithPaisa = pEntries
      .filter((e) => e.type === 'withdrawal')
      .reduce((s, e) => s + toPaisa(e.amount), 0);
    const periodLoanPaisa = pEntries
      .filter((e) => e.type === 'loan')
      .reduce((s, e) => s + toPaisa(e.amount), 0);

    return {
      partnerId: p.id,
      partnerName: p.name,
      periodWithdrawals: fromPaisa(periodWithPaisa),
      periodLoans: fromPaisa(periodLoanPaisa),
      allTimeAllocatedProfit: p.allocatedProfit,
      allTimeWithdrawals: p.withdrawals,
      allTimeLoans: p.loans,
      remainingWithdrawableProfit: p.withdrawableLimit,
    };
  });

  const pendingWithdrawalRequests = (dataset.approvalRequests || [])
    .filter(
      (r) =>
        r.status === 'pending' &&
        (r.payload?.type === 'withdrawal' || r.payload?.type === 'loan')
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      requestedByName: r.requestedByName,
      requestedAtFormatted: r.requestedAtFormatted,
      amount: Number(r.payload?.amount) || 0,
    }));

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    dateRangeBn: formatDateRangeLabelBn(startDate, endDate),
    partnerFilter: partnerId || null,
    totalWithdrawals: fromPaisa(totalWithdrawalsPaisa),
    totalLoans: fromPaisa(totalLoansPaisa),
    combinedOutflow: fromPaisa(totalWithdrawalsPaisa + totalLoansPaisa),
    withdrawalCount: postedWithdrawalsAndLoans.filter((e) => e.type === 'withdrawal').length,
    loanCount: postedWithdrawalsAndLoans.filter((e) => e.type === 'loan').length,
    partnerBreakdown,
    pendingWithdrawalRequests,
    records: postedWithdrawalsAndLoans.map((e) => toEvidenceTransaction(e, investors)),
  };
}

// ============================================================================
// TOOL 6: getPartnerSummary(partnerId)
// ============================================================================
export interface PartnerSummaryItem {
  partnerId: string;
  partnerName: string;
  active: boolean;
  totalInvestment: number;
  ownershipSharePercentage: number;
  totalProfitShare: number;
  totalWithdrawals: number;
  totalLoans: number;
  remainingProfit: number;
  withdrawableProfitLimit: number;
  netEquityAccountBalance: number;
  netPayableOrReceivableStatusBn: string;
  sellerSalesTotal: number;
  sellerSalesCount: number;
}

export interface PartnerSummaryResult {
  partnerFilter: string | null;
  partners: PartnerSummaryItem[];
  totalCombinedCapital: number;
  totalCombinedWithdrawableProfit: number;
  records: AiEvidenceTransaction[];
}

export function getPartnerSummary(
  dataset: BusinessDataset,
  partnerId?: string | null,
  authContext?: AssistantAuthContext | null
): PartnerSummaryResult {
  verifyAssistantAuth(authContext);
  if (partnerId) {
    enforcePartnerAccessControl(partnerId, authContext);
  } else if (authContext?.role === 'investor' || authContext?.restrictedPartnerId) {
    partnerId = authContext.restrictedPartnerId || authContext.actorUid;
  }

  const investors = dataset.investors || [];
  const entries = dataset.entries || [];
  const products = dataset.products || [];

  const partnerAccs = calculatePartnerAccountBalances(investors, entries, products);
  const filteredPartners = partnerAccs.filter((p) => doesPartnerMatchQuery(p, partnerId));

  const postedEntries = entries.filter((e) => e.status === 'posted');

  const partners: PartnerSummaryItem[] = filteredPartners.map((p) => {
    const pKey = normalizePartnerQueryKey(`${p.id} ${p.name}`);
    const sellerSales = postedEntries.filter(
      (e) =>
        e.type === 'sale' &&
        normalizePartnerQueryKey(getEntrySeller(e)) === pKey
    );
    const sellerSalesPaisa = sellerSales.reduce((s, e) => s + toPaisa(e.amount), 0);

    const statusBn =
      p.remainingProfit > 0
        ? `ব্যবসা থেকে উত্তোলনযোগ্য নিট লাভ প্রাপ্য: ${money(p.withdrawableLimit)}`
        : p.remainingProfit < 0
        ? `অগ্রিম উত্তোলন/লোন সমন্বয়যোগ্য: ${money(Math.abs(p.remainingProfit))}`
        : 'লাভাংশ হিসাব সমান (৳০.০০ প্রাপ্য)';

    return {
      partnerId: p.id,
      partnerName: p.name,
      active: p.active !== false,
      totalInvestment: p.capital,
      ownershipSharePercentage: Number(p.share.toFixed(2)),
      totalProfitShare: p.allocatedProfit,
      totalWithdrawals: p.withdrawals,
      totalLoans: p.loans,
      remainingProfit: p.remainingProfit,
      withdrawableProfitLimit: p.withdrawableLimit,
      netEquityAccountBalance: p.accountBalance,
      netPayableOrReceivableStatusBn: statusBn,
      sellerSalesTotal: fromPaisa(sellerSalesPaisa),
      sellerSalesCount: sellerSales.length,
    };
  });

  const partnerRelatedEntries = postedEntries
    .filter((e) => {
      if (e.type !== 'investment' && e.type !== 'withdrawal' && e.type !== 'loan') return false;
      const mId = matchInvestorIdForEntry(e, investors);
      return filteredPartners.some((fp) => fp.id === mId);
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    partnerFilter: partnerId || null,
    partners,
    totalCombinedCapital: fromPaisa(
      partners.reduce((s, p) => s + toPaisa(p.totalInvestment), 0)
    ),
    totalCombinedWithdrawableProfit: fromPaisa(
      partners.reduce((s, p) => s + toPaisa(p.withdrawableProfitLimit), 0)
    ),
    records: partnerRelatedEntries.map((e) => toEvidenceTransaction(e, investors)),
  };
}

// ============================================================================
// TOOL 7: getTransactionHistory(filters)
// ============================================================================
export interface TransactionHistoryResult {
  filtersApplied: TransactionHistoryFilters;
  dateRangeBn: string;
  totalMatchingCount: number;
  totalAmount: number;
  pendingApprovalRequests: ApprovalRequest[];
  records: AiEvidenceTransaction[];
}

export function getTransactionHistory(
  dataset: BusinessDataset,
  filters: TransactionHistoryFilters = {},
  authContext?: AssistantAuthContext | null
): TransactionHistoryResult {
  verifyAssistantAuth(authContext);

  const investors = dataset.investors || [];
  const entries = dataset.entries || [];
  const approvalRequests = dataset.approvalRequests || [];

  // Special case: user asks specifically for pending/unapproved transactions
  if (filters.status === 'pending' || filters.type === 'pending_approval') {
    const draftEntries = entries.filter((e) => e.status === 'draft');
    const pendingReqs = approvalRequests.filter((r) => r.status === 'pending');

    const mappedDrafts = draftEntries.map((e) => toEvidenceTransaction(e, investors));
    const mappedReqs: AiEvidenceTransaction[] = pendingReqs.map((r) => ({
      id: r.id,
      date: (r.requestedAt || '').slice(0, 10) || getDhakaTodayStr(dataset.referenceDate),
      type: (r.payload?.type as RecordType) || 'other',
      typeLabelBn: `অনুমোদনের অপেক্ষায় (${r.actionType})`,
      title: r.title,
      amount: Number(r.payload?.amount) || 0,
      status: 'draft',
      partnerName: r.requestedByName,
      notes: `অনুমোদনকারী: ${r.targetApproverName} | কারণ: ${r.reason || '—'}`,
    }));

    const combined = [...mappedReqs, ...mappedDrafts];
    const totalAmtPaisa = combined.reduce((s, x) => s + toPaisa(x.amount), 0);

    return {
      filtersApplied: filters,
      dateRangeBn: formatDateRangeLabelBn(filters.startDate, filters.endDate),
      totalMatchingCount: combined.length,
      totalAmount: fromPaisa(totalAmtPaisa),
      pendingApprovalRequests: pendingReqs,
      records: combined,
    };
  }

  let rows = filterEntriesByDateRange(entries, filters.startDate, filters.endDate);

  // Default to posted unless status is explicitly specified
  if (filters.status && filters.status !== 'all') {
    rows = rows.filter((e) => e.status === filters.status);
  } else if (!filters.status) {
    rows = rows.filter((e) => e.status === 'posted');
  }

  if (filters.type && filters.type !== 'all') {
    rows = rows.filter((e) => e.type === filters.type);
  }

  if (filters.category && filters.category.trim()) {
    const qCat = filters.category.trim().toLowerCase();
    rows = rows.filter(
      (e) =>
        (e.category || '').toLowerCase().includes(qCat) ||
        (e.title || '').toLowerCase().includes(qCat)
    );
  }

  if (filters.partner && filters.partner.trim()) {
    const pKey = normalizePartnerQueryKey(filters.partner);
    rows = rows.filter((e) => {
      const resolved = resolvePartnerDisplayName(e, investors);
      const seller = getEntrySeller(e);
      return (
        normalizePartnerQueryKey(resolved) === pKey ||
        normalizePartnerQueryKey(seller) === pKey ||
        resolved.toLowerCase().includes(pKey)
      );
    });
  }

  if (filters.minAmount !== undefined && Number.isFinite(Number(filters.minAmount))) {
    rows = rows.filter((e) => Number(e.amount) >= Number(filters.minAmount));
  }

  if (filters.maxAmount !== undefined && Number.isFinite(Number(filters.maxAmount))) {
    rows = rows.filter((e) => Number(e.amount) <= Number(filters.maxAmount));
  }

  if (filters.paymentMethod && filters.paymentMethod.trim()) {
    const pm = filters.paymentMethod.trim().toLowerCase();
    rows = rows.filter(
      (e) =>
        (e.notes || '').toLowerCase().includes(pm) ||
        (e.title || '').toLowerCase().includes(pm) ||
        (e.category || '').toLowerCase().includes(pm)
    );
  }

  if (filters.keyword && filters.keyword.trim()) {
    const kw = filters.keyword.trim().toLowerCase();
    rows = rows.filter(
      (e) =>
        (e.title || '').toLowerCase().includes(kw) ||
        (e.notes || '').toLowerCase().includes(kw) ||
        (e.category || '').toLowerCase().includes(kw)
    );
  }

  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalMatchingCount = rows.length;
  const totalAmountPaisa = rows.reduce((s, e) => s + toPaisa(e.amount), 0);

  const limit = filters.limit && filters.limit > 0 ? Math.min(200, filters.limit) : 50;
  const sliced = rows.slice(0, limit);

  return {
    filtersApplied: filters,
    dateRangeBn: formatDateRangeLabelBn(filters.startDate, filters.endDate),
    totalMatchingCount,
    totalAmount: fromPaisa(totalAmountPaisa),
    pendingApprovalRequests: [],
    records: sliced.map((e) => toEvidenceTransaction(e, investors)),
  };
}

// ============================================================================
// TOOL 8: compareFinancialPeriods(periodA, periodB)
// ============================================================================
export interface PeriodMetricComparison {
  metricNameBn: string;
  periodAValue: number;
  periodBValue: number;
  difference: number;
  percentageChange: number | null;
  trend: 'up' | 'down' | 'equal';
}

export interface CompareFinancialPeriodsResult {
  periodA: PeriodRange & { dateRangeBn: string };
  periodB: PeriodRange & { dateRangeBn: string };
  metrics: {
    investments: PeriodMetricComparison;
    sales: PeriodMetricComparison;
    purchases: PeriodMetricComparison;
    expenses: PeriodMetricComparison;
    netProfit: PeriodMetricComparison;
    withdrawals: PeriodMetricComparison;
    netBalanceChange: PeriodMetricComparison;
  };
  records: AiEvidenceTransaction[];
}

function buildMetricComparison(
  metricNameBn: string,
  valA: number,
  valB: number
): PeriodMetricComparison {
  const pA = toPaisa(valA);
  const pB = toPaisa(valB);
  const diffPaisa = pB - pA;
  const diff = fromPaisa(diffPaisa);
  const percentageChange =
    pA !== 0 ? Number((((pB - pA) / Math.abs(pA)) * 100).toFixed(2)) : pB !== 0 ? 100 : 0;

  return {
    metricNameBn,
    periodAValue: fromPaisa(pA),
    periodBValue: fromPaisa(pB),
    difference: diff,
    percentageChange,
    trend: diffPaisa > 0 ? 'up' : diffPaisa < 0 ? 'down' : 'equal',
  };
}

export function compareFinancialPeriods(
  dataset: BusinessDataset,
  periodA: PeriodRange,
  periodB: PeriodRange,
  authContext?: AssistantAuthContext | null
): CompareFinancialPeriodsResult {
  verifyAssistantAuth(authContext);

  const entries = dataset.entries || [];
  const products = dataset.products || [];
  const investors = dataset.investors || [];

  const entriesA = filterEntriesByDateRange(entries, periodA.startDate, periodA.endDate).filter(
    (e) => e.status === 'posted'
  );
  const entriesB = filterEntriesByDateRange(entries, periodB.startDate, periodB.endDate).filter(
    (e) => e.status === 'posted'
  );

  const cashA = calculateCashBalance(entriesA, products);
  const cashB = calculateCashBalance(entriesB, products);

  const combinedEntries = [...entriesB, ...entriesA].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );

  return {
    periodA: {
      ...periodA,
      label: periodA.label || formatDateRangeLabelBn(periodA.startDate, periodA.endDate),
      dateRangeBn: formatDateRangeLabelBn(periodA.startDate, periodA.endDate),
    },
    periodB: {
      ...periodB,
      label: periodB.label || formatDateRangeLabelBn(periodB.startDate, periodB.endDate),
      dateRangeBn: formatDateRangeLabelBn(periodB.startDate, periodB.endDate),
    },
    metrics: {
      investments: buildMetricComparison('মূলধন বিনিয়োগ', cashA.totalInvestments, cashB.totalInvestments),
      sales: buildMetricComparison('পণ্য বিক্রয় রাজস্ব', cashA.totalSales, cashB.totalSales),
      purchases: buildMetricComparison('মাল ক্রয় (স্টক)', cashA.totalPurchases, cashB.totalPurchases),
      expenses: buildMetricComparison('পরিচালন ও অতিরিক্ত খরচ', cashA.totalExpenses, cashB.totalExpenses),
      netProfit: buildMetricComparison('প্রকৃত নিট লাভ', cashA.netProfit, cashB.netProfit),
      withdrawals: buildMetricComparison(
        'উত্তোলন ও লোন',
        fromPaisa(toPaisa(cashA.totalWithdrawals) + toPaisa(cashA.totalLoans)),
        fromPaisa(toPaisa(cashB.totalWithdrawals) + toPaisa(cashB.totalLoans))
      ),
      netBalanceChange: buildMetricComparison('নিট ব্যালেন্স পরিবর্তন', cashA.availableCash, cashB.availableCash),
    },
    records: combinedEntries.slice(0, 40).map((e) => toEvidenceTransaction(e, investors)),
  };
}

// ============================================================================
// DETERMINISTIC INTENT PARSER & EVIDENCE BUILDER (BENGALI, ENGLISH, BANGLISH)
// ============================================================================
export type AssistantIntentType =
  | 'investment_summary'
  | 'expense_summary'
  | 'profit_and_loss'
  | 'current_financial_position'
  | 'withdrawals'
  | 'partner_summary'
  | 'transaction_history'
  | 'compare_financial_periods';

export interface DetectedQueryIntent {
  intent: AssistantIntentType;
  startDate?: string;
  endDate?: string;
  dateRangeBn: string;
  partnerId?: string;
  limit?: number;
  typeFilter?: RecordType | 'pending_approval';
  statusFilter?: EntryStatus | 'pending';
  comparisonPeriods?: {
    periodA: PeriodRange;
    periodB: PeriodRange;
  };
}

export function detectNaturalQueryIntent(
  question: string,
  authContext: AssistantAuthContext,
  referenceDate?: string
): DetectedQueryIntent {
  const norm = bnToEnDigits(question || '').trim();
  const lower = norm.toLowerCase();
  const dateInfo = parseNaturalDateRange(norm, referenceDate);

  // Detect partner mention
  let partnerId: string | undefined;
  const mentionsRakib = /রাকিব|rakib/i.test(norm);
  const mentionsLimon = /লিমন|limon/i.test(norm);
  const mentionsSelf = /\bআমার\b|\bনিজের\b|\bmy\b|\bamar\b/i.test(norm);

  if (mentionsRakib && !mentionsLimon) {
    partnerId = 'Rakib';
  } else if (mentionsLimon && !mentionsRakib) {
    partnerId = 'Limon';
  } else if (mentionsSelf && !mentionsRakib && !mentionsLimon) {
    partnerId = authContext.restrictedPartnerId || authContext.actorUid || 'Rakib';
  }

  // 1. Period Comparison ("গত মাসের তুলনায় এই মাসের...", "compare last month and this month")
  if (
    dateInfo.comparisonPeriods ||
    /তুলনা|তুলনায়|বনাম|কম্পেয়ার|compare|comparison|vs\b|versus|কত\s*বেড়েছে|কত\s*কমেছে/i.test(norm)
  ) {
    const todayStr = getDhakaTodayStr(referenceDate);
    const [yrStr, moStr] = todayStr.split('-');
    const curYear = Number(yrStr);
    const curMonth = Number(moStr);
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const pA = getMonthBounds(prevYear, prevMonth);
    const pB = getMonthBounds(curYear, curMonth);
    const prevLabel = MONTH_NAME_MAP.find((m) => m.month === prevMonth)?.labelBn || 'গত মাস';
    const curLabel = MONTH_NAME_MAP.find((m) => m.month === curMonth)?.labelBn || 'এই মাস';

    return {
      intent: 'compare_financial_periods',
      startDate: pA.startDate,
      endDate: pB.endDate,
      dateRangeBn: `গত মাস (${prevLabel}) বনাম এই মাস (${curLabel})`,
      comparisonPeriods: dateInfo.comparisonPeriods || {
        periodA: { ...pA, label: `গত মাস (${prevLabel} ${toBengaliNumerals(prevYear)})` },
        periodB: { ...pB, label: `এই মাস (${curLabel} ${toBengaliNumerals(curYear)})` },
      },
    };
  }

  // 2. Pending / Unapproved Transactions ("অনুমোদনের অপেক্ষায়", "পেন্ডিং", "ড্রাফট", "pending approval")
  if (/অনুমোদনের\s*অপেক্ষায়|অনুমোদন\s*বাকি|অপেক্ষমান|পেন্ডিং|ড্রাফট|pending|unapproved|draft/i.test(norm)) {
    return {
      intent: 'transaction_history',
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      dateRangeBn: dateInfo.labelBn,
      typeFilter: 'pending_approval',
      statusFilter: 'pending',
    };
  }

  // 3. Recent N transactions ("সর্বশেষ ১০টি লেনদেন", "last 10 transactions", "সাম্প্রতিক লেনদেন")
  if (/সর্বশেষ|সাম্প্রতিক|লাস্ট|লেনদেন\s*দেখাও|লেনদেনের\s*তালিকা|recent\s*transactions|last\s*\d+\s*transactions|transaction\s*history/i.test(norm)) {
    const numMatch = norm.match(/\b(\d{1,3})\s*(?:টি|টা|transactions)?\b/i);
    const limit = numMatch ? Math.min(100, Math.max(1, Number(numMatch[1]))) : 10;
    return {
      intent: 'transaction_history',
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      dateRangeBn: dateInfo.labelBn,
      partnerId,
      limit,
    };
  }

  // 4. Withdrawals / Withdrawable Profit ("উত্তোলন", "উত্তোলনযোগ্য", "withdraw", "tulche", "tola hoyeche")
  if (/উত্তোলন|উত্তোলনযোগ্য|উত্তলন|withdraw|withdrawable|কত\s*টাকা\s*তোলা|কত\s*তুলেছে|tola\s*hoyeche/i.test(norm)) {
    return {
      intent: 'withdrawals',
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      dateRangeBn: dateInfo.labelBn,
      partnerId,
    };
  }

  // 5. Investment / Capital ("বিনিয়োগ", "মূলধন", "investment", "capital", "biniyog", "muldhon")
  if (
    /বিনিয়োগ|বিনিয়োগ|মূলধন|মুলধন|ইনভেস্ট|invest|investment|capital|biniyog|muldhon/i.test(norm) &&
    !/আয়\s*ও\s*খরচ|লাভ\s*ও\s*ক্ষতি/i.test(norm)
  ) {
    return {
      intent: 'investment_summary',
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      dateRangeBn: dateInfo.labelBn,
      partnerId,
    };
  }

  // 6. Income & Expense together OR Profit & Loss ("এই মাসের মোট আয় ও খরচ কত?", "কত টাকা লাভ হয়েছে?", "profit", "munafa", "বিক্রয়")
  if (
    /আয়\s*ও\s*খরচ|আয়\s*ও\s*খরচ|লাভ|মুনাফা|লোকসান|ক্ষতি|বিক্রয়|বিক্রি|profit|loss|revenue|income|sales|munafa|lav|labh/i.test(
      norm
    ) &&
    !/কোন\s*খাতে\s*সবচেয়ে\s*বেশি\s*খরচ|সবচেয়ে\s*বেশি\s*খরচ/i.test(norm)
  ) {
    return {
      intent: 'profit_and_loss',
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      dateRangeBn: dateInfo.labelBn,
      partnerId,
    };
  }

  // 7. Expense Summary ("খরচ", "ব্যয়", "কোন খাতে সবচেয়ে বেশি খরচ", "expense", "khoroch")
  if (/খরচ|ব্যয়|ব্যয়|খাত|কোন\s*খাতে|expense|expenses|khoroch|spending|cost/i.test(norm)) {
    return {
      intent: 'expense_summary',
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      dateRangeBn: dateInfo.labelBn,
    };
  }

  // 8. Partner Summary ("রাকিব ও লিমনের হিসাব", "শেয়ার কত", "মালিকানা কত", "partner summary")
  if (
    (mentionsRakib || mentionsLimon || /অংশীদার|পার্টনার|শেয়ার|মালিকানা|partner|share|equity/i.test(norm)) &&
    !/ব্যালেন্স\s*কত/i.test(norm)
  ) {
    return {
      intent: 'partner_summary',
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      dateRangeBn: dateInfo.labelBn,
      partnerId,
    };
  }

  // 9. Default / Current Financial Position ("বর্তমান ব্যালেন্স কত?", "প্রকৃত ব্যালেন্স", "সার্বিক অবস্থা", "balance")
  return {
    intent: 'current_financial_position',
    startDate: dateInfo.startDate,
    endDate: dateInfo.endDate,
    dateRangeBn: dateInfo.labelBn,
  };
}

/**
 * Builds a complete, verified `AiAssistantStructuredResponse` for any tool or natural question.
 * Guarantees 100% deterministic numbers, Bengali formatting, calculation formulas, tables,
 * and underlying evidence records.
 */
export function executeBusinessAssistantQuery(params: {
  question: string;
  dataset: BusinessDataset;
  authContext: AssistantAuthContext;
  forcedToolName?: string;
  forcedToolArgs?: Record<string, any>;
  aiCustomExplanationBn?: string;
  aiModelUsed?: string;
}): AiAssistantStructuredResponse {
  const { question, dataset, authContext, forcedToolName, forcedToolArgs, aiCustomExplanationBn, aiModelUsed } =
    params;

  verifyAssistantAuth(authContext);

  const detected = detectNaturalQueryIntent(question, authContext, dataset.referenceDate);
  const startDate =
    forcedToolArgs?.startDate !== undefined ? forcedToolArgs.startDate : detected.startDate;
  const endDate =
    forcedToolArgs?.endDate !== undefined ? forcedToolArgs.endDate : detected.endDate;
  const partnerId =
    forcedToolArgs?.partnerId !== undefined
      ? forcedToolArgs.partnerId
      : forcedToolArgs?.partner !== undefined
      ? forcedToolArgs.partner
      : detected.partnerId;

  const integrity = checkFinancialDataIntegrity(dataset, startDate, endDate);

  const toolToRun: AssistantIntentType = (() => {
    switch (forcedToolName) {
      case 'getInvestmentSummary':
        return 'investment_summary';
      case 'getExpenseSummary':
        return 'expense_summary';
      case 'getProfitAndLoss':
        return 'profit_and_loss';
      case 'getCurrentFinancialPosition':
        return 'current_financial_position';
      case 'getWithdrawals':
        return 'withdrawals';
      case 'getPartnerSummary':
        return 'partner_summary';
      case 'getTransactionHistory':
        return 'transaction_history';
      case 'compareFinancialPeriods':
        return 'compare_financial_periods';
      default:
        return detected.intent;
    }
  })();

  const nowIso = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // CASE 1: getInvestmentSummary
  // ---------------------------------------------------------------------------
  if (toolToRun === 'investment_summary') {
    const res = getInvestmentSummary(dataset, startDate, endDate, authContext);
    const hasRecords = res.investmentCount > 0;

    const partnerLines = res.partnerBreakdown
      .map(
        (p) =>
          `• ${p.partnerName}: ${money(p.totalInvested, true)} (মালিকানা শেয়ার: ${toBengaliNumerals(p.ownershipPercentage.toFixed(2))}%, ${toBengaliNumerals(p.transactionCount)}টি এন্ট্রি)`
      )
      .join('\n');

    const defaultAnswer = !hasRecords
      ? `এই সময়সীমায় (${res.dateRangeBn}) কোনো অনুমোদিত মূলধন বিনিয়োগ (Investment) লেনদেন পাওয়া যায়নি। (মোট বিনিয়োগ: ৳০.০০)`
      : `নির্ধারিত সময়সীমায় (${res.dateRangeBn}) ব্যবসায় সর্বমোট ${money(res.totalInvestment, true)} মূলধন বিনিয়োগ হয়েছে (মোট ${toBengaliNumerals(res.investmentCount)}টি পোস্টেড লেনদেন)।\n\nঅংশীদারভিত্তিক বিনিয়োগ ও শেয়ার:\n${partnerLines}${
          res.latestInvestment
            ? `\n\nসর্বশেষ বিনিয়োগ: ${dateLabel(res.latestInvestment.date)} তারিখে ${res.latestInvestment.partnerName} কর্তৃক ${money(res.latestInvestment.amount, true)} (${res.latestInvestment.title})।`
            : ''
        }`;

    const tables: AiTableData[] = [
      {
        titleBn: 'অংশীদারভিত্তিক মূলধন বিনিয়োগ ও মালিকানা অনুপাত',
        headers: ['অংশীদারের নাম', 'মোট বিনিয়োগ (৳)', 'লেনদেন সংখ্যা', 'মালিকানা শেয়ার (%)', 'সর্বশেষ বিনিয়োগ'],
        rows: res.partnerBreakdown.map((p) => [
          p.partnerName,
          money(p.totalInvested, true),
          `${toBengaliNumerals(p.transactionCount)}টি`,
          `${toBengaliNumerals(p.ownershipPercentage.toFixed(2))}%`,
          p.latestInvestmentDate
            ? `${dateLabel(p.latestInvestmentDate)} (${money(p.latestInvestmentAmount, true)})`
            : '—',
        ]),
        footer: [
          'সর্বমোট মূলধন',
          money(res.totalInvestment, true),
          `${toBengaliNumerals(res.investmentCount)}টি`,
          res.totalInvestment > 0 ? '১০০.০০%' : '০.০০%',
          '—',
        ],
      },
    ];

    return {
      ok: true,
      question,
      toolUsed: 'getInvestmentSummary',
      toolsCalled: ['getInvestmentSummary'],
      directAnswerBn: aiCustomExplanationBn || defaultAnswer,
      dateRangeBn: res.dateRangeBn,
      startDate: res.startDate,
      endDate: res.endDate,
      calculationMethodBn:
        'মোট বিনিয়োগ = সকল অনুমোদিত (Posted) বিনিয়োগ লেনদেনের যোগফল | অংশীদারের মালিকানা শেয়ার (%) = (অংশীদারের বিনিয়োগ ÷ মোট ব্যবসায়িক মূলধন) × ১০০',
      recordsUsedSummaryBn: `মোট ${toBengaliNumerals(res.investmentCount)}টি পোস্টেড মূলধন বিনিয়োগ (Investment) রেকর্ড এবং ${toBengaliNumerals(res.partnerBreakdown.length)} জন অংশীদারের লেজার যাচাই করা হয়েছে।`,
      tables,
      transactions: res.records,
      pendingApprovalsCount: integrity.pendingApprovalRequests.length,
      integrityNotices: integrity.notices,
      filterPreset: {
        type: 'investment',
        startDate: res.startDate || undefined,
        endDate: res.endDate || undefined,
      },
      aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
      generatedAt: nowIso,
    };
  }

  // ---------------------------------------------------------------------------
  // CASE 2: getExpenseSummary
  // ---------------------------------------------------------------------------
  if (toolToRun === 'expense_summary') {
    const res = getExpenseSummary(dataset, startDate, endDate, authContext);
    const hasRecords = res.expenseCount > 0;
    const topCat = res.highestExpenseCategory;

    const defaultAnswer = !hasRecords
      ? `এই সময়সীমায় (${res.dateRangeBn}) কোনো অতিরিক্ত বা পরিচালন খরচের (Expense) লেনদেন পাওয়া যায়নি। (মোট খরচ: ৳০.০০)`
      : `নির্ধারিত সময়সীমায় (${res.dateRangeBn}) ব্যবসায় মোট অতিরিক্ত ও পরিচালন খরচ হয়েছে ${money(res.totalExpense, true)} (মোট ${toBengaliNumerals(res.expenseCount)}টি খরচের এন্ট্রি)।\n\n` +
        (topCat
          ? `সবচেয়ে বেশি খরচ হয়েছে "${topCat.category}" খাতে — মোট ${money(topCat.totalAmount, true)} (মোট খরচের ${toBengaliNumerals(topCat.sharePercentage.toFixed(2))}%, ${toBengaliNumerals(topCat.count)}টি লেনদেন)।\n`
          : '') +
        `গড় দৈনিক খরচ: ${money(res.averageDailyExpense, true)} | প্রতি লেনদেনে গড় খরচ: ${money(res.averagePerTransaction, true)}` +
        (res.largestSingleExpense
          ? `\nএকক সর্বোচ্চ খরচ: "${res.largestSingleExpense.title}" — ${money(res.largestSingleExpense.amount, true)} (${dateLabel(res.largestSingleExpense.date)})।`
          : '');

    const tables: AiTableData[] = [
      {
        titleBn: 'খাতভিত্তিক (Category-wise) খরচের বিস্তারিত হিসাব',
        headers: ['খরচের খাত / ক্যাটাগরি', 'মোট খরচ (৳)', 'লেনদেন সংখ্যা', 'মোট খরচের হার (%)'],
        rows: res.categoryBreakdown.map((c) => [
          c.category,
          money(c.totalAmount, true),
          `${toBengaliNumerals(c.count)}টি`,
          `${toBengaliNumerals(c.sharePercentage.toFixed(2))}%`,
        ]),
        footer: [
          'সর্বমোট পরিচালন খরচ',
          money(res.totalExpense, true),
          `${toBengaliNumerals(res.expenseCount)}টি`,
          res.totalExpense > 0 ? '১০০.০০%' : '০.০০%',
        ],
      },
    ];

    return {
      ok: true,
      question,
      toolUsed: 'getExpenseSummary',
      toolsCalled: ['getExpenseSummary'],
      directAnswerBn: aiCustomExplanationBn || defaultAnswer,
      dateRangeBn: res.dateRangeBn,
      startDate: res.startDate,
      endDate: res.endDate,
      calculationMethodBn:
        'মোট খরচ = সকল পোস্টেড পরিচালন খরচের (Expense) যোগফল | খাতভিত্তিক হার (%) = (নির্দিষ্ট খাতের খরচ ÷ মোট খরচ) × ১০০',
      recordsUsedSummaryBn: `মোট ${toBengaliNumerals(res.expenseCount)}টি পোস্টেড খরচের লেনদেন (${toBengaliNumerals(res.categoryBreakdown.length)}টি খাত) যাচাই করা হয়েছে।`,
      tables,
      transactions: res.records,
      pendingApprovalsCount: integrity.pendingApprovalRequests.length,
      integrityNotices: integrity.notices,
      filterPreset: {
        type: 'expense',
        startDate: res.startDate || undefined,
        endDate: res.endDate || undefined,
      },
      aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
      generatedAt: nowIso,
    };
  }

  // ---------------------------------------------------------------------------
  // CASE 3: getProfitAndLoss
  // ---------------------------------------------------------------------------
  if (toolToRun === 'profit_and_loss') {
    const res = getProfitAndLoss(dataset, startDate, endDate, authContext);
    const hasActivity = res.salesCount > 0 || res.purchaseCount > 0 || res.expenseCount > 0;

    const partnerProfitLines = res.partnerProfitShares
      .map(
        (p) =>
          `• ${p.partnerName} (${toBengaliNumerals(p.sharePercentage.toFixed(2))}% শেয়ার): ${money(p.allocatedProfit, true)}`
      )
      .join('\n');

    const defaultAnswer = !hasActivity
      ? `এই সময়সীমায় (${res.dateRangeBn}) কোনো বিক্রয়, ক্রয় বা খরচের লেনদেন পাওয়া যায়নি। (নিট লাভ: ৳০.০০)`
      : `নির্ধারিত সময়সীমায় (${res.dateRangeBn}) ব্যবসার আয়-ব্যয় ও লাভ-ক্ষতির সারসংক্ষেপ:\n` +
        `• মোট পণ্য বিক্রয় রাজস্ব (Sales): ${money(res.totalSales, true)} (${toBengaliNumerals(res.salesCount)}টি বিক্রয়)\n` +
        `• বিক্রিত পণ্যের কেনা খরচ (COGS): ${money(res.cogs, true)} (মোট মাল ক্রয়: ${money(res.totalPurchases, true)})\n` +
        `• মোট বিক্রয় মুনাফা (Gross Profit): ${money(res.grossProfit, true)}\n` +
        `• অতিরিক্ত ও পরিচালন খরচ (Expenses): ${money(res.operatingExpenses, true)} (${toBengaliNumerals(res.expenseCount)}টি খরচ)\n` +
        `• প্রকৃত নিট ${res.isLoss ? 'ক্ষতি (Net Loss)' : 'লাভ (Net Profit)'}: ${res.netProfit >= 0 ? '+' : ''}${money(res.netProfit, true)} (লাভের হার: ${toBengaliNumerals(res.profitMarginPercentage.toFixed(2))}%)\n\n` +
        `অংশীদারদের প্রাপ্য লাভাংশ:\n${partnerProfitLines}`;

    const tables: AiTableData[] = [
      {
        titleBn: 'আয়-ব্যয় ও নিট মুনাফা বিবরণী (Profit & Loss Statement)',
        headers: ['হিসাবের খাত', 'লেনদেন সংখ্যা', 'পরিমাণ (৳)'],
        rows: [
          ['মোট বিক্রয় রাজস্ব (Sales Revenue)', `${toBengaliNumerals(res.salesCount)}টি`, money(res.totalSales, true)],
          ['(−) বিক্রিত পণ্যের কেনা খরচ (COGS)', '—', `-${money(res.cogs, true)}`],
          ['(=) মোট বিক্রয় মুনাফা (Gross Profit)', '—', money(res.grossProfit, true)],
          ['(−) পরিচালন ও অতিরিক্ত খরচ (Operating Expenses)', `${toBengaliNumerals(res.expenseCount)}টি`, `-${money(res.operatingExpenses, true)}`],
          ['তথ্যসূত্র: মোট স্টক মাল ক্রয় (Purchases)', `${toBengaliNumerals(res.purchaseCount)}টি`, money(res.totalPurchases, true)],
        ],
        footer: [
          `প্রকৃত নিট ${res.isLoss ? 'ক্ষতি' : 'মুনাফা'} (Net Profit)`,
          `মার্জিন: ${toBengaliNumerals(res.profitMarginPercentage.toFixed(2))}%`,
          `${res.netProfit >= 0 ? '+' : ''}${money(res.netProfit, true)}`,
        ],
      },
      {
        titleBn: 'অংশীদারদের মুনাফার ভাগ (শেয়ার অনুপাতে)',
        headers: ['অংশীদারের নাম', 'মালিকানা শেয়ার (%)', 'প্রাপ্য নিট লাভাংশ (৳)'],
        rows: res.partnerProfitShares.map((p) => [
          p.partnerName,
          `${toBengaliNumerals(p.sharePercentage.toFixed(2))}%`,
          money(p.allocatedProfit, true),
        ]),
      },
    ];

    return {
      ok: true,
      question,
      toolUsed: 'getProfitAndLoss',
      toolsCalled: ['getProfitAndLoss'],
      directAnswerBn: aiCustomExplanationBn || defaultAnswer,
      dateRangeBn: res.dateRangeBn,
      startDate: res.startDate,
      endDate: res.endDate,
      calculationMethodBn:
        'বিক্রয় মুনাফা (Gross Profit) = মোট বিক্রয় − বিক্রিত পণ্যের ক্রয় খরচ (COGS) | প্রকৃত নিট লাভ (Net Profit) = বিক্রয় মুনাফা − পরিচালন ও অতিরিক্ত খরচ',
      recordsUsedSummaryBn: `${toBengaliNumerals(res.salesCount)}টি বিক্রয়, ${toBengaliNumerals(res.purchaseCount)}টি ক্রয় এবং ${toBengaliNumerals(res.expenseCount)}টি খরচের পোস্টেড রেকর্ড ব্যবহৃত হয়েছে।`,
      tables,
      transactions: res.records,
      pendingApprovalsCount: integrity.pendingApprovalRequests.length,
      integrityNotices: integrity.notices,
      filterPreset: {
        type: 'sale',
        startDate: res.startDate || undefined,
        endDate: res.endDate || undefined,
      },
      aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
      generatedAt: nowIso,
    };
  }

  // ---------------------------------------------------------------------------
  // CASE 4: getWithdrawals
  // ---------------------------------------------------------------------------
  if (toolToRun === 'withdrawals') {
    const res = getWithdrawals(dataset, startDate, endDate, partnerId, authContext);
    const isSpecificRange = Boolean(startDate || endDate);

    const partnerLines = res.partnerBreakdown
      .map(
        (p) =>
          `• ${p.partnerName}: ` +
          (isSpecificRange
            ? `এই সময়সীমায় উত্তোলন ${money(p.periodWithdrawals, true)} (লোন: ${money(p.periodLoans, true)}) | `
            : '') +
          `মোট অর্জিত লাভ: ${money(p.allTimeAllocatedProfit, true)}, মোট উত্তোলন ও লোন: ${money(p.allTimeWithdrawals + p.allTimeLoans, true)}, বর্তমান উত্তোলনযোগ্য লাভ: ${money(p.remainingWithdrawableProfit, true)}`
      )
      .join('\n');

    const defaultAnswer =
      isSpecificRange && res.withdrawalCount === 0 && res.loanCount === 0
        ? `নির্ধারিত সময়সীমায় (${res.dateRangeBn}) কোনো লাভাংশ উত্তোলন বা পার্টনার লোনের রেকর্ড পাওয়া যায়নি। (উত্তোলন: ৳০.০০)\n\nঅংশীদারদের বর্তমান উত্তোলনযোগ্য লাভের স্থিতি:\n${partnerLines}`
        : `নির্ধারিত সময়সীমায় (${res.dateRangeBn}) মোট লাভাংশ উত্তোলন করা হয়েছে ${money(res.totalWithdrawals, true)} (${toBengaliNumerals(res.withdrawalCount)}টি উত্তোলন)${
            res.totalLoans > 0
              ? ` এবং বিশেষ পার্টনার লোন নেওয়া হয়েছে ${money(res.totalLoans, true)} (${toBengaliNumerals(res.loanCount)}টি লোন)`
              : ''
          }।\n\nঅংশীদারভিত্তিক উত্তোলন ও উত্তোলনযোগ্য লাভের হিসাব (বিনিয়োগের মূলধন লকড ও উত্তোলনযোগ্য নয়):\n${partnerLines}`;

    const tables: AiTableData[] = [
      {
        titleBn: 'অংশীদারভিত্তিক উত্তোলন ও উত্তোলনযোগ্য নিট লাভের বিবরণী',
        headers: [
          'অংশীদার',
          'অর্জিত মোট লাভাংশ (৳)',
          'মোট উত্তোলন (৳)',
          'বিশেষ লোন (৳)',
          'বর্তমান উত্তোলনযোগ্য লাভ (৳)',
        ],
        rows: res.partnerBreakdown.map((p) => [
          p.partnerName,
          money(p.allTimeAllocatedProfit, true),
          money(p.allTimeWithdrawals, true),
          money(p.allTimeLoans, true),
          money(p.remainingWithdrawableProfit, true),
        ]),
      },
    ];

    return {
      ok: true,
      question,
      toolUsed: 'getWithdrawals',
      toolsCalled: ['getWithdrawals'],
      directAnswerBn: aiCustomExplanationBn || defaultAnswer,
      dateRangeBn: res.dateRangeBn,
      startDate: res.startDate,
      endDate: res.endDate,
      calculationMethodBn:
        'উত্তোলনযোগ্য লাভ = অংশীদারের অর্জিত মোট লাভাংশ − পূর্বের সকল উত্তোলন − বিশেষ লোন (ব্যবসায়িক নিয়ম অনুযায়ী জমাকৃত মূলধন কখনোই উত্তোলনযোগ্য নয়; শুধুমাত্র লাভ উত্তোলনযোগ্য)',
      recordsUsedSummaryBn: `মোট ${toBengaliNumerals(res.withdrawalCount)}টি উত্তোলন এবং ${toBengaliNumerals(res.loanCount)}টি লোনের পোস্টেড রেকর্ড যাচাই করা হয়েছে।`,
      tables,
      transactions: res.records,
      pendingApprovalsCount: res.pendingWithdrawalRequests.length,
      integrityNotices: integrity.notices,
      filterPreset: {
        type: 'withdrawal',
        startDate: res.startDate || undefined,
        endDate: res.endDate || undefined,
      },
      aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
      generatedAt: nowIso,
    };
  }

  // ---------------------------------------------------------------------------
  // CASE 5: getPartnerSummary
  // ---------------------------------------------------------------------------
  if (toolToRun === 'partner_summary') {
    const res = getPartnerSummary(dataset, partnerId, authContext);

    const lines = res.partners
      .map(
        (p) =>
          `• ${p.partnerName} — মূলধন বিনিয়োগ: ${money(p.totalInvestment, true)} (মালিকানা শেয়ার: ${toBengaliNumerals(p.ownershipSharePercentage.toFixed(2))}%) | অর্জিত লাভাংশ: ${money(p.totalProfitShare, true)} | উত্তোলন ও লোন: ${money(p.totalWithdrawals + p.totalLoans, true)} | উত্তোলনযোগ্য লাভ: ${money(p.withdrawableProfitLimit, true)} | মোট ইক্যুইটি ব্যালেন্স: ${money(p.netEquityAccountBalance, true)}`
      )
      .join('\n');

    const defaultAnswer =
      res.partners.length === 0
        ? 'সংশ্লিষ্ট অংশীদারের কোনো তথ্য পাওয়া যায়নি।'
        : `অংশীদারদের সম্পূর্ণ মূলধন, মালিকানা শেয়ার, মুনাফা ও উত্তোলনযোগ্য ব্যালেন্সের হিসাব:\n\n${lines}`;

    const tables: AiTableData[] = [
      {
        titleBn: 'অংশীদারদের সামগ্রিক হিসাব ও ইক্যুইটি সারাংশ',
        headers: [
          'অংশীদারের নাম',
          'স্থির মূলধন (৳)',
          'শেয়ার (%)',
          'অর্জিত লাভাংশ (৳)',
          'উত্তোলন ও লোন (৳)',
          'উত্তোলনযোগ্য লাভ (৳)',
          'মোট ইক্যুইটি ব্যালেন্স (৳)',
        ],
        rows: res.partners.map((p) => [
          p.partnerName,
          money(p.totalInvestment, true),
          `${toBengaliNumerals(p.ownershipSharePercentage.toFixed(2))}%`,
          money(p.totalProfitShare, true),
          money(p.totalWithdrawals + p.totalLoans, true),
          money(p.withdrawableProfitLimit, true),
          money(p.netEquityAccountBalance, true),
        ]),
        footer: [
          'সর্বমোট',
          money(res.totalCombinedCapital, true),
          res.partners.length > 1 ? '১০০.০০%' : `${toBengaliNumerals((res.partners[0]?.ownershipSharePercentage || 0).toFixed(2))}%`,
          money(fromPaisa(res.partners.reduce((s, x) => s + toPaisa(x.totalProfitShare), 0)), true),
          money(fromPaisa(res.partners.reduce((s, x) => s + toPaisa(x.totalWithdrawals + x.totalLoans), 0)), true),
          money(res.totalCombinedWithdrawableProfit, true),
          money(fromPaisa(res.partners.reduce((s, x) => s + toPaisa(x.netEquityAccountBalance), 0)), true),
        ],
      },
    ];

    return {
      ok: true,
      question,
      toolUsed: 'getPartnerSummary',
      toolsCalled: ['getPartnerSummary'],
      directAnswerBn: aiCustomExplanationBn || defaultAnswer,
      dateRangeBn: 'শুরু থেকে আজ পর্যন্ত (অংশীদার লেজার)',
      startDate: null,
      endDate: null,
      calculationMethodBn:
        'মোট ইক্যুইটি ব্যালেন্স = স্থির মূলধন + (অর্জিত লাভাংশ − উত্তোলন − লোন) | উত্তোলনযোগ্য লাভ = max(০, অর্জিত লাভাংশ − উত্তোলন − লোন)',
      recordsUsedSummaryBn: `${toBengaliNumerals(res.partners.length)} জন অংশীদারের প্রোফাইল এবং ${toBengaliNumerals(res.records.length)}টি সংশ্লিষ্ট মূলধন/উত্তোলন/লোন এন্ট্রি যাচাই করা হয়েছে।`,
      tables,
      transactions: res.records,
      pendingApprovalsCount: integrity.pendingApprovalRequests.length,
      integrityNotices: integrity.notices,
      filterPreset: {
        type: 'all',
      },
      aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
      generatedAt: nowIso,
    };
  }

  // ---------------------------------------------------------------------------
  // CASE 6: getTransactionHistory
  // ---------------------------------------------------------------------------
  if (toolToRun === 'transaction_history') {
    const filters: TransactionHistoryFilters = {
      startDate,
      endDate,
      type: forcedToolArgs?.type || detected.typeFilter,
      status: forcedToolArgs?.status || detected.statusFilter,
      category: forcedToolArgs?.category,
      partner: partnerId,
      minAmount: forcedToolArgs?.minAmount,
      maxAmount: forcedToolArgs?.maxAmount,
      paymentMethod: forcedToolArgs?.paymentMethod,
      keyword: forcedToolArgs?.keyword,
      limit: forcedToolArgs?.limit || detected.limit || 10,
    };

    const res = getTransactionHistory(dataset, filters, authContext);

    const isPendingQuery = filters.status === 'pending' || filters.type === 'pending_approval';

    const defaultAnswer =
      res.records.length === 0
        ? isPendingQuery
          ? 'বর্তমানে অনুমোদনের অপেক্ষায় থাকা কোনো পেন্ডিং বা ড্রাফট লেনদেন নেই। সকল লেনদেন অনুমোদিত ও আপডেট রয়েছে।'
          : `এই সময়সীমায় (${res.dateRangeBn}) শর্তানুযায়ী কোনো লেনদেন পাওয়া যায়নি।`
        : isPendingQuery
        ? `বর্তমানে মোট ${toBengaliNumerals(res.totalMatchingCount)}টি লেনদেন/অনুরোধ অনুমোদনের অপেক্ষায় (Pending / Draft) রয়েছে, যার মোট টাকার পরিমাণ ${money(res.totalAmount, true)}।`
        : `নির্ধারিত শর্তানুযায়ী মোট ${toBengaliNumerals(res.totalMatchingCount)}টি লেনদেন পাওয়া গেছে (সর্বমোট পরিমাণ: ${money(res.totalAmount, true)})। নিচে সর্বশেষ ${toBengaliNumerals(res.records.length)}টি লেনদেনের তালিকা দেওয়া হলো:`;

    const tables: AiTableData[] = [
      {
        titleBn: isPendingQuery
          ? 'অনুমোদনের অপেক্ষায় থাকা (Pending / Draft) লেনদেনের তালিকা'
          : `লেনদেনের তালিকা (${toBengaliNumerals(res.records.length)}টি দেখানো হচ্ছে)`,
        headers: ['তারিখ', 'ধরন', 'বিবরণ / শিরোনাম', 'অংশীদার / বিক্রেতা', 'পরিমাণ (৳)'],
        rows: res.records.map((r) => [
          dateLabel(r.date),
          r.typeLabelBn,
          r.title,
          r.partnerName || (r.seller ? `বিক্রেতা: ${r.seller}` : '—'),
          money(r.amount, true),
        ]),
        footer: [
          'মোট',
          `${toBengaliNumerals(res.totalMatchingCount)}টি লেনদেন`,
          '—',
          '—',
          money(res.totalAmount, true),
        ],
      },
    ];

    return {
      ok: true,
      question,
      toolUsed: 'getTransactionHistory',
      toolsCalled: ['getTransactionHistory'],
      directAnswerBn: aiCustomExplanationBn || defaultAnswer,
      dateRangeBn: res.dateRangeBn,
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      calculationMethodBn: isPendingQuery
        ? 'অপেক্ষমাণ তালিকা = দ্বৈত-অনুমোদনের (Dual-Admin Approval) পেন্ডিং রিকোয়েস্ট + ড্রাফট (Draft) লেনদেন'
        : 'ফিল্টারকৃত লেনদেনের তালিকা = তারিখ ও ধরন অনুযায়ী বাছাইকৃত পোস্টেড (Posted) লেনদেনের ক্রমানুসারে তালিকা',
      recordsUsedSummaryBn: `মোট ${toBengaliNumerals(res.totalMatchingCount)}টি ম্যাচিং রেকর্ড পাওয়া গেছে।`,
      tables,
      transactions: res.records,
      pendingApprovalsCount: res.pendingApprovalRequests.length,
      integrityNotices: integrity.notices,
      filterPreset: {
        type:
          filters.type && filters.type !== 'pending_approval'
            ? filters.type
            : 'all',
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      },
      aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
      generatedAt: nowIso,
    };
  }

  // ---------------------------------------------------------------------------
  // CASE 7: compareFinancialPeriods
  // ---------------------------------------------------------------------------
  if (toolToRun === 'compare_financial_periods') {
    const todayStr = getDhakaTodayStr(dataset.referenceDate);
    const [yrStr, moStr] = todayStr.split('-');
    const curYear = Number(yrStr);
    const curMonth = Number(moStr);
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;

    const defaultPeriodA = getMonthBounds(prevYear, prevMonth);
    const defaultPeriodB = getMonthBounds(curYear, curMonth);

    const pA: PeriodRange =
      forcedToolArgs?.periodA ||
      detected.comparisonPeriods?.periodA || {
        ...defaultPeriodA,
        label: `গত মাস (${MONTH_NAME_MAP.find((m) => m.month === prevMonth)?.labelBn || 'গত মাস'})`,
      };
    const pB: PeriodRange =
      forcedToolArgs?.periodB ||
      detected.comparisonPeriods?.periodB || {
        ...defaultPeriodB,
        label: `এই মাস (${MONTH_NAME_MAP.find((m) => m.month === curMonth)?.labelBn || 'এই মাস'})`,
      };

    const res = compareFinancialPeriods(dataset, pA, pB, authContext);
    const m = res.metrics;

    const profitDiffText =
      m.netProfit.difference > 0
        ? `বেড়েছে +${money(m.netProfit.difference, true)} (+${toBengaliNumerals((m.netProfit.percentageChange || 0).toFixed(2))}%)`
        : m.netProfit.difference < 0
        ? `কমেছে -${money(Math.abs(m.netProfit.difference), true)} (${toBengaliNumerals((m.netProfit.percentageChange || 0).toFixed(2))}%)`
        : 'অপরিবর্তিত রয়েছে (৳০.০০ পরিবর্তন)';

    const salesDiffText =
      m.sales.difference >= 0
        ? `+${money(m.sales.difference, true)}`
        : `-${money(Math.abs(m.sales.difference), true)}`;

    const expDiffText =
      m.expenses.difference >= 0
        ? `+${money(m.expenses.difference, true)}`
        : `-${money(Math.abs(m.expenses.difference), true)}`;

    const defaultAnswer =
      `${res.periodA.label} এর তুলনায় ${res.periodB.label}-এ ব্যবসার নিট লাভ ${profitDiffText}।\n\n` +
      `• নিট লাভ: ${res.periodA.label}-এ ${money(m.netProfit.periodAValue, true)} বনাম ${res.periodB.label}-এ ${money(m.netProfit.periodBValue, true)}\n` +
      `• মোট বিক্রয়: ${money(m.sales.periodAValue, true)} থেকে ${money(m.sales.periodBValue, true)} (পরিবর্তন: ${salesDiffText})\n` +
      `• পরিচালন খরচ: ${money(m.expenses.periodAValue, true)} থেকে ${money(m.expenses.periodBValue, true)} (পরিবর্তন: ${expDiffText})\n` +
      `• মূলধন বিনিয়োগ: ${money(m.investments.periodAValue, true)} বনাম ${money(m.investments.periodBValue, true)}`;

    const metricList = [
      m.investments,
      m.sales,
      m.purchases,
      m.expenses,
      m.netProfit,
      m.withdrawals,
      m.netBalanceChange,
    ];

    const tables: AiTableData[] = [
      {
        titleBn: `${res.periodA.label} বনাম ${res.periodB.label} তুলনামূলক আর্থিক প্রতিবেদন`,
        headers: [
          'আর্থিক সূচক',
          res.periodA.label || 'সময়কাল ১',
          res.periodB.label || 'সময়কাল ২',
          'পার্থক্য (৳)',
          'পরিবর্তনের হার (%)',
        ],
        rows: metricList.map((item) => [
          item.metricNameBn,
          money(item.periodAValue, true),
          money(item.periodBValue, true),
          `${item.difference >= 0 ? '+' : '-'}${money(Math.abs(item.difference), true)}`,
          item.percentageChange !== null
            ? `${item.difference >= 0 ? '+' : ''}${toBengaliNumerals(item.percentageChange.toFixed(2))}%`
            : '—',
        ]),
      },
    ];

    return {
      ok: true,
      question,
      toolUsed: 'compareFinancialPeriods',
      toolsCalled: ['compareFinancialPeriods'],
      directAnswerBn: aiCustomExplanationBn || defaultAnswer,
      dateRangeBn: `${res.periodA.label} বনাম ${res.periodB.label}`,
      startDate: pA.startDate,
      endDate: pB.endDate,
      calculationMethodBn:
        'পার্থক্য = (২য় সময়কালের মান − ১ম সময়কালের মান) | পরিবর্তনের হার (%) = ((২য় সময়কাল − ১ম সময়কাল) ÷ |১ম সময়কাল|) × ১০০',
      recordsUsedSummaryBn: `${res.periodA.dateRangeBn} এবং ${res.periodB.dateRangeBn} সময়কালের সকল পোস্টেড লেনদেন তুলনা করা হয়েছে।`,
      tables,
      transactions: res.records,
      pendingApprovalsCount: integrity.pendingApprovalRequests.length,
      integrityNotices: integrity.notices,
      filterPreset: {
        type: 'all',
        startDate: pA.startDate,
        endDate: pB.endDate,
      },
      aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
      generatedAt: nowIso,
    };
  }

  // ---------------------------------------------------------------------------
  // CASE 8 (Default): getCurrentFinancialPosition
  // ---------------------------------------------------------------------------
  const res = getCurrentFinancialPosition(dataset, authContext);

  const partnerSummaryLines = res.partnerBalances
    .map(
      (p) =>
        `• ${p.partnerName} (${toBengaliNumerals(p.sharePercentage.toFixed(2))}% শেয়ার): মূলধন ${money(p.capital, true)}, উত্তোলনযোগ্য লাভ ${money(p.withdrawableLimit, true)}, মোট ইক্যুইটি ${money(p.accountBalance, true)}`
    )
    .join('\n');

  const defaultAnswer =
    `ব্যবসার বর্তমান প্রকৃত ক্যাশ ব্যালেন্স হলো ${money(res.currentCashBalance, true)} এবং স্টকের বর্তমান মজুদ মূল্য ${money(res.inventoryValuation, true)} সহ ব্যবসার মোট নিট সম্পদ মূল্য (Net Worth) ${money(res.netBusinessWorth, true)}।\n\n` +
    `আর্থিক অবস্থানের মূল সারসংক্ষেপ:\n` +
    `• মোট মূলধন বিনিয়োগ (Capital): ${money(res.totalCapital, true)}\n` +
    `• সর্বমোট বিক্রয় রাজস্ব (Sales): ${money(res.totalSalesRevenue, true)} (বিক্রয় মুনাফা: +${money(res.grossProfit, true)})\n` +
    `• সর্বমোট পরিচালন খরচ (Expenses): -${money(res.totalOperatingExpenses, true)}\n` +
    `• সর্বমোট প্রকৃত নিট মুনাফা (Net Profit): ${res.netProfit >= 0 ? '+' : ''}${money(res.netProfit, true)}\n` +
    `• সর্বমোট উত্তোলন ও লোন: -${money(res.totalWithdrawals + res.totalPartnerLoans, true)}\n\n` +
    `অংশীদারদের বর্তমান অবস্থান:\n${partnerSummaryLines}`;

  const tables: AiTableData[] = [
    {
      titleBn: 'ব্যবসার বর্তমান প্রকৃত ব্যালেন্স ও আর্থিক অবস্থান (Financial Position)',
      headers: ['আর্থিক খাত', 'বিবরণ', 'পরিমাণ (৳)'],
      rows: [
        ['মোট মূলধন (Total Capital)', 'অংশীদারদের জমাকৃত স্থির বিনিয়োগ', money(res.totalCapital, true)],
        ['(+) প্রকৃত নিট মুনাফা (Net Profit)', `বিক্রয় মুনাফা (${money(res.grossProfit, true)}) − খরচ (${money(res.totalOperatingExpenses, true)})`, `${res.netProfit >= 0 ? '+' : ''}${money(res.netProfit, true)}`],
        ['(−) সর্বমোট লাভাংশ উত্তোলন (Withdrawals)', 'অংশীদারদের উত্তোলিত লাভ', `-${money(res.totalWithdrawals, true)}`],
        ['(−) বিশেষ পার্টনার লোন (Loans)', 'অংশীদারদের গৃহীত লোন', `-${money(res.totalPartnerLoans, true)}`],
        ['(=) বর্তমান প্রকৃত ক্যাশ ব্যালেন্স', 'মূলধন + নিট লাভ − উত্তোলন − লোন', money(res.currentCashBalance, true)],
        ['(+) বর্তমান স্টক / ইনভেন্টরি মূল্য', `${toBengaliNumerals(res.productCount)}টি পণ্যের ${toBengaliNumerals(res.totalStockUnits)} একক মজুদ`, money(res.inventoryValuation, true)],
      ],
      footer: [
        'ব্যবসার মোট নিট সম্পদ মূল্য (Net Worth)',
        'ক্যাশ ব্যালেন্স + ইনভেন্টরি মূল্য',
        money(res.netBusinessWorth, true),
      ],
    },
  ];

  return {
    ok: true,
    question,
    toolUsed: 'getCurrentFinancialPosition',
    toolsCalled: ['getCurrentFinancialPosition'],
    directAnswerBn: aiCustomExplanationBn || defaultAnswer,
    dateRangeBn: 'শুরু থেকে আজ পর্যন্ত (লাইভ আর্থিক স্ন্যাপশট)',
    startDate: null,
    endDate: null,
    calculationMethodBn:
      'বর্তমান প্রকৃত ব্যালেন্স = মোট মূলধন + প্রকৃত নিট লাভ (বিক্রয় মুনাফা − খরচ) − মোট উত্তোলন − পার্টনার লোন | নিট সম্পদ মূল্য = বর্তমান ব্যালেন্স + ইনভেন্টরি স্টক মূল্য',
    recordsUsedSummaryBn: `সর্বমোট ${toBengaliNumerals(res.postedTransactionCount)}টি পোস্টেড লেনদেন, ${toBengaliNumerals(res.partnerBalances.length)} জন অংশীদার এবং ${toBengaliNumerals(res.productCount)}টি স্টক পণ্য যাচাই করা হয়েছে।`,
    tables,
    transactions: res.records,
    pendingApprovalsCount: res.pendingApprovalCount,
    integrityNotices: integrity.notices,
    filterPreset: {
      type: 'all',
    },
    aiModelUsed: aiModelUsed || 'deterministic-accounting-engine',
    generatedAt: nowIso,
  };
}
