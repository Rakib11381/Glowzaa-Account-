import React, { useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Download,
  Flame,
  Image as ImageIcon,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import type { BusinessSettings, Entry, Product } from '../types';
import { money, toBengaliNumerals } from '../accounting';

export interface NewTrendingProductSuggestion {
  id: string;
  name: string;
  category: 'hair_fashion' | 'jewelry' | 'cosmetics' | 'gift_combo';
  categoryLabelBn: string;
  wholesalePriceRangeBn: string;
  estimatedUnitCost: number;
  suggestedRetailPriceBn: string;
  estimatedSellingPrice: number;
  expectedMarginPercent: number;
  starterQtyBn: string;
  recommendedQty: number;
  unit: string;
  demandLevelBn: string;
  whyTrendingBn: string;
  marketTipBn: string;
}

export const NEW_TRENDING_SUGGESTIONS: NewTrendingProductSuggestion[] = [
  {
    id: 'trend-1',
    name: 'কোরিয়ান ম্যাট ও পার্ল ক্ল-ক্লিপ (Korean Matte & Pearl Claw Clips)',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳১৮ – ৳৩৫ / পিস',
    estimatedUnitCost: 25,
    suggestedRetailPriceBn: '৳৫০ – ৳৯০ / পিস',
    estimatedSellingPrice: 65,
    expectedMarginPercent: 160,
    starterQtyBn: '২–৩ ডজন (২৪–৩৬ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 সর্বোচ্চ চাহিদা (Top Viral)',
    whyTrendingBn:
      'আপনার দোকানে রাবার ও কাকড়ার গ্রাহক বেশি। স্কুল-কলেজ ও অফিসগামী মেয়েদের কাছে কোরিয়ান প্যাস্টেল ম্যাট ও পার্ল কাকড়া এখন সবচেয়ে বেশি বিক্রি হয়।',
    marketTipBn: 'একই রঙের না নিয়ে ৬–৮টি প্যাস্টেল কালার মিক্সড ডজন নিলে দ্রুত শেষ হবে।',
  },
  {
    id: 'trend-2',
    name: 'সিল্ক ও ভেলভেট স্ক্রাঞ্চি সেট (Silk & Velvet Hair Scrunchies)',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳৮ – ৳১৫ / পিস',
    estimatedUnitCost: 12,
    suggestedRetailPriceBn: '৳২৫ – ৳৪০ / পিস',
    estimatedSellingPrice: 30,
    expectedMarginPercent: 150,
    starterQtyBn: '৩–৪ ডজন (৩৬–৪৮ পিস)',
    recommendedQty: 36,
    unit: 'পিস',
    demandLevelBn: '🔥 সারা বছর চলমান ট্রেন্ড',
    whyTrendingBn:
      'সাধারণ কালো রাবারের পাশাপাশি চুল না ছেঁড়ার জন্য মেয়েরা সিল্ক ও ভেলভেট স্ক্রাঞ্চি ৩–৪ পিস একসাথে কেনে। এতে একক বিক্রয়ে বেশি লাভ থাকে।',
    marketTipBn: '৩ পিসের কম্বো প্যাক বানিয়ে ৳৮০–৳১০০ টাকায় বিক্রি করলে সেল দ্বিগুণ হয়।',
  },
  {
    id: 'trend-3',
    name: 'বাটারফ্লাই ও বো-রিবন হেয়ার ক্লিপ (Butterfly & Bow Ribbon Clips)',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳১২ – ৳২২ / জোড়া',
    estimatedUnitCost: 15,
    suggestedRetailPriceBn: '৳৩৫ – ৳৬০ / জোড়া',
    estimatedSellingPrice: 40,
    expectedMarginPercent: 166,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '⚡ উচ্চ মুনাফা ও গিফট আইটেম',
    whyTrendingBn:
      'বাচ্চা ও টিনএজারদের মধ্যে লং রিবন বো-ক্লিপ এবং মুভিং বাটারফ্লাই ক্লিপ এখন সোশ্যাল মিডিয়ায় ট্রেন্ডিং। কম দামে কিনে দ্বিগুণের বেশি দামে বিক্রি করা যায়।',
    marketTipBn: 'সাদা, কালো, মেরুন ও পিঙ্ক কালার বেশি রাখবেন।',
  },
  {
    id: 'trend-4',
    name: 'অ্যান্টি-টার্নিশ স্টেইনলেস স্টিল রিং ও ব্রেসলেট (Anti-Tarnish Rings & Bracelets)',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳৪৫ – ৳৮৫ / পিস',
    estimatedUnitCost: 60,
    suggestedRetailPriceBn: '৳১২০ – ৳২২০ / পিস',
    estimatedSellingPrice: 150,
    expectedMarginPercent: 150,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 12,
    unit: 'পিস',
    demandLevelBn: '💎 প্রিমিয়াম প্রফিট ট্রেন্ড',
    whyTrendingBn:
      'রঙ নষ্ট হয় না এমন ওয়াটারপ্রুফ মিনিমালিস্ট রিং, পেনডেন্ট চেইন ও ব্রেসলেটের চাহিদা এখন সবচেয়ে বেশি। প্রতিটি বিক্রয়ে ৳৬০–৳১০০ সরাসরি লাভ থাকে।',
    marketTipBn: 'অ্যাডজাস্টেবল সাইজের রিং নিলে সাইজ নিয়ে কোনো ঝামেলা থাকে না।',
  },
  {
    id: 'trend-5',
    name: 'কোরিয়ান স্টাড ও ঝুমকা ইয়াররিংস কার্ড (Korean Stud & Jhumka Earrings)',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳২০ – ৳৪৫ / জোড়া',
    estimatedUnitCost: 30,
    suggestedRetailPriceBn: '৳৬০ – ৳১২০ / জোড়া',
    estimatedSellingPrice: 75,
    expectedMarginPercent: 150,
    starterQtyBn: '২ ডজন (২৪ জোড়া)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 ডেইলি ফাস্ট-সেলিং',
    whyTrendingBn:
      'হেয়ার ক্লিপ কিনতে আসা কাস্টমাররা কাউন্টারে সুন্দর ইয়াররিংস দেখলে সাথে সাথেই ১–২ জোড়া কিনে নেয় (Impulse Buy)।',
    marketTipBn: '৬ জোড়ার স্টাড কার্ড ও ছোট অক্সিডাইজড ঝুমকা একসাথে রাখুন।',
  },
  {
    id: 'trend-6',
    name: 'মিনি পকেট মিরর ও ফোল্ডিং চিরুনি সেট (Cute Pocket Mirror & Comb)',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳২২ – ৳৪০ / পিস',
    estimatedUnitCost: 28,
    suggestedRetailPriceBn: '৳৫৫ – ৳৯০ / পিস',
    estimatedSellingPrice: 65,
    expectedMarginPercent: 132,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 18,
    unit: 'পিস',
    demandLevelBn: '📈 নিয়মিত চাহিদা',
    whyTrendingBn:
      'ব্যাগে রাখার মতো কার্টুন/ফ্লোরাল পকেট মিরর ও এয়ার-কুশন মিনি চিরুনি সব বয়সের কাস্টমার পছন্দ করে এবং কখনো নষ্ট বা মেয়াদোত্তীর্ণ হয় না।',
    marketTipBn: 'কাউন্টারের সামনে ডিসপ্লে করে রাখলে কাস্টমার নিজেই পছন্দ করে নেয়।',
  },
  {
    id: 'trend-7',
    name: 'প্রেস-অন নেইলস ও টিন্টেড লিপ বাম (Press-On Nails & Lip Gloss)',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳৩০ – ৳৫৫ / প্যাক',
    estimatedUnitCost: 40,
    suggestedRetailPriceBn: '৳৮০ – ৳১৪০ / প্যাক',
    estimatedSellingPrice: 100,
    expectedMarginPercent: 150,
    starterQtyBn: '১২–১৮ পিস',
    recommendedQty: 12,
    unit: 'পিস',
    demandLevelBn: '✨ উৎসব ও পার্টি ট্রেন্ড',
    whyTrendingBn:
      'বিয়ে বা যেকোনো অনুষ্ঠানে ইনস্ট্যান্ট ব্যবহারের জন্য গ্লু-সহ প্রেস-অন নেইল সেট এবং ফ্রুট লিপ অয়েল/বাম এখন তরুণীদের প্রথম পছন্দ।',
    marketTipBn: 'ন্যাচারাল ন্যুড ও ফ্রেঞ্চ টিপ ডিজাইনের নেইল সেট সবচেয়ে বেশি চলে।',
  },
  {
    id: 'trend-8',
    name: 'কম্বো গিফট বক্স (কাকড়া + স্ক্রাঞ্চি + ইয়াররিংস কম্বো প্যাক)',
    category: 'gift_combo',
    categoryLabelBn: 'কম্বো ও গিফট আইটেম',
    wholesalePriceRangeBn: '৳৬৫ – ৳৯০ / বক্স প্রস্তুত খরচ',
    estimatedUnitCost: 75,
    suggestedRetailPriceBn: '৳১৫০ – ৳২২০ / বক্স',
    estimatedSellingPrice: 170,
    expectedMarginPercent: 126,
    starterQtyBn: '১০–১৫টি রেডি বক্স',
    recommendedQty: 10,
    unit: 'পিস',
    demandLevelBn: '🎁 গিফট ও বান্ডেল হিট',
    whyTrendingBn:
      'আপনার দোকানের বিদ্যমান রাবার, কাকড়া ও ক্লিপগুলো ছোট ট্রান্সপারেন্ট বক্সে বা অর্গানজা ব্যাগে সাজিয়ে গিফট কম্বো বানালে এক বক্সেই ৪–৫টি পণ্য একসাথে বিক্রি হয়ে যায়!',
    marketTipBn:
      'বাজার থেকে শুধু ছোট গিফট পাউচ বা ক্রাফট বক্স (৳৫–৳৮ পিস) কিনে আনলেই নিজের দোকানেই কম্বো তৈরি করতে পারবেন।',
  },
];

// Safely convert an image URL to a base64 Data URL for html2canvas so external CORS images never break PDF generation
async function resolveSafeImageDataUrl(url?: string): Promise<string | null> {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => {
      resolve(null);
    }, 2800);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        const size = 140;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        const scale = Math.max(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
        const w = (img.naturalWidth || size) * scale;
        const h = (img.naturalHeight || size) * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = trimmed;
  });
}

export interface ProductMarketMetrics {
  product: Product;
  numericSku: number;
  currentStock: number;
  reorderPoint: number;
  averageCost: number;
  sellingPrice: number;
  unitProfit: number;
  marginPercent: number;
  stockCostValue: number;
  stockRetailValue: number;
  totalSoldUnits: number;
  totalSalesCount: number;
  totalRevenue: number;
  totalProfitEarned: number;
  stockStatus: 'out' | 'low' | 'ok';
  isTrending: boolean;
  needsPurchase: boolean;
  recommendedBuyQty: number;
  estimatedPurchaseCost: number;
  urgencyReasonBn: string;
  trendingReasonBn: string;
}

export function analyzeProductsForMarket(
  products: Product[],
  entries: Entry[],
  defaultReorderPoint: number = 5
): ProductMarketMetrics[] {
  const postedSales = entries.filter((e) => e.status === 'posted' && e.type === 'sale');

  const salesMap = new Map<
    string,
    { units: number; count: number; revenue: number; profit: number }
  >();

  for (const sale of postedSales) {
    if (!sale.productId) continue;
    const prev = salesMap.get(sale.productId) || { units: 0, count: 0, revenue: 0, profit: 0 };
    const qty = Number(sale.quantity) > 0 ? Number(sale.quantity) : 1;
    const rev = Number(sale.amount) || 0;
    const prof =
      sale.grossProfit !== undefined
        ? Number(sale.grossProfit)
        : sale.profit !== undefined
        ? Number(sale.profit)
        : Math.max(0, rev - (Number(sale.cogsAmount) || 0));
    salesMap.set(sale.productId, {
      units: prev.units + qty,
      count: prev.count + 1,
      revenue: prev.revenue + rev,
      profit: prev.profit + prof,
    });
  }

  return products.map((product, idx) => {
    const currentStock = Number(product.currentStock) || 0;
    const reorderPoint =
      product.reorderPoint !== undefined && product.reorderPoint !== null
        ? Number(product.reorderPoint)
        : defaultReorderPoint;
    const averageCost = Number(product.averageCost) || 0;
    const sellingPrice = Number(product.sellingPrice) || 0;
    const unitProfit = sellingPrice - averageCost;
    const marginPercent =
      averageCost > 0
        ? Math.round(((sellingPrice - averageCost) / averageCost) * 100)
        : sellingPrice > 0
        ? 100
        : 0;

    const saleStats = salesMap.get(product.id) || { units: 0, count: 0, revenue: 0, profit: 0 };

    const stockStatus: 'out' | 'low' | 'ok' =
      currentStock <= 0 ? 'out' : currentStock <= reorderPoint ? 'low' : 'ok';

    const isHighVelocity = saleStats.units >= 5 || saleStats.count >= 2;
    const isHighMargin = marginPercent >= 40 && unitProfit > 0;
    const isTrending = saleStats.units > 0 || (isHighMargin && currentStock > 0);

    const fastSellingRunningLow =
      saleStats.units >= 5 && currentStock <= Math.max(reorderPoint * 2, 12);
    const needsPurchase = stockStatus === 'out' || stockStatus === 'low' || fastSellingRunningLow;

    let recommendedBuyQty = 0;
    if (needsPurchase) {
      const targetStock = Math.max(
        reorderPoint > 0 ? reorderPoint * 3 : 12,
        saleStats.units > 0 ? Math.ceil(saleStats.units * 1.5) : 12,
        12
      );
      recommendedBuyQty = Math.max(6, targetStock - Math.max(0, currentStock));
    } else if (isHighVelocity) {
      recommendedBuyQty = 12;
    }

    let urgencyReasonBn = 'পর্যাপ্ত স্টক আছে';
    if (stockStatus === 'out') {
      urgencyReasonBn =
        saleStats.units > 0
          ? `🚨 স্টক একদম শেষ! (পূর্বে ${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} বিক্রি হয়েছে — দ্রুত কিনুন)`
          : '🚨 স্টক একদম শেষ (০ পিস) — বাজারে অবশ্যই কিনতে হবে';
    } else if (stockStatus === 'low') {
      urgencyReasonBn = `⚠️ স্টক কম! মাত্র ${toBengaliNumerals(currentStock)} ${product.unit || 'পিস'} বাকি (সতর্কতা সীমা: ${toBengaliNumerals(reorderPoint)})`;
    } else if (fastSellingRunningLow) {
      urgencyReasonBn = `⚡ দ্রুত বিক্রি হচ্ছে (${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} বিক্রি) — স্টক শেষ হওয়ার আগেই আনুন`;
    }

    let trendingReasonBn = '';
    if (saleStats.units >= 10) {
      trendingReasonBn = `🔥 বেস্ট-সেলার পণ্য: এখন পর্যন্ত ${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} বিক্রি ও ${money(saleStats.profit)} লাভ`;
    } else if (saleStats.units > 0) {
      trendingReasonBn = `📈 নিয়মিত চাহিদা: ${toBengaliNumerals(saleStats.count)} বার বিক্রয়ে মোট ${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} সেল`;
    } else if (marginPercent >= 50) {
      trendingReasonBn = `💎 উচ্চ মুনাফা পণ্য: প্রতি ${product.unit || 'পিস'} বিক্রয়ে +${money(unitProfit)} (${toBengaliNumerals(marginPercent)}% লাভ)`;
    } else {
      trendingReasonBn = `📦 নিয়মিত স্টক পণ্য (একক লাভ: ${money(unitProfit)})`;
    }

    const parsedSku = parseInt(String(product.sku || '').trim(), 10);
    const numericSku = !isNaN(parsedSku) ? parsedSku : idx + 1;

    return {
      product,
      numericSku,
      currentStock,
      reorderPoint,
      averageCost,
      sellingPrice,
      unitProfit,
      marginPercent,
      stockCostValue: currentStock * averageCost,
      stockRetailValue: currentStock * sellingPrice,
      totalSoldUnits: saleStats.units,
      totalSalesCount: saleStats.count,
      totalRevenue: saleStats.revenue,
      totalProfitEarned: saleStats.profit,
      stockStatus,
      isTrending,
      needsPurchase,
      recommendedBuyQty,
      estimatedPurchaseCost: recommendedBuyQty * averageCost,
      urgencyReasonBn,
      trendingReasonBn,
    };
  });
}

// Standalone 1-Click Direct PDF Generator for All Stock Products with Photos
export async function downloadFullStockCatalogWithPhotosPdf(params: {
  products: Product[];
  entries: Entry[];
  settings: BusinessSettings;
  defaultReorderPoint?: number;
  mode?: 'full_catalog' | 'market_restock_and_advisor';
  customBuyQtyMap?: Record<string, number>;
  selectedNewSuggestionIds?: string[];
}): Promise<void> {
  const {
    products,
    entries,
    settings,
    defaultReorderPoint = 5,
    mode = 'full_catalog',
    customBuyQtyMap = {},
    selectedNewSuggestionIds = ['trend-1', 'trend-2', 'trend-4'],
  } = params;

  const analyzed = analyzeProductsForMarket(products, entries, defaultReorderPoint).sort(
    (a, b) => a.numericSku - b.numericSku
  );

  const urgentRestock = analyzed.filter((i) => i.needsPurchase);

  const itemsToExport =
    mode === 'full_catalog'
      ? analyzed
      : urgentRestock.length > 0
      ? urgentRestock
      : analyzed;

  const getPlannedQty = (item: ProductMarketMetrics) => {
    if (customBuyQtyMap[item.product.id] !== undefined) {
      return customBuyQtyMap[item.product.id];
    }
    return item.needsPurchase ? item.recommendedBuyQty : 0;
  };

  // Preload safe base64 images for all products
  const imageMap: Record<string, string | null> = {};
  await Promise.all(
    itemsToExport.map(async (item) => {
      imageMap[item.product.id] = await resolveSafeImageDataUrl(item.product.imageUrl);
    })
  );

  const currentDateBn = new Date().toLocaleDateString('bn-BD', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalUnits = analyzed.reduce((sum, i) => sum + Math.max(0, i.currentStock), 0);
  const totalStockCost = analyzed.reduce((sum, i) => sum + Math.max(0, i.stockCostValue), 0);
  const totalStockRetail = analyzed.reduce((sum, i) => sum + Math.max(0, i.stockRetailValue), 0);
  const totalPotentialProfit = Math.max(0, totalStockRetail - totalStockCost);
  const plannedRestockBudget = analyzed.reduce(
    (sum, i) => sum + getPlannedQty(i) * i.averageCost,
    0
  );

  const FIRST_PAGE_ROWS = 11;
  const NEXT_PAGE_ROWS = 14;
  const pages: ProductMarketMetrics[][] = [];

  if (itemsToExport.length <= FIRST_PAGE_ROWS) {
    pages.push(itemsToExport);
  } else {
    pages.push(itemsToExport.slice(0, FIRST_PAGE_ROWS));
    let offset = FIRST_PAGE_ROWS;
    while (offset < itemsToExport.length) {
      pages.push(itemsToExport.slice(offset, offset + NEXT_PAGE_ROWS));
      offset += NEXT_PAGE_ROWS;
    }
  }

  const selectedNewSuggestions =
    mode === 'market_restock_and_advisor'
      ? NEW_TRENDING_SUGGESTIONS.filter((s) => selectedNewSuggestionIds.includes(s.id))
      : [];
  const storeTrendingItems = [...analyzed]
    .sort(
      (a, b) =>
        b.totalSoldUnits - a.totalSoldUnits ||
        b.totalProfitEarned - a.totalProfitEarned ||
        b.marginPercent - a.marginPercent
    )
    .slice(0, 6);

  const includeAdvisorPage =
    mode === 'market_restock_and_advisor' &&
    (selectedNewSuggestions.length > 0 || storeTrendingItems.length > 0);
  const totalPageCount = Math.max(1, pages.length + (includeAdvisorPage ? 1 : 0));

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageItems = pages[pageIdx];
    const isFirstPage = pageIdx === 0;
    const pageNumber = pageIdx + 1;

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px';
    container.style.minHeight = '1120px';
    container.style.padding = '28px 34px';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#0f172a';
    container.style.fontFamily = "'Hind Siliguri', 'Inter', system-ui, sans-serif";
    container.style.boxSizing = 'border-box';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.justifyContent = 'space-between';

    const reportBadgeTitle =
      mode === 'full_catalog'
        ? '📸 ছবিসহ সম্পূর্ণ স্টক ও বাজার কেনাকাটার তালিকা'
        : '🛒 আগামী বাজারের কেনাকাটা ও রি-স্টক তালিকা (ছবিসহ)';

    container.innerHTML = `
      <div>
        <!-- Page Header -->
        <div style="border-bottom: 2.5px solid #0d9488; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0 0 4px 0; font-size: 24px; color: #0f172a; font-weight: 800;">
              ${settings.name || 'Glowzaa Shop'}
            </h1>
            <p style="margin: 0; font-size: 12px; color: #475569;">
              ${settings.type || 'স্টক ইনভেন্টরি ও পাইকারি বাজার ক্রয় তালিকা'} • ${settings.address || 'বাংলাদেশ'}
            </p>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; background: #0f766e; color: #ffffff; padding: 5px 12px; border-radius: 6px; font-weight: 700; font-size: 13px; margin-bottom: 4px;">
              ${reportBadgeTitle}
            </div>
            <p style="margin: 0; font-size: 11.5px; color: #64748b;">
              তারিখ: ${currentDateBn} • পৃষ্ঠা: ${toBengaliNumerals(pageNumber)} / ${toBengaliNumerals(totalPageCount)}
            </p>
          </div>
        </div>

        ${
          isFirstPage
            ? `
          <!-- Summary Cards on Page 1 -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px;">
            <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #0f766e; font-weight: 700; display: block;">মোট তালিকাভুক্ত পণ্য</span>
              <b style="font-size: 17px; color: #115e59; display: block; margin-top: 2px;">
                ${toBengaliNumerals(itemsToExport.length)}টি পণ্য
              </b>
              <span style="font-size: 10.5px; color: #0d9488;">মোট মজুদ: ${toBengaliNumerals(totalUnits)} পিস</span>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #334155; font-weight: 700; display: block;">বর্তমান স্টকের ক্রয়মূল্য</span>
              <b style="font-size: 17px; color: #0f172a; display: block; margin-top: 2px;">
                ${money(totalStockCost)}
              </b>
              <span style="font-size: 10.5px; color: #64748b;">গড় ক্রয়মূল্য অনুযায়ী</span>
            </div>
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #047857; font-weight: 700; display: block;">সম্ভাব্য বিক্রয়মূল্য ও লাভ</span>
              <b style="font-size: 17px; color: #059669; display: block; margin-top: 2px;">
                ${money(totalStockRetail)}
              </b>
              <span style="font-size: 10.5px; color: #047857;">সম্ভাব্য লাভ: +${money(totalPotentialProfit)}</span>
            </div>
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #b45309; font-weight: 700; display: block;">বাজারে জরুরি কিনতে হবে</span>
              <b style="font-size: 17px; color: #d97706; display: block; margin-top: 2px;">
                ${toBengaliNumerals(urgentRestock.length)}টি পণ্য
              </b>
              <span style="font-size: 10.5px; color: #92400e;">আনুমানিক বাজেট: ${money(plannedRestockBudget)}</span>
            </div>
          </div>
        `
            : ''
        }

        <!-- Products Table with Photos -->
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
          <thead>
            <tr style="background: #0f172a; color: #ffffff; text-align: left;">
              <th style="padding: 8px 8px; width: 44px; text-align: center;">SKU</th>
              <th style="padding: 8px 8px; width: 58px; text-align: center;">ছবি</th>
              <th style="padding: 8px 10px;">পণ্যের নাম ও অবস্থা</th>
              <th style="padding: 8px 8px; text-align: right;">ক্রয়মূল্য</th>
              <th style="padding: 8px 8px; text-align: right;">বিক্রয়মূল্য</th>
              <th style="padding: 8px 8px; text-align: right;">একক লাভ</th>
              <th style="padding: 8px 8px; text-align: center;">বর্তমান স্টক</th>
              <th style="padding: 8px 10px; text-align: center; width: 128px; background: #115e59;">বাজারে কেনার পরিমাণ / টিক</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems
              .map((item, idx) => {
                const safeImg = imageMap[item.product.id];
                const plannedQty = getPlannedQty(item);
                const rowBg =
                  item.stockStatus === 'out'
                    ? '#fff1f2'
                    : item.stockStatus === 'low'
                    ? '#fffbeb'
                    : idx % 2 === 0
                    ? '#ffffff'
                    : '#f8fafc';

                const statusBadge =
                  item.stockStatus === 'out'
                    ? `<span style="display:inline-block; padding: 1px 6px; border-radius: 4px; background: #ffe4e6; color: #be123c; font-size: 10px; font-weight: 700;">স্টক শেষ (০)</span>`
                    : item.stockStatus === 'low'
                    ? `<span style="display:inline-block; padding: 1px 6px; border-radius: 4px; background: #fef3c7; color: #b45309; font-size: 10px; font-weight: 700;">কম স্টক</span>`
                    : `<span style="display:inline-block; padding: 1px 6px; border-radius: 4px; background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 700;">স্টকে আছে</span>`;

                return `
                  <tr style="border-bottom: 1px solid #cbd5e1; background: ${rowBg};">
                    <td style="padding: 6px; text-align: center; font-weight: 800; color: #0f766e; font-size: 13px;">
                      #${item.product.sku || item.numericSku}
                    </td>
                    <td style="padding: 5px; text-align: center;">
                      ${
                        safeImg
                          ? `<img src="${safeImg}" style="width: 46px; height: 46px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; display: block; margin: 0 auto;" />`
                          : `<div style="width: 46px; height: 46px; border-radius: 6px; background: #e2e8f0; color: #475569; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin: 0 auto; border: 1px dashed #94a3b8;">ছবি নেই</div>`
                      }
                    </td>
                    <td style="padding: 6px 10px;">
                      <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 2px;">
                        ${item.product.name}
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        ${statusBadge}
                        ${
                          item.totalSoldUnits > 0
                            ? `<span style="font-size: 10px; color: #0369a1; font-weight: 600;">বিক্রি: ${toBengaliNumerals(item.totalSoldUnits)} ${item.product.unit || 'পিস'}</span>`
                            : ''
                        }
                      </div>
                    </td>
                    <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #b45309; font-size: 12.5px;">
                      ${money(item.averageCost)}
                    </td>
                    <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #0f766e; font-size: 12.5px;">
                      ${money(item.sellingPrice)}
                    </td>
                    <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: ${
                      item.unitProfit >= 0 ? '#059669' : '#dc2626'
                    }; font-size: 12px;">
                      ${item.unitProfit >= 0 ? '+' : ''}${money(item.unitProfit)}
                      <div style="font-size: 9.5px; color: #64748b; font-weight: 500;">(${toBengaliNumerals(item.marginPercent)}%)</div>
                    </td>
                    <td style="padding: 6px 8px; text-align: center;">
                      <span style="font-size: 14px; font-weight: 800; color: ${
                        item.stockStatus === 'out'
                          ? '#be123c'
                          : item.stockStatus === 'low'
                          ? '#b45309'
                          : '#0f172a'
                      };">
                        ${toBengaliNumerals(item.currentStock)}
                      </span>
                      <span style="font-size: 11px; color: #475569; display: block;">${item.product.unit || 'পিস'}</span>
                    </td>
                    <td style="padding: 6px 8px; text-align: center; border-left: 1px dashed #94a3b8; background: rgba(240, 253, 250, 0.55);">
                      ${
                        plannedQty > 0
                          ? `<div style="font-weight: 800; color: #0f766e; font-size: 12.5px;">☐ ${toBengaliNumerals(plannedQty)} ${item.product.unit || 'পিস'} কিনুন</div>
                             <div style="font-size: 10px; color: #475569;">আনুমানিক: ${money(plannedQty * item.averageCost)}</div>`
                          : `<div style="color: #64748b; font-size: 11px;">☐ ______ ${item.product.unit || 'পিস'}</div>`
                      }
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Page Footer -->
      <div style="margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10.5px; color: #64748b;">
        <span>${settings.name || 'Glowzaa Shop'} • ছবিসহ সম্পূর্ণ স্টক ও বাজার কেনাকাটার গাইড</span>
        <span>পৃষ্ঠা ${toBengaliNumerals(pageNumber)} / ${toBengaliNumerals(totalPageCount)}</span>
      </div>
    `;

    document.body.appendChild(container);
    try {
      if (document.fonts) {
        await document.fonts.ready;
      }
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      if (pageIdx > 0) {
        pdf.addPage();
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    } finally {
      document.body.removeChild(container);
    }
  }

  if (includeAdvisorPage) {
    const advisorPageNum = totalPageCount;
    const advContainer = document.createElement('div');
    advContainer.style.position = 'fixed';
    advContainer.style.left = '-9999px';
    advContainer.style.top = '0';
    advContainer.style.width = '794px';
    advContainer.style.minHeight = '1120px';
    advContainer.style.padding = '28px 34px';
    advContainer.style.backgroundColor = '#ffffff';
    advContainer.style.color = '#0f172a';
    advContainer.style.fontFamily = "'Hind Siliguri', 'Inter', system-ui, sans-serif";
    advContainer.style.boxSizing = 'border-box';
    advContainer.style.display = 'flex';
    advContainer.style.flexDirection = 'column';
    advContainer.style.justifyContent = 'space-between';

    advContainer.innerHTML = `
      <div>
        <div style="border-bottom: 2.5px solid #7c3aed; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0 0 4px 0; font-size: 23px; color: #0f172a; font-weight: 800;">
              🔥 আগামী কেনাকাটা ও নতুন ট্রেন্ডিং পণ্যের পরামর্শ
            </h1>
            <p style="margin: 0; font-size: 12px; color: #475569;">
              ${settings.name || 'Glowzaa Shop'} • দোকানের বিক্রয় ডেটা ও বাজার চাহিদা বিশ্লেষণ
            </p>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; background: #7c3aed; color: #ffffff; padding: 5px 12px; border-radius: 6px; font-weight: 700; font-size: 12.5px; margin-bottom: 4px;">
              বাজার কেনাকাটা গাইডলাইন
            </div>
            <p style="margin: 0; font-size: 11px; color: #64748b;">
              তারিখ: ${currentDateBn} • পৃষ্ঠা: ${toBengaliNumerals(advisorPageNum)} / ${toBengaliNumerals(totalPageCount)}
            </p>
          </div>
        </div>

        <div style="margin-bottom: 18px;">
          <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #0f172a; border-left: 4px solid #0d9488; padding-left: 8px;">
            ১. আপনার দোকানের বর্তমান সবচেয়ে চলমান ও লাভজনক পণ্য (Top Trending in Shop)
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; border: 1px solid #cbd5e1;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1; color: #334155; text-align: left;">
                <th style="padding: 6px 8px;">SKU ও পণ্যের নাম</th>
                <th style="padding: 6px 8px; text-align: center;">মোট বিক্রি</th>
                <th style="padding: 6px 8px; text-align: right;">একক লাভ (%)</th>
                <th style="padding: 6px 8px; text-align: center;">বর্তমান স্টক</th>
                <th style="padding: 6px 8px;">পরামর্শ</th>
              </tr>
            </thead>
            <tbody>
              ${storeTrendingItems
                .map(
                  (item) => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px 8px; font-weight: 700;">#${item.product.sku || item.numericSku} — ${item.product.name}</td>
                    <td style="padding: 6px 8px; text-align: center; font-weight: 700; color: #0369a1;">
                      ${toBengaliNumerals(item.totalSoldUnits)} ${item.product.unit || 'পিস'}
                    </td>
                    <td style="padding: 6px 8px; text-align: right; color: #059669; font-weight: 700;">
                      +${money(item.unitProfit)} (${toBengaliNumerals(item.marginPercent)}%)
                    </td>
                    <td style="padding: 6px 8px; text-align: center; font-weight: 700;">
                      ${toBengaliNumerals(item.currentStock)} ${item.product.unit || 'পিস'}
                    </td>
                    <td style="padding: 6px 8px; font-size: 11px; color: #334155;">
                      ${item.trendingReasonBn}
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>

        <div>
          <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #0f172a; border-left: 4px solid #7c3aed; padding-left: 8px;">
            ২. আগামী বাজারে দোকানে নতুন যে ট্রেন্ডিং মালগুলো তুলতে পারেন (New Products to Buy)
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; border: 1px solid #cbd5e1;">
            <thead>
              <tr style="background: #f5f3ff; border-bottom: 1.5px solid #ddd6fe; color: #4c1d95; text-align: left;">
                <th style="padding: 7px 8px;">নতুন ট্রেন্ডিং পণ্যের নাম ও ধরন</th>
                <th style="padding: 7px 8px;">পাইকারি ক্রয়মূল্য</th>
                <th style="padding: 7px 8px;">খুচরা বিক্রয়মূল্য</th>
                <th style="padding: 7px 8px;">প্রস্তাবিত পরিমাণ</th>
                <th style="padding: 7px 8px;">কেন কিনবেন ও বাজার টিপস</th>
              </tr>
            </thead>
            <tbody>
              ${(selectedNewSuggestions.length > 0 ? selectedNewSuggestions : NEW_TRENDING_SUGGESTIONS.slice(0, 6))
                .map(
                  (s) => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 7px 8px;">
                      <div style="font-weight: 700; color: #0f172a;">☐ ${s.name}</div>
                      <div style="font-size: 10px; color: #6d28d9; font-weight: 600;">${s.categoryLabelBn} • ${s.demandLevelBn}</div>
                    </td>
                    <td style="padding: 7px 8px; font-weight: 700; color: #b45309;">${s.wholesalePriceRangeBn}</td>
                    <td style="padding: 7px 8px; font-weight: 700; color: #059669;">
                      ${s.suggestedRetailPriceBn}
                      <div style="font-size: 9.5px; color: #64748b;">(~${toBengaliNumerals(s.expectedMarginPercent)}% লাভ)</div>
                    </td>
                    <td style="padding: 7px 8px; font-weight: 700; color: #0f766e;">${s.starterQtyBn}</td>
                    <td style="padding: 7px 8px; font-size: 10.5px; color: #334155;">
                      <div>${s.whyTrendingBn}</div>
                      <div style="color: #0f766e; font-weight: 600; margin-top: 2px;">💡 টিপস: ${s.marketTipBn}</div>
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10.5px; color: #64748b;">
        <span>${settings.name || 'Glowzaa Shop'} • আগামী কেনাকাটা ও ট্রেন্ডিং পণ্যের পরামর্শ</span>
        <span>পৃষ্ঠা ${toBengaliNumerals(advisorPageNum)} / ${toBengaliNumerals(totalPageCount)}</span>
      </div>
    `;

    document.body.appendChild(advContainer);
    try {
      if (document.fonts) {
        await document.fonts.ready;
      }
      const canvas = await html2canvas(advContainer, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    } finally {
      document.body.removeChild(advContainer);
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const fileName =
    mode === 'full_catalog'
      ? `Glowzaa-Full-Stock-Catalog-With-Photos-${todayIso}.pdf`
      : `Glowzaa-Next-Market-Shopping-And-Trending-Guide-${todayIso}.pdf`;

  pdf.save(fileName);
}

interface StockCatalogAndMarketAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  entries: Entry[];
  settings: BusinessSettings;
  defaultReorderPoint?: number;
  onQuickAddSuggestedProduct?: (suggestion: NewTrendingProductSuggestion) => void;
}

export default function StockCatalogAndMarketAdvisorModal({
  isOpen,
  onClose,
  products,
  entries,
  settings,
  defaultReorderPoint = 5,
  onQuickAddSuggestedProduct,
}: StockCatalogAndMarketAdvisorModalProps) {
  const [customBuyQtyMap, setCustomBuyQtyMap] = useState<Record<string, number>>({});
  const [selectedNewSuggestionIds, setSelectedNewSuggestionIds] = useState<string[]>([
    'trend-1',
    'trend-2',
    'trend-4',
  ]);
  const [newCategoryFilter, setNewCategoryFilter] = useState<
    'all' | 'hair_fashion' | 'jewelry' | 'cosmetics' | 'gift_combo'
  >('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const analyzedProducts = useMemo(
    () => analyzeProductsForMarket(products, entries, defaultReorderPoint),
    [products, entries, defaultReorderPoint]
  );

  const getPlannedBuyQty = (item: ProductMarketMetrics): number => {
    if (customBuyQtyMap[item.product.id] !== undefined) {
      return customBuyQtyMap[item.product.id];
    }
    return item.needsPurchase ? item.recommendedBuyQty : 0;
  };

  const urgentRestockItems = useMemo(() => {
    return [...analyzedProducts]
      .filter((i) => i.needsPurchase)
      .sort((a, b) => {
        if (a.stockStatus === 'out' && b.stockStatus !== 'out') return -1;
        if (a.stockStatus !== 'out' && b.stockStatus === 'out') return 1;
        return a.currentStock - b.currentStock || b.totalSoldUnits - a.totalSoldUnits;
      });
  }, [analyzedProducts]);

  const storeTrendingItems = useMemo(() => {
    return [...analyzedProducts]
      .sort(
        (a, b) =>
          b.totalSoldUnits - a.totalSoldUnits ||
          b.totalProfitEarned - a.totalProfitEarned ||
          b.marginPercent - a.marginPercent
      )
      .slice(0, 8);
  }, [analyzedProducts]);

  const filteredNewSuggestions = useMemo(() => {
    if (newCategoryFilter === 'all') return NEW_TRENDING_SUGGESTIONS;
    return NEW_TRENDING_SUGGESTIONS.filter((s) => s.category === newCategoryFilter);
  }, [newCategoryFilter]);

  const summaryStats = useMemo(() => {
    const restockCount = urgentRestockItems.length;
    const plannedRestockBudget = analyzedProducts.reduce((sum, i) => {
      const qty = getPlannedBuyQty(i);
      return sum + qty * i.averageCost;
    }, 0);

    const selectedNewItems = NEW_TRENDING_SUGGESTIONS.filter((s) =>
      selectedNewSuggestionIds.includes(s.id)
    );
    const newItemsBudget = selectedNewItems.reduce(
      (sum, s) => sum + s.recommendedQty * s.estimatedUnitCost,
      0
    );

    return {
      restockCount,
      plannedRestockBudget,
      newItemsBudget,
      grandMarketBudget: plannedRestockBudget + newItemsBudget,
    };
  }, [analyzedProducts, urgentRestockItems, customBuyQtyMap, selectedNewSuggestionIds]);

  const toggleNewSuggestion = (id: string) => {
    setSelectedNewSuggestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDownloadAdvisorPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await downloadFullStockCatalogWithPhotosPdf({
        products,
        entries,
        settings,
        defaultReorderPoint,
        mode: 'market_restock_and_advisor',
        customBuyQtyMap,
        selectedNewSuggestionIds,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isGeneratingPdf) onClose();
      }}
    >
      <div
        className="modal profit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-advisor-modal-title"
      >
        {/* Native Header Matching ProductProfitabilityModal */}
        <div className="profit-modal-head">
          <div className="profit-modal-title-group">
            <span
              className="profit-modal-icon"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#ffffff',
              }}
            >
              <Flame size={17} />
            </span>
            <div className="profit-modal-title-text">
              <h2 id="market-advisor-modal-title">
                আগামী কেনাকাটা ও ট্রেন্ডিং পণ্যের বিস্তারিত পরামর্শ
              </h2>
              <p>
                দোকানে কোন মাল শেষ হয়েছে, কোনগুলো বেশি চলছে এবং আগামী বাজারে নতুন কী কী ট্রেন্ডিং মাল তুলবেন
              </p>
            </div>
          </div>

          <div className="profit-modal-head-actions">
            <button
              type="button"
              className="profit-head-action-btn active"
              onClick={handleDownloadAdvisorPdf}
              disabled={isGeneratingPdf}
              style={{
                background: 'linear-gradient(135deg, #0f766e, #059669)',
                borderColor: '#0f766e',
                color: '#ffffff',
                fontWeight: 700,
              }}
            >
              <Download size={14} />
              <span>{isGeneratingPdf ? 'প্রস্তুত হচ্ছে…' : 'পরামর্শসহ PDF'}</span>
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

        {/* Scrollable Body */}
        <div className="profit-modal-body" style={{ padding: '14px 16px 22px' }}>
          {/* Top 3 KPI Summary Cards */}
          <div className="profit-kpi-grid" style={{ marginBottom: '16px' }}>
            <div className="profit-kpi-card tone-amber">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">জরুরি রি-স্টক পণ্য</span>
                <span className="profit-kpi-tag tag-amber">স্টক কম / শেষ</span>
              </div>
              <strong className="profit-kpi-val">
                {toBengaliNumerals(summaryStats.restockCount)}টি পণ্য
              </strong>
              <span className="profit-kpi-sub">
                রি-স্টক বাজেট: <b>{money(summaryStats.plannedRestockBudget)}</b>
              </span>
            </div>

            <div className="profit-kpi-card tone-emerald">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">নতুন ট্রেন্ডিং আইটেম পরামর্শ</span>
                <span className="profit-kpi-tag tag-emerald">হাই-ডিমান্ড</span>
              </div>
              <strong className="profit-kpi-val">
                {toBengaliNumerals(NEW_TRENDING_SUGGESTIONS.length)}টি নতুন আইটেম
              </strong>
              <span className="profit-kpi-sub">
                নির্বাচিত নতুন বাজেট: <b>{money(summaryStats.newItemsBudget)}</b>
              </span>
            </div>

            <div className="profit-kpi-card">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">আগামী বাজারের মোট সম্ভাব্য বাজেট</span>
              </div>
              <strong className="profit-kpi-val" style={{ color: '#0f766e' }}>
                {money(summaryStats.grandMarketBudget)}
              </strong>
              <span className="profit-kpi-sub">
                রি-স্টক + নতুন ট্রেন্ডিং পণ্যসহ মোট হিসাব
              </span>
            </div>
          </div>

          {/* SECTION 1: URGENT RESTOCK FROM CURRENT INVENTORY */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #fde68a',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '10px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#fef3c7',
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    ১. আগামী বাজারে দোকানে যে মালগুলো জরুরি কিনতে হবে (রি-স্টক তালিকা)
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    স্টক শেষ হওয়া ও কম স্টকের পণ্যের তালিকা এবং প্রস্তাবিত কেনার পরিমাণ
                  </p>
                </div>
              </div>
              <span
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  color: '#92400e',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                রি-স্টক বাজেট: {money(summaryStats.plannedRestockBudget)}
              </span>
            </div>

            {urgentRestockItems.length === 0 ? (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#065f46',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={18} />
                <span>
                  আপনার দোকানের বর্তমান সব পণ্যের পর্যাপ্ত স্টক রয়েছে! নিচে নতুন ট্রেন্ডিং পণ্যের পরামর্শ দেখুন।
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '10px',
                }}
              >
                {urgentRestockItems.map((item) => {
                  const plannedQty = getPlannedBuyQty(item);
                  const isOut = item.stockStatus === 'out';
                  return (
                    <div
                      key={item.product.id}
                      style={{
                        border: isOut ? '1.5px solid #fecdd3' : '1.5px solid #fde68a',
                        background: isOut ? '#fff1f2' : '#fffbeb',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                      }}
                    >
                      {item.product.imageUrl ? (
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '10px',
                            objectFit: 'cover',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            border: '1px dashed #cbd5e1',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Package size={20} />
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '6px',
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                background: '#0f172a',
                                color: '#ffffff',
                                padding: '1px 6px',
                                borderRadius: '5px',
                                fontSize: '10.5px',
                                marginRight: '5px',
                              }}
                            >
                              SKU #{item.product.sku || item.numericSku}
                            </span>
                            {item.product.name}
                          </div>
                          <span
                            style={{
                              background: isOut ? '#e11d48' : '#d97706',
                              color: '#ffffff',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            স্টক: {toBengaliNumerals(item.currentStock)} {item.product.unit || 'পিস'}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: isOut ? '#be123c' : '#b45309',
                            marginTop: '4px',
                          }}
                        >
                          {item.urgencyReasonBn}
                        </div>

                        <div
                          style={{
                            marginTop: '8px',
                            paddingTop: '6px',
                            borderTop: '1px dashed rgba(148, 163, 184, 0.4)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '6px',
                            fontSize: '11.5px',
                          }}
                        >
                          <span style={{ color: '#334155' }}>
                            ক্রয়: <b>{money(item.averageCost)}</b> • বিক্রয়:{' '}
                            <b style={{ color: '#0f766e' }}>{money(item.sellingPrice)}</b>
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 800, color: '#0f766e' }}>কিনবেন:</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={plannedQty}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value || '0', 10) || 0);
                                setCustomBuyQtyMap((prev) => ({
                                  ...prev,
                                  [item.product.id]: val,
                                }));
                              }}
                              style={{
                                width: '54px',
                                padding: '2px 6px',
                                borderRadius: '6px',
                                border: '1.5px solid #0d9488',
                                background: '#ffffff',
                                textAlign: 'center',
                                fontWeight: 800,
                                fontSize: '12px',
                                color: '#0f172a',
                              }}
                            />
                            <span style={{ fontWeight: 700, color: '#92400e' }}>
                              ({money(plannedQty * item.averageCost)})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: CURRENT STORE TRENDING & HIGH PROFIT PRODUCTS */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #99f6e4',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '10px',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#ccfbf1',
                  color: '#0f766e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <TrendingUp size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  ২. আপনার দোকানের বর্তমান ট্রেন্ডিং ও সবচেয়ে লাভজনক পণ্য
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  দোকানের বিক্রয় রেকর্ড ও লাভের হার (Margin %) অনুযায়ী সেরা পারফর্মিং পণ্য
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '10px',
              }}
            >
              {storeTrendingItems.slice(0, 6).map((item, idx) => (
                <div
                  key={item.product.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    padding: '11px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <span
                        style={{
                          background: '#0f766e',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                        }}
                      >
                        🔥 টপ #{toBengaliNumerals(idx + 1)} • SKU #{item.product.sku || item.numericSku}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>
                        +{money(item.unitProfit)} / {item.product.unit || 'পিস'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {item.product.imageUrl ? (
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '8px',
                            objectFit: 'cover',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '8px',
                            background: '#ffffff',
                            border: '1px dashed #cbd5e1',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <ImageIcon size={18} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>
                          {item.product.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                          ক্রয়: {money(item.averageCost)} → বিক্রয়: {money(item.sellingPrice)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: '8px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '6px 8px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: '#334155',
                      }}
                    >
                      {item.trendingReasonBn}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: '#475569' }}>
                      বর্তমান স্টক: <b style={{ color: '#0f172a' }}>{toBengaliNumerals(item.currentStock)} {item.product.unit || 'পিস'}</b>
                    </span>
                    <span style={{ color: '#0f766e' }}>
                      লাভের হার: {toBengaliNumerals(item.marginPercent)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 3: NEW TRENDING PRODUCTS TO ADD IN NEXT MARKET TRIP */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #ddd6fe',
              borderRadius: '14px',
              padding: '14px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '10px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#ede9fe',
                    color: '#6d28d9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    ৩. আগামী কেনাকাটায় দোকানে নতুন কী কী ট্রেন্ডিং মাল তুলতে পারেন (বিস্তারিত পরামর্শ)
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    আপনার দোকানের কাস্টমারদের পছন্দ ও বর্তমান বাজারের চাহিদা অনুযায়ী সবচেয়ে লাভজনক নতুন আইটেম
                  </p>
                </div>
              </div>

              {/* Category Filter Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { id: 'all', label: 'সব নতুন ট্রেন্ডিং' },
                  { id: 'hair_fashion', label: 'হেয়ার ও ক্লিপ' },
                  { id: 'jewelry', label: 'জুয়েলারি ও রিং' },
                  { id: 'cosmetics', label: 'কসমেটিকস ও মিরর' },
                  { id: 'gift_combo', label: 'গিফট কম্বো' },
                ].map((cat) => {
                  const active = newCategoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setNewCategoryFilter(cat.id as any)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        border: active ? '1px solid #6d28d9' : '1px solid #ddd6fe',
                        background: active ? '#6d28d9' : '#f5f3ff',
                        color: active ? '#ffffff' : '#5b21b6',
                        cursor: 'pointer',
                      }}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '12px',
              }}
            >
              {filteredNewSuggestions.map((s) => {
                const isSelected = selectedNewSuggestionIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    style={{
                      border: isSelected ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                      background: isSelected ? '#faf5ff' : '#ffffff',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '6px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            background: '#ede9fe',
                            color: '#5b21b6',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        >
                          {s.categoryLabelBn}
                        </span>
                        <span
                          style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        >
                          {s.demandLevelBn}
                        </span>
                      </div>

                      <h4
                        style={{
                          margin: '8px 0 4px',
                          fontSize: '14.5px',
                          fontWeight: 800,
                          color: '#0f172a',
                        }}
                      >
                        {s.name}
                      </h4>

                      <p
                        style={{
                          margin: '0 0 8px',
                          fontSize: '12px',
                          lineHeight: 1.5,
                          color: '#334155',
                        }}
                      >
                        {s.whyTrendingBn}
                      </p>

                      <div
                        style={{
                          background: '#f0fdfa',
                          border: '1px solid #99f6e4',
                          borderRadius: '8px',
                          padding: '7px 10px',
                          fontSize: '11.5px',
                          color: '#115e59',
                          marginBottom: '10px',
                        }}
                      >
                        💡 <b>বাজার টিপস:</b> {s.marketTipBn}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '6px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '8px',
                          textAlign: 'center',
                          fontSize: '11px',
                        }}
                      >
                        <div>
                          <span style={{ display: 'block', color: '#64748b' }}>পাইকারি ক্রয়মূল্য</span>
                          <strong style={{ color: '#b45309' }}>{s.wholesalePriceRangeBn}</strong>
                        </div>
                        <div>
                          <span style={{ display: 'block', color: '#64748b' }}>খুচরা বিক্রয়মূল্য</span>
                          <strong style={{ color: '#059669' }}>{s.suggestedRetailPriceBn}</strong>
                        </div>
                        <div>
                          <span style={{ display: 'block', color: '#64748b' }}>প্রস্তাবিত শুরু</span>
                          <strong style={{ color: '#6d28d9' }}>{s.starterQtyBn}</strong>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '6px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleNewSuggestion(s.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          border: isSelected ? '1px solid #6d28d9' : '1px solid #cbd5e1',
                          background: isSelected ? '#6d28d9' : '#f1f5f9',
                          color: isSelected ? '#ffffff' : '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? <Check size={14} /> : <Plus size={14} />}
                        <span>{isSelected ? 'বাজার তালিকায় যুক্ত' : 'বাজার তালিকায় নিন'}</span>
                      </button>

                      {onQuickAddSuggestedProduct && (
                        <button
                          type="button"
                          onClick={() => onQuickAddSuggestedProduct(s)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            border: '1px solid #99f6e4',
                            background: '#f0fdfa',
                            color: '#0f766e',
                            cursor: 'pointer',
                          }}
                        >
                          <ArrowUpRight size={14} />
                          <span>স্টকে যোগ করুন</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
