import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CheckCircle2,
  History,
  Layers,
  Music,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type { Product, TrayRefillLogItem } from '../types';
import { formatBengaliDateTime, money, toBengaliNumerals } from '../accounting';
import {
  loadScannerSoundConfig,
  playScannerSound,
  saveScannerSoundConfig,
  SCANNER_SOUND_UPDATED_EVENT,
  unlockScannerAudio,
  type ScannerSoundConfig,
} from '../scannerSound';
import ScannerSoundSettingsCard from './ScannerSoundSettingsCard';
import {
  getEffectiveProductSku,
  matchProductBySkuClient,
  toStrictAllowedSkuClient,
} from './CameraAutoSaleModal';
import { extractSkuFromQrPayload } from './QrCodeAutoSaleModal';

const TRAY_LOGS_STORAGE_KEY = 'glowzaa_tray_refill_logs_v1';
export const TRAY_LOGS_UPDATED_EVENT = 'glowzaa_tray_logs_updated';

export function loadPersistedTrayLogs(): TrayRefillLogItem[] {
  try {
    const raw = localStorage.getItem(TRAY_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePersistedTrayLogs(logs: TrayRefillLogItem[]): void {
  try {
    localStorage.setItem(TRAY_LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 400)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(TRAY_LOGS_UPDATED_EVENT));
    }
  } catch {}
}

interface TrayStockRefillModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialTab?: 'scan_refill' | 'tray_board' | 'tray_ledger';
  initialActor?: 'Rakib' | 'Limon' | string;
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
    skuCode: string;
    actor: 'Rakib' | 'Limon' | string;
  }) => Promise<string | void>;
}

const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

export default function TrayStockRefillModal({
  isOpen,
  onClose,
  products,
  initialTab = 'scan_refill',
  initialActor = 'Rakib',
  onUpdateProductTrayAndStock,
  onRecordOptionalCashSale,
}: TrayStockRefillModalProps) {
  const [activeTab, setActiveTab] = useState<'scan_refill' | 'tray_board' | 'tray_ledger'>(initialTab);
  const actor: string = initialActor || 'Rakib';

  const [scanActionMode, setScanActionMode] = useState<'refill_from_stock' | 'tray_sale_deduct'>(
    'refill_from_stock'
  );
  const [qtyMode, setQtyMode] = useState<'fixed' | 'fill_deficit'>('fixed');
  const [scanQuantity, setScanQuantity] = useState<string>('1');
  const [defaultTrayCapacity] = useState<number>(12);
  const [alsoRecordMainSaleOnTraySell] = useState<boolean>(false);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string>('');
  const [autoScanEnabled] = useState<boolean>(true);
  const [manualSkuInput, setManualSkuInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const [soundConfig, setSoundConfig] = useState<ScannerSoundConfig>(() => loadScannerSoundConfig());
  const [showSoundSettingsPanel, setShowSoundSettingsPanel] = useState<boolean>(false);

  const [lastFlashLog, setLastFlashLog] = useState<TrayRefillLogItem | null>(null);
  const [trayLogs, setTrayLogs] = useState<TrayRefillLogItem[]>(() => loadPersistedTrayLogs());
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);

  const [boardSearch, setBoardSearch] = useState<string>('');
  const [boardFilter, setBoardFilter] = useState<'all' | 'needs_refill' | 'active_tray'>('all');
  const [capacityInputs, setCapacityInputs] = useState<Record<string, string>>({});
  const [customMoveQtyInputs, setCustomMoveQtyInputs] = useState<Record<string, string>>({});

  const [ledgerActionFilter, setLedgerActionFilter] = useState<
    'all' | 'scan_refill' | 'tray_sale' | 'tray_setup' | 'return_to_stock'
  >('all');
  const [ledgerDateFilter, setLedgerDateFilter] = useState<'all' | 'today'>('all');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const productsRef = useRef<Product[]>(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const scanQuantityRef = useRef<string>(scanQuantity);
  useEffect(() => {
    scanQuantityRef.current = scanQuantity;
  }, [scanQuantity]);

  const qtyModeRef = useRef<'fixed' | 'fill_deficit'>(qtyMode);
  useEffect(() => {
    qtyModeRef.current = qtyMode;
  }, [qtyMode]);

  const scanActionModeRef = useRef<'refill_from_stock' | 'tray_sale_deduct'>(scanActionMode);
  useEffect(() => {
    scanActionModeRef.current = scanActionMode;
  }, [scanActionMode]);

  const autoScanEnabledRef = useRef<boolean>(autoScanEnabled);
  useEffect(() => {
    autoScanEnabledRef.current = autoScanEnabled;
  }, [autoScanEnabled]);

  const soundEnabledRef = useRef<boolean>(soundConfig.enabled);
  useEffect(() => {
    soundEnabledRef.current = soundConfig.enabled;
  }, [soundConfig.enabled]);

  // Strict 1-Scan-Per-Hold Lock
  const activeHeldSkuRef = useRef<string>('');
  const lastSkuSeenAtRef = useRef<number>(0);
  const lastSoldSnapshotRef = useRef<Uint8Array | null>(null);
  const inFlightSkuRef = useRef<boolean>(false);

  useEffect(() => {
    const syncSound = () => setSoundConfig(loadScannerSoundConfig());
    const syncTrayLogs = () => setTrayLogs(loadPersistedTrayLogs());
    window.addEventListener(SCANNER_SOUND_UPDATED_EVENT, syncSound);
    window.addEventListener(TRAY_LOGS_UPDATED_EVENT, syncTrayLogs);
    return () => {
      window.removeEventListener(SCANNER_SOUND_UPDATED_EVENT, syncSound);
      window.removeEventListener(TRAY_LOGS_UPDATED_EVENT, syncTrayLogs);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    } else {
      stopCamera();
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && activeTab === 'scan_refill') {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, facingMode]);

  const captureFrameLuma = (ctx: CanvasRenderingContext2D, w: number, h: number): Uint8Array => {
    const out = new Uint8Array(64);
    try {
      const stepX = Math.max(1, Math.floor(w / 8));
      const stepY = Math.max(1, Math.floor(h / 8));
      let idx = 0;
      for (let gy = 0; gy < 8; gy++) {
        for (let gx = 0; gx < 8; gx++) {
          const px = Math.min(w - 1, gx * stepX + Math.floor(stepX / 2));
          const py = Math.min(h - 1, gy * stepY + Math.floor(stepY / 2));
          const d = ctx.getImageData(px, py, 1, 1).data;
          out[idx++] = Math.round(0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]);
        }
      }
    } catch {}
    return out;
  };

  const hasSceneChangedSignificantly = (a: Uint8Array | null, b: Uint8Array | null): boolean => {
    if (!a || !b || a.length !== b.length) return true;
    let diffSum = 0;
    for (let i = 0; i < a.length; i++) {
      diffSum += Math.abs(a[i] - b[i]);
    }
    return diffSum / a.length >= 26;
  };

  const stopCamera = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60, min: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      startContinuousScanLoop();
    } catch (err: any) {
      console.warn('Tray camera error:', err);
      setCameraError(
        'ক্যামেরা চালু করা যায়নি। নিচের বক্সে সরাসরি SKU নাম্বার লিখে অথবা ১-ট্যাপ বাটনে চাপ দিয়ে ট্রে রিফিল করুন।'
      );
      setCameraActive(false);
    }
  };

  const executeTrayMovement = async (params: {
    product: Product;
    actionType: 'scan_refill' | 'tray_sale' | 'tray_setup' | 'return_to_stock';
    requestedQty?: number;
    customCapacity?: number;
    notes?: string;
    fromScanner?: boolean;
  }) => {
    const { product, actionType, requestedQty, customCapacity, notes, fromScanner } = params;
    if (inFlightSkuRef.current) return;
    inFlightSkuRef.current = true;
    setIsProcessing(true);

    try {
      const currentList = productsRef.current;
      const idx = currentList.findIndex((p) => p.id === product.id);
      const liveProd = idx >= 0 ? currentList[idx] : product;
      const skuCode = getEffectiveProductSku(liveProd, idx >= 0 ? idx : 0);

      const prevMainStock = Math.max(0, Number(liveProd.currentStock || 0));
      const prevTrayStock = Math.max(0, Number(liveProd.trayStock || 0));
      const trayCap = Math.max(
        1,
        Number(customCapacity ?? liveProd.trayCapacity ?? defaultTrayCapacity ?? 12)
      );
      const prevTotalRefilled = Math.max(0, Number(liveProd.totalTrayRefilled || 0));
      const prevTotalSold = Math.max(0, Number(liveProd.totalTraySold || 0));

      let moveQty = Math.max(1, Number(requestedQty || 1));

      if (actionType === 'scan_refill') {
        if (fromScanner && qtyModeRef.current === 'fill_deficit') {
          const deficit = Math.max(0, trayCap - prevTrayStock);
          moveQty = deficit > 0 ? deficit : Math.max(1, Number(scanQuantityRef.current) || 1);
        }
        if (prevMainStock <= 0) {
          setCameraError(`⚠️ "${liveProd.name}"-এর মূল স্টক শেষ (০)! ট্রে-তে তোলার মতো স্টক নেই।`);
          return;
        }
        moveQty = Math.min(moveQty, prevMainStock);
      } else if (actionType === 'tray_sale') {
        if (prevTrayStock <= 0) {
          setCameraError(
            `⚠️ "${liveProd.name}"-এর ট্রে-তে কোনো প্রডাক্ট নেই (০)! আগে মূল স্টক থেকে ট্রে-তে তুলুন।`
          );
          return;
        }
        moveQty = Math.min(moveQty, prevTrayStock);
      } else if (actionType === 'return_to_stock') {
        if (prevTrayStock <= 0) return;
        moveQty = Math.min(moveQty, prevTrayStock);
      } else if (actionType === 'tray_setup') {
        const neededToFill = Math.max(0, trayCap - prevTrayStock);
        moveQty = requestedQty !== undefined ? Math.max(1, requestedQty) : neededToFill;
        if (moveQty <= 0) {
          setCameraError(
            `✅ "${liveProd.name}"-এর ট্রে ইতিমধ্যে পূর্ণ আছে (${toBengaliNumerals(
              prevTrayStock
            )}/${toBengaliNumerals(trayCap)} পিস)!`
          );
          return;
        }
        if (prevMainStock <= 0) {
          setCameraError(`⚠️ "${liveProd.name}"-এর মূল স্টক শেষ (০)!`);
          return;
        }
        moveQty = Math.min(moveQty, prevMainStock);
      }

      let newMainStock = prevMainStock;
      let newTrayStock = prevTrayStock;
      let newTotalRefilled = prevTotalRefilled;
      let newTotalSold = prevTotalSold;

      if (actionType === 'scan_refill' || actionType === 'tray_setup') {
        newMainStock = Math.max(0, prevMainStock - moveQty);
        newTrayStock = prevTrayStock + moveQty;
        newTotalRefilled = prevTotalRefilled + moveQty;
      } else if (actionType === 'tray_sale') {
        newTrayStock = Math.max(0, prevTrayStock - moveQty);
        newTotalSold = prevTotalSold + moveQty;
      } else if (actionType === 'return_to_stock') {
        newTrayStock = Math.max(0, prevTrayStock - moveQty);
        newMainStock = prevMainStock + moveQty;
        newTotalRefilled = Math.max(0, prevTotalRefilled - moveQty);
      }

      const unitCost = Number(liveProd.averageCost || 0);
      const unitPrice = Number(liveProd.sellingPrice || 0);
      const totalCostVal = Math.round(moveQty * unitCost * 100) / 100;
      const totalSellVal = Math.round(moveQty * unitPrice * 100) / 100;
      const expectedProfit = Math.round((totalSellVal - totalCostVal) * 100) / 100;

      const logItem: TrayRefillLogItem = {
        id: `tray_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        productId: liveProd.id,
        productName: liveProd.name,
        skuCode,
        unit: liveProd.unit || 'পিস',
        actionType,
        quantity: moveQty,
        unitCost,
        unitPrice,
        totalCostVal,
        totalSellVal,
        expectedProfit,
        prevMainStock,
        newMainStock,
        prevTrayStock,
        newTrayStock,
        trayCapacity: trayCap,
        actor,
        date: todayYmd(),
        timestamp: formatBengaliDateTime(new Date()),
        createdAtMs: Date.now(),
        notes:
          notes ||
          (actionType === 'scan_refill'
            ? `স্ক্যান করে মূল স্টক থেকে ${toBengaliNumerals(moveQty)} ${
                liveProd.unit || 'পিস'
              } ট্রে-তে রাখা হয়েছে`
            : actionType === 'tray_setup'
            ? `ট্রে সাজাতে মূল স্টক থেকে ${toBengaliNumerals(moveQty)} ${
                liveProd.unit || 'পিস'
              } ট্রে-তে রাখা হয়েছে`
            : actionType === 'tray_sale'
            ? `ট্রে থেকে ${toBengaliNumerals(moveQty)} ${
                liveProd.unit || 'পিস'
              } বিক্রি হয়েছে (ট্রে-তে বাকি: ${toBengaliNumerals(newTrayStock)}/${toBengaliNumerals(
                trayCap
              )})`
            : `ট্রে থেকে ${toBengaliNumerals(moveQty)} ${
                liveProd.unit || 'পিস'
              } মূল স্টকে ফেরত নেওয়া হয়েছে`),
      };

      if (soundEnabledRef.current) {
        playScannerSound('success');
      }

      setLastFlashLog(logItem);
      setCameraError('');

      const updatedLogs = [logItem, ...trayLogs].slice(0, 400);
      setTrayLogs(updatedLogs);
      savePersistedTrayLogs(updatedLogs);

      const prevTotalSoldAmount = Math.max(0, Number(liveProd.totalTraySoldAmount || 0));
      const newTotalSoldAmount =
        actionType === 'tray_sale'
          ? Math.round((prevTotalSoldAmount + totalSellVal) * 100) / 100
          : prevTotalSoldAmount;

      await onUpdateProductTrayAndStock(
        liveProd,
        {
          currentStock: newMainStock,
          trayStock: newTrayStock,
          trayCapacity: trayCap,
          totalTrayRefilled: newTotalRefilled,
          totalTraySold: newTotalSold,
          totalTraySoldAmount: newTotalSoldAmount,
          lastTrayUpdatedBy: actor,
          lastTrayUpdatedAt: logItem.timestamp,
        },
        logItem
      );

      if (actionType === 'tray_sale' && alsoRecordMainSaleOnTraySell && onRecordOptionalCashSale) {
        await onRecordOptionalCashSale({
          product: liveProd,
          quantity: moveQty,
          skuCode,
          actor,
        });
      }
    } finally {
      inFlightSkuRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleUndoTrayLog = async (log: TrayRefillLogItem) => {
    if (undoingLogId) return;
    if (log.actor && log.actor !== actor) {
      setCameraError(
        `🔒 এটি 👤 ${
          log.actor === 'Rakib' ? 'রাকিব' : log.actor === 'Limon' ? 'লিমন' : log.actor
        }-এর প্রোফাইল থেকে করা এন্ট্রি। শুধুমাত্র নিজ প্রোফাইলের ভুল এন্ট্রি রিমুভ করা যাবে!`
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

      let restoredMain = curMain;
      let restoredTray = curTray;
      let restoredRefilled = curRefilled;
      let restoredSold = curSold;

      if (log.actionType === 'scan_refill' || log.actionType === 'tray_setup') {
        restoredMain = curMain + log.quantity;
        restoredTray = Math.max(0, curTray - log.quantity);
        restoredRefilled = Math.max(0, curRefilled - log.quantity);
      } else if (log.actionType === 'tray_sale') {
        restoredTray = curTray + log.quantity;
        restoredSold = Math.max(0, curSold - log.quantity);
      } else if (log.actionType === 'return_to_stock') {
        restoredMain = Math.max(0, curMain - log.quantity);
        restoredTray = curTray + log.quantity;
        restoredRefilled = curRefilled + log.quantity;
      } else if (log.actionType === 'shop_close_empty') {
        restoredTray = curTray + log.quantity;
      }

      const undoMarkerLog: TrayRefillLogItem = {
        ...log,
        id: `undo_${Date.now()}`,
        notes: `↩️ বাতিল করা হয়েছে: ${log.notes || ''}`,
      };

      await onUpdateProductTrayAndStock(
        prod,
        {
          currentStock: restoredMain,
          trayStock: restoredTray,
          trayCapacity: curCap,
          totalTrayRefilled: restoredRefilled,
          totalTraySold: restoredSold,
        },
        undoMarkerLog
      );

      const remaining = trayLogs.filter((item) => item.id !== log.id);
      setTrayLogs(remaining);
      savePersistedTrayLogs(remaining);
      if (lastFlashLog?.id === log.id) {
        setLastFlashLog(null);
      }
    } finally {
      setUndoingLogId(null);
    }
  };

  const startContinuousScanLoop = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    let barcodeDetector: any = null;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a'],
        });
      } catch {}
    }

    let lastProcessTime = 0;

    const tick = async (now: number) => {
      rafIdRef.current = requestAnimationFrame(tick);

      if (!autoScanEnabledRef.current || inFlightSkuRef.current) return;
      if (now - lastProcessTime < 35) return;
      lastProcessTime = now;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const targetW = Math.min(360, vw);
      const targetH = Math.round((vh / vw) * targetW);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, targetW, targetH);

      let rawCode = '';

      try {
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        const qrResult = jsQR(imageData.data, targetW, targetH, {
          inversionAttempts: 'dontInvert',
        });
        if (qrResult && qrResult.data) {
          rawCode = qrResult.data;
        }
      } catch {}

      if (!rawCode && barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(canvas);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            rawCode = String(barcodes[0].rawValue);
          }
        } catch {}
      }

      const currentFrameLuma = captureFrameLuma(ctx, targetW, targetH);

      if (!rawCode) {
        if (
          activeHeldSkuRef.current &&
          Date.now() - lastSkuSeenAtRef.current > 650 &&
          hasSceneChangedSignificantly(lastSoldSnapshotRef.current, currentFrameLuma)
        ) {
          activeHeldSkuRef.current = '';
          lastSoldSnapshotRef.current = null;
        }
        return;
      }

      const extractedSku = extractSkuFromQrPayload(rawCode);
      if (!extractedSku) return;

      const matched = matchProductBySkuClient(extractedSku, productsRef.current);
      if (!matched) return;

      const matchedSku = matched.matchedSku;
      lastSkuSeenAtRef.current = Date.now();

      if (activeHeldSkuRef.current === matchedSku) {
        return;
      }

      activeHeldSkuRef.current = matchedSku;
      lastSoldSnapshotRef.current = currentFrameLuma;

      const fixedQty = Math.max(1, Number(scanQuantityRef.current) || 1);
      const actionType =
        scanActionModeRef.current === 'refill_from_stock' ? 'scan_refill' : 'tray_sale';

      await executeTrayMovement({
        product: matched.product,
        actionType,
        requestedQty: fixedQty,
        fromScanner: true,
      });
    };

    rafIdRef.current = requestAnimationFrame(tick);
  };

  const handleManualSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = toStrictAllowedSkuClient(manualSkuInput);
    if (!cleaned) {
      setCameraError('সঠিক SKU কোড লিখুন (যেমন: 1, 2, 3...)');
      return;
    }
    const matched = matchProductBySkuClient(cleaned, products);
    if (!matched) {
      setCameraError(`SKU #${cleaned} দিয়ে কোনো প্রডাক্ট পাওয়া যায়নি।`);
      return;
    }
    unlockScannerAudio();
    const fixedQty = Math.max(1, Number(scanQuantity) || 1);
    await executeTrayMovement({
      product: matched.product,
      actionType: scanActionMode === 'refill_from_stock' ? 'scan_refill' : 'tray_sale',
      requestedQty: fixedQty,
      fromScanner: true,
    });
    setManualSkuInput('');
  };

  const enrichedProducts = useMemo(() => {
    return products.map((p, index) => {
      const displaySku = getEffectiveProductSku(p, index);
      const mainStock = Math.max(0, Number(p.currentStock || 0));
      const trayStock = Math.max(0, Number(p.trayStock || 0));
      const trayCapacity = Math.max(1, Number(p.trayCapacity || defaultTrayCapacity || 12));
      const totalTrayRefilled = Math.max(0, Number(p.totalTrayRefilled || 0));
      const totalTraySold = Math.max(0, Number(p.totalTraySold || 0));
      const hasActiveTray =
        p.trayStock !== undefined || totalTrayRefilled > 0 || totalTraySold > 0;
      const deficit = Math.max(0, trayCapacity - trayStock);

      return {
        product: p,
        displaySku,
        mainStock,
        trayStock,
        trayCapacity,
        totalTrayRefilled,
        totalTraySold,
        hasActiveTray,
        deficit,
      };
    });
  }, [products, defaultTrayCapacity]);

  const traySummary = useMemo(() => {
    let totalOnTrayNow = 0;
    let totalTrayValueNow = 0;
    let totalDeficitNeeded = 0;
    let activeTrayProductsCount = 0;
    let needsRefillProductsCount = 0;
    let totalMainStockLeft = 0;

    for (const item of enrichedProducts) {
      totalMainStockLeft += item.mainStock;
      if (item.hasActiveTray || item.trayStock > 0) {
        activeTrayProductsCount += 1;
        totalOnTrayNow += item.trayStock;
        totalTrayValueNow += item.trayStock * Number(item.product.sellingPrice || 0);
        if (item.deficit > 0) {
          totalDeficitNeeded += item.deficit;
          needsRefillProductsCount += 1;
        }
      }
    }

    const todayStr = todayYmd();
    let totalRefilledPiecesAllTime = 0;
    let totalRefilledCostAllTime = 0;
    let totalRefilledSellValAllTime = 0;
    let totalRefilledProfitAllTime = 0;
    let todayRefilledPieces = 0;
    let todayRefilledSellVal = 0;

    for (const log of trayLogs) {
      if (log.actionType === 'scan_refill' || log.actionType === 'tray_setup') {
        totalRefilledPiecesAllTime += log.quantity;
        totalRefilledCostAllTime += log.totalCostVal;
        totalRefilledSellValAllTime += log.totalSellVal;
        totalRefilledProfitAllTime += log.expectedProfit;
        if (log.date === todayStr) {
          todayRefilledPieces += log.quantity;
          todayRefilledSellVal += log.totalSellVal;
        }
      } else if (log.actionType === 'return_to_stock') {
        totalRefilledPiecesAllTime = Math.max(0, totalRefilledPiecesAllTime - log.quantity);
        totalRefilledCostAllTime = Math.max(0, totalRefilledCostAllTime - log.totalCostVal);
        totalRefilledSellValAllTime = Math.max(0, totalRefilledSellValAllTime - log.totalSellVal);
        totalRefilledProfitAllTime = Math.max(0, totalRefilledProfitAllTime - log.expectedProfit);
      }
    }

    return {
      totalOnTrayNow,
      totalTrayValueNow,
      totalDeficitNeeded,
      activeTrayProductsCount,
      needsRefillProductsCount,
      totalMainStockLeft,
      totalRefilledPiecesAllTime,
      totalRefilledCostAllTime,
      totalRefilledSellValAllTime,
      totalRefilledProfitAllTime,
      todayRefilledPieces,
      todayRefilledSellVal,
    };
  }, [enrichedProducts, trayLogs]);

  const filteredBoardProducts = useMemo(() => {
    const rawTrimmed = boardSearch.trim();
    const qNorm = rawTrimmed
      .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
      .toLowerCase();
    const cleanedNum = qNorm
      .replace(/^(ট্রে|tray|sku|নং|নাম্বার|no|id|#|\s|:|-)+/gi, '')
      .replace(/(নং|পিস|#|\s)+$/gi, '')
      .trim();
    const isExactNumQuery = /^\d+$/.test(cleanedNum);

    return enrichedProducts
      .filter((item, idx) => {
        if (boardFilter === 'needs_refill' && !(item.hasActiveTray && item.deficit > 0)) {
          return false;
        }
        if (boardFilter === 'active_tray' && !item.hasActiveTray && item.trayStock <= 0) {
          return false;
        }
        if (qNorm) {
          const itemSkuNorm = item.displaySku
            .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
            .replace(/^#/, '')
            .trim()
            .toLowerCase();
          if (isExactNumQuery) {
            return (
              itemSkuNorm === cleanedNum ||
              Number(itemSkuNorm) === Number(cleanedNum) ||
              idx + 1 === Number(cleanedNum)
            );
          }
          return (
            item.product.name.toLowerCase().includes(qNorm) || itemSkuNorm === qNorm
          );
        }
        return true;
      })
      .sort((a, b) => {
        const aIsCrab =
          a.product.name.includes('কাকড়া') || a.product.name.includes('কাঁকড়া') ? 1 : 0;
        const bIsCrab =
          b.product.name.includes('কাকড়া') || b.product.name.includes('কাঁকড়া') ? 1 : 0;
        if (aIsCrab !== bIsCrab) return bIsCrab - aIsCrab;
        if (a.hasActiveTray !== b.hasActiveTray) return a.hasActiveTray ? -1 : 1;
        if (a.deficit !== b.deficit) return b.deficit - a.deficit;
        return 0;
      });
  }, [enrichedProducts, boardSearch, boardFilter]);

  const filteredLedgerLogs = useMemo(() => {
    const rawTrimmed = ledgerSearch.trim();
    const qNorm = rawTrimmed
      .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
      .toLowerCase();
    const cleanedNum = qNorm
      .replace(/^(ট্রে|tray|sku|নং|নাম্বার|no|id|#|\s|:|-)+/gi, '')
      .replace(/(নং|পিস|#|\s)+$/gi, '')
      .trim();
    const isExactNumQuery = /^\d+$/.test(cleanedNum);

    const todayStr = todayYmd();
    return trayLogs.filter((log) => {
      if (ledgerActionFilter !== 'all' && log.actionType !== ledgerActionFilter) return false;
      if (ledgerDateFilter === 'today' && log.date !== todayStr) return false;
      if (qNorm) {
        const logSkuNorm = String(log.skuCode || '')
          .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
          .replace(/^#/, '')
          .trim()
          .toLowerCase();
        if (isExactNumQuery) {
          return logSkuNorm === cleanedNum || Number(logSkuNorm) === Number(cleanedNum);
        }
        const hay = `${log.productName} ${log.notes || ''}`.toLowerCase();
        if (!hay.includes(qNorm) && logSkuNorm !== qNorm) return false;
      }
      return true;
    });
  }, [trayLogs, ledgerActionFilter, ledgerDateFilter, ledgerSearch]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.8)',
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
          width: '100%',
          maxWidth: '510px',
          maxHeight: 'calc(100dvh - 20px)',
          borderRadius: '20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#0b1322',
          color: '#f8fafc',
          border: '1.5px solid rgba(245, 158, 11, 0.42)',
          boxShadow: '0 24px 60px rgba(2, 6, 23, 0.88)',
        }}
      >
        {/* SLEEK COMPACT HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '11px 13px',
            background: 'linear-gradient(135deg, #b45309 0%, #d97706 48%, #0d9488 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.16)',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.18)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '18px',
              }}
            >
              🍱
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '14.5px',
                  fontWeight: 900,
                  color: '#ffffff',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                🍱 মেলার ট্রে ডিসপ্লে ও স্ক্যান রিফিল
              </h3>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '11px',
                  color: '#fef3c7',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                নতুন প্রডাক্ট ট্রে-তে রাখলে মূল স্টক কমবে ও হিসাব আলাদা থাকবে
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                unlockScannerAudio();
                setShowSoundSettingsPanel((v) => !v);
              }}
              style={{
                height: '34px',
                padding: '0 9px',
                borderRadius: '9px',
                background: showSoundSettingsPanel ? '#ffffff' : 'rgba(15, 23, 42, 0.35)',
                color: showSoundSettingsPanel ? '#b45309' : '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.28)',
                fontSize: '11.5px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
              title="স্ক্যানার সাউন্ড সেটিংস"
            >
              <Music size={13} />
              <span>সাউন্ড</span>
            </button>

            <button
              type="button"
              onClick={() => {
                unlockScannerAudio();
                const updated = saveScannerSoundConfig({ enabled: !soundConfig.enabled });
                setSoundConfig(updated);
              }}
              style={{
                width: '34px',
                height: '34px',
                padding: 0,
                borderRadius: '9px',
                background: 'rgba(15, 23, 42, 0.35)',
                color: soundConfig.enabled ? '#6ee7b7' : '#fca5a5',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={soundConfig.enabled ? 'সাউন্ড চালু আছে' : 'সাউন্ড মিউট আছে'}
            >
              {soundConfig.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>

            {activeTab === 'scan_refill' && (
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                style={{
                  width: '34px',
                  height: '34px',
                  padding: 0,
                  borderRadius: '9px',
                  background: 'rgba(15, 23, 42, 0.35)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="ক্যামেরা পরিবর্তন করুন"
              >
                <RefreshCw size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="বন্ধ করুন"
              style={{
                width: '34px',
                height: '34px',
                padding: 0,
                borderRadius: '9px',
                background: 'rgba(239, 68, 68, 0.32)',
                color: '#ffffff',
                border: '1px solid rgba(252, 165, 165, 0.45)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* 4 COMPACT SUMMARY KPI CARDS (2x2 GRID) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '6px',
            padding: '8px 12px',
            background: '#0f172a',
            borderBottom: '1px solid #1e293b',
            flexShrink: 0,
          }}
        >
          {/* Card 1 */}
          <div
            style={{
              background: '#131f33',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '7px 9px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: '#94a3b8',
                fontWeight: 700,
              }}
            >
              <span>🍱 ট্রে-তে বর্তমান</span>
              <span style={{ color: '#fbbf24' }}>
                {toBengaliNumerals(traySummary.activeTrayProductsCount)}টি ট্রে
              </span>
            </div>
            <div
              style={{
                fontSize: '14.5px',
                fontWeight: 900,
                color: '#ffffff',
                marginTop: '1px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {toBengaliNumerals(traySummary.totalOnTrayNow)} পিস
              <span
                style={{
                  fontSize: '11px',
                  color: '#34d399',
                  fontWeight: 700,
                  marginLeft: '6px',
                }}
              >
                ({money(traySummary.totalTrayValueNow)})
              </span>
            </div>
          </div>

          {/* Card 2 */}
          <div
            style={{
              background:
                traySummary.totalDeficitNeeded > 0 ? 'rgba(180, 83, 9, 0.2)' : '#131f33',
              border:
                traySummary.totalDeficitNeeded > 0
                  ? '1px solid rgba(245, 158, 11, 0.5)'
                  : '1px solid #1e293b',
              borderRadius: '10px',
              padding: '7px 9px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: '#fcd34d',
                fontWeight: 700,
              }}
            >
              <span>⚠️ ট্রে পূর্ণ করতে লাগবে</span>
              <span>{toBengaliNumerals(traySummary.needsRefillProductsCount)}টি পণ্য</span>
            </div>
            <div
              style={{
                fontSize: '14.5px',
                fontWeight: 900,
                color: '#fbbf24',
                marginTop: '1px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {toBengaliNumerals(traySummary.totalDeficitNeeded)} পিস খালি
            </div>
          </div>

          {/* Card 3 */}
          <div
            style={{
              background: 'rgba(13, 148, 136, 0.14)',
              border: '1px solid rgba(45, 212, 191, 0.35)',
              borderRadius: '10px',
              padding: '7px 9px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: '#5eead4',
                fontWeight: 700,
              }}
            >
              <span>📥 ট্রে রিফিল (আলাদা হিসাব)</span>
              <span>আজ: {toBengaliNumerals(traySummary.todayRefilledPieces)} পিস</span>
            </div>
            <div
              style={{
                fontSize: '13.5px',
                fontWeight: 900,
                color: '#ffffff',
                marginTop: '1px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              মোট {toBengaliNumerals(traySummary.totalRefilledPiecesAllTime)} পিস •{' '}
              <span style={{ color: '#34d399' }}>
                {money(traySummary.totalRefilledSellValAllTime)}
              </span>
            </div>
          </div>

          {/* Card 4 */}
          <div
            style={{
              background: '#131f33',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '7px 9px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: '#94a3b8',
                fontWeight: 700,
              }}
            >
              <span>📦 মূল স্টকে অবশিষ্ট</span>
              <span style={{ color: '#38bdf8' }}>
                {toBengaliNumerals(products.length)}টি পণ্য
              </span>
            </div>
            <div
              style={{
                fontSize: '14.5px',
                fontWeight: 900,
                color: '#7dd3fc',
                marginTop: '1px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {toBengaliNumerals(traySummary.totalMainStockLeft)} পিস
            </div>
          </div>
        </div>

        {/* 3 SEGMENTED NAVIGATION TABS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '6px',
            padding: '8px 12px',
            background: '#0b1322',
            borderBottom: '1px solid #1e293b',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('scan_refill')}
            style={{
              height: '35px',
              padding: '0 6px',
              borderRadius: '10px',
              border:
                activeTab === 'scan_refill'
                  ? '1.5px solid rgba(251, 191, 36, 0.85)'
                  : '1px solid #334155',
              background:
                activeTab === 'scan_refill'
                  ? 'linear-gradient(135deg, #d97706, #ea580c)'
                  : '#1e293b',
              color: activeTab === 'scan_refill' ? '#ffffff' : '#94a3b8',
              fontSize: '11.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Camera size={13} />
            <span>📷 স্ক্যান রিফিল</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tray_board')}
            style={{
              height: '35px',
              padding: '0 6px',
              borderRadius: '10px',
              border:
                activeTab === 'tray_board'
                  ? '1.5px solid rgba(45, 212, 191, 0.85)'
                  : '1px solid #334155',
              background:
                activeTab === 'tray_board'
                  ? 'linear-gradient(135deg, #0d9488, #059669)'
                  : '#1e293b',
              color: activeTab === 'tray_board' ? '#ffffff' : '#94a3b8',
              fontSize: '11.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Layers size={13} />
            <span>🍱 ট্রে বোর্ড ({toBengaliNumerals(traySummary.needsRefillProductsCount)})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tray_ledger')}
            style={{
              height: '35px',
              padding: '0 6px',
              borderRadius: '10px',
              border:
                activeTab === 'tray_ledger'
                  ? '1.5px solid rgba(167, 139, 250, 0.85)'
                  : '1px solid #334155',
              background:
                activeTab === 'tray_ledger'
                  ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                  : '#1e293b',
              color: activeTab === 'tray_ledger' ? '#ffffff' : '#94a3b8',
              fontSize: '11.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <History size={13} />
            <span>📋 আলাদা হিসাব ({toBengaliNumerals(trayLogs.length)})</span>
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div
          style={{
            padding: '10px 12px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {showSoundSettingsPanel && (
            <div style={{ flexShrink: 0 }}>
              <ScannerSoundSettingsCard compact />
            </div>
          )}

          {/* INSTANT FLASH CONFIRMATION BANNER */}
          {lastFlashLog && (
            <div
              style={{
                background: 'rgba(6, 78, 59, 0.88)',
                border: '1.5px solid #10b981',
                borderRadius: '12px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <CheckCircle2 size={18} style={{ color: '#34d399', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff' }}>
                    {lastFlashLog.actionType === 'scan_refill' ||
                    lastFlashLog.actionType === 'tray_setup'
                      ? `✅ ট্রে-তে যুক্ত: +${toBengaliNumerals(lastFlashLog.quantity)} ${lastFlashLog.unit} ${lastFlashLog.productName} (SKU #${lastFlashLog.skuCode})`
                      : lastFlashLog.actionType === 'tray_sale'
                      ? `🛒 ট্রে থেকে বিক্রি: -${toBengaliNumerals(lastFlashLog.quantity)} ${lastFlashLog.unit} ${lastFlashLog.productName}`
                      : `↩️ মূল স্টকে ফেরত: ${toBengaliNumerals(lastFlashLog.quantity)} ${lastFlashLog.unit} ${lastFlashLog.productName}`}
                  </div>
                  <div style={{ fontSize: '11px', color: '#a7f3d0', marginTop: '2px' }}>
                    🍱 ট্রে: <b>{toBengaliNumerals(lastFlashLog.prevTrayStock)}</b> →{' '}
                    <b style={{ color: '#fde68a' }}>
                      {toBengaliNumerals(lastFlashLog.newTrayStock)}/
                      {toBengaliNumerals(lastFlashLog.trayCapacity)}
                    </b>{' '}
                    | 📦 মূল স্টক: <b>{toBengaliNumerals(lastFlashLog.prevMainStock)}</b> →{' '}
                    <b style={{ color: '#7dd3fc' }}>
                      {toBengaliNumerals(lastFlashLog.newMainStock)}
                    </b>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={undoingLogId === lastFlashLog.id}
                onClick={() => handleUndoTrayLog(lastFlashLog)}
                style={{
                  height: '28px',
                  padding: '0 9px',
                  borderRadius: '8px',
                  background: '#e11d48',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <RotateCcw size={11} />
                <span>বাতিল</span>
              </button>
            </div>
          )}

          {/* ERROR / INFO BANNER */}
          {cameraError && (
            <div
              style={{
                background: 'rgba(127, 29, 29, 0.75)',
                border: '1px solid rgba(248, 113, 113, 0.5)',
                borderRadius: '10px',
                padding: '8px 10px',
                fontSize: '11.5px',
                color: '#fecaca',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span>{cameraError}</span>
              <button
                type="button"
                onClick={() => setCameraError('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 1: SCAN TO REFILL TRAY                                        */}
          {/* ================================================================= */}
          {activeTab === 'scan_refill' && (
            <>
              {/* Control Card: Mode Switch + Quantity Presets */}
              <div
                style={{
                  background: '#131f33',
                  borderRadius: '12px',
                  border: '1px solid #1e293b',
                  padding: '9px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  flexShrink: 0,
                }}
              >
                {/* Mode Selector Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setScanActionMode('refill_from_stock')}
                    style={{
                      padding: '7px 8px',
                      borderRadius: '9px',
                      border:
                        scanActionMode === 'refill_from_stock'
                          ? '1.5px solid #f59e0b'
                          : '1px solid #334155',
                      background:
                        scanActionMode === 'refill_from_stock'
                          ? 'rgba(245, 158, 11, 0.18)'
                          : '#0f172a',
                      color: scanActionMode === 'refill_from_stock' ? '#fde68a' : '#94a3b8',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    📥 মূল স্টক → ট্রে রিফিল
                  </button>

                  <button
                    type="button"
                    onClick={() => setScanActionMode('tray_sale_deduct')}
                    style={{
                      padding: '7px 8px',
                      borderRadius: '9px',
                      border:
                        scanActionMode === 'tray_sale_deduct'
                          ? '1.5px solid #10b981'
                          : '1px solid #334155',
                      background:
                        scanActionMode === 'tray_sale_deduct'
                          ? 'rgba(16, 185, 129, 0.18)'
                          : '#0f172a',
                      color: scanActionMode === 'tray_sale_deduct' ? '#6ee7b7' : '#94a3b8',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    🛒 ট্রে থেকে বিক্রি (-)
                  </button>
                </div>

                {/* Quantity Presets + Auto Deficit Button */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    flexWrap: 'wrap',
                    paddingTop: '6px',
                    borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                      পরিমাণ:
                    </span>
                    {[1, 2, 3, 5, 12].map((n) => {
                      const active = qtyMode === 'fixed' && Number(scanQuantity) === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setQtyMode('fixed');
                            setScanQuantity(String(n));
                          }}
                          style={{
                            height: '28px',
                            minWidth: '32px',
                            padding: '0 7px',
                            borderRadius: '7px',
                            border: active ? '1.5px solid #fbbf24' : '1px solid #334155',
                            background: active ? '#d97706' : '#0f172a',
                            color: '#ffffff',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {toBengaliNumerals(n)}
                        </button>
                      );
                    })}
                    <input
                      type="number"
                      min="1"
                      value={scanQuantity}
                      onChange={(e) => {
                        setQtyMode('fixed');
                        setScanQuantity(e.target.value);
                      }}
                      style={{
                        width: '46px',
                        height: '28px',
                        borderRadius: '7px',
                        border: '1px solid #475569',
                        background: '#0f172a',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: 800,
                      }}
                    />
                  </div>

                  {scanActionMode === 'refill_from_stock' && (
                    <button
                      type="button"
                      onClick={() =>
                        setQtyMode((m) => (m === 'fill_deficit' ? 'fixed' : 'fill_deficit'))
                      }
                      style={{
                        height: '28px',
                        padding: '0 9px',
                        borderRadius: '7px',
                        border:
                          qtyMode === 'fill_deficit'
                            ? '1.5px solid #2dd4bf'
                            : '1px solid rgba(45, 212, 191, 0.45)',
                        background:
                          qtyMode === 'fill_deficit' ? '#0d9488' : 'rgba(13, 148, 136, 0.15)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                      title="ট্রে-তে যত পিস কম আছে (যেমন ১০/১২ থাকলে ২ পিস) স্ক্যান করলেই অটো তত পিস স্টক থেকে ট্রে-তে নিবে"
                    >
                      <Zap size={12} />
                      <span>
                        {qtyMode === 'fill_deficit' ? '✓ অটো ঘাটতি পূরণ: ON' : '⚡ অটো ঘাটতি পূরণ'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* COMPACT LIVE CAMERA VIEWFINDER */}
              <div
                style={{
                  position: 'relative',
                  height: '195px',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  background: '#020617',
                  border:
                    scanActionMode === 'refill_from_stock'
                      ? '2px solid rgba(245, 158, 11, 0.65)'
                      : '2px solid rgba(16, 185, 129, 0.65)',
                  flexShrink: 0,
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* Reticle Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '132px',
                      height: '132px',
                      borderRadius: '16px',
                      border: '2px dashed rgba(251, 191, 36, 0.85)',
                      boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.42)',
                    }}
                  />
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      background: 'rgba(2, 6, 23, 0.85)',
                      border: '1px solid rgba(251, 191, 36, 0.45)',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      color: '#fde68a',
                    }}
                  >
                    {scanActionMode === 'refill_from_stock'
                      ? `নতুন প্রডাক্ট ট্রে-তে রাখার সময় QR ধরুন (${
                          qtyMode === 'fill_deficit'
                            ? 'অটো ঘাটতি পূরণ'
                            : `+${toBengaliNumerals(scanQuantity || 1)} পিস`
                        })`
                      : `ট্রে থেকে বিক্রির জন্য QR ধরুন (-${toBengaliNumerals(scanQuantity || 1)} পিস)`}
                  </div>
                </div>

                {activeHeldSkuRef.current && (
                  <button
                    type="button"
                    onClick={() => {
                      activeHeldSkuRef.current = '';
                      lastSoldSnapshotRef.current = null;
                    }}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      padding: '4px 9px',
                      borderRadius: '8px',
                      background: '#f59e0b',
                      color: '#0f172a',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 পরবর্তী পিস স্ক্যান করুন
                  </button>
                )}
              </div>

              {/* NUMERIC SKU INPUT BAR */}
              <form
                onSubmit={handleManualSkuSubmit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#131f33',
                  padding: '8px',
                  borderRadius: '12px',
                  border: '1px solid #1e293b',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flex: 1,
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '9px',
                    padding: '0 10px',
                    height: '36px',
                  }}
                >
                  <Tag size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={manualSkuInput}
                    onChange={(e) => setManualSkuInput(e.target.value)}
                    placeholder="SKU নাম্বার লিখুন (1, 2, 3)..."
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#ffffff',
                      fontSize: '12.5px',
                      fontWeight: 700,
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isProcessing || !manualSkuInput.trim()}
                  style={{
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '9px',
                    border: 'none',
                    background:
                      scanActionMode === 'refill_from_stock'
                        ? 'linear-gradient(135deg, #f59e0b, #ea580c)'
                        : 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: isProcessing || !manualSkuInput.trim() ? 0.5 : 1,
                  }}
                >
                  {scanActionMode === 'refill_from_stock'
                    ? `📥 ট্রে-তে রাখুন (+${toBengaliNumerals(scanQuantity || 1)})`
                    : `🛒 ট্রে বিক্রি (-${toBengaliNumerals(scanQuantity || 1)})`}
                </button>
              </form>

              {/* QUICK 1-TAP PRODUCT TRAY REFILL LIST */}
              <div
                style={{
                  background: '#131f33',
                  borderRadius: '12px',
                  border: '1px solid #1e293b',
                  padding: '9px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
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
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                    ⚡ ১-ট্যাপে ট্রে রিফিল ও বিক্রি ({toBengaliNumerals(enrichedProducts.length)}টি পণ্য)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tray_board')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#fbbf24',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    ট্রে বোর্ড →
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '220px',
                    overflowY: 'auto',
                  }}
                >
                  {enrichedProducts.map((item) => {
                    const p = item.product;
                    return (
                      <div
                        key={p.id}
                        style={{
                          background: '#0f172a',
                          border:
                            item.hasActiveTray && item.deficit > 0
                              ? '1px solid rgba(245, 158, 11, 0.55)'
                              : '1px solid #1e293b',
                          borderRadius: '10px',
                          padding: '8px 9px',
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
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '5px',
                                background: 'rgba(245, 158, 11, 0.2)',
                                border: '1px solid rgba(245, 158, 11, 0.45)',
                                color: '#fde68a',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              SKU #{item.displaySku}
                            </span>
                            <b
                              style={{
                                fontSize: '12.5px',
                                color: '#ffffff',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {p.name}
                            </b>
                          </div>

                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: item.deficit > 0 ? '#fbbf24' : '#34d399',
                              flexShrink: 0,
                            }}
                          >
                            🍱 ট্রে: {toBengaliNumerals(item.trayStock)}/
                            {toBengaliNumerals(item.trayCapacity)}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 700 }}>
                            📦 মূল স্টক: {toBengaliNumerals(item.mainStock)} {p.unit}
                            {item.hasActiveTray && item.deficit > 0 && (
                              <span style={{ color: '#fda4af', marginLeft: '6px' }}>
                                ({toBengaliNumerals(item.deficit)} পিস খালি)
                              </span>
                            )}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                            {!item.hasActiveTray && item.trayStock === 0 ? (
                              <button
                                type="button"
                                disabled={isProcessing || item.mainStock <= 0}
                                onClick={() => {
                                  unlockScannerAudio();
                                  executeTrayMovement({
                                    product: p,
                                    actionType: 'tray_setup',
                                    requestedQty: Math.min(item.trayCapacity, item.mainStock),
                                  });
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '7px',
                                  background: '#0d9488',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                              >
                                🍱 ট্রে-তে {toBengaliNumerals(Math.min(item.trayCapacity, item.mainStock || 12))} পিস সাজান
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isProcessing || item.trayStock <= 0}
                                  onClick={() => {
                                    unlockScannerAudio();
                                    executeTrayMovement({
                                      product: p,
                                      actionType: 'tray_sale',
                                      requestedQty: Math.max(1, Number(scanQuantity) || 1),
                                    });
                                  }}
                                  style={{
                                    padding: '4px 7px',
                                    borderRadius: '7px',
                                    background: '#334155',
                                    color: '#fecdd3',
                                    border: 'none',
                                    fontSize: '10.5px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                  }}
                                >
                                  🛒 -{toBengaliNumerals(Math.max(1, Number(scanQuantity) || 1))} বিক্রি
                                </button>

                                <button
                                  type="button"
                                  disabled={isProcessing || item.mainStock <= 0}
                                  onClick={() => {
                                    unlockScannerAudio();
                                    executeTrayMovement({
                                      product: p,
                                      actionType: 'scan_refill',
                                      requestedQty: Math.max(1, Number(scanQuantity) || 1),
                                    });
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '7px',
                                    background: '#f59e0b',
                                    color: '#0f172a',
                                    border: 'none',
                                    fontSize: '10.5px',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                  }}
                                >
                                  📥 +{toBengaliNumerals(Math.max(1, Number(scanQuantity) || 1))} ট্রে-তে
                                </button>

                                {item.deficit > 0 && (
                                  <button
                                    type="button"
                                    disabled={isProcessing || item.mainStock <= 0}
                                    onClick={() => {
                                      unlockScannerAudio();
                                      executeTrayMovement({
                                        product: p,
                                        actionType: 'scan_refill',
                                        requestedQty: item.deficit,
                                      });
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: '7px',
                                      background: '#10b981',
                                      color: '#052e16',
                                      border: 'none',
                                      fontSize: '10.5px',
                                      fontWeight: 900,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    ⚡ +{toBengaliNumerals(item.deficit)} পূর্ণ করুন
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ================================================================= */}
          {/* TAB 2: TRAY BOARD & CAPACITY                                      */}
          {/* ================================================================= */}
          {activeTab === 'tray_board' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Search & Filter Row */}
              <div
                style={{
                  background: '#131f33',
                  borderRadius: '12px',
                  border: '1px solid #1e293b',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '9px',
                    padding: '0 10px',
                    height: '34px',
                  }}
                >
                  <Search size={14} style={{ color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={boardSearch}
                    onChange={(e) => setBoardSearch(e.target.value)}
                    placeholder="প্রডাক্টের নাম বা SKU খুঁজুন (যেমন: কাকড়া)..."
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  {(
                    [
                      { id: 'all', label: `সব পণ্য (${toBengaliNumerals(enrichedProducts.length)})` },
                      {
                        id: 'needs_refill',
                        label: `⚠️ রিফিল প্রয়োজন (${toBengaliNumerals(traySummary.needsRefillProductsCount)})`,
                      },
                      {
                        id: 'active_tray',
                        label: `🍱 সচল ট্রে (${toBengaliNumerals(traySummary.activeTrayProductsCount)})`,
                      },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setBoardFilter(f.id)}
                      style={{
                        padding: '4px 9px',
                        borderRadius: '7px',
                        border:
                          boardFilter === f.id ? '1.5px solid #2dd4bf' : '1px solid #334155',
                        background: boardFilter === f.id ? '#0d9488' : '#0f172a',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tray Cards List */}
              {filteredBoardProducts.map((item) => {
                const p = item.product;
                const capInputVal =
                  capacityInputs[p.id] !== undefined
                    ? capacityInputs[p.id]
                    : String(item.trayCapacity);
                const customQtyVal =
                  customMoveQtyInputs[p.id] !== undefined ? customMoveQtyInputs[p.id] : '2';
                const slotCount = Math.min(24, item.trayCapacity);
                const filledSlots = Math.min(slotCount, item.trayStock);

                return (
                  <div
                    key={p.id}
                    style={{
                      background: '#131f33',
                      borderRadius: '13px',
                      border:
                        item.hasActiveTray && item.deficit > 0
                          ? '1.5px solid rgba(245, 158, 11, 0.6)'
                          : item.hasActiveTray
                          ? '1.5px solid rgba(20, 184, 166, 0.5)'
                          : '1px solid #1e293b',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {/* Header Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              objectFit: 'cover',
                              border: '1px solid #334155',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: '#0f172a',
                              border: '1px solid #334155',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fbbf24',
                              flexShrink: 0,
                            }}
                          >
                            <Package size={17} />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: '5px',
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#fde68a',
                                fontSize: '10.5px',
                                fontWeight: 800,
                              }}
                            >
                              SKU #{item.displaySku}
                            </span>
                            <b
                              style={{
                                fontSize: '13px',
                                color: '#ffffff',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {p.name}
                            </b>
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                            দাম: <b style={{ color: '#34d399' }}>{money(p.sellingPrice)}</b> | মূল স্টক:{' '}
                            <b style={{ color: '#7dd3fc' }}>
                              {toBengaliNumerals(item.mainStock)} {p.unit}
                            </b>
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '8px',
                          background:
                            item.deficit > 0
                              ? 'rgba(245, 158, 11, 0.2)'
                              : 'rgba(16, 185, 129, 0.2)',
                          border:
                            item.deficit > 0
                              ? '1px solid rgba(245, 158, 11, 0.5)'
                              : '1px solid rgba(16, 185, 129, 0.5)',
                          color: item.deficit > 0 ? '#fde68a' : '#6ee7b7',
                          fontSize: '11.5px',
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        🍱 {toBengaliNumerals(item.trayStock)}/{toBengaliNumerals(item.trayCapacity)}{' '}
                        {p.unit}
                      </span>
                    </div>

                    {/* 12-Slot Visual Tray Display */}
                    <div
                      style={{
                        background: '#0b1322',
                        borderRadius: '10px',
                        border: '1px solid #1e293b',
                        padding: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '10.5px',
                          color: '#cbd5e1',
                          marginBottom: '6px',
                        }}
                      >
                        <span>
                          ট্রে স্লট ({toBengaliNumerals(item.trayStock)}টি আছে,{' '}
                          <b style={{ color: '#fbbf24' }}>
                            {toBengaliNumerals(item.deficit)}টি খালি
                          </b>
                          )
                        </span>
                        <span>
                          মোট রিফিল: <b style={{ color: '#5eead4' }}>{toBengaliNumerals(item.totalTrayRefilled)}</b> | বিক্রি:{' '}
                          <b style={{ color: '#fcd34d' }}>{toBengaliNumerals(item.totalTraySold)}</b>
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                          gap: '4px',
                        }}
                      >
                        {Array.from({ length: slotCount }).map((_, sIdx) => {
                          const isFilled = sIdx < filledSlots;
                          return (
                            <div
                              key={sIdx}
                              style={{
                                height: '22px',
                                borderRadius: '5px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 800,
                                background: isFilled
                                  ? 'rgba(16, 185, 129, 0.28)'
                                  : 'rgba(245, 158, 11, 0.08)',
                                border: isFilled
                                  ? '1px solid rgba(52, 211, 153, 0.7)'
                                  : '1px dashed rgba(251, 191, 36, 0.45)',
                                color: isFilled ? '#a7f3d0' : '#fbbf24',
                              }}
                            >
                              {toBengaliNumerals(sIdx + 1)}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      {item.deficit > 0 && (
                        <button
                          type="button"
                          disabled={isProcessing || item.mainStock <= 0}
                          onClick={() => {
                            unlockScannerAudio();
                            executeTrayMovement({
                              product: p,
                              actionType: item.trayStock === 0 ? 'tray_setup' : 'scan_refill',
                              requestedQty: item.deficit,
                              customCapacity: Number(capInputVal) || item.trayCapacity,
                            });
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                            color: '#ffffff',
                            fontSize: '11px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          {item.trayStock === 0
                            ? `🍱 ট্রে-তে ${toBengaliNumerals(item.trayCapacity)} পিস সাজান`
                            : `⚡ ঘাটতি +${toBengaliNumerals(item.deficit)} পিস স্টক থেকে পূরণ করুন`}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isProcessing || item.mainStock <= 0}
                        onClick={() => {
                          unlockScannerAudio();
                          executeTrayMovement({
                            product: p,
                            actionType: 'scan_refill',
                            requestedQty: 1,
                          });
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#0d9488',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        📥 +১ ট্রে-তে
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing || item.trayStock <= 0}
                        onClick={() => {
                          unlockScannerAudio();
                          executeTrayMovement({
                            product: p,
                            actionType: 'tray_sale',
                            requestedQty: 1,
                          });
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#334155',
                          color: '#fecdd3',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        🛒 -১ বিক্রি
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing || item.trayStock < 2}
                        onClick={() => {
                          unlockScannerAudio();
                          executeTrayMovement({
                            product: p,
                            actionType: 'tray_sale',
                            requestedQty: 2,
                          });
                        }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#334155',
                          color: '#fde68a',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        🛒 -২ বিক্রি
                      </button>
                    </div>

                    {/* Footer Row: Custom Move + Capacity */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        flexWrap: 'wrap',
                        paddingTop: '6px',
                        borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ color: '#94a3b8' }}>কাস্টম:</span>
                        <input
                          type="number"
                          min="1"
                          value={customQtyVal}
                          onChange={(e) =>
                            setCustomMoveQtyInputs((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          style={{
                            width: '42px',
                            height: '25px',
                            borderRadius: '6px',
                            border: '1px solid #475569',
                            background: '#0f172a',
                            color: '#ffffff',
                            textAlign: 'center',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        />
                        <button
                          type="button"
                          disabled={isProcessing || item.mainStock <= 0}
                          onClick={() => {
                            unlockScannerAudio();
                            executeTrayMovement({
                              product: p,
                              actionType: 'scan_refill',
                              requestedQty: Math.max(1, Number(customQtyVal) || 1),
                            });
                          }}
                          style={{
                            padding: '3px 7px',
                            borderRadius: '6px',
                            background: 'rgba(245, 158, 11, 0.25)',
                            border: '1px solid rgba(245, 158, 11, 0.5)',
                            color: '#fde68a',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          +{toBengaliNumerals(customQtyVal || 1)} ট্রে-তে নিন
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ color: '#94a3b8' }}>ক্যাপাসিটি:</span>
                        <input
                          type="number"
                          min="1"
                          value={capInputVal}
                          onChange={(e) =>
                            setCapacityInputs((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          onBlur={async () => {
                            const newCap = Math.max(1, Number(capInputVal) || 12);
                            if (newCap !== item.trayCapacity) {
                              await onUpdateProductTrayAndStock(
                                p,
                                {
                                  currentStock: item.mainStock,
                                  trayStock: item.trayStock,
                                  trayCapacity: newCap,
                                  totalTrayRefilled: item.totalTrayRefilled,
                                  totalTraySold: item.totalTraySold,
                                },
                                {
                                  id: `cap_${Date.now()}`,
                                  productId: p.id,
                                  productName: p.name,
                                  skuCode: item.displaySku,
                                  unit: p.unit || 'পিস',
                                  actionType: 'tray_setup',
                                  quantity: 0,
                                  unitCost: Number(p.averageCost || 0),
                                  unitPrice: Number(p.sellingPrice || 0),
                                  totalCostVal: 0,
                                  totalSellVal: 0,
                                  expectedProfit: 0,
                                  prevMainStock: item.mainStock,
                                  newMainStock: item.mainStock,
                                  prevTrayStock: item.trayStock,
                                  newTrayStock: item.trayStock,
                                  trayCapacity: newCap,
                                  actor,
                                  date: todayYmd(),
                                  timestamp: formatBengaliDateTime(new Date()),
                                  createdAtMs: Date.now(),
                                  notes: `ট্রে ক্যাপাসিটি ${toBengaliNumerals(newCap)} পিস সেট করা হয়েছে`,
                                }
                              );
                            }
                          }}
                          style={{
                            width: '44px',
                            height: '25px',
                            borderRadius: '6px',
                            border: '1px solid #475569',
                            background: '#0f172a',
                            color: '#fcd34d',
                            textAlign: 'center',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        />
                        <span style={{ color: '#94a3b8' }}>{p.unit}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: SEPARATE TRAY LEDGER & HISTORY                             */}
          {/* ================================================================= */}
          {activeTab === 'tray_ledger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Separate Financial Summary Box */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #1e1b4b 0%, #131f33 100%)',
                  borderRadius: '12px',
                  border: '1px solid rgba(129, 140, 248, 0.4)',
                  padding: '10px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#ffffff' }}>
                  📊 মূল স্টক থেকে ট্রে-তে তোলা প্রডাক্টের সম্পূর্ণ আলাদা হিসাব
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '6px',
                    marginTop: '8px',
                  }}
                >
                  <div
                    style={{
                      background: '#0f172a',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>মোট তোলা পিস</div>
                    <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#ffffff' }}>
                      {toBengaliNumerals(traySummary.totalRefilledPiecesAllTime)} পিস
                    </div>
                  </div>
                  <div
                    style={{
                      background: '#0f172a',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>বিক্রয়মূল্য</div>
                    <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#34d399' }}>
                      {money(traySummary.totalRefilledSellValAllTime)}
                    </div>
                  </div>
                  <div
                    style={{
                      background: '#0f172a',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>সম্ভাব্য লাভ</div>
                    <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#5eead4' }}>
                      +{money(traySummary.totalRefilledProfitAllTime)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'all', label: 'সব রেকর্ড' },
                    { id: 'scan_refill', label: '📥 স্ক্যান রিফিল' },
                    { id: 'tray_sale', label: '🛒 ট্রে বিক্রি' },
                    { id: 'return_to_stock', label: '↩️ স্টকে ফেরত' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLedgerActionFilter(tab.id)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '7px',
                      border:
                        ledgerActionFilter === tab.id
                          ? '1.5px solid #fbbf24'
                          : '1px solid #334155',
                      background: ledgerActionFilter === tab.id ? '#d97706' : '#131f33',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Chronological Log Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredLedgerLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      background: '#131f33',
                      borderRadius: '10px',
                      border: '1px solid #1e293b',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
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
                            padding: '1px 6px',
                            borderRadius: '5px',
                            background:
                              log.actionType === 'scan_refill' || log.actionType === 'tray_setup'
                                ? 'rgba(245, 158, 11, 0.2)'
                                : log.actionType === 'tray_sale'
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'rgba(56, 189, 248, 0.2)',
                            color:
                              log.actionType === 'scan_refill' || log.actionType === 'tray_setup'
                                ? '#fde68a'
                                : log.actionType === 'tray_sale'
                                ? '#6ee7b7'
                                : '#7dd3fc',
                            fontSize: '10.5px',
                            fontWeight: 800,
                          }}
                        >
                          {log.actionType === 'scan_refill'
                            ? '📥 স্ক্যান রিফিল'
                            : log.actionType === 'tray_setup'
                            ? '🍱 ট্রে সাজানো'
                            : log.actionType === 'tray_sale'
                            ? '🛒 ট্রে বিক্রি'
                            : '↩️ স্টকে ফেরত'}
                        </span>
                        <b style={{ fontSize: '12.5px', color: '#ffffff' }}>
                          {log.productName} (SKU #{log.skuCode})
                        </b>
                        <span style={{ fontSize: '12px', fontWeight: 900, color: '#fbbf24' }}>
                          {toBengaliNumerals(log.quantity)} {log.unit}
                        </span>
                      </div>

                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                        🍱 ট্রে: {toBengaliNumerals(log.prevTrayStock)} →{' '}
                        <b style={{ color: '#fde68a' }}>
                          {toBengaliNumerals(log.newTrayStock)}/{toBengaliNumerals(log.trayCapacity)}
                        </b>{' '}
                        | 📦 মূল স্টক: {toBengaliNumerals(log.prevMainStock)} →{' '}
                        <b style={{ color: '#7dd3fc' }}>{toBengaliNumerals(log.newMainStock)}</b> |{' '}
                        <b style={{ color: '#34d399' }}>{money(log.totalSellVal)}</b>
                      </div>

                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                        {log.timestamp} • 👤 {log.actor === 'Limon' ? 'লিমন' : 'রাকিব'}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={undoingLogId === log.id}
                      onClick={() => handleUndoTrayLog(log)}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        borderRadius: '7px',
                        background: 'rgba(225, 29, 72, 0.25)',
                        border: '1px solid rgba(244, 63, 94, 0.5)',
                        color: '#fda4af',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <RotateCcw size={11} />
                      <span>বাতিল</span>
                    </button>
                  </div>
                ))}

                {filteredLedgerLogs.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 12px',
                      color: '#94a3b8',
                      fontSize: '12px',
                      background: '#131f33',
                      borderRadius: '12px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    এখনো কোনো ট্রে স্ক্যান বা রিফিল রেকর্ড যোগ হয়নি।
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
