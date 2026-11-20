import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  RotateCcw,
  CheckCircle2,
  Package,
  Calendar,
  Banknote,
} from 'lucide-react';
import { Product } from '../types';

export interface BulkTallyComboItem {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
}

export interface BulkTallyExpenseItem {
  label: string;
  amount: number;
}

export interface BulkTallySubmitPayload {
  title: string;
  totalAmount: number;
  totalQuantity: number;
  cogsAmount: number;
  grossProfit: number;
  date: string;
  seller: 'Rakib' | 'Limon';
  notes: string;
  category: string;
  comboItems?: BulkTallyComboItem[];
  totalExpenseAmount?: number;
  expenseTitle?: string;
  expenseNotes?: string;
  expenseBreakdown?: BulkTallyExpenseItem[];
}

export interface BulkTallySubmitResult {
  saleEntryId?: string;
  expenseEntryId?: string;
}

interface FastBulkTallyPadModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialSeller: 'Rakib' | 'Limon';
  isEmployee?: boolean;
  todayStr: string;
  onSubmitBulkTally: (payload: BulkTallySubmitPayload) => Promise<BulkTallySubmitResult | undefined>;
  onUndoBulkTally?: (result: BulkTallySubmitResult, summaryTitle: string) => Promise<void>;
}

interface PersistedCashTallyDraft {
  totalCashAmountInput: string;
  profitMarginPct: number;
  deductStockFromInventory: boolean;
  directTotalExpenseInput: string;
  categoryExpenses: Record<string, string>;
  expenseMode: 'quick_total' | 'itemized';
}

const STORAGE_KEY = 'glowzaa_total_cash_auto_calc_38_v2';
const FIXED_DEFAULT_PROFIT_PCT = 38;

const DAILY_EXPENSE_CATEGORIES = [
  { id: 'tea_snacks', label: '☕ চা-নাস্তা' },
  { id: 'lunch_food', label: '🍱 খাবার/টিফিন' },
  { id: 'transport', label: '🚗 যাতায়াত ভাড়া' },
  { id: 'poly_bag', label: '🛍️ ব্যাগ/পলিথিন' },
  { id: 'utility_bill', label: '💡 বিদ্যুৎ/বিল' },
  { id: 'staff_wage', label: '👷 কর্মচারী হাজিরা' },
  { id: 'other_misc', label: '🧹 অন্যান্য খরচ' },
];

function toBengaliNumerals(n: number | string): string {
  const englishToBengali: Record<string, string> = {
    '0': '০',
    '1': '১',
    '2': '২',
    '3': '৩',
    '4': '৪',
    '5': '৫',
    '6': '৬',
    '7': '৭',
    '8': '৮',
    '9': '৯',
  };
  return String(n).replace(/[0-9]/g, (d) => englishToBengali[d] || d);
}

function formatMoney(n: number): string {
  const val = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  const absVal = Math.abs(val);
  const formatted = `৳${absVal.toLocaleString('en-IN', {
    minimumFractionDigits: absVal % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
  return val < 0 ? `-${formatted}` : formatted;
}

export default function FastBulkTallyPadModal({
  isOpen,
  onClose,
  products,
  initialSeller,
  isEmployee = false,
  todayStr,
  onSubmitBulkTally,
  onUndoBulkTally,
}: FastBulkTallyPadModalProps) {
  const [totalCashAmountInput, setTotalCashAmountInput] = useState<string>('');
  const [profitMarginPct, setProfitMarginPct] = useState<number>(FIXED_DEFAULT_PROFIT_PCT);
  const [deductStockFromInventory, setDeductStockFromInventory] = useState<boolean>(false);
  const [expenseMode, setExpenseMode] = useState<'quick_total' | 'itemized'>('quick_total');
  const [directTotalExpenseInput, setDirectTotalExpenseInput] = useState<string>('');
  const [categoryExpenses, setCategoryExpenses] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [seller, setSeller] = useState<'Rakib' | 'Limon'>(initialSeller);
  const [customNoteInput, setCustomNoteInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recentSubmissions, setRecentSubmissions] = useState<
    Array<{
      key: string;
      result: BulkTallySubmitResult;
      title: string;
      salesAmount: number;
      costAmount: number;
      grossProfit: number;
      expenseAmount: number;
      netProfitAfterExpense: number;
      time: string;
    }>
  >([]);

  // Load persisted draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedCashTallyDraft>;
      if (typeof parsed.totalCashAmountInput === 'string') {
        setTotalCashAmountInput(parsed.totalCashAmountInput);
      }
      if (
        typeof parsed.profitMarginPct === 'number' &&
        Number.isFinite(parsed.profitMarginPct) &&
        parsed.profitMarginPct > 0 &&
        parsed.profitMarginPct < 100
      ) {
        setProfitMarginPct(parsed.profitMarginPct);
      } else {
        setProfitMarginPct(FIXED_DEFAULT_PROFIT_PCT);
      }
      if (typeof parsed.deductStockFromInventory === 'boolean') {
        setDeductStockFromInventory(parsed.deductStockFromInventory);
      }
      if (typeof parsed.directTotalExpenseInput === 'string') {
        setDirectTotalExpenseInput(parsed.directTotalExpenseInput);
      }
      if (parsed.categoryExpenses && typeof parsed.categoryExpenses === 'object') {
        setCategoryExpenses(parsed.categoryExpenses);
      }
      if (parsed.expenseMode === 'quick_total' || parsed.expenseMode === 'itemized') {
        setExpenseMode(parsed.expenseMode);
      }
    } catch {
      // ignore invalid storage
    }
  }, []);

  // Save draft on state changes
  useEffect(() => {
    try {
      const draft: PersistedCashTallyDraft = {
        totalCashAmountInput,
        profitMarginPct,
        deductStockFromInventory,
        directTotalExpenseInput,
        categoryExpenses,
        expenseMode,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage quota errors
    }
  }, [
    totalCashAmountInput,
    profitMarginPct,
    deductStockFromInventory,
    directTotalExpenseInput,
    categoryExpenses,
    expenseMode,
  ]);

  const avgSellingPrice = useMemo(() => {
    let totalRetail = 0;
    let totalWeight = 0;
    for (const p of products) {
      const sp = Math.max(0, Number(p.sellingPrice) || 0);
      const w = Math.max(1, Number(p.currentStock) || 1);
      if (sp > 0) {
        totalRetail += sp * w;
        totalWeight += w;
      }
    }
    return totalWeight > 0 ? Math.max(10, Math.round(totalRetail / totalWeight)) : 30;
  }, [products]);

  const calculation = useMemo(() => {
    const totalSales = Math.max(0, Math.round((Number(totalCashAmountInput) || 0) * 100) / 100);
    const activePct =
      Number.isFinite(profitMarginPct) && profitMarginPct > 0 && profitMarginPct < 100
        ? profitMarginPct
        : FIXED_DEFAULT_PROFIT_PCT;
    const costPct = Math.round((100 - activePct) * 100) / 100;

    // 38% Gross Profit & 62% Protected Asol (Cost)
    const grossProfit = Math.round(totalSales * (activePct / 100) * 100) / 100;
    const totalCogs = Math.max(0, Math.round((totalSales - grossProfit) * 100) / 100);

    // Calculate Daily Expenses (either quick total or itemized categories)
    const expenseBreakdown: BulkTallyExpenseItem[] = [];
    let totalExpenses = 0;

    if (expenseMode === 'quick_total') {
      const directExp = Math.max(0, Math.round((Number(directTotalExpenseInput) || 0) * 100) / 100);
      if (directExp > 0) {
        totalExpenses = directExp;
        expenseBreakdown.push({ label: 'প্রতিদিনের মোট দোকান খরচ', amount: directExp });
      }
    } else {
      for (const cat of DAILY_EXPENSE_CATEGORIES) {
        const val = Math.max(0, Math.round((Number(categoryExpenses[cat.id]) || 0) * 100) / 100);
        if (val > 0) {
          totalExpenses += val;
          expenseBreakdown.push({ label: cat.label, amount: val });
        }
      }
      totalExpenses = Math.round(totalExpenses * 100) / 100;
    }

    // All expenses are deducted strictly from the 38% profit share (Asol 62% is NEVER touched)
    const netProfitAfterExpense = Math.round((grossProfit - totalExpenses) * 100) / 100;
    const netCashRemainingInDrawer = Math.round((totalSales - totalExpenses) * 100) / 100;

    const comboItems: BulkTallyComboItem[] = [];
    let totalPieces = totalSales > 0 ? Math.max(1, Math.round(totalSales / avgSellingPrice)) : 0;

    if (deductStockFromInventory && totalSales > 0 && products.length > 0) {
      const stockedProds = products
        .filter((p) => (Number(p.currentStock) || 0) > 0 && (Number(p.sellingPrice) || 0) > 0)
        .sort((a, b) => (Number(b.currentStock) || 0) - (Number(a.currentStock) || 0));

      let remainingBudget = totalSales;
      let allocatedPieces = 0;

      for (const prod of stockedProds) {
        const sp = Math.max(1, Number(prod.sellingPrice) || 20);
        const uc = Math.round(sp * (costPct / 100) * 100) / 100;
        const avail = Math.max(0, Math.floor(Number(prod.currentStock) || 0));
        if (remainingBudget < sp || avail <= 0) continue;

        const maxAffordable = Math.floor(remainingBudget / sp);
        const take = Math.min(avail, Math.max(1, Math.min(maxAffordable, Math.ceil(avail * 0.25))));
        if (take > 0) {
          comboItems.push({
            productId: prod.id,
            productName: prod.name,
            unit: prod.unit || 'পিস',
            quantity: take,
            unitCost: uc,
            sellingPrice: sp,
          });
          remainingBudget -= take * sp;
          allocatedPieces += take;
        }
      }

      if (allocatedPieces > 0) {
        const leftoverPieces =
          remainingBudget > 0 ? Math.round(remainingBudget / avgSellingPrice) : 0;
        totalPieces = allocatedPieces + leftoverPieces;
      }
    }

    return {
      totalSales,
      activePct,
      costPct,
      grossProfit,
      totalCogs,
      totalExpenses,
      expenseBreakdown,
      netProfitAfterExpense,
      netCashRemainingInDrawer,
      totalPieces,
      comboItems,
    };
  }, [
    totalCashAmountInput,
    profitMarginPct,
    expenseMode,
    directTotalExpenseInput,
    categoryExpenses,
    avgSellingPrice,
    deductStockFromInventory,
    products,
  ]);

  const handleReset = () => {
    setTotalCashAmountInput('');
    setDirectTotalExpenseInput('');
    setCategoryExpenses({});
    setCustomNoteInput('');
  };

  const canSubmit = (calculation.totalSales > 0 || calculation.totalExpenses > 0) && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const noteSuffix = customNoteInput.trim() ? ` | নোট: ${customNoteInput.trim()}` : '';
      const expenseSummaryText =
        calculation.expenseBreakdown.length > 0
          ? calculation.expenseBreakdown
              .map((item) => `${item.label}: ৳${toBengaliNumerals(item.amount)}`)
              .join(', ')
          : '';

      const title =
        calculation.totalSales > 0
          ? `💵 মোট ক্যাশ বিক্রয় (লাভ ${toBengaliNumerals(calculation.activePct)}% = ৳${toBengaliNumerals(
              calculation.grossProfit
            )})`
          : `🧾 প্রতিদিনের এককালীন দোকান খরচ (${
              calculation.expenseBreakdown.map((e) => e.label).join(', ') || 'দৈনিক খরচ'
            })`;

      const notes = `মোট ক্যাশ অটো হিসাব — বিক্রয়: ৳${toBengaliNumerals(
        calculation.totalSales
      )} | আসল (${toBengaliNumerals(calculation.costPct)}%): ৳${toBengaliNumerals(
        calculation.totalCogs
      )} | বিক্রয় লভ্যাংশ (${toBengaliNumerals(calculation.activePct)}%): +৳${toBengaliNumerals(
        calculation.grossProfit
      )}${
        calculation.totalExpenses > 0
          ? ` | প্রতিদিনের খরচ (লাভাংশ থেকে বাদ): -৳${toBengaliNumerals(
              calculation.totalExpenses
            )} (${expenseSummaryText}) | খরচ বাদে চূড়ান্ত নিট ${
              calculation.netProfitAfterExpense >= 0 ? 'লাভ' : 'লস'
            }: ৳${toBengaliNumerals(calculation.netProfitAfterExpense)}`
          : ''
      }${noteSuffix}`;

      const expenseTitle =
        calculation.totalExpenses > 0
          ? `🧾 প্রতিদিনের দোকান খরচ (লাভাংশ থেকে বাদ): ${
              calculation.expenseBreakdown
                .map((e) => `${e.label} ৳${toBengaliNumerals(e.amount)}`)
                .join(' + ') || `৳${toBengaliNumerals(calculation.totalExpenses)}`
            }`
          : undefined;

      const expenseNotes =
        calculation.totalExpenses > 0
          ? `প্রতিদিনের এককালীন খরচ (৩৮% বিক্রয় লভ্যাংশ থেকে কর্তনকৃত, ৬২% আসল মূলধন অপরিবর্তিত) — বিবরণ: ${expenseSummaryText}${noteSuffix}`
          : undefined;

      const result = await onSubmitBulkTally({
        title,
        totalAmount: calculation.totalSales,
        totalQuantity: calculation.totalPieces,
        cogsAmount: calculation.totalCogs,
        grossProfit: calculation.grossProfit,
        date: selectedDate || todayStr,
        seller,
        notes,
        category: 'মোট ক্যাশ অটো-হিসাব সেল (৩৮% লাভ)',
        comboItems: calculation.comboItems.length > 0 ? calculation.comboItems : undefined,
        totalExpenseAmount: calculation.totalExpenses,
        expenseTitle,
        expenseNotes,
        expenseBreakdown: calculation.expenseBreakdown,
      });

      if (result && (result.saleEntryId || result.expenseEntryId)) {
        const nowTime = new Date().toLocaleTimeString('bn-BD', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setRecentSubmissions((prev) => [
          {
            key: `${result.saleEntryId || ''}_${result.expenseEntryId || ''}_${Date.now()}`,
            result,
            title,
            salesAmount: calculation.totalSales,
            costAmount: calculation.totalCogs,
            grossProfit: calculation.grossProfit,
            expenseAmount: calculation.totalExpenses,
            netProfitAfterExpense: calculation.netProfitAfterExpense,
            time: nowTime,
          },
          ...prev.slice(0, 4),
        ]);
      }

      handleReset();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const hasAnyValue =
    calculation.totalSales > 0 || calculation.totalExpenses > 0 || customNoteInput.trim().length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '95vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1.5px solid #059669',
          boxShadow: '0 22px 50px -12px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* 1. Single-Row Sleek Header */}
        <div
          style={{
            padding: '9px 12px',
            background: 'linear-gradient(135deg, #0f172a 0%, #065f46 55%, #059669 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              minWidth: 0,
              flex: 1,
            }}
          >
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.25)',
                border: '1px solid rgba(110, 231, 183, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Banknote size={16} style={{ color: '#6ee7b7' }} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 900,
                    color: '#ffffff',
                    lineHeight: 1.2,
                  }}
                >
                  মোট ক্যাশ ও দৈনিক খরচ হিসাব
                </span>
                <span
                  style={{
                    padding: '1.5px 7px',
                    borderRadius: '999px',
                    background: 'rgba(250, 204, 21, 0.22)',
                    border: '1px solid rgba(253, 224, 71, 0.55)',
                    color: '#fef08a',
                    fontSize: '10px',
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  লাভ {toBengaliNumerals(calculation.activePct)}%
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              background: 'rgba(239, 68, 68, 0.35)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* 2. Compact Single-Line Toolbar: Date + Seller + Stock Toggle + Reset */}
        <div
          style={{
            padding: '6px 10px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '5px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '3px 6px',
                borderRadius: '7px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                fontSize: '11px',
                fontWeight: 800,
                color: '#334155',
                margin: 0,
              }}
            >
              <Calendar size={11} style={{ color: '#059669', flexShrink: 0 }} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '10.8px',
                  fontWeight: 800,
                  color: '#0f172a',
                  padding: 0,
                  outline: 'none',
                  width: '90px',
                }}
              />
            </label>

            <div
              style={{
                display: 'inline-flex',
                borderRadius: '7px',
                overflow: 'hidden',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
              }}
            >
              <button
                type="button"
                onClick={() => setSeller('Rakib')}
                style={{
                  padding: '3px 7px',
                  border: 'none',
                  background: seller === 'Rakib' ? '#059669' : 'transparent',
                  color: seller === 'Rakib' ? '#ffffff' : '#475569',
                  fontSize: '10.8px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                রাকিব
              </button>
              <button
                type="button"
                onClick={() => setSeller('Limon')}
                style={{
                  padding: '3px 7px',
                  border: 'none',
                  background: seller === 'Limon' ? '#0284c7' : 'transparent',
                  color: seller === 'Limon' ? '#ffffff' : '#475569',
                  fontSize: '10.8px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                লিমন
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setDeductStockFromInventory((v) => !v)}
              style={{
                padding: '3px 7px',
                borderRadius: '7px',
                border: deductStockFromInventory ? '1.5px solid #059669' : '1px solid #cbd5e1',
                background: deductStockFromInventory ? '#ecfdf5' : '#ffffff',
                color: deductStockFromInventory ? '#047857' : '#475569',
                fontSize: '10.2px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                whiteSpace: 'nowrap',
              }}
              title="চাইলে বিক্রির টাকার অনুপাতে স্টকও কমাতে পারেন"
            >
              <Package size={11} />
              {deductStockFromInventory ? '✓ স্টক কমবে' : 'শুধু ক্যাশ হিসাব'}
            </button>

            {hasAnyValue && (
              <button
                type="button"
                onClick={handleReset}
                title="সব ঘর রিসেট করুন"
                style={{
                  padding: '3px 6px',
                  borderRadius: '7px',
                  border: '1px solid #fecdd3',
                  background: '#fff1f2',
                  color: '#be123c',
                  fontSize: '10.2px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <RotateCcw size={11} />
              </button>
            )}
          </div>
        </div>

        {/* 3. Main Body — Ultra Clean & Compact so Steps 1, 2, and 3 all fit in one view */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            padding: '8px 10px',
            background: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
          }}
        >
          {/* STEP 1: TOTAL CASH SALES INPUT CARD */}
          <div
            style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)',
              border: '1.5px solid #10b981',
              borderRadius: '12px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '12.2px',
                  fontWeight: 900,
                  color: '#064e3b',
                }}
              >
                💵 ১. আজকের মোট ক্যাশ বিক্রি (৳)
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  color: '#047857',
                  background: '#d1fae5',
                  border: '1px solid #6ee7b7',
                  padding: '1.5px 7px',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap',
                }}
              >
                আসল {toBengaliNumerals(calculation.costPct)}% • লাভ {toBengaliNumerals(calculation.activePct)}%
              </span>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '10px',
                  fontSize: '16px',
                  fontWeight: 900,
                  color: '#059669',
                }}
              >
                ৳
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="মোট ক্যাশ বিক্রি লিখুন (যেমন: 5000)..."
                value={totalCashAmountInput}
                onChange={(e) => setTotalCashAmountInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 26px',
                  borderRadius: '9px',
                  border: '1.5px solid #059669',
                  background: '#ffffff',
                  fontSize: '15.5px',
                  fontWeight: 900,
                  color: '#064e3b',
                  height: '36px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Single-Row 5 Equal Quick Cash Chips */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: '4px',
              }}
            >
              {[500, 1000, 2000, 5000, 10000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() =>
                    setTotalCashAmountInput((prev) =>
                      String((Math.round(Number(prev) || 0) || 0) + amt)
                    )
                  }
                  style={{
                    padding: '3.5px 2px',
                    borderRadius: '6px',
                    border: '1px solid #6ee7b7',
                    background: '#ffffff',
                    color: '#047857',
                    fontSize: '10.5px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  +৳{toBengaliNumerals(amt)}
                </button>
              ))}
            </div>
          </div>

          {/* STEP 2: DAILY EXPENSES ENTRY CARD (Deducted Strictly from 38% Profit Share) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%)',
              border: '1.5px solid #fb7185',
              borderRadius: '12px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '12.2px', fontWeight: 900, color: '#9f1239' }}>
                🧾 ২. প্রতিদিনের খরচ (লাভাংশ থেকে বাদ)
              </span>

              {/* Compact Segmented Mode Switch */}
              <div
                style={{
                  display: 'inline-flex',
                  borderRadius: '7px',
                  overflow: 'hidden',
                  border: '1px solid #fda4af',
                  background: '#ffffff',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpenseMode('quick_total')}
                  style={{
                    padding: '2.5px 7px',
                    border: 'none',
                    background: expenseMode === 'quick_total' ? '#e11d48' : 'transparent',
                    color: expenseMode === 'quick_total' ? '#ffffff' : '#9f1239',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  একবারে মোট
                </button>
                <button
                  type="button"
                  onClick={() => setExpenseMode('itemized')}
                  style={{
                    padding: '2.5px 7px',
                    border: 'none',
                    background: expenseMode === 'itemized' ? '#e11d48' : 'transparent',
                    color: expenseMode === 'itemized' ? '#ffffff' : '#9f1239',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  খাতওয়ারী
                </button>
              </div>
            </div>

            {expenseMode === 'quick_total' ? (
              <>
                {/* Side-by-Side Expense Amount & Optional Note to save vertical space */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.15fr 1fr',
                    gap: '6px',
                  }}
                >
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '9px',
                        fontSize: '15px',
                        fontWeight: 900,
                        color: '#e11d48',
                      }}
                    >
                      ৳
                    </span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="মোট খরচ (যেমন: 300)"
                      value={directTotalExpenseInput}
                      onChange={(e) => setDirectTotalExpenseInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '5px 8px 5px 23px',
                        borderRadius: '9px',
                        border: '1.5px solid #e11d48',
                        background: '#ffffff',
                        fontSize: '14.5px',
                        fontWeight: 900,
                        color: '#881337',
                        height: '35px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="খরচের নোট (চা, ব্যাগ...)"
                    value={customNoteInput}
                    onChange={(e) => setCustomNoteInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: '9px',
                      border: '1px solid #fda4af',
                      background: '#ffffff',
                      fontSize: '11.2px',
                      fontWeight: 700,
                      color: '#0f172a',
                      height: '35px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Single-Row 5 Equal Quick Expense Chips */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                    gap: '4px',
                  }}
                >
                  {[20, 50, 100, 200, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() =>
                        setDirectTotalExpenseInput((prev) =>
                          String((Math.round(Number(prev) || 0) || 0) + amt)
                        )
                      }
                      style={{
                        padding: '3px 2px',
                        borderRadius: '6px',
                        border: '1px solid #fda4af',
                        background: '#ffffff',
                        color: '#be123c',
                        fontSize: '10.5px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      +৳{toBengaliNumerals(amt)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '5px',
                  }}
                >
                  {DAILY_EXPENSE_CATEGORIES.map((cat) => {
                    const val = categoryExpenses[cat.id] || '';
                    return (
                      <div
                        key={cat.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '4px',
                          background: '#ffffff',
                          padding: '4px 6px',
                          borderRadius: '7px',
                          border: Number(val) > 0 ? '1.5px solid #e11d48' : '1px solid #fecdd3',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            color: '#881337',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cat.label}
                        </span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          placeholder="৳0"
                          value={val}
                          onChange={(e) =>
                            setCategoryExpenses((prev) => ({
                              ...prev,
                              [cat.id]: e.target.value,
                            }))
                          }
                          style={{
                            width: '56px',
                            padding: '2.5px 4px',
                            borderRadius: '5px',
                            border: '1px solid #fda4af',
                            fontSize: '11.5px',
                            fontWeight: 900,
                            textAlign: 'center',
                            color: '#9f1239',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <input
                  type="text"
                  placeholder="ঐচ্ছিক নোট (যেমন: রাতের গল্লা ও খরচের বিবরণ)..."
                  value={customNoteInput}
                  onChange={(e) => setCustomNoteInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    borderRadius: '7px',
                    border: '1px solid #fda4af',
                    background: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#0f172a',
                    boxSizing: 'border-box',
                  }}
                />
              </>
            )}
          </div>

          {/* STEP 3: LIVE PROFIT / LOSS & CASH BREAKDOWN (All visible without scrolling!) */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1.5px solid #cbd5e1',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '11.8px', fontWeight: 900, color: '#0f172a' }}>
                📊 ৩. আজকের লাভ-লস হিসাব (খরচ লাভাংশ থেকে বাদ)
              </span>
              {!isEmployee && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#475569' }}>
                    লাভ%:
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="95"
                    value={profitMarginPct}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) {
                        setProfitMarginPct(Math.max(1, Math.min(95, val)));
                      }
                    }}
                    style={{
                      width: '40px',
                      padding: '1px 3px',
                      borderRadius: '5px',
                      border: '1px solid #059669',
                      fontSize: '11px',
                      fontWeight: 900,
                      textAlign: 'center',
                    }}
                  />
                </div>
              )}
            </div>

            {/* 2x2 Compact Horizontal KPI Cards — super clear on mobile */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '5px',
              }}
            >
              {/* 1. Total Sales */}
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '10.2px', fontWeight: 800, color: '#166534' }}>
                  ১. মোট বিক্রি (১০০%)
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#14532d' }}>
                  {formatMoney(calculation.totalSales)}
                </span>
              </div>

              {!isEmployee && (
                <>
                  {/* 2. Protected Asol (62%) */}
                  <div
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #93c5fd',
                      borderRadius: '8px',
                      padding: '5px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '10.2px', fontWeight: 800, color: '#1e40af' }}>
                      ২. আসল ({toBengaliNumerals(calculation.costPct)}% অক্ষত)
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#1e3a8a' }}>
                      {formatMoney(calculation.totalCogs)}
                    </span>
                  </div>

                  {/* 3. Gross Profit (38%) */}
                  <div
                    style={{
                      background: '#ecfdf5',
                      border: '1px solid #6ee7b7',
                      borderRadius: '8px',
                      padding: '5px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '10.2px', fontWeight: 800, color: '#047857' }}>
                      ৩. বিক্রয় লাভ ({toBengaliNumerals(calculation.activePct)}%)
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#065f46' }}>
                      +{formatMoney(calculation.grossProfit)}
                    </span>
                  </div>
                </>
              )}

              {/* 4. Daily Expenses */}
              <div
                style={{
                  background: '#fff1f2',
                  border: '1px solid #fda4af',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '10.2px', fontWeight: 800, color: '#9f1239' }}>
                  ৪. আজকের খরচ
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#be123c' }}>
                  -{formatMoney(calculation.totalExpenses)}
                </span>
              </div>
            </div>

            {/* Final Net Profit/Loss & Net Cash Summary Banner */}
            {!isEmployee ? (
              <div
                style={{
                  padding: '7px 10px',
                  borderRadius: '9px',
                  background:
                    calculation.netProfitAfterExpense >= 0
                      ? 'linear-gradient(135deg, #fefce8 0%, #fef08a 100%)'
                      : 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)',
                  border:
                    calculation.netProfitAfterExpense >= 0
                      ? '1.5px solid #eab308'
                      : '1.5px solid #f43f5e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 900,
                      color: calculation.netProfitAfterExpense >= 0 ? '#713f12' : '#881337',
                    }}
                  >
                    {calculation.netProfitAfterExpense >= 0
                      ? '💰 খরচ বাদে আজকের চূড়ান্ত নিট লাভ:'
                      : '⚠️ খরচ বাদে আজকের চূড়ান্ত নিট লস:'}
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: calculation.netProfitAfterExpense >= 0 ? '#854d0e' : '#9f1239',
                    }}
                  >
                    লাভ {formatMoney(calculation.grossProfit)} − খরচ{' '}
                    {formatMoney(calculation.totalExpenses)} | হাতে নগদ:{' '}
                    <strong>{formatMoney(calculation.netCashRemainingInDrawer)}</strong>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: calculation.netProfitAfterExpense >= 0 ? '#15803d' : '#be123c',
                    background: '#ffffff',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    border:
                      calculation.netProfitAfterExpense >= 0
                        ? '1.5px solid #86efac'
                        : '1.5px solid #fda4af',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {calculation.netProfitAfterExpense >= 0 ? '+' : ''}
                  {formatMoney(calculation.netProfitAfterExpense)}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: '#166534',
                }}
              >
                <span>💵 খরচ বাদে ক্যাশবাক্সে নগদ থাকবে:</span>
                <strong style={{ fontSize: '14px' }}>
                  {formatMoney(calculation.netCashRemainingInDrawer)}
                </strong>
              </div>
            )}
          </div>

          {/* RECENT SUBMISSIONS (WITH 1-CLICK UNDO) */}
          {recentSubmissions.length > 0 && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '10px',
                padding: '7px 10px',
                border: '1px solid #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
              }}
            >
              <div style={{ fontSize: '10.5px', fontWeight: 900, color: '#0f766e' }}>
                ✅ এইমাত্র সেভ করা হিসাব (ভুল হলে বাতিল করুন):
              </div>
              {recentSubmissions.map((sub) => (
                <div
                  key={sub.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    padding: '5px 8px',
                    borderRadius: '7px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#0f172a' }}>
                    বিক্রি: {formatMoney(sub.salesAmount)} | খরচ: {formatMoney(sub.expenseAmount)}
                    {!isEmployee && (
                      <span
                        style={{
                          color: sub.netProfitAfterExpense >= 0 ? '#059669' : '#e11d48',
                          marginLeft: '5px',
                        }}
                      >
                        (নিট {sub.netProfitAfterExpense >= 0 ? 'লাভ +' : 'লস '}
                        {formatMoney(sub.netProfitAfterExpense)})
                      </span>
                    )}
                  </div>
                  {onUndoBulkTally && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onUndoBulkTally(sub.result, sub.title);
                        setRecentSubmissions((prev) => prev.filter((x) => x.key !== sub.key));
                      }}
                      style={{
                        padding: '3px 7px',
                        borderRadius: '6px',
                        border: '1px solid #fca5a5',
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontSize: '10px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      বাতিল
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Sticky Bottom Action Bar */}
        <div
          style={{
            padding: '8px 10px',
            background: '#ffffff',
            borderTop: '1.5px solid #cbd5e1',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '11px',
              border: 'none',
              background: canSubmit
                ? 'linear-gradient(135deg, #059669 0%, #0d9488 100%)'
                : '#cbd5e1',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 900,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: canSubmit ? '0 6px 16px -4px rgba(5, 150, 105, 0.5)' : 'none',
            }}
          >
            <CheckCircle2 size={16} />
            {isSubmitting
              ? 'হিসাব সেভ হচ্ছে...'
              : calculation.totalSales > 0 && calculation.totalExpenses > 0
              ? `বিক্রি (${formatMoney(calculation.totalSales)}) ও খরচ (${formatMoney(
                  calculation.totalExpenses
                )}) সেভ করুন`
              : calculation.totalSales > 0
              ? `মোট বিক্রি (${formatMoney(calculation.totalSales)}) সেভ করুন`
              : calculation.totalExpenses > 0
              ? `আজকের খরচ (${formatMoney(calculation.totalExpenses)}) সেভ করুন`
              : 'মোট ক্যাশ বিক্রি বা আজকের খরচ লিখে সেভ করুন'}
          </button>
        </div>
      </div>
    </div>
  );
}
