import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, BarChart3, Calendar, TrendingUp } from 'lucide-react';
import type { Entry, Product } from '../types';
import {
  calculateTotalPurchaseCost,
  dateLabel,
  money,
  summary,
  toBengaliNumerals,
} from '../accounting';

interface SalesTrendChartSectionProps {
  entries: Entry[];
  products: Product[];
  onInspectSales?: () => void;
  onInspectProfit?: () => void;
}

type TrendTimeframe = 'daily_7d' | 'weekly_8w' | 'monthly_6m';
type ChartVisualMode = 'area' | 'bar';

interface TrendDataPoint {
  key: string;
  label: string;
  fullLabel: string;
  sales: number;
  netProfit: number;
  purchasesAndExpenses: number;
  salesCount: number;
}

const BENGALI_SHORT_MONTHS = [
  'জানু',
  'ফেব্রু',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টে',
  'অক্টো',
  'নভে',
  'ডিসে',
];

function getLocalIsoDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

function formatShortDayBn(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const mIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  const dayBn = toBengaliNumerals(Number(parts[2]));
  return `${dayBn} ${BENGALI_SHORT_MONTHS[mIdx]}`;
}

function formatMonthBucketBn(ym: string): { short: string; full: string } {
  const [y, m] = ym.split('-');
  const mIdx = Math.max(0, Math.min(11, Number(m) - 1));
  const yearShortBn = toBengaliNumerals(y.slice(-2));
  const yearFullBn = toBengaliNumerals(y);
  return {
    short: `${BENGALI_SHORT_MONTHS[mIdx]} '${yearShortBn}`,
    full: `${BENGALI_SHORT_MONTHS[mIdx]} ${yearFullBn}`,
  };
}

export default function SalesTrendChartSection({
  entries,
  products,
  onInspectSales,
  onInspectProfit,
}: SalesTrendChartSectionProps) {
  const [timeframe, setTimeframe] = useState<TrendTimeframe>('weekly_8w');
  const [chartType, setChartType] = useState<ChartVisualMode>('area');
  const [showCostSeries, setShowCostSeries] = useState<boolean>(false);

  const postedEntries = useMemo(
    () => entries.filter((e) => e.status === 'posted'),
    [entries]
  );

  // 1. Last 7 Days (Daily Breakdown within the current week)
  const daily7dData = useMemo<TrendDataPoint[]>(() => {
    const result: TrendDataPoint[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = getLocalIsoDate(d);
      const dayEntries = postedEntries.filter((e) => e.date === iso);
      const dayStats = summary(dayEntries, products);
      const dayPurchase = calculateTotalPurchaseCost(dayEntries, products);
      const salesCount = dayEntries.filter((e) => e.type === 'sale').length;

      result.push({
        key: iso,
        label: i === 0 ? `আজ (${formatShortDayBn(iso)})` : formatShortDayBn(iso),
        fullLabel: `${dateLabel(iso)}${i === 0 ? ' (আজ)' : i === 1 ? ' (গতকাল)' : ''}`,
        sales: Math.round(dayStats.sales),
        netProfit: Math.round(dayStats.netProfit),
        purchasesAndExpenses: Math.round(dayPurchase + dayStats.expenses),
        salesCount,
      });
    }
    return result;
  }, [postedEntries, products]);

  // 2. Last 8 Weeks (Weekly Aggregation)
  const weekly8wData = useMemo<TrendDataPoint[]>(() => {
    const result: TrendDataPoint[] = [];
    const now = new Date();

    for (let w = 7; w >= 0; w--) {
      const endDate = new Date(now);
      endDate.setDate(now.getDate() - w * 7);
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 6);

      const startIso = getLocalIsoDate(startDate);
      const endIso = getLocalIsoDate(endDate);

      const weekEntries = postedEntries.filter(
        (e) => e.date >= startIso && e.date <= endIso
      );
      const weekStats = summary(weekEntries, products);
      const weekPurchase = calculateTotalPurchaseCost(weekEntries, products);
      const salesCount = weekEntries.filter((e) => e.type === 'sale').length;

      const shortRange = `${formatShortDayBn(startIso)}–${formatShortDayBn(endIso)}`;
      result.push({
        key: `${startIso}_${endIso}`,
        label: w === 0 ? `চলতি সপ্তাহ` : shortRange,
        fullLabel: `সপ্তাহ (${formatShortDayBn(startIso)} থেকে ${formatShortDayBn(endIso)})`,
        sales: Math.round(weekStats.sales),
        netProfit: Math.round(weekStats.netProfit),
        purchasesAndExpenses: Math.round(weekPurchase + weekStats.expenses),
        salesCount,
      });
    }
    return result;
  }, [postedEntries, products]);

  // 3. Last 6 Months (Monthly Aggregation)
  const monthly6mData = useMemo<TrendDataPoint[]>(() => {
    const result: TrendDataPoint[] = [];
    const now = new Date();

    // Also include any historical months present in entries if older
    const monthKeysSet = new Set<string>();
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeysSet.add(ym);
    }
    for (const e of postedEntries) {
      if (e.date && e.date.length >= 7) {
        monthKeysSet.add(e.date.slice(0, 7));
      }
    }

    const sortedMonths = Array.from(monthKeysSet).sort().slice(-8);

    for (const ym of sortedMonths) {
      const monthEntries = postedEntries.filter((e) => e.date.startsWith(ym));
      const monthStats = summary(monthEntries, products);
      const monthPurchase = calculateTotalPurchaseCost(monthEntries, products);
      const salesCount = monthEntries.filter((e) => e.type === 'sale').length;
      const formatted = formatMonthBucketBn(ym);

      result.push({
        key: ym,
        label: formatted.short,
        fullLabel: `${formatted.full} মাস`,
        sales: Math.round(monthStats.sales),
        netProfit: Math.round(monthStats.netProfit),
        purchasesAndExpenses: Math.round(monthPurchase + monthStats.expenses),
        salesCount,
      });
    }
    return result;
  }, [postedEntries, products]);

  const activeData = useMemo(() => {
    if (timeframe === 'daily_7d') return daily7dData;
    if (timeframe === 'weekly_8w') return weekly8wData;
    return monthly6mData;
  }, [timeframe, daily7dData, weekly8wData, monthly6mData]);

  // Calculate growth metrics & highlights for the active timeframe
  const trendInsights = useMemo(() => {
    const totalSales = activeData.reduce((acc, d) => acc + d.sales, 0);
    const totalNetProfit = activeData.reduce((acc, d) => acc + d.netProfit, 0);
    const nonZeroPeriods = activeData.filter((d) => d.sales > 0);
    const avgSales =
      activeData.length > 0 ? Math.round(totalSales / activeData.length) : 0;

    // Peak period
    let peakPeriod: TrendDataPoint | null = null;
    for (const pt of activeData) {
      if (!peakPeriod || pt.sales > peakPeriod.sales) {
        peakPeriod = pt;
      }
    }

    // Current vs Previous period comparison
    const currentBucket = activeData[activeData.length - 1];
    const prevBucket = activeData.length >= 2 ? activeData[activeData.length - 2] : null;

    let growthPercent = 0;
    let growthDelta = 0;
    if (currentBucket && prevBucket) {
      growthDelta = currentBucket.sales - prevBucket.sales;
      if (prevBucket.sales > 0) {
        growthPercent = Math.round(((currentBucket.sales - prevBucket.sales) / prevBucket.sales) * 1000) / 10;
      } else if (currentBucket.sales > 0) {
        growthPercent = 100;
      }
    }

    return {
      totalSales,
      totalNetProfit,
      avgSales,
      peakPeriod: peakPeriod && peakPeriod.sales > 0 ? peakPeriod : null,
      currentBucket,
      prevBucket,
      growthPercent,
      growthDelta,
      hasAnySales: nonZeroPeriods.length > 0,
    };
  }, [activeData]);

  const periodUnitBn =
    timeframe === 'daily_7d'
      ? 'দিন'
      : timeframe === 'weekly_8w'
      ? 'সপ্তাহ'
      : 'মাস';

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '14px',
        padding: '18px 20px',
        marginBottom: '18px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
      }}
      aria-label="সাপ্তাহিক ও মাসিক বিক্রয় ট্রেন্ড চার্ট"
    >
      {/* Top Header & Interactive Mode Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
          paddingBottom: '14px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#f0fdfa',
              border: '1px solid #99f6e4',
              color: '#0f766e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TrendingUp size={20} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: 1.3,
              }}
            >
              সাপ্তাহিক ও মাসিক বিক্রয় এবং ব্যবসায়িক প্রবৃদ্ধি ট্রেন্ড
            </h3>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '12.5px',
                color: '#64748b',
              }}
            >
              সময়ের সাথে বিক্রয় রাজস্ব, নিট মুনাফা ও খরচের তুলনামূলক গ্রাফ
            </p>
          </div>
        </div>

        {/* Interactive Segmented Control Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {/* Timeframe Selector */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setTimeframe('weekly_8w')}
              style={{
                padding: '6px 11px',
                borderRadius: '7px',
                border: 'none',
                background: timeframe === 'weekly_8w' ? '#ffffff' : 'transparent',
                color: timeframe === 'weekly_8w' ? '#0f766e' : '#475569',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow:
                  timeframe === 'weekly_8w' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              সাপ্তাহিক (৮ সপ্তাহ)
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('monthly_6m')}
              style={{
                padding: '6px 11px',
                borderRadius: '7px',
                border: 'none',
                background: timeframe === 'monthly_6m' ? '#ffffff' : 'transparent',
                color: timeframe === 'monthly_6m' ? '#0f766e' : '#475569',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow:
                  timeframe === 'monthly_6m' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              মাসিক (৬-৮ মাস)
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('daily_7d')}
              style={{
                padding: '6px 11px',
                borderRadius: '7px',
                border: 'none',
                background: timeframe === 'daily_7d' ? '#ffffff' : 'transparent',
                color: timeframe === 'daily_7d' ? '#0f766e' : '#475569',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow:
                  timeframe === 'daily_7d' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              দৈনিক (গত ৭ দিন)
            </button>
          </div>

          {/* Chart Style & Cost Series Toggle */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setChartType('area')}
              style={{
                padding: '6px 10px',
                borderRadius: '7px',
                border: 'none',
                background: chartType === 'area' ? '#0f172a' : 'transparent',
                color: chartType === 'area' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '11.5px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              এরিয়া ট্রেন্ড
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              style={{
                padding: '6px 10px',
                borderRadius: '7px',
                border: 'none',
                background: chartType === 'bar' ? '#0f172a' : 'transparent',
                color: chartType === 'bar' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '11.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
              }}
            >
              <BarChart3 size={13} /> বার চার্ট
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCostSeries((prev) => !prev)}
            style={{
              padding: '6px 11px',
              borderRadius: '8px',
              border: showCostSeries ? '1px solid #d97706' : '1px solid #cbd5e1',
              background: showCostSeries ? '#fffbeb' : '#ffffff',
              color: showCostSeries ? '#b45309' : '#475569',
              fontWeight: 700,
              fontSize: '11.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {showCostSeries ? '✓ ক্রয় ও খরচ লাইন চালু' : '+ ক্রয় ও খরচ তুলনা দেখুন'}
          </button>
        </div>
      </div>

      {/* Key Growth Metrics Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        {/* Metric 1: Total Sales in Active View */}
        <div
          onClick={onInspectSales}
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            cursor: onInspectSales ? 'pointer' : 'default',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            নির্বাচিত সময়ে মোট বিক্রয়
          </div>
          <div
            style={{
              fontSize: '19px',
              fontWeight: 800,
              color: '#0284c7',
              marginTop: '4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {money(trendInsights.totalSales)}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
            গড় প্রতি {periodUnitBn}:{' '}
            <b style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
              {money(trendInsights.avgSales)}
            </b>
          </div>
        </div>

        {/* Metric 2: Total Net Profit in Active View */}
        <div
          onClick={onInspectProfit}
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            cursor: onInspectProfit ? 'pointer' : 'default',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            নির্বাচিত সময়ে নিট মুনাফা
          </div>
          <div
            style={{
              fontSize: '19px',
              fontWeight: 800,
              color: trendInsights.totalNetProfit >= 0 ? '#059669' : '#dc2626',
              marginTop: '4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {trendInsights.totalNetProfit >= 0 ? '+' : ''}
            {money(trendInsights.totalNetProfit)}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
            মুনাফার হার:{' '}
            <b style={{ color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
              {trendInsights.totalSales > 0
                ? `${((trendInsights.totalNetProfit / trendInsights.totalSales) * 100).toFixed(1)}%`
                : '0.0%'}
            </b>
          </div>
        </div>

        {/* Metric 3: Period-over-Period Growth Rate */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            চলতি বনাম পূর্ববর্তী {periodUnitBn} প্রবৃদ্ধি
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '18px',
              fontWeight: 800,
              color: trendInsights.growthDelta >= 0 ? '#059669' : '#dc2626',
              marginTop: '4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {trendInsights.growthDelta >= 0 ? (
              <ArrowUpRight size={18} />
            ) : (
              <ArrowDownRight size={18} />
            )}
            <span>
              {trendInsights.growthPercent >= 0 ? '+' : ''}
              {toBengaliNumerals(trendInsights.growthPercent)}%
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
            চলতি {periodUnitBn}:{' '}
            <b style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
              {money(trendInsights.currentBucket?.sales || 0)}
            </b>
          </div>
        </div>

        {/* Metric 4: Peak Sales Period */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            সর্বোচ্চ বিক্রয়ের {periodUnitBn}
          </div>
          <div
            style={{
              fontSize: '17px',
              fontWeight: 800,
              color: '#0f172a',
              marginTop: '4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {trendInsights.peakPeriod
              ? money(trendInsights.peakPeriod.sales)
              : money(0)}
          </div>
          <div
            style={{
              fontSize: '11.5px',
              color: '#0f766e',
              fontWeight: 600,
              marginTop: '3px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Calendar size={12} />
            <span>
              {trendInsights.peakPeriod
                ? `${trendInsights.peakPeriod.label} (${toBengaliNumerals(trendInsights.peakPeriod.salesCount)}টি বিক্রয়)`
                : 'এখনো বিক্রয় এন্ট্রি নেই'}
            </span>
          </div>
        </div>
      </div>

      {/* Recharts Visualization Container */}
      <div
        style={{
          width: '100%',
          height: '310px',
          background: '#fcfdfe',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '14px 10px 6px 2px',
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart
              data={activeData}
              margin={{ top: 10, right: 18, left: 6, bottom: 4 }}
            >
              <defs>
                <linearGradient id="salesTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="profitTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.26} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="costTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11.5, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val: number) =>
                  val >= 1000 ? `৳${toBengaliNumerals(Math.round(val / 1000))}k` : `৳${toBengaliNumerals(val)}`
                }
              />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '12.5px',
                  padding: '10px 14px',
                  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.25)',
                }}
                labelStyle={{ color: '#5eead4', fontWeight: 700, marginBottom: '6px' }}
                labelFormatter={(_label, payload) =>
                  payload?.[0]?.payload?.fullLabel || _label
                }
                formatter={(value: any, name: any) => [
                  money(Number(value) || 0),
                  String(name || ''),
                ]}
              />
              <Legend
                verticalAlign="top"
                height={32}
                wrapperStyle={{ fontSize: '12px', fontWeight: 700 }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                name="মোট বিক্রয় (৳)"
                stroke="#0284c7"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#salesTrendGrad)"
                activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff' }}
              />
              <Area
                type="monotone"
                dataKey="netProfit"
                name="নিট মুনাফা (৳)"
                stroke="#0d9488"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#profitTrendGrad)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
              />
              {showCostSeries && (
                <Area
                  type="monotone"
                  dataKey="purchasesAndExpenses"
                  name="মোট ক্রয় ও অতিরিক্ত খরচ (৳)"
                  stroke="#d97706"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#costTrendGrad)"
                />
              )}
            </AreaChart>
          ) : (
            <BarChart
              data={activeData}
              margin={{ top: 10, right: 18, left: 6, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11.5, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val: number) =>
                  val >= 1000 ? `৳${toBengaliNumerals(Math.round(val / 1000))}k` : `৳${toBengaliNumerals(val)}`
                }
              />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '12.5px',
                  padding: '10px 14px',
                  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.25)',
                }}
                labelStyle={{ color: '#5eead4', fontWeight: 700, marginBottom: '6px' }}
                labelFormatter={(_label, payload) =>
                  payload?.[0]?.payload?.fullLabel || _label
                }
                formatter={(value: any, name: any) => [
                  money(Number(value) || 0),
                  String(name || ''),
                ]}
              />
              <Legend
                verticalAlign="top"
                height={32}
                wrapperStyle={{ fontSize: '12px', fontWeight: 700 }}
              />
              <Bar
                dataKey="sales"
                name="মোট বিক্রয় (৳)"
                fill="#0284c7"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="netProfit"
                name="নিট মুনাফা (৳)"
                fill="#0d9488"
                radius={[6, 6, 0, 0]}
              />
              {showCostSeries && (
                <Bar
                  dataKey="purchasesAndExpenses"
                  name="মোট ক্রয় ও অতিরিক্ত খরচ (৳)"
                  fill="#d97706"
                  radius={[6, 6, 0, 0]}
                />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
