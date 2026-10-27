import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  Check,
  CheckCircle2,
  Lock,
  Edit3,
  Eraser,
  Music,
  Package,
  PenTool,
  RefreshCw,
  RotateCcw,
  Sparkles,
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

export interface CameraSaleLogItem {
  id: string;
  entryId?: string;
  product: Product;
  skuCode?: string;
  quantity: number;
  totalAmount: number;
  profitAmount: number;
  timestamp: string;
  matchMethod: 'ai_vision' | 'barcode' | 'visual_hash' | 'quick_tap';
  seller?: 'Rakib' | 'Limon';
}

interface CameraAutoSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  featureMode?: 'camera' | 'drawing';
  initialSeller?: 'Rakib' | 'Limon';
  onExecuteSale: (params: {
    product: Product;
    quantity: number;
    matchMethod: 'ai_vision' | 'barcode' | 'visual_hash' | 'quick_tap';
    seller: 'Rakib' | 'Limon';
  }) => Promise<string | void>;
  onUndoSale?: (entryId: string, product: Product, quantity: number) => Promise<void>;
  onUpdateProductSku?: (product: Product, newSku: string) => Promise<void>;
}

// -----------------------------------------------------------------------------
// STRICT MASTER SKU WHITELIST: ONLY A..Z (26) and AA..GZ (182) = 208 Valid Codes
// -----------------------------------------------------------------------------
const LETTERS_A_Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PREFIXES_A_G = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export const ALLOWED_SKU_CODES: string[] = [
  ...LETTERS_A_Z,
  ...PREFIXES_A_G.flatMap((prefix) => LETTERS_A_Z.map((ch) => `${prefix}${ch}`)),
];

export const ALLOWED_SKU_SET = new Set<string>(ALLOWED_SKU_CODES);

function stripSkuPrefixesClient(val: string): string {
  return String(val || '')
    .trim()
    .toUpperCase()
    .replace(
      /^(SKU\s*[:#\-=_.]?\s*|CODE\s*[:#\-=_.]?\s*|ITEM\s*[:#\-=_.]?\s*|ID\s*[:#\-=_.]?\s*|NO\s*[:#\-=_.]?\s*|কোড\s*[:#\-=_.]?\s*|পণ্য\s*[:#\-=_.]?\s*|#)/i,
      ''
    )
    .trim();
}

export function toStrictAllowedSkuClient(val: string): string {
  const cleaned = stripSkuPrefixesClient(val).replace(
    /[\s\-_.:/\\#,;|()[\]{}"'`~+*=&%$!@?<>]+/g,
    ''
  );
  return ALLOWED_SKU_SET.has(cleaned) ? cleaned : '';
}

export function getEffectiveProductSku(p: Product, index: number): string {
  const raw = String(p.sku || '').trim();
  const strict = toStrictAllowedSkuClient(raw);
  if (strict) return strict;
  return ALLOWED_SKU_CODES[index % ALLOWED_SKU_CODES.length] || 'A';
}

// 100% STRICT DETERMINISTIC MATCHER:
// Matches ONLY if the input code is in ALLOWED_SKU_SET (A..Z, AA..GZ) AND
// is 100% identical to a product's effective SKU in the website catalog.
export function matchProductBySkuClient(
  rawInput: string | string[],
  products: Product[]
): { product: Product; matchedSku: string } | null {
  const inputList = (Array.isArray(rawInput) ? rawInput : [rawInput])
    .map((s) => toStrictAllowedSkuClient(String(s || '')))
    .filter(Boolean);

  if (!inputList.length || !products.length) return null;

  const indexed = products.map((p, idx) => ({
    product: p,
    effectiveSku: getEffectiveProductSku(p, idx),
  }));

  for (const validCode of inputList) {
    for (const item of indexed) {
      if (validCode === item.effectiveSku) {
        return { product: item.product, matchedSku: item.effectiveSku };
      }
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// Single-Image 320x320 Full-Viewfinder Crisp Frame Builder
// IMPORTANT:
// 1. Never stitch two copies side-by-side (which caused single letter "A" to
//    appear twice horizontally as "AA"!).
// 2. Never blind-crop around red/orange pixels (human fingers/hands holding a
//    product have R > G > B and would cause a tight crop on the fingers that
//    cuts off the actual SKU sticker!).
// 3. Any image <= 384x384 uses the exact same 1 vision tile (258 tokens) in
//    Gemini Vision, so 320x320 gives 2.1x sharper text resolution than 220x220
//    at zero extra token cost!
// -----------------------------------------------------------------------------
function buildCompositeOcrFrame(sourceCanvas: HTMLCanvasElement): {
  compositeDataUrl: string;
  hasSticker: boolean;
} {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || w < 64 || h < 64) {
    return {
      compositeDataUrl: sourceCanvas.toDataURL('image/jpeg', 0.78),
      hasSticker: false,
    };
  }

  const imgData = ctx.getImageData(0, 0, w, h).data;
  const xStart = Math.floor(w * 0.1);
  const xEnd = Math.floor(w * 0.9);
  const yStart = Math.floor(h * 0.1);
  const yEnd = Math.floor(h * 0.9);

  let brightPaperPixels = 0;
  let darkInkPixels = 0;

  for (let y = yStart; y < yEnd; y += 3) {
    for (let x = xStart; x < xEnd; x += 3) {
      const idx = (y * w + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 55) {
        brightPaperPixels++;
      } else if (lum < 85) {
        darkInkPixels++;
      }
    }
  }

  const hasLikelyLabel = brightPaperPixels >= 18 && darkInkPixels >= 8;

  const outSize = 256;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return {
      compositeDataUrl: sourceCanvas.toDataURL('image/jpeg', 0.75),
      hasSticker: hasLikelyLabel,
    };
  }

  outCtx.drawImage(sourceCanvas, 0, 0, w, h, 0, 0, outSize, outSize);

  return {
    compositeDataUrl: outCanvas.toDataURL('image/jpeg', 0.75),
    hasSticker: hasLikelyLabel,
  };
}

// Check that the live camera frame is not pitch dark or completely covered before calling AI,
// and return a compact perceptual signature so static scenes don't burn API quota.
function checkFrameReadinessAndSignature(
  ctx: CanvasRenderingContext2D,
  size = 16
): { avgBrightness: number; pixelStdDev: number; signature: number[] } {
  const imgData = ctx.getImageData(0, 0, size, size).data;
  const totalPixels = size * size;
  let sumLum = 0;
  const lums: number[] = [];
  const signature: number[] = [];

  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sumLum += lum;
    lums.push(lum);
    if ((i / 4) % 8 === 0) {
      signature.push(Math.round(lum), Math.round(r - g));
    }
  }

  const avgBrightness = sumLum / (totalPixels || 1);
  let varianceSum = 0;
  for (let i = 0; i < lums.length; i++) {
    const diff = lums[i] - avgBrightness;
    varianceSum += diff * diff;
  }
  const pixelStdDev = Math.sqrt(varianceSum / (totalPixels || 1));

  return { avgBrightness, pixelStdDev, signature };
}

function computeSignatureDiff(sigA: number[], sigB: number[]): number {
  if (!sigA.length || sigA.length !== sigB.length) return 999;
  let sum = 0;
  for (let i = 0; i < sigA.length; i++) {
    sum += Math.abs(sigA[i] - sigB[i]);
  }
  return sum / sigA.length;
}

// Tight Bounding-Box Crop & Aspect-Preserving Normalizer for Handwriting Drawing Pad
function extractDrawingPadCropDataUrl(padCanvas: HTMLCanvasElement): {
  cropDataUrl: string;
  hasInk: boolean;
} {
  const w = padCanvas.width;
  const h = padCanvas.height;
  const ctx = padCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || w < 32 || h < 32) {
    return { cropDataUrl: '', hasInk: false };
  }

  const imgData = ctx.getImageData(0, 0, w, h).data;
  let inkPixels = 0;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const idx = (y * w + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      if (r < 190 || g < 190 || b < 190) {
        inkPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (inkPixels < 8 || maxX <= minX || maxY <= minY) {
    return { cropDataUrl: '', hasInk: false };
  }

  const inkW = Math.max(24, maxX - minX);
  const inkH = Math.max(24, maxY - minY);
  const padX = Math.max(18, Math.floor(inkW * 0.28));
  const padY = Math.max(18, Math.floor(inkH * 0.28));

  const sx = Math.max(0, minX - padX);
  const sy = Math.max(0, minY - padY);
  const sw = Math.min(w - sx, maxX - minX + padX * 2);
  const sh = Math.min(h - sy, maxY - minY + padY * 2);

  const outW = 160;
  const outH = 108;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return { cropDataUrl: padCanvas.toDataURL('image/jpeg', 0.8), hasInk: true };
  }

  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outW, outH);

  const availW = outW - 22;
  const availH = outH - 22;
  const scale = Math.min(availW / sw, availH / sh);
  const drawW = Math.round(sw * scale);
  const drawH = Math.round(sh * scale);
  const dx = Math.round((outW - drawW) / 2);
  const dy = Math.round((outH - drawH) / 2);

  outCtx.drawImage(padCanvas, sx, sy, sw, sh, dx, dy, drawW, drawH);

  return {
    cropDataUrl: outCanvas.toDataURL('image/jpeg', 0.8),
    hasInk: true,
  };
}

export default function CameraAutoSaleModal({
  isOpen,
  onClose,
  products,
  featureMode = 'camera',
  initialSeller = 'Rakib',
  onExecuteSale,
  onUndoSale,
  onUpdateProductSku,
}: CameraAutoSaleModalProps) {
  const [selectedSeller, setSelectedSeller] = useState<'Rakib' | 'Limon'>(initialSeller || 'Rakib');
  useEffect(() => {
    if (initialSeller) setSelectedSeller(initialSeller);
  }, [initialSeller]);
  const isDrawingFeature = featureMode === 'drawing';
  const inputTab: 'camera' | 'drawing' = isDrawingFeature ? 'drawing' : 'camera';
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [autoPostMode, setAutoPostMode] = useState<boolean>(true);
  const [scanMode] = useState<'sku_fast' | 'sku_and_photo'>('sku_fast');
  const [continuousAutoScan, setContinuousAutoScan] = useState<boolean>(true);
  const [soundConfig, setSoundConfig] = useState<ScannerSoundConfig>(() =>
    loadScannerSoundConfig()
  );
  const [showSoundDrawer, setShowSoundDrawer] = useState<boolean>(false);
  const [defaultQty, setDefaultQty] = useState<string>('1');
  const [manualSkuInput, setManualSkuInput] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [lastDetectedRawCode, setLastDetectedRawCode] = useState<string>('');
  const [editingSkuProductId, setEditingSkuProductId] = useState<string | null>(null);
  const [editingSkuValue, setEditingSkuValue] = useState<string>('');
  const [savingSkuId, setSavingSkuId] = useState<string | null>(null);
  const [scanStatusText, setScanStatusText] = useState<string>(
    isDrawingFeature
      ? '🏷️ নিচে সরাসরি SKU কোড (A–Z / AA–GZ) লিখুন বা প্রডাক্টে ট্যাপ করে তাৎক্ষণিক সেল করুন'
      : '🏷️ ক্যামেরার বক্সের ভেতরে প্রডাক্টের SKU কোড (A-Z / AA-GZ) ধরুন — ১ সেকেন্ডে অটো-সেল হবে'
  );
  const [pendingProduct, setPendingProduct] = useState<{
    product: Product;
    skuCode: string;
    quantity: number;
    confidence: number;
    matchMethod: 'ai_vision' | 'barcode' | 'visual_hash' | 'quick_tap';
  } | null>(null);
  const [flashSuccess, setFlashSuccess] = useState<{
    productName: string;
    skuCode: string;
    quantity: number;
    unit: string;
    totalAmount: number;
    profit: number;
  } | null>(null);
  const [scanSuccessPulse, setScanSuccessPulse] = useState<boolean>(false);
  const [scanPulseKey, setScanPulseKey] = useState<number>(0);
  const [saleLogs, setSaleLogs] = useState<CameraSaleLogItem[]>([]);
  const [isPostingSale, setIsPostingSale] = useState<boolean>(false);
  const [cooldownSec, setCooldownSec] = useState<number>(0);

  // Drawing Pad State & Refs
  const [padHasInk, setPadHasInk] = useState<boolean>(false);
  const [isPadRecognizing, setIsPadRecognizing] = useState<boolean>(false);
  const [padCountdownActive, setPadCountdownActive] = useState<boolean>(false);
  const [padAutoDelayMs, setPadAutoDelayMs] = useState<number>(350);
  const [padStatusBadge, setPadStatusBadge] = useState<string>(
    '✍️ এখানে আঙুল বা মাউস দিয়ে A, B, AB, GZ লিখুন — লেখা শেষ করলেই অটো-সেল হবে'
  );

  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingPointerDownRef = useRef<boolean>(false);
  const lastDrawPointRef = useRef<{ x: number; y: number } | null>(null);
  const padHasInkRef = useRef<boolean>(false);
  const padAutoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const padRequestEpochRef = useRef<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const refThumbnailsRef = useRef<Map<string, string>>(new Map());
  const isScanningRef = useRef<boolean>(false);
  const activeScanCountRef = useRef<number>(0);
  const lastScanStartMsRef = useRef<number>(0);
  const isBarcodeCheckingRef = useRef<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);
  const prevMotionSigRef = useRef<number[]>([]);
  const lastNoMatchSigRef = useRef<{ sig: number[]; time: number; misses: number }>({
    sig: [],
    time: 0,
    misses: 0,
  });
  const autoPostModeRef = useRef<boolean>(true);
  const scanModeRef = useRef<'sku_fast' | 'sku_and_photo'>('sku_fast');
  const defaultQtyRef = useRef<string>('1');
  const productsRef = useRef<Product[]>(products);

  // Initialize white background on Drawing Pad whenever visible
  useEffect(() => {
    if (!isOpen || !isDrawingFeature) return;
    const timer = setTimeout(() => {
      clearDrawingPad(false);
    }, 15);
    return () => clearTimeout(timer);
  }, [isOpen, isDrawingFeature]);

  useEffect(() => {
    const handleSyncSound = () => setSoundConfig(loadScannerSoundConfig());
    window.addEventListener(SCANNER_SOUND_UPDATED_EVENT, handleSyncSound);
    return () => window.removeEventListener(SCANNER_SOUND_UPDATED_EVENT, handleSyncSound);
  }, []);

  useEffect(() => {
    autoPostModeRef.current = autoPostMode;
  }, [autoPostMode]);

  useEffect(() => {
    scanModeRef.current = scanMode;
  }, [scanMode]);

  useEffect(() => {
    defaultQtyRef.current = defaultQty;
  }, [defaultQty]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // 1. Pre-warm server Gemini client & pre-compress reference thumbnails when modal opens
  useEffect(() => {
    if (!isOpen) return;
    unlockScannerAudio();
    fetch('/api/ai/camera-warmup', { method: 'POST' }).catch(() => {});

    const thumbMap = new Map<string, string>();
    products.forEach((p) => {
      if (!p.imageUrl) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 160;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, 160, 160);
            thumbMap.set(p.id, canvas.toDataURL('image/jpeg', 0.68));
          }
        } catch {
          if (p.imageUrl && p.imageUrl.startsWith('data:image/')) {
            thumbMap.set(p.id, p.imageUrl);
          }
        }
      };
      img.onerror = () => {
        if (p.imageUrl && p.imageUrl.startsWith('data:image/')) {
          thumbMap.set(p.id, p.imageUrl);
        }
      };
      img.src = p.imageUrl;
    });

    refThumbnailsRef.current = thumbMap;
  }, [isOpen, products]);

  // 2. Start / Stop Live Camera Stream (Only when camera is shown)
  useEffect(() => {
    if (!isOpen || inputTab === 'drawing') {
      stopCameraStream();
      return;
    }
    startCameraStream(facingMode);
    return () => {
      stopCameraStream();
    };
  }, [isOpen, facingMode, inputTab]);

  // 3. Cooldown countdown timer for UI feedback
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      const rem = Math.max(0, Math.ceil((cooldownUntilRef.current - Date.now()) / 1000));
      setCooldownSec(rem);
    }, 100);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Helper to scan a video element locally via BarcodeDetector + jsQR (~20ms)
  // Only returns codes that are in the strict A..Z / AA..GZ whitelist!
  async function detectLocalCodesFromVideo(video: HTMLVideoElement): Promise<string[]> {
    const foundCodes: string[] = [];

    // A. Native BarcodeDetector (Chrome/Edge/Android)
    if ('BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector();
        const barcodes = await detector.detect(video);
        if (Array.isArray(barcodes)) {
          for (const bc of barcodes) {
            const strictVal = toStrictAllowedSkuClient(String(bc?.rawValue || ''));
            if (strictVal) foundCodes.push(strictVal);
          }
        }
      } catch {}
    }

    // B. Universal Cross-Browser jsQR Decoder
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw > 0 && vh > 0) {
        const qrCanvas = document.createElement('canvas');
        const scanSize = 260;
        qrCanvas.width = scanSize;
        qrCanvas.height = scanSize;
        const qrCtx = qrCanvas.getContext('2d', { willReadFrequently: true });
        if (qrCtx) {
          const crop = Math.min(vw, vh) * 0.85;
          const sx = (vw - crop) / 2;
          const sy = (vh - crop) / 2;
          qrCtx.drawImage(video, sx, sy, crop, crop, 0, 0, scanSize, scanSize);
          const imgData = qrCtx.getImageData(0, 0, scanSize, scanSize);
          const qrResult = jsQR(imgData.data, scanSize, scanSize, {
            inversionAttempts: 'attemptBoth',
          });
          if (qrResult && qrResult.data) {
            const strictQr = toStrictAllowedSkuClient(qrResult.data);
            if (strictQr) {
              foundCodes.push(strictQr);
            }
          }
        }
      }
    } catch {}

    return Array.from(new Set(foundCodes));
  }

  // 4A. SUB-100ms UNIVERSAL LOCAL BARCODE / QR SKU DETECTOR LOOP
  useEffect(() => {
    if (!isOpen || !cameraReady || !continuousAutoScan || inputTab === 'drawing') return;

    const fastLocalTimer = setInterval(async () => {
      if (!videoRef.current || isBarcodeCheckingRef.current) return;
      if (isDrawingPointerDownRef.current || padHasInkRef.current) return;
      if (Date.now() < cooldownUntilRef.current) return;
      if (pendingProduct) return;

      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      isBarcodeCheckingRef.current = true;
      try {
        const localCodes = await detectLocalCodesFromVideo(video);
        if (localCodes.length > 0) {
          setLastDetectedRawCode(localCodes[0]);
          const hit = matchProductBySkuClient(localCodes, productsRef.current);
          if (hit && Date.now() >= cooldownUntilRef.current) {
            const parsedQty = Math.max(0.1, Number(defaultQtyRef.current) || 1);
            if (autoPostModeRef.current) {
              await triggerSaleForProduct(hit.product, parsedQty, 'barcode', hit.matchedSku);
            } else {
              playScannerSound('success');
              setScanPulseKey((prev) => prev + 1);
              setScanSuccessPulse(true);
              setTimeout(() => setScanSuccessPulse(false), 1500);
              setPendingProduct({
                product: hit.product,
                skuCode: hit.matchedSku,
                quantity: parsedQty,
                confidence: 100,
                matchMethod: 'barcode',
              });
              setScanStatusText(
                `✅ SKU কোড "${hit.matchedSku}" ১০০% ম্যাচ হয়েছে: "${hit.product.name}"`
              );
            }
          }
        }
      } catch {
      } finally {
        isBarcodeCheckingRef.current = false;
      }
    }, 110);

    return () => clearInterval(fastLocalTimer);
  }, [isOpen, cameraReady, continuousAutoScan, pendingProduct, inputTab]);

  // 4B. SMART 150ms SINGLE-FLIGHT AI HANDWRITTEN & PRINTED SKU OCR LOOP (A..Z, AA..GZ)
  useEffect(() => {
    if (!isOpen || !cameraReady || !continuousAutoScan || inputTab === 'drawing') return;
    const interval = setInterval(() => {
      if (isScanningRef.current) return;
      if (Date.now() < cooldownUntilRef.current) return;
      if (pendingProduct) return;
      captureAndRecognizeFrame(false);
    }, 150);
    return () => clearInterval(interval);
  }, [isOpen, cameraReady, continuousAutoScan, pendingProduct, scanMode, inputTab]);

  async function startCameraStream(mode: 'environment' | 'user') {
    stopCameraStream();
    setCameraError('');
    setCameraReady(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'আপনার ব্রাউজারে সরাসরি ভিডিও ক্যামেরা সাপোর্ট নেই। নিচের "📸 ছবি তুলুন" বা SKU কোড ইনপুট ব্যবহার করুন।'
      );
      return;
    }

    const constraintCandidates: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // @ts-ignore - continuous autofocus on mobile browsers for instant close-up sticker focus
          advanced: [{ focusMode: 'continuous' }],
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      {
        video: { facingMode: mode },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let acquiredStream: MediaStream | null = null;
    let lastError: any = null;

    for (const constraints of constraintCandidates) {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (acquiredStream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (acquiredStream) {
      streamRef.current = acquiredStream;
      // Also try applying continuous focus constraint on the active video track if supported
      try {
        const track = acquiredStream.getVideoTracks()[0];
        const caps: any = track?.getCapabilities ? track.getCapabilities() : null;
        if (caps?.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
        }
      } catch {}

      if (videoRef.current) {
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.srcObject = acquiredStream;
        await videoRef.current.play().catch(() => {});
        setCameraReady(true);
        setCameraError('');
        setScanStatusText(
          '🟢 ক্যামেরা প্রস্তুত! হাতে লেখা বা প্রিন্ট করা SKU কোড (A-Z / AA-GZ) ধরুন'
        );
      }
      return;
    }

    setCameraError(
      lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError'
        ? 'ব্রাউজারে ক্যামেরা অনুমতি (Allow) করা নেই। উপরের অ্যাড্রেস বারের 🔒 আইকনে ট্যাপ করে Camera Allow করুন এবং "আবার ক্যামেরা চালু করুন" চাপুন।'
        : 'ক্যামেরা চালু করা যায়নি। "আবার ক্যামেরা চালু করুন" বা নিচের SKU কোড বক্স ব্যবহার করুন।'
    );
  }

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }

  async function triggerSaleForProduct(
    product: Product,
    qtyToSell: number,
    matchMethod: 'ai_vision' | 'barcode' | 'visual_hash' | 'quick_tap',
    matchedSkuCode?: string
  ) {
    if (isPostingSale) return;
    const cleanQty = qtyToSell > 0 ? qtyToSell : 1;
    const unitPrice = Number(product.sellingPrice) || 0;
    const unitCost = Number(product.averageCost) || 0;
    const totalAmount = Math.round(cleanQty * unitPrice * 100) / 100;
    const totalCost = Math.round(cleanQty * unitCost * 100) / 100;
    const profitAmount = Math.round((totalAmount - totalCost) * 100) / 100;

    const prodIndex = productsRef.current.findIndex((p) => p.id === product.id);
    const effectiveSku =
      matchedSkuCode || getEffectiveProductSku(product, prodIndex >= 0 ? prodIndex : 0);

    // 0.85s cooldown so back-to-back scans are super fast while preventing double-trigger
    cooldownUntilRef.current = Date.now() + 850;
    setCooldownSec(1);

    // 1. 0ms Instant Audio Feedback
    playScannerSound('success');

    // 2. 0ms Instant Green Verification Pulse & Banner
    setScanPulseKey((prev) => prev + 1);
    setScanSuccessPulse(true);
    setTimeout(() => {
      setScanSuccessPulse(false);
    }, 1100);

    setFlashSuccess({
      productName: product.name,
      skuCode: effectiveSku,
      quantity: cleanQty,
      unit: product.unit || 'পিস',
      totalAmount,
      profit: profitAmount,
    });
    setTimeout(() => {
      setFlashSuccess((prev) => (prev?.productName === product.name ? null : prev));
    }, 1150);

    // 3. 0ms Optimistic UI Sale Log & Status Update (no waiting for database round-trip!)
    const logId = `cam-sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticLogItem: CameraSaleLogItem = {
      id: logId,
      product,
      skuCode: effectiveSku,
      quantity: cleanQty,
      totalAmount,
      profitAmount,
      timestamp: new Date().toLocaleTimeString('bn-BD', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      matchMethod,
      seller: selectedSeller,
    };
    setSaleLogs((prev) => [optimisticLogItem, ...prev]);
    setScanStatusText(
      `✅ SKU "${effectiveSku}" ১০০% ম্যাচ ও সেল সম্পন্ন: ${toBengaliNumerals(cleanQty)} ${
        product.unit || 'পিস'
      } ${product.name} (${money(totalAmount)})`
    );
    setPendingProduct(null);

    // 4. Non-blocking background persistence
    onExecuteSale({
      product,
      quantity: cleanQty,
      matchMethod,
      seller: selectedSeller,
    })
      .then((createdEntryId) => {
        if (typeof createdEntryId === 'string') {
          setSaleLogs((prev) =>
            prev.map((item) => (item.id === logId ? { ...item, entryId: createdEntryId } : item))
          );
        }
      })
      .catch((err: any) => {
        setScanStatusText(err?.message || 'বিক্রি এন্ট্রি করতে সমস্যা হয়েছে');
      });
  }

  function buildCatalogPayload(list: Product[], _includePhotos: boolean) {
    return list.slice(0, 210).map((p, idx) => {
      const s = getEffectiveProductSku(p, idx);
      return {
        id: p.id,
        name: p.name,
        sku: s,
        effectiveSku: s,
      };
    });
  }

  async function captureAndRecognizeFrame(isManualTrigger: boolean) {
    if (!videoRef.current) return;
    if (!isManualTrigger && isScanningRef.current) return;

    const currentProducts = productsRef.current;
    if (currentProducts.length === 0) {
      setScanStatusText('⚠️ আপনার স্টকে এখনো কোনো প্রডাক্ট যোগ করা হয়নি।');
      return;
    }

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Step 1: Instant <25ms Local BarcodeDetector + jsQR Check (strictly filtered to A..Z / AA..GZ)
    const localCodes = await detectLocalCodesFromVideo(video);
    if (localCodes.length > 0) {
      setLastDetectedRawCode(localCodes[0]);
      const hit = matchProductBySkuClient(localCodes, currentProducts);
      if (hit && Date.now() >= cooldownUntilRef.current) {
        const parsedQty = Math.max(0.1, Number(defaultQtyRef.current) || 1);
        if (autoPostModeRef.current) {
          await triggerSaleForProduct(hit.product, parsedQty, 'barcode', hit.matchedSku);
        } else {
          playScannerSound('success');
          setScanPulseKey((prev) => prev + 1);
          setScanSuccessPulse(true);
          setTimeout(() => setScanSuccessPulse(false), 1500);
          setPendingProduct({
            product: hit.product,
            skuCode: hit.matchedSku,
            quantity: parsedQty,
            confidence: 100,
            matchMethod: 'barcode',
          });
        }
        return;
      }
    }

    // Step 2: Check frame readiness & motion stability
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cropSize = Math.min(vw, vh) * 0.84;
    const sx = (vw - cropSize) / 2;
    const sy = (vh - cropSize) / 2;

    let currentSig: number[] = [];
    const checkCanvas = document.createElement('canvas');
    checkCanvas.width = 16;
    checkCanvas.height = 16;
    const checkCtx = checkCanvas.getContext('2d');
    if (checkCtx) {
      checkCtx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 16, 16);
      const { avgBrightness, pixelStdDev, signature } = checkFrameReadinessAndSignature(
        checkCtx,
        16
      );
      currentSig = signature;
      const motionDiff = computeSignatureDiff(signature, prevMotionSigRef.current);
      prevMotionSigRef.current = signature;

      if (!isManualTrigger) {
        // Pitch dark or covered lens
        if (avgBrightness < 10 || pixelStdDev < 6) {
          return;
        }
        // If hand is rapidly moving across the camera (severe motion blur), wait 220ms for it to settle
        if (motionDiff > 30) {
          return;
        }
      }
    }

    // Step 3: Capture 256x256 crisp single-tile frame of the target viewfinder
    const targetSize = 256;
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = targetSize;
    frameCanvas.height = targetSize;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    if (!frameCtx) return;

    frameCtx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);
    const { compositeDataUrl, hasSticker } = buildCompositeOcrFrame(frameCanvas);

    // Allow immediate back-to-back retries while camera autofocuses (first 3 attempts),
    // and if held completely motionless, re-scan every 650ms so holding a product never stalls!
    if (!isManualTrigger) {
      const diffFromLastMiss = computeSignatureDiff(currentSig, lastNoMatchSigRef.current.sig);
      if (diffFromLastMiss >= 3.0) {
        lastNoMatchSigRef.current.misses = 0;
      } else {
        const maxImmediateRetries = hasSticker ? 3 : 2;
        if (
          lastNoMatchSigRef.current.misses >= maxImmediateRetries &&
          Date.now() - lastNoMatchSigRef.current.time < 650
        ) {
          return;
        }
      }
    }

    activeScanCountRef.current = 1;
    lastScanStartMsRef.current = Date.now();
    isScanningRef.current = true;
    setIsScanning(true);
    const activeScanMode = scanModeRef.current;
    if (isManualTrigger) {
      setScanStatusText('⚡ প্রডাক্টের গায়ের SKU কোড (A-Z / AA-GZ) স্ক্যান ও ম্যাচ করা হচ্ছে...');
    }

    try {
      const response = await fetch('/api/ai/camera-match-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameDataUrl: compositeDataUrl,
          stickerCropDataUrl: '',
          scanMode: activeScanMode,
          products: buildCatalogPayload(currentProducts, false),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const detectedSku = String(data.detectedSkuCode || '').trim().toUpperCase();
        const allCandidateCodes: string[] = [
          detectedSku,
          ...(Array.isArray(data.allVisibleCodes)
            ? data.allVisibleCodes.map((c: any) => String(c || '').trim().toUpperCase())
            : []),
        ].filter(Boolean);

        if (detectedSku) {
          setLastDetectedRawCode(detectedSku);
        } else if (allCandidateCodes.length > 0) {
          setLastDetectedRawCode(allCandidateCodes[0]);
        }

        // Strict deterministic client verification: ONLY codes in ALLOWED_SKU_SET (A..Z, AA..GZ)
        // that 100% equal a product's effective SKU in currentProducts can match!
        const clientSkuHit =
          allCandidateCodes.length > 0
            ? matchProductBySkuClient(allCandidateCodes, currentProducts)
            : null;

        if (clientSkuHit && Date.now() >= cooldownUntilRef.current) {
          lastNoMatchSigRef.current = { sig: [], time: 0, misses: 0 };
          const verifiedProd = clientSkuHit.product;
          const matchedSkuCode = clientSkuHit.matchedSku;
          const finalQty = Math.max(0.1, Number(defaultQtyRef.current) || 1);

          if (autoPostModeRef.current) {
            await triggerSaleForProduct(verifiedProd, finalQty, 'barcode', matchedSkuCode);
          } else {
            playScannerSound('success');
            setScanPulseKey((prev) => prev + 1);
            setScanSuccessPulse(true);
            setTimeout(() => setScanSuccessPulse(false), 1500);
            setPendingProduct({
              product: verifiedProd,
              skuCode: matchedSkuCode,
              quantity: finalQty,
              confidence: 100,
              matchMethod: 'barcode',
            });
            setScanStatusText(
              `✅ SKU কোড "${matchedSkuCode}" ১০০% ম্যাচ হয়েছে: "${verifiedProd.name}"`
            );
          }
          return;
        }

        const prevMisses =
          computeSignatureDiff(currentSig, lastNoMatchSigRef.current.sig) < 2.4
            ? lastNoMatchSigRef.current.misses + 1
            : 1;
        lastNoMatchSigRef.current = {
          sig: currentSig,
          time: Date.now(),
          misses: prevMisses,
        };

        if (isManualTrigger || detectedSku) {
          setScanStatusText(
            data.reasonBn ||
              (detectedSku
                ? `❌ স্ক্যানকৃত কোড "${detectedSku}" স্টকের কোনো প্রডাক্টের SKU-এর সাথে মেলেনি (নিচে প্রডাক্টের ✏️ SKU বাটনে চাপ দিয়ে "${detectedSku}" সেট করতে পারেন)`
                : '❌ কোনো SKU কোড দেখা যায়নি — প্রডাক্টের গায়ের SKU কোড (A-Z / AA-GZ) বক্সের ভেতরে ধরুন')
          );
        } else {
          setScanStatusText(
            '🏷️ বক্সের ভেতরে প্রডাক্টের SKU কোড (A-Z / AA-GZ) ধরুন — ১ সেকেন্ডে সেল হবে'
          );
        }
      }
    } catch {
      if (isManualTrigger) {
        setScanStatusText('⚠️ আবার চেষ্টা করুন বা স্পষ্ট আলোতে SKU কোডটি ধরুন');
      }
    } finally {
      activeScanCountRef.current = Math.max(0, activeScanCountRef.current - 1);
      if (activeScanCountRef.current === 0) {
        isScanningRef.current = false;
        setIsScanning(false);
      }
    }
  }

  async function handleManualSkuSubmit(e: React.FormEvent) {
    e.preventDefault();
    unlockScannerAudio();
    const raw = manualSkuInput.trim().toUpperCase();
    if (!raw) return;

    const strictCode = toStrictAllowedSkuClient(raw);
    if (!strictCode) {
      playScannerSound('undo');
      setScanStatusText(
        `❌ "${raw}" অনুমোদিত SKU কোড (A থেকে Z এবং AA থেকে GZ)-এর বাহিরে! অনুগ্রহ করে শুধু A-Z বা AA-GZ কোড ব্যবহার করুন।`
      );
      return;
    }

    const hit = matchProductBySkuClient(strictCode, products);
    if (hit) {
      setManualSkuInput('');
      const qty = Math.max(0.1, Number(defaultQty) || 1);
      if (autoPostMode) {
        await triggerSaleForProduct(hit.product, qty, 'barcode', hit.matchedSku);
      } else {
        playScannerSound('success');
        setScanPulseKey((prev) => prev + 1);
        setScanSuccessPulse(true);
        setTimeout(() => setScanSuccessPulse(false), 1500);
        setPendingProduct({
          product: hit.product,
          skuCode: hit.matchedSku,
          quantity: qty,
          confidence: 100,
          matchMethod: 'barcode',
        });
        setScanStatusText(
          `✅ SKU কোড "${hit.matchedSku}" ১০০% ম্যাচ হয়েছে: "${hit.product.name}"`
        );
      }
    } else {
      playScannerSound('undo');
      setLastDetectedRawCode(strictCode);
      setScanStatusText(
        `❌ "${strictCode}" কোডে আপনার স্টকে কোনো প্রডাক্ট নেই! নিচের প্রডাক্ট লিস্টে ✏️ SKU বাটনে ক্লিক করে "${strictCode}" সেট করুন।`
      );
    }
  }

  async function handleFilePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    unlockScannerAudio();

    setIsScanning(true);
    setScanStatusText('📸 ছবির SKU কোড (A-Z / AA-GZ) স্টকের প্রডাক্টের কোডের সাথে মেলানো হচ্ছে...');

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawDataUrl = ev.target?.result as string;
        if (!rawDataUrl) {
          setIsScanning(false);
          return;
        }
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 320;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          let compositeUrl = '';

          if (ctx) {
            ctx.drawImage(img, 0, 0, 320, 320);
            try {
              const imgData = ctx.getImageData(0, 0, 320, 320);
              const qr = jsQR(imgData.data, 320, 320, { inversionAttempts: 'attemptBoth' });
              if (qr && qr.data) {
                const qrHit = matchProductBySkuClient(qr.data, products);
                if (qrHit) {
                  const qty = Math.max(0.1, Number(defaultQty) || 1);
                  if (autoPostMode) {
                    await triggerSaleForProduct(qrHit.product, qty, 'barcode', qrHit.matchedSku);
                  } else {
                    playScannerSound('success');
                    setPendingProduct({
                      product: qrHit.product,
                      skuCode: qrHit.matchedSku,
                      quantity: qty,
                      confidence: 100,
                      matchMethod: 'barcode',
                    });
                  }
                  setIsScanning(false);
                  return;
                }
              }
            } catch {}

            compositeUrl = buildCompositeOcrFrame(canvas).compositeDataUrl;
          } else {
            compositeUrl = canvas.toDataURL('image/jpeg', 0.8);
          }

          try {
            const response = await fetch('/api/ai/camera-match-product', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                frameDataUrl: compositeUrl,
                stickerCropDataUrl: '',
                scanMode,
                products: buildCatalogPayload(products, false),
              }),
            });
            const data = await response.json();
            const detectedSku = String(data.detectedSkuCode || '').trim().toUpperCase();
            const allCandidateCodes: string[] = [
              detectedSku,
              ...(Array.isArray(data.allVisibleCodes)
                ? data.allVisibleCodes.map((c: any) => String(c || '').trim().toUpperCase())
                : []),
            ].filter(Boolean);

            if (detectedSku) setLastDetectedRawCode(detectedSku);
            const clientSkuHit =
              allCandidateCodes.length > 0
                ? matchProductBySkuClient(allCandidateCodes, products)
                : null;

            if (clientSkuHit) {
              const matchedProd = clientSkuHit.product;
              const matchedSku = clientSkuHit.matchedSku;
              const qty = Math.max(0.1, Number(defaultQty) || 1);
              if (autoPostMode) {
                await triggerSaleForProduct(matchedProd, qty, 'barcode', matchedSku);
              } else {
                playScannerSound('success');
                setScanPulseKey((prev) => prev + 1);
                setScanSuccessPulse(true);
                setTimeout(() => setScanSuccessPulse(false), 1500);
                setPendingProduct({
                  product: matchedProd,
                  skuCode: matchedSku,
                  quantity: qty,
                  confidence: 100,
                  matchMethod: 'barcode',
                });
              }
            } else {
              playScannerSound('undo');
              setScanStatusText(
                data.reasonBn ||
                  '❌ এই ছবির SKU কোড স্টকের কোনো প্রডাক্টের কোডের সাথে মেলেনি'
              );
            }
          } catch {
            setScanStatusText('⚠️ ছবি থেকে SKU কোড যাচাই করা যায়নি');
          } finally {
            setIsScanning(false);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    } catch {
      setIsScanning(false);
    }
  }

  function clearDrawingPad(resetStatus = true) {
    if (padAutoTimerRef.current) {
      clearTimeout(padAutoTimerRef.current);
      padAutoTimerRef.current = null;
    }
    padRequestEpochRef.current += 1;
    isDrawingPointerDownRef.current = false;
    lastDrawPointRef.current = null;
    padHasInkRef.current = false;
    setPadHasInk(false);
    setPadCountdownActive(false);
    setIsPadRecognizing(false);

    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    if (resetStatus) {
      setPadStatusBadge(
        '✍️ এখানে আঙুল বা মাউস দিয়ে A, B, AB, GZ লিখুন — লেখা শেষ করলেই অটো-সেল হবে'
      );
    }
  }

  function getDrawingPadCoords(
    e: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePadPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    unlockScannerAudio();
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

    // Cancel any pending auto-submit or in-flight OCR so user can finish multi-stroke letters (A, AB)
    if (padAutoTimerRef.current) {
      clearTimeout(padAutoTimerRef.current);
      padAutoTimerRef.current = null;
    }
    padRequestEpochRef.current += 1;
    setPadCountdownActive(false);
    setIsPadRecognizing(false);

    const pt = getDrawingPadCoords(e);
    if (!pt) return;

    isDrawingPointerDownRef.current = true;
    lastDrawPointRef.current = pt;
    padHasInkRef.current = true;
    setPadHasInk(true);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    setPadStatusBadge('✍️ লিখছেন... (লেখা শেষ করে হাত তুললেই অটো-সেল হবে)');
  }

  function handlePadPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingPointerDownRef.current) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const pt = getDrawingPadCoords(e);
    if (!pt) return;

    const ctx = canvas.getContext('2d');
    const prev = lastDrawPointRef.current || pt;
    if (ctx) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    lastDrawPointRef.current = pt;
  }

  function schedulePadAutoRecognize() {
    if (!padHasInkRef.current) return;
    if (padAutoTimerRef.current) {
      clearTimeout(padAutoTimerRef.current);
      padAutoTimerRef.current = null;
    }
    setPadCountdownActive(true);
    setPadStatusBadge('⚡ লেখা শনাক্ত ও অটো-সেল হচ্ছে...');
    const scheduledEpoch = ++padRequestEpochRef.current;

    // 0ms SPECULATIVE PRE-FLIGHT RECOGNITION:
    // Start the server OCR request IMMEDIATELY when the user lifts their finger,
    // and run the short grace timer (padAutoDelayMs) in parallel so if the user
    // doesn't draw another stroke, the OCR response is already ready!
    recognizeDrawingPadAndSell(scheduledEpoch, padAutoDelayMs);
  }

  function handlePadPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingPointerDownRef.current) return;
    isDrawingPointerDownRef.current = false;
    lastDrawPointRef.current = null;
    try {
      drawingCanvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
    schedulePadAutoRecognize();
  }

  async function recognizeDrawingPadAndSell(epochOverride?: number, graceWaitMs = 0) {
    const canvas = drawingCanvasRef.current;
    if (!canvas || !padHasInkRef.current) return;

    if (padAutoTimerRef.current) {
      clearTimeout(padAutoTimerRef.current);
      padAutoTimerRef.current = null;
    }

    const currentProducts = productsRef.current;
    if (currentProducts.length === 0) {
      setScanStatusText('⚠️ আপনার স্টকে এখনো কোনো প্রডাক্ট যোগ করা হয়নি।');
      return;
    }

    const { cropDataUrl, hasInk } = extractDrawingPadCropDataUrl(canvas);
    if (!hasInk || !cropDataUrl) {
      clearDrawingPad(true);
      return;
    }

    const myEpoch =
      typeof epochOverride === 'number' ? epochOverride : ++padRequestEpochRef.current;
    setIsPadRecognizing(true);
    setPadStatusBadge('⚡ হাতে লেখা SKU কোড (A–Z / AA–GZ) ম্যাচ করা হচ্ছে...');
    setScanStatusText('⚡ ড্রইং প্যাডের লেখা কোড প্রডাক্টের SKU-এর সাথে মেলানো হচ্ছে...');

    try {
      const fetchPromise = fetch('/api/ai/camera-match-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameDataUrl: cropDataUrl,
          stickerCropDataUrl: '',
          isDrawingPad: true,
          products: buildCatalogPayload(currentProducts, false),
        }),
      });

      const gracePromise =
        graceWaitMs > 0
          ? new Promise<void>((resolve) => {
              padAutoTimerRef.current = setTimeout(() => {
                padAutoTimerRef.current = null;
                setPadCountdownActive(false);
                resolve();
              }, graceWaitMs);
            })
          : Promise.resolve();

      const [response] = await Promise.all([fetchPromise, gracePromise]);

      // If user touched the pad again while request/grace timer was in flight, ignore this intermediate result
      if (myEpoch !== padRequestEpochRef.current || isDrawingPointerDownRef.current) {
        return;
      }

      if (response.ok) {
        const data = await response.json();
        if (myEpoch !== padRequestEpochRef.current || isDrawingPointerDownRef.current) {
          return;
        }

        const detectedSku = String(data.detectedSkuCode || '').trim().toUpperCase();
        const allCandidateCodes: string[] = [
          detectedSku,
          ...(Array.isArray(data.allVisibleCodes)
            ? data.allVisibleCodes.map((c: any) => String(c || '').trim().toUpperCase())
            : []),
        ].filter(Boolean);

        if (detectedSku) {
          setLastDetectedRawCode(detectedSku);
        } else if (allCandidateCodes.length > 0) {
          setLastDetectedRawCode(allCandidateCodes[0]);
        }

        const clientSkuHit =
          allCandidateCodes.length > 0
            ? matchProductBySkuClient(allCandidateCodes, currentProducts)
            : null;

        if (clientSkuHit) {
          const verifiedProd = clientSkuHit.product;
          const matchedSkuCode = clientSkuHit.matchedSku;
          const finalQty = Math.max(0.1, Number(defaultQtyRef.current) || 1);

          setPadStatusBadge(
            `✅ "${matchedSkuCode}" ১০০% ম্যাচ → ${verifiedProd.name} (পরবর্তী কোড লিখুন)`
          );

          if (autoPostModeRef.current) {
            await triggerSaleForProduct(verifiedProd, finalQty, 'barcode', matchedSkuCode);
          } else {
            playScannerSound('success');
            setScanPulseKey((prev) => prev + 1);
            setScanSuccessPulse(true);
            setTimeout(() => setScanSuccessPulse(false), 1500);
            setPendingProduct({
              product: verifiedProd,
              skuCode: matchedSkuCode,
              quantity: finalQty,
              confidence: 100,
              matchMethod: 'barcode',
            });
            setScanStatusText(
              `✅ ড্রইং প্যাডে "${matchedSkuCode}" ১০০% ম্যাচ হয়েছে: "${verifiedProd.name}"`
            );
          }

          setTimeout(() => {
            if (!isDrawingPointerDownRef.current) {
              clearDrawingPad(false);
            }
          }, 260);
          return;
        }

        playScannerSound('undo');
        const noMatchMsg =
          data.reasonBn ||
          (detectedSku
            ? `❌ ড্রইং প্যাডে "${detectedSku}" লেখা হয়েছে, কিন্তু স্টকে "${detectedSku}" কোডের কোনো প্রডাক্ট নেই!`
            : '❌ লেখাটি স্পষ্ট বোঝা যায়নি — অনুগ্রহ করে বড় করে A–Z বা AA–GZ লিখুন');
        setPadStatusBadge(noMatchMsg);
        setScanStatusText(noMatchMsg);

        setTimeout(() => {
          if (!isDrawingPointerDownRef.current && myEpoch === padRequestEpochRef.current) {
            clearDrawingPad(false);
          }
        }, 950);
      }
    } catch {
      if (myEpoch === padRequestEpochRef.current) {
        setPadStatusBadge('⚠️ আবার চেষ্টা করুন — স্পষ্ট করে A বা AB লিখুন');
      }
    } finally {
      if (myEpoch === padRequestEpochRef.current) {
        setPadCountdownActive(false);
        setIsPadRecognizing(false);
      }
    }
  }

  async function handleSaveInlineSku(product: Product) {
    const strictSku = toStrictAllowedSkuClient(editingSkuValue);
    if (!strictSku) {
      playScannerSound('undo');
      setScanStatusText(
        `❌ "${editingSkuValue.trim()}" গ্রহণযোগ্য নয়! অনুগ্রহ করে শুধুমাত্র A থেকে Z অথবা AA থেকে GZ এর মধ্যকার কোড দিন।`
      );
      return;
    }
    if (!onUpdateProductSku) {
      setEditingSkuProductId(null);
      return;
    }
    setSavingSkuId(product.id);
    try {
      await onUpdateProductSku(product, strictSku);
      setEditingSkuProductId(null);
      setScanStatusText(
        `✅ "${product.name}"-এর SKU কোড "${strictSku}" সেট করা হয়েছে! এখন হাতে লেখা বা প্রিন্ট করা "${strictSku}" স্ক্যান করলেই সেল হবে।`
      );
      playScannerSound('success');
    } catch (err: any) {
      setScanStatusText(err?.message || 'SKU কোড আপডেট করতে সমস্যা হয়েছে');
    } finally {
      setSavingSkuId(null);
    }
  }

  if (!isOpen) return null;

  const totalSessionSales = saleLogs.reduce((acc, item) => acc + item.totalAmount, 0);
  const totalSessionProfit = saleLogs.reduce((acc, item) => acc + item.profitAmount, 0);

  return (
    <div
      className="modal-backdrop"
      onPointerDown={() => unlockScannerAudio()}
      style={{
        zIndex: 9998,
        background: 'rgba(2, 6, 23, 0.84)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Shared Datalist for all 208 Valid SKU Codes (A..Z, AA..GZ) */}
      <datalist id="allowed-sku-codes-datalist">
        {ALLOWED_SKU_CODES.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>

      <div
        className={`cam-pos-modal ${
          scanSuccessPulse || flashSuccess ? 'cam-scan-success-glow' : ''
        }`}
        style={{
          maxWidth: '540px',
          width: '100%',
          maxHeight: 'calc(100dvh - 20px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '20px',
          border:
            scanSuccessPulse || flashSuccess
              ? '2px solid #22c55e'
              : '1.5px solid rgba(20, 184, 166, 0.65)',
          boxShadow:
            scanSuccessPulse || flashSuccess
              ? '0 0 0 4px rgba(34, 197, 94, 0.55), 0 0 36px rgba(16, 185, 129, 0.8), 0 24px 60px rgba(0, 0, 0, 0.55)'
              : '0 24px 60px rgba(0, 0, 0, 0.55)',
          background: '#0f172a',
          color: '#f8fafc',
          transition: 'border-color 0.2s ease, box-shadow 0.25s ease',
        }}
      >
        {/* 1. DEDICATED TOP HEADER (Strictly Separate for Camera vs Drawing Pad, NO Mode Buttons in Header) */}
        <div
          style={{
            background: isDrawingFeature
              ? 'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)'
              : 'linear-gradient(135deg, #0d9488 0%, #0369a1 100%)',
            padding: '11px 13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexShrink: 0,
            borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isDrawingFeature ? (
                <PenTool size={18} color="#ffffff" />
              ) : (
                <Camera size={18} color="#ffffff" />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '14.5px',
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isDrawingFeature
                  ? '✍️ ড্রইং প্যাড অটো-সেল (A–Z / AA–GZ)'
                  : '📷 লাইভ ক্যামেরা SKU স্ক্যানার (A–Z / AA–GZ)'}
              </h3>
              <p
                style={{
                  margin: '1px 0 0',
                  fontSize: '11px',
                  color: '#e0f2fe',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isDrawingFeature
                  ? 'প্যাডে A, B, AB, GZ লিখলেই সাথে সাথে অটো-সেল'
                  : 'প্রডাক্টের গায়ের SKU কোড ধরলেই ১ সেকেন্ডে অটো-সেল'}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
            }}
          >
            {/* Sound Upload / Settings Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowSoundDrawer((prev) => !prev)}
              title="কাস্টম স্ক্যানার সাউন্ড আপলোড ও পরিবর্তন করুন"
              style={{
                background: showSoundDrawer
                  ? '#10b981'
                  : soundConfig.customAudioDataUrl
                  ? 'rgba(16, 185, 129, 0.35)'
                  : 'rgba(255, 255, 255, 0.22)',
                border: '1px solid rgba(255, 255, 255, 0.28)',
                color: '#ffffff',
                height: '35px',
                minHeight: '35px',
                padding: '0 9px',
                borderRadius: '10px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                flexShrink: 0,
              }}
            >
              <Music size={15} />
              <span>সাউন্ড</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = saveScannerSoundConfig({ enabled: !soundConfig.enabled });
                setSoundConfig(next);
                if (next.enabled) playScannerSound('success', true);
              }}
              title={
                soundConfig.enabled ? 'স্ক্যান সাউন্ড চালু আছে' : 'স্ক্যান সাউন্ড বন্ধ আছে'
              }
              style={{
                background: soundConfig.enabled
                  ? 'rgba(255, 255, 255, 0.24)'
                  : 'rgba(15, 23, 42, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.24)',
                color: '#ffffff',
                width: '35px',
                height: '35px',
                minHeight: '35px',
                padding: 0,
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {soundConfig.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>

            {!isDrawingFeature && (
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                title="সামনের / পেছনের ক্যামেরা পরিবর্তন করুন"
                style={{
                  background: 'rgba(255, 255, 255, 0.22)',
                  border: '1px solid rgba(255, 255, 255, 0.24)',
                  color: '#ffffff',
                  width: '35px',
                  height: '35px',
                  minHeight: '35px',
                  padding: 0,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <RefreshCw size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              title="বন্ধ করুন"
              style={{
                background: 'rgba(15, 23, 42, 0.42)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                width: '35px',
                height: '35px',
                minHeight: '35px',
                padding: 0,
                borderRadius: '10px',
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
        </div>

        {/* SCROLLABLE MODAL BODY */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* OPTIONAL INLINE CUSTOM SOUND UPLOAD DRAWER */}
          {showSoundDrawer && (
            <div
              style={{
                padding: '10px 14px',
                background: '#0f172a',
                borderBottom: '1px solid #334155',
              }}
            >
              <ScannerSoundSettingsCard
                compact
                onStatusMessage={(msg) => setScanStatusText(msg)}
              />
            </div>
          )}

          {/* 2. QUANTITY & AUTO-CONFIRM CONTROL PANEL (Clean, no mode switcher tabs) */}
          <div
            style={{
              padding: '9px 14px',
              background: '#1e293b',
              borderBottom: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setAutoPostMode((prev) => !prev)}
                style={{
                  background: autoPostMode ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
                  color: autoPostMode ? '#34d399' : '#cbd5e1',
                  border: `1.5px solid ${autoPostMode ? '#10b981' : '#475569'}`,
                  borderRadius: '8px',
                  height: '31px',
                  minHeight: '31px',
                  padding: '0 9px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCircle2 size={12} />
                <span>{autoPostMode ? 'অটো সেল কনফার্ম: ON' : 'ম্যানুয়াল কনফার্ম'}</span>
              </button>

              {/* LOCKED LOGGED-IN SELLER BADGE (No buttons - strict account isolation) */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: selectedSeller === 'Limon' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(2, 132, 199, 0.2)',
                  padding: '3px 10px',
                  borderRadius: '8px',
                  border: selectedSeller === 'Limon' ? '1.5px solid #a855f7' : '1.5px solid #38bdf8',
                }}
                title={`লগইন অ্যাকাউন্ট: ${selectedSeller === 'Limon' ? 'লিমন (Limon)' : 'রাকিব (Rakib)'} — শুধুমাত্র আপনার নামেই সেল এন্ট্রি হবে`}
              >
                <span style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 700 }}>বিক্রেতা:</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: selectedSeller === 'Limon' ? '#e9d5ff' : '#bae6fd',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Lock size={11} style={{ opacity: 0.9 }} />
                  {selectedSeller === 'Limon' ? '👤 লিমন' : '👤 রাকিব'}
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flex: 1,
                justifyContent: 'flex-end',
              }}
            >
              <span
                style={{
                  fontSize: '11.5px',
                  color: '#cbd5e1',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  marginRight: '2px',
                }}
              >
                পরিমাণ:
              </span>
              {['1', '2', '5', '10'].map((q) => {
                const active = defaultQty === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setDefaultQty(q)}
                    style={{
                      background: active ? '#0d9488' : '#0f172a',
                      color: active ? '#ffffff' : '#cbd5e1',
                      border: `1.5px solid ${active ? '#2dd4bf' : '#475569'}`,
                      borderRadius: '8px',
                      height: '30px',
                      minHeight: '30px',
                      minWidth: '30px',
                      padding: '0 8px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {toBengaliNumerals(q)}
                  </button>
                );
              })}
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={defaultQty}
                onChange={(e) => setDefaultQty(e.target.value)}
                aria-label="কাস্টম পরিমাণ"
                style={{
                  width: '52px',
                  height: '30px',
                  minHeight: '30px',
                  padding: '0 5px',
                  borderRadius: '8px',
                  border: '1.5px solid #475569',
                  background: '#0f172a',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 800,
                  textAlign: 'center',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Flash Success Banner when in non-camera view */}
          {isDrawingFeature && flashSuccess && (
            <div
              key={`pad-verify-${scanPulseKey}`}
              style={{
                margin: "10px 14px 2px",
                background: "linear-gradient(135deg, rgba(6, 78, 59, 0.96), rgba(5, 150, 105, 0.92))",
                border: "2px solid #4ade80",
                borderRadius: "12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 12px",
                textAlign: "center",
                gap: "4px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#16a34a",
                  border: "1.5px solid #86efac",
                  color: "#ffffff",
                  padding: "2px 10px",
                  borderRadius: "999px",
                  fontSize: "11.5px",
                  fontWeight: 900,
                }}
              >
                <CheckCircle2 size={14} />
                <span>✨ সফল সেল • SKU: {flashSuccess.skuCode}</span>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 900, color: "#ffffff" }}>
                {flashSuccess.productName} ({toBengaliNumerals(flashSuccess.quantity)}{" "}
                {flashSuccess.unit})
              </div>
              <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#a7f3d0" }}>
                বিক্রি: {money(flashSuccess.totalAmount)} | লাভ: +{money(flashSuccess.profit)}
              </div>
            </div>
          )}

          {/* 3. LIVE CAMERA VIEWPORT (Shown ONLY when featureMode === 'camera') */}
          {!isDrawingFeature && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '215px',
              minHeight: '215px',
              flexShrink: 0,
              background: '#020617',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
                opacity: cameraReady ? 1 : 0.15,
              }}
            />

            {/* Green Border Flash Ring around entire Camera Viewport on Successful Scan */}
            {(scanSuccessPulse || flashSuccess) && (
              <div
                key={`viewport-flash-${scanPulseKey}`}
                className="cam-viewport-green-flash-ring"
              />
            )}

            {/* Targeting Reticle Box (Only when camera is ready and no error) */}
            {cameraReady && !cameraError && (
              <div
                style={{
                  position: 'absolute',
                  width: '215px',
                  height: '145px',
                  border: `${scanSuccessPulse || flashSuccess ? '3px' : '2.5px'} solid ${
                    scanSuccessPulse || flashSuccess
                      ? '#4ade80'
                      : cooldownSec > 0
                      ? '#f59e0b'
                      : isScanning
                      ? '#38bdf8'
                      : 'rgba(45, 212, 191, 0.9)'
                  }`,
                  borderRadius: '18px',
                  boxShadow:
                    scanSuccessPulse || flashSuccess
                      ? '0 0 26px rgba(34, 197, 94, 0.9), inset 0 0 22px rgba(34, 197, 94, 0.45), 0 0 0 9999px rgba(5, 150, 105, 0.26)'
                      : '0 0 0 9999px rgba(2, 6, 23, 0.42)',
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: scanSuccessPulse || flashSuccess ? '#ffffff' : '#ccfbf1',
                    textAlign: 'center',
                    background:
                      scanSuccessPulse || flashSuccess
                        ? 'linear-gradient(135deg, #16a34a 0%, #059669 100%)'
                        : 'rgba(15, 23, 42, 0.82)',
                    border:
                      scanSuccessPulse || flashSuccess
                        ? '1px solid #86efac'
                        : '1px solid rgba(45, 212, 191, 0.35)',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    alignSelf: 'center',
                    whiteSpace: 'nowrap',
                    boxShadow:
                      scanSuccessPulse || flashSuccess
                        ? '0 0 14px rgba(34, 197, 94, 0.7)'
                        : 'none',
                  }}
                >
                  {scanSuccessPulse || flashSuccess
                    ? '✨ সফল স্ক্যান ভেরিফাইড!'
                    : cooldownSec > 0
                    ? `পরবর্তী স্ক্যান ${toBengaliNumerals(cooldownSec)} সেকেন্ড পর...`
                    : isScanning
                    ? '⚡ SKU কোড ম্যাচ হচ্ছে...'
                    : '🏷️ এখানে SKU স্টিকার (A-Z / AA-GZ) ধরুন'}
                </div>

                {/* Scanning Laser Line */}
                <div
                  style={{
                    width: '100%',
                    height: scanSuccessPulse || flashSuccess ? '3px' : '2px',
                    background:
                      scanSuccessPulse || flashSuccess
                        ? 'linear-gradient(90deg, transparent, #4ade80, #22c55e, transparent)'
                        : 'linear-gradient(90deg, transparent, #2dd4bf, #38bdf8, transparent)',
                    boxShadow:
                      scanSuccessPulse || flashSuccess
                        ? '0 0 16px #4ade80'
                        : '0 0 12px #2dd4bf',
                  }}
                />

                <div
                  style={{
                    fontSize: '10.5px',
                    color: scanSuccessPulse || flashSuccess ? '#bbf7d0' : '#e2e8f0',
                    textAlign: 'center',
                    fontWeight: 700,
                    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  }}
                >
                  {scanSuccessPulse || flashSuccess
                    ? '১০০% সঠিক SKU ম্যাচ'
                    : lastDetectedRawCode
                    ? `সর্বশেষ স্ক্যান: ${lastDetectedRawCode}`
                    : 'হাতে লেখা ও প্রিন্ট করা A-Z / AA-GZ সক্রিয়'}
                </div>
              </div>
            )}

            {/* Clean Camera Permission / Fallback State */}
            {cameraError && (
              <div
                style={{
                  position: 'absolute',
                  inset: '12px',
                  background:
                    'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.98))',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.16)',
                    border: '1px solid rgba(248, 113, 113, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fca5a5',
                    flexShrink: 0,
                  }}
                >
                  <Camera size={19} />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: '#fecdd3',
                    lineHeight: 1.45,
                    fontWeight: 600,
                    maxWidth: '420px',
                  }}
                >
                  {cameraError}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    width: '100%',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => startCameraStream(facingMode)}
                    style={{
                      background: '#0d9488',
                      color: '#ffffff',
                      border: '1px solid #14b8a6',
                      borderRadius: '9px',
                      height: '34px',
                      minHeight: '34px',
                      padding: '0 12px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>আবার ক্যামেরা চালু করুন</span>
                  </button>
                  <label
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: '1px solid #3b82f6',
                      borderRadius: '9px',
                      height: '34px',
                      minHeight: '34px',
                      padding: '0 12px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      margin: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>📸 SKU ছবি তুলে সেল করুন</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFilePhotoCapture}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* COMPACT 'সফল স্ক্যান' VERIFICATION ANIMATION WITH GREEN BORDER FLASH */}
            {flashSuccess && (
              <div
                key={`verify-card-${scanPulseKey}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(2, 44, 34, 0.55)',
                  backdropFilter: 'blur(3px)',
                  WebkitBackdropFilter: 'blur(3px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                  zIndex: 7,
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="cam-success-verify-card"
                  style={{
                    background:
                      'linear-gradient(145deg, rgba(6, 78, 59, 0.96), rgba(5, 150, 105, 0.95))',
                    border: '2.5px solid #4ade80',
                    boxShadow:
                      '0 0 0 4px rgba(34, 197, 94, 0.35), 0 0 32px rgba(34, 197, 94, 0.85), 0 12px 28px rgba(0, 0, 0, 0.5)',
                    borderRadius: '18px',
                    padding: '12px 18px',
                    maxWidth: '340px',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: '4px',
                  }}
                >
                  {/* Animated Checkmark with Green Ripple Ring */}
                  <div
                    style={{
                      position: 'relative',
                      width: '40px',
                      height: '40px',
                      borderRadius: '999px',
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      border: '2px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 18px rgba(74, 222, 128, 0.8)',
                      marginBottom: '2px',
                    }}
                  >
                    <span className="cam-success-check-ripple" />
                    <CheckCircle2 size={24} color="#ffffff" />
                  </div>

                  {/* 'সফল স্ক্যান' Verification Pill with SKU Code */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(22, 163, 74, 0.45)',
                      border: '1px solid #86efac',
                      borderRadius: '999px',
                      padding: '2px 10px',
                      fontSize: '11px',
                      fontWeight: 900,
                      color: '#dcfce7',
                      letterSpacing: '0.2px',
                    }}
                  >
                    <span>✨ সফল স্ক্যান • SKU: {flashSuccess.skuCode}</span>
                  </div>

                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 900,
                      color: '#ffffff',
                      lineHeight: 1.25,
                      marginTop: '2px',
                    }}
                  >
                    {flashSuccess.productName} ({toBengaliNumerals(flashSuccess.quantity)}{' '}
                    {flashSuccess.unit})
                  </div>

                  <div
                    style={{
                      marginTop: '3px',
                      background: 'rgba(2, 44, 34, 0.55)',
                      border: '1px solid rgba(134, 239, 172, 0.45)',
                      padding: '3px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#ecfdf5',
                    }}
                  >
                    বিক্রি: {money(flashSuccess.totalAmount)} | লাভ: +{money(flashSuccess.profit)}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* 4. DEDICATED PRIMARY ACTION BAR + INSTANT SKU CODE INPUT */}
          <div
            style={{
              padding: '10px 14px',
              background: '#131c31',
              borderTop: '1px solid #1e293b',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            {!isDrawingFeature && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    cooldownUntilRef.current = 0;
                    if (cameraReady) {
                      captureAndRecognizeFrame(true);
                    } else {
                      startCameraStream(facingMode);
                    }
                  }}
                  disabled={isScanning || isPostingSale}
                  style={{
                    flex: 1,
                    height: '38px',
                    minHeight: '38px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    borderRadius: '10px',
                    padding: '0 12px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Sparkles size={15} />
                  <span>
                    {isScanning
                      ? 'SKU কোড মেলানো হচ্ছে...'
                      : cameraReady
                      ? '⚡ এখনই SKU স্ক্যান ও সেল'
                      : '⚡ ক্যামেরা চালু ও স্ক্যান করুন'}
                  </span>
                </button>

                <label
                  title="ফোনের মূল ক্যামেরায় SKU কোডের ছবি তুলে সাথে সাথে সেল করুন"
                  style={{
                    height: '38px',
                    minHeight: '38px',
                    background: '#1e293b',
                    color: '#f1f5f9',
                    border: '1.5px solid #475569',
                    borderRadius: '10px',
                    padding: '0 12px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <span>📸 ছবি তুলুন</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFilePhotoCapture}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}

            {/* Direct Instant SKU Code Entry / Dropdown Selector (Large & Prominent) */}
            {(() => {
              const typedClean = toStrictAllowedSkuClient(manualSkuInput.trim().toUpperCase());
              const livePreviewHit = typedClean
                ? matchProductBySkuClient(typedClean, products)
                : null;
              return (
                <div
                  style={{
                    background: "linear-gradient(145deg, #0f172a 0%, #1e293b 100%)",
                    border: livePreviewHit
                      ? "2px solid #10b981"
                      : "1.5px solid rgba(45, 212, 191, 0.45)",
                    borderRadius: "16px",
                    padding: "12px 13px",
                    boxShadow: livePreviewHit
                      ? "0 0 22px rgba(16, 185, 129, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)"
                      : "0 8px 22px rgba(2, 6, 23, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "9px",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 900,
                        color: "#5eead4",
                      }}
                    >
                      <Tag size={14} color="#2dd4bf" />
                      <span>সরাসরি প্রডাক্টের SKU কোড লিখুন (A–Z / AA–GZ)</span>
                    </div>

                    {livePreviewHit ? (
                      <span
                        style={{
                          background: "rgba(16, 185, 129, 0.2)",
                          border: "1px solid #34d399",
                          color: "#6ee7b7",
                          padding: "2px 9px",
                          borderRadius: "999px",
                          fontSize: "11.5px",
                          fontWeight: 900,
                        }}
                      >
                        ✅ {livePreviewHit.matchedSku}: {livePreviewHit.product.name} ({money(Number(livePreviewHit.product.sellingPrice) || 0)})
                      </span>
                    ) : manualSkuInput.trim() ? (
                      <span
                        style={{
                          background: "rgba(239, 68, 68, 0.18)",
                          border: "1px solid rgba(248, 113, 113, 0.5)",
                          color: "#fca5a5",
                          padding: "2px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                        }}
                      >
                        ❌ এই কোডে প্রডাক্ট নেই
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#94a3b8",
                        }}
                      >
                        যেমন: A, B, D, AB, GZ
                      </span>
                    )}
                  </div>

                  <form
                    onSubmit={handleManualSkuSubmit}
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      gap: "9px",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: "13px",
                          pointerEvents: "none",
                          fontSize: "17px",
                          lineHeight: 1,
                        }}
                      >
                        🏷️
                      </span>
                      <input
                        type="text"
                        list="allowed-sku-codes-datalist"
                        value={manualSkuInput}
                        onChange={(e) => setManualSkuInput(e.target.value.toUpperCase())}
                        placeholder="SKU কোড লিখুন (A–Z, AA–GZ)..."
                        autoComplete="off"
                        style={{
                          width: "100%",
                          height: "52px",
                          minHeight: "52px",
                          padding: "0 36px 0 40px",
                          borderRadius: "13px",
                          border: livePreviewHit
                            ? "2px solid #10b981"
                            : "2px solid #0d9488",
                          background: "#020617",
                          color: "#ffffff",
                          fontSize: manualSkuInput ? "18px" : "14.5px",
                          fontWeight: 900,
                          letterSpacing: manualSkuInput ? "1.5px" : "0.2px",
                          outline: "none",
                          boxShadow:
                            "inset 0 2px 8px rgba(0, 0, 0, 0.55), 0 0 0 3px rgba(13, 148, 136, 0.15)",
                          boxSizing: "border-box",
                        }}
                      />
                      {manualSkuInput && (
                        <button
                          type="button"
                          onClick={() => setManualSkuInput("")}
                          title="মুছে ফেলুন"
                          style={{
                            position: "absolute",
                            right: "9px",
                            width: "26px",
                            height: "26px",
                            minHeight: "26px",
                            borderRadius: "50%",
                            border: "1px solid #475569",
                            background: "#1e293b",
                            color: "#cbd5e1",
                            padding: 0,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={!manualSkuInput.trim() || isPostingSale}
                      style={{
                        height: "52px",
                        minHeight: "52px",
                        padding: "0 20px",
                        borderRadius: "13px",
                        background: manualSkuInput.trim()
                          ? "linear-gradient(135deg, #10b981 0%, #0d9488 100%)"
                          : "#1e293b",
                        color: "#ffffff",
                        border: manualSkuInput.trim()
                          ? "1.5px solid #34d399"
                          : "1.5px solid #334155",
                        fontSize: "15px",
                        fontWeight: 900,
                        cursor: manualSkuInput.trim() ? "pointer" : "not-allowed",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: manualSkuInput.trim()
                          ? "0 6px 18px rgba(16, 185, 129, 0.38)"
                          : "none",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Zap size={16} />
                      <span>SKU সেল</span>
                    </button>
                  </form>
                </div>
              );
            })()}
          </div>

          {/* 5. STATUS BAR (+ AUTO-SCAN LOOP ONLY FOR CAMERA FEATURE) */}
          <div
            style={{
              padding: '8px 14px',
              background: '#0f172a',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#5eead4',
                lineHeight: 1.35,
                flex: 1,
                minWidth: 0,
              }}
            >
              {scanStatusText}
            </span>
            {!isDrawingFeature && (
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#e2e8f0',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  padding: '4px 9px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={continuousAutoScan}
                  onChange={(e) => setContinuousAutoScan(e.target.checked)}
                  style={{
                    width: '14px',
                    height: '14px',
                    margin: 0,
                    accentColor: '#10b981',
                  }}
                />
                <span>অটো-স্ক্যান লুপ</span>
              </label>
            )}
          </div>

          {/* 6. PENDING PRODUCT CONFIRMATION CARD (When in Confirm Mode) */}
          {pendingProduct && (
            <div
              style={{
                margin: '10px 14px 4px',
                padding: '12px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #064e3b, #0f172a)',
                border: '1.5px solid #10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {pendingProduct.product.imageUrl ? (
                  <img
                    src={pendingProduct.product.imageUrl}
                    alt={pendingProduct.product.name}
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '10px',
                      objectFit: 'cover',
                      border: '1.5px solid #34d399',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '10px',
                      background: '#065f46',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Package size={22} color="#6ee7b7" />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '14px',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>{pendingProduct.product.name}</span>
                    <span
                      style={{
                        fontSize: '11px',
                        background: 'rgba(16, 185, 129, 0.25)',
                        border: '1px solid #34d399',
                        padding: '1px 7px',
                        borderRadius: '999px',
                        color: '#d1fae5',
                      }}
                    >
                      SKU: {pendingProduct.skuCode}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#a7f3d0', marginTop: '2px' }}>
                    পরিমাণ: {toBengaliNumerals(pendingProduct.quantity)}{' '}
                    {pendingProduct.product.unit || 'পিস'} ×{' '}
                    {money(pendingProduct.product.sellingPrice)} ={' '}
                    <b>{money(pendingProduct.quantity * pendingProduct.product.sellingPrice)}</b>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() =>
                    triggerSaleForProduct(
                      pendingProduct.product,
                      pendingProduct.quantity,
                      pendingProduct.matchMethod,
                      pendingProduct.skuCode
                    )
                  }
                  disabled={isPostingSale}
                  style={{
                    flex: 1,
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '9px',
                    height: '36px',
                    minHeight: '36px',
                    padding: '0 14px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ✅ বিক্রি নিশ্চিত করুন
                </button>
                <button
                  type="button"
                  onClick={() => setPendingProduct(null)}
                  style={{
                    background: '#334155',
                    color: '#e2e8f0',
                    border: 'none',
                    borderRadius: '9px',
                    height: '36px',
                    minHeight: '36px',
                    padding: '0 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  বাতিল
                </button>
              </div>
            </div>
          )}

          {/* 7. STOCK PRODUCTS WITH SKU CODES (A-Z / AA-GZ), INLINE SKU SELECTOR & 1-TAP SALE */}
          <div
            style={{
              padding: '12px 14px',
              background: '#1e293b',
              borderBottom: '1px solid #334155',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '9px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#f1f5f9',
                  minWidth: 0,
                  flex: 1,
                  lineHeight: 1.3,
                }}
              >
                🏷️ প্রডাক্টের সক্রিয় SKU কোড (✏️ চাপ দিয়ে A–Z / AA–GZ সেট করুন):
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '2px 9px',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                মোট {toBengaliNumerals(products.length)}টি পণ্য
              </span>
            </div>

            {products.length === 0 ? (
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  padding: '12px',
                  background: '#0f172a',
                  borderRadius: '10px',
                  textAlign: 'center',
                }}
              >
                স্টকে কোনো পণ্য নেই। আগে স্টক/পণ্য ট্যাবে প্রডাক্ট ও SKU কোড যোগ করুন।
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  paddingBottom: '4px',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {products.map((p, idx) => {
                  const inStock = Number(p.currentStock) > 0;
                  const skuCode = getEffectiveProductSku(p, idx);
                  const isEditingThis = editingSkuProductId === p.id;
                  return (
                    <div
                      key={p.id}
                      style={{
                        flexShrink: 0,
                        width: '172px',
                        background: '#0f172a',
                        border: `1.5px solid ${inStock ? '#0d9488' : '#475569'}`,
                        borderRadius: '12px',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '6px',
                        color: '#f8fafc',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      {/* Top Row: SKU Badge + Edit SKU Selector (A-Z / AA-GZ) */}
                      {isEditingThis ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <select
                            value={
                              ALLOWED_SKU_SET.has(editingSkuValue.trim().toUpperCase())
                                ? editingSkuValue.trim().toUpperCase()
                                : skuCode
                            }
                            onChange={(e) => setEditingSkuValue(e.target.value)}
                            style={{
                              width: '100%',
                              height: '26px',
                              minHeight: '26px',
                              padding: '0 4px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              color: '#fef08a',
                              background: '#1e293b',
                              border: '1px solid #facc15',
                              borderRadius: '6px',
                              outline: 'none',
                            }}
                          >
                            {ALLOWED_SKU_CODES.map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={savingSkuId === p.id}
                            onClick={() => handleSaveInlineSku(p)}
                            title="SKU সংরক্ষণ করুন"
                            style={{
                              background: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              width: '26px',
                              height: '26px',
                              minHeight: '26px',
                              padding: 0,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSkuProductId(null)}
                            style={{
                              background: '#334155',
                              color: '#cbd5e1',
                              border: 'none',
                              borderRadius: '6px',
                              width: '24px',
                              height: '26px',
                              minHeight: '26px',
                              padding: 0,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '4px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 900,
                              color: '#fef08a',
                              background: 'rgba(234, 179, 8, 0.18)',
                              border: '1px solid rgba(250, 204, 21, 0.4)',
                              padding: '1px 7px',
                              borderRadius: '6px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '115px',
                            }}
                            title={`SKU: ${skuCode}`}
                          >
                            🏷️ কোড: {skuCode}
                          </span>
                          {onUpdateProductSku && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSkuProductId(p.id);
                                const candidate = toStrictAllowedSkuClient(lastDetectedRawCode);
                                setEditingSkuValue(candidate || skuCode);
                              }}
                              title="প্রডাক্টের গায়ের SKU কোড (A-Z / AA-GZ) পরিবর্তন বা সেট করুন"
                              style={{
                                background: 'rgba(56, 189, 248, 0.16)',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                borderRadius: '6px',
                                height: '22px',
                                minHeight: '22px',
                                padding: '0 5px',
                                fontSize: '10px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                flexShrink: 0,
                              }}
                            >
                              <Edit3 size={10} />
                              <span>SKU</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Clickable Product Body for 1-Tap Sale */}
                      <button
                        type="button"
                        disabled={isPostingSale}
                        onClick={() =>
                          triggerSaleForProduct(
                            p,
                            Math.max(0.1, Number(defaultQty) || 1),
                            'quick_tap',
                            skuCode
                          )
                        }
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                          color: 'inherit',
                          width: '100%',
                        }}
                      >
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '8px',
                              objectFit: 'cover',
                              flexShrink: 0,
                              border: '1px solid rgba(255,255,255,0.12)',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '8px',
                              background: '#1e293b',
                              border: '1px solid #334155',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Package size={16} color="#2dd4bf" />
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: '12px',
                              fontWeight: 800,
                              color: '#ffffff',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              lineHeight: 1.25,
                            }}
                          >
                            {p.name}
                          </div>
                          <div
                            style={{
                              fontSize: '10.5px',
                              color: inStock ? '#94a3b8' : '#f87171',
                              marginTop: '1px',
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>
                              স্টক: {toBengaliNumerals(p.currentStock)} {p.unit}
                            </span>
                            <b style={{ color: '#34d399' }}>{money(p.sellingPrice)}</b>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 8. LIVE SESSION SALE LOG WITH INSTANT UNDO */}
          <div
            style={{
              padding: '12px 14px 14px',
              background: '#0f172a',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '8px',
                fontSize: '12px',
                fontWeight: 800,
                color: '#e2e8f0',
              }}
            >
              <span>
                📋 এই সেশনে {isDrawingFeature ? 'ড্রইং প্যাড' : 'ক্যামেরা SKU'} সেল (
                {toBengaliNumerals(saleLogs.length)}টি):
              </span>
              {saleLogs.length > 0 && (
                <span
                  style={{
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  মোট: {money(totalSessionSales)} (লাভ: +{money(totalSessionProfit)})
                </span>
              )}
            </div>

            {saleLogs.length === 0 ? (
              <div
                style={{
                  fontSize: '11.5px',
                  color: '#94a3b8',
                  textAlign: 'center',
                  padding: '12px',
                  border: '1px dashed #334155',
                  borderRadius: '10px',
                  background: 'rgba(30, 41, 59, 0.4)',
                }}
              >
                {isDrawingFeature
                  ? 'এখনো কোনো ড্রইং সেল হয়নি। উপরের সাদা প্যাডে আঙুল বা মাউস দিয়ে A–Z অথবা AA–GZ লিখুন।'
                  : 'এখনো কোনো প্রডাক্ট স্ক্যান করা হয়নি। প্রডাক্টের গায়ের SKU কোড (A-Z / AA-GZ) ক্যামেরার সামনে ধরুন।'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '6px' }}>
                {saleLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <b style={{ color: '#f8fafc' }}>{log.product.name}</b>{' '}
                          {log.skuCode && (
                            <span
                              style={{
                                fontSize: '10.5px',
                                color: '#fde047',
                                background: 'rgba(234, 179, 8, 0.16)',
                                padding: '1px 5px',
                                borderRadius: '5px',
                                marginRight: '4px',
                              }}
                            >
                              {log.skuCode}
                            </span>
                          )}
                          —{' '}
                          <span style={{ color: '#cbd5e1' }}>
                            {toBengaliNumerals(log.quantity)} {log.product.unit}
                          </span>{' '}
                          <span style={{ color: '#34d399', fontWeight: 800 }}>
                            ({money(log.totalAmount)})
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <small style={{ color: '#94a3b8', fontSize: '10.5px' }}>
                            সময়: {log.timestamp}
                          </small>
                          {log.seller && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                color: log.seller === 'Rakib' ? '#38bdf8' : '#c084fc',
                                background: log.seller === 'Rakib' ? 'rgba(2, 132, 199, 0.2)' : 'rgba(124, 58, 237, 0.2)',
                                border: `1px solid ${log.seller === 'Rakib' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(192, 132, 252, 0.4)'}`,
                                padding: '1px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              👤 {log.seller === 'Rakib' ? 'রাকিব' : 'লিমন'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {log.entryId && onUndoSale && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!log.entryId) return;
                          playScannerSound('undo');
                          await onUndoSale(log.entryId, log.product, log.quantity);
                          setSaleLogs((prev) => prev.filter((item) => item.id !== log.id));
                          setScanStatusText(
                            `↩️ "${log.product.name}"-এর সেলটি বাতিল (Undo) করা হয়েছে`
                          );
                        }}
                        style={{
                          background: '#450a0a',
                          color: '#fca5a5',
                          border: '1px solid #dc2626',
                          borderRadius: '7px',
                          height: '30px',
                          minHeight: '30px',
                          padding: '0 9px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <RotateCcw size={12} /> বাতিল
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
