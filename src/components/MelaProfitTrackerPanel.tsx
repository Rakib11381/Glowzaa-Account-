import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  TrendingUp,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Store,
  Search,
  Eye,
  ChevronDown,
  ChevronUp,
  Lock,
  Award,
  Banknote,
  FileText,
  X,
} from 'lucide-react';
import { money, dateLabel, toBengaliNumerals, formatBengaliDateTime } from '../accounting';
import type { Entry, Product, MelaEventRecord } from '../types';
import { getCachedMelaEvents, watchMelaEvents, saveMelaEvents } from '../data';

interface MelaProfitTrackerPanelProps {
  isRakibAdmin: boolean;
  entries: Entry[];
  products: Product[];
  activeSubView?: 'list' | 'create';
  onChangeSubView?: (subView: 'list' | 'create') => void;
}

const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

function getStartOfMonthStr(): string {
  const t = getTodayStr();
  return `${t.slice(0, 7)}-01`;
}

function getNDaysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

function calculateDaysBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 1;
  const s = new Date(`${startStr}T00:00:00`);
  const e = new Date(`${endStr}T00:00:00`);
  const diffMs = e.getTime() - s.getTime();
  if (!Number.isFinite(diffMs)) return 1;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
}

export interface ComputedMelaAnalytics {
  startDate: string;
  endDate: string;
  durationDays: number;
  status: 'running' | 'completed' | 'upcoming';
  statusLabelBn: string;
  statusSubBn: string;
  matchedEntries: Entry[];
  salesCount: number;
  totalSales: number;
  grossProfit: number;
  periodPurchases: number;
  periodExpenses: number;
  stallRentCost: number;
  totalExpensesWithStall: number;
  calculatedNetProfit: number;
  finalNetProfit: number;
  isManualProfit: boolean;
  profitMarginPercent: number;
  avgDailySales: number;
  avgDailyProfit: number;
  rakibSales: number;
  limonSales: number;
  traySales: number;
}

export function computeMelaAnalyticsForRange(
  startDate: string,
  endDate: string,
  entries: Entry[],
  products: Product[],
  stallRentCostInput = 0,
  manualProfitOverride?: number
): ComputedMelaAnalytics {
  const safeStart = startDate || getTodayStr();
  const safeEnd = endDate && endDate >= safeStart ? endDate : safeStart;
  const todayStr = getTodayStr();
  const durationDays = calculateDaysBetween(safeStart, safeEnd);

  let status: 'running' | 'completed' | 'upcoming' = 'running';
  let statusLabelBn = '🟢 চলমান মেলা';
  let statusSubBn = '';

  if (todayStr < safeStart) {
    status = 'upcoming';
    const daysToStart = calculateDaysBetween(todayStr, safeStart) - 1;
    statusLabelBn = '🔵 আসন্ন মেলা';
    statusSubBn = `শুরু হতে ${toBengaliNumerals(Math.max(1, daysToStart))} দিন বাকি`;
  } else if (todayStr > safeEnd) {
    status = 'completed';
    statusLabelBn = '✅ সমাপ্ত মেলা';
    statusSubBn = `মোট ${toBengaliNumerals(durationDays)} দিন চলেছে`;
  } else {
    status = 'running';
    const elapsedDays = calculateDaysBetween(safeStart, todayStr);
    const remainingDays = Math.max(0, calculateDaysBetween(todayStr, safeEnd) - 1);
    statusLabelBn = '🟢 চলমান মেলা';
    statusSubBn =
      remainingDays > 0
        ? `আজ ${toBengaliNumerals(elapsedDays)}তম দিন চলছে • আর ${toBengaliNumerals(remainingDays)} দিন বাকি`
        : `আজ মেলার শেষ দিন (${toBengaliNumerals(durationDays)}তম দিন)`;
  }

  const productMap = new Map<string, Product>();
  for (const p of products) {
    productMap.set(p.id, p);
  }

  const matchedEntries = entries.filter(
    (e) => e.status === 'posted' && e.date >= safeStart && e.date <= safeEnd
  );

  let salesCount = 0;
  let totalSales = 0;
  let grossProfit = 0;
  let periodPurchases = 0;
  let periodExpenses = 0;
  let rakibSales = 0;
  let limonSales = 0;
  let traySales = 0;

  for (const e of matchedEntries) {
    const amt = Number(e.amount) || 0;
    if (e.type === 'sale') {
      salesCount += 1;
      totalSales += amt;

      // Determine gross profit for this sale entry
      let itemProfit = 0;
      if (e.grossProfit !== undefined && e.grossProfit !== null) {
        itemProfit = Number(e.grossProfit) || 0;
      } else if (e.profit !== undefined && e.profit !== null) {
        itemProfit = Number(e.profit) || 0;
      } else if (e.cogsAmount !== undefined && e.cogsAmount !== null) {
        itemProfit = amt - (Number(e.cogsAmount) || 0);
      } else if (e.productId && productMap.has(e.productId)) {
        const prod = productMap.get(e.productId)!;
        const qty = Number(e.quantity) || 1;
        itemProfit = amt - qty * (Number(prod.averageCost) || 0);
      } else {
        itemProfit = amt;
      }
      grossProfit += itemProfit;

      const sellerStr = (e.seller || e.createdBy || '').toLowerCase();
      if (sellerStr.includes('limon') || sellerStr.includes('লিমন')) {
        limonSales += amt;
      } else {
        rakibSales += amt;
      }

      const catOrTitle = `${e.category || ''} ${e.title || ''}`.toLowerCase();
      if (catOrTitle.includes('ট্রে') || catOrTitle.includes('tray')) {
        traySales += amt;
      }
    } else if (e.type === 'purchase') {
      periodPurchases += amt;
    } else if (e.type === 'expense') {
      periodExpenses += amt;
    }
  }

  const stallRentCost = Math.max(0, Number(stallRentCostInput) || 0);
  const totalExpensesWithStall = Math.round((periodExpenses + stallRentCost) * 100) / 100;
  const calculatedNetProfit = Math.round((grossProfit - totalExpensesWithStall) * 100) / 100;

  const isManualProfit =
    manualProfitOverride !== undefined &&
    manualProfitOverride !== null &&
    Number.isFinite(Number(manualProfitOverride));
  const finalNetProfit = isManualProfit
    ? Math.round(Number(manualProfitOverride) * 100) / 100
    : calculatedNetProfit;

  const profitMarginPercent =
    totalSales > 0 ? Math.round((finalNetProfit / totalSales) * 1000) / 10 : 0;
  const avgDailySales = Math.round((totalSales / durationDays) * 100) / 100;
  const avgDailyProfit = Math.round((finalNetProfit / durationDays) * 100) / 100;

  return {
    startDate: safeStart,
    endDate: safeEnd,
    durationDays,
    status,
    statusLabelBn,
    statusSubBn,
    matchedEntries,
    salesCount,
    totalSales: Math.round(totalSales * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    periodPurchases: Math.round(periodPurchases * 100) / 100,
    periodExpenses: Math.round(periodExpenses * 100) / 100,
    stallRentCost,
    totalExpensesWithStall,
    calculatedNetProfit,
    finalNetProfit,
    isManualProfit,
    profitMarginPercent,
    avgDailySales,
    avgDailyProfit,
    rakibSales: Math.round(rakibSales * 100) / 100,
    limonSales: Math.round(limonSales * 100) / 100,
    traySales: Math.round(traySales * 100) / 100,
  };
}

export default function MelaProfitTrackerPanel({
  isRakibAdmin,
  entries,
  products,
  activeSubView,
  onChangeSubView,
}: MelaProfitTrackerPanelProps) {
  const [melaList, setMelaList] = useState<MelaEventRecord[]>(() => getCachedMelaEvents());
  const [internalSubTab, setInternalSubTab] = useState<'list' | 'create'>('list');
  const currentSubTab = activeSubView || internalSubTab;
  const setSubTab = (next: 'list' | 'create') => {
    setInternalSubTab(next);
    if (onChangeSubView) onChangeSubView(next);
  };
  const [editingMelaId, setEditingMelaId] = useState<string | null>(null);
  const [melaName, setMelaName] = useState('');
  const [melaLocation, setMelaLocation] = useState('');
  const [melaStallNo, setMelaStallNo] = useState('');
  const [melaStartDate, setMelaStartDate] = useState(() => getStartOfMonthStr());
  const [melaEndDate, setMelaEndDate] = useState(() => getTodayStr());
  const [melaStallRent, setMelaStallRent] = useState('');
  const [melaManualProfit, setMelaManualProfit] = useState('');
  const [melaNotes, setMelaNotes] = useState('');
  const [isSavingMela, setIsSavingMela] = useState(false);
  const [melaBannerMsg, setMelaBannerMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'completed' | 'upcoming'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMelaId, setExpandedMelaId] = useState<string | null>(null);

  useEffect(() => {
    if (!isRakibAdmin) return;
    const unsub = watchMelaEvents((rows) => {
      setMelaList(rows);
    });
    return () => unsub();
  }, [isRakibAdmin]);

  // Earliest & latest transaction dates in the system for auto-detection
  const activeEntryDateBounds = useMemo(() => {
    const postedDates = entries
      .filter((e) => e.status === 'posted' && (e.type === 'sale' || e.type === 'expense' || e.type === 'purchase'))
      .map((e) => e.date)
      .filter(Boolean)
      .sort();

    if (postedDates.length === 0) {
      return {
        earliest: getStartOfMonthStr(),
        latest: getTodayStr(),
        hasTransactions: false,
      };
    }

    return {
      earliest: postedDates[0],
      latest: postedDates[postedDates.length - 1] > getTodayStr() ? postedDates[postedDates.length - 1] : getTodayStr(),
      hasTransactions: true,
    };
  }, [entries]);

  // Auto-detected live session summary across all posted business dates
  const autoDetectedSession = useMemo(() => {
    return computeMelaAnalyticsForRange(
      activeEntryDateBounds.earliest,
      activeEntryDateBounds.latest,
      entries,
      products,
      0
    );
  }, [activeEntryDateBounds, entries, products]);

  // Live preview of the currently selected form dates
  const formLivePreview = useMemo(() => {
    const manualProf =
      melaManualProfit.trim() !== '' && Number.isFinite(Number(melaManualProfit))
        ? Number(melaManualProfit)
        : undefined;
    return computeMelaAnalyticsForRange(
      melaStartDate || getTodayStr(),
      melaEndDate || melaStartDate || getTodayStr(),
      entries,
      products,
      Number(melaStallRent) || 0,
      manualProf
    );
  }, [melaStartDate, melaEndDate, melaStallRent, melaManualProfit, entries, products]);

  // Enrich all saved Mela records with live calculated analytics
  const enrichedMelas = useMemo(() => {
    return melaList
      .map((item) => {
        const analytics = computeMelaAnalyticsForRange(
          item.startDate,
          item.endDate,
          entries,
          products,
          item.stallRentCost || 0,
          item.manualProfitOverride
        );
        return {
          record: item,
          analytics,
        };
      })
      .sort((a, b) => (b.record.startDate || '').localeCompare(a.record.startDate || ''));
  }, [melaList, entries, products]);

  // Aggregate summary across all Melas
  const overallSummary = useMemo(() => {
    if (enrichedMelas.length === 0) {
      return {
        totalMelas: 0,
        runningCount: autoDetectedSession.status === 'running' ? 1 : 0,
        completedCount: 0,
        upcomingCount: 0,
        grandTotalSales: autoDetectedSession.totalSales,
        grandTotalSalesCount: autoDetectedSession.salesCount,
        grandTotalNetProfit: autoDetectedSession.finalNetProfit,
        topMelaName: activeEntryDateBounds.hasTransactions ? 'চলমান মেলা সেশন (অটো)' : 'কোনো মেলা যোগ করা হয়নি',
        topMelaProfit: autoDetectedSession.finalNetProfit,
      };
    }

    let runningCount = 0;
    let completedCount = 0;
    let upcomingCount = 0;
    let grandTotalSales = 0;
    let grandTotalSalesCount = 0;
    let grandTotalNetProfit = 0;
    let topMelaName = enrichedMelas[0].record.name;
    let topMelaProfit = enrichedMelas[0].analytics.finalNetProfit;

    for (const m of enrichedMelas) {
      if (m.analytics.status === 'running') runningCount += 1;
      else if (m.analytics.status === 'completed') completedCount += 1;
      else upcomingCount += 1;

      grandTotalSales += m.analytics.totalSales;
      grandTotalSalesCount += m.analytics.salesCount;
      grandTotalNetProfit += m.analytics.finalNetProfit;

      if (m.analytics.finalNetProfit > topMelaProfit) {
        topMelaProfit = m.analytics.finalNetProfit;
        topMelaName = m.record.name;
      }
    }

    return {
      totalMelas: enrichedMelas.length,
      runningCount,
      completedCount,
      upcomingCount,
      grandTotalSales: Math.round(grandTotalSales * 100) / 100,
      grandTotalSalesCount,
      grandTotalNetProfit: Math.round(grandTotalNetProfit * 100) / 100,
      topMelaName,
      topMelaProfit: Math.round(topMelaProfit * 100) / 100,
    };
  }, [enrichedMelas, autoDetectedSession, activeEntryDateBounds]);

  const filteredMelas = useMemo(() => {
    return enrichedMelas.filter(({ record, analytics }) => {
      if (statusFilter !== 'all' && analytics.status !== statusFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        record.name.toLowerCase().includes(q) ||
        (record.location || '').toLowerCase().includes(q) ||
        (record.stallNumber || '').toLowerCase().includes(q) ||
        (record.notes || '').toLowerCase().includes(q)
      );
    });
  }, [enrichedMelas, statusFilter, searchQuery]);

  if (!isRakibAdmin) return null;

  const melaPresets = [
    {
      icon: '🎪',
      shortLabel: 'ঢাকা বাণিজ্য মেলা',
      name: 'ঢাকা আন্তর্জাতিক বাণিজ্য মেলা',
      location: 'পূর্বাচল, ঢাকা',
    },
    {
      icon: '🎡',
      shortLabel: 'বৈশাখী ও লোকজ মেলা',
      name: 'বৈশাখী ও লোকজ আনন্দ মেলা',
      location: 'জেলা স্টেডিয়াম মাঠ',
    },
    {
      icon: '❄️',
      shortLabel: 'শীতকালীন হস্তশিল্প মেলা',
      name: 'শীতকালীন হস্তশিল্প ও ফুড মেলা',
      location: 'শিল্পকলা একাডেমি প্রাঙ্গণ',
    },
    {
      icon: '🌙',
      shortLabel: 'ঈদ স্পেশাল মেলা',
      name: 'ঈদ স্পেশাল মেলা ও প্রদর্শনী',
      location: 'মেইন মেলা মাঠ',
    },
  ];

  function resetForm() {
    setEditingMelaId(null);
    setMelaName('');
    setMelaLocation('');
    setMelaStallNo('');
    setMelaStartDate(getStartOfMonthStr());
    setMelaEndDate(getTodayStr());
    setMelaStallRent('');
    setMelaManualProfit('');
    setMelaNotes('');
  }

  async function handleSaveMelaRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!isRakibAdmin) return;

    const cleanName = melaName.trim();
    if (!cleanName) {
      setMelaBannerMsg({
        type: 'error',
        text: 'অনুগ্রহ করে মেলার নাম লিখুন (যেমন: বাণিজ্য মেলা ২০২৬ বা বৈশাখী মেলা)।',
      });
      return;
    }

    if (!melaStartDate || !melaEndDate) {
      setMelaBannerMsg({
        type: 'error',
        text: 'মেলা শুরুর তারিখ এবং শেষ হওয়ার তারিখ নির্বাচন করুন।',
      });
      return;
    }

    if (melaEndDate < melaStartDate) {
      setMelaBannerMsg({
        type: 'error',
        text: 'মেলার শেষ তারিখ অবশ্যই শুরুর তারিখের সমান বা পরের তারিখ হতে হবে।',
      });
      return;
    }

    setIsSavingMela(true);
    setMelaBannerMsg(null);

    try {
      const nowFormatted = formatBengaliDateTime(new Date());
      const stallRentVal =
        melaStallRent.trim() !== '' && Number(melaStallRent) > 0
          ? Math.round(Number(melaStallRent) * 100) / 100
          : undefined;
      const manualProfitVal =
        melaManualProfit.trim() !== '' && Number.isFinite(Number(melaManualProfit))
          ? Math.round(Number(melaManualProfit) * 100) / 100
          : undefined;

      let nextList: MelaEventRecord[];
      let auditText = '';

      if (editingMelaId) {
        nextList = melaList.map((item) =>
          item.id === editingMelaId
            ? {
                ...item,
                name: cleanName,
                location: melaLocation.trim() || undefined,
                stallNumber: melaStallNo.trim() || undefined,
                startDate: melaStartDate,
                endDate: melaEndDate,
                stallRentCost: stallRentVal,
                manualProfitOverride: manualProfitVal,
                notes: melaNotes.trim() || undefined,
                updatedAt: nowFormatted,
              }
            : item
        );
        auditText = `🎪 রাকিব "${cleanName}" মেলার সময়কাল (${dateLabel(melaStartDate)} – ${dateLabel(
          melaEndDate
        )}) ও হিসাব আপডেট করেছেন`;
      } else {
        const newRecord: MelaEventRecord = {
          id: `mela_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          location: melaLocation.trim() || undefined,
          stallNumber: melaStallNo.trim() || undefined,
          startDate: melaStartDate,
          endDate: melaEndDate,
          stallRentCost: stallRentVal,
          manualProfitOverride: manualProfitVal,
          notes: melaNotes.trim() || undefined,
          createdBy: 'Rakib',
          createdAt: nowFormatted,
        };
        nextList = [newRecord, ...melaList];
        auditText = `🎪 রাকিব নতুন মেলা "${cleanName}" (${dateLabel(melaStartDate)} থেকে ${dateLabel(
          melaEndDate
        )}) যোগ করেছেন`;
      }

      await saveMelaEvents(nextList, 'Rakib', auditText);
      setMelaList(nextList);
      setMelaBannerMsg({
        type: 'success',
        text: editingMelaId
          ? `✅ "${cleanName}" মেলার তথ্য ও লাভের হিসাব সফলভাবে আপডেট করা হয়েছে!`
          : `✅ "${cleanName}" (${dateLabel(melaStartDate)} থেকে ${dateLabel(
              melaEndDate
            )}) সফলভাবে সংরক্ষিত হয়েছে!`,
      });
      resetForm();
      setSubTab('list');
    } catch (err: any) {
      setMelaBannerMsg({
        type: 'error',
        text: err?.message || 'মেলার তথ্য সংরক্ষণ করা যায়নি।',
      });
    } finally {
      setIsSavingMela(false);
    }
  }

  async function handleQuickSaveAutoDetectedMela() {
    if (!isRakibAdmin) return;
    setIsSavingMela(true);
    setMelaBannerMsg(null);
    try {
      const nowFormatted = formatBengaliDateTime(new Date());
      const defaultName = `চলমান মেলা স্টল (${dateLabel(activeEntryDateBounds.earliest)} – ${dateLabel(
        activeEntryDateBounds.latest
      )})`;
      const newRecord: MelaEventRecord = {
        id: `mela_${Date.now()}`,
        name: defaultName,
        location: 'মেলার প্রধান স্টল',
        stallNumber: 'স্টল-০১',
        startDate: activeEntryDateBounds.earliest,
        endDate: activeEntryDateBounds.latest,
        createdBy: 'Rakib',
        createdAt: nowFormatted,
        notes: 'সিস্টেমের লেনদেনের তারিখ অনুযায়ী স্বয়ংক্রিয়ভাবে যুক্ত মেলা',
      };
      const nextList = [newRecord, ...melaList];
      await saveMelaEvents(
        nextList,
        'Rakib',
        `🎪 রাকিব চলমান মেলা "${defaultName}" প্রোফাইল ট্র্যাকারে সংরক্ষণ করেছেন`
      );
      setMelaList(nextList);
      setMelaBannerMsg({
        type: 'success',
        text: `✅ "${defaultName}" মেলার সম্পূর্ণ লাভ ও সময়কাল তালিকায় যুক্ত হয়েছে!`,
      });
      setSubTab('list');
    } catch (err: any) {
      setMelaBannerMsg({
        type: 'error',
        text: err?.message || 'মেলা সংরক্ষণ করা যায়নি।',
      });
    } finally {
      setIsSavingMela(false);
    }
  }

  function handleStartEditMela(record: MelaEventRecord) {
    setEditingMelaId(record.id);
    setMelaName(record.name);
    setMelaLocation(record.location || '');
    setMelaStallNo(record.stallNumber || '');
    setMelaStartDate(record.startDate);
    setMelaEndDate(record.endDate);
    setMelaStallRent(record.stallRentCost ? String(record.stallRentCost) : '');
    setMelaManualProfit(
      record.manualProfitOverride !== undefined && record.manualProfitOverride !== null
        ? String(record.manualProfitOverride)
        : ''
    );
    setMelaNotes(record.notes || '');
    setMelaBannerMsg(null);
    setSubTab('create');
  }

  async function handleDeleteMela(record: MelaEventRecord) {
    if (!isRakibAdmin) return;
    setIsSavingMela(true);
    setMelaBannerMsg(null);
    try {
      const nextList = melaList.filter((item) => item.id !== record.id);
      await saveMelaEvents(
        nextList,
        'Rakib',
        `🗑️ রাকিব "${record.name}" মেলার রেকর্ডটি তালিকা থেকে মুছে ফেলেছেন`
      );
      setMelaList(nextList);
      if (editingMelaId === record.id) {
        resetForm();
      }
      setMelaBannerMsg({
        type: 'success',
        text: `🗑️ "${record.name}" মেলার রেকর্ড মুছে ফেলা হয়েছে।`,
      });
    } catch (err: any) {
      setMelaBannerMsg({
        type: 'error',
        text: err?.message || 'মেলা ডিলিট করতে সমস্যা হয়েছে।',
      });
    } finally {
      setIsSavingMela(false);
    }
  }

  return (
    <div className="mela-tracker-shell">
      {/* 1. RAKIB EXCLUSIVE MELA PROFIT & DURATION HERO BANNER */}
      <div className="mela-tracker-hero">
        <div className="mela-tracker-hero-top">
          <div className="mela-tracker-title-wrap">
            <div className="mela-tracker-icon-box">
              <Store size={24} />
            </div>
            <div className="mela-tracker-heading">
              <div className="mela-tracker-badges">
                <span className="mela-exclusive-pill">
                  <Lock size={12} /> শুধুমাত্র রাকিবের প্রোফাইলে দৃশ্যমান
                </span>
                <span className="mela-live-calc-pill">
                  <Sparkles size={12} /> অটোমেটিক লাভ ও সময়কাল ক্যালকুলেটর
                </span>
              </div>
              <h3>🎪 কোন মেলায় কত টাকা লাভ ও মেলা কবে থেকে কবে চলছে — পূর্ণাঙ্গ ট্র্যাকার</h3>
              <p>
                প্রতিটি মেলার শুরুর তারিখ থেকে শেষ তারিখ পর্যন্ত মোট কত দিন মেলা চলেছে, কোন মেলায় কত টাকা বিক্রি, কত খরচ এবং <b>প্রকৃত নিট লাভ কত হয়েছে</b> তা এক নজরে দেখুন ও সংরক্ষণ করুন।
              </p>
            </div>
          </div>
        </div>

        {/* 4 KEY MELA KPI CARDS */}
        <div className="mela-hero-kpi-grid">
          <div className="mela-hero-kpi-card">
            <span className="mela-kpi-label">🎪 মোট নিবন্ধিত মেলা</span>
            <strong className="mela-kpi-value">
              {toBengaliNumerals(overallSummary.totalMelas)}টি মেলা
            </strong>
            <span className="mela-kpi-sub">
              🟢 চলমান: {toBengaliNumerals(overallSummary.runningCount)}টি • ✅ সমাপ্ত:{' '}
              {toBengaliNumerals(overallSummary.completedCount)}টি
            </span>
          </div>

          <div className="mela-hero-kpi-card">
            <span className="mela-kpi-label">💰 সকল মেলা থেকে মোট বিক্রয়</span>
            <strong className="mela-kpi-value">{money(overallSummary.grandTotalSales)}</strong>
            <span className="mela-kpi-sub">
              মোট {toBengaliNumerals(overallSummary.grandTotalSalesCount)}টি বিক্রয় রসিদ
            </span>
          </div>

          <div className="mela-hero-kpi-card highlight-profit">
            <span className="mela-kpi-label">📈 সকল মেলায় সর্বমোট নিট লাভ</span>
            <strong className="mela-kpi-value">
              {overallSummary.grandTotalNetProfit >= 0 ? '+' : ''}
              {money(overallSummary.grandTotalNetProfit)}
            </strong>
            <span className="mela-kpi-sub">
              সব খরচ ও স্টল ভাড়া বাদ দিয়ে প্রকৃত নিট লাভ
            </span>
          </div>

          <div className="mela-hero-kpi-card highlight-top">
            <span className="mela-kpi-label">🏆 সর্বোচ্চ লাভজনক মেলা</span>
            <strong className="mela-kpi-value" style={{ fontSize: '15.5px' }}>
              {overallSummary.topMelaName}
            </strong>
            <span className="mela-kpi-sub">
              অর্জিত লাভ: +{money(Math.max(0, overallSummary.topMelaProfit))}
            </span>
          </div>
        </div>
      </div>

      {/* 2. AUTO-DETECTED LIVE MELA SESSION STRIP (Instant Answer from Existing Entries) */}
      {activeEntryDateBounds.hasTransactions && (
        <div className="mela-auto-session-bar">
          <div className="mela-auto-session-info">
            <div className="mela-auto-badge-row">
              <span className="mela-auto-tag">⚡ সিস্টেমের লেনদেন থেকে স্বয়ংক্রিয় মেলা হিসাব</span>
              <span className="mela-auto-dates">
                📅 {dateLabel(autoDetectedSession.startDate)} থেকে{' '}
                {dateLabel(autoDetectedSession.endDate)} পর্যন্ত (মোট{' '}
                {toBengaliNumerals(autoDetectedSession.durationDays)} দিন)
              </span>
            </div>
            <div className="mela-auto-metrics-line">
              <span>
                মোট বিক্রয়: <b>{money(autoDetectedSession.totalSales)}</b> (
                {toBengaliNumerals(autoDetectedSession.salesCount)}টি সেল)
              </span>
              <span>•</span>
              <span>
                মোট খরচ: <b style={{ color: '#dc2626' }}>{money(autoDetectedSession.periodExpenses)}</b>
              </span>
              <span>•</span>
              <span>
                নিট লাভ:{' '}
                <b style={{ color: '#059669', fontSize: '14.5px' }}>
                  +{money(autoDetectedSession.finalNetProfit)}
                </b>
              </span>
            </div>
          </div>

          {melaList.length === 0 && (
            <button
              type="button"
              className="mela-auto-save-btn"
              onClick={handleQuickSaveAutoDetectedMela}
              disabled={isSavingMela}
            >
              <Plus size={15} /> এই মেলাটি তালিকায় সেভ করুন
            </button>
          )}
        </div>
      )}

      <div className="mela-tracker-body">
        {melaBannerMsg && (
          <div
            className={melaBannerMsg.type === 'success' ? 'success' : 'alert'}
            style={{ marginBottom: '14px', borderRadius: '12px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {melaBannerMsg.type === 'success' ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
              <span>{melaBannerMsg.text}</span>
            </div>
            <button type="button" onClick={() => setMelaBannerMsg(null)}>
              ×
            </button>
          </div>
        )}

        <div className="mela-sub-menu-tabs" role="tablist" aria-label="মেলা ফিচার মেনু">
          <button
            type="button"
            className={`mela-sub-tab-btn ${currentSubTab === 'list' ? 'active' : ''}`}
            onClick={() => setSubTab('list')}
          >
            <TrendingUp size={15} />
            <span>সব মেলার ডেটা ও লাভ ({toBengaliNumerals(melaList.length)})</span>
          </button>
          <button
            type="button"
            className={`mela-sub-tab-btn ${currentSubTab === 'create' ? 'active' : ''}`}
            onClick={() => setSubTab('create')}
          >
            {editingMelaId ? <Edit3 size={15} /> : <Plus size={15} />}
            <span>{editingMelaId ? 'মেলার তথ্য এডিট ফর্ম' : '+ নতুন মেলা যোগ ও হিসাব'}</span>
          </button>
        </div>

        <div className="mela-tracker-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {/* TAB 1: CREATE / EDIT MELA EVENT FORM */}
          {currentSubTab === 'create' && (
          <form onSubmit={handleSaveMelaRecord} className="mela-card mela-form-card">
            <div className="mela-card-head">
              <div className="mela-card-head-left">
                <div className="mela-card-icon">
                  {editingMelaId ? <Edit3 size={15} /> : <Plus size={16} />}
                </div>
                <div>
                  <h4>
                    {editingMelaId
                      ? 'মেলার তথ্য ও সময়কাল সম্পাদনা করুন'
                      : 'নতুন মেলা যোগ ও লাভ হিসাব করুন'}
                  </h4>
                  <small>
                    মেলার নাম ও তারিখ দিলে ওই সময়ের সব বিক্রয় ও লাভ স্বয়ংক্রিয়ভাবে হিসাব হবে
                  </small>
                </div>
              </div>

              {editingMelaId && (
                <button
                  type="button"
                  className="mela-cancel-edit-btn"
                  onClick={resetForm}
                >
                  <X size={12} /> বাতিল
                </button>
              )}
            </div>

            {/* Quick Mela Presets (Compact 2x2 Grid) */}
            <div className="mela-presets-box">
              <span className="mela-presets-label">⚡ এক ক্লিকে মেলার নাম নির্বাচন করুন:</span>
              <div className="mela-presets-grid">
                {melaPresets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={`mela-preset-chip ${melaName === p.name ? 'active' : ''}`}
                    onClick={() => {
                      setMelaName(p.name);
                      if (!melaLocation.trim()) setMelaLocation(p.location);
                    }}
                    title={p.name}
                  >
                    <span className="mela-preset-emoji">{p.icon}</span>
                    <span className="mela-preset-text">{p.shortLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Field 1: Mela Name */}
            <div className="mela-field">
              <label className="mela-field-label">
                <span>
                  মেলার নাম (কোন মেলা?) <b className="req-star">*</b>
                </span>
              </label>
              <div className="mela-input-wrap">
                <Store size={13} className="mela-input-icon" />
                <input
                  type="text"
                  required
                  value={melaName}
                  onChange={(e) => setMelaName(e.target.value)}
                  placeholder="যেমন: ঢাকা বাণিজ্য মেলা ২০২৬ / বৈশাখী মেলা"
                />
              </div>
            </div>

            {/* Row 2: Location + Stall Number (Side-by-Side) */}
            <div className="mela-form-row-2">
              <div className="mela-field">
                <label className="mela-field-label">
                  <span>মেলার স্থান / ভেন্যু</span>
                </label>
                <div className="mela-input-wrap">
                  <MapPin size={13} className="mela-input-icon" />
                  <input
                    type="text"
                    value={melaLocation}
                    onChange={(e) => setMelaLocation(e.target.value)}
                    placeholder="যেমন: পূর্বাচল / মাঠ"
                  />
                </div>
              </div>

              <div className="mela-field">
                <label className="mela-field-label">
                  <span>স্টল নম্বর (ঐচ্ছিক)</span>
                </label>
                <div className="mela-input-wrap">
                  <Award size={13} className="mela-input-icon" />
                  <input
                    type="text"
                    value={melaStallNo}
                    onChange={(e) => setMelaStallNo(e.target.value)}
                    placeholder="যেমন: স্টল ১২-বি"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Start Date (কবে থেকে) + End Date (কবে পর্যন্ত) (Side-by-Side) */}
            <div className="mela-form-row-2">
              <div className="mela-field">
                <label className="mela-field-label">
                  <span>
                    📅 মেলা কবে থেকে শুরু? <b className="req-star">*</b>
                  </span>
                </label>
                <div className="mela-input-wrap">
                  <Calendar size={13} className="mela-input-icon" />
                  <input
                    type="date"
                    required
                    value={melaStartDate}
                    onChange={(e) => setMelaStartDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="mela-field">
                <label className="mela-field-label">
                  <span>
                    📅 কবে পর্যন্ত চলছে? <b className="req-star">*</b>
                  </span>
                </label>
                <div className="mela-input-wrap">
                  <Calendar size={13} className="mela-input-icon" />
                  <input
                    type="date"
                    required
                    value={melaEndDate}
                    onChange={(e) => setMelaEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Quick Date Range Selector Chips */}
            <div className="mela-date-quick-row">
              <span>দ্রুত তারিখ:</span>
              <button
                type="button"
                className="mela-date-chip"
                onClick={() => {
                  setMelaStartDate(getStartOfMonthStr());
                  setMelaEndDate(getTodayStr());
                }}
              >
                চলতি মাস
              </button>
              <button
                type="button"
                className="mela-date-chip"
                onClick={() => {
                  setMelaStartDate(getNDaysAgoStr(6));
                  setMelaEndDate(getTodayStr());
                }}
              >
                গত ৭ দিন
              </button>
              <button
                type="button"
                className="mela-date-chip"
                onClick={() => {
                  setMelaStartDate(getNDaysAgoStr(14));
                  setMelaEndDate(getTodayStr());
                }}
              >
                গত ১৫ দিন
              </button>
              <button
                type="button"
                className="mela-date-chip"
                onClick={() => {
                  setMelaStartDate(activeEntryDateBounds.earliest);
                  setMelaEndDate(activeEntryDateBounds.latest);
                }}
              >
                সব লেনদেন
              </button>
            </div>

            {/* Row 4: Stall Rent Cost + Manual Profit Override (Side-by-Side) */}
            <div className="mela-form-row-2">
              <div className="mela-field">
                <label className="mela-field-label">
                  <span>স্টল ভাড়া / খরচ (৳)</span>
                </label>
                <div className="mela-input-wrap">
                  <Banknote size={13} className="mela-input-icon" />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={melaStallRent}
                    onChange={(e) => setMelaStallRent(e.target.value)}
                    placeholder="যেমন: ৫০০০"
                  />
                </div>
              </div>

              <div className="mela-field">
                <label className="mela-field-label">
                  <span>কাস্টম লাভ (ঐচ্ছিক ৳)</span>
                </label>
                <div className="mela-input-wrap">
                  <TrendingUp size={13} className="mela-input-icon" />
                  <input
                    type="number"
                    step="any"
                    value={melaManualProfit}
                    onChange={(e) => setMelaManualProfit(e.target.value)}
                    placeholder="অটো হিসাব"
                  />
                </div>
              </div>
            </div>

            {/* Field 5: Notes */}
            <div className="mela-field">
              <label className="mela-field-label">
                <span>মেলার বিশেষ নোট / মন্তব্য (ঐচ্ছিক)</span>
              </label>
              <div className="mela-input-wrap">
                <FileText size={13} className="mela-input-icon" />
                <input
                  type="text"
                  value={melaNotes}
                  onChange={(e) => setMelaNotes(e.target.value)}
                  placeholder="যেমন: শুক্র ও শনিবার সবচেয়ে বেশি বিক্রি হয়েছে"
                />
              </div>
            </div>

            {/* LIVE AUTO-CALCULATED PREVIEW BOX */}
            <div className="mela-live-preview-box">
              <div className="mela-preview-head">
                <span>📊 লাইভ মেলা হিসাব প্রিভিউ:</span>
                <span className="mela-preview-days">
                  ⏳ {toBengaliNumerals(formLivePreview.durationDays)} দিন (
                  {dateLabel(formLivePreview.startDate)} – {dateLabel(formLivePreview.endDate)})
                </span>
              </div>
              <div className="mela-preview-metrics">
                <div className="mela-prev-cell">
                  <span>মোট বিক্রয় ({toBengaliNumerals(formLivePreview.salesCount)}টি)</span>
                  <strong style={{ color: '#0284c7' }}>{money(formLivePreview.totalSales)}</strong>
                </div>
                <div className="mela-prev-cell">
                  <span>খরচ ও ভাড়া</span>
                  <strong style={{ color: '#dc2626' }}>
                    {money(formLivePreview.totalExpensesWithStall)}
                  </strong>
                </div>
                <div className="mela-prev-cell highlight">
                  <span>নিট লাভ</span>
                  <strong
                    style={{
                      color: formLivePreview.finalNetProfit >= 0 ? '#059669' : '#dc2626',
                    }}
                  >
                    {formLivePreview.finalNetProfit >= 0 ? '+' : ''}
                    {money(formLivePreview.finalNetProfit)}
                  </strong>
                </div>
              </div>
            </div>

            <button type="submit" className="mela-submit-btn" disabled={isSavingMela}>
              {editingMelaId ? <Edit3 size={15} /> : <Plus size={15} />}
              <span>
                {isSavingMela
                  ? 'সংরক্ষণ হচ্ছে…'
                  : editingMelaId
                  ? 'মেলার তথ্য ও লাভের হিসাব আপডেট করুন'
                  : 'মেলা তালিকায় সংরক্ষণ করুন'}
              </span>
            </button>
          </form>
          )}

          {/* TAB 2: SAVED MELAS DIRECTORY & PROFIT CARDS */}
          {currentSubTab === 'list' && (
          <div className="mela-card mela-list-card">
            <div className="mela-card-head">
              <div className="mela-card-head-left">
                <div
                  className="mela-card-icon"
                  style={{
                    background: '#fef3c7',
                    borderColor: '#fde68a',
                    color: '#d97706',
                  }}
                >
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h4>
                    🎪 মেলার তালিকা, সময়কাল ও অর্জিত লাভ ({toBengaliNumerals(melaList.length)}টি)
                  </h4>
                  <small>কোন মেলা কবে থেকে কবে চলছে এবং কত টাকা লাভ হয়েছে</small>
                </div>
              </div>
              <button
                type="button"
                className="mela-action-btn view-tx"
                onClick={() => {
                  resetForm();
                  setSubTab('create');
                }}
              >
                <Plus size={13} /> + নতুন মেলা যোগ
              </button>
            </div>

            {/* Filter Pills & Search */}
            <div className="mela-filter-bar">
              <div className="mela-filter-pills">
                {[
                  { key: 'all', label: `সব মেলা (${toBengaliNumerals(melaList.length)})` },
                  {
                    key: 'running',
                    label: `🟢 চলমান (${toBengaliNumerals(overallSummary.runningCount)})`,
                  },
                  {
                    key: 'completed',
                    label: `✅ সমাপ্ত (${toBengaliNumerals(overallSummary.completedCount)})`,
                  },
                  {
                    key: 'upcoming',
                    label: `🔵 আসন্ন (${toBengaliNumerals(overallSummary.upcomingCount)})`,
                  },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`mela-filter-pill ${statusFilter === f.key ? 'active' : ''}`}
                    onClick={() => setStatusFilter(f.key as any)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {melaList.length > 1 && (
                <div className="mela-input-wrap" style={{ marginTop: '6px' }}>
                  <Search size={15} className="mela-input-icon" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="মেলার নাম বা স্থান লিখে খুঁজুন…"
                  />
                </div>
              )}
            </div>

            {filteredMelas.length === 0 ? (
              <div className="mela-empty-box">
                <Store size={34} style={{ color: '#0d9488', marginBottom: '6px' }} />
                <h5>
                  {melaList.length === 0
                    ? 'এখনো কোনো নির্দিষ্ট মেলা তালিকায় যোগ করা হয়নি'
                    : 'এই ফিল্টারে কোনো মেলা পাওয়া যায়নি'}
                </h5>
                <p>
                  বাম পাশের ফর্মে মেলার নাম এবং শুরুর ও শেষের তারিখ দিয়ে <b>মেলা তালিকায় সংরক্ষণ করুন</b> বাটনে চাপ দিন—সিস্টেম স্বয়ংক্রিয়ভাবে ওই মেলার মোট লাভ ও সময়কাল বের করে দেবে।
                </p>
                {melaList.length === 0 && activeEntryDateBounds.hasTransactions && (
                  <button
                    type="button"
                    className="mela-auto-save-btn"
                    style={{ marginTop: '8px' }}
                    onClick={handleQuickSaveAutoDetectedMela}
                    disabled={isSavingMela}
                  >
                    <Sparkles size={15} /> বর্তমান লেনদেনের তারিখ দিয়ে ১ ক্লিকে মেলা যোগ করুন
                  </button>
                )}
              </div>
            ) : (
              <div className="mela-events-stack">
                {filteredMelas.map(({ record, analytics }) => {
                  const isExpanded = expandedMelaId === record.id;
                  const isPositive = analytics.finalNetProfit >= 0;

                  return (
                    <div
                      key={record.id}
                      className={`mela-event-card ${analytics.status}`}
                    >
                      {/* Top Title & Live Running/Completed Badge */}
                      <div className="mela-event-top">
                        <div className="mela-event-title-block">
                          <div className="mela-event-name-row">
                            <h5>🎪 {record.name}</h5>
                            {record.stallNumber && (
                              <span className="mela-stall-tag">🏪 {record.stallNumber}</span>
                            )}
                          </div>
                          <div className="mela-event-loc-row">
                            {record.location && (
                              <span>
                                <MapPin size={12} /> {record.location}
                              </span>
                            )}
                            {record.notes && <span>• 📝 {record.notes}</span>}
                          </div>
                        </div>

                        <div className={`mela-status-badge ${analytics.status}`}>
                          <strong>{analytics.statusLabelBn}</strong>
                          <span>{analytics.statusSubBn}</span>
                        </div>
                      </div>

                      {/* Prominent Date Range & Duration Banner */}
                      <div className="mela-duration-banner">
                        <div className="mela-duration-left">
                          <Calendar size={15} style={{ color: '#0f766e', flexShrink: 0 }} />
                          <span>
                            <b>মেলা কবে থেকে কবে চলছে:</b> {dateLabel(record.startDate)} থেকে{' '}
                            {dateLabel(record.endDate)} পর্যন্ত
                          </span>
                        </div>
                        <span className="mela-duration-days-pill">
                          <Clock size={12} /> মোট {toBengaliNumerals(analytics.durationDays)} দিন
                        </span>
                      </div>

                      {/* 4 Financial Metric Boxes */}
                      <div className="mela-metrics-grid">
                        <div className="mela-metric-box">
                          <span>মোট বিক্রয় রাজস্ব</span>
                          <strong style={{ color: '#0284c7' }}>
                            {money(analytics.totalSales)}
                          </strong>
                          <small>
                            মোট {toBengaliNumerals(analytics.salesCount)}টি বিক্রয় রসিদ
                          </small>
                        </div>

                        <div className="mela-metric-box">
                          <span>বিক্রয় মুনাফা (Gross)</span>
                          <strong style={{ color: '#0d9488' }}>
                            +{money(analytics.grossProfit)}
                          </strong>
                          <small>দৈনিক গড় বিক্রয়: {money(analytics.avgDailySales)}</small>
                        </div>

                        <div className="mela-metric-box">
                          <span>মেলার খরচ ও স্টল ভাড়া</span>
                          <strong style={{ color: '#dc2626' }}>
                            -{money(analytics.totalExpensesWithStall)}
                          </strong>
                          <small>
                            খরচ: {money(analytics.periodExpenses)}
                            {analytics.stallRentCost > 0
                              ? ` • স্টল: ${money(analytics.stallRentCost)}`
                              : ''}
                          </small>
                        </div>

                        <div
                          className={`mela-metric-box profit-highlight ${
                            isPositive ? 'positive' : 'negative'
                          }`}
                        >
                          <span>এই মেলায় নিট লাভ</span>
                          <strong>
                            {isPositive ? '+' : ''}
                            {money(analytics.finalNetProfit)}
                          </strong>
                          <small>
                            দৈনিক গড় লাভ: {money(analytics.avgDailyProfit)} (হার:{' '}
                            {toBengaliNumerals(analytics.profitMarginPercent)}%)
                          </small>
                        </div>
                      </div>

                      {/* Seller & Tray Breakdown Strip */}
                      <div className="mela-seller-strip">
                        <span>
                          👤 রাকিবের বিক্রয়: <b>{money(analytics.rakibSales)}</b>
                        </span>
                        <span>
                          👤 লিমনের বিক্রয়: <b>{money(analytics.limonSales)}</b>
                        </span>
                        <span>
                          🍱 মেলার ট্রে বিক্রয়: <b>{money(analytics.traySales)}</b>
                        </span>
                      </div>

                      {/* Expandable Transactions Table for this Mela */}
                      {isExpanded && (
                        <div className="mela-tx-drawer">
                          <div className="mela-tx-drawer-head">
                            <strong>
                              📋 "{record.name}" মেলার সকল লেনদেন (
                              {toBengaliNumerals(analytics.matchedEntries.length)}টি)
                            </strong>
                            <span>
                              {dateLabel(record.startDate)} – {dateLabel(record.endDate)}
                            </span>
                          </div>
                          {analytics.matchedEntries.length === 0 ? (
                            <div
                              style={{
                                padding: '14px',
                                textAlign: 'center',
                                fontSize: '12px',
                                color: '#64748b',
                              }}
                            >
                              এই তারিখের মধ্যে কোনো লেনদেন এন্ট্রি পাওয়া যায়নি।
                            </div>
                          ) : (
                            <div className="mela-tx-list">
                              {analytics.matchedEntries.slice(0, 25).map((tx) => (
                                <div key={tx.id} className="mela-tx-row">
                                  <div>
                                    <b>{tx.title}</b>
                                    <small>
                                      {dateLabel(tx.date)} •{' '}
                                      {tx.type === 'sale'
                                        ? 'বিক্রয়'
                                        : tx.type === 'expense'
                                        ? 'খরচ'
                                        : tx.type === 'purchase'
                                        ? 'মাল ক্রয়'
                                        : tx.type}
                                    </small>
                                  </div>
                                  <strong
                                    style={{
                                      color:
                                        tx.type === 'sale'
                                          ? '#059669'
                                          : tx.type === 'expense'
                                          ? '#dc2626'
                                          : '#0284c7',
                                    }}
                                  >
                                    {tx.type === 'expense' ? '-' : ''}
                                    {money(tx.amount)}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Footer Action Bar */}
                      <div className="mela-event-footer">
                        <button
                          type="button"
                          className="mela-action-btn view-tx"
                          onClick={() =>
                            setExpandedMelaId(isExpanded ? null : record.id)
                          }
                        >
                          <Eye size={13} />
                          <span>
                            {isExpanded
                              ? 'লেনদেন তালিকা লুকান'
                              : `মেলার লেনদেন দেখুন (${toBengaliNumerals(
                                  analytics.matchedEntries.length
                                )}টি)`}
                          </span>
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>

                        <div className="mela-footer-right-btns">
                          <button
                            type="button"
                            className="mela-action-btn edit"
                            onClick={() => handleStartEditMela(record)}
                          >
                            <Edit3 size={13} /> এডিট
                          </button>
                          <button
                            type="button"
                            className="mela-action-btn delete"
                            onClick={() => handleDeleteMela(record)}
                            disabled={isSavingMela}
                          >
                            <Trash2 size={13} /> ডিলিট
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
