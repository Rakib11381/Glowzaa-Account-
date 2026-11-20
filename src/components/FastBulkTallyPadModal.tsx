import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  RotateCcw,
  CheckCircle2,
  Package,
  Calendar,
  Banknote,
  TrendingUp,
  Wallet,
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
}

interface FastBulkTallyPadModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialSeller: 'Rakib' | 'Limon';
  isEmployee?: boolean;
  todayStr: string;
  onSubmitBulkTally: (payload: BulkTallySubmitPayload) => Promise<string | undefined>;
  onUndoBulkTally?: (entryId: string, summaryTitle: string) => Promise<void>;
}

interface PersistedCashTallyDraft {
  totalCashAmountInput: string;
  profitMarginPct: number;
  deductStockFromInventory: boolean;
}

const STORAGE_KEY = 'glowzaa_total_cash_auto_calc_38_v1';
const FIXED_DEFAULT_PROFIT_PCT = 38;

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
  return `৳${val.toLocaleString('en-IN', {
    minimumFractionDigits: val % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
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
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [seller, setSeller] = useState<'Rakib' | 'Limon'>(initialSeller);
  const [customNoteInput, setCustomNoteInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recentSubmissions, setRecentSubmissions] = useState<
    Array<{
      id: string;
      title: string;
      amount: number;
      cost: number;
      profit: number;
      time: string;
    }>
  >([]);

  // Load persisted draft on mount (always defaulting profitMarginPct to 38%)
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
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage quota errors
    }
  }, [totalCashAmountInput, profitMarginPct, deductStockFromInventory]);

  // Average product selling price from inventory for estimating piece count
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

  // Strictly calculate 38% Profit & 62% Cost (or active margin %) from total cash entered
  const calculation = useMemo(() => {
    const totalSales = Math.max(0, Math.round((Number(totalCashAmountInput) || 0) * 100) / 100);
    const activePct =
      Number.isFinite(profitMarginPct) && profitMarginPct > 0 && profitMarginPct < 100
        ? profitMarginPct
        : FIXED_DEFAULT_PROFIT_PCT;
    const costPct = Math.round((100 - activePct) * 100) / 100;

    // Exact 38% profit and 62% cost (COGS)
    const grossProfit = Math.round(totalSales * (activePct / 100) * 100) / 100;
    const totalCogs = Math.max(0, Math.round((totalSales - grossProfit) * 100) / 100);

    const comboItems: BulkTallyComboItem[] = [];
    let totalPieces = totalSales > 0 ? Math.max(1, Math.round(totalSales / avgSellingPrice)) : 0;

    // Optional proportional stock deduction from stocked products if user toggles it ON
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
      totalPieces,
      comboItems,
    };
  }, [
    totalCashAmountInput,
    profitMarginPct,
    avgSellingPrice,
    deductStockFromInventory,
    products,
  ]);

  const handleReset = () => {
    setTotalCashAmountInput('');
    setCustomNoteInput('');
  };

  const handleSubmit = async () => {
    if (calculation.totalSales <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const noteSuffix = customNoteInput.trim() ? ` | নোট: ${customNoteInput.trim()}` : '';
      const title = `💵 মোট ক্যাশ থেকে অটো-হিসাব বিক্রয় (লাভ ${toBengaliNumerals(
        calculation.activePct
      )}%)`;

      const notes = `মোট ক্যাশ বসিয়ে অটো হিসাব — মোট বিক্রয়: ৳${toBengaliNumerals(
        calculation.totalSales
      )} | আসল (${toBengaliNumerals(calculation.costPct)}%): ৳${toBengaliNumerals(
        calculation.totalCogs
      )} | নিট লাভ (${toBengaliNumerals(calculation.activePct)}%): +৳${toBengaliNumerals(
        calculation.grossProfit
      )}${noteSuffix}`;

      const createdId = await onSubmitBulkTally({
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
      });

      if (createdId) {
        const nowTime = new Date().toLocaleTimeString('bn-BD', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setRecentSubmissions((prev) => [
          {
            id: createdId,
            title,
            amount: calculation.totalSales,
            cost: calculation.totalCogs,
            profit: calculation.grossProfit,
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.84)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '22px',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '2px solid #059669',
          boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* 1. Header */}
        <div
          style={{
            padding: '12px 15px',
            background: 'linear-gradient(135deg, #0f172a 0%, #065f46 55%, #059669 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '9px',
                background: 'rgba(16, 185, 129, 0.25)',
                border: '1px solid rgba(110, 231, 183, 0.5)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6ee7b7',
                flexShrink: 0,
              }}
            >
              <Banknote size={17} />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '15.5px',
                    fontWeight: 900,
                    color: '#ffffff',
                  }}
                >
                  💵 শুধু মোট ক্যাশ বসিয়ে অটো হিসাব
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(250, 204, 21, 0.22)',
                    border: '1px solid rgba(253, 224, 71, 0.55)',
                    color: '#fef08a',
                    fontSize: '11px',
                    fontWeight: 900,
                  }}
                >
                  লাভ {toBengaliNumerals(calculation.activePct)}% সেট করা
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
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
            <X size={16} />
          </button>
        </div>

        {/* 2. Date, Seller & Optional Stock Sync Toolbar */}
        <div
          style={{
            padding: '8px 12px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                fontSize: '11.5px',
                fontWeight: 800,
                color: '#334155',
                margin: 0,
              }}
            >
              <Calendar size={12} style={{ color: '#059669', flexShrink: 0 }} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: '#0f172a',
                  padding: 0,
                  outline: 'none',
                  width: '98px',
                }}
              />
            </label>

            <div
              style={{
                display: 'inline-flex',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
              }}
            >
              <button
                type="button"
                onClick={() => setSeller('Rakib')}
                style={{
                  padding: '4px 9px',
                  border: 'none',
                  background: seller === 'Rakib' ? '#059669' : 'transparent',
                  color: seller === 'Rakib' ? '#ffffff' : '#475569',
                  fontSize: '11px',
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
                  padding: '4px 9px',
                  border: 'none',
                  background: seller === 'Limon' ? '#0284c7' : 'transparent',
                  color: seller === 'Limon' ? '#ffffff' : '#475569',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                লিমন
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDeductStockFromInventory((v) => !v)}
            style={{
              padding: '4px 9px',
              borderRadius: '8px',
              border: deductStockFromInventory ? '1.5px solid #059669' : '1px solid #cbd5e1',
              background: deductStockFromInventory ? '#ecfdf5' : '#ffffff',
              color: deductStockFromInventory ? '#047857' : '#475569',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Package size={12} />
            {deductStockFromInventory ? '✓ অটো স্টক কমানো: চালু' : 'শুধু ক্যাশ ও ৩৮% লাভ হিসাব'}
          </button>
        </div>

        {/* 3. Scrollable Main Body */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            padding: '12px 14px',
            background: '#f8fafc',
            display: 'block',
          }}
        >
          {/* Main Cash Input Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)',
              border: '2px solid #10b981',
              borderRadius: '16px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '11px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#065f46',
                lineHeight: 1.4,
              }}
            >
              💡 সারাদিন কয়টা ২০৳ বা ৫০৳ টাকার মাল বিক্রি হয়েছে তা মনে রাখার দরকার নেই। রাতে শুধু <strong>মোট কত টাকা ক্যাশ বিক্রি হয়েছে</strong> নিচে লিখুন—সিস্টেম <strong>{toBengaliNumerals(calculation.activePct)}% লাভ</strong> এবং <strong>{toBengaliNumerals(calculation.costPct)}% আসল (ক্রয়মূল্য)</strong> ধরে অটো হিসাব করে দেবে।
            </div>

            {/* Big Cash Input Box */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 900,
                  color: '#0f172a',
                  marginBottom: '5px',
                }}
              >
                আজকের মোট ক্যাশ বিক্রির টাকা লিখুন (৳):
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    fontSize: '20px',
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
                  placeholder="যেমন: 3500 বা 6500..."
                  value={totalCashAmountInput}
                  onChange={(e) => setTotalCashAmountInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && calculation.totalSales > 0) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 34px',
                    borderRadius: '12px',
                    border: '2px solid #059669',
                    background: '#ffffff',
                    fontSize: '20px',
                    fontWeight: 900,
                    color: '#064e3b',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.12)',
                  }}
                />
              </div>
            </div>

            {/* Quick Cash Add Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {[500, 1000, 1500, 2000, 3000, 5000, 8000, 10000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() =>
                    setTotalCashAmountInput((prev) =>
                      String((Math.round(Number(prev) || 0) || 0) + amt)
                    )
                  }
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    border: '1px solid #6ee7b7',
                    background: '#ffffff',
                    color: '#047857',
                    fontSize: '11.5px',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  +৳{toBengaliNumerals(amt)}
                </button>
              ))}
            </div>

            {/* 38% Profit Margin Control Bar (Admin Only) */}
            {!isEmployee && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '11px',
                  border: '1.5px solid #a7f3d0',
                  padding: '8px 11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingUp size={15} style={{ color: '#059669', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>
                      লাভের হার: {toBengaliNumerals(calculation.activePct)}% (আসল: {toBengaliNumerals(calculation.costPct)}%)
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                      প্রতি ৳১০০ বিক্রয়ে ৳{toBengaliNumerals(calculation.activePct)} লাভ এবং ৳{toBengaliNumerals(calculation.costPct)} আসল
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
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
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '7px',
                      border: '1.5px solid #059669',
                      fontSize: '13px',
                      fontWeight: 900,
                      textAlign: 'center',
                      color: '#064e3b',
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#047857' }}>%</span>
                  {profitMarginPct !== FIXED_DEFAULT_PROFIT_PCT && (
                    <button
                      type="button"
                      onClick={() => setProfitMarginPct(FIXED_DEFAULT_PROFIT_PCT)}
                      style={{
                        padding: '4px 7px',
                        borderRadius: '6px',
                        border: '1px solid #059669',
                        background: '#ecfdf5',
                        color: '#047857',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ৩৮% রিসেট
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Optional Note Field */}
            <div>
              <input
                type="text"
                placeholder="ঐচ্ছিক নোট (যেমন: রাতের গল্লা মিলকরণ / সারাদিনের খুচরা বিক্রি)..."
                value={customNoteInput}
                onChange={(e) => setCustomNoteInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 11px',
                  borderRadius: '9px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0f172a',
                }}
              />
            </div>
          </div>

          {/* Live 3-Column Financial Breakdown Preview */}
          <div
            style={{
              marginTop: '10px',
              display: 'grid',
              gridTemplateColumns: isEmployee
                ? 'repeat(1, minmax(0, 1fr))'
                : 'repeat(3, minmax(0, 1fr))',
              gap: '8px',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                border: '1.5px solid #6ee7b7',
                borderRadius: '12px',
                padding: '10px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#047857' }}>
                💵 মোট ক্যাশ বিক্রয় (১০০%)
              </div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#064e3b', marginTop: '2px' }}>
                {formatMoney(calculation.totalSales)}
              </div>
            </div>

            {!isEmployee && (
              <>
                <div
                  style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)',
                    border: '1.5px solid #bae6fd',
                    borderRadius: '12px',
                    padding: '10px 8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#0369a1' }}>
                    📥 আসল / ক্রয়মূল্য ({toBengaliNumerals(calculation.costPct)}%)
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 900,
                      color: '#0c4a6e',
                      marginTop: '2px',
                    }}
                  >
                    {formatMoney(calculation.totalCogs)}
                  </div>
                </div>

                <div
                  style={{
                    background: 'linear-gradient(135deg, #fefce8 0%, #fef08a 100%)',
                    border: '1.5px solid #fde047',
                    borderRadius: '12px',
                    padding: '10px 8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#854d0e' }}>
                    💰 নিট লাভ ({toBengaliNumerals(calculation.activePct)}%)
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 900,
                      color: '#713f12',
                      marginTop: '2px',
                    }}
                  >
                    +{formatMoney(calculation.grossProfit)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Recent Session Submissions with 1-Click Undo */}
          {recentSubmissions.length > 0 && (
            <div
              style={{
                marginTop: '10px',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #a7f3d0',
                padding: '9px 11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 900, color: '#047857' }}>
                ✅ এইমাত্র সেভ করা ক্যাশ সেল হিসাব:
              </div>
              {recentSubmissions.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    padding: '6px 9px',
                    borderRadius: '8px',
                    background: '#f0fdf4',
                    fontSize: '11.5px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#064e3b' }}>
                    বিক্রয়: <strong>{formatMoney(item.amount)}</strong>
                    {!isEmployee && (
                      <>
                        {' '}
                        • আসল: <strong>{formatMoney(item.cost)}</strong> • লাভ:{' '}
                        <strong style={{ color: '#059669' }}>+{formatMoney(item.profit)}</strong>
                      </>
                    )}{' '}
                    ({item.time})
                  </div>
                  {onUndoBulkTally && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onUndoBulkTally(item.id, item.title);
                        setRecentSubmissions((prev) => prev.filter((r) => r.id !== item.id));
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #fca5a5',
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ↩️ বাতিল
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Sticky Footer Action Bar */}
        <div
          style={{
            padding: '10px 14px',
            background: '#ffffff',
            borderTop: '2px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {calculation.totalSales > 0 && (
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0,
              }}
            >
              <RotateCcw size={14} /> রিসেট
            </button>
          )}

          <button
            type="button"
            disabled={calculation.totalSales <= 0 || isSubmitting}
            onClick={handleSubmit}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: '11px',
              border: 'none',
              background:
                calculation.totalSales > 0
                  ? 'linear-gradient(135deg, #059669 0%, #0d9488 100%)'
                  : '#cbd5e1',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 900,
              cursor: calculation.totalSales > 0 ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              boxShadow:
                calculation.totalSales > 0 ? '0 6px 18px rgba(5, 150, 105, 0.32)' : 'none',
            }}
          >
            <CheckCircle2 size={16} />
            {isSubmitting
              ? 'হিসাব সেভ হচ্ছে...'
              : calculation.totalSales > 0
              ? `সেল সেভ করুন — বিক্রয় ${formatMoney(calculation.totalSales)} (লাভ +${formatMoney(
                  calculation.grossProfit
                )})`
              : 'মোট ক্যাশ টাকা লিখে সেভ করুন'}
          </button>
        </div>
      </div>
    </div>
  );
}
