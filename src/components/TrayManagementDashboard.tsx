import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Lock,
  Moon,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import type { Product, TrayRefillLogItem } from '../types';
import { dateLabel, formatBengaliDateTime, money, toBengaliNumerals } from '../accounting';
import { getEffectiveProductSku } from './CameraAutoSaleModal';
import {
  loadPersistedTrayLogs,
  savePersistedTrayLogs,
  TRAY_LOGS_UPDATED_EVENT,
} from './TrayStockRefillModal';

interface TrayManagementDashboardProps {
  products: Product[];
  currentAdminUsername: 'Rakib' | 'Limon' | string;
  currentAdminDisplayName?: string;
  isEmployee?: boolean;
  onOpenScannerModal: (initialTab?: 'scan_refill' | 'tray_board' | 'tray_ledger') => void;
  onUpdateProductTrayAndStock: (
    product: Product,
    patch: {
      currentStock: number;
      trayStock: number;
      trayCapacity: number;
      totalTrayRefilled: number;
      totalTraySold: number;
      totalTraySoldAmount?: number;
      lastTrayUpdatedBy?: 'Rakib' | 'Limon' | string;
      lastTrayUpdatedAt?: string;
    },
    logEntry: TrayRefillLogItem
  ) => Promise<void>;
  onRecordOptionalCashSale?: (params: {
    product: Product;
    quantity: number;
    customTotalAmount?: number;
    skuCode: string;
    actor: 'Rakib' | 'Limon' | string;
  }) => Promise<string | void>;
}

const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

const yesterdayYmd = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
};

// Convert Bengali numerals (০-৯) to English numerals (0-9)
export function toEnglishDigits(input: string): string {
  return String(input || '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
}

/**
 * Exact number search for Tray / SKU:
 * When searching "5", "৫", "#5", "ট্রে ৫", "sku 5", it ONLY matches Tray #5 or SKU #5,
 * and NEVER matches 15, 25, 35, etc.!
 */
export function matchesTrayOrProductSearch(
  rawQuery: string,
  trayNumber: number,
  skuCode: string,
  productName: string,
  extraNotes = ''
): boolean {
  const trimmed = rawQuery.trim();
  if (!trimmed) return true;

  const normEn = toEnglishDigits(trimmed).toLowerCase().trim();

  // Check if the query is a Tray/SKU number search (e.g., "5", "৫", "#5", "ট্রে ৫", "tray 5", "sku 5", "ট্রে #৫")
  const cleanedNumberQuery = normEn
    .replace(/^(ট্রে|tray|sku|নং|নাম্বার|no|id|#|\s|:|-)+/gi, '')
    .replace(/(নং|পিস|#|\s)+$/gi, '')
    .trim();

  if (/^\d+$/.test(cleanedNumberQuery)) {
    const targetNum = Number(cleanedNumberQuery);
    const skuNorm = toEnglishDigits(skuCode).replace(/^#/, '').trim().toLowerCase();
    const skuNum = /^\d+$/.test(skuNorm) ? Number(skuNorm) : NaN;
    return trayNumber === targetNum || skuNorm === cleanedNumberQuery || skuNum === targetNum;
  }

  // Otherwise text search on product name or notes
  const nameNorm = toEnglishDigits(productName || '').toLowerCase();
  const notesNorm = toEnglishDigits(extraNotes || '').toLowerCase();
  const skuFullNorm = toEnglishDigits(skuCode || '').toLowerCase();

  return (
    nameNorm.includes(normEn) ||
    skuFullNorm === normEn ||
    (extraNotes ? notesNorm.includes(normEn) : false)
  );
}

export default function TrayManagementDashboard({
  products,
  currentAdminUsername,
  currentAdminDisplayName,
  isEmployee = false,
  onOpenScannerModal,
  onUpdateProductTrayAndStock,
  onRecordOptionalCashSale,
}: TrayManagementDashboardProps) {
  const [trayLogs, setTrayLogs] = useState<TrayRefillLogItem[]>(() => loadPersistedTrayLogs());

  // STRICT PROFILE LOCK: Entry maker is strictly locked to the logged-in profile!
  // Neither Rakib, Limon, nor any Employee can make or remove entries under someone else's profile.
  const lockedOperator: string = String(currentAdminUsername || 'Rakib').trim() || 'Rakib';
  const formatActorLabel = (actorName?: string) => {
    if (!actorName) return 'অজানা';
    if (actorName === 'Rakib') return 'রাকিব';
    if (actorName === 'Limon') return 'লিমন';
    if (actorName === lockedOperator && currentAdminDisplayName) return currentAdminDisplayName;
    return actorName;
  };
  const lockedOperatorNameBn =
    lockedOperator === 'Rakib'
      ? 'রাকিব (Rakib)'
      : lockedOperator === 'Limon'
      ? 'লিমন (Limon)'
      : currentAdminDisplayName
      ? `${currentAdminDisplayName} (${lockedOperator})`
      : lockedOperator;

  const [syncWithMainSalesLedger, setSyncWithMainSalesLedger] = useState<boolean>(false);

  // Filters & Layout View
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateScope, setDateScope] = useState<'today' | 'yesterday' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>(() => todayYmd());
  const [trayStatusFilter, setTrayStatusFilter] = useState<
    'all' | 'has_stock_now' | 'needs_refill' | 'refilled_today' | 'sold_today'
  >('all');
  const [operatorFilter, setOperatorFilter] = useState<'all' | 'Rakib' | 'Limon' | 'mine'>('all');
  const [displayLayout, setDisplayLayout] = useState<'cards' | 'table'>('cards');

  // Shop Closing / Empty All Trays Drawer State
  const [showShopClosePanel, setShowShopClosePanel] = useState<boolean>(false);
  const [shopCloseMode, setShopCloseMode] = useState<'return_to_main_stock' | 'zero_only'>(
    'return_to_main_stock'
  );
  const [isClosingAllTrays, setIsClosingAllTrays] = useState<boolean>(false);

  // Per-tray interactive inputs
  const [refillQtyInputs, setRefillQtyInputs] = useState<Record<string, string>>({});
  const [removeWrongQtyInputs, setRemoveWrongQtyInputs] = useState<Record<string, string>>({});
  const [saleQtyInputs, setSaleQtyInputs] = useState<Record<string, string>>({});
  const [saleTotalPriceInputs, setSaleTotalPriceInputs] = useState<Record<string, string>>({});
  const [capacityInputs, setCapacityInputs] = useState<Record<string, string>>({});
  const [expandedTrayId, setExpandedTrayId] = useState<string | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string>('');
  const [bannerTone, setBannerTone] = useState<'success' | 'danger'>('success');

  // History log filters
  const [logActionFilter, setLogActionFilter] = useState<
    'all' | 'refill_only' | 'sale_only' | 'return_only'
  >('all');

  useEffect(() => {
    const syncLogs = () => setTrayLogs(loadPersistedTrayLogs());
    window.addEventListener(TRAY_LOGS_UPDATED_EVENT, syncLogs);
    window.addEventListener('storage', syncLogs);
    return () => {
      window.removeEventListener(TRAY_LOGS_UPDATED_EVENT, syncLogs);
      window.removeEventListener('storage', syncLogs);
    };
  }, []);

  const showNotice = (msg: string, tone: 'success' | 'danger' = 'success') => {
    setBannerTone(tone);
    setBannerNotice(msg);
  };

  const targetDateStr = useMemo(() => {
    if (dateScope === 'today') return todayYmd();
    if (dateScope === 'yesterday') return yesterdayYmd();
    if (dateScope === 'custom') return customDate || todayYmd();
    return 'all';
  }, [dateScope, customDate]);

  const targetDateShortLabel = useMemo(() => {
    if (dateScope === 'today') return 'আজ';
    if (dateScope === 'yesterday') return 'গতকাল';
    if (dateScope === 'custom') return dateLabel(customDate || todayYmd());
    return 'সর্বমোট';
  }, [dateScope, customDate]);

  // Enrich each product with detailed per-tray stats
  const trayRows = useMemo(() => {
    return products.map((product, index) => {
      const skuCode = getEffectiveProductSku(product, index);
      const trayNumber = index + 1;
      const currentTrayStock = Math.max(0, Number(product.trayStock || 0));
      // 0 means Flexible / Unlimited capacity ("ইচ্ছামতো ধারণক্ষমতা")
      const rawCapacity = Number(product.trayCapacity ?? 0);
      const hasFixedCapacity = rawCapacity > 0;
      const trayCapacity = hasFixedCapacity ? rawCapacity : 0;
      const emptySlots = hasFixedCapacity ? Math.max(0, trayCapacity - currentTrayStock) : 0;

      const mainStock = Math.max(0, Number(product.currentStock || 0));
      const unitCost = Math.max(0, Number(product.averageCost || 0));
      const unitPrice = Math.max(0, Number(product.sellingPrice || 0));

      const prodLogs = trayLogs.filter((l) => l.productId === product.id);
      const scopedLogs =
        targetDateStr === 'all' ? prodLogs : prodLogs.filter((l) => l.date === targetDateStr);

      // Selected day's refills into tray
      const scopedRefillLogs = scopedLogs.filter(
        (l) => l.actionType === 'scan_refill' || l.actionType === 'tray_setup'
      );
      const todayRefilledQty = scopedRefillLogs.reduce((s, l) => s + Number(l.quantity || 0), 0);
      const todayRefilledSellVal = scopedRefillLogs.reduce(
        (s, l) => s + Number(l.totalSellVal || l.quantity * unitPrice || 0),
        0
      );
      const todayRefilledByRakib = scopedRefillLogs
        .filter((l) => l.actor === 'Rakib')
        .reduce((s, l) => s + Number(l.quantity || 0), 0);
      const todayRefilledByLimon = scopedRefillLogs
        .filter((l) => l.actor === 'Limon')
        .reduce((s, l) => s + Number(l.quantity || 0), 0);

      // Selected day's sales from tray
      const scopedSaleLogs = scopedLogs.filter((l) => l.actionType === 'tray_sale');
      const todaySoldQty = scopedSaleLogs.reduce((s, l) => s + Number(l.quantity || 0), 0);
      const todaySoldRevenue = scopedSaleLogs.reduce(
        (s, l) => s + Number(l.totalSellVal || l.quantity * unitPrice || 0),
        0
      );
      const todaySoldProfit = scopedSaleLogs.reduce(
        (s, l) =>
          s +
          Number(
            l.expectedProfit !== undefined
              ? l.expectedProfit
              : (l.totalSellVal || l.quantity * unitPrice) -
                  (l.totalCostVal || l.quantity * unitCost)
          ),
        0
      );
      const todaySoldByRakib = scopedSaleLogs
        .filter((l) => l.actor === 'Rakib')
        .reduce((s, l) => s + Number(l.quantity || 0), 0);
      const todaySoldRevenueByRakib = scopedSaleLogs
        .filter((l) => l.actor === 'Rakib')
        .reduce((s, l) => s + Number(l.totalSellVal || 0), 0);
      const todaySoldByLimon = scopedSaleLogs
        .filter((l) => l.actor === 'Limon')
        .reduce((s, l) => s + Number(l.quantity || 0), 0);
      const todaySoldRevenueByLimon = scopedSaleLogs
        .filter((l) => l.actor === 'Limon')
        .reduce((s, l) => s + Number(l.totalSellVal || 0), 0);

      // All-time stats
      const allTimeRefillLogs = prodLogs.filter(
        (l) => l.actionType === 'scan_refill' || l.actionType === 'tray_setup'
      );
      const allTimeSaleLogs = prodLogs.filter((l) => l.actionType === 'tray_sale');

      const totalRefilledQty = Math.max(
        Number(product.totalTrayRefilled || 0),
        allTimeRefillLogs.reduce((s, l) => s + Number(l.quantity || 0), 0)
      );
      const totalSoldQty = Math.max(
        Number(product.totalTraySold || 0),
        allTimeSaleLogs.reduce((s, l) => s + Number(l.quantity || 0), 0)
      );
      const loggedSoldRevenue = allTimeSaleLogs.reduce(
        (s, l) => s + Number(l.totalSellVal || l.quantity * unitPrice || 0),
        0
      );
      const totalSoldRevenue = Math.max(
        Number(product.totalTraySoldAmount || 0),
        loggedSoldRevenue > 0 ? loggedSoldRevenue : totalSoldQty * unitPrice
      );

      const rakibTotalPlacedQty = allTimeRefillLogs
        .filter((l) => l.actor === 'Rakib')
        .reduce((s, l) => s + Number(l.quantity || 0), 0);
      const limonTotalPlacedQty = allTimeRefillLogs
        .filter((l) => l.actor === 'Limon')
        .reduce((s, l) => s + Number(l.quantity || 0), 0);

      const latestLog = prodLogs[0] || null;
      const myLatestLog = prodLogs.find((l) => l.actor === lockedOperator) || null;
      const lastUpdatedBy: 'Rakib' | 'Limon' | string | null =
        latestLog?.actor || product.lastTrayUpdatedBy || null;
      const lastUpdatedAt: string = latestLog?.timestamp || product.lastTrayUpdatedAt || '';

      const isActiveTray =
        currentTrayStock > 0 ||
        totalRefilledQty > 0 ||
        totalSoldQty > 0 ||
        prodLogs.length > 0;

      const currentTraySellValue = Math.round(currentTrayStock * unitPrice * 100) / 100;
      const mainStockCostValue = Math.round(mainStock * unitCost * 100) / 100;
      const mainStockSellValue = Math.round(mainStock * unitPrice * 100) / 100;

      return {
        product,
        trayNumber,
        skuCode,
        currentTrayStock,
        hasFixedCapacity,
        trayCapacity,
        emptySlots,
        mainStock,
        unitCost,
        unitPrice,
        currentTraySellValue,
        mainStockCostValue,
        mainStockSellValue,
        todayRefilledQty,
        todayRefilledSellVal,
        todayRefilledByRakib,
        todayRefilledByLimon,
        todaySoldQty,
        todaySoldRevenue,
        todaySoldProfit,
        todaySoldByRakib,
        todaySoldRevenueByRakib,
        todaySoldByLimon,
        todaySoldRevenueByLimon,
        totalRefilledQty,
        totalSoldQty,
        totalSoldRevenue,
        rakibTotalPlacedQty,
        limonTotalPlacedQty,
        lastUpdatedBy,
        lastUpdatedAt,
        latestLog,
        myLatestLog,
        isActiveTray,
        prodLogs,
      };
    });
  }, [products, trayLogs, targetDateStr, lockedOperator]);

  // Trays that currently have stock (> 0 pieces)
  const traysWithCurrentStock = useMemo(
    () => trayRows.filter((r) => r.currentTrayStock > 0),
    [trayRows]
  );

  // Overall Summary KPIs
  const summary = useMemo(() => {
    const totalTraysCount = trayRows.length;
    const activeTraysCount = trayRows.filter((r) => r.isActiveTray).length;
    const traysWithStockCount = traysWithCurrentStock.length;
    const traysNeedingRefillCount = trayRows.filter(
      (r) => r.hasFixedCapacity && r.emptySlots > 0
    ).length;

    const currentTotalOnTrays = trayRows.reduce((s, r) => s + r.currentTrayStock, 0);
    const currentTotalTraySellValue = trayRows.reduce((s, r) => s + r.currentTraySellValue, 0);

    const remainingMainStockTotal = trayRows.reduce((s, r) => s + r.mainStock, 0);
    const remainingMainStockCostVal = trayRows.reduce((s, r) => s + r.mainStockCostValue, 0);
    const remainingMainStockSellVal = trayRows.reduce((s, r) => s + r.mainStockSellValue, 0);

    const todayTotalRefilledQty = trayRows.reduce((s, r) => s + r.todayRefilledQty, 0);
    const todayTotalRefilledSellVal = trayRows.reduce((s, r) => s + r.todayRefilledSellVal, 0);
    const todayRefilledTraysCount = trayRows.filter((r) => r.todayRefilledQty > 0).length;
    const todayRefilledByRakib = trayRows.reduce((s, r) => s + r.todayRefilledByRakib, 0);
    const todayRefilledByLimon = trayRows.reduce((s, r) => s + r.todayRefilledByLimon, 0);

    const todayTotalSoldQty = trayRows.reduce((s, r) => s + r.todaySoldQty, 0);
    const todayTotalSoldRevenue = trayRows.reduce((s, r) => s + r.todaySoldRevenue, 0);
    const todayTotalSoldProfit = trayRows.reduce((s, r) => s + r.todaySoldProfit, 0);
    const todaySoldTraysCount = trayRows.filter((r) => r.todaySoldQty > 0).length;
    const todaySoldByRakib = trayRows.reduce((s, r) => s + r.todaySoldByRakib, 0);
    const todaySoldRevenueByRakib = trayRows.reduce((s, r) => s + r.todaySoldRevenueByRakib, 0);
    const todaySoldByLimon = trayRows.reduce((s, r) => s + r.todaySoldByLimon, 0);
    const todaySoldRevenueByLimon = trayRows.reduce((s, r) => s + r.todaySoldRevenueByLimon, 0);

    const allTimeTotalRefilledQty = trayRows.reduce((s, r) => s + r.totalRefilledQty, 0);
    const allTimeTotalSoldQty = trayRows.reduce((s, r) => s + r.totalSoldQty, 0);
    const allTimeTotalSoldRevenue = trayRows.reduce((s, r) => s + r.totalSoldRevenue, 0);

    return {
      totalTraysCount,
      activeTraysCount,
      traysWithStockCount,
      traysNeedingRefillCount,
      currentTotalOnTrays,
      currentTotalTraySellValue,
      remainingMainStockTotal,
      remainingMainStockCostVal,
      remainingMainStockSellVal,
      todayTotalRefilledQty,
      todayTotalRefilledSellVal,
      todayRefilledTraysCount,
      todayRefilledByRakib,
      todayRefilledByLimon,
      todayTotalSoldQty,
      todayTotalSoldRevenue,
      todayTotalSoldProfit,
      todaySoldTraysCount,
      todaySoldByRakib,
      todaySoldRevenueByRakib,
      todaySoldByLimon,
      todaySoldRevenueByLimon,
      allTimeTotalRefilledQty,
      allTimeTotalSoldQty,
      allTimeTotalSoldRevenue,
    };
  }, [trayRows, traysWithCurrentStock]);

  // Filtered tray rows (Using Exact Number Match for "5" / "৫" so 15, 25, 35 never appear!)
  const filteredTrayRows = useMemo(() => {
    return trayRows.filter((row) => {
      if (trayStatusFilter === 'has_stock_now' && row.currentTrayStock <= 0) return false;
      if (
        trayStatusFilter === 'needs_refill' &&
        !(row.currentTrayStock === 0 || (row.hasFixedCapacity && row.emptySlots > 0))
      ) {
        return false;
      }
      if (trayStatusFilter === 'refilled_today' && row.todayRefilledQty <= 0) return false;
      if (trayStatusFilter === 'sold_today' && row.todaySoldQty <= 0) return false;

      if (operatorFilter !== 'all') {
        const targetOp = operatorFilter === 'mine' ? lockedOperator : operatorFilter;
        const updatedByOp =
          row.lastUpdatedBy === targetOp ||
          row.prodLogs.some((l) => l.actor === targetOp) ||
          (targetOp === 'Rakib' &&
            (row.todayRefilledByRakib > 0 ||
              row.todaySoldByRakib > 0 ||
              row.rakibTotalPlacedQty > 0)) ||
          (targetOp === 'Limon' &&
            (row.todayRefilledByLimon > 0 ||
              row.todaySoldByLimon > 0 ||
              row.limonTotalPlacedQty > 0));
        if (!updatedByOp) return false;
      }

      return matchesTrayOrProductSearch(
        searchQuery,
        row.trayNumber,
        row.skuCode,
        row.product.name
      );
    });
  }, [trayRows, searchQuery, trayStatusFilter, operatorFilter, lockedOperator]);

  // Filtered logs for timeline (Also uses exact number match for SKU/tray numbers!)
  const filteredTimelineLogs = useMemo(() => {
    return trayLogs.filter((log) => {
      if (targetDateStr !== 'all' && log.date !== targetDateStr) return false;
      const targetOp = operatorFilter === 'mine' ? lockedOperator : operatorFilter;
      if (operatorFilter !== 'all' && log.actor !== targetOp) return false;
      if (
        logActionFilter === 'refill_only' &&
        log.actionType !== 'scan_refill' &&
        log.actionType !== 'tray_setup'
      ) {
        return false;
      }
      if (logActionFilter === 'sale_only' && log.actionType !== 'tray_sale') return false;
      if (
        logActionFilter === 'return_only' &&
        log.actionType !== 'return_to_stock' &&
        log.actionType !== 'shop_close_empty'
      ) {
        return false;
      }
      const pIdx = products.findIndex((p) => p.id === log.productId);
      const trayNum = pIdx >= 0 ? pIdx + 1 : 0;
      return matchesTrayOrProductSearch(
        searchQuery,
        trayNum,
        log.skuCode,
        log.productName,
        log.notes || ''
      );
    });
  }, [trayLogs, targetDateStr, operatorFilter, logActionFilter, searchQuery, products]);

  // Execute tray action (Strictly using lockedOperator from logged-in profile)
  const handleTrayOperation = async (params: {
    row: (typeof trayRows)[number];
    actionType:
      | 'scan_refill'
      | 'tray_sale'
      | 'tray_setup'
      | 'return_to_stock'
      | 'shop_close_empty';
    quantity: number;
    customTotalSaleAmount?: number;
    customCapacity?: number;
    customNote?: string;
    isWrongEntryRemoval?: boolean;
  }) => {
    const {
      row,
      actionType,
      quantity,
      customTotalSaleAmount,
      customCapacity,
      customNote,
      isWrongEntryRemoval,
    } = params;
    const { product, skuCode } = row;
    if (busyProductId) return;

    const prevMainStock = Math.max(0, Number(product.currentStock || 0));
    const prevTrayStock = Math.max(0, Number(product.trayStock || 0));
    const currentCap = Number(customCapacity ?? product.trayCapacity ?? 0);
    const prevTotalRefilled = Math.max(0, Number(product.totalTrayRefilled || 0));
    const prevTotalSold = Math.max(0, Number(product.totalTraySold || 0));
    const prevTotalSoldAmount = Math.max(0, Number(product.totalTraySoldAmount || 0));

    let moveQty = Math.max(1, Math.round(Number(quantity || 1)));

    if (actionType === 'scan_refill' || actionType === 'tray_setup') {
      if (prevMainStock <= 0) {
        showNotice(
          `⚠️ "${product.name}"-এর মূল স্টক শেষ (০)! ট্রে-তে রাখার মতো মাল মূল স্টকে নেই।`,
          'danger'
        );
        return;
      }
      moveQty = Math.min(moveQty, prevMainStock);
    } else if (
      actionType === 'tray_sale' ||
      actionType === 'return_to_stock' ||
      actionType === 'shop_close_empty'
    ) {
      if (prevTrayStock <= 0) {
        showNotice(`⚠️ "${product.name}"-এর ট্রে ইতিমধ্যে শূন্য (০ পিস)!`, 'danger');
        return;
      }
      moveQty = Math.min(moveQty, prevTrayStock);
    }

    setBusyProductId(product.id);
    try {
      let newMainStock = prevMainStock;
      let newTrayStock = prevTrayStock;
      let newTotalRefilled = prevTotalRefilled;
      let newTotalSold = prevTotalSold;
      let nextTrayCapacity = currentCap;

      if (actionType === 'scan_refill' || actionType === 'tray_setup') {
        newMainStock = Math.max(0, prevMainStock - moveQty);
        newTrayStock = prevTrayStock + moveQty;
        newTotalRefilled = prevTotalRefilled + moveQty;
        if (nextTrayCapacity > 0 && newTrayStock > nextTrayCapacity) {
          nextTrayCapacity = newTrayStock;
        }
      } else if (actionType === 'tray_sale') {
        newTrayStock = Math.max(0, prevTrayStock - moveQty);
        newTotalSold = prevTotalSold + moveQty;
      } else if (actionType === 'return_to_stock') {
        newTrayStock = Math.max(0, prevTrayStock - moveQty);
        newMainStock = prevMainStock + moveQty;
        newTotalRefilled = Math.max(0, prevTotalRefilled - moveQty);
      } else if (actionType === 'shop_close_empty') {
        newTrayStock = Math.max(0, prevTrayStock - moveQty);
      }

      const unitCost = Math.max(0, Number(product.averageCost || 0));
      const defaultUnitPrice = Math.max(0, Number(product.sellingPrice || 0));
      const totalCostVal = Math.round(moveQty * unitCost * 100) / 100;

      const totalSellVal =
        actionType === 'tray_sale' &&
        customTotalSaleAmount !== undefined &&
        customTotalSaleAmount > 0
          ? Math.round(customTotalSaleAmount * 100) / 100
          : Math.round(moveQty * defaultUnitPrice * 100) / 100;

      const effectiveUnitPrice =
        moveQty > 0 ? Math.round((totalSellVal / moveQty) * 100) / 100 : defaultUnitPrice;
      const expectedProfit = Math.round((totalSellVal - totalCostVal) * 100) / 100;

      const newTotalSoldAmount =
        actionType === 'tray_sale'
          ? Math.round((prevTotalSoldAmount + totalSellVal) * 100) / 100
          : prevTotalSoldAmount;

      const timestampStr = formatBengaliDateTime(new Date());
      const actorLabel = formatActorLabel(lockedOperator);

      // If this was a wrong entry removal of today's refill, also clean up matching refill quantity from today's logs if needed
      let nextLogs = [...trayLogs];
      if (isWrongEntryRemoval) {
        let remainingToDeduct = moveQty;
        nextLogs = nextLogs
          .map((l) => {
            if (
              remainingToDeduct > 0 &&
              l.productId === product.id &&
              l.actor === lockedOperator &&
              (l.actionType === 'scan_refill' || l.actionType === 'tray_setup')
            ) {
              if (l.quantity <= remainingToDeduct) {
                remainingToDeduct -= l.quantity;
                return null;
              } else {
                const keptQty = l.quantity - remainingToDeduct;
                remainingToDeduct = 0;
                return {
                  ...l,
                  quantity: keptQty,
                  totalCostVal: Math.round(keptQty * l.unitCost * 100) / 100,
                  totalSellVal: Math.round(keptQty * l.unitPrice * 100) / 100,
                  expectedProfit:
                    Math.round(keptQty * (l.unitPrice - l.unitCost) * 100) / 100,
                  newTrayStock: Math.max(0, l.newTrayStock - moveQty),
                  newMainStock: l.newMainStock + moveQty,
                };
              }
            }
            return l;
          })
          .filter(Boolean) as TrayRefillLogItem[];
      }

      const logItem: TrayRefillLogItem = {
        id: `tray_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        productId: product.id,
        productName: product.name,
        skuCode,
        unit: product.unit || 'পিস',
        actionType,
        quantity: moveQty,
        unitCost,
        unitPrice: effectiveUnitPrice,
        totalCostVal,
        totalSellVal,
        expectedProfit,
        prevMainStock,
        newMainStock,
        prevTrayStock,
        newTrayStock,
        trayCapacity: nextTrayCapacity,
        actor: lockedOperator,
        date: todayYmd(),
        timestamp: timestampStr,
        createdAtMs: Date.now(),
        notes:
          customNote ||
          (isWrongEntryRemoval
            ? `🗑️ ভুল এন্ট্রি রিমুভ: ${actorLabel} ট্রে #${toBengaliNumerals(
                row.trayNumber
              )} থেকে ${toBengaliNumerals(moveQty)} ${
                product.unit || 'পিস'
              } রিমুভ করে মূল স্টকে ফেরত পাঠিয়েছেন`
            : actionType === 'scan_refill' || actionType === 'tray_setup'
            ? `${actorLabel} মূল স্টক থেকে ${toBengaliNumerals(moveQty)} ${
                product.unit || 'পিস'
              } ট্রে-তে রেখেছেন (বর্তমান ট্রে: ${toBengaliNumerals(
                newTrayStock
              )} পিস | মূল স্টকে বাকি: ${toBengaliNumerals(newMainStock)} পিস)`
            : actionType === 'tray_sale'
            ? `${actorLabel} ট্রে থেকে ${toBengaliNumerals(moveQty)} ${
                product.unit || 'পিস'
              } ${money(totalSellVal)} টাকায় বিক্রি করেছেন${isEmployee ? '' : ` (লাভ: +${money(expectedProfit)})`}`
            : actionType === 'return_to_stock'
            ? `🌙 দোকান বন্ধ / স্টকে ফেরত: ${actorLabel} ট্রে থেকে ${toBengaliNumerals(
                moveQty
              )} ${product.unit || 'পিস'} মূল স্টকে ফেরত নিয়ে ট্রে খালি করেছেন`
            : `🌙 দোকান বন্ধ: ${actorLabel} ট্রে শূন্য (০) করেছেন (${toBengaliNumerals(
                moveQty
              )} ${product.unit || 'পিস'} সরানো হয়েছে)`),
      };

      const finalLogs = isWrongEntryRemoval
        ? nextLogs.slice(0, 400)
        : [logItem, ...nextLogs].slice(0, 400);

      setTrayLogs(finalLogs);
      savePersistedTrayLogs(finalLogs);

      await onUpdateProductTrayAndStock(
        product,
        {
          currentStock: newMainStock,
          trayStock: newTrayStock,
          trayCapacity: nextTrayCapacity,
          totalTrayRefilled: newTotalRefilled,
          totalTraySold: newTotalSold,
          totalTraySoldAmount: newTotalSoldAmount,
          lastTrayUpdatedBy: lockedOperator,
          lastTrayUpdatedAt: timestampStr,
        },
        logItem
      );

      if (actionType === 'tray_sale' && syncWithMainSalesLedger && onRecordOptionalCashSale) {
        await onRecordOptionalCashSale({
          product,
          quantity: moveQty,
          customTotalAmount: totalSellVal,
          skuCode,
          actor: lockedOperator,
        });
      }

      if (isWrongEntryRemoval) {
        showNotice(
          `🗑️ ভুল এন্ট্রি রিমুভ সম্পন্ন: ট্রে #${toBengaliNumerals(row.trayNumber)} (${
            product.name
          }) থেকে ${toBengaliNumerals(moveQty)} ${
            product.unit || 'পিস'
          } রিমুভ করে মূল স্টকে ফেরত নেওয়া হয়েছে (বর্তমান ট্রে: ${toBengaliNumerals(
            newTrayStock
          )} পিস | মূল স্টক: ${toBengaliNumerals(newMainStock)} পিস)।`
        );
      } else if (actionType === 'scan_refill' || actionType === 'tray_setup') {
        showNotice(
          `✅ ট্রে #${toBengaliNumerals(row.trayNumber)} (${product.name})-এ 👤 ${actorLabel} +${toBengaliNumerals(
            moveQty
          )} ${product.unit || 'পিস'} রেখেছেন। বর্তমান ট্রে: ${toBengaliNumerals(
            newTrayStock
          )} পিস | মূল স্টকে বাকি: ${toBengaliNumerals(newMainStock)} পিস।`
        );
      } else if (actionType === 'tray_sale') {
        showNotice(
          `🛒 ট্রে #${toBengaliNumerals(row.trayNumber)} (${product.name}) থেকে ${toBengaliNumerals(
            moveQty
          )} ${product.unit || 'পিস'} ${money(totalSellVal)} টাকায় বিক্রি হয়েছে (${
            isEmployee ? '' : `লাভ: +${money(expectedProfit)} | `
          }বিক্রেতা: 👤 ${actorLabel})।`
        );
      } else if (actionType === 'return_to_stock') {
        showNotice(
          `↩️ ট্রে #${toBengaliNumerals(row.trayNumber)} (${product.name}) থেকে ${toBengaliNumerals(
            moveQty
          )} ${product.unit || 'পিস'} মূল স্টকে ফেরত নেওয়া হয়েছে (বর্তমান ট্রে: ${toBengaliNumerals(
            newTrayStock
          )} পিস)।`
        );
      } else {
        showNotice(
          `🌙 ট্রে #${toBengaliNumerals(row.trayNumber)} (${product.name}) শূন্য (০ পিস) করা হয়েছে।`
        );
      }
    } finally {
      setBusyProductId(null);
    }
  };

  // Save Flexible or Custom Tray Capacity (0 = ইচ্ছামতো / Unlimited, >0 = Custom Target)
  const handleSaveTrayCapacity = async (
    row: (typeof trayRows)[number],
    overrideCap?: number
  ) => {
    const rawVal =
      overrideCap !== undefined
        ? overrideCap
        : Number(capacityInputs[row.product.id] ?? row.trayCapacity);
    const newCap = Math.max(0, Math.round(Number.isFinite(rawVal) ? rawVal : 0));
    setBusyProductId(row.product.id);
    try {
      const timestampStr = formatBengaliDateTime(new Date());
      const dummyLog: TrayRefillLogItem = {
        id: `cap_${Date.now()}`,
        productId: row.product.id,
        productName: row.product.name,
        skuCode: row.skuCode,
        unit: row.product.unit || 'পিস',
        actionType: 'tray_setup',
        quantity: 0,
        unitCost: row.unitCost,
        unitPrice: row.unitPrice,
        totalCostVal: 0,
        totalSellVal: 0,
        expectedProfit: 0,
        prevMainStock: row.mainStock,
        newMainStock: row.mainStock,
        prevTrayStock: row.currentTrayStock,
        newTrayStock: row.currentTrayStock,
        trayCapacity: newCap,
        actor: lockedOperator,
        date: todayYmd(),
        timestamp: timestampStr,
        createdAtMs: Date.now(),
        notes:
          newCap === 0
            ? `ট্রে ধারণক্ষমতা "ইচ্ছামতো (আনলিমিটেড)" সেট করা হয়েছে`
            : `ট্রে ধারণক্ষমতা ${toBengaliNumerals(newCap)} পিস সেট করা হয়েছে`,
      };
      await onUpdateProductTrayAndStock(
        row.product,
        {
          currentStock: row.mainStock,
          trayStock: row.currentTrayStock,
          trayCapacity: newCap,
          totalTrayRefilled: row.totalRefilledQty,
          totalTraySold: row.totalSoldQty,
          totalTraySoldAmount: row.totalSoldRevenue,
          lastTrayUpdatedBy: lockedOperator,
          lastTrayUpdatedAt: timestampStr,
        },
        dummyLog
      );
      setCapacityInputs((prev) => ({
        ...prev,
        [row.product.id]: newCap === 0 ? '' : String(newCap),
      }));
      showNotice(
        newCap === 0
          ? `✅ "${row.product.name}"-এর ট্রে ধারণক্ষমতা এখন "ইচ্ছামতো (আনলিমিটেড)" করা হয়েছে।`
          : `✅ "${row.product.name}"-এর ট্রে ধারণক্ষমতা ${toBengaliNumerals(newCap)} পিস সেভ হয়েছে।`
      );
    } finally {
      setBusyProductId(null);
    }
  };

  // End-of-Day Shop Close: Empty ALL Active Trays in 1 Click
  const handleCloseShopEmptyAllTrays = async () => {
    if (isClosingAllTrays || traysWithCurrentStock.length === 0) return;
    setIsClosingAllTrays(true);
    try {
      const timestampStr = formatBengaliDateTime(new Date());
      const actorLabel = formatActorLabel(lockedOperator);
      const newLogsBatch: TrayRefillLogItem[] = [];
      let totalEmptiedPieces = 0;

      for (const row of traysWithCurrentStock) {
        const qtyToClear = row.currentTrayStock;
        if (qtyToClear <= 0) continue;
        totalEmptiedPieces += qtyToClear;

        const isReturning = shopCloseMode === 'return_to_main_stock';
        const nextMainStock = isReturning ? row.mainStock + qtyToClear : row.mainStock;
        const nextTotalRefilled = isReturning
          ? Math.max(0, row.totalRefilledQty - qtyToClear)
          : row.totalRefilledQty;

        const logItem: TrayRefillLogItem = {
          id: `tray_close_${Date.now()}_${row.product.id}_${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          productId: row.product.id,
          productName: row.product.name,
          skuCode: row.skuCode,
          unit: row.product.unit || 'পিস',
          actionType: isReturning ? 'return_to_stock' : 'shop_close_empty',
          quantity: qtyToClear,
          unitCost: row.unitCost,
          unitPrice: row.unitPrice,
          totalCostVal: Math.round(qtyToClear * row.unitCost * 100) / 100,
          totalSellVal: Math.round(qtyToClear * row.unitPrice * 100) / 100,
          expectedProfit: 0,
          prevMainStock: row.mainStock,
          newMainStock: nextMainStock,
          prevTrayStock: qtyToClear,
          newTrayStock: 0,
          trayCapacity: row.trayCapacity,
          actor: lockedOperator,
          date: todayYmd(),
          timestamp: timestampStr,
          createdAtMs: Date.now(),
          notes: isReturning
            ? `🌙 দোকান বন্ধ (ট্রে শূন্য): ${actorLabel} ট্রে #${toBengaliNumerals(
                row.trayNumber
              )} থেকে অবশিষ্ট ${toBengaliNumerals(qtyToClear)} ${
                row.product.unit || 'পিস'
              } মূল স্টকে ফেরত নিয়ে ট্রে ০ করেছেন`
            : `🌙 দোকান বন্ধ (ট্রে শূন্য): ${actorLabel} ট্রে #${toBengaliNumerals(
                row.trayNumber
              )} (${toBengaliNumerals(qtyToClear)} পিস) শূন্য (০) করেছেন`,
        };

        newLogsBatch.push(logItem);

        await onUpdateProductTrayAndStock(
          row.product,
          {
            currentStock: nextMainStock,
            trayStock: 0,
            trayCapacity: row.trayCapacity,
            totalTrayRefilled: nextTotalRefilled,
            totalTraySold: row.totalSoldQty,
            totalTraySoldAmount: row.totalSoldRevenue,
            lastTrayUpdatedBy: lockedOperator,
            lastTrayUpdatedAt: timestampStr,
          },
          logItem
        );
      }

      const mergedLogs = [...newLogsBatch, ...trayLogs].slice(0, 400);
      setTrayLogs(mergedLogs);
      savePersistedTrayLogs(mergedLogs);
      setShowShopClosePanel(false);
      showNotice(
        shopCloseMode === 'return_to_main_stock'
          ? `🌙 দোকান বন্ধ সম্পন্ন: মোট ${toBengaliNumerals(
              traysWithCurrentStock.length
            )}টি ট্রের অবশিষ্ট ${toBengaliNumerals(
              totalEmptiedPieces
            )} পিস মাল মূল স্টকে ফেরত নিয়ে সব ট্রে শূন্য (০) করা হয়েছে!`
          : `🌙 দোকান বন্ধ সম্পন্ন: মোট ${toBengaliNumerals(
              traysWithCurrentStock.length
            )}টি ট্রে (${toBengaliNumerals(totalEmptiedPieces)} পিস) শূন্য (০) করা হয়েছে!`
      );
    } finally {
      setIsClosingAllTrays(false);
    }
  };

  // Remove / Undo a Wrong Tray Log Entry (Strictly enforces profile ownership!)
  const handleRemoveWrongTrayLog = async (log: TrayRefillLogItem) => {
    if (undoingLogId) return;

    // Profile security check: Cannot remove entries belonging to another profile
    if (log.actor && log.actor !== lockedOperator) {
      showNotice(
        `🔒 নিরাপত্তা নীতিমালা: এটি 👤 ${formatActorLabel(
          log.actor
        )}-এর প্রোফাইল থেকে করা এন্ট্রি। শুধুমাত্র নিজ প্রোফাইলের ভুল এন্ট্রি রিমুভ করা যাবে!`,
        'danger'
      );
      return;
    }

    const prod = products.find((p) => p.id === log.productId);
    if (!prod) return;

    setUndoingLogId(log.id);
    try {
      const curMain = Math.max(0, Number(prod.currentStock || 0));
      const curTray = Math.max(0, Number(prod.trayStock || 0));
      const curCap = Math.max(0, Number(prod.trayCapacity ?? log.trayCapacity ?? 0));
      const curRefilled = Math.max(0, Number(prod.totalTrayRefilled || 0));
      const curSold = Math.max(0, Number(prod.totalTraySold || 0));
      const curSoldAmount = Math.max(0, Number(prod.totalTraySoldAmount || 0));

      let restoredMain = curMain;
      let restoredTray = curTray;
      let restoredRefilled = curRefilled;
      let restoredSold = curSold;
      let restoredSoldAmount = curSoldAmount;

      if (log.actionType === 'scan_refill' || log.actionType === 'tray_setup') {
        restoredMain = curMain + log.quantity;
        restoredTray = Math.max(0, curTray - log.quantity);
        restoredRefilled = Math.max(0, curRefilled - log.quantity);
      } else if (log.actionType === 'tray_sale') {
        restoredTray = curTray + log.quantity;
        restoredSold = Math.max(0, curSold - log.quantity);
        restoredSoldAmount = Math.max(0, curSoldAmount - Number(log.totalSellVal || 0));
      } else if (log.actionType === 'return_to_stock') {
        restoredMain = Math.max(0, curMain - log.quantity);
        restoredTray = curTray + log.quantity;
        restoredRefilled = curRefilled + log.quantity;
      } else if (log.actionType === 'shop_close_empty') {
        restoredTray = curTray + log.quantity;
      }

      const undoMarker: TrayRefillLogItem = {
        ...log,
        id: `undo_${Date.now()}`,
        notes: `🗑️ ভুল এন্ট্রি রিমুভ করা হয়েছে: ${log.notes || ''}`,
      };

      await onUpdateProductTrayAndStock(
        prod,
        {
          currentStock: restoredMain,
          trayStock: restoredTray,
          trayCapacity: curCap,
          totalTrayRefilled: restoredRefilled,
          totalTraySold: restoredSold,
          totalTraySoldAmount: restoredSoldAmount,
          lastTrayUpdatedBy: lockedOperator,
          lastTrayUpdatedAt: formatBengaliDateTime(new Date()),
        },
        undoMarker
      );

      const remaining = trayLogs.filter((item) => item.id !== log.id);
      setTrayLogs(remaining);
      savePersistedTrayLogs(remaining);
      showNotice(
        `🗑️ "${log.productName}"-এর ভুল এন্ট্রি (${toBengaliNumerals(log.quantity)} ${
          log.unit || 'পিস'
        }) রিমুভ করা হয়েছে এবং পূর্বের স্টক ও হিসাব পুনঃস্থাপন হয়েছে।`
      );
    } finally {
      setUndoingLogId(null);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {/* COMPACT EXECUTIVE COMMAND BAR & 6-KPI BOARD */}
      <section
        style={{
          background: 'linear-gradient(145deg, #0b2239 0%, #0f2d4a 60%, #0d3b3e 100%)',
          color: '#f8fafc',
          borderRadius: '18px',
          padding: '14px 16px',
          border: '1px solid rgba(45, 212, 191, 0.28)',
          boxShadow: '0 10px 26px rgba(9, 30, 50, 0.16)',
        }}
      >
        {/* Top Row: Title + Locked Profile Operator Badge + Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            paddingBottom: '12px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, #0d9488, #0284c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '19px',
                flexShrink: 0,
              }}
            >
              🍱
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '16.5px',
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1.25,
                }}
              >
                মেলার ট্রে ও বিক্রয় হিসাব ({targetDateShortLabel})
              </h2>
              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                ইচ্ছামতো ট্রে ধারণক্ষমতা • ভুল এন্ট্রি রিমুভ • দিনশেষে ট্রে শূন্যকরণ
              </span>
            </div>
          </div>

          {/* Right Controls: Strictly Locked Profile Badge + QR Scanner + Shop Close Empty Trays */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            {/* Locked Profile Badge — Cannot Switch to Other Partner! */}
            <div
              title="শুধুমাত্র লগইনকৃত নিজ প্রোফাইল থেকে এন্ট্রি ও রিমুভ করা যাবে — একে অপরের এন্ট্রি করতে পারবে না"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background:
                  lockedOperator === 'Rakib'
                    ? 'rgba(2, 132, 199, 0.25)'
                    : lockedOperator === 'Limon'
                    ? 'rgba(126, 34, 206, 0.28)'
                    : 'rgba(13, 148, 136, 0.28)',
                border:
                  lockedOperator === 'Rakib'
                    ? '1.5px solid #38bdf8'
                    : lockedOperator === 'Limon'
                    ? '1.5px solid #c084fc'
                    : '1.5px solid #2dd4bf',
                borderRadius: '10px',
                padding: '6px 11px',
              }}
            >
              <Lock size={13} style={{ color: '#5eead4' }} />
              <span style={{ fontSize: '11.5px', color: '#cbd5e1', fontWeight: 700 }}>
                এন্ট্রিদাতা (প্রোফাইল):
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 900,
                  color: '#ffffff',
                }}
              >
                {isEmployee ? '👷' : '👤'} {lockedOperatorNameBn}
              </span>
            </div>

            {/* Live QR Scanner Button */}
            <button
              type="button"
              onClick={() => onOpenScannerModal('scan_refill')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(45, 212, 191, 0.5)',
                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <Camera size={14} />
              <span>QR স্ক্যানার</span>
            </button>

            {/* End-of-Day Shop Close / Empty All Trays Button */}
            <button
              type="button"
              onClick={() => setShowShopClosePanel((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(251, 146, 60, 0.65)',
                background: showShopClosePanel
                  ? '#ea580c'
                  : 'rgba(234, 88, 12, 0.22)',
                color: '#ffedd5',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <Moon size={14} />
              <span>
                দোকান বন্ধ / ট্রে শূন্য করুন ({toBengaliNumerals(summary.traysWithStockCount)})
              </span>
            </button>
          </div>
        </div>

        {/* Date Filter + Cash Sale Auto-Sync Strip */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            margin: '10px 0 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'today', label: 'আজকের হিসাব' },
                { id: 'yesterday', label: 'গতকাল' },
                { id: 'all', label: 'সব দিন' },
                { id: 'custom', label: 'নির্দিষ্ট তারিখ' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setDateScope(btn.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    dateScope === btn.id
                      ? '1px solid #2dd4bf'
                      : '1px solid rgba(148, 163, 184, 0.28)',
                  background:
                    dateScope === btn.id
                      ? 'rgba(13, 148, 136, 0.35)'
                      : 'rgba(15, 23, 42, 0.45)',
                  color: dateScope === btn.id ? '#5eead4' : '#cbd5e1',
                }}
              >
                {btn.label}
              </button>
            ))}
            {dateScope === 'custom' && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '7px',
                  border: '1px solid #2dd4bf',
                  background: '#0f172a',
                  color: '#f8fafc',
                  fontSize: '11.5px',
                }}
              />
            )}
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              color: '#cbd5e1',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={syncWithMainSalesLedger}
              onChange={(e) => setSyncWithMainSalesLedger(e.target.checked)}
              style={{ width: '13px', height: '13px', accentColor: '#10b981' }}
            />
            <span>ট্রে বিক্রি মূল বিক্রয় খাতাতেও (Cash Sale) অটো-যোগ</span>
          </label>
        </div>

        {/* COMPACT 2x3 EXECUTIVE KPI GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '8px',
          }}
        >
          {/* KPI 1: বর্তমান ট্রে-তে মোট মাল আছে */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              borderRadius: '12px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 700 }}>
              🍱 বর্তমান ট্রে-তে আছে ({toBengaliNumerals(summary.traysWithStockCount)}টি ট্রে)
            </div>
            <div style={{ fontSize: '19px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
              {toBengaliNumerals(summary.currentTotalOnTrays)} পিস
            </div>
            <div style={{ fontSize: '11px', color: '#6ee7b7', fontWeight: 700 }}>
              মূল্য: {money(summary.currentTotalTraySellValue)}
            </div>
          </div>

          {/* KPI 2: আজ ট্রে-তে কত মাল গিয়েছে */}
          <div
            style={{
              background: 'rgba(14, 165, 233, 0.14)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '12px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#bae6fd', fontWeight: 700 }}>
              📥 {targetDateShortLabel} ট্রে-তে গিয়েছে ({toBengaliNumerals(summary.todayRefilledTraysCount)}টি ট্রে)
            </div>
            <div style={{ fontSize: '19px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
              +{toBengaliNumerals(summary.todayTotalRefilledQty)} পিস
            </div>
            <div style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 700 }}>
              মূল্য: {money(summary.todayTotalRefilledSellVal)}
            </div>
          </div>

          {/* KPI 3: আজ ট্রে থেকে বিক্রি ও টাকা */}
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.16)',
              border: '1px solid rgba(251, 113, 133, 0.4)',
              borderRadius: '12px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#fecdd3', fontWeight: 700 }}>
              🛒 {targetDateShortLabel} ট্রে থেকে বিক্রি ({toBengaliNumerals(summary.todaySoldTraysCount)}টি ট্রে)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
              {toBengaliNumerals(summary.todayTotalSoldQty)} পিস • {money(summary.todayTotalSoldRevenue)}
            </div>
            <div style={{ fontSize: '11px', color: '#6ee7b7', fontWeight: 700 }}>
              {isEmployee ? 'আজকের বিক্রয়কৃত পিস ও মূল্য' : `লাভ: +${money(summary.todayTotalSoldProfit)}`}
            </div>
          </div>

          {/* KPI 4: মূল স্টকে আর কত মাল বাকি আছে */}
          <div
            style={{
              background: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(167, 139, 250, 0.35)',
              borderRadius: '12px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#ddd6fe', fontWeight: 700 }}>
              📦 মূল স্টকে অবশিষ্ট (গোডাউন)
            </div>
            <div style={{ fontSize: '19px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
              {toBengaliNumerals(summary.remainingMainStockTotal)} পিস
            </div>
            <div style={{ fontSize: '11px', color: '#c4b5fd', fontWeight: 700 }}>
              বিক্রয়মূল্য: {money(summary.remainingMainStockSellVal)}
            </div>
          </div>

          {/* KPI 5: মোট কতগুলো ট্রে আছে */}
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(251, 191, 36, 0.35)',
              borderRadius: '12px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#fde68a', fontWeight: 700 }}>
              🔢 মোট ট্রে ও সর্বমোট বিক্রি
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
              {toBengaliNumerals(summary.totalTraysCount)}টি ট্রে{' '}
              <span style={{ fontSize: '11.5px', color: '#fcd34d' }}>
                (মাল আছে {toBengaliNumerals(summary.traysWithStockCount)}টিতে)
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#fde68a', fontWeight: 700 }}>
              মোট বিক্রি: {toBengaliNumerals(summary.allTimeTotalSoldQty)} পিস ({money(summary.allTimeTotalSoldRevenue)})
            </div>
          </div>

          {/* KPI 6: কে মাল রেখেছে ও বিক্রি করেছে */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '12px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>
              👥 কে রেখেছে ও বিক্রি ({targetDateShortLabel})
            </div>
            <div style={{ fontSize: '11.5px', color: '#7dd3fc', fontWeight: 800, marginTop: '3px' }}>
              👤 রাকিব: +{toBengaliNumerals(summary.todayRefilledByRakib)} পিস | বিক্রি{' '}
              {toBengaliNumerals(summary.todaySoldByRakib)} ({money(summary.todaySoldRevenueByRakib)})
            </div>
            <div style={{ fontSize: '11.5px', color: '#d8b4fe', fontWeight: 800, marginTop: '2px' }}>
              👤 লিমন: +{toBengaliNumerals(summary.todayRefilledByLimon)} পিস | বিক্রি{' '}
              {toBengaliNumerals(summary.todaySoldByLimon)} ({money(summary.todaySoldRevenueByLimon)})
            </div>
          </div>
        </div>
      </section>

      {/* END-OF-DAY SHOP CLOSING / EMPTY ALL TRAYS PANEL */}
      {showShopClosePanel && (
        <section
          className="panel"
          style={{
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
            border: '2px solid #fb923c',
            borderRadius: '16px',
            padding: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              marginBottom: '12px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#9a3412' }}>
                🌙 প্রতিদিন দোকান বন্ধ করার সময় ট্রে শূন্য (০) করার প্যানেল
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#7c2d12' }}>
                বর্তমানে <b>{toBengaliNumerals(traysWithCurrentStock.length)}টি ট্রে-তে মোট{' '}
                {toBengaliNumerals(summary.currentTotalOnTrays)} পিস</b> মাল অবশিষ্ট আছে (মূল্য:{' '}
                <b>{money(summary.currentTotalTraySellValue)}</b>)। এন্ট্রিদাতা প্রোফাইল:{' '}
                <b>👤 {lockedOperatorNameBn}</b>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowShopClosePanel(false)}
              style={{
                padding: '5px 10px',
                borderRadius: '8px',
                border: '1px solid #fdba74',
                background: '#ffffff',
                color: '#9a3412',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              ✕ বন্ধ করুন
            </button>
          </div>

          {/* 2 Radio Options for How to Empty Trays */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '10px',
              marginBottom: '12px',
            }}
          >
            <label
              onClick={() => setShopCloseMode('return_to_main_stock')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '9px',
                padding: '11px 13px',
                borderRadius: '12px',
                cursor: 'pointer',
                background:
                  shopCloseMode === 'return_to_main_stock' ? '#ffffff' : 'rgba(255,255,255,0.6)',
                border:
                  shopCloseMode === 'return_to_main_stock'
                    ? '2px solid #0d9488'
                    : '1px solid #fdba74',
              }}
            >
              <input
                type="radio"
                checked={shopCloseMode === 'return_to_main_stock'}
                onChange={() => setShopCloseMode('return_to_main_stock')}
                style={{ marginTop: '3px', accentColor: '#0d9488' }}
              />
              <div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                  ↩️ অপশন ১ (প্রস্তাবিত): অবশিষ্ট মাল মূল স্টকে ফেরত নিয়ে সব ট্রে শূন্য (০) করুন
                </div>
                <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                  ট্রে-তে অবিক্রিত থাকা {toBengaliNumerals(summary.currentTotalOnTrays)} পিস মাল পুনরায় আপনার মূল স্টকে যোগ হয়ে যাবে এবং সব ট্রে ০ পিস হয়ে যাবে।
                </div>
              </div>
            </label>

            <label
              onClick={() => setShopCloseMode('zero_only')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '9px',
                padding: '11px 13px',
                borderRadius: '12px',
                cursor: 'pointer',
                background: shopCloseMode === 'zero_only' ? '#ffffff' : 'rgba(255,255,255,0.6)',
                border:
                  shopCloseMode === 'zero_only' ? '2px solid #e11d48' : '1px solid #fdba74',
              }}
            >
              <input
                type="radio"
                checked={shopCloseMode === 'zero_only'}
                onChange={() => setShopCloseMode('zero_only')}
                style={{ marginTop: '3px', accentColor: '#e11d48' }}
              />
              <div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                  🧹 অপশন ২: মূল স্টক অপরিবর্তিত রেখে শুধু সব ট্রে শূন্য (০) করুন
                </div>
                <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                  মূল স্টকে কোনো পরিবর্তন না করে শুধু প্রতিটি ট্রের বর্তমান ডিসপ্লে সংখ্যা ০ করে দেবে।
                </div>
              </div>
            </label>
          </div>

          {traysWithCurrentStock.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {traysWithCurrentStock.map((r) => (
                  <span
                    key={r.product.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      border: '1px solid #fdba74',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#9a3412',
                    }}
                  >
                    ট্রে #{toBengaliNumerals(r.trayNumber)} {r.product.name}:{' '}
                    <b>{toBengaliNumerals(r.currentTrayStock)} পিস</b>
                  </span>
                ))}
              </div>

              <button
                type="button"
                disabled={isClosingAllTrays}
                onClick={handleCloseShopEmptyAllTrays}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #ea580c, #be123c)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)',
                }}
              >
                {isClosingAllTrays
                  ? 'ট্রে শূন্য করা হচ্ছে...'
                  : `🌙 এখনই সব (${toBengaliNumerals(
                      traysWithCurrentStock.length
                    )}টি) ট্রে শূন্য (০) করুন`}
              </button>
            </div>
          ) : (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                color: '#065f46',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              ✅ বর্তমানে সব ট্রে ইতিমধ্যে শূন্য (০ পিস) আছে!
            </div>
          )}
        </section>
      )}

      {/* LIVE FEEDBACK BANNER */}
      {bannerNotice && (
        <div
          style={{
            background: bannerTone === 'danger' ? '#fef2f2' : '#ecfdf5',
            border: bannerTone === 'danger' ? '1px solid #fca5a5' : '1px solid #6ee7b7',
            color: bannerTone === 'danger' ? '#991b1b' : '#065f46',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: '12.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span>{bannerNotice}</span>
          <button
            type="button"
            onClick={() => setBannerNotice('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: bannerTone === 'danger' ? '#b91c1c' : '#047857',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* AT-A-GLANCE "আজ কোন ট্রে-তে কত পিস আছে" QUICK LIVE SUMMARY STRIP */}
      <section
        className="panel"
        style={{
          padding: '13px 15px',
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '10px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>
              🍱 আজ কোন ট্রে-তে কত পিস মাল আছে (এক নজরে লাইভ ট্রে বোর্ড)
            </h3>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
              যে ট্রে-তে ক্লিক করবেন সরাসরি নিচে সেই ট্রের কাস্টম কন্ট্রোল ও ভুল এন্ট্রি রিমুভ বক্স খুলে যাবে
            </span>
          </div>
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '999px',
              background: '#ecfdf5',
              color: '#047857',
              border: '1px solid #a7f3d0',
            }}
          >
            মাল আছে: {toBengaliNumerals(summary.traysWithStockCount)}টি ট্রে-তে (মোট{' '}
            {toBengaliNumerals(summary.currentTotalOnTrays)} পিস)
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))',
            gap: '8px',
            maxHeight: '220px',
            overflowY: 'auto',
            paddingRight: '2px',
          }}
        >
          {filteredTrayRows.map((r) => {
            const hasStock = r.currentTrayStock > 0;
            return (
              <div
                key={r.product.id}
                onClick={() => {
                  setExpandedTrayId((prev) => (prev === r.product.id ? null : r.product.id));
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: '11px',
                  cursor: 'pointer',
                  background: hasStock
                    ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
                    : '#f8fafc',
                  border: hasStock ? '1.5px solid #34d399' : '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: '6px',
                      background: hasStock ? '#065f46' : '#475569',
                      color: '#ffffff',
                    }}
                  >
                    ট্রে #{toBengaliNumerals(r.trayNumber)}
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>
                    SKU #{r.skuCode}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 800,
                    color: '#0f172a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={r.product.name}
                >
                  {r.product.name}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: '15px',
                      fontWeight: 900,
                      color: hasStock ? '#047857' : '#94a3b8',
                    }}
                  >
                    {toBengaliNumerals(r.currentTrayStock)} {r.product.unit || 'পিস'}
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#475569', fontWeight: 700 }}>
                    {r.hasFixedCapacity
                      ? `ক্যাপাসিটি: ${toBengaliNumerals(r.trayCapacity)}`
                      : 'ইচ্ছামতো'}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '10.5px',
                    color: '#64748b',
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px dashed rgba(148, 163, 184, 0.35)',
                    paddingTop: '3px',
                  }}
                >
                  <span>আজ: +{toBengaliNumerals(r.todayRefilledQty)}</span>
                  <span style={{ color: r.todaySoldQty > 0 ? '#be123c' : '#64748b', fontWeight: 700 }}>
                    বিক্রি: {toBengaliNumerals(r.todaySoldQty)}
                  </span>
                  <span>স্টক: {toBengaliNumerals(r.mainStock)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FILTER, EXACT SEARCH & VIEW MODE SWITCHER BAR */}
      <section className="panel" style={{ padding: '12px 14px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          {/* Search Input (Exact Number Match for 5 / ৫!) */}
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '360px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="সঠিক ট্রে/SKU নং (যেমন: ৫ বা 5) বা পণ্যের নাম খুঁজুন..."
              style={{
                width: '100%',
                padding: '7px 28px 7px 31px',
                borderRadius: '9px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                title="সার্চ মুছুন"
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {(
              [
                { id: 'all', label: `সব ট্রে (${toBengaliNumerals(trayRows.length)})` },
                {
                  id: 'has_stock_now',
                  label: `🍱 মাল আছে (${toBengaliNumerals(summary.traysWithStockCount)})`,
                },
                {
                  id: 'refilled_today',
                  label: `📥 ${targetDateShortLabel} গিয়েছে (${toBengaliNumerals(
                    summary.todayRefilledTraysCount
                  )})`,
                },
                {
                  id: 'sold_today',
                  label: `🛒 ${targetDateShortLabel} বিক্রি (${toBengaliNumerals(
                    summary.todaySoldTraysCount
                  )})`,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTrayStatusFilter(f.id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    trayStatusFilter === f.id ? '1px solid #0f766e' : '1px solid #e2e8f0',
                  background: trayStatusFilter === f.id ? '#0f766e' : '#f8fafc',
                  color: trayStatusFilter === f.id ? '#ffffff' : '#334155',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Operator View Filter + Cards/Table Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: 'সবাই' },
                { id: 'mine', label: `${isEmployee ? '👷' : '👤'} আমার এন্ট্রি` },
                { id: 'Rakib', label: '👤 রাকিব' },
                { id: 'Limon', label: '👤 লিমন' },
              ] as const
            ).map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => setOperatorFilter(op.id)}
                style={{
                  padding: '5px 9px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    operatorFilter === op.id ? '1px solid #0284c7' : '1px solid #cbd5e1',
                  background: operatorFilter === op.id ? '#e0f2fe' : '#ffffff',
                  color: operatorFilter === op.id ? '#0369a1' : '#475569',
                }}
              >
                {op.label}
              </button>
            ))}

            <div
              style={{
                display: 'inline-flex',
                background: '#f1f5f9',
                padding: '2px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
              }}
            >
              <button
                type="button"
                onClick={() => setDisplayLayout('cards')}
                style={{
                  padding: '4px 9px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: displayLayout === 'cards' ? '#0f172a' : 'transparent',
                  color: displayLayout === 'cards' ? '#ffffff' : '#475569',
                }}
              >
                📱 কার্ড ভিউ
              </button>
              <button
                type="button"
                onClick={() => setDisplayLayout('table')}
                style={{
                  padding: '4px 9px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: displayLayout === 'table' ? '#0f172a' : 'transparent',
                  color: displayLayout === 'table' ? '#ffffff' : '#475569',
                }}
              >
                📋 টেবিল ভিউ
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PROFESSIONAL TRAY CARDS VIEW */}
      {displayLayout === 'cards' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '12px',
          }}
        >
          {filteredTrayRows.map((row) => {
            const isExpanded = expandedTrayId === row.product.id;
            const isRowBusy = busyProductId === row.product.id;
            const hasStock = row.currentTrayStock > 0;
            const myLogsForTray = row.prodLogs.filter((l) => l.actor === lockedOperator);

            return (
              <div
                key={row.product.id}
                style={{
                  background: '#ffffff',
                  border: hasStock ? '1.5px solid #34d399' : '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '14px',
                  boxShadow: hasStock
                    ? '0 6px 18px rgba(5, 150, 105, 0.08)'
                    : '0 2px 8px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Card Header: Tray Badge + Product Name + Updated By */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '4px 9px',
                        borderRadius: '8px',
                        background: hasStock ? '#065f46' : '#0f172a',
                        color: '#5eead4',
                        fontWeight: 900,
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ট্রে #{toBengaliNumerals(row.trayNumber)}
                    </span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14.5px', color: '#0f172a' }}>
                        {row.product.name}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                        SKU: <b>#{row.skuCode}</b> • দর: {money(row.unitPrice)}/{row.product.unit || 'পিস'}
                      </div>
                    </div>
                  </div>

                  {/* Who Updated Badge */}
                  {row.lastUpdatedBy ? (
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background:
                          row.lastUpdatedBy === 'Rakib'
                            ? '#e0f2fe'
                            : row.lastUpdatedBy === 'Limon'
                            ? '#f3e8ff'
                            : '#ccfbf1',
                        color:
                          row.lastUpdatedBy === 'Rakib'
                            ? '#0369a1'
                            : row.lastUpdatedBy === 'Limon'
                            ? '#7e22ce'
                            : '#0f766e',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.lastUpdatedBy === 'Rakib' || row.lastUpdatedBy === 'Limon' ? '👤' : '👷'}{' '}
                      {formatActorLabel(row.lastUpdatedBy)}
                    </span>
                  ) : (
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '10.5px',
                        background: '#f1f5f9',
                        color: '#64748b',
                      }}
                    >
                      নতুন ট্রে
                    </span>
                  )}
                </div>

                {/* 4-Box Structured Metric Grid inside Each Tray Card */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '7px',
                  }}
                >
                  {/* Box 1: বর্তমান ট্রে-তে আছে */}
                  <div
                    style={{
                      background: hasStock ? '#ecfdf5' : '#f8fafc',
                      border: hasStock ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#065f46', fontWeight: 700 }}>
                      🍱 বর্তমান ট্রে-তে আছে
                    </div>
                    <div style={{ fontSize: '16.5px', fontWeight: 900, color: '#047857' }}>
                      {toBengaliNumerals(row.currentTrayStock)}{' '}
                      {row.hasFixedCapacity
                        ? `/ ${toBengaliNumerals(row.trayCapacity)} পিস`
                        : 'পিস'}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#475569' }}>
                      মূল্য: <b>{money(row.currentTraySellValue)}</b> •{' '}
                      {row.hasFixedCapacity
                        ? row.emptySlots > 0
                          ? `${toBengaliNumerals(row.emptySlots)} খালি`
                          : 'পূর্ণ ✓'
                        : 'ইচ্ছামতো ধারণক্ষমতা'}
                    </div>
                  </div>

                  {/* Box 2: আজ ট্রে-তে গিয়েছে */}
                  <div
                    style={{
                      background: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      borderRadius: '10px',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#075985', fontWeight: 700 }}>
                      📥 {targetDateShortLabel} ট্রে-তে গিয়েছে
                    </div>
                    <div style={{ fontSize: '16.5px', fontWeight: 900, color: '#0284c7' }}>
                      +{toBengaliNumerals(row.todayRefilledQty)} পিস
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#475569' }}>
                      মূল্য: <b>{money(row.todayRefilledSellVal)}</b> (মোট:{' '}
                      {toBengaliNumerals(row.totalRefilledQty)})
                    </div>
                  </div>

                  {/* Box 3: আজ ট্রে থেকে বিক্রি ও টাকা */}
                  <div
                    style={{
                      background: row.todaySoldQty > 0 ? '#fff1f2' : '#f8fafc',
                      border: row.todaySoldQty > 0 ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#9f1239', fontWeight: 700 }}>
                      🛒 {targetDateShortLabel} বিক্রি ও টাকা
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#be123c' }}>
                      {toBengaliNumerals(row.todaySoldQty)} পিস • {money(row.todaySoldRevenue)}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#047857', fontWeight: 700 }}>
                      {isEmployee
                        ? `সর্বমোট বিক্রি: ${toBengaliNumerals(row.totalSoldQty)} পিস`
                        : `লাভ: +${money(row.todaySoldProfit)} (মোট: ${toBengaliNumerals(row.totalSoldQty)})`}
                    </div>
                  </div>

                  {/* Box 4: মূল স্টকে বাকি ও কে রেখেছে */}
                  <div
                    style={{
                      background: '#faf5ff',
                      border: '1px solid #e9d5ff',
                      borderRadius: '10px',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#5b21b6', fontWeight: 700 }}>
                      📦 মূল স্টকে বাকি আছে
                    </div>
                    <div style={{ fontSize: '16.5px', fontWeight: 900, color: '#6d28d9' }}>
                      {toBengaliNumerals(row.mainStock)} পিস
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#475569' }}>
                      রাকিব: <b>{toBengaliNumerals(row.rakibTotalPlacedQty)}</b> | লিমন:{' '}
                      <b>{toBengaliNumerals(row.limonTotalPlacedQty)}</b> পিস
                    </div>
                  </div>
                </div>

                {/* Quick 1-Tap Action Bar on Card (Includes Direct Wrong Entry Remove Button!) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  <button
                    type="button"
                    disabled={isRowBusy || row.mainStock <= 0}
                    onClick={() =>
                      handleTrayOperation({
                        row,
                        actionType: 'scan_refill',
                        quantity: 1,
                      })
                    }
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid #0284c7',
                      background: '#e0f2fe',
                      color: '#0369a1',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: row.mainStock <= 0 ? 'not-allowed' : 'pointer',
                      opacity: row.mainStock <= 0 ? 0.5 : 1,
                    }}
                  >
                    📥 +১ রাখুন
                  </button>

                  <button
                    type="button"
                    disabled={isRowBusy || row.mainStock <= 0}
                    onClick={() =>
                      handleTrayOperation({
                        row,
                        actionType: 'scan_refill',
                        quantity: 2,
                      })
                    }
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid #0d9488',
                      background: '#ccfbf1',
                      color: '#0f766e',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: row.mainStock <= 0 ? 'not-allowed' : 'pointer',
                      opacity: row.mainStock <= 0 ? 0.5 : 1,
                    }}
                  >
                    📥 +২ রাখুন
                  </button>

                  <button
                    type="button"
                    disabled={isRowBusy || row.mainStock <= 0}
                    onClick={() =>
                      handleTrayOperation({
                        row,
                        actionType: 'scan_refill',
                        quantity: row.mainStock,
                        customNote: `মূল স্টকের সম্পূর্ণ (${toBengaliNumerals(row.mainStock)} পিস) এক ক্লিকে ট্রে-তে রাখা হয়েছে`,
                      })
                    }
                    title={`মূল স্টকে থাকা সম্পূর্ণ ${toBengaliNumerals(row.mainStock)} পিস এক ক্লিকে ট্রে-তে রাখুন`}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid #6d28d9',
                      background: '#f3e8ff',
                      color: '#5b21b6',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: row.mainStock <= 0 ? 'not-allowed' : 'pointer',
                      opacity: row.mainStock <= 0 ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    📦 সব স্টক রাখুন{row.mainStock > 0 ? ` (+${toBengaliNumerals(row.mainStock)})` : ''}
                  </button>

                  <button
                    type="button"
                    disabled={isRowBusy || row.currentTrayStock <= 0}
                    onClick={() =>
                      handleTrayOperation({
                        row,
                        actionType: 'tray_sale',
                        quantity: 1,
                      })
                    }
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid #e11d48',
                      background: '#ffe4e6',
                      color: '#be123c',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: row.currentTrayStock <= 0 ? 'not-allowed' : 'pointer',
                      opacity: row.currentTrayStock <= 0 ? 0.5 : 1,
                    }}
                  >
                    🛒 -১ বিক্রি
                  </button>

                  {/* Instant Wrong Entry Remove Button (When tray has stock or user has a recent entry on this tray) */}
                  {(row.currentTrayStock > 0 || row.myLatestLog) && (
                    <button
                      type="button"
                      disabled={isRowBusy}
                      onClick={() => {
                        if (row.myLatestLog) {
                          handleRemoveWrongTrayLog(row.myLatestLog);
                        } else if (row.currentTrayStock > 0) {
                          handleTrayOperation({
                            row,
                            actionType: 'return_to_stock',
                            quantity: 1,
                            isWrongEntryRemoval: true,
                          });
                        }
                      }}
                      title={
                        row.myLatestLog
                          ? `আপনার সর্বশেষ এন্ট্রি (${row.myLatestLog.quantity} পিস) রিমুভ করুন`
                          : 'ভুল করে ওঠা ১ পিস রিমুভ করে মূল স্টকে ফেরত নিন'
                      }
                      style={{
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid #dc2626',
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontWeight: 800,
                        fontSize: '11.5px',
                        cursor: 'pointer',
                      }}
                    >
                      🗑️ ভুল রিমুভ
                    </button>
                  )}

                  {row.currentTrayStock > 0 && (
                    <button
                      type="button"
                      disabled={isRowBusy}
                      onClick={() =>
                        handleTrayOperation({
                          row,
                          actionType: 'return_to_stock',
                          quantity: row.currentTrayStock,
                        })
                      }
                      title="দোকান বন্ধ বা ট্রে খালি করতে সব মাল মূল স্টকে ফেরত নিয়ে ট্রে ০ করুন"
                      style={{
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid #ea580c',
                        background: '#ffedd5',
                        color: '#9a3412',
                        fontWeight: 800,
                        fontSize: '11.5px',
                        cursor: 'pointer',
                      }}
                    >
                      🧹 ট্রে ০
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpandedTrayId(isExpanded ? null : row.product.id)}
                    style={{
                      padding: '6px 9px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: isExpanded ? '#0f172a' : '#f8fafc',
                      color: isExpanded ? '#ffffff' : '#334155',
                      fontWeight: 800,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    {isExpanded ? '▲' : '⚙️ কাস্টম'}
                  </button>
                </div>

                {/* Expanded Custom Drawer inside Card: Wrong Entry Removal, Any Qty Refill, Custom Sale, Flexible Capacity */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '4px',
                      paddingTop: '10px',
                      borderTop: '1px dashed #cbd5e1',
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    {/* 0. DEDICATED WRONG ENTRY REMOVAL & CORRECTION BOX */}
                    <div
                      style={{
                        background: '#fef2f2',
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1.5px solid #fca5a5',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          color: '#991b1b',
                          marginBottom: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>🗑️ ট্রে-তে ভুল এন্ট্রি রিমুভ ও সংশোধন (👤 {lockedOperatorNameBn})</span>
                      </div>

                      {/* Remove custom wrong refill pieces back to Main Stock */}
                      {row.currentTrayStock > 0 && (
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '7px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() =>
                              handleTrayOperation({
                                row,
                                actionType: 'return_to_stock',
                                quantity: 1,
                                isWrongEntryRemoval: true,
                              })
                            }
                            style={{
                              padding: '5px 9px',
                              borderRadius: '7px',
                              border: '1px solid #ef4444',
                              background: '#ffffff',
                              color: '#dc2626',
                              fontWeight: 800,
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            ↩️ -১ পিস ভুল রিফিল রিমুভ
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={row.currentTrayStock}
                            placeholder="কত পিস রিমুভ?"
                            value={removeWrongQtyInputs[row.product.id] ?? ''}
                            onChange={(e) =>
                              setRemoveWrongQtyInputs((prev) => ({
                                ...prev,
                                [row.product.id]: e.target.value,
                              }))
                            }
                            style={{
                              flex: 1,
                              minWidth: '90px',
                              padding: '5px 8px',
                              borderRadius: '7px',
                              border: '1px solid #fca5a5',
                              fontSize: '11.5px',
                            }}
                          />
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => {
                              const q = Math.max(
                                1,
                                Number(removeWrongQtyInputs[row.product.id] || 1)
                              );
                              handleTrayOperation({
                                row,
                                actionType: 'return_to_stock',
                                quantity: q,
                                isWrongEntryRemoval: true,
                              });
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '7px',
                              border: 'none',
                              background: '#dc2626',
                              color: '#ffffff',
                              fontWeight: 800,
                              fontSize: '11.5px',
                              cursor: 'pointer',
                            }}
                          >
                            🗑️ রিমুভ করুন
                          </button>
                        </div>
                      )}

                      {/* List of recent entries on this tray by the current logged-in profile to remove individually */}
                      {myLogsForTray.length > 0 ? (
                        <div style={{ display: 'grid', gap: '4px' }}>
                          <div style={{ fontSize: '11px', color: '#7f1d1d', fontWeight: 700 }}>
                            এই ট্রে-তে আপনার করা সাম্প্রতিক এন্ট্রি (ক্লিক করে রিমুভ করুন):
                          </div>
                          {myLogsForTray.slice(0, 3).map((l) => (
                            <div
                              key={l.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#ffffff',
                                padding: '5px 8px',
                                borderRadius: '7px',
                                border: '1px solid #fecaca',
                                fontSize: '11px',
                              }}
                            >
                              <span>
                                <b>
                                  {l.actionType === 'tray_sale'
                                    ? `🛒 ${toBengaliNumerals(l.quantity)} পিস বিক্রি (${money(
                                        l.totalSellVal
                                      )})`
                                    : `📥 +${toBengaliNumerals(l.quantity)} পিস ট্রে-তে রাখা`}
                                </b>{' '}
                                • <small style={{ color: '#64748b' }}>{l.timestamp}</small>
                              </span>
                              <button
                                type="button"
                                disabled={undoingLogId === l.id}
                                onClick={() => handleRemoveWrongTrayLog(l)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #dc2626',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  fontWeight: 800,
                                  fontSize: '10.5px',
                                  cursor: 'pointer',
                                }}
                              >
                                🗑️ রিমুভ
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#991b1b' }}>
                          এই ট্রে-তে আপনার প্রোফাইল থেকে করা কোনো পেন্ডিং লগ নেই।
                        </div>
                      )}
                    </div>

                    {/* 1. Custom Refill Any Quantity */}
                    <div
                      style={{
                        background: '#f0f9ff',
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid #bae6fd',
                      }}
                    >
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#0369a1', marginBottom: '5px' }}>
                        📥 ইচ্ছামতো যেকোনো পিস ট্রে-তে রাখুন (👤 {lockedOperatorNameBn})
                      </div>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <input
                          type="number"
                          min={1}
                          placeholder="কত পিস রাখবেন? (যেমন: ৫, ১৫, ২৫)"
                          value={refillQtyInputs[row.product.id] ?? ''}
                          onChange={(e) =>
                            setRefillQtyInputs((prev) => ({
                              ...prev,
                              [row.product.id]: e.target.value,
                            }))
                          }
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            borderRadius: '7px',
                            border: '1px solid #93c5fd',
                            fontSize: '12px',
                          }}
                        />
                        <button
                          type="button"
                          disabled={isRowBusy || row.mainStock <= 0}
                          onClick={() => {
                            const q = Math.max(1, Number(refillQtyInputs[row.product.id] || 1));
                            handleTrayOperation({
                              row,
                              actionType: 'scan_refill',
                              quantity: q,
                            });
                          }}
                          style={{
                            padding: '6px 11px',
                            borderRadius: '7px',
                            border: 'none',
                            background: '#0284c7',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                          }}
                        >
                          ট্রে-তে যোগ
                        </button>
                        <button
                          type="button"
                          disabled={isRowBusy || row.mainStock <= 0}
                          onClick={() =>
                            handleTrayOperation({
                              row,
                              actionType: 'scan_refill',
                              quantity: row.mainStock,
                              customNote: `মূল স্টকের সম্পূর্ণ (${toBengaliNumerals(row.mainStock)} পিস) এক ক্লিকে ট্রে-তে রাখা হয়েছে`,
                            })
                          }
                          style={{
                            padding: '6px 11px',
                            borderRadius: '7px',
                            border: 'none',
                            background: '#6d28d9',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '11.5px',
                            cursor: row.mainStock <= 0 ? 'not-allowed' : 'pointer',
                            opacity: row.mainStock <= 0 ? 0.5 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          📦 সব স্টক রাখুন ({toBengaliNumerals(row.mainStock)})
                        </button>
                      </div>
                    </div>

                    {/* 2. Custom Sale from Tray (Pieces + Custom Total Price) */}
                    <div
                      style={{
                        background: '#fff1f2',
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid #fecdd3',
                      }}
                    >
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#be123c', marginBottom: '5px' }}>
                        🛒 ট্রে থেকে কাস্টম পিস ও কাস্টম টাকায় বিক্রি
                      </div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min={1}
                          placeholder="পিস"
                          value={saleQtyInputs[row.product.id] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSaleQtyInputs((prev) => ({ ...prev, [row.product.id]: val }));
                            const num = Number(val);
                            if (num > 0) {
                              setSaleTotalPriceInputs((prev) => ({
                                ...prev,
                                [row.product.id]: String(
                                  Math.round(num * row.unitPrice * 100) / 100
                                ),
                              }));
                            }
                          }}
                          style={{
                            width: '75px',
                            padding: '6px 8px',
                            borderRadius: '7px',
                            border: '1px solid #fda4af',
                            fontSize: '12px',
                          }}
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="মোট টাকা (৳)"
                          value={saleTotalPriceInputs[row.product.id] ?? ''}
                          onChange={(e) =>
                            setSaleTotalPriceInputs((prev) => ({
                              ...prev,
                              [row.product.id]: e.target.value,
                            }))
                          }
                          style={{
                            flex: 1,
                            minWidth: '95px',
                            padding: '6px 8px',
                            borderRadius: '7px',
                            border: '1px solid #fda4af',
                            fontSize: '12px',
                          }}
                        />
                        <button
                          type="button"
                          disabled={isRowBusy || row.currentTrayStock <= 0}
                          onClick={() => {
                            const q = Math.max(1, Number(saleQtyInputs[row.product.id] || 1));
                            const customMoney = Number(
                              saleTotalPriceInputs[row.product.id] || q * row.unitPrice
                            );
                            handleTrayOperation({
                              row,
                              actionType: 'tray_sale',
                              quantity: q,
                              customTotalSaleAmount: customMoney,
                            });
                          }}
                          style={{
                            padding: '6px 11px',
                            borderRadius: '7px',
                            border: 'none',
                            background: '#e11d48',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                          }}
                        >
                          বিক্রি সেভ
                        </button>
                      </div>
                    </div>

                    {/* 3. Flexible / Custom Tray Capacity Selector */}
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '5px' }}>
                        📐 এই ট্রের ধারণক্ষমতা (ইচ্ছামতো যেকোনো সংখ্যা বা আনলিমিটেড):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                        {[
                          { cap: 0, label: 'ইচ্ছামতো (আনলিমিটেড)' },
                          { cap: 5, label: '৫ পিস' },
                          { cap: 10, label: '১০ পিস' },
                          { cap: 12, label: '১২ পিস' },
                          { cap: 15, label: '১৫ পিস' },
                          { cap: 20, label: '২০ পিস' },
                          { cap: 30, label: '৩০ পিস' },
                        ].map((preset) => (
                          <button
                            key={preset.cap}
                            type="button"
                            onClick={() => handleSaveTrayCapacity(row, preset.cap)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border:
                                row.trayCapacity === preset.cap
                                  ? '1px solid #0f766e'
                                  : '1px solid #cbd5e1',
                              background:
                                row.trayCapacity === preset.cap ? '#0f766e' : '#ffffff',
                              color: row.trayCapacity === preset.cap ? '#ffffff' : '#334155',
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <input
                          type="number"
                          min={0}
                          placeholder="কাস্টম ধারণক্ষমতা লিখুন (০ = ইচ্ছামতো)"
                          value={
                            capacityInputs[row.product.id] ??
                            (row.trayCapacity > 0 ? String(row.trayCapacity) : '')
                          }
                          onChange={(e) =>
                            setCapacityInputs((prev) => ({
                              ...prev,
                              [row.product.id]: e.target.value,
                            }))
                          }
                          style={{
                            flex: 1,
                            padding: '5px 8px',
                            borderRadius: '7px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12px',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTrayCapacity(row)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '7px',
                            border: '1px solid #0f766e',
                            background: '#ccfbf1',
                            color: '#0f766e',
                            fontWeight: 800,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                          }}
                        >
                          সেভ করুন
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredTrayRows.length === 0 && (
            <div
              className="panel"
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '28px 16px',
                color: '#64748b',
                fontWeight: 700,
              }}
            >
              আপনার সার্চের সাথে মিলে এমন কোনো ট্রে পাওয়া যায়নি।
            </div>
          )}
        </div>
      ) : (
        /* TABLE VIEW FOR DESKTOP / SPREADSHEET MODE */
        <section className="panel">
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="entry-table" style={{ minWidth: '1040px' }}>
              <thead>
                <tr>
                  <th>ট্রে নং ও পণ্য (SKU)</th>
                  <th>বর্তমান ট্রে-তে আছে</th>
                  <th>{targetDateShortLabel} ট্রে-তে গিয়েছে</th>
                  <th>{targetDateShortLabel} বিক্রি ও টাকা</th>
                  <th>মূল স্টকে বাকি</th>
                  <th>কে রেখেছে / আপডেট</th>
                  <th>অ্যাকশন, ভুল রিমুভ ও ট্রে শূন্যকরণ</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrayRows.map((row) => {
                  const isRowBusy = busyProductId === row.product.id;
                  return (
                    <tr key={row.product.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: '#0f172a',
                              color: '#5eead4',
                              fontWeight: 800,
                              fontSize: '11.5px',
                            }}
                          >
                            ট্রে #{toBengaliNumerals(row.trayNumber)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.product.name}</div>
                            <small style={{ color: '#64748b' }}>
                              SKU #{row.skuCode} • {money(row.unitPrice)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 900, color: row.currentTrayStock > 0 ? '#047857' : '#64748b' }}>
                          {toBengaliNumerals(row.currentTrayStock)}{' '}
                          {row.hasFixedCapacity
                            ? `/ ${toBengaliNumerals(row.trayCapacity)} পিস`
                            : 'পিস (ইচ্ছামতো)'}
                        </div>
                        <small style={{ color: '#475569' }}>মূল্য: {money(row.currentTraySellValue)}</small>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: '#0284c7' }}>
                          +{toBengaliNumerals(row.todayRefilledQty)} পিস
                        </div>
                        <small style={{ color: '#64748b' }}>{money(row.todayRefilledSellVal)}</small>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: '#be123c' }}>
                          {toBengaliNumerals(row.todaySoldQty)} পিস — {money(row.todaySoldRevenue)}
                        </div>
                        {!isEmployee && (
                          <small style={{ color: '#047857', fontWeight: 700 }}>
                            লাভ: +{money(row.todaySoldProfit)}
                          </small>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: '#6d28d9' }}>
                          {toBengaliNumerals(row.mainStock)} পিস
                        </div>
                        <small style={{ color: '#64748b' }}>{money(row.mainStockSellValue)}</small>
                      </td>
                      <td>
                        {row.lastUpdatedBy ? (
                          <div>
                            <span
                              style={{
                                fontWeight: 800,
                                color:
                                  row.lastUpdatedBy === 'Rakib'
                                    ? '#0369a1'
                                    : row.lastUpdatedBy === 'Limon'
                                    ? '#7e22ce'
                                    : '#0f766e',
                              }}
                            >
                              {row.lastUpdatedBy === 'Rakib' || row.lastUpdatedBy === 'Limon' ? '👤' : '👷'}{' '}
                              {formatActorLabel(row.lastUpdatedBy)}
                            </span>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{row.lastUpdatedAt}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            disabled={isRowBusy || row.mainStock <= 0}
                            onClick={() =>
                              handleTrayOperation({ row, actionType: 'scan_refill', quantity: 1 })
                            }
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #0284c7',
                              background: '#e0f2fe',
                              color: '#0369a1',
                              fontWeight: 800,
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            📥 +১
                          </button>
                          <button
                            type="button"
                            disabled={isRowBusy || row.mainStock <= 0}
                            onClick={() =>
                              handleTrayOperation({
                                row,
                                actionType: 'scan_refill',
                                quantity: row.mainStock,
                                customNote: `মূল স্টকের সম্পূর্ণ (${toBengaliNumerals(row.mainStock)} পিস) এক ক্লিকে ট্রে-তে রাখা হয়েছে`,
                              })
                            }
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #6d28d9',
                              background: '#f3e8ff',
                              color: '#5b21b6',
                              fontWeight: 800,
                              fontSize: '11px',
                              cursor: row.mainStock <= 0 ? 'not-allowed' : 'pointer',
                              opacity: row.mainStock <= 0 ? 0.5 : 1,
                            }}
                          >
                            📦 সব রাখুন (+{toBengaliNumerals(row.mainStock)})
                          </button>
                          <button
                            type="button"
                            disabled={isRowBusy || row.currentTrayStock <= 0}
                            onClick={() =>
                              handleTrayOperation({ row, actionType: 'tray_sale', quantity: 1 })
                            }
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #e11d48',
                              background: '#ffe4e6',
                              color: '#be123c',
                              fontWeight: 800,
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            🛒 -১ বিক্রি
                          </button>
                          {(row.currentTrayStock > 0 || row.myLatestLog) && (
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => {
                                if (row.myLatestLog) {
                                  handleRemoveWrongTrayLog(row.myLatestLog);
                                } else {
                                  handleTrayOperation({
                                    row,
                                    actionType: 'return_to_stock',
                                    quantity: 1,
                                    isWrongEntryRemoval: true,
                                  });
                                }
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #dc2626',
                                background: '#fef2f2',
                                color: '#dc2626',
                                fontWeight: 800,
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              🗑️ ভুল রিমুভ
                            </button>
                          )}
                          {row.currentTrayStock > 0 && (
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() =>
                                handleTrayOperation({
                                  row,
                                  actionType: 'return_to_stock',
                                  quantity: row.currentTrayStock,
                                })
                              }
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #ea580c',
                                background: '#ffedd5',
                                color: '#9a3412',
                                fontWeight: 800,
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              🧹 ট্রে ০ করুন
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* DETAILED WHO-UPDATED-WHAT & TRAY SALES LOG TIMELINE (WITH PROFILE-LOCKED WRONG ENTRY REMOVAL) */}
      <section className="panel">
        <div className="panel-head">
          <div className="panel-head-info">
            <h2>
              🕒 ট্রে আপডেট, বিক্রয় ও ভুল এন্ট্রি রিমুভ লগ ({toBengaliNumerals(filteredTimelineLogs.length)}টি রেকর্ড)
            </h2>
            <p>
              কোন ট্রে-তে কে কখন মাল রেখেছে বা বিক্রি করেছে তার ইতিহাস। ভুল এন্ট্রি হয়ে গেলে নিজ প্রোফাইল থেকে &ldquo;🗑️ ভুল এন্ট্রি রিমুভ&rdquo; বাটনে ক্লিক করে মুছে ফেলুন।
            </p>
          </div>
          <div className="inline-actions" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: 'সব রেকর্ড' },
                { id: 'refill_only', label: '📥 ট্রে-তে মাল রাখা' },
                { id: 'sale_only', label: '🛒 ট্রে থেকে বিক্রি' },
                { id: 'return_only', label: '🌙 ট্রে শূন্য / স্টকে ফেরত' },
              ] as const
            ).map((tabBtn) => (
              <button
                key={tabBtn.id}
                type="button"
                onClick={() => setLogActionFilter(tabBtn.id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    logActionFilter === tabBtn.id ? '1px solid #0f172a' : '1px solid #cbd5e1',
                  background: logActionFilter === tabBtn.id ? '#0f172a' : '#ffffff',
                  color: logActionFilter === tabBtn.id ? '#ffffff' : '#334155',
                }}
              >
                {tabBtn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="entry-table" style={{ minWidth: '860px' }}>
            <thead>
              <tr>
                <th>সময় ও তারিখ</th>
                <th>এন্ট্রিদাতা (প্রোফাইল)</th>
                <th>পণ্য ও SKU</th>
                <th>কাজের ধরন</th>
                <th>পরিমাণ ও টাকা</th>
                <th>ট্রে স্টক পরিবর্তন</th>
                <th>মূল স্টক পরিবর্তন</th>
                <th>ভুল এন্ট্রি রিমুভ</th>
              </tr>
            </thead>
            <tbody>
              {filteredTimelineLogs.map((log) => {
                const isRefill =
                  log.actionType === 'scan_refill' || log.actionType === 'tray_setup';
                const isSale = log.actionType === 'tray_sale';
                const isMyEntry = !log.actor || log.actor === lockedOperator;

                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{log.timestamp}</div>
                      <small style={{ color: '#64748b' }}>{dateLabel(log.date)}</small>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background:
                            log.actor === 'Rakib'
                              ? '#e0f2fe'
                              : log.actor === 'Limon'
                              ? '#f3e8ff'
                              : '#ccfbf1',
                          color:
                            log.actor === 'Rakib'
                              ? '#0369a1'
                              : log.actor === 'Limon'
                              ? '#7e22ce'
                              : '#0f766e',
                          fontWeight: 800,
                          fontSize: '11.5px',
                        }}
                      >
                        {log.actor === 'Rakib' || log.actor === 'Limon' ? '👤' : '👷'}{' '}
                        {formatActorLabel(log.actor)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{log.productName}</div>
                      <small style={{ color: '#64748b' }}>SKU #{log.skuCode}</small>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: isRefill
                            ? '#e0f2fe'
                            : isSale
                            ? '#ffe4e6'
                            : '#ffedd5',
                          color: isRefill
                            ? '#0369a1'
                            : isSale
                            ? '#be123c'
                            : '#9a3412',
                        }}
                      >
                        {isRefill
                          ? '📥 ট্রে-তে মাল রাখা'
                          : isSale
                          ? '🛒 ট্রে থেকে বিক্রি'
                          : log.actionType === 'shop_close_empty'
                          ? '🌙 দোকান বন্ধ (ট্রে শূন্য)'
                          : '↩️ স্টকে ফেরত ও ট্রে শূন্য'}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          fontWeight: 800,
                          color: isSale ? '#be123c' : '#0f172a',
                          fontSize: '12.5px',
                        }}
                      >
                        {toBengaliNumerals(log.quantity)} {log.unit || 'পিস'} —{' '}
                        {money(log.totalSellVal)}
                      </div>
                      {isSale && (
                        <small style={{ color: '#047857', fontWeight: 700 }}>
                          লাভ: +{money(log.expectedProfit)}
                        </small>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', fontWeight: 700 }}>
                      {toBengaliNumerals(log.prevTrayStock)} ➔{' '}
                      <span style={{ color: '#047857', fontWeight: 800 }}>
                        {toBengaliNumerals(log.newTrayStock)} পিস
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', fontWeight: 700 }}>
                      {toBengaliNumerals(log.prevMainStock)} ➔{' '}
                      <span style={{ color: '#6d28d9', fontWeight: 800 }}>
                        {toBengaliNumerals(log.newMainStock)} পিস
                      </span>
                    </td>
                    <td>
                      {isMyEntry ? (
                        <button
                          type="button"
                          disabled={undoingLogId === log.id}
                          onClick={() => handleRemoveWrongTrayLog(log)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '7px',
                            border: '1px solid #ef4444',
                            background: '#fef2f2',
                            color: '#dc2626',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          🗑️ ভুল এন্ট্রি রিমুভ
                        </button>
                      ) : (
                        <span
                          title="অন্য পার্টনারের প্রোফাইলের এন্ট্রি রিমুভ করা যাবে না"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '7px',
                            background: '#f1f5f9',
                            color: '#64748b',
                            fontSize: '11px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          🔒 {formatActorLabel(log.actor)}-এর এন্ট্রি
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredTimelineLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    এই ফিল্টারে কোনো ট্রে লগ পাওয়া যায়নি।
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
