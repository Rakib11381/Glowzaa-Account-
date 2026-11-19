import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Zap,
  RotateCcw,
  CheckCircle2,
  Plus,
  Minus,
  Package,
  Layers,
  Calculator,
  Trash2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { Product } from '../types';
import { resolveProductImageUrl } from '../data';

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

interface PersistedTallyDraft {
  mode: 'price_group' | 'product_wise';
  groupCounts: Record<string, number>;
  groupCustomCosts: Record<string, number>;
  customPrices: number[];
  productCounts: Record<string, number>;
  deductStockInGroupMode: boolean;
  discountAmount: string;
}

const STORAGE_KEY = 'glowzaa_fast_bulk_tally_draft_v1';

const DEFAULT_PRICE_TIERS = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100, 120, 150];

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
  const [mode, setMode] = useState<'price_group' | 'product_wise'>('price_group');
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [groupCustomCosts, setGroupCustomCosts] = useState<Record<string, number>>({});
  const [customPrices, setCustomPrices] = useState<number[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [deductStockInGroupMode, setDeductStockInGroupMode] = useState<boolean>(true);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [cashInDrawerInput, setCashInDrawerInput] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [seller, setSeller] = useState<'Rakib' | 'Limon'>(initialSeller);
  const [selectedPriceFilter, setSelectedPriceFilter] = useState<number | 'all'>('all');
  const [newCustomPriceInput, setNewCustomPriceInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recentSubmissions, setRecentSubmissions] = useState<
    Array<{ id: string; title: string; amount: number; qty: number; time: string }>
  >([]);

  // Load persisted draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedTallyDraft>;
      if (parsed.mode === 'price_group' || parsed.mode === 'product_wise') {
        setMode(parsed.mode);
      }
      if (parsed.groupCounts && typeof parsed.groupCounts === 'object') {
        setGroupCounts(parsed.groupCounts);
      }
      if (parsed.groupCustomCosts && typeof parsed.groupCustomCosts === 'object') {
        setGroupCustomCosts(parsed.groupCustomCosts);
      }
      if (Array.isArray(parsed.customPrices)) {
        setCustomPrices(parsed.customPrices.filter((p) => Number.isFinite(p) && p > 0));
      }
      if (parsed.productCounts && typeof parsed.productCounts === 'object') {
        setProductCounts(parsed.productCounts);
      }
      if (typeof parsed.deductStockInGroupMode === 'boolean') {
        setDeductStockInGroupMode(parsed.deductStockInGroupMode);
      }
      if (typeof parsed.discountAmount === 'string') {
        setDiscountAmount(parsed.discountAmount);
      }
    } catch {
      // ignore invalid storage
    }
  }, []);

  // Save draft on state changes
  useEffect(() => {
    try {
      const draft: PersistedTallyDraft = {
        mode,
        groupCounts,
        groupCustomCosts,
        customPrices,
        productCounts,
        deductStockInGroupMode,
        discountAmount,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage quota errors
    }
  }, [
    mode,
    groupCounts,
    groupCustomCosts,
    customPrices,
    productCounts,
    deductStockInGroupMode,
    discountAmount,
  ]);

  // Build unified price tiers from inventory + default tiers + user custom prices
  const priceGroups = useMemo(() => {
    const map = new Map<
      number,
      {
        price: number;
        products: Product[];
        totalStock: number;
        avgCost: number;
      }
    >();

    // Seed default tiers & custom prices
    const allPrices = new Set<number>([...DEFAULT_PRICE_TIERS, ...customPrices]);
    for (const p of products) {
      const sp = Math.round(Number(p.sellingPrice) || 0);
      if (sp > 0) allPrices.add(sp);
    }

    const sortedPrices = Array.from(allPrices).sort((a, b) => a - b);

    for (const price of sortedPrices) {
      const matching = products.filter((p) => Math.round(Number(p.sellingPrice) || 0) === price);
      const totalStock = matching.reduce((acc, p) => acc + Math.max(0, Number(p.currentStock) || 0), 0);

      // Compute weighted average cost (or simple average if stock is 0)
      let avgCost = 0;
      if (matching.length > 0) {
        const stockWeightedCost = matching.reduce(
          (acc, p) => acc + Math.max(0, Number(p.currentStock) || 0) * (Number(p.averageCost) || 0),
          0
        );
        if (totalStock > 0 && stockWeightedCost > 0) {
          avgCost = stockWeightedCost / totalStock;
        } else {
          const sumCost = matching.reduce((acc, p) => acc + (Number(p.averageCost) || 0), 0);
          avgCost = sumCost / matching.length;
        }
      } else {
        // Fallback default estimated cost (55% of selling price) if no product exists at this tier yet
        avgCost = Math.round(price * 0.55 * 100) / 100;
      }

      map.set(price, {
        price,
        products: matching,
        totalStock,
        avgCost: Math.round(avgCost * 100) / 100,
      });
    }

    return Array.from(map.values());
  }, [products, customPrices]);

  // Calculate live totals, COGS, profit, and stock deduction plan
  const tallyCalculation = useMemo(() => {
    let rawSalesTotal = 0;
    let totalCogs = 0;
    let totalPieces = 0;
    const comboItems: BulkTallyComboItem[] = [];
    const lineSummaries: string[] = [];

    if (mode === 'price_group') {
      for (const grp of priceGroups) {
        const key = String(grp.price);
        const qty = Math.max(0, Math.round(Number(groupCounts[key]) || 0));
        if (qty <= 0) continue;

        const effectiveUnitCost =
          groupCustomCosts[key] !== undefined && Number.isFinite(groupCustomCosts[key])
            ? Math.max(0, Number(groupCustomCosts[key]))
            : grp.avgCost;

        const lineSales = Math.round(qty * grp.price * 100) / 100;
        let lineCogs = Math.round(qty * effectiveUnitCost * 100) / 100;

        // If smart stock deduction is enabled and there are products in this price group, allocate across available products
        if (deductStockInGroupMode && grp.products.length > 0) {
          const sortedProds = [...grp.products].sort(
            (a, b) => (Number(b.currentStock) || 0) - (Number(a.currentStock) || 0)
          );
          let remainingToAllocate = qty;
          let allocatedCogs = 0;

          for (let i = 0; i < sortedProds.length; i++) {
            const prod = sortedProds[i];
            if (remainingToAllocate <= 0) break;
            const avail = Math.max(0, Math.floor(Number(prod.currentStock) || 0));
            const isLast = i === sortedProds.length - 1;
            const take = isLast
              ? remainingToAllocate
              : avail > 0
              ? Math.min(remainingToAllocate, avail)
              : 0;

            if (take > 0) {
              const pCost = Number(prod.averageCost) || effectiveUnitCost;
              comboItems.push({
                productId: prod.id,
                productName: prod.name,
                unit: prod.unit || 'পিস',
                quantity: take,
                unitCost: pCost,
                sellingPrice: grp.price,
              });
              allocatedCogs += take * pCost;
              remainingToAllocate -= take;
            }
          }

          lineCogs = Math.round(allocatedCogs * 100) / 100;
        }

        rawSalesTotal += lineSales;
        totalCogs += lineCogs;
        totalPieces += qty;
        lineSummaries.push(`৳${toBengaliNumerals(grp.price)}×${toBengaliNumerals(qty)}পিস = ৳${toBengaliNumerals(lineSales)}`);
      }
    } else {
      // Product-wise tally mode
      for (const prod of products) {
        const qty = Math.max(0, Math.round(Number(productCounts[prod.id]) || 0));
        if (qty <= 0) continue;

        const sp = Number(prod.sellingPrice) || 0;
        const uc = Number(prod.averageCost) || 0;
        const lineSales = Math.round(qty * sp * 100) / 100;
        const lineCogs = Math.round(qty * uc * 100) / 100;

        rawSalesTotal += lineSales;
        totalCogs += lineCogs;
        totalPieces += qty;

        comboItems.push({
          productId: prod.id,
          productName: prod.name,
          unit: prod.unit || 'পিস',
          quantity: qty,
          unitCost: uc,
          sellingPrice: sp,
        });

        lineSummaries.push(
          `${prod.name} (৳${toBengaliNumerals(sp)}×${toBengaliNumerals(qty)}${prod.unit || 'পিস'})`
        );
      }
    }

    rawSalesTotal = Math.round(rawSalesTotal * 100) / 100;
    totalCogs = Math.round(totalCogs * 100) / 100;

    // Calculate discount or cash drawer adjustment
    let effectiveDiscount = Math.max(0, Number(discountAmount) || 0);
    const cashVal = Number(cashInDrawerInput);
    if (cashInDrawerInput.trim() !== '' && Number.isFinite(cashVal) && cashVal >= 0 && rawSalesTotal > 0) {
      effectiveDiscount = Math.max(0, Math.round((rawSalesTotal - cashVal) * 100) / 100);
    }

    const finalSalesAmount = Math.max(0, Math.round((rawSalesTotal - effectiveDiscount) * 100) / 100);
    const grossProfit = Math.round((finalSalesAmount - totalCogs) * 100) / 100;

    return {
      rawSalesTotal,
      effectiveDiscount,
      finalSalesAmount,
      totalCogs,
      grossProfit,
      totalPieces,
      comboItems,
      lineSummaries,
    };
  }, [
    mode,
    priceGroups,
    groupCounts,
    groupCustomCosts,
    deductStockInGroupMode,
    products,
    productCounts,
    discountAmount,
    cashInDrawerInput,
  ]);

  const adjustGroupCount = (price: number, delta: number) => {
    const key = String(price);
    setGroupCounts((prev) => {
      const cur = Math.max(0, Math.round(Number(prev[key]) || 0));
      const next = Math.max(0, cur + delta);
      const copy = { ...prev };
      if (next === 0) {
        delete copy[key];
      } else {
        copy[key] = next;
      }
      return copy;
    });
  };

  const setExactGroupCount = (price: number, valStr: string) => {
    const key = String(price);
    const cleaned = valStr.replace(/[^0-9]/g, '');
    const num = cleaned ? Math.max(0, parseInt(cleaned, 10)) : 0;
    setGroupCounts((prev) => {
      const copy = { ...prev };
      if (num <= 0) {
        delete copy[key];
      } else {
        copy[key] = num;
      }
      return copy;
    });
  };

  const adjustProductCount = (productId: string, delta: number) => {
    setProductCounts((prev) => {
      const cur = Math.max(0, Math.round(Number(prev[productId]) || 0));
      const next = Math.max(0, cur + delta);
      const copy = { ...prev };
      if (next === 0) {
        delete copy[productId];
      } else {
        copy[productId] = next;
      }
      return copy;
    });
  };

  const setExactProductCount = (productId: string, valStr: string) => {
    const cleaned = valStr.replace(/[^0-9]/g, '');
    const num = cleaned ? Math.max(0, parseInt(cleaned, 10)) : 0;
    setProductCounts((prev) => {
      const copy = { ...prev };
      if (num <= 0) {
        delete copy[productId];
      } else {
        copy[productId] = num;
      }
      return copy;
    });
  };

  const handleAddCustomPriceTier = () => {
    const parsed = Math.round(Number(newCustomPriceInput) || 0);
    if (parsed <= 0) return;
    if (!customPrices.includes(parsed) && !DEFAULT_PRICE_TIERS.includes(parsed)) {
      setCustomPrices((prev) => [...prev, parsed]);
    }
    setNewCustomPriceInput('');
  };

  const handleResetAll = () => {
    if (mode === 'price_group') {
      setGroupCounts({});
    } else {
      setProductCounts({});
    }
    setDiscountAmount('');
    setCashInDrawerInput('');
  };

  const handleSubmit = async () => {
    if (tallyCalculation.totalPieces <= 0 || tallyCalculation.finalSalesAmount <= 0 || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      const breakdownStr = tallyCalculation.lineSummaries.join(', ');
      const discountNote =
        tallyCalculation.effectiveDiscount > 0
          ? ` | খুচরা ছাড়: -৳${toBengaliNumerals(tallyCalculation.effectiveDiscount)}`
          : '';
      const modeTag =
        mode === 'price_group'
          ? '⚡ ফাস্ট প্রাইস-গ্রুপ টালি সেল'
          : '📸 ফাস্ট প্রডাক্ট বাল্ক টালি সেল';

      const title = `${modeTag} (${toBengaliNumerals(tallyCalculation.totalPieces)} পিস): ${
        tallyCalculation.lineSummaries.slice(0, 4).join(' + ')
      }${tallyCalculation.lineSummaries.length > 4 ? ' ...' : ''}`;

      const notes = `${modeTag} দ্বারা এক ক্লিকে এন্ট্রিকৃত — বিবরণ: ${breakdownStr}${discountNote} | মোট পিস: ${toBengaliNumerals(
        tallyCalculation.totalPieces
      )} | মোট বিক্রয়: ৳${toBengaliNumerals(tallyCalculation.finalSalesAmount)}`;

      const createdId = await onSubmitBulkTally({
        title,
        totalAmount: tallyCalculation.finalSalesAmount,
        totalQuantity: tallyCalculation.totalPieces,
        cogsAmount: tallyCalculation.totalCogs,
        grossProfit: tallyCalculation.grossProfit,
        date: selectedDate || todayStr,
        seller,
        notes,
        category: 'ফাস্ট বাল্ক টালি সেল (POS)',
        comboItems: tallyCalculation.comboItems.length > 0 ? tallyCalculation.comboItems : undefined,
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
            amount: tallyCalculation.finalSalesAmount,
            qty: tallyCalculation.totalPieces,
            time: nowTime,
          },
          ...prev.slice(0, 4),
        ]);
      }

      // Clear active counts after successful save
      if (mode === 'price_group') {
        setGroupCounts({});
      } else {
        setProductCounts({});
      }
      setDiscountAmount('');
      setCashInDrawerInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProductsForVisualMode = useMemo(() => {
    const list = [...products].sort(
      (a, b) => (Number(a.sellingPrice) || 0) - (Number(b.sellingPrice) || 0)
    );
    if (selectedPriceFilter === 'all') return list;
    return list.filter((p) => Math.round(Number(p.sellingPrice) || 0) === selectedPriceFilter);
  }, [products, selectedPriceFilter]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.82)',
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
          maxWidth: '720px',
          width: '100%',
          maxHeight: '94vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '2px solid #0d9488',
          boxShadow: '0 28px 65px -12px rgba(0, 0, 0, 0.65)',
        }}
      >
        {/* 1. Header */}
        <div
          style={{
            padding: '14px 16px',
            background: 'linear-gradient(135deg, #0f172a 0%, #115e59 55%, #0d9488 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  borderRadius: '9px',
                  background: 'rgba(16, 185, 129, 0.25)',
                  border: '1px solid rgba(110, 231, 183, 0.5)',
                  color: '#6ee7b7',
                }}
              >
                <Zap size={17} />
              </span>
              <h2
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 900,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                }}
              >
                ⚡ ফাস্ট বাল্ক টালি প্যাড (২০/৩০/৫০ টাকার প্রডাক্ট)
              </h2>
              <span
                style={{
                  padding: '2.5px 9px',
                  borderRadius: '999px',
                  background: 'rgba(250, 204, 21, 0.2)',
                  border: '1px solid rgba(253, 224, 71, 0.5)',
                  color: '#fef08a',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                অটো ড্রাফট সেভ থাকে
              </span>
            </div>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '11.5px',
                color: '#ccfbf1',
                lineHeight: 1.35,
              }}
            >
              ভিড়ের সময় বা রাতে দোকান বন্ধের সময় কোন দামের প্রডাক্ট মোট কত পিস বিক্রি হয়েছে তা এক ক্লিকে হিসাব ও সেল করুন।
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
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
            <X size={18} />
          </button>
        </div>

        {/* 2. Top Controls: Mode Switcher + Date + Seller + Stock Deduct Toggle */}
        <div
          style={{
            padding: '10px 14px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Mode Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setMode('price_group')}
              style={{
                padding: '9px 10px',
                borderRadius: '11px',
                border: mode === 'price_group' ? '2px solid #0d9488' : '1px solid #cbd5e1',
                background:
                  mode === 'price_group'
                    ? 'linear-gradient(135deg, #ccfbf1 0%, #d1fae5 100%)'
                    : '#ffffff',
                color: mode === 'price_group' ? '#0f766e' : '#475569',
                fontWeight: 900,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Zap size={15} /> ⚡ দামের গ্রুপ টালি (২০/৩০/৫০৳)
            </button>
            <button
              type="button"
              onClick={() => setMode('product_wise')}
              style={{
                padding: '9px 10px',
                borderRadius: '11px',
                border: mode === 'product_wise' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                background:
                  mode === 'product_wise'
                    ? 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)'
                    : '#ffffff',
                color: mode === 'product_wise' ? '#0369a1' : '#475569',
                fontWeight: 900,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Layers size={15} /> 📸 ছবি ও দাম দেখে প্রডাক্ট টালি
            </button>
          </div>

          {/* Date, Seller & Stock Deduction Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 9px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: '#334155',
                  margin: 0,
                }}
              >
                <Calendar size={13} style={{ color: '#0d9488' }} />
                <span>তারিখ:</span>
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
                    background: seller === 'Rakib' ? '#0d9488' : 'transparent',
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

            {mode === 'price_group' && (
              <button
                type="button"
                onClick={() => setDeductStockInGroupMode((v) => !v)}
                style={{
                  padding: '4.5px 10px',
                  borderRadius: '8px',
                  border: deductStockInGroupMode ? '1.5px solid #059669' : '1px solid #cbd5e1',
                  background: deductStockInGroupMode ? '#ecfdf5' : '#f1f5f9',
                  color: deductStockInGroupMode ? '#047857' : '#475569',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
                title="চালু থাকলে ওই দামের প্রডাক্টগুলোর মজুদ স্টক থেকে স্বয়ংক্রিয়ভাবে পিস কমে যাবে"
              >
                <Package size={13} />
                {deductStockInGroupMode
                  ? '✓ অটো স্টক সমন্বয়: চালু'
                  : 'শুধু ক্যাশ ও লাভ টালি (স্টক অপরিবর্তিত)'}
              </button>
            )}
          </div>
        </div>

        {/* 3. Scrollable Main Tally Workspace */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            padding: '12px 14px',
            background: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {mode === 'price_group' ? (
            <>
              {/* Quick Add Custom Price Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  flexWrap: 'wrap',
                  background: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                  💡 নিচের যেকোনো দামের ঘরে `+১`, `+৫`, `+১০` চাপুন অথবা মোট পিস সংখ্যা লিখুন:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    min="1"
                    placeholder="নতুন দাম (৳)..."
                    value={newCustomPriceInput}
                    onChange={(e) => setNewCustomPriceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomPriceTier();
                      }
                    }}
                    style={{
                      width: '115px',
                      padding: '5px 9px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomPriceTier}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#0f172a',
                      color: '#ffffff',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + দামের ঘর
                  </button>
                </div>
              </div>

              {/* Price Tier Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '10px',
                }}
              >
                {priceGroups.map((grp) => {
                  const key = String(grp.price);
                  const count = Math.max(0, Math.round(Number(groupCounts[key]) || 0));
                  const effectiveUnitCost =
                    groupCustomCosts[key] !== undefined && Number.isFinite(groupCustomCosts[key])
                      ? Math.max(0, Number(groupCustomCosts[key]))
                      : grp.avgCost;
                  const unitProfit = Math.round((grp.price - effectiveUnitCost) * 100) / 100;
                  const lineTotal = Math.round(count * grp.price * 100) / 100;
                  const lineProfit = Math.round(count * unitProfit * 100) / 100;
                  const isActive = count > 0;

                  return (
                    <div
                      key={grp.price}
                      style={{
                        background: isActive
                          ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%)'
                          : '#ffffff',
                        border: isActive ? '2px solid #0d9488' : '1px solid #cbd5e1',
                        borderRadius: '14px',
                        padding: '11px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: isActive
                          ? '0 8px 20px -6px rgba(13, 148, 136, 0.25)'
                          : '0 1px 3px rgba(15, 23, 42, 0.05)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Card Top Row: Price Tag + Subtotal */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span
                            style={{
                              padding: '4px 11px',
                              borderRadius: '10px',
                              background: isActive
                                ? 'linear-gradient(135deg, #0d9488 0%, #059669 100%)'
                                : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                              color: '#ffffff',
                              fontWeight: 900,
                              fontSize: '15px',
                            }}
                          >
                            ৳{toBengaliNumerals(grp.price)}
                          </span>
                          <div>
                            <div
                              style={{
                                fontSize: '12.5px',
                                fontWeight: 900,
                                color: '#0f172a',
                              }}
                            >
                              {toBengaliNumerals(grp.price)} টাকার প্রডাক্ট
                            </div>
                            <div
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: '#64748b',
                              }}
                            >
                              {grp.products.length > 0
                                ? `${toBengaliNumerals(grp.products.length)}টি আইটেম • স্টক: ${toBengaliNumerals(
                                    grp.totalStock
                                  )} পিস`
                                : 'কাস্টম দামের গ্রুপ'}
                            </div>
                          </div>
                        </div>

                        {isActive && (
                          <div style={{ textAlign: 'right' }}>
                            <div
                              style={{
                                fontSize: '14.5px',
                                fontWeight: 900,
                                color: '#065f46',
                              }}
                            >
                              {formatMoney(lineTotal)}
                            </div>
                            {!isEmployee && (
                              <div
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 800,
                                  color: lineProfit >= 0 ? '#059669' : '#e11d48',
                                }}
                              >
                                লাভ: {lineProfit >= 0 ? '+' : ''}
                                {formatMoney(lineProfit)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Product Thumbnails Strip in this Price Group */}
                      {grp.products.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            overflowX: 'auto',
                            paddingBottom: '2px',
                          }}
                        >
                          {grp.products.slice(0, 5).map((p) => {
                            const img = resolveProductImageUrl(p, products);
                            return (
                              <div
                                key={p.id}
                                title={`${p.name} (স্টক: ${p.currentStock || 0})`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 7px 2px 3px',
                                  borderRadius: '999px',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  color: '#334155',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}
                              >
                                {img ? (
                                  <img
                                    src={img}
                                    alt={p.name}
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      borderRadius: '50%',
                                      objectFit: 'cover',
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '11px' }}>📦</span>
                                )}
                                <span>{p.name}</span>
                              </div>
                            );
                          })}
                          {grp.products.length > 5 && (
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 800,
                                color: '#64748b',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              +{toBengaliNumerals(grp.products.length - 5)}টি
                            </span>
                          )}
                        </div>
                      )}

                      {/* Cost & Profit Info Row for Admin */}
                      {!isEmployee && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            background: 'rgba(241, 245, 249, 0.85)',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            color: '#475569',
                          }}
                        >
                          <span>
                            গড় ক্রয়: <strong>৳{toBengaliNumerals(effectiveUnitCost)}</strong>/পিস
                          </span>
                          <span style={{ color: '#047857', fontWeight: 800 }}>
                            পিসে লাভ: +৳{toBengaliNumerals(unitProfit)}
                          </span>
                        </div>
                      )}

                      {/* Fast 1-Tap Counter Controls */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '5px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => adjustGroupCount(grp.price, -1)}
                          disabled={count <= 0}
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '9px',
                            border: '1px solid #fca5a5',
                            background: count > 0 ? '#fef2f2' : '#f8fafc',
                            color: count > 0 ? '#dc2626' : '#94a3b8',
                            fontWeight: 900,
                            cursor: count > 0 ? 'pointer' : 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                          title="১ পিস কমান"
                        >
                          <Minus size={15} />
                        </button>

                        <input
                          type="text"
                          inputMode="numeric"
                          value={count > 0 ? String(count) : ''}
                          placeholder="0 পিস"
                          onChange={(e) => setExactGroupCount(grp.price, e.target.value)}
                          style={{
                            width: '68px',
                            height: '34px',
                            textAlign: 'center',
                            borderRadius: '9px',
                            border: isActive ? '2px solid #0d9488' : '1px solid #cbd5e1',
                            background: '#ffffff',
                            fontSize: '14px',
                            fontWeight: 900,
                            color: '#0f172a',
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => adjustGroupCount(grp.price, 1)}
                          style={{
                            padding: '0 10px',
                            height: '34px',
                            borderRadius: '9px',
                            border: '1px solid #6ee7b7',
                            background: '#ecfdf5',
                            color: '#047857',
                            fontSize: '12.5px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          +১
                        </button>

                        <button
                          type="button"
                          onClick={() => adjustGroupCount(grp.price, 5)}
                          style={{
                            padding: '0 10px',
                            height: '34px',
                            borderRadius: '9px',
                            border: '1px solid #5eead4',
                            background: '#ccfbf1',
                            color: '#0f766e',
                            fontSize: '12.5px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          +৫
                        </button>

                        <button
                          type="button"
                          onClick={() => adjustGroupCount(grp.price, 10)}
                          style={{
                            padding: '0 10px',
                            height: '34px',
                            borderRadius: '9px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
                            color: '#ffffff',
                            fontSize: '12.5px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          +১০
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Visual Product-Wise Tally Mode Filtered by Price Group */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflowX: 'auto',
                  paddingBottom: '4px',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedPriceFilter('all')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border:
                      selectedPriceFilter === 'all' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: selectedPriceFilter === 'all' ? '#0284c7' : '#ffffff',
                    color: selectedPriceFilter === 'all' ? '#ffffff' : '#334155',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  সব দামের প্রডাক্ট ({toBengaliNumerals(products.length)})
                </button>
                {priceGroups
                  .filter((g) => g.products.length > 0)
                  .map((g) => {
                    const active = selectedPriceFilter === g.price;
                    return (
                      <button
                        key={g.price}
                        type="button"
                        onClick={() => setSelectedPriceFilter(g.price)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '999px',
                          border: active ? '2px solid #0d9488' : '1px solid #cbd5e1',
                          background: active ? '#0d9488' : '#ffffff',
                          color: active ? '#ffffff' : '#334155',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ৳{toBengaliNumerals(g.price)} ({toBengaliNumerals(g.products.length)})
                      </button>
                    );
                  })}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                  gap: '9px',
                }}
              >
                {filteredProductsForVisualMode.map((prod) => {
                  const count = Math.max(0, Math.round(Number(productCounts[prod.id]) || 0));
                  const isActive = count > 0;
                  const img = resolveProductImageUrl(prod, products);
                  const sp = Number(prod.sellingPrice) || 0;
                  const uc = Number(prod.averageCost) || 0;
                  const lineTotal = Math.round(count * sp * 100) / 100;

                  return (
                    <div
                      key={prod.id}
                      style={{
                        background: isActive ? '#f0fdf4' : '#ffffff',
                        border: isActive ? '2px solid #059669' : '1px solid #cbd5e1',
                        borderRadius: '13px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {img ? (
                          <img
                            src={img}
                            alt={prod.name}
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '10px',
                              objectFit: 'cover',
                              border: '1px solid #cbd5e1',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '10px',
                              background: '#f1f5f9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Package size={22} style={{ color: '#64748b' }} />
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: '13.5px',
                              fontWeight: 900,
                              color: '#0f172a',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {prod.name}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              flexWrap: 'wrap',
                              marginTop: '2px',
                            }}
                          >
                            <span
                              style={{
                                padding: '1.5px 7px',
                                borderRadius: '6px',
                                background: '#ecfdf5',
                                border: '1px solid #6ee7b7',
                                color: '#047857',
                                fontSize: '11.5px',
                                fontWeight: 900,
                              }}
                            >
                              ৳{toBengaliNumerals(sp)}
                            </span>
                            {prod.sku && (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 800,
                                  color: '#0284c7',
                                }}
                              >
                                #{prod.sku}
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: '#64748b',
                              }}
                            >
                              স্টক: {toBengaliNumerals(prod.currentStock || 0)}
                            </span>
                            {!isEmployee && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#0369a1',
                                }}
                              >
                                ক্রয়: ৳{toBengaliNumerals(uc)}
                              </span>
                            )}
                          </div>
                        </div>
                        {isActive && (
                          <div
                            style={{
                              fontSize: '13.5px',
                              fontWeight: 900,
                              color: '#065f46',
                              flexShrink: 0,
                            }}
                          >
                            {formatMoney(lineTotal)}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '5px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => adjustProductCount(prod.id, -1)}
                          disabled={count <= 0}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid #fca5a5',
                            background: count > 0 ? '#fef2f2' : '#f8fafc',
                            color: count > 0 ? '#dc2626' : '#94a3b8',
                            cursor: count > 0 ? 'pointer' : 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={count > 0 ? String(count) : ''}
                          placeholder="0 পিস"
                          onChange={(e) => setExactProductCount(prod.id, e.target.value)}
                          style={{
                            width: '64px',
                            height: '32px',
                            textAlign: 'center',
                            borderRadius: '8px',
                            border: isActive ? '2px solid #059669' : '1px solid #cbd5e1',
                            fontSize: '13.5px',
                            fontWeight: 900,
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => adjustProductCount(prod.id, 1)}
                          style={{
                            padding: '0 9px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid #6ee7b7',
                            background: '#ecfdf5',
                            color: '#047857',
                            fontSize: '12px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          +১
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustProductCount(prod.id, 5)}
                          style={{
                            padding: '0 9px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid #5eead4',
                            background: '#ccfbf1',
                            color: '#0f766e',
                            fontSize: '12px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          +৫
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustProductCount(prod.id, 10)}
                          style={{
                            padding: '0 9px',
                            height: '32px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#059669',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          +১০
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Recent Session Submissions with 1-Click Undo */}
          {recentSubmissions.length > 0 && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #a7f3d0',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 900, color: '#047857' }}>
                ✅ এইমাত্র সেভ করা বাল্ক টালি সেল:
              </div>
              {recentSubmissions.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '6px 9px',
                    borderRadius: '8px',
                    background: '#f0fdf4',
                    fontSize: '11.5px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#064e3b' }}>
                    {item.title} — <strong>{formatMoney(item.amount)}</strong> ({item.time})
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
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ↩️ বাতিল (Undo)
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Nightly Cash Drawer Adjustment & Live Summary Footer */}
        <div
          style={{
            padding: '12px 14px',
            background: '#ffffff',
            borderTop: '2px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
            flexShrink: 0,
          }}
        >
          {/* Optional Discount / Cash Drawer Reconcile Row */}
          {tallyCalculation.totalPieces > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '11px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calculator size={14} style={{ color: '#0284c7', flexShrink: 0 }} />
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155' }}>
                  ক্যাশবাক্সে প্রাপ্ত টাকা (ঐচ্ছিক):
                </span>
                <input
                  type="number"
                  min="0"
                  placeholder={`৳${tallyCalculation.rawSalesTotal}`}
                  value={cashInDrawerInput}
                  onChange={(e) => {
                    setCashInDrawerInput(e.target.value);
                    if (e.target.value.trim() !== '') setDiscountAmount('');
                  }}
                  style={{
                    width: '90px',
                    padding: '4px 8px',
                    borderRadius: '7px',
                    border: '1px solid #94a3b8',
                    fontSize: '12px',
                    fontWeight: 800,
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155' }}>
                  অথবা খুচরা ছাড় (৳):
                </span>
                <input
                  type="number"
                  min="0"
                  placeholder="৳0"
                  value={discountAmount}
                  onChange={(e) => {
                    setDiscountAmount(e.target.value);
                    if (e.target.value.trim() !== '') setCashInDrawerInput('');
                  }}
                  style={{
                    width: '80px',
                    padding: '4px 8px',
                    borderRadius: '7px',
                    border: '1px solid #94a3b8',
                    fontSize: '12px',
                    fontWeight: 800,
                  }}
                />
              </div>
            </div>
          )}

          {/* KPI Summary Strip + Submit Action */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div
                style={{
                  padding: '6px 11px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b' }}>মোট পিস</div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                  {toBengaliNumerals(tallyCalculation.totalPieces)} পিস
                </div>
              </div>

              <div
                style={{
                  padding: '6px 11px',
                  borderRadius: '10px',
                  background: '#ecfdf5',
                  border: '1px solid #6ee7b7',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#047857' }}>
                  মোট নিট বিক্রয়
                </div>
                <div style={{ fontSize: '15.5px', fontWeight: 900, color: '#064e3b' }}>
                  {formatMoney(tallyCalculation.finalSalesAmount)}
                </div>
              </div>

              {!isEmployee && (
                <>
                  <div
                    style={{
                      padding: '6px 11px',
                      borderRadius: '10px',
                      background: '#eff6ff',
                      border: '1px solid #bae6fd',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#0369a1' }}>
                      মোট আসল (ক্রয়মূল্য)
                    </div>
                    <div style={{ fontSize: '14.5px', fontWeight: 900, color: '#0c4a6e' }}>
                      {formatMoney(tallyCalculation.totalCogs)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '6px 11px',
                      borderRadius: '10px',
                      background: '#fefce8',
                      border: '1px solid #fde047',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#854d0e' }}>
                      মোট নিট লাভ
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 900,
                        color: tallyCalculation.grossProfit >= 0 ? '#713f12' : '#be123c',
                      }}
                    >
                      {tallyCalculation.grossProfit >= 0 ? '+' : ''}
                      {formatMoney(tallyCalculation.grossProfit)}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
              {tallyCalculation.totalPieces > 0 && (
                <button
                  type="button"
                  onClick={handleResetAll}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '11px',
                    border: '1px solid #fca5a5',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                  title="সব সংখ্যা রিসেট করুন"
                >
                  <RotateCcw size={14} /> রিসেট
                </button>
              )}

              <button
                type="button"
                disabled={tallyCalculation.totalPieces <= 0 || isSubmitting}
                onClick={handleSubmit}
                style={{
                  padding: '10px 18px',
                  borderRadius: '11px',
                  border: 'none',
                  background:
                    tallyCalculation.totalPieces > 0
                      ? 'linear-gradient(135deg, #059669 0%, #0d9488 100%)'
                      : '#cbd5e1',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 900,
                  cursor: tallyCalculation.totalPieces > 0 ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow:
                    tallyCalculation.totalPieces > 0
                      ? '0 6px 18px rgba(13, 148, 136, 0.35)'
                      : 'none',
                }}
              >
                <CheckCircle2 size={16} />
                {isSubmitting
                  ? 'হিসাব সেভ হচ্ছে...'
                  : `এক ক্লিকে সেল ও হিসাব সেভ করুন (${formatMoney(
                      tallyCalculation.finalSalesAmount
                    )})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
