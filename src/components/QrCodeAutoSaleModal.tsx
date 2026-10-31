import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Camera,
  CheckCircle2,
  Download,
  Lock,
  Music,
  Package,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type { Product } from '../types';
import { money, toBengaliNumerals } from '../accounting';
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

export interface QrSaleLogItem {
  id: string;
  entryId?: string;
  product: Product;
  skuCode: string;
  quantity: number;
  totalAmount: number;
  profitAmount: number;
  timestamp: string;
  decodeTimeMs: number;
  seller: 'Rakib' | 'Limon';
}

interface QrCodeAutoSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialTab?: 'scanner' | 'stickers';
  initialSeller?: 'Rakib' | 'Limon';
  shopName?: string;
  onExecuteSale: (params: {
    product: Product;
    quantity: number;
    skuCode: string;
    seller: 'Rakib' | 'Limon';
  }) => Promise<string | void>;
  onUndoSale?: (entryId: string, product: Product, quantity: number) => Promise<void>;
}

/**
 * Extracts SKU from any QR code payload in nanoseconds:
 * - Direct SKU: "1", "2", "15", "A", "B"
 * - Prefixed: "SKU:1", "GLOWZAA-SKU:1", "SKU-1", "CODE:1"
 * - JSON: {"sku":"1"}
 * - URL: https://.../product?sku=1
 */
export function extractSkuFromQrPayload(rawQrData: string): string {
  const raw = String(rawQrData || '').trim();
  if (!raw) return '';

  // 1. Direct strict SKU check ("1", "2", "SKU:1", etc.)
  const direct = toStrictAllowedSkuClient(raw);
  if (direct) return direct;

  // 2. Key-value pattern inside string: e.g. "GLOWZAA|SKU:12|..." or "sku=12"
  const kvMatch = raw.match(/(?:sku|code|id|কোড|নাম্বার)\s*[:=#\-]\s*([A-Za-z0-9০-৯]+)/i);
  if (kvMatch && kvMatch[1]) {
    const parsedKv = toStrictAllowedSkuClient(kvMatch[1]);
    if (parsedKv) return parsedKv;
  }

  // 3. JSON payload {"sku": "1"}
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const obj = JSON.parse(raw);
      const candidate = obj?.sku ?? obj?.code ?? obj?.id;
      if (candidate !== undefined) {
        const parsedJson = toStrictAllowedSkuClient(String(candidate));
        if (parsedJson) return parsedJson;
      }
    } catch {}
  }

  // 4. Fallback: first standalone number in payload
  const numMatch = raw.match(/\b(\d{1,6})\b/);
  if (numMatch && numMatch[1]) {
    const parsedNum = toStrictAllowedSkuClient(numMatch[1]);
    if (parsedNum) return parsedNum;
  }

  return '';
}

export default function QrCodeAutoSaleModal({
  isOpen,
  onClose,
  products,
  initialTab = 'scanner',
  initialSeller = 'Rakib',
  shopName = 'Glowzaa Shop',
  onExecuteSale,
  onUndoSale,
}: QrCodeAutoSaleModalProps) {
  const [activeTab, setActiveTab] = useState<'scanner' | 'stickers'>(initialTab);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [autoExecuteOnMatch, setAutoExecuteOnMatch] = useState<boolean>(true);
  const [sameSkuCooldownMs, setSameSkuCooldownMs] = useState<number>(500);
  const [soundConfig, setSoundConfig] = useState<ScannerSoundConfig>(() => loadScannerSoundConfig());
  const [showSoundPanel, setShowSoundPanel] = useState<boolean>(false);

  // Live scan feedback states
  const [statusBanner, setStatusBanner] = useState<string>(
    '⚡ প্রডাক্টের গায়ের QR কোডের ওপর ক্যামেরা ধরুন — ন্যানো-সেকেন্ডে অটো-সেল হবে!'
  );
  const [lastDetectedQrText, setLastDetectedQrText] = useState<string>('');
  const [lastMatchedProduct, setLastMatchedProduct] = useState<Product | null>(null);
  const [lastMatchedSku, setLastMatchedSku] = useState<string>('');
  const [lastDecodeTimeMs, setLastDecodeTimeMs] = useState<number>(0);
  const [qrHighlightBox, setQrHighlightBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [saleLogs, setSaleLogs] = useState<QrSaleLogItem[]>([]);
  const [isExecutingSale, setIsExecutingSale] = useState<boolean>(false);

  // QR Sticker Generator states
  const [stickerSearch, setStickerSearch] = useState<string>('');
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [isDownloadingStickersPdf, setIsDownloadingStickersPdf] = useState<boolean>(false);

  const seller: 'Rakib' | 'Limon' = initialSeller === 'Limon' ? 'Limon' : 'Rakib';

  // Refs for 60fps zero-latency loop
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const nativeDetectorRef = useRef<any>(null);
  const nativeDetectBusyRef = useRef<boolean>(false);

  const productsRef = useRef<Product[]>(products);
  const quantityRef = useRef<number>(quantity);
  const autoExecuteRef = useRef<boolean>(autoExecuteOnMatch);
  const activeHeldSkuRef = useRef<string>('');
  const lastQrSeenTimestampRef = useRef<number>(0);
  // 8x8 luma signature of the frame when the current SKU was sold; prevents refocus blur from re-triggering the same held QR!
  const lockedSceneSigRef = useRef<number[]>([]);
  const currentSceneSigRef = useRef<number[]>([]);
  const movedAwayFramesRef = useRef<number>(0);
  // Tracks optimistic stock deductions before Firestore snapshot round-trip finishes
  const optimisticStockDeductedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    productsRef.current = products;
    // Clear optimistic deductions once fresh products state arrives from Firestore
    optimisticStockDeductedRef.current = {};
  }, [products]);

  useEffect(() => {
    quantityRef.current = quantity;
  }, [quantity]);

  useEffect(() => {
    autoExecuteRef.current = autoExecuteOnMatch;
  }, [autoExecuteOnMatch]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      activeHeldSkuRef.current = '';
      lockedSceneSigRef.current = [];
      movedAwayFramesRef.current = 0;
      optimisticStockDeductedRef.current = {};
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const syncSound = () => setSoundConfig(loadScannerSoundConfig());
    window.addEventListener(SCANNER_SOUND_UPDATED_EVENT, syncSound);
    return () => window.removeEventListener(SCANNER_SOUND_UPDATED_EVENT, syncSound);
  }, []);

  // Pre-generate crisp QR Code Data URLs for all products
  const productsWithEffectiveSku = useMemo(() => {
    return products.map((product, idx) => ({
      product,
      effectiveSku: getEffectiveProductSku(product, idx),
    }));
  }, [products]);

  useEffect(() => {
    if (!isOpen || !productsWithEffectiveSku.length) return;
    let cancelled = false;

    async function generateAllQrs() {
      const nextMap: Record<string, string> = {};
      for (const item of productsWithEffectiveSku) {
        try {
          // Encode exact SKU so QR code has minimal modules (Version 1, super large & readable from far away in nanoseconds!)
          const url = await QRCode.toDataURL(item.effectiveSku, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 240,
            color: {
              dark: '#0f172a',
              light: '#ffffff',
            },
          });
          if (cancelled) return;
          nextMap[item.product.id] = url;
        } catch {}
      }
      if (!cancelled) {
        setQrDataUrls(nextMap);
      }
    }

    generateAllQrs();
    return () => {
      cancelled = true;
    };
  }, [isOpen, productsWithEffectiveSku]);

  // Stop camera helper
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
    scanCtxRef.current = null;
    setCameraActive(false);
    setQrHighlightBox(null);
  };

  // Start camera when modal is open & scanner tab is active
  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError('');
    try {
      // Initialize native BarcodeDetector for QR if supported by browser
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window && !nativeDetectorRef.current) {
        try {
          const DetectorClass = (window as any).BarcodeDetector;
          nativeDetectorRef.current = new DetectorClass({ formats: ['qr_code'] });
        } catch {
          nativeDetectorRef.current = null;
        }
      }

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 30 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() =>
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      );

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      setStatusBanner('⚡ ক্যামেরা সচল! একের পর এক QR কোড ধরুন — প্রতিবার ১টি করে সেল হবে...');
    } catch (err: any) {
      console.warn('QR Camera error:', err);
      setCameraError(
        'ক্যামেরা চালু করা যায়নি। ব্রাউজারে ক্যামেরা পারমিশন (Allow) দেওয়া আছে কিনা যাচাই করুন।'
      );
      setCameraActive(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'scanner') {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, facingMode]);

  // Execute sale for matched product in 0ms (Optimistic & Non-Blocking so consecutive scans never wait on network!)
  const triggerInstantQrSale = (
    product: Product,
    matchedSku: string,
    decodeMs: number
  ) => {
    const saleQty = Math.max(1, quantityRef.current || 1);
    const unitPrice = Number(product.sellingPrice) || 0;
    const unitCost = Number(product.averageCost) || 0;
    const totalAmount = Math.round(saleQty * unitPrice * 100) / 100;
    const profitAmount = Math.round(saleQty * (unitPrice - unitCost) * 100) / 100;

    // 1. Optimistically deduct stock immediately in local ref so back-to-back scans are 100% accurate
    const prevDeducted = optimisticStockDeductedRef.current[product.id] || 0;
    optimisticStockDeductedRef.current[product.id] = prevDeducted + saleQty;
    const updatedProductSnapshot: Product = {
      ...product,
      currentStock: Math.max(0, Number(product.currentStock || 0) - (prevDeducted + saleQty)),
    };

    // 2. Play scanner beep sound immediately (0ms hardware audio feedback)
    playScannerSound('success');

    // 3. Create optimistic sale log entry immediately (0ms UI update)
    const tempLogId = `qr-sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticLogItem: QrSaleLogItem = {
      id: tempLogId,
      entryId: undefined,
      product: updatedProductSnapshot,
      skuCode: matchedSku,
      quantity: saleQty,
      totalAmount,
      profitAmount,
      timestamp: new Date().toLocaleTimeString('bn-BD', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      decodeTimeMs: decodeMs,
      seller,
    };

    setLastMatchedProduct(updatedProductSnapshot);
    setLastMatchedSku(matchedSku);
    setLastDecodeTimeMs(decodeMs);
    setSaleLogs((prev) => [optimisticLogItem, ...prev]);
    setStatusBanner(
      `✅ ১ বার সেল সম্পন্ন (SKU #${matchedSku}): ${product.name} (${toBengaliNumerals(
        saleQty
      )} ${product.unit || 'পিস'}) — ${money(totalAmount)}। পরবর্তী QR কোড ধরুন!`
    );

    // 4. Persist to Firestore in background without blocking the camera scanner!
    setIsExecutingSale(true);
    onExecuteSale({
      product,
      quantity: saleQty,
      skuCode: matchedSku,
      seller,
    })
      .then((createdEntryId) => {
        if (typeof createdEntryId === 'string') {
          setSaleLogs((prev) =>
            prev.map((item) =>
              item.id === tempLogId ? { ...item, entryId: createdEntryId } : item
            )
          );
        }
      })
      .catch((e: any) => {
        // Rollback optimistic deduction if network write fails
        optimisticStockDeductedRef.current[product.id] = Math.max(
          0,
          (optimisticStockDeductedRef.current[product.id] || 0) - saleQty
        );
        setSaleLogs((prev) => prev.filter((item) => item.id !== tempLogId));
        setStatusBanner(`⚠️ সেল সংরক্ষণে ত্রুটি: ${e?.message || 'আবার চেষ্টা করুন'}`);
      })
      .finally(() => {
        setIsExecutingSale(false);
      });
  };

  // Handle a decoded QR payload from either Native BarcodeDetector or jsQR
  const handleDecodedQrPayload = (
    rawText: string,
    decodeMs: number,
    box?: { x: number; y: number; w: number; h: number } | null
  ) => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return;

    const now = performance.now();
    lastQrSeenTimestampRef.current = now;
    movedAwayFramesRef.current = 0;
    setLastDetectedQrText(trimmed);
    if (box) {
      setQrHighlightBox(box);
    }

    const extractedSku = extractSkuFromQrPayload(trimmed);
    if (!extractedSku) {
      setStatusBanner(`⚠️ QR কোড পাওয়া গেছে ("${trimmed.slice(0, 24)}"), কিন্তু এতে কোনো বৈধ SKU নাম্বার নেই।`);
      return;
    }

    const matched = matchProductBySkuClient(extractedSku, productsRef.current);
    if (!matched) {
      setStatusBanner(
        `⚠️ QR কোডের SKU #${extractedSku} দিয়ে স্টকে কোনো পণ্য পাওয়া যায়নি!`
      );
      return;
    }

    const { product, matchedSku } = matched;

    // STRICT 1-SALE-PER-HOLD LOCK:
    // If the camera is still pointing at the EXACT SAME SKU that was just scanned,
    // NEVER auto-sell it a 2nd time while held!
    // Switching to any DIFFERENT SKU (activeHeldSkuRef.current !== matchedSku) triggers in 0ms!
    if (activeHeldSkuRef.current === matchedSku) {
      return;
    }

    const alreadyDeducted = optimisticStockDeductedRef.current[product.id] || 0;
    const effectiveRemainingStock = Number(product.currentStock || 0) - alreadyDeducted;

    // Lock this SKU for the current hold & snapshot the visual scene signature
    activeHeldSkuRef.current = matchedSku;
    lockedSceneSigRef.current = [...currentSceneSigRef.current];

    if (effectiveRemainingStock <= 0) {
      setLastMatchedProduct({ ...product, currentStock: 0 });
      setLastMatchedSku(matchedSku);
      setStatusBanner(
        `🚨 স্টক শেষ! "${product.name}" (SKU #${matchedSku})-এর বর্তমান স্টক ০।`
      );
      return;
    }

    if (autoExecuteRef.current) {
      triggerInstantQrSale(product, matchedSku, decodeMs);
    } else {
      playScannerSound('success');
      setLastMatchedProduct({
        ...product,
        currentStock: Math.max(0, effectiveRemainingStock),
      });
      setLastMatchedSku(matchedSku);
      setLastDecodeTimeMs(decodeMs);
      setStatusBanner(
        `🎯 QR শনাক্ত: SKU #${matchedSku} — ${product.name} (${money(
          product.sellingPrice
        )})। নিচের "এখনই সেল করুন" বাটনে চাপ দিন।`
      );
    }
  };

  // 60 FPS Ultra-Fast Local QR Scanning Loop (Native BarcodeDetector + jsQR)
  useEffect(() => {
    if (!isOpen || activeTab !== 'scanner' || !cameraActive) return;

    let active = true;
    let frameCounter = 0;

    const scanFrame = () => {
      if (!active) return;
      frameCounter++;

      const video = videoRef.current;
      const canvas = scanCanvasRef.current;

      if (video && canvas && video.readyState >= video.HAVE_ENOUGH_DATA) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (vw > 0 && vh > 0) {
          // 1. Hardware Native BarcodeDetector (if available in browser)
          if (nativeDetectorRef.current && !nativeDetectBusyRef.current) {
            nativeDetectBusyRef.current = true;
            const t0 = performance.now();
            nativeDetectorRef.current
              .detect(video)
              .then((barcodes: any[]) => {
                if (!active) return;
                if (Array.isArray(barcodes) && barcodes.length > 0) {
                  const first = barcodes[0];
                  const rawValue = first?.rawValue;
                  if (rawValue) {
                    const dt = Math.max(0.3, performance.now() - t0);
                    let normBox: { x: number; y: number; w: number; h: number } | null = null;
                    if (first.boundingBox && vw > 0 && vh > 0) {
                      normBox = {
                        x: (first.boundingBox.x / vw) * 100,
                        y: (first.boundingBox.y / vh) * 100,
                        w: (first.boundingBox.width / vw) * 100,
                        h: (first.boundingBox.height / vh) * 100,
                      };
                    }
                    handleDecodedQrPayload(rawValue, dt, normBox);
                  }
                }
              })
              .catch(() => {})
              .finally(() => {
                nativeDetectBusyRef.current = false;
              });
          }

          // 2. Synchronous Sub-Millisecond jsQR Canvas Decoder (260x260 fast crop)
          const targetSize = 260;
          if (canvas.width !== targetSize || canvas.height !== targetSize) {
            canvas.width = targetSize;
            canvas.height = targetSize;
            scanCtxRef.current = null;
          }
          if (!scanCtxRef.current) {
            scanCtxRef.current = canvas.getContext('2d', { willReadFrequently: true });
          }
          const ctx = scanCtxRef.current;
          if (ctx) {
            const tStart = performance.now();
            const minDim = Math.min(vw, vh);
            const sx = Math.floor((vw - minDim) / 2);
            const sy = Math.floor((vh - minDim) / 2);
            ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);

            const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
            const data = imageData.data;

            // Compute fast 8x8 luma signature to know if camera is still held over the same scene
            const sig: number[] = [];
            const step = Math.floor(targetSize / 8);
            for (let gy = 0; gy < 8; gy++) {
              for (let gx = 0; gx < 8; gx++) {
                const pxIdx = ((gy * step + 10) * targetSize + (gx * step + 10)) * 4;
                sig.push(
                  Math.round(
                    0.299 * data[pxIdx] + 0.587 * data[pxIdx + 1] + 0.114 * data[pxIdx + 2]
                  )
                );
              }
            }
            currentSceneSigRef.current = sig;

            // Use 'dontInvert' on 4 out of 5 frames for 3x faster sub-ms decoding
            const qrResult = jsQR(data, targetSize, targetSize, {
              inversionAttempts: frameCounter % 5 === 0 ? 'attemptBoth' : 'dontInvert',
            });

            if (qrResult && qrResult.data) {
              const dt = Math.max(0.4, performance.now() - tStart);
              const loc = qrResult.location;
              const minX = Math.min(
                loc.topLeftCorner.x,
                loc.bottomLeftCorner.x,
                loc.topRightCorner.x,
                loc.bottomRightCorner.x
              );
              const maxX = Math.max(
                loc.topLeftCorner.x,
                loc.bottomLeftCorner.x,
                loc.topRightCorner.x,
                loc.bottomRightCorner.x
              );
              const minY = Math.min(
                loc.topLeftCorner.y,
                loc.bottomLeftCorner.y,
                loc.topRightCorner.y,
                loc.bottomRightCorner.y
              );
              const maxY = Math.max(
                loc.topLeftCorner.y,
                loc.bottomLeftCorner.y,
                loc.topRightCorner.y,
                loc.bottomRightCorner.y
              );

              handleDecodedQrPayload(qrResult.data, dt, {
                x: (minX / targetSize) * 100,
                y: (minY / targetSize) * 100,
                w: ((maxX - minX) / targetSize) * 100,
                h: ((maxY - minY) / targetSize) * 100,
              });
            } else {
              const elapsedSinceSeen = performance.now() - lastQrSeenTimestampRef.current;
              if (elapsedSinceSeen > 220) {
                setQrHighlightBox(null);
              }

              // Only unlock the SAME SKU if NO QR has been seen for >650ms AND the camera was physically moved away from the QR scene!
              if (activeHeldSkuRef.current && elapsedSinceSeen > 650) {
                let sceneDiff = 0;
                const lockedSig = lockedSceneSigRef.current;
                if (lockedSig.length === sig.length && sig.length > 0) {
                  let sum = 0;
                  for (let i = 0; i < sig.length; i++) {
                    sum += Math.abs(sig[i] - lockedSig[i]);
                  }
                  sceneDiff = sum / sig.length;
                } else {
                  sceneDiff = 30;
                }

                // Require significant visual scene change (>22 luma diff for 12+ frames) so holding still with autofocus blur NEVER re-triggers!
                if (sceneDiff > 22) {
                  movedAwayFramesRef.current += 1;
                  if (movedAwayFramesRef.current >= 12) {
                    activeHeldSkuRef.current = '';
                    lockedSceneSigRef.current = [];
                    movedAwayFramesRef.current = 0;
                  }
                } else {
                  movedAwayFramesRef.current = 0;
                }
              }
            }
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(scanFrame);
    };

    rafIdRef.current = requestAnimationFrame(scanFrame);
    return () => {
      active = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isOpen, activeTab, cameraActive]);

  // Download Single Product QR Sticker PNG
  const handleDownloadSingleStickerPng = async (product: Product, effectiveSku: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background with rounded border
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Header bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 10, canvas.width - 20, 54);
    ctx.fillStyle = '#2dd4bf';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shopName || 'Glowzaa Shop', canvas.width / 2, 44);

    // Draw QR image
    const qrDataUrl =
      qrDataUrls[product.id] ||
      (await QRCode.toDataURL(effectiveSku, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 280,
      }));

    const img = new Image();
    img.src = qrDataUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    ctx.drawImage(img, 70, 76, 280, 280);

    // SKU Pill
    ctx.fillStyle = '#0d9488';
    ctx.fillRect(90, 366, 240, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`SKU: ${effectiveSku}`, canvas.width / 2, 395);

    // Product Name & Price
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(product.name.slice(0, 26), canvas.width / 2, 440);

    ctx.fillStyle = '#047857';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`মূল্য: ৳${toBengaliNumerals(product.sellingPrice)}`, canvas.width / 2, 474);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR-SKU-${effectiveSku}-${product.name}.png`;
    a.click();
  };

  // Download Printable A4 PDF Sheet of All Product QR Stickers
  const handleDownloadAllStickersPdf = async () => {
    if (!productsWithEffectiveSku.length || isDownloadingStickersPdf) return;
    setIsDownloadingStickersPdf(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const itemsPerPage = 12; // 3 columns x 4 rows per A4 sheet
      const totalPages = Math.ceil(productsWithEffectiveSku.length / itemsPerPage);

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const pageItems = productsWithEffectiveSku.slice(
          pageIdx * itemsPerPage,
          (pageIdx + 1) * itemsPerPage
        );

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '794px';
        container.style.minHeight = '1123px';
        container.style.background = '#ffffff';
        container.style.padding = '24px';
        container.style.boxSizing = 'border-box';
        container.style.fontFamily = "'Hind Siliguri', 'Noto Sans Bengali', sans-serif";

        const cardsHtml = await Promise.all(
          pageItems.map(async ({ product, effectiveSku }) => {
            const qrUrl =
              qrDataUrls[product.id] ||
              (await QRCode.toDataURL(effectiveSku, {
                errorCorrectionLevel: 'H',
                margin: 1,
                width: 220,
              }));
            return `
              <div style="border: 2px dashed #0f172a; border-radius: 12px; padding: 10px 8px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; background: #ffffff; height: 236px; box-sizing: border-box;">
                <div style="background: #0f172a; color: #2dd4bf; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 6px; width: 100%; box-sizing: border-box;">
                  ${shopName || 'Glowzaa Shop'}
                </div>
                <img src="${qrUrl}" style="width: 124px; height: 124px; object-fit: contain; margin: 4px 0;" />
                <div style="background: #0d9488; color: #ffffff; font-size: 15px; font-weight: 900; padding: 2px 12px; border-radius: 6px; letter-spacing: 0.5px;">
                  SKU: ${effectiveSku}
                </div>
                <div style="font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${product.name}
                </div>
                <div style="font-size: 13px; font-weight: 800; color: #047857;">
                  মূল্য: ৳${toBengaliNumerals(product.sellingPrice)}
                </div>
              </div>
            `;
          })
        );

        container.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px;">
            <div>
              <h2 style="margin: 0; font-size: 18px; color: #0f172a; font-weight: 900;">
                📱 ${shopName || 'Glowzaa Shop'} — প্রডাক্টের QR কোড স্টিকার শিট (প্রিন্ট করে প্রডাক্টে লাগান)
              </h2>
              <p style="margin: 2px 0 0; font-size: 12px; color: #475569;">
                প্রতিটি QR কোডে প্রডাক্টের SKU নাম্বার দেওয়া আছে — ক্যামেরা ধরলেই ন্যানো-সেকেন্ডে সেল হবে
              </p>
            </div>
            <span style="font-size: 12px; font-weight: 800; color: #0f172a;">
              পৃষ্ঠা ${toBengaliNumerals(pageIdx + 1)} / ${toBengaliNumerals(totalPages)}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            ${cardsHtml.join('')}
          </div>
        `;

        document.body.appendChild(container);
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        });
        document.body.removeChild(container);

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (pageIdx > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      pdf.save(`Glowzaa-QR-Code-Stickers-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('QR Sticker PDF error:', err);
    } finally {
      setIsDownloadingStickersPdf(false);
    }
  };

  const filteredStickerProducts = useMemo(() => {
    const q = stickerSearch.trim().toLowerCase();
    if (!q) return productsWithEffectiveSku;
    return productsWithEffectiveSku.filter(
      ({ product, effectiveSku }) =>
        product.name.toLowerCase().includes(q) ||
        effectiveSku.toLowerCase().includes(q) ||
        String(product.sellingPrice).includes(q)
    );
  }, [productsWithEffectiveSku, stickerSearch]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.78)',
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
          maxWidth: '500px',
          maxHeight: 'calc(100dvh - 20px)',
          borderRadius: '20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#0b1322',
          color: '#f8fafc',
          border: '1.5px solid rgba(99, 102, 241, 0.38)',
          boxShadow: '0 24px 60px rgba(2, 6, 23, 0.85)',
        }}
      >
        {/* Sleek Compact Header (Matches CameraAutoSaleModal proportions) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 52%, #0d9488 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.16)',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.18)',
                border: '1px solid rgba(255, 255, 255, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#ffffff',
              }}
            >
              <QrCode size={19} />
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
                ⚡ QR কোড অটো-সেল স্ক্যানার
              </h3>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '11px',
                  color: '#e0e7ff',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                QR কোডে ক্যামেরা ধরলেই ন্যানো-সেকেন্ডে সেল
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                unlockScannerAudio();
                setShowSoundPanel((v) => !v);
              }}
              style={{
                height: '34px',
                padding: '0 9px',
                borderRadius: '9px',
                background: showSoundPanel ? '#ffffff' : 'rgba(15, 23, 42, 0.32)',
                color: showSoundPanel ? '#4f46e5' : '#ffffff',
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
                const updated = { ...soundConfig, enabled: !soundConfig.enabled };
                setSoundConfig(updated);
                saveScannerSoundConfig(updated);
                if (updated.enabled) {
                  unlockScannerAudio();
                  playScannerSound('success');
                }
              }}
              style={{
                width: '34px',
                height: '34px',
                padding: 0,
                borderRadius: '9px',
                background: 'rgba(15, 23, 42, 0.32)',
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

            {activeTab === 'scanner' && (
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
                  background: 'rgba(15, 23, 42, 0.32)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="ক্যামেরা পরিবর্তন করুন (সামনে/পেছনে)"
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
                background: 'rgba(239, 68, 68, 0.28)',
                color: '#ffffff',
                border: '1px solid rgba(252, 165, 165, 0.4)',
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

        {/* Sleek Segmented Tab Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            padding: '8px 12px',
            background: '#0f172a',
            borderBottom: '1px solid #1e293b',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '10px',
              border:
                activeTab === 'scanner'
                  ? '1.5px solid rgba(167, 139, 250, 0.85)'
                  : '1px solid #334155',
              background:
                activeTab === 'scanner'
                  ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                  : '#1e293b',
              color: activeTab === 'scanner' ? '#ffffff' : '#94a3b8',
              fontSize: '12.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow:
                activeTab === 'scanner' ? '0 4px 12px rgba(79, 70, 229, 0.35)' : 'none',
            }}
          >
            <Camera size={14} />
            <span>⚡ লাইভ QR স্ক্যানার</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '10px',
              border:
                activeTab === 'stickers'
                  ? '1.5px solid rgba(45, 212, 191, 0.85)'
                  : '1px solid #334155',
              background:
                activeTab === 'stickers'
                  ? 'linear-gradient(135deg, #0d9488, #0284c7)'
                  : '#1e293b',
              color: activeTab === 'stickers' ? '#ffffff' : '#94a3b8',
              fontSize: '12.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow:
                activeTab === 'stickers' ? '0 4px 12px rgba(13, 148, 136, 0.35)' : 'none',
            }}
          >
            <QrCode size={14} />
            <span>🖨️ QR স্টিকার ({toBengaliNumerals(products.length)}টি)</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            padding: '12px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {showSoundPanel && (
            <div style={{ flexShrink: 0 }}>
              <ScannerSoundSettingsCard compact />
            </div>
          )}

          {activeTab === 'scanner' ? (
            <>
              {/* Compact Control Strip: Row 1 (Auto-Sale & Seller) + Row 2 (Quantity Presets) */}
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAutoExecuteOnMatch((v) => !v)}
                    style={{
                      height: '30px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      border: autoExecuteOnMatch
                        ? '1.5px solid #10b981'
                        : '1px solid #475569',
                      background: autoExecuteOnMatch
                        ? 'rgba(16, 185, 129, 0.16)'
                        : '#0f172a',
                      color: autoExecuteOnMatch ? '#34d399' : '#cbd5e1',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer',
                    }}
                  >
                    <CheckCircle2 size={13} />
                    <span>অটো সেল: {autoExecuteOnMatch ? 'ON' : 'OFF'}</span>
                  </button>

                  <span
                    style={{
                      height: '30px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(56, 189, 248, 0.45)',
                      background: 'rgba(14, 165, 233, 0.12)',
                      color: '#bae6fd',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Lock size={11} />
                    <span>বিক্রেতা: 👤 {seller === 'Limon' ? 'লিমন' : 'রাকিব'}</span>
                  </span>
                </div>

                {/* Quantity Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    paddingTop: '6px',
                    borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                  }}
                >
                  <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 700 }}>
                    পরিমাণ (পিস):
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {[1, 2, 5, 10].map((qPreset) => (
                      <button
                        key={qPreset}
                        type="button"
                        onClick={() => setQuantity(qPreset)}
                        style={{
                          minWidth: '34px',
                          height: '29px',
                          padding: '0 8px',
                          borderRadius: '7px',
                          border:
                            quantity === qPreset
                              ? '1.5px solid #2dd4bf'
                              : '1px solid #334155',
                          background: quantity === qPreset ? '#0d9488' : '#0f172a',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {toBengaliNumerals(qPreset)}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      style={{
                        width: '48px',
                        height: '29px',
                        borderRadius: '7px',
                        border: '1px solid #475569',
                        background: '#020617',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontSize: '12.5px',
                        fontWeight: 800,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* High-Tech QR Camera Viewfinder */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '235px',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  background: '#020617',
                  border: qrHighlightBox ? '2px solid #10b981' : '1.5px solid #4f46e5',
                  boxShadow: qrHighlightBox
                    ? '0 0 24px rgba(16, 185, 129, 0.45)'
                    : '0 8px 24px rgba(0, 0, 0, 0.45)',
                  flexShrink: 0,
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                <canvas ref={scanCanvasRef} style={{ display: 'none' }} />

                {/* Top Floating Badges inside Camera */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '10px',
                    right: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(15, 23, 42, 0.82)',
                      backdropFilter: 'blur(4px)',
                      color: '#c4b5fd',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(167, 139, 250, 0.4)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Zap size={11} color="#a78bfa" />
                    <span>60 FPS ন্যানো-সেকেন্ড QR</span>
                  </span>

                  {lastDecodeTimeMs > 0 && (
                    <span
                      style={{
                        background: 'rgba(6, 95, 70, 0.9)',
                        color: '#6ee7b7',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(52, 211, 153, 0.4)',
                      }}
                    >
                      ⏱️ {lastDecodeTimeMs.toFixed(1)} ms
                    </span>
                  )}
                </div>

                {/* Center Square QR Reticle with Corner Brackets */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '156px',
                    height: '156px',
                    borderRadius: '16px',
                    border: qrHighlightBox
                      ? '2.5px solid #10b981'
                      : '1.5px dashed rgba(167, 139, 250, 0.65)',
                    boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.42)',
                    pointerEvents: 'none',
                  }}
                >
                  {/* Top-Left Bracket */}
                  <div
                    style={{
                      position: 'absolute',
                      top: -2,
                      left: -2,
                      width: 22,
                      height: 22,
                      borderTop: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderLeft: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderTopLeftRadius: 12,
                    }}
                  />
                  {/* Top-Right Bracket */}
                  <div
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 22,
                      height: 22,
                      borderTop: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderRight: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderTopRightRadius: 12,
                    }}
                  />
                  {/* Bottom-Left Bracket */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      left: -2,
                      width: 22,
                      height: 22,
                      borderBottom: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderLeft: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderBottomLeftRadius: 12,
                    }}
                  />
                  {/* Bottom-Right Bracket */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 22,
                      height: 22,
                      borderBottom: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderRight: `3.5px solid ${qrHighlightBox ? '#10b981' : '#38bdf8'}`,
                      borderBottomRightRadius: 12,
                    }}
                  />
                  {/* Center Laser Line */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '10px',
                      right: '10px',
                      top: '50%',
                      height: '2px',
                      background: qrHighlightBox
                        ? 'linear-gradient(90deg, transparent, #10b981, transparent)'
                        : 'linear-gradient(90deg, transparent, #a78bfa, #38bdf8, transparent)',
                      boxShadow: '0 0 8px rgba(56, 189, 248, 0.85)',
                    }}
                  />
                </div>

                {/* Bottom Instruction Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '10px',
                    right: '10px',
                    display: 'flex',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(15, 23, 42, 0.82)',
                      backdropFilter: 'blur(4px)',
                      color: '#e2e8f0',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 12px',
                      borderRadius: '999px',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                    }}
                  >
                    প্রডাক্টের গায়ের QR কোড মাঝের বক্সে ধরুন
                  </span>
                </div>

                {cameraError && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.95)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '16px',
                      textAlign: 'center',
                      gap: '10px',
                      zIndex: 5,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        color: '#fca5a5',
                        fontSize: '12.5px',
                        fontWeight: 700,
                      }}
                    >
                      {cameraError}
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '8px',
                        background: '#4f46e5',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      আবার ক্যামেরা চালু করুন
                    </button>
                  </div>
                )}
              </div>

              {/* Compact Live Status Banner */}
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  background:
                    statusBanner.startsWith('⚡ ন্যানো-সেকেন্ড') ||
                    statusBanner.startsWith('✅')
                      ? 'rgba(16, 185, 129, 0.16)'
                      : statusBanner.startsWith('⚠️') || statusBanner.startsWith('🚨')
                      ? 'rgba(245, 158, 11, 0.16)'
                      : '#131f33',
                  border:
                    statusBanner.startsWith('⚡ ন্যানো-সেকেন্ড') ||
                    statusBanner.startsWith('✅')
                      ? '1px solid #10b981'
                      : statusBanner.startsWith('⚠️') || statusBanner.startsWith('🚨')
                      ? '1px solid #f59e0b'
                      : '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  flexWrap: 'wrap',
                  flexShrink: 0,
                }}
              >
                <span style={{ lineHeight: 1.35 }}>{statusBanner}</span>
                {lastDetectedQrText && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      background: '#0f172a',
                      color: '#38bdf8',
                      fontWeight: 800,
                      border: '1px solid #1e293b',
                    }}
                  >
                    QR: {lastDetectedQrText}
                  </span>
                )}
              </div>

              {/* Last Matched Product Card */}
              {lastMatchedProduct && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background:
                      'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(15, 23, 42, 0.92))',
                    border: '1.5px solid #10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {lastMatchedProduct.imageUrl ? (
                      <img
                        src={lastMatchedProduct.imageUrl}
                        alt={lastMatchedProduct.name}
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '9px',
                          objectFit: 'cover',
                          border: '1.5px solid #34d399',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '9px',
                          background: '#065f46',
                          color: '#6ee7b7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Package size={20} />
                      </div>
                    )}
                    <div>
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
                            background: '#10b981',
                            color: '#022c22',
                            fontWeight: 900,
                            fontSize: '11px',
                            padding: '1px 7px',
                            borderRadius: '5px',
                          }}
                        >
                          SKU #{lastMatchedSku}
                        </span>
                        <b style={{ fontSize: '13.5px', color: '#ffffff' }}>
                          {lastMatchedProduct.name}
                        </b>
                      </div>
                      <small style={{ color: '#a7f3d0', fontSize: '11.5px', fontWeight: 600 }}>
                        দাম: {money(lastMatchedProduct.sellingPrice)} • স্টক:{' '}
                        {toBengaliNumerals(lastMatchedProduct.currentStock)}{' '}
                        {lastMatchedProduct.unit || 'পিস'}
                      </small>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      triggerInstantQrSale(
                        lastMatchedProduct,
                        lastMatchedSku,
                        lastDecodeTimeMs || 1.0
                      )
                    }
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      background: '#10b981',
                      color: '#022c22',
                      border: 'none',
                      fontWeight: 900,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {autoExecuteOnMatch
                      ? `➕ আরও ${toBengaliNumerals(quantity)} পিস সেল`
                      : `⚡ এখনই সেল করুন (${toBengaliNumerals(quantity)} পিস)`}
                  </button>
                </div>
              )}

              {/* Session Sale History with 1-Tap Undo */}
              {saleLogs.length > 0 && (
                <div
                  style={{
                    background: '#131f33',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '10px',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#a7f3d0' }}>
                      ✅ এই সেশনে QR বিক্রয় ({toBengaliNumerals(saleLogs.length)}টি)
                    </span>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#38bdf8' }}>
                      মোট: {money(saleLogs.reduce((s, x) => s + x.totalAmount, 0))}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: '5px',
                      maxHeight: '130px',
                      overflowY: 'auto',
                    }}
                  >
                    {saleLogs.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '6px 9px',
                          borderRadius: '8px',
                          background: '#0f172a',
                          border: '1px solid #1e293b',
                          fontSize: '11.5px',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <b style={{ color: '#ffffff' }}>
                            SKU #{item.skuCode} — {item.product.name}
                          </b>{' '}
                          <span style={{ color: '#94a3b8' }}>
                            ({toBengaliNumerals(item.quantity)} পিস • {money(item.totalAmount)})
                          </span>
                        </div>
                        {onUndoSale && item.entryId && (
                          <button
                            type="button"
                            onClick={async () => {
                              await onUndoSale(item.entryId!, item.product, item.quantity);
                              setSaleLogs((prev) => prev.filter((x) => x.id !== item.id));
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: 'rgba(239, 68, 68, 0.16)',
                              color: '#fca5a5',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              flexShrink: 0,
                            }}
                          >
                            <RotateCcw size={11} />
                            <span>বাতিল</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* TAB 2: PRINTABLE PRODUCT QR CODE STICKER GENERATOR */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #131f33, #0f172a)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h4
                    style={{
                      margin: '0 0 2px',
                      fontSize: '13px',
                      color: '#ffffff',
                      fontWeight: 800,
                    }}
                  >
                    🖨️ প্রডাক্টের QR স্টিকার শিট (SKU সহ)
                  </h4>
                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                    প্রিন্ট করে প্রডাক্টে লাগিয়ে রাখুন — ক্যামেরা ধরলেই সেল হবে
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isDownloadingStickersPdf || !products.length}
                  onClick={handleDownloadAllStickersPdf}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '9px',
                    background: 'linear-gradient(135deg, #10b981, #0284c7)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <Download size={14} />
                  <span>
                    {isDownloadingStickersPdf
                      ? 'QR স্টিকার PDF তৈরি হচ্ছে...'
                      : `সব পণ্যের QR স্টিকার PDF ডাউনলোড (${toBengaliNumerals(
                          products.length
                        )}টি)`}
                  </span>
                </button>
              </div>

              {/* Search Stickers */}
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '11px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                  }}
                />
                <input
                  type="text"
                  value={stickerSearch}
                  onChange={(e) => setStickerSearch(e.target.value)}
                  placeholder="পণ্যের নাম বা SKU (1, 2, 3...) লিখে খুঁজুন..."
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 34px',
                    borderRadius: '9px',
                    border: '1px solid #334155',
                    background: '#131f33',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Grid of Product QR Stickers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
                  gap: '8px',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  paddingRight: '2px',
                }}
              >
                {filteredStickerProducts.map(({ product, effectiveSku }) => (
                  <div
                    key={product.id}
                    style={{
                      background: '#ffffff',
                      color: '#0f172a',
                      borderRadius: '11px',
                      padding: '8px',
                      border: '1.5px solid #cbd5e1',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: '4px',
                    }}
                  >
                    <span
                      style={{
                        background: '#0f172a',
                        color: '#2dd4bf',
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '5px',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      SKU: {effectiveSku}
                    </span>

                    {qrDataUrls[product.id] ? (
                      <img
                        src={qrDataUrls[product.id]}
                        alt={`QR SKU ${effectiveSku}`}
                        style={{ width: '96px', height: '96px', objectFit: 'contain' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '96px',
                          height: '96px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#64748b',
                          fontSize: '10.5px',
                        }}
                      >
                        তৈরি হচ্ছে...
                      </div>
                    )}

                    <b
                      style={{
                        fontSize: '11.5px',
                        color: '#0f172a',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {product.name}
                    </b>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#047857' }}>
                      {money(product.sellingPrice)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleDownloadSingleStickerPng(product, effectiveSku)}
                      style={{
                        width: '100%',
                        padding: '5px 6px',
                        borderRadius: '6px',
                        background: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Download size={11} />
                      <span>স্টিকার নামান</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
