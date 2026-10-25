import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Download,
  Edit3,
  Package,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Entry, Product } from '../types';
import {
  calculateProductProfitabilityReport,
  csvEscape,
  dateLabel,
  money,
  toBengaliNumerals,
  type ProductProfitabilityItem,
} from '../accounting';

interface ProductProfitabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  entries: Entry[];
  admin?: boolean;
  onRecordSaleForProduct?: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onAddNewProduct?: () => void;
}

type FilterCategory =
  | 'all'
  | 'high_margin'
  | 'stagnating'
  | 'most_sold'
  | 'least_sold'
  | 'low_margin'
  | 'out_of_stock';
type SortOption =
  | 'margin_desc'
  | 'profit_desc'
  | 'revenue_desc'
  | 'units_sold_desc'
  | 'units_sold_asc'
  | 'stagnant_stock_desc'
  | 'velocity_asc';
type PeriodPreset = 'all' | '30d' | '7d' | 'month';
type DrilldownCategory = 'highest_profit' | 'stagnant_stock' | 'most_sold' | 'least_sold' | null;

function getLocalIsoDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

export default function ProductProfitabilityModal({
  isOpen,
  onClose,
  products,
  entries,
  admin = true,
  onRecordSaleForProduct,
  onEditProduct,
  onAddNewProduct,
}: ProductProfitabilityModalProps) {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [sortBy, setSortBy] = useState<SortOption>('margin_desc');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [drilldownCategory, setDrilldownCategory] = useState<DrilldownCategory>(null);
  const [drilldownSearch, setDrilldownSearch] = useState<string>('');
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [showChart, setShowChart] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  );
  const [chartMetric, setChartMetric] = useState<'financials' | 'margin'>('financials');

  const todayIso = useMemo(() => getLocalIsoDate(new Date()), []);

  const periodFilteredEntries = useMemo(() => {
    if (periodPreset === 'all') return entries;
    const now = new Date();
    if (periodPreset === 'month') {
      const ym = todayIso.slice(0, 7);
      return entries.filter((e) => e.date && e.date.startsWith(ym));
    }
    const days = periodPreset === '7d' ? 7 : 30;
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - (days - 1));
    const cutoffIso = getLocalIsoDate(cutoff);
    return entries.filter((e) => e.date && e.date >= cutoffIso);
  }, [entries, periodPreset, todayIso]);

  const report = useMemo(
    () => calculateProductProfitabilityReport(products, periodFilteredEntries, todayIso),
    [products, periodFilteredEntries, todayIso]
  );

  // Ranked lists for the 4 interactive buttons
  const highestProfitList = useMemo(() => {
    return [...report.items]
      .filter((i) => i.grossProfit > 0 || i.effectiveMarginPercent > 0 || i.unitMarginAmount > 0)
      .sort(
        (a, b) =>
          b.grossProfit - a.grossProfit ||
          b.effectiveMarginPercent - a.effectiveMarginPercent ||
          b.unitMarginAmount - a.unitMarginAmount
      );
  }, [report.items]);

  const stagnantStockList = useMemo(() => {
    return [...report.stagnatingItems].sort(
      (a, b) => b.stockCostValue - a.stockCostValue || a.sellThroughRate - b.sellThroughRate
    );
  }, [report.stagnatingItems]);

  const mostSoldList = useMemo(() => {
    return [...report.items].sort(
      (a, b) =>
        b.unitsSold - a.unitsSold ||
        b.salesRevenue - a.salesRevenue ||
        b.salesCount - a.salesCount ||
        b.grossProfit - a.grossProfit
    );
  }, [report.items]);

  const leastSoldList = useMemo(() => {
    return [...report.items].sort(
      (a, b) =>
        a.unitsSold - b.unitsSold ||
        a.salesRevenue - b.salesRevenue ||
        b.stockCostValue - a.stockCostValue ||
        b.currentStock - a.currentStock
    );
  }, [report.items]);

  const topProfitItem = highestProfitList[0] || report.highMarginItems[0] || null;
  const topSoldItem = mostSoldList[0] || null;
  const leastSoldItem = leastSoldList[0] || null;

  const activeDrilldownItems = useMemo(() => {
    let baseList: ProductProfitabilityItem[] = [];
    if (drilldownCategory === 'highest_profit') baseList = highestProfitList;
    else if (drilldownCategory === 'stagnant_stock') baseList = stagnantStockList;
    else if (drilldownCategory === 'most_sold') baseList = mostSoldList;
    else if (drilldownCategory === 'least_sold') baseList = leastSoldList;

    const q = drilldownSearch.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (item) =>
        item.product.name.toLowerCase().includes(q) ||
        (item.product.sku || '').toLowerCase().includes(q)
    );
  }, [
    drilldownCategory,
    drilldownSearch,
    highestProfitList,
    stagnantStockList,
    mostSoldList,
    leastSoldList,
  ]);

  const handleOpenCategoryList = (category: Exclude<DrilldownCategory, null>) => {
    setDrilldownSearch('');
    setDrilldownCategory(category);
    if (category === 'highest_profit') {
      setActiveFilter('high_margin');
      setSortBy('profit_desc');
    } else if (category === 'stagnant_stock') {
      setActiveFilter('stagnating');
      setSortBy('stagnant_stock_desc');
    } else if (category === 'most_sold') {
      setActiveFilter('most_sold');
      setSortBy('units_sold_desc');
    } else if (category === 'least_sold') {
      setActiveFilter('least_sold');
      setSortBy('units_sold_asc');
    }
  };

  const filteredAndSortedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = report.items.filter((item) => {
      if (activeFilter === 'high_margin' && !item.isTopMargin && item.status !== 'high_margin' && item.grossProfit <= 0) {
        return false;
      }
      if (activeFilter === 'stagnating' && !item.isStagnating) {
        return false;
      }
      if (activeFilter === 'low_margin' && item.status !== 'low_margin') {
        return false;
      }
      if (activeFilter === 'out_of_stock' && item.status !== 'out_of_stock') {
        return false;
      }

      if (q) {
        const nameMatch = item.product.name.toLowerCase().includes(q);
        const skuMatch = (item.product.sku || '').toLowerCase().includes(q);
        return nameMatch || skuMatch;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'margin_desc':
          return (
            b.effectiveMarginPercent - a.effectiveMarginPercent ||
            b.grossProfit - a.grossProfit
          );
        case 'profit_desc':
          return b.grossProfit - a.grossProfit || b.effectiveMarginPercent - a.effectiveMarginPercent;
        case 'revenue_desc':
          return b.salesRevenue - a.salesRevenue || b.grossProfit - a.grossProfit;
        case 'units_sold_desc':
          return (
            b.unitsSold - a.unitsSold ||
            b.salesRevenue - a.salesRevenue ||
            b.grossProfit - a.grossProfit
          );
        case 'units_sold_asc':
          return (
            a.unitsSold - b.unitsSold ||
            a.salesRevenue - b.salesRevenue ||
            b.stockCostValue - a.stockCostValue
          );
        case 'stagnant_stock_desc':
          if (a.isStagnating !== b.isStagnating) return a.isStagnating ? -1 : 1;
          return b.stockCostValue - a.stockCostValue;
        case 'velocity_asc':
          return a.sellThroughRate - b.sellThroughRate || b.stockCostValue - a.stockCostValue;
        default:
          return 0;
      }
    });
  }, [report.items, activeFilter, searchQuery, sortBy]);

  const chartData = useMemo(() => {
    const targetList =
      filteredAndSortedItems.length > 0 ? filteredAndSortedItems.slice(0, 8) : report.items.slice(0, 8);
    return targetList.map((item) => ({
      id: item.product.id,
      name:
        item.product.name.length > 14
          ? `${item.product.name.slice(0, 13)}…`
          : item.product.name,
      fullName: item.product.name,
      salesRevenue: Math.round(item.salesRevenue),
      cogs: Math.round(item.cogs),
      grossProfit: Math.round(item.grossProfit),
      stockValue: Math.round(item.stockCostValue),
      marginPercent: item.effectiveMarginPercent,
      sellThroughRate: item.sellThroughRate,
      isStagnating: item.isStagnating,
    }));
  }, [filteredAndSortedItems, report.items]);

  if (!isOpen) return null;

  const handleExportProfitabilityCsv = () => {
    const headers = [
      'পণ্যের নাম (Product Name)',
      'SKU',
      'স্ট্যাটাস (Status)',
      'গড় ক্রয়মূল্য (Avg Cost)',
      'বিক্রয়মূল্য (Selling Price)',
      'বিক্রিত একক (Units Sold)',
      'বিক্রয় রাজস্ব (Sales Revenue)',
      'বিক্রিত পণ্যের ক্রয় খরচ (COGS)',
      'গ্রস মুনাফা (Gross Profit)',
      'বাস্তব মার্জিন % (Realized Margin %)',
      'প্রত্যাশিত মার্জিন % (Catalog Margin %)',
      'বর্তমান স্টক (Current Stock)',
      'আটকে থাকা স্টক মূল্য (Stock Value)',
      'বিক্রয় গতি % (Sell-Through Rate %)',
      'সর্বশেষ বিক্রয়ের তারিখ (Last Sale Date)',
      'সুপারিশ (Recommendation)',
    ];

    const rows = filteredAndSortedItems.map((i) => [
      i.product.name,
      i.product.sku || '',
      i.statusLabelBn,
      i.product.averageCost,
      i.product.sellingPrice,
      `${i.unitsSold} ${i.product.unit}`,
      i.salesRevenue,
      i.cogs,
      i.grossProfit,
      `${i.realizedMarginPercent}%`,
      `${i.catalogMarginPercent}%`,
      `${i.currentStock} ${i.product.unit}`,
      i.stockCostValue,
      `${i.sellThroughRate}%`,
      i.lastSaleDate || 'কখনো বিক্রি হয়নি',
      i.stagnationReasonBn ? `${i.stagnationReasonBn} — ${i.recommendationBn}` : i.recommendationBn,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glowzaa-product-profitability-report-${todayIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderStatusBadge = (item: ProductProfitabilityItem) => {
    if (item.status === 'high_margin' || item.isTopMargin) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '6px',
            fontSize: '10.5px',
            fontWeight: 700,
            background: '#dcfce7',
            color: '#166534',
            border: '1px solid #bbf7d0',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <TrendingUp size={11} /> সর্বোচ্চ মার্জিন
        </span>
      );
    }
    if (item.isStagnating) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '6px',
            fontSize: '10.5px',
            fontWeight: 700,
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fde68a',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={11} /> অচল স্টক
        </span>
      );
    }
    if (item.status === 'low_margin') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '6px',
            fontSize: '10.5px',
            fontWeight: 700,
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <TrendingDown size={11} /> স্বল্প মার্জিন
        </span>
      );
    }
    if (item.status === 'out_of_stock') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '6px',
            fontSize: '10.5px',
            fontWeight: 700,
            background: '#f1f5f9',
            color: '#475569',
            border: '1px solid #cbd5e1',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          স্টক শেষ
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 7px',
          borderRadius: '6px',
          fontSize: '10.5px',
          fontWeight: 700,
          background: '#e0f2fe',
          color: '#075985',
          border: '1px solid #bae6fd',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <CheckCircle2 size={11} /> স্বাভাবিক
      </span>
    );
  };

  const renderProductThumbnail = (
    product: Product,
    size: number = 44,
    interactive: boolean = true
  ) => {
    const borderRadius = size <= 30 ? '6px' : size <= 38 ? '8px' : '10px';
    if (product.imageUrl) {
      return (
        <div
          className="profit-product-thumb has-image"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius,
            cursor: interactive ? 'zoom-in' : 'pointer',
          }}
          onClick={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  setPreviewProduct(product);
                }
              : undefined
          }
          title={`${product.name} — বড় করে ছবি দেখতে ট্যাপ করুন`}
        >
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        </div>
      );
    }

    return (
      <div
        className="profit-product-thumb no-image"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius,
          cursor: interactive && admin && onEditProduct ? 'pointer' : 'default',
        }}
        onClick={
          interactive && admin && onEditProduct
            ? (e) => {
                e.stopPropagation();
                onEditProduct(product);
              }
            : undefined
        }
        title={
          interactive && admin && onEditProduct
            ? `${product.name} — ছবি যোগ করতে ট্যাপ করুন`
            : `${product.name} (ছবি যুক্ত নেই)`
        }
      >
        <Package size={Math.max(13, Math.round(size * 0.42))} />
      </div>
    );
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal profit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profitability-modal-title"
      >
        {/* Compact Single-Row Header */}
        <div className="profit-modal-head">
          <div className="profit-modal-title-group">
            <span className="profit-modal-icon">
              <BarChart3 size={17} />
            </span>
            <div className="profit-modal-title-text">
              <h2 id="profitability-modal-title">পণ্যভিত্তিক লাভ ও স্টক বিশ্লেষণ</h2>
              <p>বিক্রয় রাজস্ব, ক্রয়মূল্য (COGS), সর্বোচ্চ মার্জিন ও অচল স্টক রিপোর্ট</p>
            </div>
          </div>

          <div className="profit-modal-head-actions">
            <button
              type="button"
              className={`profit-head-action-btn ${showChart ? 'active' : ''}`}
              onClick={() => setShowChart((prev) => !prev)}
              title="তুলনামূলক চার্ট দেখুন বা লুকান"
            >
              <BarChart3 size={14} />
              <span>চার্ট</span>
            </button>
            <button
              type="button"
              className="profit-head-action-btn"
              onClick={handleExportProfitabilityCsv}
              title="CSV রিপোর্ট ডাউনলোড"
            >
              <Download size={14} />
              <span>CSV</span>
            </button>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="বন্ধ করুন"
              style={{ width: '32px', height: '32px' }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Full-Height Scrollable Body */}
        <div className="profit-modal-body">
          {/* Single-Row 4-Column Timeframe Selector */}
          <div className="profit-period-bar">
            <span className="profit-period-label">সময়কাল:</span>
            <div className="profit-period-grid">
              {(
                [
                  { key: 'all', label: 'সব সময়' },
                  { key: 'month', label: 'চলতি মাস' },
                  { key: '30d', label: 'গত ৩০ দিন' },
                  { key: '7d', label: 'গত ৭ দিন' },
                ] as { key: PeriodPreset; label: string }[]
              ).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`profit-period-btn ${periodPreset === p.key ? 'active' : ''}`}
                  onClick={() => setPeriodPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 6-Card KPI & Interactive Product Filter Grid (2x3 on Mobile, 3x2 on Desktop) */}
          <div className="profit-kpi-grid">
            {/* KPI 1: Total Sales & COGS */}
            <div className="profit-kpi-card">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">মোট বিক্রয় রাজস্ব</span>
              </div>
              <strong className="profit-kpi-val">{money(report.totalProductSalesRevenue)}</strong>
              <span className="profit-kpi-sub">
                ক্রয় খরচ (COGS): <b>{money(report.totalProductCogs)}</b>
              </span>
            </div>

            {/* KPI 2: Gross Profit & Margin */}
            <div className="profit-kpi-card tone-emerald">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">মোট গ্রস মুনাফা</span>
                <span
                  className="profit-kpi-tag"
                  style={{ background: '#dcfce7', color: '#15803d' }}
                >
                  {toBengaliNumerals(report.overallProductMarginPercent)}%
                </span>
              </div>
              <strong className="profit-kpi-val" style={{ color: '#15803d' }}>
                +{money(report.totalProductGrossProfit)}
              </strong>
              <span className="profit-kpi-sub" style={{ color: '#166534' }}>
                বিক্রয় রাজস্ব − ক্রয়মূল্য
              </span>
            </div>

            {/* INTERACTIVE BUTTON 1: সর্বোচ্চ লাভের পণ্য */}
            <button
              type="button"
              className={`profit-kpi-card profit-kpi-btn tone-teal ${
                drilldownCategory === 'highest_profit' ? 'active-card' : ''
              }`}
              onClick={() => handleOpenCategoryList('highest_profit')}
            >
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">সর্বোচ্চ লাভের পণ্য</span>
                <span
                  className="profit-kpi-tag"
                  style={{ background: '#ccfbf1', color: '#0f766e' }}
                >
                  {toBengaliNumerals(highestProfitList.length)}টি · দেখুন →
                </span>
              </div>
              {topProfitItem ? (
                <>
                  <strong
                    className="profit-kpi-val"
                    style={{ fontSize: '15px' }}
                    title={topProfitItem.product.name}
                  >
                    {topProfitItem.product.name}
                  </strong>
                  <span className="profit-kpi-sub" style={{ color: '#0f766e', fontWeight: 700 }}>
                    +{toBengaliNumerals(topProfitItem.effectiveMarginPercent)}% মার্জিন ·{' '}
                    {money(
                      topProfitItem.salesCount > 0
                        ? topProfitItem.grossProfit
                        : topProfitItem.unitMarginAmount
                    )}
                  </span>
                </>
              ) : (
                <>
                  <strong className="profit-kpi-val" style={{ fontSize: '14px', color: '#64748b' }}>
                    তালিকা দেখুন
                  </strong>
                  <span className="profit-kpi-sub">চাপ দিয়ে লাভের তালিকা দেখুন</span>
                </>
              )}
            </button>

            {/* INTERACTIVE BUTTON 2: অচল স্টকে মূলধন */}
            <button
              type="button"
              className={`profit-kpi-card profit-kpi-btn tone-amber ${
                drilldownCategory === 'stagnant_stock' ? 'active-card' : ''
              }`}
              onClick={() => handleOpenCategoryList('stagnant_stock')}
            >
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">অচল স্টকে মূলধন</span>
                <span
                  className="profit-kpi-tag"
                  style={{ background: '#fef3c7', color: '#b45309' }}
                >
                  {toBengaliNumerals(report.stagnatingItems.length)}টি · দেখুন →
                </span>
              </div>
              <strong
                className="profit-kpi-val"
                style={{ color: report.stagnatingItems.length > 0 ? '#b45309' : '#0f172a' }}
              >
                {money(report.totalStagnantStockValue)}
              </strong>
              <span className="profit-kpi-sub" style={{ color: '#78350f', fontWeight: 600 }}>
                মোট স্টক মূল্য: {money(report.totalActiveStockValue)}
              </span>
            </button>

            {/* INTERACTIVE BUTTON 3: সর্বোচ্চ বিক্রি হওয়া প্রডাক্ট */}
            <button
              type="button"
              className={`profit-kpi-card profit-kpi-btn tone-sky ${
                drilldownCategory === 'most_sold' ? 'active-card' : ''
              }`}
              onClick={() => handleOpenCategoryList('most_sold')}
            >
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">সর্বোচ্চ বিক্রি হওয়া প্রডাক্ট</span>
                <span
                  className="profit-kpi-tag"
                  style={{ background: '#e0f2fe', color: '#0369a1' }}
                >
                  {toBengaliNumerals(mostSoldList.filter((i) => i.unitsSold > 0).length)}টি · দেখুন →
                </span>
              </div>
              {topSoldItem ? (
                <>
                  <strong
                    className="profit-kpi-val"
                    style={{ fontSize: '15px', color: '#0369a1' }}
                    title={topSoldItem.product.name}
                  >
                    {topSoldItem.product.name}
                  </strong>
                  <span className="profit-kpi-sub" style={{ color: '#075985', fontWeight: 700 }}>
                    বিক্রি: {toBengaliNumerals(topSoldItem.unitsSold)} {topSoldItem.product.unit} ·{' '}
                    {money(topSoldItem.salesRevenue)}
                  </span>
                </>
              ) : (
                <>
                  <strong className="profit-kpi-val" style={{ fontSize: '14px', color: '#0369a1' }}>
                    তালিকা দেখুন
                  </strong>
                  <span className="profit-kpi-sub" style={{ color: '#075985' }}>
                    চাপ দিয়ে সর্বোচ্চ বিক্রির লিস্ট দেখুন
                  </span>
                </>
              )}
            </button>

            {/* INTERACTIVE BUTTON 4: সর্বনিম্ন বিক্রি হওয়া প্রডাক্ট */}
            <button
              type="button"
              className={`profit-kpi-card profit-kpi-btn tone-rose ${
                drilldownCategory === 'least_sold' ? 'active-card' : ''
              }`}
              onClick={() => handleOpenCategoryList('least_sold')}
            >
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">সর্বনিম্ন বিক্রি হওয়া প্রডাক্ট</span>
                <span
                  className="profit-kpi-tag"
                  style={{ background: '#ffe4e6', color: '#be123c' }}
                >
                  {toBengaliNumerals(leastSoldList.length)}টি · দেখুন →
                </span>
              </div>
              {leastSoldItem ? (
                <>
                  <strong
                    className="profit-kpi-val"
                    style={{ fontSize: '15px', color: '#be123c' }}
                    title={leastSoldItem.product.name}
                  >
                    {leastSoldItem.product.name}
                  </strong>
                  <span className="profit-kpi-sub" style={{ color: '#9f1239', fontWeight: 700 }}>
                    বিক্রি: {toBengaliNumerals(leastSoldItem.unitsSold)} {leastSoldItem.product.unit} · মজুদ:{' '}
                    {toBengaliNumerals(leastSoldItem.currentStock)} {leastSoldItem.product.unit}
                  </span>
                </>
              ) : (
                <>
                  <strong className="profit-kpi-val" style={{ fontSize: '14px', color: '#be123c' }}>
                    তালিকা দেখুন
                  </strong>
                  <span className="profit-kpi-sub" style={{ color: '#9f1239' }}>
                    চাপ দিয়ে সর্বনিম্ন বিক্রির লিস্ট দেখুন
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Dedicated Interactive Category Product List Panel / Popup when any of the 4 buttons is pressed */}
          {drilldownCategory && (
            <div className={`profit-drilldown-panel theme-${drilldownCategory}`}>
              <div className="profit-drilldown-head">
                <div className="profit-drilldown-title-wrap">
                  <h3>
                    {drilldownCategory === 'highest_profit' && 'সর্বোচ্চ লাভের প্রডাক্টের তালিকা'}
                    {drilldownCategory === 'stagnant_stock' && 'অচল স্টকের প্রডাক্টের তালিকা'}
                    {drilldownCategory === 'most_sold' && 'সর্বোচ্চ বিক্রি হওয়া প্রডাক্টের তালিকা'}
                    {drilldownCategory === 'least_sold' && 'সর্বনিম্ন বিক্রি হওয়া প্রডাক্টের তালিকা'}
                  </h3>
                  <p>
                    {drilldownCategory === 'highest_profit' &&
                      `লাভ ও মার্জিনের ক্রমানুসারে শীর্ষ ${toBengaliNumerals(activeDrilldownItems.length)}টি প্রডাক্ট (ছবিসহ)`}
                    {drilldownCategory === 'stagnant_stock' &&
                      `বিক্রি না হওয়া বা ধীরগতির ${toBengaliNumerals(activeDrilldownItems.length)}টি প্রডাক্ট (আটকে থাকা মূলধন: ${money(report.totalStagnantStockValue)})`}
                    {drilldownCategory === 'most_sold' &&
                      `সর্বোচ্চ বিক্রিত একক ও রাজস্ব অনুযায়ী ${toBengaliNumerals(activeDrilldownItems.length)}টি প্রডাক্ট (ছবিসহ)`}
                    {drilldownCategory === 'least_sold' &&
                      `সবচেয়ে কম বিক্রি হওয়া ক্রমানুসারে ${toBengaliNumerals(activeDrilldownItems.length)}টি প্রডাক্ট (ছবিসহ)`}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="profit-drilldown-close-btn"
                    onClick={() => setDrilldownCategory(null)}
                  >
                    <X size={14} /> বন্ধ করুন
                  </button>
                </div>
              </div>

              {/* Quick Category Switcher Pills inside the Drilldown */}
              <div className="profit-drilldown-tabs">
                <button
                  type="button"
                  className={`profit-drilldown-tab ${drilldownCategory === 'highest_profit' ? 'active' : ''}`}
                  onClick={() => handleOpenCategoryList('highest_profit')}
                >
                  সর্বোচ্চ লাভের পণ্য ({toBengaliNumerals(highestProfitList.length)})
                </button>
                <button
                  type="button"
                  className={`profit-drilldown-tab ${drilldownCategory === 'stagnant_stock' ? 'active' : ''}`}
                  onClick={() => handleOpenCategoryList('stagnant_stock')}
                >
                  অচল স্টক ({toBengaliNumerals(stagnantStockList.length)})
                </button>
                <button
                  type="button"
                  className={`profit-drilldown-tab ${drilldownCategory === 'most_sold' ? 'active' : ''}`}
                  onClick={() => handleOpenCategoryList('most_sold')}
                >
                  সর্বোচ্চ বিক্রি ({toBengaliNumerals(mostSoldList.length)})
                </button>
                <button
                  type="button"
                  className={`profit-drilldown-tab ${drilldownCategory === 'least_sold' ? 'active' : ''}`}
                  onClick={() => handleOpenCategoryList('least_sold')}
                >
                  সর্বনিম্ন বিক্রি ({toBengaliNumerals(leastSoldList.length)})
                </button>
              </div>

              {/* Search inside Drilldown */}
              <div className="profit-search-box" style={{ marginBottom: '2px' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '11px',
                    color: '#64748b',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="search"
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  placeholder="এই তালিকায় প্রডাক্টের নাম খুঁজুন…"
                />
              </div>

              {activeDrilldownItems.length === 0 ? (
                <div
                  style={{
                    padding: '18px 12px',
                    textAlign: 'center',
                    background: '#ffffff',
                    borderRadius: '10px',
                    border: '1px dashed #cbd5e1',
                    color: '#64748b',
                    fontSize: '12.5px',
                  }}
                >
                  এই তালিকায় কোনো প্রডাক্ট পাওয়া যায়নি।
                </div>
              ) : (
                <div className="profit-drilldown-list">
                  {activeDrilldownItems.map((item, idx) => (
                    <div key={item.product.id} className="profit-drilldown-item">
                      <div className="profit-drilldown-item-left">
                        <span className="profit-drilldown-rank">
                          #{toBengaliNumerals(idx + 1)}
                        </span>
                        {renderProductThumbnail(item.product, 46)}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong
                              style={{
                                fontSize: '13.5px',
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.product.name}
                            </strong>
                            {renderStatusBadge(item)}
                          </div>
                          <div
                            style={{
                              fontSize: '11.5px',
                              color: '#475569',
                              marginTop: '3px',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            ক্রয়: <b>{money(item.product.averageCost)}</b> · বিক্রয়:{' '}
                            <b>{money(item.product.sellingPrice)}</b> · মজুদ:{' '}
                            <b>
                              {toBengaliNumerals(item.currentStock)} {item.product.unit}
                            </b>{' '}
                            ({money(item.stockCostValue)})
                          </div>
                          {drilldownCategory === 'stagnant_stock' && item.stagnationReasonBn && (
                            <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px', fontWeight: 600 }}>
                              ⚠️ {item.stagnationReasonBn}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="profit-drilldown-item-right">
                        {drilldownCategory === 'highest_profit' && (
                          <>
                            <strong style={{ fontSize: '13.5px', color: '#15803d', display: 'block' }}>
                              লাভ: +{money(item.salesCount > 0 ? item.grossProfit : item.unitMarginAmount)}
                            </strong>
                            <span style={{ fontSize: '11px', color: '#0f766e', fontWeight: 700 }}>
                              +{toBengaliNumerals(item.effectiveMarginPercent)}% মার্জিন · বিক্রি:{' '}
                              {toBengaliNumerals(item.unitsSold)} {item.product.unit}
                            </span>
                          </>
                        )}
                        {drilldownCategory === 'stagnant_stock' && (
                          <>
                            <strong style={{ fontSize: '13.5px', color: '#b45309', display: 'block' }}>
                              আটকে আছে: {money(item.stockCostValue)}
                            </strong>
                            <span style={{ fontSize: '11px', color: '#78350f', fontWeight: 600 }}>
                              মজুদ: {toBengaliNumerals(item.currentStock)} {item.product.unit} · বিক্রি:{' '}
                              {toBengaliNumerals(item.unitsSold)} {item.product.unit}
                            </span>
                          </>
                        )}
                        {drilldownCategory === 'most_sold' && (
                          <>
                            <strong style={{ fontSize: '13.5px', color: '#0369a1', display: 'block' }}>
                              বিক্রি: {toBengaliNumerals(item.unitsSold)} {item.product.unit} (
                              {toBengaliNumerals(item.salesCount)} বার)
                            </strong>
                            <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                              বিক্রয়: {money(item.salesRevenue)} · লাভ: +{money(item.grossProfit)}
                            </span>
                          </>
                        )}
                        {drilldownCategory === 'least_sold' && (
                          <>
                            <strong style={{ fontSize: '13.5px', color: '#be123c', display: 'block' }}>
                              বিক্রি: {toBengaliNumerals(item.unitsSold)} {item.product.unit}
                            </strong>
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                              বিক্রয়: {money(item.salesRevenue)} · মজুদ:{' '}
                              {toBengaliNumerals(item.currentStock)} {item.product.unit}
                            </span>
                          </>
                        )}

                        {admin && onRecordSaleForProduct && (
                          <button
                            type="button"
                            onClick={() => onRecordSaleForProduct(item.product)}
                            style={{
                              marginTop: '4px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#0f766e',
                              background: '#f0fdfa',
                              border: '1px solid #99f6e4',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            + বিক্রয় এন্ট্রি
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dual Spotlight Section: Top Margin vs Stagnating Stock */}
          <div className="profit-spotlight-grid">
            {/* Left: Highest Margin Products */}
            <div className="profit-spotlight-box emerald-border">
              <div className="profit-spotlight-head">
                <div className="profit-spotlight-title">
                  <TrendingUp size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <h3>সর্বোচ্চ মার্জিন পণ্য</h3>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCategoryList('highest_profit')}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#15803d',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  সব দেখুন ({toBengaliNumerals(highestProfitList.length)})
                </button>
              </div>

              {report.highMarginItems.length === 0 ? (
                <div
                  style={{
                    padding: '14px 10px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#64748b',
                  }}
                >
                  এখনো উচ্চ মার্জিনের বিক্রয় রেকর্ড পাওয়া যায়নি।
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {report.highMarginItems.slice(0, 3).map((item, idx) => (
                    <div key={item.product.id} className="profit-spotlight-row emerald-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        {renderProductThumbnail(item.product, 38)}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 800,
                                color: '#15803d',
                                background: '#dcfce7',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontVariantNumeric: 'tabular-nums',
                                flexShrink: 0,
                              }}
                            >
                              #{toBengaliNumerals(idx + 1)}
                            </span>
                            <strong
                              style={{
                                fontSize: '13px',
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.product.name}
                            </strong>
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#475569',
                              marginTop: '2px',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            ক্রয়: {money(item.product.averageCost)} · বিক্রয়: {money(item.product.sellingPrice)} · বিক্রি:{' '}
                            {toBengaliNumerals(item.unitsSold)} {item.product.unit}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        <strong style={{ fontSize: '13px', color: '#15803d', display: 'block', whiteSpace: 'nowrap' }}>
                          +{toBengaliNumerals(item.effectiveMarginPercent)}% মার্জিন
                        </strong>
                        <small style={{ fontSize: '11px', color: '#047857', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {item.salesCount > 0
                            ? `লাভ: +${money(item.grossProfit)}`
                            : `একক: +${money(item.unitMarginAmount)}`}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Stagnating Products */}
            <div className="profit-spotlight-box amber-border">
              <div className="profit-spotlight-head">
                <div className="profit-spotlight-title">
                  <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                  <h3>অচল ও ধীরগতির স্টক</h3>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCategoryList('stagnant_stock')}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#b45309',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  সব দেখুন ({toBengaliNumerals(report.stagnatingItems.length)})
                </button>
              </div>

              {report.stagnatingItems.length === 0 ? (
                <div
                  style={{
                    padding: '14px 10px',
                    textAlign: 'center',
                    background: '#f0fdf4',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#166534',
                    fontWeight: 600,
                  }}
                >
                  বর্তমানে কোনো পণ্য অচল বা অবিক্রিত অবস্থায় আটকে নেই।
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {report.stagnatingItems.slice(0, 3).map((item) => (
                    <div key={item.product.id} className="profit-spotlight-row amber-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        {renderProductThumbnail(item.product, 38)}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <strong
                              style={{
                                fontSize: '13px',
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.product.name}
                            </strong>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: '#92400e',
                                background: '#fef3c7',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              {toBengaliNumerals(item.currentStock)} {item.product.unit}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#92400e',
                              marginTop: '2px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.stagnationReasonBn}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        <strong style={{ fontSize: '13px', color: '#b45309', display: 'block', whiteSpace: 'nowrap' }}>
                          {money(item.stockCostValue)}
                        </strong>
                        {admin && onRecordSaleForProduct ? (
                          <button
                            type="button"
                            onClick={() => onRecordSaleForProduct(item.product)}
                            style={{
                              marginTop: '2px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              color: '#0d9488',
                              background: '#ffffff',
                              border: '1px solid #99f6e4',
                              borderRadius: '5px',
                              padding: '1px 6px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            + বিক্রয়
                          </button>
                        ) : (
                          <small style={{ fontSize: '10.5px', color: '#78350f', whiteSpace: 'nowrap' }}>
                            গতি: {toBengaliNumerals(item.sellThroughRate)}%
                          </small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Comparison Chart (Collapsible) */}
          {showChart && chartData.length > 0 && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontSize: '13.5px',
                    fontWeight: 800,
                    color: '#0f172a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  তুলনামূলক চার্ট (শীর্ষ {toBengaliNumerals(chartData.length)}টি পণ্য)
                </h4>

                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    type="button"
                    onClick={() => setChartMetric('financials')}
                    style={{
                      padding: '4px 9px',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: chartMetric === 'financials' ? '1px solid #0f2438' : '1px solid #cbd5e1',
                      background: chartMetric === 'financials' ? '#0f2438' : '#f8fafc',
                      color: chartMetric === 'financials' ? '#ffffff' : '#334155',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    বিক্রয় ও লাভ (৳)
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('margin')}
                    style={{
                      padding: '4px 9px',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: chartMetric === 'margin' ? '1px solid #0f2438' : '1px solid #cbd5e1',
                      background: chartMetric === 'margin' ? '#0f2438' : '#f8fafc',
                      color: chartMetric === 'margin' ? '#ffffff' : '#334155',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    মার্জিন ও গতি (%)
                  </button>
                </div>
              </div>

              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {chartMetric === 'financials' ? (
                    <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10.5, fill: '#334155', fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10.5, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `৳${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      />
                      <Tooltip
                        formatter={(value: any, name: any) => [money(Number(value) || 0), String(name ?? '')]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11.5px', paddingTop: '4px' }} />
                      <Bar dataKey="salesRevenue" name="বিক্রয়" fill="#0284c7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cogs" name="ক্রয় খরচ (COGS)" fill="#d97706" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="grossProfit" name="গ্রস মুনাফা" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10.5, fill: '#334155', fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10.5, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, String(name ?? '')]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11.5px', paddingTop: '4px' }} />
                      <Bar dataKey="marginPercent" name="লাভের হার (%)" fill="#0d9488" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry) => (
                          <Cell
                            key={entry.id}
                            fill={
                              entry.marginPercent >= 25
                                ? '#16a34a'
                                : entry.marginPercent < 12
                                ? '#dc2626'
                                : '#0d9488'
                            }
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="sellThroughRate"
                        name="বিক্রয় গতি (%)"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Single-Line Filter Tabs + Search & Sort Bar */}
          <div className="profit-toolbar">
            <div className="profit-filter-strip">
              {(
                [
                  { key: 'all', label: `সব পণ্য (${toBengaliNumerals(report.items.length)})` },
                  {
                    key: 'high_margin',
                    label: `সর্বোচ্চ লাভের পণ্য (${toBengaliNumerals(highestProfitList.length)})`,
                  },
                  {
                    key: 'stagnating',
                    label: `অচল স্টক (${toBengaliNumerals(report.stagnatingItems.length)})`,
                  },
                  {
                    key: 'most_sold',
                    label: `সর্বোচ্চ বিক্রি (${toBengaliNumerals(mostSoldList.length)})`,
                  },
                  {
                    key: 'least_sold',
                    label: `সর্বনিম্ন বিক্রি (${toBengaliNumerals(leastSoldList.length)})`,
                  },
                  {
                    key: 'low_margin',
                    label: `স্বল্প মার্জিন (${toBengaliNumerals(
                      report.items.filter((i) => i.status === 'low_margin').length
                    )})`,
                  },
                  {
                    key: 'out_of_stock',
                    label: `স্টক শেষ (${toBengaliNumerals(
                      report.items.filter((i) => i.status === 'out_of_stock').length
                    )})`,
                  },
                ] as { key: FilterCategory; label: string }[]
              ).map((tabItem) => (
                <button
                  key={tabItem.key}
                  type="button"
                  className={`profit-filter-tab ${activeFilter === tabItem.key ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFilter(tabItem.key);
                    if (tabItem.key === 'high_margin') setSortBy('profit_desc');
                    else if (tabItem.key === 'stagnating') setSortBy('stagnant_stock_desc');
                    else if (tabItem.key === 'most_sold') setSortBy('units_sold_desc');
                    else if (tabItem.key === 'least_sold') setSortBy('units_sold_asc');
                  }}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>

            <div className="profit-search-sort-row">
              <div className="profit-search-box">
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    color: '#64748b',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="পণ্য বা SKU খুঁজুন…"
                />
              </div>

              <select
                className="profit-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="সাজানোর ক্রম"
              >
                <option value="margin_desc">সাজান: সর্বোচ্চ মার্জিন (%)</option>
                <option value="profit_desc">সাজান: সর্বোচ্চ মুনাফা (৳)</option>
                <option value="units_sold_desc">সাজান: সর্বোচ্চ বিক্রি হওয়া প্রডাক্ট</option>
                <option value="units_sold_asc">সাজান: সর্বনিম্ন বিক্রি হওয়া প্রডাক্ট</option>
                <option value="revenue_desc">সাজান: সর্বোচ্চ বিক্রয় রাজস্ব (৳)</option>
                <option value="stagnant_stock_desc">সাজান: আটকে থাকা অচল স্টক</option>
                <option value="velocity_asc">সাজান: ধীরগতির পণ্য আগে</option>
              </select>
            </div>
          </div>

          {/* Product Profitability List (Responsive Mobile Cards + Desktop Table) */}
          {products.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1',
              }}
            >
              <Boxes size={34} style={{ color: '#94a3b8', margin: '0 auto 8px', display: 'block' }} />
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: '#0f172a' }}>
                এখনো কোনো পণ্য ইনভেন্টরিতে যোগ করা হয়নি
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#64748b' }}>
                পণ্যভিত্তিক লাভ ও স্টক বিশ্লেষণ দেখতে প্রথমে পণ্য যোগ করুন।
              </p>
              {admin && onAddNewProduct && (
                <button type="button" className="primary" onClick={onAddNewProduct}>
                  <Plus size={15} /> নতুন পণ্য যোগ করুন
                </button>
              )}
            </div>
          ) : filteredAndSortedItems.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1',
                color: '#64748b',
                fontSize: '12.5px',
              }}
            >
              নির্বাচিত ফিল্টারে কোনো পণ্য পাওয়া যায়নি।{' '}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setActiveFilter('all');
                  setSearchQuery('');
                }}
              >
                সকল পণ্য দেখুন
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Structured Product Cards (<= 768px) */}
              <div className="profit-mobile-list">
                {filteredAndSortedItems.map((item) => {
                  const marginColor =
                    item.effectiveMarginPercent >= 25
                      ? '#15803d'
                      : item.effectiveMarginPercent < 12
                      ? '#dc2626'
                      : '#0d9488';

                  return (
                    <div
                      key={item.product.id}
                      className={`profit-mobile-item ${
                        item.isStagnating ? 'is-stagnant' : item.isTopMargin ? 'is-top' : ''
                      }`}
                    >
                      {/* Top Row: Thumbnail + Name + Badge */}
                      <div className="profit-mobile-item-head">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
                          {renderProductThumbnail(item.product, 42)}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: '13.5px',
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.product.name}
                            </strong>
                            <span
                              style={{
                                display: 'block',
                                fontSize: '11px',
                                color: '#64748b',
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              ক্রয়: {money(item.product.averageCost)} · বিক্রয়: {money(item.product.sellingPrice)}
                            </span>
                          </div>
                        </div>
                        {renderStatusBadge(item)}
                      </div>

                      {/* 4-Column Metric Strip */}
                      <div className="profit-mobile-metrics">
                        <div className="profit-mobile-metric-cell">
                          <span>মোট বিক্রয়</span>
                          <strong style={{ color: '#0284c7' }}>{money(item.salesRevenue)}</strong>
                        </div>
                        <div className="profit-mobile-metric-cell">
                          <span>ক্রয় খরচ</span>
                          <strong style={{ color: '#b45309' }}>{money(item.cogs)}</strong>
                        </div>
                        <div className="profit-mobile-metric-cell">
                          <span>গ্রস লাভ</span>
                          <strong
                            style={{
                              color:
                                item.grossProfit > 0
                                  ? '#15803d'
                                  : item.grossProfit < 0
                                  ? '#dc2626'
                                  : '#475569',
                            }}
                          >
                            {item.grossProfit > 0 ? '+' : ''}
                            {money(item.grossProfit)}
                          </strong>
                        </div>
                        <div className="profit-mobile-metric-cell">
                          <span>মার্জিন হার</span>
                          <strong style={{ color: marginColor }}>
                            {toBengaliNumerals(item.effectiveMarginPercent)}%
                          </strong>
                        </div>
                      </div>

                      {/* Recommendation / Stagnation Alert */}
                      <div
                        style={{
                          fontSize: '11px',
                          color: item.isStagnating ? '#92400e' : '#475569',
                          lineHeight: 1.35,
                        }}
                      >
                        {item.stagnationReasonBn ? `⚠️ ${item.stagnationReasonBn} — ` : ''}
                        {item.recommendationBn}
                      </div>

                      {/* Bottom Row: Stock Meta + Quick Actions */}
                      <div className="profit-mobile-item-foot">
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#334155',
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          মজুদ: <b>{toBengaliNumerals(item.currentStock)} {item.product.unit}</b> ({money(item.stockCostValue)}) · বিক্রি: {toBengaliNumerals(item.unitsSold)} {item.product.unit}
                        </span>

                        {admin && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                            {onRecordSaleForProduct && (
                              <button
                                type="button"
                                onClick={() => onRecordSaleForProduct(item.product)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#0f766e',
                                  background: '#f0fdfa',
                                  border: '1px solid #99f6e4',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer',
                                }}
                              >
                                <Plus size={12} /> বিক্রয়
                              </button>
                            )}
                            {onEditProduct && (
                              <button
                                type="button"
                                className="action-btn"
                                onClick={() => onEditProduct(item.product)}
                                title="পণ্য সম্পাদনা"
                                style={{ minHeight: '28px', minWidth: '28px', padding: '4px' }}
                              >
                                <Edit3 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop High-Density Table (> 768px) */}
              <div className="table-wrap profit-desktop-table" style={{ margin: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>পণ্য ও স্ট্যাটাস</th>
                      <th style={{ textAlign: 'right' }}>একক ক্রয় / বিক্রয়</th>
                      <th style={{ textAlign: 'right' }}>বিক্রয় ও COGS</th>
                      <th style={{ textAlign: 'right' }}>গ্রস মুনাফা</th>
                      <th style={{ textAlign: 'right' }}>মার্জিন (%)</th>
                      <th style={{ textAlign: 'right' }}>বর্তমান স্টক ও গতি</th>
                      <th>বিশ্লেষণ ও সুপারিশ</th>
                      {admin && <th style={{ textAlign: 'center' }}>অ্যাকশন</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedItems.map((item) => {
                      const marginColor =
                        item.effectiveMarginPercent >= 25
                          ? '#15803d'
                          : item.effectiveMarginPercent < 12
                          ? '#dc2626'
                          : '#0d9488';

                      return (
                        <tr
                          key={item.product.id}
                          style={{
                            background: item.isStagnating
                              ? 'rgba(254, 243, 199, 0.25)'
                              : item.isTopMargin
                              ? 'rgba(220, 252, 231, 0.2)'
                              : undefined,
                          }}
                        >
                          <td style={{ minWidth: '180px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                              {renderProductThumbnail(item.product, 40)}
                              <div>
                                <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>
                                  {item.product.name}
                                </strong>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginTop: '3px',
                                  }}
                                >
                                  {renderStatusBadge(item)}
                                  {item.product.sku && (
                                    <small style={{ fontSize: '10.5px', color: '#64748b' }}>
                                      SKU: {item.product.sku}
                                    </small>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td
                            style={{
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                              বিক্রয়: {money(item.product.sellingPrice)}
                            </div>
                            <small style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                              ক্রয়: {money(item.product.averageCost)}
                            </small>
                            <small
                              style={{
                                fontSize: '10.5px',
                                color: item.unitMarginAmount >= 0 ? '#059669' : '#dc2626',
                                fontWeight: 600,
                              }}
                            >
                              একক লাভ: {item.unitMarginAmount >= 0 ? '+' : ''}
                              {money(item.unitMarginAmount)}
                            </small>
                          </td>

                          <td
                            style={{
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0284c7' }}>
                              {money(item.salesRevenue)}
                            </div>
                            <small style={{ fontSize: '11px', color: '#b45309', display: 'block' }}>
                              COGS: {money(item.cogs)}
                            </small>
                            <small style={{ fontSize: '10.5px', color: '#64748b' }}>
                              বিক্রি: {toBengaliNumerals(item.unitsSold)} {item.product.unit}
                            </small>
                          </td>

                          <td
                            style={{
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <strong
                              style={{
                                fontSize: '13.5px',
                                color:
                                  item.grossProfit > 0
                                    ? '#15803d'
                                    : item.grossProfit < 0
                                    ? '#dc2626'
                                    : '#64748b',
                                display: 'block',
                              }}
                            >
                              {item.grossProfit > 0 ? '+' : ''}
                              {money(item.grossProfit)}
                            </strong>
                            <small style={{ fontSize: '10.5px', color: '#64748b' }}>
                              {item.salesCount > 0 ? `${toBengaliNumerals(item.salesCount)} বার বিক্রয়` : 'বিক্রি হয়নি'}
                            </small>
                          </td>

                          <td
                            style={{
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              minWidth: '115px',
                            }}
                          >
                            <strong
                              style={{
                                fontSize: '14px',
                                color: marginColor,
                                display: 'block',
                              }}
                            >
                              {toBengaliNumerals(item.effectiveMarginPercent)}%
                            </strong>
                            <div
                              style={{
                                width: '100%',
                                height: '5px',
                                background: '#e2e8f0',
                                borderRadius: '999px',
                                overflow: 'hidden',
                                margin: '3px 0',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.max(0, Math.min(100, item.effectiveMarginPercent))}%`,
                                  height: '100%',
                                  background: marginColor,
                                  borderRadius: '999px',
                                }}
                              />
                            </div>
                            <small style={{ fontSize: '10px', color: '#64748b' }}>
                              {item.salesCount > 0
                                ? `তালিকা: ${toBengaliNumerals(item.catalogMarginPercent)}%`
                                : 'প্রত্যাশিত'}
                            </small>
                          </td>

                          <td
                            style={{
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                              {toBengaliNumerals(item.currentStock)} {item.product.unit}
                            </div>
                            <small style={{ fontSize: '11px', color: '#475569', display: 'block' }}>
                              মূল্য: <b>{money(item.stockCostValue)}</b>
                            </small>
                            <small
                              style={{
                                fontSize: '10.5px',
                                color: item.sellThroughRate >= 40 ? '#059669' : '#d97706',
                                fontWeight: 600,
                              }}
                            >
                              গতি: {toBengaliNumerals(item.sellThroughRate)}%
                            </small>
                          </td>

                          <td style={{ minWidth: '190px', maxWidth: '240px', whiteSpace: 'normal' }}>
                            {item.stagnationReasonBn && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#b45309',
                                  marginBottom: '2px',
                                }}
                              >
                                ⚠️ {item.stagnationReasonBn}
                              </div>
                            )}
                            <div style={{ fontSize: '11px', color: '#334155', lineHeight: 1.35 }}>
                              {item.recommendationBn}
                            </div>
                            {item.lastSaleDate && (
                              <small
                                style={{
                                  display: 'block',
                                  fontSize: '10px',
                                  color: '#64748b',
                                  marginTop: '2px',
                                }}
                              >
                                শেষ বিক্রয়: {dateLabel(item.lastSaleDate)}
                              </small>
                            )}
                          </td>

                          {admin && (
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                {onRecordSaleForProduct && (
                                  <button
                                    type="button"
                                    className="action-btn"
                                    title="এই পণ্যের বিক্রয় এন্ট্রি দিন"
                                    onClick={() => onRecordSaleForProduct(item.product)}
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      color: '#0f766e',
                                      background: '#f0fdfa',
                                      border: '1px solid #99f6e4',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                  >
                                    <Plus size={12} /> বিক্রয়
                                  </button>
                                )}
                                {onEditProduct && (
                                  <button
                                    type="button"
                                    className="action-btn"
                                    title="পণ্য সম্পাদনা"
                                    onClick={() => onEditProduct(item.product)}
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Unlinked General Sales Notice */}
          {report.unlinkedSalesCount > 0 && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '9px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '6px',
                fontSize: '11.5px',
                color: '#475569',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>
                ℹ️ <b>সাধারণ বিক্রয় (পণ্য ছাড়া):</b> {toBengaliNumerals(report.unlinkedSalesCount)}টি এন্ট্রি
              </span>
              <span>
                বিক্রয়: <b>{money(report.unlinkedSalesRevenue)}</b> · COGS:{' '}
                <b>{money(report.unlinkedSalesCogs)}</b> · লাভ:{' '}
                <b style={{ color: '#059669' }}>+{money(report.unlinkedSalesProfit)}</b>
              </span>
            </div>
          )}
        </div>

        {/* Full-Size Product Photo Preview Lightbox */}
        {previewProduct && previewProduct.imageUrl && (
          <div
            className="profit-image-preview-backdrop"
            onClick={() => setPreviewProduct(null)}
          >
            <div
              className="profit-image-preview-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="profit-image-preview-head">
                <div>
                  <strong>{previewProduct.name}</strong>
                  <span>
                    ক্রয়: {money(previewProduct.averageCost)} · বিক্রয়:{' '}
                    {money(previewProduct.sellingPrice)}
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setPreviewProduct(null)}
                  aria-label="বন্ধ করুন"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="profit-image-preview-body">
                <img src={previewProduct.imageUrl} alt={previewProduct.name} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
