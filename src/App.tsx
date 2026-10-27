import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  Bell,
  Boxes,
  Calculator,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Image as ImageIcon,
  Info,
  Key,
  Lock,
  LogOut,
  Menu,
  Mic,
  Package,
  PenTool,
  Percent,
  PieChart,
  PlayCircle,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User as UserIcon,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';

import { auth, db, firebaseConfigured, googleProvider, testConnection } from './firebase';
import {
  addEntry,
  addInvestor,
  addProduct,
  addProfitDistribution,
  deleteDemoData,
  getDemoDataPreview,
  removeDraftEntry,
  removeEntry,
  removeInvestor,
  removeProduct,
  updateProduct,
  removeProfitDistribution,
  bulkRemoveDraftEntries,
  seedDemoDataset,
  syncUserProfile,
  updateEntry,
  voidPostedEntry,
  watchAuditLogs,
  watchDistributions,
  watchEntries,
  watchInvestors,
  watchProducts,
  resetAllWebsiteData,
  getAdminAuthData,
  updateAdminPasswordInDb,
  updateAdminAvatarInDb,
  ensureAdminInvestors,
  watchApprovalRequests,
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  deepClean,
  getCachedEntries,
  getCachedInvestors,
  getCachedProducts,
  getCachedDistributions,
  getCachedAuditLogs,
  getLocalApprovalRequests,
  type DemoCleanupPreview,
} from './data';
import AdminProfile from './components/AdminProfile';
import TermsConditionsCard from './components/TermsConditionsCard';
import PWAInstallButton from './components/PWAInstallButton';
import SalesTrendChartSection from './components/SalesTrendChartSection';
import EmailNotificationSection from './components/EmailNotificationSection';
import BrandWelcomePopup from './components/BrandWelcomePopup';
import ProductProfitabilityModal from './components/ProductProfitabilityModal';
import BusinessCalculatorModal, {
  loadPersistedCalcState,
  type PersistedCalcState,
} from './components/BusinessCalculatorModal';
import VoiceFormAssistant from './components/VoiceFormAssistant';
import CameraAutoSaleModal, {
  ALLOWED_SKU_CODES,
  ALLOWED_SKU_SET,
  toStrictAllowedSkuClient,
} from './components/CameraAutoSaleModal';
import ScannerSoundSettingsCard from './components/ScannerSoundSettingsCard';
import {
  money,
  moneyBn,
  shares,
  summary,
  dateLabel,
  csvEscape,
  distributeProfit,
  toBengaliNumerals,
  calculateCashBalance,
  calculatePartnerAccountBalances,
  calculateDailyBreakdowns,
  calculateTotalPurchaseCost,
  formatBengaliDateTime,
  type PartnerAccountBalance,
  type DailyFinancialBreakdown,
  getEntrySeller,
  calculateSellerSalesSummary,
  calculateDailySellerSales,
  type SellerSalesSummary,
  type DailySellerSale,
} from './accounting';
import { generateBengaliPdf, generateMonthlyBengaliPdf, formatMonthLabelBn } from './pdfReport';
import { runAutomatedTests } from './accounting.test';
import type { Entry, Investor, Product, ProfitDistribution, AuditLog, RecordType, Role, BusinessSettings, EntryStatus, ApprovalRequest } from './types';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

const getNDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
};

const getStartOfMonth = () => {
  const d = new Date();
  const ym = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }).slice(0, 7);
  return `${ym}-01`;
};

const typeLabels: Record<RecordType, string> = {
  sale: 'বিক্রয়',
  purchase: 'মাল ক্রয় (স্টক)',
  expense: 'অতিরিক্ত / পরিচালন খরচ',
  investment: 'মূলধন বিনিয়োগ',
  withdrawal: 'পার্টনার উত্তোলন',
  loan: 'পার্টনার লোন',
  other: 'অন্যান্য লেনদেন',
};

const filterPills: { key: RecordType; label: string }[] = [
  { key: 'sale', label: 'বিক্রয়' },
  { key: 'purchase', label: 'মাল ক্রয়' },
  { key: 'expense', label: 'অতিরিক্ত খরচ' },
  { key: 'investment', label: 'মূলধন বিনিয়োগ' },
  { key: 'withdrawal', label: 'উত্তোলন' },
  { key: 'loan', label: 'পার্টনার লোন' },
  { key: 'other', label: 'অন্যান্য' },
];

type DashDetailCategory =
  | 'sales'
  | 'net_profit'
  | 'purchases'
  | 'expenses'
  | 'balance'
  | 'investments'
  | 'withdrawals';

function resolveEntryPartnerName(e: Entry, investors: Investor[]): string {
  if (e.investorId) {
    const found = investors.find(
      (i) => i.id === e.investorId || i.id.toLowerCase() === e.investorId?.toLowerCase()
    );
    if (found) return found.name;
    const lowId = e.investorId.toLowerCase();
    if (lowId.includes('rakib')) return 'রাকিব (Rakib)';
    if (lowId.includes('limon')) return 'লিমন (Limon)';
  }
  const combined = `${e.title || ''} ${e.notes || ''}`.toLowerCase();
  if (combined.includes('rakib') || combined.includes('রাকিব')) return 'রাকিব (Rakib)';
  if (combined.includes('limon') || combined.includes('লিমন')) return 'লিমন (Limon)';
  for (const inv of investors) {
    if (inv.name && combined.includes(inv.name.toLowerCase())) return inv.name;
  }
  return 'সাধারণ / উল্লেখ নেই';
}

const blankSettings: BusinessSettings = {
  name: 'Glowzaa Shop',
  type: 'খুচরা ও পাইকারি ব্যবসা',
  address: 'ঢাকা, বাংলাদেশ',
  phone: '০১৭১১-০০০০০০',
  currencySymbol: '৳',
  superAdminEmail: 'glowzaabd.shop@gmail.com',
  showBrandPopup: true,
  brandPopupText: 'Glowzaa এটা ব্রান্ড',
  showCalculator: true,
  enableVoiceInput: true,
  enableCameraScan: true,
  enableDrawingPad: true,
};

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>('admin');

  // Dedicated 2-Admin Authentication State (Rakib & Limon only)
  const [currentAdmin, setCurrentAdmin] = useState<{
    username: 'Rakib' | 'Limon';
    displayName: string;
    role: 'admin';
  } | null>(() => {
    const saved = localStorage.getItem('glowzaa_current_admin');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  // Render UI immediately (0ms delay) instead of blocking on async Firebase auth check
  const [authReady, setAuthReady] = useState<boolean>(true);

  const [adminUsernameInput, setAdminUsernameInput] = useState<string>('Rakib');
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('G120');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminPasswords, setAdminPasswords] = useState<{ rakib: string; limon: string }>({
    rakib: 'G120',
    limon: 'G120',
  });
  const [adminAvatars, setAdminAvatars] = useState<{ rakib: string; limon: string }>(() => {
    try {
      const cached = localStorage.getItem('glowzaa_admin_auth');
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          rakib: parsed.rakibAvatar || '',
          limon: parsed.limonAvatar || '',
        };
      }
    } catch {}
    return { rakib: '', limon: '' };
  });

  // Core Data Collections — Pre-hydrated synchronously from localStorage cache for 0ms instant load
  const [entries, setEntries] = useState<Entry[]>(() => getCachedEntries());
  const [investors, setInvestors] = useState<Investor[]>(() => getCachedInvestors());
  const [products, setProducts] = useState<Product[]>(() => getCachedProducts());
  const [distributions, setDistributions] = useState<ProfitDistribution[]>(() => getCachedDistributions());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => getCachedAuditLogs());
  const [settings, setSettings] = useState<BusinessSettings>(() => {
    try {
      const cached = localStorage.getItem('glowzaa_business_settings');
      if (cached) {
        return { ...blankSettings, ...JSON.parse(cached) };
      }
    } catch {}
    return blankSettings;
  });

  // Website Entry Brand Popup Animation ("Glowzaa এটা ব্রান্ড") State
  const [showBrandWelcome, setShowBrandWelcome] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('glowzaa_business_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.showBrandPopup === false) return false;
      }
    } catch {}
    return true;
  });

  // UI state
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<
    'dashboard' | 'transactions' | 'seller_sales' | 'investors' | 'inventory' | 'profit' | 'reports' | 'audit' | 'settings' | 'profile' | 'terms'
  >('dashboard');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [sellerFilter, setSellerFilter] = useState<'all' | 'Rakib' | 'Limon'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState<string>('সংরক্ষণ করা হচ্ছে…');
  const [busyTone, setBusyTone] = useState<'default' | 'danger'>('default');
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState<string>(() => today().slice(0, 7));
  const [isMonthlyPdfLoading, setIsMonthlyPdfLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Dashboard Daily & Historical Filter states
  const [dashPreset, setDashPreset] = useState<
    'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'single_day' | 'custom_range'
  >('all');
  const [dashSingleDate, setDashSingleDate] = useState<string>(today());
  const [dashStartDate, setDashStartDate] = useState<string>(getNDaysAgo(6));
  const [dashEndDate, setDashEndDate] = useState<string>(today());
  const [dashTypeFilter, setDashTypeFilter] = useState<'all' | RecordType>('all');
  const [dashDaySearch, setDashDaySearch] = useState<string>('');

  // Modals
  const [dashDetailModal, setDashDetailModal] = useState<DashDetailCategory | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [showInvestorModal, setShowInvestorModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showProfitabilityModal, setShowProfitabilityModal] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [showCameraSaleModal, setShowCameraSaleModal] = useState(false);
  const [showDrawingSaleModal, setShowDrawingSaleModal] = useState(false);
  const [calcState, setCalcState] = useState<PersistedCalcState>(() => loadPersistedCalcState());
  const [showProfitModal, setShowProfitModal] = useState(false);
  const [viewRecordModal, setViewRecordModal] = useState<Entry | null>(null);
  const [viewPartnerModal, setViewPartnerModal] = useState<PartnerAccountBalance | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<Entry | null>(null);
  const [showVoidModal, setShowVoidModal] = useState<Entry | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState('');
  const [showInvestorDeleteModal, setShowInvestorDeleteModal] = useState<Investor | null>(null);
  const [showProductDeleteModal, setShowProductDeleteModal] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showDistributionDeleteModal, setShowDistributionDeleteModal] = useState<ProfitDistribution | null>(null);
  const [showResetDataModal, setShowResetDataModal] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [demoPreview, setDemoPreview] = useState<DemoCleanupPreview | null>(null);
  const [testResults, setTestResults] = useState<{ passed: boolean; message: string; timestamp: string } | null>(null);

  // Dual-Admin Approval & Notification Modal states
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(() => getLocalApprovalRequests());
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notifTab, setNotifTab] = useState<'pending_for_me' | 'my_sent' | 'recent_activity'>('pending_for_me');
  const [notifRejectingId, setNotifRejectingId] = useState<string | null>(null);
  const [notifRejectReason, setNotifRejectReason] = useState('');
  const [entryReason, setEntryReason] = useState('');
  const [productReason, setProductReason] = useState('');
  const [deleteReasonInput, setDeleteReasonInput] = useState('');
  const [investorReason, setInvestorReason] = useState('');

  // Entry Form state
  const [entryForm, setEntryForm] = useState({
    type: 'sale' as RecordType,
    seller: 'Rakib' as 'Rakib' | 'Limon' | undefined,
    title: '',
    amount: '',
    profit: '', // বিক্রয়ে অর্জিত লাভ (৳)
    cost: '', // পণ্যের ক্রয় খরচ (৳)
    date: today(),
    status: 'posted' as EntryStatus,
    investorId: '',
    productId: '',
    quantity: '',
    unitPrice: '',
    unitCost: '',
    category: '',
    notes: '',
  });

  // Investor Form
  const [investorName, setInvestorName] = useState('');
  const [investorPhone, setInvestorPhone] = useState('');
  const [investorEmail, setInvestorEmail] = useState('');

  // Product Form (Single Upload)
  const [productUploadMode, setProductUploadMode] = useState<'single' | 'batch_avg'>('single');
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    unit: 'পিস',
    currentStock: '',
    averageCost: '',
    sellingPrice: '',
    imageUrl: '',
  });

  // Batch (5-6 Products) Average Cost & Selling Price Upload State
  const createDefaultBatchRows = (count = 5) =>
    Array.from({ length: count }, (_, idx) => ({
      id: `row-${Date.now()}-${idx}`,
      name: '',
      sku: '',
      unit: 'কেজি',
      currentStock: '',
      averageCost: '',
      sellingPrice: '',
      imageUrl: '',
    }));

  const [batchProductsForm, setBatchProductsForm] = useState<
    {
      id: string;
      name: string;
      sku: string;
      unit: string;
      currentStock: string;
      averageCost: string;
      sellingPrice: string;
      imageUrl: string;
    }[]
  >(() => createDefaultBatchRows(5));
  const [useCalculatedAvgForAll, setUseCalculatedAvgForAll] = useState<boolean>(true);
  const [quickTotalLotCost, setQuickTotalLotCost] = useState<string>('');
  const [quickTotalLotSell, setQuickTotalLotSell] = useState<string>('');
  const [quickDirectAvgCost, setQuickDirectAvgCost] = useState<string>('');
  const [quickDirectAvgSell, setQuickDirectAvgSell] = useState<string>('');

  // AI Smart Product Upload Assistant State
  const [aiProductPrompt, setAiProductPrompt] = useState<string>('');
  const [isAiParsingProduct, setIsAiParsingProduct] = useState<boolean>(false);
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [productVoiceSec, setProductVoiceSec] = useState<number>(0);
  const [aiSummaryNote, setAiSummaryNote] = useState<string>('');
  const productMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const productMediaStreamRef = useRef<MediaStream | null>(null);
  const productAudioChunksRef = useRef<Blob[]>([]);
  const productVoiceTimerRef = useRef<any>(null);
  const productRecognitionRef = useRef<any>(null);
  const productLiveTranscriptRef = useRef<string>('');

  // Profit Distribution Form
  const [distributionForm, setDistributionForm] = useState({
    periodName: `মুনাফা বণ্টন (${new Date().toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })})`,
    date: today(),
    distributableAmount: '',
    status: 'posted' as EntryStatus,
  });

  // Waste / Damaged Goods state (নষ্ট বা ক্ষতিগ্রস্থ পণ্য)
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteForm, setWasteForm] = useState({
    productId: '',
    quantity: '',
    reason: 'মেয়াদোত্তীর্ণ (Expired)',
    lossAmount: '',
    date: today(),
    notes: '',
  });

  // 1. Initial Auth Setup & Connection Test (Non-blocking so UI renders in 0ms)
  useEffect(() => {
    testConnection();
    getAdminAuthData().then((authData) => {
      setAdminPasswords({ rakib: authData.rakib, limon: authData.limon });
      setAdminAvatars({
        rakib: authData.rakibAvatar || '',
        limon: authData.limonAvatar || '',
      });
    });

    if (db) {
      getDoc(doc(db, 'businessSettings', 'main'))
        .then((s) => {
          if (s.exists()) {
            const merged = { ...blankSettings, ...(s.data() as BusinessSettings) };
            setSettings(merged);
            if (merged.showBrandPopup === false) {
              setShowBrandWelcome(false);
            }
            try {
              localStorage.setItem(
                'glowzaa_business_settings',
                JSON.stringify({
                  name: merged.name || blankSettings.name,
                  type: merged.type || '',
                  address: merged.address || '',
                  phone: merged.phone || '',
                  currencySymbol: merged.currencySymbol || '৳',
                  superAdminEmail: merged.superAdminEmail || blankSettings.superAdminEmail,
                  showBrandPopup: merged.showBrandPopup !== false,
                  brandPopupText: merged.brandPopupText || 'Glowzaa এটা ব্রান্ড',
                  showCalculator: merged.showCalculator !== false,
                  enableVoiceInput: merged.enableVoiceInput !== false,
                  enableCameraScan: merged.enableCameraScan !== false,
                  enableDrawingPad: merged.enableDrawingPad !== false,
                })
              );
            } catch {}
          }
        })
        .catch(() => {});
    }

    if (!auth) {
      setAuthReady(true);
      return;
    }

    if (currentAdmin && !auth.currentUser) {
      signInAnonymously(auth).catch(() => {});
    }

    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        syncUserProfile(u.uid, u.email || '', u.displayName || undefined)
          .then((profile) => {
            setRole(profile.role);
            ensureAdminInvestors(u.uid);
          })
          .catch(() => {
            setRole('admin');
          });
      } else if (currentAdmin) {
        setRole('admin');
        ensureAdminInvestors(currentAdmin.username);
      } else {
        setRole(null);
      }
    });
  }, [currentAdmin]);

  // 2. Real-time Firestore Listeners (Subscribed once per authenticated session, never torn down when anonymous auth resolves)
  const hasActiveSession = Boolean(currentAdmin || user);
  useEffect(() => {
    if (!hasActiveSession || !db) return;

    const unsubEntries = watchEntries(setEntries, (e) => console.warn('Entries sync warning:', e));
    const unsubInvestors = watchInvestors(setInvestors, (e) => console.warn('Investors sync warning:', e));
    const unsubProducts = watchProducts(setProducts, (e) => console.warn('Products sync warning:', e));
    const unsubDist = watchDistributions(setDistributions, (e) => console.warn('Distributions sync warning:', e));
    const unsubAudit = watchAuditLogs(setAuditLogs, (e) => console.warn('Audit logs sync warning:', e));
    const unsubApprovals = watchApprovalRequests(setApprovalRequests, (e) => console.warn('Approvals sync warning:', e));

    getDoc(doc(db, 'businessSettings', 'main'))
      .then((s) => {
        if (s.exists()) {
          const merged = { ...blankSettings, ...(s.data() as BusinessSettings) };
          setSettings(merged);
          if (merged.showBrandPopup === false) {
            setShowBrandWelcome(false);
          }
          try {
            localStorage.setItem('glowzaa_business_settings', JSON.stringify({
              name: merged.name || blankSettings.name,
              type: merged.type || '',
              address: merged.address || '',
              phone: merged.phone || '',
              currencySymbol: merged.currencySymbol || '৳',
              superAdminEmail: merged.superAdminEmail || blankSettings.superAdminEmail,
              showBrandPopup: merged.showBrandPopup !== false,
              brandPopupText: merged.brandPopupText || 'Glowzaa এটা ব্রান্ড',
              showCalculator: merged.showCalculator !== false,
              enableVoiceInput: merged.enableVoiceInput !== false,
              enableCameraScan: merged.enableCameraScan !== false,
              enableDrawingPad: merged.enableDrawingPad !== false,
            }));
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      unsubEntries();
      unsubInvestors();
      unsubProducts();
      unsubDist();
      unsubAudit();
      unsubApprovals();
    };
  }, [hasActiveSession]);

  const admin = Boolean(currentAdmin) || role === 'admin' || user?.email === 'glowzaabd.shop@gmail.com' || Boolean(user);

  // Accounting Computations & New Feature Summaries
  const stats = useMemo(() => summary(entries, products), [entries, products]);
  const cashSummary = useMemo(() => calculateCashBalance(entries, products), [entries, products]);
  const partnerAccounts = useMemo(() => calculatePartnerAccountBalances(investors, entries, products), [investors, entries, products]);

  // Dedicated Monthly Report Computations
  const monthlyReportEntries = useMemo(
    () => entries.filter((e) => e.date && e.date.startsWith(reportMonth)),
    [entries, reportMonth]
  );
  const monthlyReportStats = useMemo(
    () => summary(monthlyReportEntries, products),
    [monthlyReportEntries, products]
  );
  const availableReportMonths = useMemo(() => {
    const curMonth = today().slice(0, 7);
    const dPrev = new Date();
    dPrev.setMonth(dPrev.getMonth() - 1);
    const prevMonth = dPrev.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }).slice(0, 7);
    const monthSet = new Set<string>([curMonth, prevMonth]);
    for (const e of entries) {
      if (e.date && e.date.length >= 7) {
        monthSet.add(e.date.slice(0, 7));
      }
    }
    return [...monthSet].sort((a, b) => b.localeCompare(a)).slice(0, 6);
  }, [entries]);

  // Day-by-Day Financial Breakdown (Today + All Past Days)
  const todayStr = today();
  const yesterdayStr = getNDaysAgo(1);

  const dailyBreakdowns = useMemo(
    () => calculateDailyBreakdowns(entries, products, todayStr, yesterdayStr),
    [entries, products, todayStr, yesterdayStr]
  );

  const todayBreakdown = useMemo(
    () =>
      dailyBreakdowns.find((d) => d.isToday) || {
        date: todayStr,
        isToday: true,
        isYesterday: false,
        sales: 0,
        salesCount: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        purchases: 0,
        investments: 0,
        withdrawals: 0,
        netProfit: 0,
        totalEntriesCount: 0,
        entries: [],
      },
    [dailyBreakdowns, todayStr]
  );

  const filteredDailyBreakdowns = useMemo(() => {
    if (!dashDaySearch.trim()) return dailyBreakdowns;
    const q = dashDaySearch.trim().toLowerCase();
    return dailyBreakdowns.filter(
      (d) => d.date.includes(q) || dateLabel(d.date).toLowerCase().includes(q)
    );
  }, [dailyBreakdowns, dashDaySearch]);

  // Dashboard Period Filtered Entries & Stats
  const dashPeriodEntries = useMemo(() => {
    return entries.filter((e) => {
      if (dashPreset === 'today') return e.date === todayStr;
      if (dashPreset === 'yesterday') return e.date === yesterdayStr;
      if (dashPreset === '7d') return e.date >= getNDaysAgo(6) && e.date <= todayStr;
      if (dashPreset === '30d') return e.date >= getNDaysAgo(29) && e.date <= todayStr;
      if (dashPreset === 'month') return e.date >= getStartOfMonth() && e.date <= todayStr;
      if (dashPreset === 'single_day') return e.date === dashSingleDate;
      if (dashPreset === 'custom_range') {
        return (!dashStartDate || e.date >= dashStartDate) && (!dashEndDate || e.date <= dashEndDate);
      }
      return true;
    });
  }, [entries, dashPreset, todayStr, yesterdayStr, dashSingleDate, dashStartDate, dashEndDate]);

  const dashPeriodStats = useMemo(
    () => summary(dashPeriodEntries, products),
    [dashPeriodEntries, products]
  );

  const dashPeriodCash = useMemo(
    () => calculateCashBalance(dashPeriodEntries, products),
    [dashPeriodEntries, products]
  );

  // Total purchase cost (combines sold items' purchase cost COGS + any separate stock purchase entries without double counting same product)
  const periodTotalPurchase = useMemo(
    () => calculateTotalPurchaseCost(dashPeriodEntries, products),
    [dashPeriodEntries, products]
  );

  const dashPeriodSellerSummary = useMemo(
    () => calculateSellerSalesSummary(dashPeriodEntries, todayStr),
    [dashPeriodEntries, todayStr]
  );

  // Seller Sales Daily Tab states & memos
  const [expandedDailyDate, setExpandedDailyDate] = useState<string | null>(today());
  const [dailySellerDateFilter, setDailySellerDateFilter] = useState<string>('');
  const [dailySellerPreset, setDailySellerPreset] = useState<'all' | 'today' | 'yesterday' | '7d' | 'month' | '30d'>('all');
  const [sellerDailyViewMode, setSellerDailyViewMode] = useState<'all' | 'Rakib' | 'Limon'>('all');

  const dailySellerSales = useMemo(
    () => calculateDailySellerSales(entries, todayStr, yesterdayStr),
    [entries, todayStr, yesterdayStr]
  );

  const todaySellerSummary = useMemo(
    () => calculateSellerSalesSummary(entries.filter((e) => e.date === todayStr), todayStr),
    [entries, todayStr]
  );

  const allTimeSellerSummary = useMemo(
    () => calculateSellerSalesSummary(entries, todayStr),
    [entries, todayStr]
  );

  const filteredDailySellerSales = useMemo(() => {
    return dailySellerSales.filter((d) => {
      if (dailySellerPreset === 'today') return d.isToday;
      if (dailySellerPreset === 'yesterday') return d.isYesterday;
      if (dailySellerPreset === '7d') return d.date >= getNDaysAgo(6) && d.date <= todayStr;
      if (dailySellerPreset === 'month') return d.date >= getStartOfMonth() && d.date <= todayStr;
      if (dailySellerPreset === '30d') return d.date >= getNDaysAgo(29) && d.date <= todayStr;
      if (dailySellerDateFilter) return d.date.includes(dailySellerDateFilter);
      return true;
    });
  }, [dailySellerSales, dailySellerPreset, dailySellerDateFilter, todayStr, yesterdayStr]);

  const txSellerSummary = useMemo(
    () => calculateSellerSalesSummary(entries.filter((e) => {
      const matchesDate = (!startDateFilter || e.date >= startDateFilter) && (!endDateFilter || e.date <= endDateFilter);
      return matchesDate;
    }), todayStr),
    [entries, startDateFilter, endDateFilter, todayStr]
  );

  const overallTotalPurchase = useMemo(
    () => calculateTotalPurchaseCost(entries, products),
    [entries, products]
  );

  const todayTotalPurchase = useMemo(
    () => calculateTotalPurchaseCost(todayBreakdown.entries, products),
    [todayBreakdown.entries, products]
  );

  const dashDisplayEntries = useMemo(() => {
    if (dashTypeFilter === 'all') return dashPeriodEntries;
    return dashPeriodEntries.filter((e) => e.type === dashTypeFilter);
  }, [dashPeriodEntries, dashTypeFilter]);

  const dashPeriodLabel = useMemo(() => {
    if (dashPreset === 'today') return `আজকের হিসাব (${dateLabel(todayStr)})`;
    if (dashPreset === 'yesterday') return `গতকালের হিসাব (${dateLabel(yesterdayStr)})`;
    if (dashPreset === '7d') return `গত ৭ দিনের হিসাব (${dateLabel(getNDaysAgo(6))} – আজ)`;
    if (dashPreset === '30d') return `গত ৩০ দিনের হিসাব (${dateLabel(getNDaysAgo(29))} – আজ)`;
    if (dashPreset === 'month') return `চলতি মাসের হিসাব (${dateLabel(getStartOfMonth())} – আজ)`;
    if (dashPreset === 'single_day') return `নির্দিষ্ট দিনের হিসাব (${dateLabel(dashSingleDate)})`;
    if (dashPreset === 'custom_range') {
      return `কাস্টম তারিখ (${dashStartDate ? dateLabel(dashStartDate) : 'শুরু'} – ${dashEndDate ? dateLabel(dashEndDate) : 'আজ'})`;
    }
    return 'সর্বমোট হিসাব (শুরু থেকে আজ পর্যন্ত সকল দিন)';
  }, [dashPreset, todayStr, yesterdayStr, dashSingleDate, dashStartDate, dashEndDate]);

  const otherPartner = useMemo(() => {
    if (!currentAdmin) return { username: 'Limon' as const, displayName: 'লিমন (Limon)' };
    return currentAdmin.username === 'Rakib'
      ? { username: 'Limon' as const, displayName: 'লিমন (Limon)' }
      : { username: 'Rakib' as const, displayName: 'রাকিব (Rakib)' };
  }, [currentAdmin]);

  // Asymmetric approval rule: Rakib does NOT need Limon's permission; Limon DOES need Rakib's permission
  const needsPartnerApproval = currentAdmin?.username === 'Limon';

  const pendingForMeCount = useMemo(() => {
    if (!currentAdmin) return 0;
    const myUname = currentAdmin.username.toLowerCase();
    return approvalRequests.filter(
      (r) =>
        r.status === 'pending' &&
        (r.targetApprover?.toLowerCase() === myUname ||
          (r.requestedBy?.toLowerCase() !== myUname && (!r.targetApprover || r.targetApprover.trim() === '')))
    ).length;
  }, [approvalRequests, currentAdmin]);

  // Filtered transactions with date range & search
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchesSearch = [e.title, typeLabels[e.type], e.category, e.notes, e.id]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesType = typeFilter === 'all' || e.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;

      const matchesDate =
        (!startDateFilter || e.date >= startDateFilter) &&
        (!endDateFilter || e.date <= endDateFilter);
      const matchesSeller =
        sellerFilter === 'all' ||
        (e.type === 'sale' && getEntrySeller(e) === sellerFilter);

      return matchesSearch && matchesType && matchesStatus && matchesDate && matchesSeller;
    });
  }, [entries, search, typeFilter, statusFilter, startDateFilter, endDateFilter, sellerFilter]);

  // Handlers
  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const rawUser = adminUsernameInput.trim();
      const isRakib = rawUser.toLowerCase() === 'rakib';
      const isLimon = rawUser.toLowerCase() === 'limon';

      if (!isRakib && !isLimon) {
        throw new Error('অ্যাক্সেস অস্বীকৃত! এই ওয়েবসাইটে শুধুমাত্র অনুমোদিত ২ জন অ্যাডমিন (Rakib ও Limon) প্রবেশ করতে পারবেন।');
      }

      const canonicalName: 'Rakib' | 'Limon' = isRakib ? 'Rakib' : 'Limon';
      const adminKey = isRakib ? 'rakib' : 'limon';

      // Fetch fresh passwords & avatars
      const fresh = await getAdminAuthData();
      setAdminPasswords({ rakib: fresh.rakib, limon: fresh.limon });
      setAdminAvatars({
        rakib: fresh.rakibAvatar || '',
        limon: fresh.limonAvatar || '',
      });
      const expectedPassword = fresh[adminKey];

      if (adminPasswordInput !== expectedPassword) {
        throw new Error('ভুল পাসওয়ার্ড! সঠিক পাসওয়ার্ড দিন। (প্রাথমিক পাসওয়ার্ড: G120)');
      }

      if (auth && !auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn('Anonymous signin error:', e);
        }
      }

      const adminProfile = {
        username: canonicalName,
        displayName: canonicalName === 'Rakib' ? 'রাকিব (Rakib)' : 'লিমন (Limon)',
        role: 'admin' as const,
      };

      setCurrentAdmin(adminProfile);
      localStorage.setItem('glowzaa_current_admin', JSON.stringify(adminProfile));

      ensureAdminInvestors(auth?.currentUser?.uid || canonicalName);

      setMessage(`স্বাগতম ${adminProfile.displayName}! অ্যাডমিন পোর্টালে সফলভাবে প্রবেশ করেছেন।`);
    } catch (err: any) {
      setError(err?.message || 'লগইন ব্যর্থ হয়েছে।');
    } finally {
      setBusy(false);
    }
  }

  function handleAdminLogout() {
    setCurrentAdmin(null);
    localStorage.removeItem('glowzaa_current_admin');
    if (auth) {
      signOut(auth).catch(() => {});
    }
    setMessage('সফলভাবে লগআউট সম্পন্ন হয়েছে।');
  }

  // Handlers
  async function handleGoogleLogin() {
    if (!auth) return;
    setError('');
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err?.message || 'Google লগইন সম্পন্ন করা যায়নি');
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err?.message || 'লগইন ব্যর্থ হয়েছে। ইমেইল এবং পাসওয়ার্ড যাচাই করুন।');
    } finally {
      setBusy(false);
    }
  }

  function handleOpenEdit(entry: Entry) {
    if (!admin) return;
    setEditingEntry(entry);
    const initialProfit = entry.grossProfit !== undefined ? String(entry.grossProfit) : (entry.cogsAmount !== undefined ? String(Math.max(0, entry.amount - entry.cogsAmount)) : '');
    const initialCost = entry.cogsAmount !== undefined ? String(entry.cogsAmount) : (entry.grossProfit !== undefined ? String(Math.max(0, entry.amount - entry.grossProfit)) : '');
    setEntryForm({
      type: entry.type,
      seller: (getEntrySeller(entry) === 'Limon' ? 'Limon' : 'Rakib') as 'Rakib' | 'Limon',
      title: entry.title,
      amount: String(entry.amount),
      profit: initialProfit,
      cost: initialCost,
      date: entry.date,
      status: entry.status,
      investorId: entry.investorId || '',
      productId: entry.productId || '',
      quantity: entry.quantity ? String(entry.quantity) : '',
      unitPrice: entry.unitPrice ? String(entry.unitPrice) : '',
      unitCost: entry.unitCost ? String(entry.unitCost) : '',
      category: entry.category || '',
      notes: entry.notes || '',
    });
    setShowEntryModal(true);
  }

  function handleEntryProductChange(prodId: string) {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) {
      setEntryForm((prev) => ({
        ...prev,
        productId: '',
        unitCost: '',
        unitPrice: '',
      }));
      return;
    }

    const uCost = prod.averageCost > 0 ? String(prod.averageCost) : '';
    const uPrice = prod.sellingPrice > 0 ? String(prod.sellingPrice) : '';
    const qtyNum = Number(entryForm.quantity) || 0;
    const currentAmount = Number(entryForm.amount) || 0;

    let newCost = entryForm.cost;
    let newProfit = entryForm.profit;
    let newAmount = entryForm.amount;

    // ONLY calculate cost from product averageCost if quantity is explicitly entered!
    if (qtyNum > 0 && prod.averageCost > 0) {
      newCost = String(Math.round(qtyNum * prod.averageCost * 100) / 100);
      if (currentAmount > 0) {
        newProfit = String(Math.round((currentAmount - Number(newCost)) * 100) / 100);
      } else if (prod.sellingPrice > 0) {
        newAmount = String(Math.round(qtyNum * prod.sellingPrice * 100) / 100);
        newProfit = String(Math.round((Number(newAmount) - Number(newCost)) * 100) / 100);
      }
    }

    setEntryForm((prev) => ({
      ...prev,
      productId: prodId,
      unitCost: uCost,
      unitPrice: uPrice,
      cost: newCost,
      profit: newProfit,
      amount: newAmount,
    }));
  }

  function handleEntryQuantityChange(val: string) {
    const qty = Number(val) || 0;
    const uCost = Number(entryForm.unitCost) || 0;
    const uPrice = Number(entryForm.unitPrice) || 0;
    let newAmount = entryForm.amount;
    let newCost = entryForm.cost;
    let newProfit = entryForm.profit;

    if (entryForm.type === 'sale') {
      if (qty > 0) {
        if (uCost > 0) {
          newCost = String(Math.round(qty * uCost * 100) / 100);
        }
        if (uPrice > 0) {
          newAmount = String(Math.round(qty * uPrice * 100) / 100);
        }
        const effectiveAmt = Number(newAmount) || 0;
        if (effectiveAmt > 0 && newCost !== '') {
          newProfit = String(Math.round((effectiveAmt - Number(newCost)) * 100) / 100);
        }
      } else if (val === '') {
        if (uCost > 0) newCost = '';
        if (uPrice > 0) newAmount = '';
        newProfit = '';
      }
    } else if (entryForm.type === 'purchase') {
      if (qty > 0 && uCost > 0) {
        newAmount = String(Math.round(qty * uCost * 100) / 100);
      } else if (val === '' && uCost > 0) {
        newAmount = '';
      }
    }

    setEntryForm((prev) => ({
      ...prev,
      quantity: val,
      amount: newAmount,
      cost: newCost,
      profit: newProfit,
    }));
  }

  function handleEntryUnitPriceChange(val: string) {
    const uPrice = Number(val) || 0;
    const qty = Number(entryForm.quantity) || 0;
    let newAmount = entryForm.amount;
    let newProfit = entryForm.profit;

    if (qty > 0 && uPrice > 0) {
      newAmount = String(Math.round(qty * uPrice * 100) / 100);
      if (entryForm.cost !== '') {
        newProfit = String(Math.round((Number(newAmount) - Number(entryForm.cost)) * 100) / 100);
      }
    }

    setEntryForm((prev) => ({
      ...prev,
      unitPrice: val,
      amount: newAmount,
      profit: newProfit,
    }));
  }

  function handleEntryUnitCostChange(val: string) {
    const uCost = Number(val) || 0;
    const qty = Number(entryForm.quantity) || 0;
    let newCost = entryForm.cost;
    let newProfit = entryForm.profit;
    let newAmount = entryForm.amount;

    if (entryForm.type === 'sale') {
      if (qty > 0 && uCost > 0) {
        newCost = String(Math.round(qty * uCost * 100) / 100);
        const amtNum = Number(entryForm.amount) || 0;
        if (amtNum > 0) {
          newProfit = String(Math.round((amtNum - Number(newCost)) * 100) / 100);
        }
      }
    } else if (entryForm.type === 'purchase') {
      if (qty > 0 && uCost > 0) {
        newAmount = String(Math.round(qty * uCost * 100) / 100);
      }
    }

    setEntryForm((prev) => ({
      ...prev,
      unitCost: val,
      cost: newCost,
      profit: newProfit,
      amount: newAmount,
    }));
  }

  function handleEntryAmountChange(val: string) {
    const amtNum = Number(val) || 0;
    const qty = Number(entryForm.quantity) || 0;
    let newUnitPrice = entryForm.unitPrice;
    let newProfit = entryForm.profit;
    let newCost = entryForm.cost;

    if (qty > 0 && amtNum > 0) {
      newUnitPrice = String(Math.round((amtNum / qty) * 100) / 100);
    }

    if (entryForm.type === 'sale' && amtNum > 0) {
      if (entryForm.cost !== '' && !isNaN(Number(entryForm.cost))) {
        newProfit = String(Math.round((amtNum - Number(entryForm.cost)) * 100) / 100);
      } else if (entryForm.profit !== '' && !isNaN(Number(entryForm.profit))) {
        newCost = String(Math.round((amtNum - Number(entryForm.profit)) * 100) / 100);
      }
    }

    setEntryForm((prev) => ({
      ...prev,
      amount: val,
      unitPrice: newUnitPrice,
      cost: newCost,
      profit: newProfit,
    }));
  }

  function handleEntryCostChange(val: string) {
    const costNum = Number(val) || 0;
    const amtNum = Number(entryForm.amount) || 0;
    const qty = Number(entryForm.quantity) || 0;
    let newUnitCost = entryForm.unitCost;
    let newProfit = entryForm.profit;

    if (qty > 0 && costNum > 0) {
      newUnitCost = String(Math.round((costNum / qty) * 100) / 100);
    }

    if (amtNum > 0 && val !== '') {
      newProfit = String(Math.round((amtNum - costNum) * 100) / 100);
    }

    setEntryForm((prev) => ({
      ...prev,
      cost: val,
      unitCost: newUnitCost,
      profit: newProfit,
    }));
  }

  function handleEntryProfitChange(val: string) {
    const profNum = Number(val) || 0;
    const amtNum = Number(entryForm.amount) || 0;
    const qty = Number(entryForm.quantity) || 0;
    let newCost = entryForm.cost;
    let newUnitCost = entryForm.unitCost;

    if (amtNum > 0 && val !== '') {
      newCost = String(Math.round((amtNum - profNum) * 100) / 100);
      if (qty > 0 && Number(newCost) > 0) {
        newUnitCost = String(Math.round((Number(newCost) / qty) * 100) / 100);
      }
    }

    setEntryForm((prev) => ({
      ...prev,
      profit: val,
      cost: newCost,
      unitCost: newUnitCost,
    }));
  }

  async function handleSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAdmin && !user) return;
    setError('');
    setBusyTone('default');
    setBusyText(editingEntry ? 'হিসাব আপডেট করা হচ্ছে…' : 'নতুন হিসাব সংরক্ষণ করা হচ্ছে…');
    setBusy(true);

    try {
      await new Promise((r) => setTimeout(r, 380));
      const amount = Number(entryForm.amount);
      if (!entryForm.title.trim() || !Number.isFinite(amount) || amount <= 0) {
        throw new Error('দয়া করে সঠিক বিবরণ এবং ০ এর অধিক টাকার পরিমাণ দিন।');
      }

      // STRICT RULE: Capital/investment cannot be withdrawn; only earned profit (withdrawableLimit) can be withdrawn
      if ((entryForm.type === 'withdrawal' || entryForm.type === 'loan') && entryForm.investorId) {
        const pAcc = partnerAccounts.find((p) => p.id === entryForm.investorId);
        if (pAcc) {
          // If editing an existing posted withdrawal/loan for this partner, add back its current amount to the allowed limit
          const existingDeduction =
            editingEntry &&
            editingEntry.status === 'posted' &&
            (editingEntry.type === 'withdrawal' || editingEntry.type === 'loan') &&
            editingEntry.investorId === entryForm.investorId
              ? Number(editingEntry.amount) || 0
              : 0;
          const maxAllowed = Math.round((pAcc.withdrawableLimit + existingDeduction) * 100) / 100;

          if (entryForm.type === 'withdrawal' && amount > maxAllowed) {
            throw new Error(
              `উত্তোলন ব্যর্থ: মূলধন বা বিনিয়োগ (${money(pAcc.capital)}) উত্তোলন করা যাবে না—শুধুমাত্র অর্জিত লাভ উত্তোলন করা যাবে। ${pAcc.name}-এর বর্তমান উত্তোলনযোগ্য লাভের সীমা ${money(maxAllowed)}।`
            );
          }
        }
      }

      const qty = entryForm.quantity ? Number(entryForm.quantity) : undefined;
      const unitP = entryForm.unitPrice ? Number(entryForm.unitPrice) : undefined;
      const unitC = entryForm.unitCost ? Number(entryForm.unitCost) : undefined;

      let cogsAmount: number | undefined;
      let grossProfit: number | undefined;

      if (entryForm.type === 'sale') {
        const pVal = entryForm.profit.trim() !== '' ? Number(entryForm.profit) : undefined;
        const cVal = entryForm.cost.trim() !== '' ? Number(entryForm.cost) : undefined;

        if (pVal !== undefined && Number.isFinite(pVal)) {
          grossProfit = Math.round(pVal * 100) / 100;
          cogsAmount = Math.max(0, Math.round((amount - grossProfit) * 100) / 100);
        } else if (cVal !== undefined && Number.isFinite(cVal)) {
          cogsAmount = Math.round(cVal * 100) / 100;
          grossProfit = Math.round((amount - cogsAmount) * 100) / 100;
        } else if (entryForm.productId && qty) {
          const prod = products.find((p) => p.id === entryForm.productId);
          if (prod && prod.averageCost > 0) {
            cogsAmount = Math.round(qty * prod.averageCost * 100) / 100;
            grossProfit = Math.round((amount - cogsAmount) * 100) / 100;
          }
        } else {
          // If no explicit profit or cost is entered, profit defaults to full amount
          grossProfit = amount;
          cogsAmount = 0;
        }
      }

      const entryPayload = {
        type: entryForm.type,
        seller: (entryForm.type === 'sale' ? (currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib') : undefined) as 'Rakib' | 'Limon' | undefined,
        title: entryForm.title.trim(),
        amount,
        date: entryForm.date || today(),
        status: entryForm.status,
        investorId: entryForm.investorId || undefined,
        productId: entryForm.productId || undefined,
        quantity: qty,
        unitPrice: unitP,
        unitCost: unitC,
        cogsAmount,
        grossProfit,
        profit: grossProfit,
        category: entryForm.category.trim() || undefined,
        notes: entryForm.notes.trim() || undefined,
        demo: false,
      };

      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';
        const actLabel = typeLabels[entryForm.type] || entryForm.type;

        await createApprovalRequest({
          actionType: editingEntry ? 'edit_entry' : 'create_entry',
          targetCollection: 'entries',
          targetId: editingEntry?.id,
          title: editingEntry
            ? `লেনদেন এডিট: ${entryForm.title} (${money(amount)})`
            : `নতুন ${actLabel}: ${entryForm.title} (${money(amount)})`,
          description: `ধরন: ${actLabel}, টাকার পরিমাণ: ${money(amount)}, তারিখ: ${dateLabel(entryForm.date || today())}${entryForm.notes ? `, নোট: ${entryForm.notes}` : ''}`,
          reason: entryReason.trim() || (editingEntry ? 'লেনদেনের তথ্য সংশোধন' : `ব্যবসার প্রয়োজনে নতুন ${actLabel} এন্ট্রি`),
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: entryPayload,
          previousData: editingEntry || null,
        });

        setMessage(`অনুরোধ সফলভাবে তৈরি হয়েছে! এটি কার্যকর হতে ${targetApproverName}-এর অনুমোদন প্রয়োজন।`);
        setEditingEntry(null);
        setEntryReason('');
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        const actorEmail = currentAdmin
          ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
          : user?.email || undefined;

        if (editingEntry) {
          await updateEntry(editingEntry.id, entryPayload, actorUid, actorEmail);
          setMessage('রেকর্ড সফলভাবে আপডেট করা হয়েছে');
          setEditingEntry(null);
        } else {
          await addEntry(entryPayload, actorUid, actorEmail, currentAdmin?.displayName);
          setMessage(entryForm.status === 'draft' ? 'ড্রাফট হিসেবে সংরক্ষণ করা হয়েছে' : 'লেনদেন সফলভাবে পোস্টেড করা হয়েছে');
        }
        setEntryReason('');
      }

      setEntryForm({
        type: 'sale',
        seller: (currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib') as 'Rakib' | 'Limon',
        title: '',
        amount: '',
        profit: '',
        cost: '',
        date: today(),
        status: 'posted',
        investorId: '',
        productId: '',
        quantity: '',
        unitPrice: '',
        unitCost: '',
        category: '',
        notes: '',
      });
      setShowEntryModal(false);
    } catch (err: any) {
      setError(err?.message || 'সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveInvestor(e: React.FormEvent) {
    e.preventDefault();
    if (!admin) return;
    setError('');
    setBusyTone('default');
    setBusyText('অংশীদারের তথ্য সংরক্ষণ করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      if (!investorName.trim()) throw new Error('ইনভেস্টরের নাম আবশ্যক');
      const payload = {
        name: investorName.trim(),
        phone: investorPhone.trim() || undefined,
        email: investorEmail.trim() || undefined,
        active: true,
      };

      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'create_investor',
          targetCollection: 'investors',
          title: `নতুন অংশীদার যুক্ত: ${payload.name}`,
          description: `অংশীদারের নাম: ${payload.name}, ফোন: ${payload.phone || 'নেই'}, ইমেইল: ${payload.email || 'নেই'}`,
          reason: investorReason.trim() || 'নতুন অংশীদার অন্তর্ভুক্তির অনুরোধ',
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload,
        });

        setMessage(`অংশীদার যুক্ত করার অনুরোধ তৈরি হয়েছে! ${targetApproverName}-এর অনুমোদনের পর তা কার্যকর হবে।`);
        setInvestorReason('');
      } else {
        await addInvestor(payload);
        setMessage('অংশীদার সফলভাবে যোগ করা হয়েছে');
        setInvestorReason('');
      }
      setInvestorName('');
      setInvestorPhone('');
      setInvestorEmail('');
      setShowInvestorModal(false);
    } catch (err: any) {
      setError(err?.message || 'যোগ করা যায়নি');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!admin) return;
    setError('');
    setBusyTone('default');
    setBusyText(editingProduct ? 'পণ্যের তথ্য আপডেট হচ্ছে…' : 'নতুন পণ্য সংরক্ষণ করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      if (!productForm.name.trim()) throw new Error('পণ্যের নাম আবশ্যক');
      const strictSku =
        toStrictAllowedSkuClient(productForm.sku) ||
        ALLOWED_SKU_CODES[products.length % ALLOWED_SKU_CODES.length] ||
        'A';
      const payload = {
        name: productForm.name.trim(),
        sku: strictSku,
        unit: productForm.unit.trim() || 'পিস',
        currentStock: Number(productForm.currentStock) || 0,
        averageCost: Number(productForm.averageCost) || 0,
        sellingPrice: Number(productForm.sellingPrice) || 0,
        imageUrl: productForm.imageUrl.trim() || undefined,
      };

      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: editingProduct ? 'edit_product' : 'create_product',
          targetCollection: 'products',
          targetId: editingProduct?.id,
          title: editingProduct
            ? `পণ্য ও স্টক সংশোধন: ${payload.name}`
            : `নতুন পণ্য অন্তর্ভুক্তি: ${payload.name} (স্টক: ${payload.currentStock} ${payload.unit})`,
          description: `স্টক: ${payload.currentStock} ${payload.unit}, কেনা দাম: ${money(payload.averageCost)}, বিক্রয় দাম: ${money(payload.sellingPrice)}`,
          reason: productReason.trim() || (editingProduct ? 'পণ্যের দাম বা স্টক আপডেট' : 'নতুন পণ্য যুক্ত করার অনুরোধ'),
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload,
          previousData: editingProduct || null,
        });

        setMessage(`পণ্য সংরক্ষণের অনুরোধ তৈরি হয়েছে! ${targetApproverName} অনুমোদন দিলে তা ইনভেন্টরিতে যুক্ত হবে।`);
        setProductReason('');
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        const actorEmail = currentAdmin
          ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
          : user?.email || undefined;

        if (editingProduct) {
          await updateProduct(editingProduct.id, payload, actorUid, actorEmail);
          setMessage(`পণ্য "${payload.name}" সফলভাবে আপডেট করা হয়েছে`);
        } else {
          await addProduct(payload);
          setMessage('ইনভেন্টরি পণ্য সফলভাবে যোগ করা হয়েছে');
        }
        setProductReason('');
      }
      setProductForm({ name: '', sku: '', unit: 'পিস', currentStock: '', averageCost: '', sellingPrice: '', imageUrl: '' });
      setEditingProduct(null);
      setShowProductModal(false);
    } catch (err: any) {
      setError(err?.message || 'পণ্য সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  // Live Average Cost & Selling Price Summary across the 5-6 Batch Products
  const batchAverageSummary = useMemo(() => {
    const validNamedRows = batchProductsForm.filter((r) => r.name.trim().length > 0);
    const rowsForCalc = validNamedRows.length > 0 ? validNamedRows : batchProductsForm;

    const costValues = rowsForCalc
      .map((r) => Number(r.averageCost))
      .filter((v) => Number.isFinite(v) && v > 0);
    const sellValues = rowsForCalc
      .map((r) => Number(r.sellingPrice))
      .filter((v) => Number.isFinite(v) && v > 0);

    const totalCostSum = costValues.reduce((acc, v) => acc + v, 0);
    const totalSellSum = sellValues.reduce((acc, v) => acc + v, 0);

    const avgCost = costValues.length > 0 ? Math.round((totalCostSum / costValues.length) * 100) / 100 : 0;
    const avgSellingPrice = sellValues.length > 0 ? Math.round((totalSellSum / sellValues.length) * 100) / 100 : 0;
    const totalStock = validNamedRows.reduce((acc, r) => acc + (Number(r.currentStock) || 0), 0);
    const avgProfitPerUnit = Math.round((avgSellingPrice - avgCost) * 100) / 100;

    return {
      totalRows: batchProductsForm.length,
      validCount: validNamedRows.length,
      costEnteredCount: costValues.length,
      sellEnteredCount: sellValues.length,
      totalCostSum: Math.round(totalCostSum * 100) / 100,
      totalSellSum: Math.round(totalSellSum * 100) / 100,
      avgCost,
      avgSellingPrice,
      avgProfitPerUnit,
      totalStock,
    };
  }, [batchProductsForm]);

  function autoSuggestFromProductName(rawName: string) {
    const n = rawName.toLowerCase().trim();
    if (!n) return {};
    // First check existing inventory products for matching history
    const matchedExisting = products.find(
      (p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())
    );
    const nextSkuCode = ALLOWED_SKU_CODES[products.length % ALLOWED_SKU_CODES.length] || 'A';
    if (matchedExisting) {
      return {
        sku: toStrictAllowedSkuClient(matchedExisting.sku || '') || nextSkuCode,
        unit: matchedExisting.unit || 'কেজি',
        averageCost: matchedExisting.averageCost ? String(matchedExisting.averageCost) : '',
        sellingPrice: matchedExisting.sellingPrice ? String(matchedExisting.sellingPrice) : '',
        imageUrl: matchedExisting.imageUrl || '',
      };
    }

    if (n.includes('কাকড়া') || n.includes('কাঁকড়া') || n.includes('crab')) {
      return {
        sku: nextSkuCode,
        unit: 'কেজি',
        imageUrl: 'https://images.unsplash.com/photo-1548811579-017cf2a4268b?w=300&auto=format&fit=crop&q=80',
      };
    }
    if (n.includes('চিংড়ি') || n.includes('গলদা') || n.includes('বাগদা') || n.includes('shrimp')) {
      return {
        sku: nextSkuCode,
        unit: 'কেজি',
        imageUrl: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=300&auto=format&fit=crop&q=80',
      };
    }
    if (n.includes('ইলিশ') || n.includes('রুই') || n.includes('কাতলা') || n.includes('মাছ') || n.includes('কোরাল') || n.includes('রূপচাঁদা')) {
      return {
        sku: nextSkuCode,
        unit: 'কেজি',
        imageUrl: 'https://images.unsplash.com/photo-1534043464124-3be32fe00099?w=300&auto=format&fit=crop&q=80',
      };
    }
    if (n.includes('মাংস') || n.includes('মুরগি') || n.includes('গরু') || n.includes('খাসি')) {
      return {
        sku: nextSkuCode,
        unit: 'কেজি',
        imageUrl: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=300&auto=format&fit=crop&q=80',
      };
    }
    if (n.includes('ডিম')) {
      return {
        sku: nextSkuCode,
        unit: 'পিস',
        imageUrl: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=300&auto=format&fit=crop&q=80',
      };
    }
    return {};
  }

  async function handleAiParseProduct(overridePrompt?: string, overrideImage?: string, overrideAudio?: string) {
    const promptToUse = (overridePrompt !== undefined ? overridePrompt : aiProductPrompt).trim();
    const imgToUse = overrideImage !== undefined ? overrideImage : productForm.imageUrl;
    const audioToUse = overrideAudio || '';

    if (!promptToUse && !imgToUse && !audioToUse) {
      setError('অনুগ্রহ করে ১ লাইনে পণ্যের তথ্য লিখুন, মাইকে বলুন অথবা পণ্যের/রসিদের ছবি দিন।');
      return;
    }

    setError('');
    setIsAiParsingProduct(true);
    setAiSummaryNote(audioToUse ? '🎙️ আপনার ভয়েস বিশ্লেষণ করে পণ্যের ঘরগুলো পূরণ করা হচ্ছে...' : '');
    try {
      const response = await fetch('/api/ai/parse-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToUse,
          imageDataUrl: imgToUse && imgToUse.startsWith('data:image/') ? imgToUse : '',
          audioDataUrl: audioToUse,
          mode: editingProduct ? 'single' : productUploadMode,
          existingProducts: products.slice(0, 15),
        }),
      });

      if (!response.ok) {
        throw new Error('AI সার্ভার থেকে উত্তর পাওয়া যায়নি');
      }

      const data = await response.json();
      if (data.transcribedPrompt) {
        setAiProductPrompt(data.transcribedPrompt);
      }

      if (!editingProduct && productUploadMode === 'batch_avg' && Array.isArray(data.products) && data.products.length > 0) {
        const targetCount = Math.max(5, Math.min(6, data.products.length));
        const newRows = Array.from({ length: targetCount }, (_, idx) => {
          const item = data.products[idx];
          return {
            id: `row-${Date.now()}-${idx}`,
            name: item?.name || '',
            sku: item?.sku || '',
            unit: item?.unit || 'কেজি',
            currentStock: item?.currentStock ? String(item.currentStock) : '',
            averageCost: item?.averageCost ? String(item.averageCost) : '',
            sellingPrice: item?.sellingPrice ? String(item.sellingPrice) : '',
            imageUrl: item?.imageUrl || '',
          };
        });
        setBatchProductsForm(newRows);
        if (data.totalLotCost > 0) setQuickTotalLotCost(String(data.totalLotCost));
        if (data.totalLotSell > 0) setQuickTotalLotSell(String(data.totalLotSell));
        if (data.reason) setProductReason(data.reason);
        setAiSummaryNote(data.summaryBn || `✨ এআই এক ক্লিকে ${toBengaliNumerals(data.products.length)}টি পণ্যের তথ্য পূরণ করেছে!`);
      } else if (data.product) {
        const p = data.product;
        setProductForm((prev) => ({
          ...prev,
          name: p.name || prev.name,
          sku: p.sku || prev.sku,
          unit: p.unit || prev.unit || 'কেজি',
          currentStock: p.currentStock !== undefined && p.currentStock !== null ? String(p.currentStock) : prev.currentStock,
          averageCost: p.averageCost ? String(p.averageCost) : prev.averageCost,
          sellingPrice: p.sellingPrice ? String(p.sellingPrice) : prev.sellingPrice,
          imageUrl: prev.imageUrl && prev.imageUrl.startsWith('data:image/') ? prev.imageUrl : (p.imageUrl || prev.imageUrl),
        }));
        if (data.reason) setProductReason(data.reason);
        setAiSummaryNote(data.summaryBn || '✨ এআই পণ্যের নাম, কোড, স্টক ও ক্রয়-বিক্রয়মূল্য স্বয়ংক্রিয়ভাবে বসিয়েছে!');
      }
    } catch (err: any) {
      setError(err?.message || 'AI অটো-ফিল করতে সমস্যা হয়েছে');
    } finally {
      setIsAiParsingProduct(false);
    }
  }

  async function handleStartVoiceInput() {
    if (isVoiceListening) {
      if (productRecognitionRef.current) {
        try {
          productRecognitionRef.current.stop();
        } catch {}
      }
      if (productMediaRecorderRef.current && productMediaRecorderRef.current.state !== 'inactive') {
        try {
          productMediaRecorderRef.current.stop();
        } catch {}
      } else {
        setIsVoiceListening(false);
      }
      return;
    }

    setError('');
    productLiveTranscriptRef.current = '';

    // Start parallel live SpeechRecognition if available so transcript is captured immediately
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'bn-BD';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        let finalTranscript = '';

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const tr = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              finalTranscript += ' ' + tr;
            } else {
              interim += tr;
            }
          }
          const combined = `${finalTranscript} ${interim}`.trim();
          if (combined) {
            productLiveTranscriptRef.current = combined;
            setAiProductPrompt(combined);
          }
        };
        recognition.onerror = () => {};
        recognition.start();
        productRecognitionRef.current = recognition;
      } catch {
        // Ignore if SpeechRecognition fails while MediaRecorder is active
      }
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        productMediaStreamRef.current = stream;
        productAudioChunksRef.current = [];

        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        let selectedMime = '';
        for (const mt of mimeTypes) {
          if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mt)) {
            selectedMime = mt;
            break;
          }
        }

        const recorder = selectedMime
          ? new MediaRecorder(stream, { mimeType: selectedMime })
          : new MediaRecorder(stream);

        productMediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            productAudioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          if (productVoiceTimerRef.current) {
            clearInterval(productVoiceTimerRef.current);
            productVoiceTimerRef.current = null;
          }
          if (productRecognitionRef.current) {
            try {
              productRecognitionRef.current.stop();
            } catch {}
            productRecognitionRef.current = null;
          }
          setIsVoiceListening(false);

          if (productMediaStreamRef.current) {
            productMediaStreamRef.current.getTracks().forEach((t) => t.stop());
            productMediaStreamRef.current = null;
          }

          const chunks = productAudioChunksRef.current;
          const capturedText = (productLiveTranscriptRef.current || '').trim();
          if ((!chunks || chunks.length === 0) && !capturedText) return;

          const blob = new Blob(chunks || [], { type: recorder.mimeType || 'audio/webm' });
          if (blob.size < 300 && !capturedText) {
            setAiSummaryNote('⚠️ কথা খুব ছোট হয়েছে। অনুগ্রহ করে আবার স্পষ্টভাবে বলুন।');
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;
            if (base64Audio || capturedText) {
              handleAiParseProduct(capturedText, undefined, base64Audio);
            }
          };
          reader.readAsDataURL(blob);
        };

        recorder.start(250);
        setIsVoiceListening(true);
        setProductVoiceSec(0);
        setAiSummaryNote('🔴 ভয়েস রেকর্ড হচ্ছে... কথা বলুন (থামলে স্বয়ংক্রিয়ভাবে ঘর পূরণ হবে)');
        productVoiceTimerRef.current = setInterval(() => {
          setProductVoiceSec((prev) => {
            if (prev >= 45) {
              if (productMediaRecorderRef.current && productMediaRecorderRef.current.state !== 'inactive') {
                try {
                  productMediaRecorderRef.current.stop();
                } catch {}
              }
              return prev;
            }
            return prev + 1;
          });
        }, 1000);
        return;
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setError('মাইক্রোফোন অনুমতি দেওয়া হয়নি। ব্রাউজারে Microphone Allow করুন।');
          return;
        }
      }
    }

    if (!SpeechRecognition) {
      setError('আপনার ব্রাউজারে ভয়েস টাইপিং সাপোর্ট নেই (Chrome বা Edge ব্যবহার করুন)।');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'bn-BD';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsVoiceListening(true);
      setAiSummaryNote('🎙️ শুনছি... মুখে বলুন (যেমন: "৫০ কেজি কাকড়া কেনা ১৫০০০ টাকা বিক্রি ৪২০ টাকা")');

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        setIsVoiceListening(false);
        if (transcript) {
          setAiProductPrompt(transcript);
          handleAiParseProduct(transcript);
        }
      };

      recognition.onerror = () => {
        setIsVoiceListening(false);
        setAiSummaryNote('');
      };

      recognition.onend = () => {
        setIsVoiceListening(false);
      };

      recognition.start();
    } catch {
      setIsVoiceListening(false);
    }
  }

  async function handleSaveBatchProducts(e: React.FormEvent) {
    e.preventDefault();
    if (!admin) return;
    setError('');
    setBusyTone('default');
    setBusyText('গড় হিসাবে পণ্যগুলো আপলোড ও সংরক্ষণ হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 420));
      const filledRows = batchProductsForm.filter((r) => r.name.trim().length > 0);
      if (filledRows.length === 0) {
        throw new Error('কমপক্ষে ১টি বা ৫-৬টি পণ্যের নাম লিখুন');
      }

      const calculatedAvgCost = batchAverageSummary.avgCost;
      const calculatedAvgSell = batchAverageSummary.avgSellingPrice;

      const payloads = filledRows.map((row, rowIdx) => {
        const rowCost = Number(row.averageCost) || 0;
        const rowSell = Number(row.sellingPrice) || 0;
        const finalCost = useCalculatedAvgForAll
          ? calculatedAvgCost > 0
            ? calculatedAvgCost
            : rowCost
          : rowCost > 0
          ? rowCost
          : calculatedAvgCost;
        const finalSell = useCalculatedAvgForAll
          ? calculatedAvgSell > 0
            ? calculatedAvgSell
            : rowSell
          : rowSell > 0
          ? rowSell
          : calculatedAvgSell;

        const strictRowSku =
          toStrictAllowedSkuClient(row.sku) ||
          ALLOWED_SKU_CODES[(products.length + rowIdx) % ALLOWED_SKU_CODES.length] ||
          'A';

        return {
          name: row.name.trim(),
          sku: strictRowSku,
          unit: row.unit.trim() || 'কেজি',
          currentStock: Number(row.currentStock) || 0,
          averageCost: finalCost,
          sellingPrice: finalSell,
          imageUrl: row.imageUrl.trim() || undefined,
        };
      });

      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';
        const namesList = payloads.map((p) => p.name).join(', ');

        await createApprovalRequest({
          actionType: 'create_product',
          targetCollection: 'products',
          title: `গড় হিসাবে ${toBengaliNumerals(payloads.length)}টি পণ্য আপলোড: ${namesList}`,
          description: `পণ্য সংখ্যা: ${toBengaliNumerals(payloads.length)}টি | গড় ক্রয়মূল্য: ${money(calculatedAvgCost)} | গড় বিক্রয়মূল্য: ${money(calculatedAvgSell)}`,
          reason:
            productReason.trim() ||
            `একসাথে ${toBengaliNumerals(payloads.length)}টি পণ্য গড় ক্রয়মূল্য (${money(calculatedAvgCost)}) ও গড় বিক্রয়মূল্যে (${money(calculatedAvgSell)}) যুক্ত করার অনুরোধ`,
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: {
            batchProducts: payloads,
          },
          previousData: null,
        });

        setMessage(
          `গড় হিসাবে ${toBengaliNumerals(payloads.length)}টি পণ্যের অনুরোধ তৈরি হয়েছে! ${targetApproverName} অনুমোদন দিলে সবগুলো ইনভেন্টরিতে যুক্ত হবে।`
        );
        setProductReason('');
      } else {
        for (const item of payloads) {
          await addProduct(item);
        }
        setMessage(
          `সফলভাবে ${toBengaliNumerals(payloads.length)}টি পণ্য গড় ক্রয়মূল্য (${money(calculatedAvgCost)}) ও বিক্রয়মূল্যে (${money(calculatedAvgSell)}) ইনভেন্টরিতে যোগ করা হয়েছে!`
        );
        setProductReason('');
      }

      setBatchProductsForm(createDefaultBatchRows(5));
      setQuickTotalLotCost('');
      setQuickTotalLotSell('');
      setQuickDirectAvgCost('');
      setQuickDirectAvgSell('');
      setShowProductModal(false);
    } catch (err: any) {
      setError(err?.message || 'একাধিক পণ্য সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  function handleOpenEditProduct(p: Product) {
    setEditingProduct(p);
    setProductUploadMode('single');
    setProductForm({
      name: p.name,
      sku: p.sku || '',
      unit: p.unit || 'পিস',
      currentStock: String(p.currentStock ?? ''),
      averageCost: String(p.averageCost ?? ''),
      sellingPrice: String(p.sellingPrice ?? ''),
      imageUrl: p.imageUrl || '',
    });
    setShowProductModal(true);
  }

  async function handleSaveProfitDistribution(e: React.FormEvent) {
    e.preventDefault();
    if (!admin || (!currentAdmin && !user)) return;
    setError('');
    setBusyTone('default');
    setBusyText('মুনাফা বণ্টন হিসাব সংরক্ষণ হচ্ছে…');
    setBusy(true);

    try {
      await new Promise((r) => setTimeout(r, 380));
      const distAmount = Number(distributionForm.distributableAmount);
      if (!Number.isFinite(distAmount) || distAmount <= 0) {
        throw new Error('বণ্টনযোগ্য টাকার পরিমাণ ০ এর বেশি দিন');
      }

      // Convert partnerAccounts to ledger items format for distributeProfit
      const ledgersForDist = partnerAccounts.map((p) => ({ ...p, capital: p.capital, withdrawals: p.withdrawals, loans: p.loans, netCapital: p.netCapital, share: p.share }));
      const allocatedShares = distributeProfit(distAmount, ledgersForDist);
      const totalNet = stats.netProfit;
      const retained = Math.max(0, Math.round((totalNet - distAmount) * 100) / 100);

      const distPayload = {
        periodName: distributionForm.periodName.trim(),
        date: distributionForm.date || today(),
        totalNetProfit: totalNet,
        distributedAmount: distAmount,
        retainedAmount: retained,
        status: distributionForm.status,
        shares: allocatedShares,
      };

      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'distribute_profit',
          targetCollection: 'profitDistributions',
          title: `মুনাফা বণ্টন: ${distPayload.periodName} (${money(distAmount)})`,
          description: `মোট নিট মুনাফা: ${money(totalNet)}, বণ্টিত: ${money(distAmount)}, সংরক্ষিত: ${money(retained)}`,
          reason: 'অংশীদারদের মাঝে মুনাফা বণ্টনের অনুরোধ',
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: distPayload,
        });

        setMessage(`মুনাফা বণ্টনের অনুরোধ তৈরি হয়েছে! ${targetApproverName}-এর অনুমোদনের পর তা কার্যকর হবে।`);
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        await addProfitDistribution(distPayload, actorUid);
        setMessage('মুনাফা বণ্টন সফলভাবে সংরক্ষিত হয়েছে');
      }

      setShowProfitModal(false);
    } catch (err: any) {
      setError(err?.message || 'মুনাফা বণ্টন ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  // Handle Recording Waste / Damaged Goods (নষ্ট বা ক্ষতিগ্রস্থ পণ্য)
  async function handleSaveWaste(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAdmin) return;
    setError('');
    setBusyTone('default');
    setBusyText('নষ্ট পণ্যের হিসাব প্রসেস করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      const qty = Number(wasteForm.quantity);
      if (!wasteForm.productId) {
        throw new Error('দয়া করে নষ্ট হওয়া পণ্যটি নির্বাচন করুন');
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('দয়া করে ০ এর অধিক নষ্ট পণ্যের পরিমাণ লিখুন');
      }
      const product = products.find((p) => p.id === wasteForm.productId);
      if (!product) {
        throw new Error('নির্বাচিত পণ্য পাওয়া যায়নি');
      }
      if (qty > product.currentStock) {
        throw new Error(`বর্তমানে স্টকে ${product.currentStock} ${product.unit} পণ্য রয়েছে। এর বেশি নষ্ট রেকর্ড করা যাবে না।`);
      }

      const lossAmt = wasteForm.lossAmount !== ''
        ? Number(wasteForm.lossAmount)
        : Math.round(qty * (product.averageCost || 0) * 100) / 100;

      if (needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'record_waste',
          targetCollection: 'products',
          targetId: product.id,
          title: `নষ্ট/ক্ষতিগ্রস্থ পণ্য: ${product.name} (${qty} ${product.unit}, ক্ষতি ${money(lossAmt)})`,
          description: `পণ্যের নাম: ${product.name}, নষ্ট পরিমাণ: ${qty} ${product.unit}, আর্থিক ক্ষতি: ${money(lossAmt)}, কারণ: ${wasteForm.reason}${wasteForm.notes ? ` (নোট: ${wasteForm.notes})` : ''}`,
          reason: `নষ্ট/ভাঙা পণ্য স্টক থেকে কর্তন (${wasteForm.reason})`,
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: {
            productId: product.id,
            productName: product.name,
            unit: product.unit,
            quantity: qty,
            lossAmount: lossAmt,
            reason: wasteForm.reason,
            date: wasteForm.date || today(),
            notes: wasteForm.notes.trim() || undefined,
          },
        });

        setMessage(`নষ্ট পণ্যের অনুরোধ তৈরি হয়েছে! ${targetApproverName} অনুমোদন দিলে স্টক থেকে স্বয়ংক্রিয়ভাবে বাদ দেওয়া হবে এবং খরচে যুক্ত হবে।`);
      } else {
        const newStock = Math.max(0, (product.currentStock || 0) - qty);
        await updateProduct(
          product.id,
          { currentStock: newStock },
          currentAdmin.username,
          `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
        );
        await addEntry(
          {
            type: 'expense',
            title: `নষ্ট পণ্য ক্ষতি: ${product.name} (${qty} ${product.unit})`,
            amount: Number(lossAmt) || 0,
            date: wasteForm.date || today(),
            status: 'posted',
            productId: product.id,
            quantity: qty,
            category: 'নষ্ট/ক্ষতিগ্রস্থ পণ্য',
            notes: `নষ্টের কারণ: ${wasteForm.reason}${wasteForm.notes ? ` | নোট: ${wasteForm.notes}` : ''} (${currentAdmin.displayName} কর্তৃক সরাসরি রেকর্ডকৃত)`,
            demo: false,
          },
          currentAdmin.username,
          `${currentAdmin.username.toLowerCase()}@glowzaa.shop`,
          currentAdmin.displayName
        );
        setMessage(`নষ্ট পণ্য "${product.name}" (${qty} ${product.unit}) স্টক থেকে বাদ দেওয়া হয়েছে এবং খরচে যুক্ত হয়েছে।`);
      }

      setShowWasteModal(false);
      setWasteForm({
        productId: '',
        quantity: '',
        reason: 'মেয়াদোত্তীর্ণ (Expired)',
        lossAmount: '',
        date: today(),
        notes: '',
      });
    } catch (err: any) {
      setError(err?.message || 'নষ্ট পণ্যের এন্ট্রি ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  function handleInitiateDelete(entry: Entry) {
    if (!admin) return;
    setShowDeleteModal(entry);
    setDeleteReasonInput('');
  }

  function handleInitiateVoid(entry: Entry) {
    if (!admin) return;
    setShowVoidModal(entry);
    setVoidReasonInput('');
  }

  async function handleConfirmDelete() {
    if (!showDeleteModal) return;
    setBusyTone('danger');
    setBusyText('লেনদেন ডিলিট প্রসেস করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'delete_entry',
          targetCollection: 'entries',
          targetId: showDeleteModal.id,
          title: `লেনদেন ডিলিট: ${showDeleteModal.title} (${money(showDeleteModal.amount)})`,
          description: `ধরন: ${typeLabels[showDeleteModal.type] || showDeleteModal.type}, পরিমাণ: ${money(showDeleteModal.amount)}, তারিখ: ${dateLabel(showDeleteModal.date)}`,
          reason: deleteReasonInput.trim() || 'লেনদেন রেকর্ড স্থায়ীভাবে মুছে ফেলার অনুরোধ',
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: { id: showDeleteModal.id },
          previousData: showDeleteModal,
        });

        setMessage(`ডিলিটের অনুরোধ তৈরি হয়েছে! ${targetApproverName} অনুমোদন দিলে তবেই রেকর্ডটি মুছে যাবে।`);
        setShowDeleteModal(null);
        setDeleteReasonInput('');
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        const actorEmail = currentAdmin
          ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
          : user?.email || undefined;
        await removeEntry(showDeleteModal.id, actorUid, actorEmail);
        setMessage(`রেকর্ড "${showDeleteModal.title}" সফলভাবে স্থায়ীভাবে মুছে ফেলা হয়েছে।`);
        setShowDeleteModal(null);
        setDeleteReasonInput('');
      }
    } catch (e: any) {
      setError(e?.message || 'মুছে ফেলা ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmVoid() {
    if (!showVoidModal) return;
    if (needsPartnerApproval && !voidReasonInput.trim()) {
      setError('বাতিল বা রিভার্স করার কারণ উল্লেখ করা আবশ্যক');
      return;
    }

    setBusyTone('danger');
    setBusyText('হিসাব রিভার্স (Void) করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      const finalVoidReason = voidReasonInput.trim() || 'রাকিব কর্তৃক হিসাব রিভার্স (Void)';
      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'edit_entry',
          targetCollection: 'entries',
          targetId: showVoidModal.id,
          title: `হিসাব বাতিল (Void/Reverse): ${showVoidModal.title} (${money(showVoidModal.amount)})`,
          description: `হিসাব রিভার্স করার অনুরোধ। আগের স্ট্যাটাস: ${showVoidModal.status}`,
          reason: finalVoidReason,
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: {
            status: 'void',
            voidReason: finalVoidReason,
            voidedBy: currentAdmin.username,
          },
          previousData: showVoidModal,
        });

        setMessage(`রিভার্স করার অনুরোধ পাঠানো হয়েছে! ${targetApproverName}-এর অনুমোদনের পর তা কার্যকর হবে।`);
        setShowVoidModal(null);
        setVoidReasonInput('');
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        const actorEmail = currentAdmin
          ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
          : user?.email || undefined;
        await voidPostedEntry(showVoidModal, finalVoidReason, actorUid, actorEmail);
        setMessage(`লেনদেন "${showVoidModal.title}" সফলভাবে বাতিল (Void/Reverse) করা হয়েছে; ব্যালেন্স স্বয়ংক্রিয়ভাবে আপডেট হয়েছে।`);
        setShowVoidModal(null);
        setVoidReasonInput('');
      }
    } catch (e: any) {
      setError(e?.message || 'বাতিলকরণ ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDeleteInvestor() {
    if (!showInvestorDeleteModal) return;
    setBusyTone('danger');
    setBusyText('অংশীদার ডিলিট প্রসেস করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'delete_investor',
          targetCollection: 'investors',
          targetId: showInvestorDeleteModal.id,
          title: `অংশীদার ডিলিট: ${showInvestorDeleteModal.name}`,
          description: `অংশীদার "${showInvestorDeleteModal.name}" ডিলিট করার অনুরোধ`,
          reason: deleteReasonInput.trim() || 'অংশীদার রেকর্ড মুছে ফেলার অনুরোধ',
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: { id: showInvestorDeleteModal.id },
          previousData: showInvestorDeleteModal,
        });

        setMessage(`অংশীদার ডিলিটের অনুরোধ তৈরি হয়েছে! ${targetApproverName} অনুমোদন দিলে তবেই মুছে যাবে।`);
        setShowInvestorDeleteModal(null);
        setDeleteReasonInput('');
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        const actorEmail = currentAdmin
          ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
          : user?.email || undefined;
        await removeInvestor(showInvestorDeleteModal.id, actorUid, actorEmail);
        setMessage(`অংশীদার "${showInvestorDeleteModal.name}" সফলভাবে ডিলিট করা হয়েছে।`);
        setShowInvestorDeleteModal(null);
        setDeleteReasonInput('');
      }
    } catch (err: any) {
      setError(err?.message || 'অংশীদার ডিলিট করতে সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDeleteProduct() {
    if (!showProductDeleteModal) return;
    setBusyTone('danger');
    setBusyText('পণ্য ডিলিট প্রসেস করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'delete_product',
          targetCollection: 'products',
          targetId: showProductDeleteModal.id,
          title: `পণ্য স্থায়ী ডিলিট: ${showProductDeleteModal.name}`,
          description: `বর্তমান স্টক: ${showProductDeleteModal.currentStock} ${showProductDeleteModal.unit}, মূল্য: ${money(showProductDeleteModal.sellingPrice)}`,
          reason: deleteReasonInput.trim() || 'ইনভেন্টরি থেকে পণ্য চিরতরে মুছে ফেলার অনুরোধ',
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: { id: showProductDeleteModal.id },
          previousData: showProductDeleteModal,
        });

        setMessage(`পণ্য ডিলিটের অনুরোধ তৈরি হয়েছে! ${targetApproverName} অনুমোদন দিলে তবেই মুছে যাবে।`);
        setShowProductDeleteModal(null);
        setDeleteReasonInput('');
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        const actorEmail = currentAdmin
          ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
          : user?.email || undefined;
        await removeProduct(showProductDeleteModal.id, actorUid, actorEmail);
        setMessage(`পণ্য "${showProductDeleteModal.name}" সফলভাবে ডিলিট করা হয়েছে।`);
        setShowProductDeleteModal(null);
        setDeleteReasonInput('');
      }
    } catch (err: any) {
      setError(err?.message || 'পণ্য ডিলিট করতে সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveRequest(req: ApprovalRequest, note?: string) {
    if (!currentAdmin) return;
    setBusyTone(req.actionType.includes('delete') ? 'danger' : 'default');
    setBusyText('অনুরোধ অনুমোদন ও কার্যকর করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      await approveApprovalRequest(req, currentAdmin.username, currentAdmin.displayName, note);
      setMessage(`অনুরোধ "${req.title}" সফলভাবে অনুমোদিত এবং মূল ওয়েবসাইটে কার্যকর করা হয়েছে!`);
    } catch (err: any) {
      setError(err?.message || 'অনুমোদন ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectRequest(req: ApprovalRequest, reason: string) {
    if (!currentAdmin) return;
    setBusyTone('danger');
    setBusyText('অনুরোধ বাতিল করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      await rejectApprovalRequest(req, currentAdmin.username, currentAdmin.displayName, reason);
      setMessage(`অনুরোধ "${req.title}" বাতিল করা হয়েছে।`);
    } catch (err: any) {
      setError(err?.message || 'বাতিলকরণ ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDeleteDistribution() {
    if (!showDistributionDeleteModal || (!currentAdmin && !user)) return;
    setBusyTone('danger');
    setBusyText('মুনাফা বণ্টন রেকর্ড ডিলিট হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      if (currentAdmin && needsPartnerApproval) {
        const targetApprover = 'Rakib';
        const targetApproverName = 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'delete_distribution',
          targetCollection: 'profitDistributions',
          targetId: showDistributionDeleteModal.id,
          title: `মুনাফা বণ্টন ডিলিট: ${showDistributionDeleteModal.periodName} (${money(showDistributionDeleteModal.distributedAmount)})`,
          description: `মেয়াদ: ${showDistributionDeleteModal.periodName}, বণ্টিত টাকা: ${money(showDistributionDeleteModal.distributedAmount)}`,
          reason: deleteReasonInput.trim() || 'মুনাফা বণ্টন রেকর্ড মুছে ফেলার অনুরোধ',
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: { id: showDistributionDeleteModal.id },
          previousData: showDistributionDeleteModal,
        });

        setMessage(`মুনাফা বণ্টন ডিলিটের অনুরোধ তৈরি হয়েছে! ${targetApproverName} অনুমোদন দিলে তবেই মুছে যাবে।`);
        setShowDistributionDeleteModal(null);
        setDeleteReasonInput('');
      } else {
        const actorUid = currentAdmin?.username || user?.uid || 'Rakib';
        const actorEmail = currentAdmin
          ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
          : user?.email || undefined;
        await removeProfitDistribution(showDistributionDeleteModal.id, actorUid, actorEmail);
        setMessage(`মুনাফা বণ্টন "${showDistributionDeleteModal.periodName}" সফলভাবে ডিলিট করা হয়েছে।`);
        setShowDistributionDeleteModal(null);
        setDeleteReasonInput('');
      }
    } catch (err: any) {
      setError(err?.message || 'মুনাফা বণ্টন ডিলিট করতে সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmResetWebsiteData(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!admin || (!currentAdmin && !user)) return;
    const normalizedPass = resetPasswordInput.trim();
    if (normalizedPass !== '11381' && normalizedPass !== '১১৩৮১') {
      setResetPasswordError('ভুল পাসওয়ার্ড! ডেটা রিসেট করার জন্য সঠিক সিকিউরিটি পাসওয়ার্ড দিন।');
      return;
    }
    setResetPasswordError('');
    setBusyTone('danger');
    setBusyText('সম্পূর্ণ ওয়েবসাইট ডেটা রিসেট করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 450));
      const actorUid = user?.uid || currentAdmin?.username || 'admin';
      await resetAllWebsiteData(actorUid, user?.email || currentAdmin?.displayName);
      setMessage('ওয়েবসাইটের সমস্ত লেনদেন, অংশীদার, পণ্য ইনভেন্টরি, মুনাফা বণ্টন ও অডিট লগ সফলভাবে রিসেট করা হয়েছে।');
      setShowResetDataModal(false);
      setResetPasswordInput('');
      setShowResetPass(false);
    } catch (err: any) {
      setError(err?.message || 'ডেটা রিসেট ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmBulkDelete() {
    if (!admin || (!currentAdmin && !user) || !selectedIds.length) return;
    const draftsToDelete = entries.filter((e) => selectedIds.includes(e.id) && (e.status === 'draft' || e.demo));
    if (!draftsToDelete.length) {
      setError('নির্বাচিত আইটেমগুলোর মধ্যে কোনো ডেমো বা ড্রাফট এন্ট্রি নেই যা সরাসরি মোছা যায়।');
      setShowBulkDeleteModal(false);
      return;
    }

    setBusyTone('danger');
    setBusyText('নির্বাচিত রেকর্ডগুলো ডিলিট করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const actorUid = user?.uid || currentAdmin?.username || 'admin';
      await bulkRemoveDraftEntries(
        draftsToDelete.map((d) => d.id),
        actorUid,
        user?.email || currentAdmin?.displayName
      );
      setMessage(`${draftsToDelete.length}টি রেকর্ড সফলভাবে মুছে ফেলা হয়েছে`);
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
    } catch (e: any) {
      setError(e?.message || 'বাল্ক ডিলিট ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenDemoPreview() {
    if (!admin) return;
    setBusy(true);
    try {
      const preview = await getDemoDataPreview();
      setDemoPreview(preview);
    } catch (e: any) {
      setError(e?.message || 'ডেমো ডেটা পর্যালোচনা করা যায়নি');
    } finally {
      setBusy(false);
    }
  }

  async function handleExecuteDemoCleanup() {
    if (!admin || (!currentAdmin && !user)) return;
    setBusy(true);
    try {
      const actorUid = user?.uid || currentAdmin?.username || 'admin';
      const res = await deleteDemoData(actorUid, user?.email || currentAdmin?.displayName);
      setMessage(`ডেমো ডেটা পরিষ্কার সম্পন্ন: ${res.deletedEntries}টি লেনদেন, ${res.deletedInvestors}টি অংশীদার, ${res.deletedProducts}টি পণ্য মুছে ফেলা হয়েছে।`);
      setDemoPreview(null);
    } catch (e: any) {
      setError(e?.message || 'ডেমো ডেটা মোছা ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleSeedDemo() {
    if (!admin || (!currentAdmin && !user)) return;
    setBusy(true);
    try {
      const actorUid = user?.uid || currentAdmin?.username || 'admin';
      await seedDemoDataset(actorUid);
      setMessage('বাস্তবসম্মত ডেমো ডেটা যোগ করা হয়েছে।');
    } catch (e: any) {
      setError(e?.message || 'ডেমো ডেটা তৈরি ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  function handleRunTests() {
    try {
      runAutomatedTests();
      setTestResults({
        passed: true,
        message: 'সকল ৬টি স্বয়ংক্রিয় ফাইন্যান্সিয়াল ও ব্যালেন্স টেস্ট ১০০% সফলভাবে উত্তীর্ণ হয়েছে!',
        timestamp: new Date().toLocaleTimeString('bn-BD'),
      });
      setMessage('টেস্ট সফলভাবে উত্তীর্ণ হয়েছে!');
    } catch (err: any) {
      setTestResults({
        passed: false,
        message: err?.message || 'টেস্ট ফেইল করেছে',
        timestamp: new Date().toLocaleTimeString('bn-BD'),
      });
      setError(err?.message || 'টেস্টে ত্রুটি পাওয়া গেছে');
    }
  }

  async function handleToggleBrandPopup(enabled: boolean) {
    const actorId = currentAdmin?.username || user?.uid || 'admin';
    const updatedSettings: BusinessSettings = {
      ...settings,
      showBrandPopup: enabled,
      brandPopupText: (settings.brandPopupText || 'Glowzaa এটা ব্রান্ড').trim() || 'Glowzaa এটা ব্রান্ড',
      showCalculator: settings.showCalculator !== false,
      enableVoiceInput: settings.enableVoiceInput !== false,
      updatedBy: actorId,
    };
    setSettings(updatedSettings);
    try {
      localStorage.setItem('glowzaa_business_settings', JSON.stringify(updatedSettings));
    } catch {}
    if (enabled) {
      setShowBrandWelcome(true);
    } else {
      setShowBrandWelcome(false);
    }
    if (db) {
      try {
        await setDoc(
          doc(db, 'businessSettings', 'main'),
          deepClean({
            showBrandPopup: enabled,
            brandPopupText: updatedSettings.brandPopupText,
            updatedAt: serverTimestamp(),
            updatedBy: actorId,
          }),
          { merge: true }
        );
      } catch (err) {
        console.warn('Brand popup toggle save warning:', err);
      }
    }
    setMessage(
      enabled
        ? '✨ "Glowzaa এটা ব্রান্ড" ওয়েলকাম পপআপ এনিমেশন চালু (ON) করা হয়েছে!'
        : 'ওয়েলকাম পপআপ এনিমেশন বন্ধ (OFF) করা হয়েছে।'
    );
  }

  async function handleToggleCalculator(enabled: boolean) {
    const actorId = currentAdmin?.username || user?.uid || 'admin';
    const updatedSettings: BusinessSettings = {
      ...settings,
      showCalculator: enabled,
      enableVoiceInput: settings.enableVoiceInput !== false,
      updatedBy: actorId,
    };
    setSettings(updatedSettings);
    try {
      localStorage.setItem('glowzaa_business_settings', JSON.stringify(updatedSettings));
    } catch {}
    if (!enabled) {
      setShowCalculatorModal(false);
    }
    if (db) {
      try {
        await setDoc(
          doc(db, 'businessSettings', 'main'),
          deepClean({
            showCalculator: enabled,
            updatedAt: serverTimestamp(),
            updatedBy: actorId,
          }),
          { merge: true }
        );
      } catch (err) {
        console.warn('Calculator toggle save warning:', err);
      }
    }
    setMessage(
      enabled
        ? '🧮 ব্যবসার ফ্লোটিং ক্যালকুলেটর চালু (ON) করা হয়েছে!'
        : 'ব্যবসার ফ্লোটিং ক্যালকুলেটর বন্ধ (OFF) করা হয়েছে।'
    );
  }

  async function handleToggleVoiceFeatures(enabled: boolean) {
    const actorId = currentAdmin?.username || user?.uid || 'admin';
    const updatedSettings: BusinessSettings = {
      ...settings,
      enableVoiceInput: enabled,
      showCalculator: settings.showCalculator !== false,
      showBrandPopup: settings.showBrandPopup !== false,
      updatedBy: actorId,
    };
    setSettings(updatedSettings);
    try {
      localStorage.setItem('glowzaa_business_settings', JSON.stringify(updatedSettings));
    } catch {}
    if (db) {
      try {
        await setDoc(
          doc(db, 'businessSettings', 'main'),
          deepClean({
            enableVoiceInput: enabled,
            updatedAt: serverTimestamp(),
            updatedBy: actorId,
          }),
          { merge: true }
        );
      } catch (err) {
        console.warn('Voice features toggle save warning:', err);
      }
    }
    setMessage(
      enabled
        ? '🎙️ সকল ভয়েস ইনপুট ও অটো-ফিল ফিচার চালু (ON) করা হয়েছে!'
        : 'সকল ভয়েস ইনপুট ও অটো-ফিল ফিচার বন্ধ (OFF) করা হয়েছে।'
    );
  }

  async function handleToggleCameraScan(enabled: boolean) {
    const actorId = currentAdmin?.username || user?.uid || 'admin';
    const updatedSettings: BusinessSettings = {
      ...settings,
      enableCameraScan: enabled,
      enableDrawingPad: settings.enableDrawingPad !== false,
      showCalculator: settings.showCalculator !== false,
      enableVoiceInput: settings.enableVoiceInput !== false,
      showBrandPopup: settings.showBrandPopup !== false,
      updatedBy: actorId,
    };
    setSettings(updatedSettings);
    try {
      localStorage.setItem('glowzaa_business_settings', JSON.stringify(updatedSettings));
    } catch {}
    if (!enabled) {
      setShowCameraSaleModal(false);
    }
    if (db) {
      try {
        await setDoc(
          doc(db, 'businessSettings', 'main'),
          deepClean({
            enableCameraScan: enabled,
            updatedAt: serverTimestamp(),
            updatedBy: actorId,
          }),
          { merge: true }
        );
      } catch (err) {
        console.warn('Camera scan toggle save warning:', err);
      }
    }
    setMessage(
      enabled
        ? '📷 লাইভ ক্যামেরা অটো-সেল স্ক্যানার চালু (ON) করা হয়েছে!'
        : 'লাইভ ক্যামেরা অটো-সেল স্ক্যানার বন্ধ (OFF) করা হয়েছে।'
    );
  }

  async function handleToggleDrawingPad(enabled: boolean) {
    const actorId = currentAdmin?.username || user?.uid || 'admin';
    const updatedSettings: BusinessSettings = {
      ...settings,
      enableDrawingPad: enabled,
      enableCameraScan: settings.enableCameraScan !== false,
      showCalculator: settings.showCalculator !== false,
      enableVoiceInput: settings.enableVoiceInput !== false,
      showBrandPopup: settings.showBrandPopup !== false,
      updatedBy: actorId,
    };
    setSettings(updatedSettings);
    try {
      localStorage.setItem('glowzaa_business_settings', JSON.stringify(updatedSettings));
    } catch {}
    if (!enabled) {
      setShowDrawingSaleModal(false);
    }
    if (db) {
      try {
        await setDoc(
          doc(db, 'businessSettings', 'main'),
          deepClean({
            enableDrawingPad: enabled,
            updatedAt: serverTimestamp(),
            updatedBy: actorId,
          }),
          { merge: true }
        );
      } catch (err) {
        console.warn('Drawing pad toggle save warning:', err);
      }
    }
    setMessage(
      enabled
        ? '✍️ ড্রইং প্যাড অটো-সেল ফিচার চালু (ON) করা হয়েছে!'
        : 'ড্রইং প্যাড অটো-সেল ফিচার বন্ধ (OFF) করা হয়েছে।'
    );
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!admin || !db) return;
    setError('');
    setBusyTone('default');
    setBusyText('ব্যবসার সেটিংস সংরক্ষণ করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      const actorId = currentAdmin?.username || user?.uid || 'admin';
      const normalizedSettings: BusinessSettings = {
        name: (settings.name || 'Glowzaa Shop').trim() || 'Glowzaa Shop',
        type: (settings.type || '').trim(),
        address: (settings.address || '').trim(),
        phone: (settings.phone || '').trim(),
        currencySymbol: settings.currencySymbol || '৳',
        superAdminEmail: settings.superAdminEmail || 'glowzaabd.shop@gmail.com',
        showBrandPopup: settings.showBrandPopup !== false,
        brandPopupText: (settings.brandPopupText || 'Glowzaa এটা ব্রান্ড').trim() || 'Glowzaa এটা ব্রান্ড',
        showCalculator: settings.showCalculator !== false,
        enableVoiceInput: settings.enableVoiceInput !== false,
        enableCameraScan: settings.enableCameraScan !== false,
        enableDrawingPad: settings.enableDrawingPad !== false,
        updatedBy: actorId,
      };
      const payload = deepClean({
        ...normalizedSettings,
        updatedAt: serverTimestamp(),
        updatedBy: actorId,
      });
      await setDoc(doc(db, 'businessSettings', 'main'), payload, { merge: true });
      try {
        localStorage.setItem('glowzaa_business_settings', JSON.stringify(normalizedSettings));
      } catch {}
      setSettings(normalizedSettings);
      setMessage('ব্যবসার সেটিংস সফলভাবে সংরক্ষিত হয়েছে');
    } catch (e: any) {
      setError(e?.message || 'সেটিংস সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const headers = ['তারিখ', 'ধরন', 'বিবরণ', 'টাকার পরিমাণ (৳)', 'স্ট্যাটাস', 'ক্যাটাগরি', 'ইনভেস্টর', 'নোট'];
    const rows = filtered.map((e) => [
      e.date,
      typeLabels[e.type] || e.type,
      e.title,
      e.amount,
      e.status,
      e.category || '',
      investors.find((i) => i.id === e.investorId)?.name || '',
      e.notes || '',
    ]);

    const csvContent = '\ufeff' + [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `business-ledger-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleDownloadPdf() {
    setIsPdfLoading(true);
    try {
      await generateBengaliPdf({
        settings,
        stats,
        investors,
        products,
        entries: filtered,
      });
      setMessage('বাংলা PDF আর্থিক প্রতিবেদন সফলভাবে প্রস্তুত ও ডাউনলোড হয়েছে');
    } catch (e: any) {
      console.error(e);
      setError('PDF তৈরি করার সময় সমস্যা হয়েছে: ' + (e?.message || String(e)));
    } finally {
      setIsPdfLoading(false);
    }
  }

  async function handleDownloadMonthlyPdf() {
    setIsMonthlyPdfLoading(true);
    try {
      await generateMonthlyBengaliPdf(
        {
          settings,
          yearMonth: reportMonth,
          stats: monthlyReportStats,
          investors,
          products,
          monthEntries: monthlyReportEntries,
          allEntries: entries,
        },
        `monthly-report-${reportMonth}.pdf`
      );
      setMessage(`${formatMonthLabelBn(reportMonth)} মাসের পিডিএফ রিপোর্ট সফলভাবে ডাউনলোড হয়েছে`);
    } catch (e: any) {
      console.error(e);
      setError('মাসিক PDF তৈরি করার সময় সমস্যা হয়েছে: ' + (e?.message || String(e)));
    } finally {
      setIsMonthlyPdfLoading(false);
    }
  }

  if (!authReady) {
    return <div className="center">সিস্টেম প্রস্তুত হচ্ছে…</div>;
  }

  if (!firebaseConfigured) {
    return (
      <div className="setup">
        <div className="login-card">
          <BadgeDollarSign size={42} />
          <h1>Business Partner Accounting</h1>
          <p>ওয়েবসাইট চালু করতে Firebase কনফিগারেশন যোগ করুন।</p>
        </div>
      </div>
    );
  }

  if (!currentAdmin) {
    return (
      <div className="setup">
        <BrandWelcomePopup
          open={showBrandWelcome}
          brandText={settings.brandPopupText || 'Glowzaa এটা ব্রান্ড'}
          shopName={settings.name || 'Glowzaa Shop'}
          onClose={() => setShowBrandWelcome(false)}
        />
        <div className="login-card" style={{ maxWidth: '440px', padding: '28px 24px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'linear-gradient(135deg, #091e32, #0d3251)', borderRadius: '16px', color: '#2dd4bf', boxShadow: '0 4px 14px rgba(13, 148, 136, 0.25)', margin: '0 auto 8px' }}>
            <BadgeDollarSign size={38} />
          </div>
          <h1 style={{ fontSize: '24px', margin: '0 0 4px', fontWeight: 800, color: '#0f2438' }}>Glowzaa Shop</h1>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
            অ্যাডমিন এক্সেস ও সিকিউরিটি পোর্টাল
          </p>

          <div className="security-badge-banner">
            <Lock size={16} style={{ color: '#16a34a', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <strong>সংরক্ষিত সিকিউরিটি সিস্টেম:</strong>
              <div style={{ fontSize: '11.5px', marginTop: '2px', color: '#15803d' }}>
                এই ওয়েবসাইটে শুধুমাত্র অনুমোদিত ২ জন অ্যাডমিন (<b>Rakib</b> ও <b>Limon</b>) প্রবেশ করতে পারবেন।
              </div>
            </div>
          </div>

          {error && <div className="alert">{error}</div>}
          {message && <div className="success">{message}</div>}

          <div className="admin-selector-cards">
            <button
              type="button"
              className={`admin-chip-btn ${adminUsernameInput.toLowerCase() === 'rakib' ? 'selected' : ''}`}
              onClick={() => {
                setAdminUsernameInput('Rakib');
                setAdminPasswordInput(adminPasswords.rakib || 'G120');
              }}
            >
              <ShieldCheck size={18} />
              <span className="chip-name">Rakib</span>
              <span className="chip-desc">অ্যাডমিন আইডি ০১</span>
            </button>

            <button
              type="button"
              className={`admin-chip-btn ${adminUsernameInput.toLowerCase() === 'limon' ? 'selected' : ''}`}
              onClick={() => {
                setAdminUsernameInput('Limon');
                setAdminPasswordInput(adminPasswords.limon || 'G120');
              }}
            >
              <ShieldCheck size={18} />
              <span className="chip-name">Limon</span>
              <span className="chip-desc">অ্যাডমিন আইডি ০২</span>
            </button>
          </div>

          <form onSubmit={handleAdminLogin} style={{ display: 'grid', gap: '14px', width: '100%' }}>
            <label style={{ textAlign: 'left' }}>
              ইউজার নেম / অ্যাডমিন আইডি:
              <input
                type="text"
                required
                value={adminUsernameInput}
                placeholder="User: Rakib অথবা Limon"
                onChange={(e) => setAdminUsernameInput(e.target.value)}
              />
            </label>

            <label style={{ textAlign: 'left' }}>
              পাসওয়ার্ড:
              <div className="input-with-icon">
                <input
                  type={showAdminPass ? 'text' : 'password'}
                  required
                  value={adminPasswordInput}
                  placeholder="পাসওয়ার্ড দিন (প্রাথমিক: G120)"
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                />
                <button
                  type="button"
                  className="toggle-eye-btn"
                  onClick={() => setShowAdminPass(!showAdminPass)}
                  title={showAdminPass ? 'লুকান' : 'দেখুন'}
                >
                  {showAdminPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button className="primary wide" type="submit" disabled={busy} style={{ padding: '12px', fontSize: '14.5px', fontWeight: 700 }}>
              {busy ? (
                <>
                  <span className="btn-spinner" />
                  <span>যাচাই হচ্ছে…</span>
                </>
              ) : (
                'প্রবেশ করুন (লগইন)'
              )}
            </button>
          </form>

          <small style={{ color: '#64748b', fontSize: '11.5px', textAlign: 'center', lineHeight: 1.5, background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            🔑 <b>লগইন তথ্য:</b> Rakib এর পাসওয়ার্ড <b>G120</b> | Limon এর পাসওয়ার্ড <b>G120</b>। লগইনের পর প্রোফাইল থেকে নিজের পাসওয়ার্ড পরিবর্তন করা যাবে।
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Website Entry Brand Welcome Popup Animation ("Glowzaa এটা ব্রান্ড") */}
      <BrandWelcomePopup
        open={showBrandWelcome}
        brandText={settings.brandPopupText || 'Glowzaa এটা ব্রান্ড'}
        shopName={settings.name || 'Glowzaa Shop'}
        onClose={() => setShowBrandWelcome(false)}
      />

      {/* Global Save / Add Product / Delete Loading Animation Overlay */}
      {busy && (
        <div className="action-loading-overlay" role="status" aria-live="polite">
          <div className={`action-loading-card ${busyTone === 'danger' ? 'danger-tone' : ''}`}>
            <div className="action-loading-ring-wrap">
              <div className="action-loading-ring-bg" />
              <div className="action-loading-ring" />
            </div>
            <h4 className="action-loading-title">{busyText || 'সংরক্ষণ করা হচ্ছে…'}</h4>
            <p className="action-loading-sub">অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন</p>
            <div className="action-loading-bar-track">
              <div className="action-loading-bar-fill" />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation (Sliding Drawer on Mobile, Docked on Desktop) */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-main">
            <div className="brand-icon">
              <BadgeDollarSign size={22} />
            </div>
            <div className="brand-text">
              <b>{settings.name || 'ব্যবসার হিসাব'}</b>
              <small>PARTNER ACCOUNTING</small>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            title="মেনু বন্ধ করুন"
          >
            <X size={18} />
          </button>
        </div>

        <nav>
          <span className="nav-section-title">প্রধান নেভিগেশন</span>
          <button
            type="button"
            className={tab === 'dashboard' ? 'nav active' : 'nav'}
            onClick={() => { setTab('dashboard'); setIsMobileMenuOpen(false); }}
          >
            <Activity /> ড্যাশবোর্ড
          </button>
          <button
            type="button"
            className={tab === 'transactions' ? 'nav active' : 'nav'}
            onClick={() => { setTab('transactions'); setIsMobileMenuOpen(false); }}
          >
            <Banknote /> সকল লেনদেন ও ডিলিট
          </button>
          <button
            type="button"
            className={tab === 'seller_sales' ? 'nav active' : 'nav'}
            onClick={() => { setTab('seller_sales'); setIsMobileMenuOpen(false); }}
          >
            <Users /> বিক্রেতা অনুযায়ী হিসাব
          </button>
          <button
            type="button"
            className={tab === 'investors' ? 'nav active' : 'nav'}
            onClick={() => { setTab('investors'); setIsMobileMenuOpen(false); }}
          >
            <Users /> ইনভেস্টর ও শেয়ার
          </button>

          <span className="nav-section-title">পণ্য ও হিসাব</span>
          <button
            type="button"
            className={tab === 'inventory' ? 'nav active' : 'nav'}
            onClick={() => { setTab('inventory'); setIsMobileMenuOpen(false); }}
          >
            <Boxes /> মজুদ পণ্য ও কস্টিং
          </button>
          <button
            type="button"
            className={tab === 'profit' ? 'nav active' : 'nav'}
            onClick={() => { setTab('profit'); setIsMobileMenuOpen(false); }}
          >
            <Percent /> মুনাফা বণ্টন
          </button>

          <span className="nav-section-title">রিপোর্ট ও নিরাপত্তা</span>
          <button
            type="button"
            className={tab === 'reports' ? 'nav active' : 'nav'}
            onClick={() => { setTab('reports'); setIsMobileMenuOpen(false); }}
          >
            <Download /> রিপোর্ট ও পিডিএফ
          </button>
          <button
            type="button"
            className={tab === 'audit' ? 'nav active' : 'nav'}
            onClick={() => { setTab('audit'); setIsMobileMenuOpen(false); }}
          >
            <History /> অডিট লগ (Delete History)
          </button>
          <button
            type="button"
            className={tab === 'settings' ? 'nav active' : 'nav'}
            onClick={() => { setTab('settings'); setIsMobileMenuOpen(false); }}
          >
            <Settings /> সেটিংস ও ডেটা
          </button>
          <button
            type="button"
            className={tab === 'terms' ? 'nav active' : 'nav'}
            onClick={() => { setTab('terms'); setIsMobileMenuOpen(false); }}
          >
            <ShieldCheck /> শর্তাবলী ও নীতিমালা
          </button>
          <span className="nav-section-title">ব্যক্তিগত প্রোফাইল ও সেশন</span>
          <button
            type="button"
            className={tab === 'profile' ? 'nav active' : 'nav'}
            onClick={() => { setTab('profile'); setIsMobileMenuOpen(false); }}
          >
            <UserIcon size={18} /> আমার প্রোফাইল
          </button>
        </nav>

        <div className="sidebar-bottom">
          <ShieldCheck size={20} style={{ color: '#2dd4bf', flexShrink: 0 }} />
          <div className="sidebar-bottom-info">
            <span style={{ fontWeight: 700, color: '#f8fafc', display: 'block', fontSize: '13px' }}>
              {currentAdmin.displayName}
            </span>
            <small style={{ display: 'block', fontSize: '11px', color: '#2dd4bf', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              সুপার অ্যাডমিন
            </small>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            title="লগআউট করুন"
            onClick={() => {
              setIsMobileMenuOpen(false);
              handleAdminLogout();
            }}
          >
            <LogOut size={15} />
            <span>লগআউট</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        {/* Top Header */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="মেনুবার খুলুন"
            >
              <Menu size={18} />
              <span className="mobile-menu-label">মেনু</span>
            </button>
            <div className="topbar-title-wrap">
              <h1>{settings.name || 'Glowzaa Shop'}</h1>
            </div>
          </div>
          <div className="top-actions">
            {/* Compact Bell Notification Icon — Opens Dedicated Notification & Approval Modal */}
            <button
              type="button"
              className={`topbar-bell-btn ${pendingForMeCount > 0 ? 'has-pending' : ''}`}
              onClick={() => {
                setNotifRejectingId(null);
                setNotifRejectReason('');
                setNotifTab(pendingForMeCount > 0 ? 'pending_for_me' : 'recent_activity');
                setShowNotificationModal(true);
              }}
              title={
                pendingForMeCount > 0
                  ? `${otherPartner.displayName}-এর ${pendingForMeCount}টি অনুমোদন অপেক্ষমান!`
                  : 'নোটিফিকেশন ও অনুমোদন তালিকা দেখুন'
              }
              aria-label="নোটিফিকেশন ও অনুমোদন"
            >
              <Bell size={18} />
              {pendingForMeCount > 0 && (
                <span className="topbar-bell-badge">{pendingForMeCount}</span>
              )}
            </button>

            {/* Top-Right Profile Icon Button */}
            <button
              type="button"
              className={`topbar-profile-btn ${tab === 'profile' ? 'active' : ''}`}
              onClick={() => setTab('profile')}
              title="আমার প্রোফাইল"
              aria-label="আমার প্রোফাইল"
            >
              <div className="topbar-avatar-icon">
                {(currentAdmin.username === 'Rakib' ? adminAvatars.rakib : adminAvatars.limon) ? (
                  <img
                    src={currentAdmin.username === 'Rakib' ? adminAvatars.rakib : adminAvatars.limon}
                    alt={currentAdmin.displayName}
                    className="topbar-avatar-img"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserIcon size={16} />
                )}
              </div>
              <div className="topbar-profile-meta">
                <span className="topbar-profile-name">{currentAdmin.username}</span>
                <span className="topbar-profile-tag">প্রোফাইল</span>
              </div>
            </button>
          </div>
        </header>

        {/* Sleek Horizontal Scrollable Navigation Strip for Mobile & Tablet */}
        <div className="mobile-tab-strip" role="navigation" aria-label="দ্রুত নেভিগেশন">
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setTab('dashboard')}
          >
            <Activity size={14} /> ড্যাশবোর্ড
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'transactions' ? 'active' : ''}`}
            onClick={() => setTab('transactions')}
          >
            <Banknote size={14} /> লেনদেন ({entries.length})
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'seller_sales' ? 'active' : ''}`}
            onClick={() => setTab('seller_sales')}
          >
            <Users size={14} /> বিক্রেতা হিসাব
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'inventory' ? 'active' : ''}`}
            onClick={() => setTab('inventory')}
          >
            <Boxes size={14} /> স্টক ও পণ্য ({products.length})
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'investors' ? 'active' : ''}`}
            onClick={() => setTab('investors')}
          >
            <Users size={14} /> অংশীদার
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'profit' ? 'active' : ''}`}
            onClick={() => setTab('profit')}
          >
            <Percent size={14} /> মুনাফা বণ্টন
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'reports' ? 'active' : ''}`}
            onClick={() => setTab('reports')}
          >
            <FileText size={14} /> রিপোর্ট
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'audit' ? 'active' : ''}`}
            onClick={() => setTab('audit')}
          >
            <History size={14} /> অডিট লগ
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'terms' ? 'active' : ''}`}
            onClick={() => setTab('terms')}
          >
            <ShieldCheck size={14} /> শর্তাবলী
          </button>
          <button
            type="button"
            className={`mobile-strip-pill ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            <Settings size={14} /> সেটিংস
          </button>
        </div>

        {error && (
          <div className="alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')}><XCircle size={16} /></button>
          </div>
        )}
        {message && (
          <div className="success">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} />
              <span>{message}</span>
            </div>
            <button onClick={() => setMessage('')}>×</button>
          </div>
        )}

        {/* PROMINENT DUAL-ADMIN APPROVAL NOTIFICATION BANNER */}
        {currentAdmin && pendingForMeCount > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, #fff1f2, #fff7ed)',
              border: '2px solid #f87171',
              borderRadius: '12px',
              padding: '13px 18px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              boxShadow: '0 4px 16px rgba(220, 38, 38, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Bell size={20} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 2px', color: '#991b1b', fontSize: '14.5px', fontWeight: 800 }}>
                  🔔 {otherPartner.displayName}-এর {toBengaliNumerals(pendingForMeCount)}টি অনুমতি বার্তা আপনার সিদ্ধান্তের অপেক্ষায়!
                </h4>
                <p style={{ margin: 0, color: '#7f1d1d', fontSize: '12px', lineHeight: 1.4 }}>
                  শর্তাবলী অনুযায়ী অপর অংশীদারের অনুমতি ছাড়া কোনো নতুন তথ্য, পণ্য বা ডিলিট কার্যকর হবে না।
                </p>
              </div>
            </div>
            <button
              type="button"
              className="primary"
              style={{
                background: '#dc2626',
                borderColor: '#dc2626',
                padding: '8px 16px',
                fontSize: '12.5px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
              onClick={() => {
                setNotifRejectingId(null);
                setNotifRejectReason('');
                setNotifTab('pending_for_me');
                setShowNotificationModal(true);
              }}
            >
              <ShieldCheck size={15} />
              <span>অনুমোদন দিন ({toBengaliNumerals(pendingForMeCount)}) →</span>
            </button>
          </div>
        )}

        {/* TAB 0: ADMIN PROFILE & DUAL APPROVAL CENTER */}
        {tab === 'profile' && currentAdmin && (
          <AdminProfile
            adminUser={currentAdmin}
            avatarUrl={currentAdmin.username === 'Rakib' ? adminAvatars.rakib : adminAvatars.limon}
            onUpdateAvatar={async (dataUrl) => {
              await updateAdminAvatarInDb(currentAdmin.username, dataUrl, user?.uid);
              setAdminAvatars((prev) => ({
                ...prev,
                [currentAdmin.username.toLowerCase()]: dataUrl,
              }));
            }}
            investors={investors}
            entries={entries}
            products={products}
            partnerAccounts={partnerAccounts}
            availableBusinessCash={cashSummary.availableCash}
            onSubmitWithdrawal={async ({ amount, date, method, reason, investorId, investorName, entryType = 'withdrawal' }) => {
              const isLoan = entryType === 'loan';
              const titleText = isLoan
                ? `${currentAdmin.displayName}-এর বিশেষ লোন (${method} — পরবর্তী লাভাংশ থেকে অটো কর্তন)`
                : `${currentAdmin.displayName}-এর লাভাংশ উত্তোলন (${method})`;
              const entryPayload = {
                type: (isLoan ? 'loan' : 'withdrawal') as RecordType,
                title: titleText,
                amount,
                date: date || today(),
                status: 'posted' as EntryStatus,
                investorId: investorId || undefined,
                category: method,
                notes: isLoan
                  ? `বিশেষ লোন (পরবর্তী লাভাংশ থেকে অটোমেটিক কর্তনযোগ্য): ${reason} (মাধ্যম: ${method})`
                  : `লাভাংশ উত্তোলন: ${reason} (মাধ্যম: ${method})`,
                demo: false,
              };

              if (needsPartnerApproval) {
                const targetApprover = 'Rakib';
                const targetApproverName = 'রাকিব (Rakib)';
                await createApprovalRequest({
                  actionType: 'create_entry',
                  targetCollection: 'entries',
                  title: isLoan
                    ? `বিশেষ লোন আবেদন: ${investorName} (${money(amount)})`
                    : `লাভাংশ উত্তোলন: ${investorName} (${money(amount)})`,
                  description: `${isLoan ? 'লোন গ্রহণকারী' : 'উত্তোলনকারী'}: ${currentAdmin.displayName}, পরিমাণ: ${money(amount)}, মাধ্যম: ${method}, তারিখ: ${dateLabel(date || today())}${isLoan ? ' [শর্ত: পরবর্তী লাভাংশ থেকে অটোমেটিক কেটে নেওয়া হবে]' : ''}`,
                  reason,
                  requestedBy: currentAdmin.username,
                  requestedByName: currentAdmin.displayName,
                  requestedAt: new Date().toISOString(),
                  requestedAtFormatted: formatBengaliDateTime(new Date()),
                  targetApprover,
                  targetApproverName,
                  status: 'pending',
                  payload: entryPayload,
                  previousData: null,
                });
              } else {
                await addEntry(
                  entryPayload,
                  currentAdmin.username,
                  `${currentAdmin.username.toLowerCase()}@glowzaa.shop`,
                  currentAdmin.displayName
                );
              }
            }}
            currentPassword={currentAdmin.username === 'Rakib' ? adminPasswords.rakib : adminPasswords.limon}
            onUpdatePassword={async (newPass) => {
              await updateAdminPasswordInDb(currentAdmin.username, newPass, user?.uid);
              setAdminPasswords((prev) => ({
                ...prev,
                [currentAdmin.username.toLowerCase()]: newPass,
              }));
              setMessage('পাসওয়ার্ড সফলভাবে সংরক্ষিত হয়েছে!');
            }}
            approvalRequests={approvalRequests}
            onApproveRequest={handleApproveRequest}
            onRejectRequest={handleRejectRequest}
            onLogout={handleAdminLogout}
            enableVoiceInput={settings.enableVoiceInput !== false}
          />
        )}

        {/* TAB 1: DASHBOARD */}
        {tab === 'dashboard' && (
          <>
            <div className="welcome">
              <div className="welcome-actions">
                {admin && (
                  <button
                    className="primary"
                    onClick={() => {
                      setEditingEntry(null);
                      setEntryForm({
                        type: 'sale',
                        seller: (currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib') as 'Rakib' | 'Limon',
                        title: '',
                        amount: '',
                        profit: '',
                        cost: '',
                        date: today(),
                        status: 'posted',
                        investorId: '',
                        productId: '',
                        quantity: '',
                        unitPrice: '',
                        unitCost: '',
                        category: '',
                        notes: '',
                      });
                      setShowEntryModal(true);
                    }}
                  >
                    <Plus size={17} /> নতুন হিসাব যোগ
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowProfitabilityModal(true)}
                  style={{
                    borderColor: '#0d9488',
                    color: '#0f766e',
                    background: '#f0fdfa',
                  }}
                >
                  <PieChart size={17} /> পণ্যভিত্তিক লাভ ও স্টক রিপোর্ট
                </button>
                <button className="secondary" onClick={handleDownloadPdf} disabled={isPdfLoading}>
                  <Download size={17} /> {isPdfLoading ? 'প্রস্তুত হচ্ছে…' : 'পিডিএফ রিপোর্ট'}
                </button>
              </div>
            </div>

            {/* TODAY'S INSTANT SNAPSHOT BAR */}
            <div className="today-highlight-banner">
              <div className="today-banner-head">
                <div className="today-banner-title">
                  <Calendar size={16} />
                  <span>আজকের তাৎক্ষণিক হিসাব ({dateLabel(todayStr)})</span>
                </div>
                <div className="today-banner-actions">
                  <span className="today-balance-pill">
                    মূলধন সহ বর্তমান ব্যালান্স: {money(cashSummary.availableCash)}
                  </span>
                  <button
                    type="button"
                    className={`today-inspect-btn ${dashPreset === 'today' ? 'active' : ''}`}
                    onClick={() => setDashPreset(dashPreset === 'today' ? 'all' : 'today')}
                  >
                    {dashPreset === 'today' ? 'সব দিনের হিসাবে ফিরুন' : 'শুধু আজকের বিস্তারিত দেখুন →'}
                  </button>
                </div>
              </div>
              <div className="today-metrics-strip">
                <div
                  className="today-metric-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDashDetailModal('sales')}
                  title="বিক্রয়ের বিস্তারিত দেখুন"
                >
                  <span>আজকের বিক্রয় ({todayBreakdown.salesCount}টি) →</span>
                  <strong className="text-blue">{money(todayBreakdown.sales)}</strong>
                </div>
                <div
                  className="today-metric-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDashDetailModal('purchases')}
                  title="মোট ক্রয়ের বিস্তারিত দেখুন"
                >
                  <span>আজকের মোট ক্রয় →</span>
                  <strong className="text-amber">{money(todayTotalPurchase)}</strong>
                </div>
                <div
                  className="today-metric-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDashDetailModal('expenses')}
                  title="অতিরিক্ত খরচের বিস্তারিত দেখুন"
                >
                  <span>আজকের অতিরিক্ত খরচ →</span>
                  <strong className="text-red">{money(todayBreakdown.expenses)}</strong>
                </div>
                <div
                  className="today-metric-item highlight"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDashDetailModal('net_profit')}
                  title="নিট লাভের বিস্তারিত দেখুন"
                >
                  <span>আজকের নিট {todayBreakdown.netProfit >= 0 ? 'লাভ' : 'ক্ষতি'} →</span>
                  <strong className={todayBreakdown.netProfit >= 0 ? 'text-emerald' : 'text-red'}>
                    {todayBreakdown.netProfit >= 0 ? '+' : ''}{money(todayBreakdown.netProfit)}
                  </strong>
                </div>
              </div>
            </div>

            {/* DASHBOARD PERIOD & HISTORICAL DATE FILTER CONTROL PANEL */}
            <div className="dash-filter-card">
              <div className="dash-filter-top">
                <div className="dash-filter-heading">
                  <Filter size={15} />
                  <span>ড্যাশবোর্ড সময়কাল ও তারিখ ফিল্টার:</span>
                  <strong className="dash-active-period-badge">{dashPeriodLabel}</strong>
                </div>
                {dashPreset !== 'all' && (
                  <button
                    type="button"
                    className="date-clear-btn"
                    onClick={() => {
                      setDashPreset('all');
                      setDashTypeFilter('all');
                    }}
                  >
                    <X size={13} /> সব দিন দেখুন
                  </button>
                )}
              </div>

              {/* Quick Period Buttons */}
              <div className="dash-preset-bar">
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === 'all' ? 'active' : ''}`}
                  onClick={() => setDashPreset('all')}
                >
                  সব দিন (সর্বমোট)
                </button>
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === 'today' ? 'active' : ''}`}
                  onClick={() => setDashPreset('today')}
                >
                  আজকে ({dateLabel(todayStr)})
                </button>
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === 'yesterday' ? 'active' : ''}`}
                  onClick={() => setDashPreset('yesterday')}
                >
                  গতকাল ({dateLabel(yesterdayStr)})
                </button>
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === '7d' ? 'active' : ''}`}
                  onClick={() => setDashPreset('7d')}
                >
                  গত ৭ দিন
                </button>
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === 'month' ? 'active' : ''}`}
                  onClick={() => setDashPreset('month')}
                >
                  চলতি মাস
                </button>
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === '30d' ? 'active' : ''}`}
                  onClick={() => setDashPreset('30d')}
                >
                  গত ৩০ দিন
                </button>
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === 'single_day' ? 'active' : ''}`}
                  onClick={() => setDashPreset('single_day')}
                >
                  নির্দিষ্ট যেকোনো দিন
                </button>
                <button
                  type="button"
                  className={`dash-preset-pill ${dashPreset === 'custom_range' ? 'active' : ''}`}
                  onClick={() => setDashPreset('custom_range')}
                >
                  কাস্টম তারিখ রেঞ্জ
                </button>
              </div>

              {/* Single Day Picker when 'single_day' is selected */}
              {dashPreset === 'single_day' && (
                <div className="dash-custom-date-bar">
                  <div className="date-input-group" style={{ maxWidth: '280px' }}>
                    <span className="input-group-tag">তারিখ নির্বাচন:</span>
                    <input
                      type="date"
                      value={dashSingleDate}
                      onChange={(e) => setDashSingleDate(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {dailyBreakdowns.slice(0, 7).map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        className={`date-preset-btn ${dashSingleDate === d.date ? 'active' : ''}`}
                        onClick={() => setDashSingleDate(d.date)}
                      >
                        {d.isToday ? 'আজ' : d.isYesterday ? 'গতকাল' : dateLabel(d.date)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Date Range Inputs when 'custom_range' is selected */}
              {dashPreset === 'custom_range' && (
                <div className="date-inputs-row" style={{ marginTop: '12px', marginBottom: 0 }}>
                  <div className="date-input-group">
                    <span className="input-group-tag">শুরুর তারিখ:</span>
                    <input
                      type="date"
                      value={dashStartDate}
                      onChange={(e) => setDashStartDate(e.target.value)}
                    />
                  </div>
                  <div className="date-input-group">
                    <span className="input-group-tag">শেষ তারিখ:</span>
                    <input
                      type="date"
                      value={dashEndDate}
                      onChange={(e) => setDashEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4 FILTERED PERIOD KPI CARDS — Clean Full-Width Layout & Interactive Clickable */}
            <div className="stats-grid">
              {/* Card 1: Sales */}
              <div
                className="dash-kpi-card"
                role="button"
                tabIndex={0}
                onClick={() => setDashDetailModal('sales')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDashDetailModal('sales'); }}
              >
                <div className="dash-kpi-top">
                  <div className="stat-icon blue"><ArrowUpRight /></div>
                  <span className="dash-kpi-badge">বিস্তারিত →</span>
                </div>
                <div className="dash-kpi-body">
                  <span className="dash-kpi-label">
                    {dashPreset === 'all' ? 'মোট বিক্রয় রাজস্ব' : 'নির্বাচিত সময়ের বিক্রয়'}
                  </span>
                  <strong className="dash-kpi-amount">{money(dashPeriodStats.sales)}</strong>
                </div>
                <div className="dash-kpi-meta-list">
                  <div className="dash-kpi-meta-row">
                    <span>বিক্রয় মুনাফা:</span>
                    <b style={{ color: '#059669' }}>+{money(dashPeriodStats.grossProfit)}</b>
                  </div>
                  <div className="dash-kpi-meta-row">
                    <span>মোট ক্রয়:</span>
                    <b style={{ color: '#b45309' }}>{money(periodTotalPurchase)}</b>
                  </div>
                </div>
              </div>

              {/* Card 2: Net Profit */}
              <div
                className="dash-kpi-card"
                role="button"
                tabIndex={0}
                onClick={() => setDashDetailModal('net_profit')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDashDetailModal('net_profit'); }}
              >
                <div className="dash-kpi-top">
                  <div className={`stat-icon ${dashPeriodStats.netProfit >= 0 ? 'green' : 'orange'}`}>
                    <Activity />
                  </div>
                  <span className="dash-kpi-badge">বিস্তারিত →</span>
                </div>
                <div className="dash-kpi-body">
                  <span className="dash-kpi-label">
                    {dashPreset === 'all'
                      ? 'প্রকৃত নিট মুনাফা'
                      : `নির্বাচিত সময়ের নিট ${dashPeriodStats.netProfit >= 0 ? 'লাভ' : 'ক্ষতি'}`}
                  </span>
                  <strong
                    className="dash-kpi-amount"
                    style={{ color: dashPeriodStats.netProfit >= 0 ? '#059669' : '#dc2626' }}
                  >
                    {dashPeriodStats.netProfit >= 0 ? '+' : ''}{money(dashPeriodStats.netProfit)}
                  </strong>
                </div>
                <div className="dash-kpi-meta-list">
                  <div className="dash-kpi-meta-row">
                    <span>লাভের হার:</span>
                    <b style={{ color: '#0f766e' }}>
                      {dashPeriodStats.sales > 0
                        ? `${((dashPeriodStats.netProfit / dashPeriodStats.sales) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </b>
                  </div>
                  <div className="dash-kpi-meta-row">
                    <span>অতিরিক্ত খরচ:</span>
                    <b style={{ color: '#dc2626' }}>{money(dashPeriodStats.expenses)}</b>
                  </div>
                </div>
              </div>

              {/* Card 3: Total Purchase & Extra Expenses */}
              <div
                className="dash-kpi-card"
                role="button"
                tabIndex={0}
                onClick={() => setDashDetailModal('purchases')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDashDetailModal('purchases'); }}
              >
                <div className="dash-kpi-top">
                  <div className="stat-icon orange"><ArrowDownLeft /></div>
                  <span className="dash-kpi-badge">বিস্তারিত →</span>
                </div>
                <div className="dash-kpi-body">
                  <span className="dash-kpi-label">মোট ক্রয় ও অতিরিক্ত খরচ</span>
                  <strong className="dash-kpi-amount">
                    {money(periodTotalPurchase + dashPeriodStats.expenses)}
                  </strong>
                </div>
                <div className="dash-kpi-meta-list">
                  <div
                    className="dash-kpi-meta-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDashDetailModal('purchases');
                    }}
                    title="মোট ক্রয়ের বিস্তারিত দেখুন"
                  >
                    <span>মোট ক্রয়:</span>
                    <b style={{ color: '#b45309', textDecoration: 'underline dotted' }}>
                      {money(periodTotalPurchase)}
                    </b>
                  </div>
                  <div
                    className="dash-kpi-meta-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDashDetailModal('expenses');
                    }}
                    title="অতিরিক্ত খরচের বিস্তারিত দেখুন"
                  >
                    <span>অতিরিক্ত খরচ:</span>
                    <b style={{ color: '#dc2626', textDecoration: 'underline dotted' }}>
                      {money(dashPeriodStats.expenses)}
                    </b>
                  </div>
                </div>
              </div>

              {/* Card 4: Current Balance with Capital */}
              <div
                className="dash-kpi-card featured-balance"
                role="button"
                tabIndex={0}
                onClick={() => setDashDetailModal('balance')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDashDetailModal('balance'); }}
              >
                <div className="dash-kpi-top">
                  <div className="stat-icon purple"><Wallet /></div>
                  <span className="dash-kpi-badge">বিস্তারিত →</span>
                </div>
                <div className="dash-kpi-body">
                  <span className="dash-kpi-label" style={{ color: '#5b21b6' }}>
                    মূলধন সহ বর্তমান ব্যালান্স
                  </span>
                  <strong className="dash-kpi-amount" style={{ color: '#0f766e' }}>
                    {money(dashPreset === 'all' ? cashSummary.availableCash : dashPeriodCash.availableCash)}
                  </strong>
                </div>
                <div className="dash-kpi-meta-list">
                  <div
                    className="dash-kpi-meta-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDashDetailModal('investments');
                    }}
                    title="মূলধনের বিস্তারিত দেখুন"
                  >
                    <span>মূলধন:</span>
                    <b style={{ color: '#6d28d9', textDecoration: 'underline dotted' }}>
                      {money(dashPreset === 'all' ? cashSummary.totalInvestments : dashPeriodStats.investments)}
                    </b>
                  </div>
                  <div
                    className="dash-kpi-meta-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDashDetailModal('net_profit');
                    }}
                    title="নিট লাভের বিস্তারিত দেখুন"
                  >
                    <span>নিট লাভ:</span>
                    <b style={{ color: '#059669', textDecoration: 'underline dotted' }}>
                      +
                      {money(dashPreset === 'all' ? cashSummary.netProfit : dashPeriodStats.netProfit)}
                    </b>
                  </div>
                  <div
                    className="dash-kpi-meta-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDashDetailModal('withdrawals');
                    }}
                    title="কে কবে কত টাকা উত্তোলন করেছে দেখুন"
                  >
                    <span>উত্তোলন:</span>
                    <b style={{ color: '#b91c1c', textDecoration: 'underline dotted' }}>
                      -
                      {money(
                        dashPreset === 'all'
                          ? cashSummary.totalWithdrawals + cashSummary.totalLoans
                          : dashPeriodStats.withdrawals + dashPeriodStats.loans
                      )}
                    </b>
                  </div>
                </div>
              </div>
            </div>

            {/* INTERACTIVE 6-BUTTON BALANCE, WITHDRAWAL, PURCHASE & EXPENSE BREAKDOWN PANEL */}
            <div className="dash-breakdown-panel">
              <div className="dash-breakdown-head">
                <div className="dash-breakdown-title">
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: '#ccfbf1',
                      color: '#0f766e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Wallet size={18} />
                  </div>
                  <div>
                    <strong>মূলধন সহ বর্তমান ব্যালান্স ও খরচের পূর্ণাঙ্গ হিসাব</strong>
                    <small>যেকোনো বাটনে চাপ দিলে কে, কবে, কত টাকা লেনদেন করেছে তার বিস্তারিত তালিকা দেখাবে</small>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDashDetailModal('balance')}
                  style={{
                    background: '#0d9488',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 13px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span>বর্তমান ব্যালান্স: {money(cashSummary.availableCash)}</span>
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="dash-breakdown-grid">
                {/* Button 1: Total Capital (Investments) */}
                <button
                  type="button"
                  className="dash-breakdown-btn"
                  style={{ borderColor: '#ddd6fe', background: '#ffffff' }}
                  onClick={() => setDashDetailModal('investments')}
                >
                  <div className="dash-breakdown-btn-top">
                    <span className="dash-breakdown-btn-label" style={{ color: '#5b21b6' }}>
                      মোট মূলধন (বিনিয়োগ)
                    </span>
                    <span className="dash-breakdown-btn-arrow" style={{ background: '#f3e8ff', color: '#6d28d9' }}>
                      বিস্তারিত →
                    </span>
                  </div>
                  <strong className="dash-breakdown-btn-val" style={{ color: '#6d28d9' }}>
                    {money(cashSummary.totalInvestments)}
                  </strong>
                  <span className="dash-breakdown-btn-hint">কে কবে কত মূলধন দিয়েছে দেখুন</span>
                </button>

                {/* Button 2: Total Net Profit */}
                <button
                  type="button"
                  className="dash-breakdown-btn"
                  style={{ borderColor: '#bbf7d0', background: '#ffffff' }}
                  onClick={() => setDashDetailModal('net_profit')}
                >
                  <div className="dash-breakdown-btn-top">
                    <span className="dash-breakdown-btn-label" style={{ color: '#065f46' }}>
                      সর্বমোট নিট মুনাফা (+)
                    </span>
                    <span className="dash-breakdown-btn-arrow" style={{ background: '#dcfce7', color: '#047857' }}>
                      বিস্তারিত →
                    </span>
                  </div>
                  <strong className="dash-breakdown-btn-val" style={{ color: '#059669' }}>
                    {cashSummary.netProfit >= 0 ? '+' : ''}{money(cashSummary.netProfit)}
                  </strong>
                  <span className="dash-breakdown-btn-hint">লাভের হিসাব ও অংশীদার ভাগ দেখুন</span>
                </button>

                {/* Button 3: Total Withdrawals & Loans */}
                <button
                  type="button"
                  className="dash-breakdown-btn"
                  style={{ borderColor: '#fecaca', background: '#fffdfd' }}
                  onClick={() => setDashDetailModal('withdrawals')}
                >
                  <div className="dash-breakdown-btn-top">
                    <span className="dash-breakdown-btn-label" style={{ color: '#991b1b' }}>
                      মোট উত্তোলন ও লোন (−)
                    </span>
                    <span className="dash-breakdown-btn-arrow" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                      বিস্তারিত →
                    </span>
                  </div>
                  <strong className="dash-breakdown-btn-val" style={{ color: '#dc2626' }}>
                    -{money(cashSummary.totalWithdrawals + cashSummary.totalLoans)}
                  </strong>
                  <span className="dash-breakdown-btn-hint">কবে কে কত টাকা উত্তোলন করেছে দেখুন</span>
                </button>

                {/* Button 4: Current Balance with Capital */}
                <button
                  type="button"
                  className="dash-breakdown-btn"
                  style={{ borderColor: '#34d399', background: '#ecfdf5' }}
                  onClick={() => setDashDetailModal('balance')}
                >
                  <div className="dash-breakdown-btn-top">
                    <span className="dash-breakdown-btn-label" style={{ color: '#065f46' }}>
                      মূলধন সহ বর্তমান ব্যালান্স
                    </span>
                    <span className="dash-breakdown-btn-arrow" style={{ background: '#a7f3d0', color: '#065f46' }}>
                      বিস্তারিত →
                    </span>
                  </div>
                  <strong className="dash-breakdown-btn-val" style={{ color: '#047857' }}>
                    {money(cashSummary.availableCash)}
                  </strong>
                  <span className="dash-breakdown-btn-hint" style={{ color: '#047857' }}>
                    মূলধন + লাভ − উত্তোলন = নিট ব্যালান্স
                  </span>
                </button>

                {/* Button 5: Total Purchase */}
                <button
                  type="button"
                  className="dash-breakdown-btn"
                  style={{ borderColor: '#fde68a', background: '#fffbeb' }}
                  onClick={() => setDashDetailModal('purchases')}
                >
                  <div className="dash-breakdown-btn-top">
                    <span className="dash-breakdown-btn-label" style={{ color: '#92400e' }}>
                      সর্বমোট ক্রয় (মাল কেনা)
                    </span>
                    <span className="dash-breakdown-btn-arrow" style={{ background: '#fef3c7', color: '#b45309' }}>
                      বিস্তারিত →
                    </span>
                  </div>
                  <strong className="dash-breakdown-btn-val" style={{ color: '#b45309' }}>
                    {money(overallTotalPurchase)}
                  </strong>
                  <span className="dash-breakdown-btn-hint" style={{ color: '#92400e' }}>
                    ক্রয়কৃত পণ্য ও কেনা খরচের তালিকা
                  </span>
                </button>

                {/* Button 6: Total Extra Expense */}
                <button
                  type="button"
                  className="dash-breakdown-btn"
                  style={{ borderColor: '#fecdd3', background: '#fff1f2' }}
                  onClick={() => setDashDetailModal('expenses')}
                >
                  <div className="dash-breakdown-btn-top">
                    <span className="dash-breakdown-btn-label" style={{ color: '#9f1239' }}>
                      সর্বমোট অতিরিক্ত খরচ
                    </span>
                    <span className="dash-breakdown-btn-arrow" style={{ background: '#ffe4e6', color: '#be123c' }}>
                      বিস্তারিত →
                    </span>
                  </div>
                  <strong className="dash-breakdown-btn-val" style={{ color: '#e11d48' }}>
                    {money(cashSummary.totalExpenses)}
                  </strong>
                  <span className="dash-breakdown-btn-hint" style={{ color: '#9f1239' }}>
                    কবে কী বাবদ অতিরিক্ত খরচ হয়েছে দেখুন
                  </span>
                </button>
              </div>
            </div>

            {/* WEEKLY & MONTHLY SALES & BUSINESS GROWTH TREND CHART (RECHARTS) */}
            <SalesTrendChartSection
              entries={entries}
              products={products}
              onInspectSales={() => setDashDetailModal('sales')}
              onInspectProfit={() => setDashDetailModal('net_profit')}
            />

            {/* DAY-BY-DAY SALES, PROFIT/LOSS & EXPENSE LEDGER (TODAY + ALL PAST DAYS) */}
            <div className="panel">
              <div className="panel-head">
                <div className="panel-head-info">
                  <h3>প্রতিদিনের বিক্রয়, খরচ ও লাভ-ক্ষতির বিস্তারিত হিসাব (আজকের সহ বিগত সকল দিন)</h3>
                  <p>যেকোনো দিনের সারিতে ক্লিক করে ওই দিনের সকল বিক্রয়, লাভ-ক্ষতি ও লেনদেন আলাদাভাবে দেখুন</p>
                </div>
                <div className="inline-actions">
                  <div className="search" style={{ minHeight: '36px' }}>
                    <Search size={15} />
                    <input
                      placeholder="তারিখ খুঁজুন (যেমন: 2026-10)..."
                      value={dashDaySearch}
                      onChange={(e) => setDashDaySearch(e.target.value)}
                    />
                    {dashDaySearch && (
                      <button
                        type="button"
                        onClick={() => setDashDaySearch('')}
                        style={{ border: 0, background: 'transparent', color: '#94a3b8', padding: '0 4px', display: 'flex' }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>তারিখ ও দিন</th>
                      <th>মোট বিক্রয় (Sales)</th>
                      <th>মোট ক্রয় (COGS)</th>
                      <th>অতিরিক্ত খরচ</th>
                      <th>নিট লাভ / ক্ষতি</th>
                      <th>বিনিয়োগ / উত্তোলন</th>
                      <th>বিস্তারিত</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyBreakdowns.map((day) => {
                      const isSelectedDay =
                        (dashPreset === 'today' && day.isToday) ||
                        (dashPreset === 'yesterday' && day.isYesterday) ||
                        (dashPreset === 'single_day' && dashSingleDate === day.date);

                      const dayTotalPurchase =
                        day.purchases > 0 && day.cogs !== day.purchases
                          ? Math.round((day.cogs + day.purchases) * 100) / 100
                          : Math.max(day.cogs, day.purchases);

                      return (
                        <tr
                          key={day.date}
                          className={isSelectedDay ? 'selected-day-row' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            if (day.isToday) {
                              setDashPreset('today');
                            } else if (day.isYesterday) {
                              setDashPreset('yesterday');
                            } else {
                              setDashSingleDate(day.date);
                              setDashPreset('single_day');
                            }
                          }}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <b>{dateLabel(day.date)}</b>
                              {day.isToday && (
                                <span className="badge posted">আজ</span>
                              )}
                              {day.isYesterday && (
                                <span className="badge draft">গতকাল</span>
                              )}
                            </div>
                            <span className="cell-sub">{day.date} • {day.totalEntriesCount}টি এন্ট্রি</span>
                          </td>
                          <td>
                            <b style={{ color: '#0f172a' }}>{money(day.sales)}</b>
                            <span className="cell-sub">{day.salesCount}টি বিক্রয়</span>
                          </td>
                          <td>
                            <span style={{ color: '#b45309', fontWeight: 600 }}>{money(dayTotalPurchase)}</span>
                          </td>
                          <td>
                            <span style={{ color: day.expenses > 0 ? '#dc2626' : '#64748b', fontWeight: day.expenses > 0 ? 600 : 400 }}>
                              {money(day.expenses)}
                            </span>
                          </td>
                          <td>
                            <b
                              style={{
                                color:
                                  day.netProfit > 0
                                    ? '#059669'
                                    : day.netProfit < 0
                                    ? '#dc2626'
                                    : '#475569',
                                fontSize: '13.5px',
                              }}
                            >
                              {day.netProfit > 0 ? '+' : ''}
                              {money(day.netProfit)}
                            </b>
                            <span className="cell-sub">
                              {day.netProfit > 0
                                ? 'লাভ (Profit)'
                                : day.netProfit < 0
                                ? 'ক্ষতি (Loss)'
                                : 'সমান / শূন্য'}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '12px' }}>
                              {day.investments > 0 && (
                                <span style={{ color: '#7e22ce', display: 'block' }}>
                                  +বিনিয়োগ: {money(day.investments)}
                                </span>
                              )}
                              {day.withdrawals > 0 && (
                                <span style={{ color: '#b91c1c', display: 'block' }}>
                                  -উত্তোলন: {money(day.withdrawals)}
                                </span>
                              )}
                              {day.purchases > 0 && (
                                <span style={{ color: '#0369a1', display: 'block' }}>
                                  স্টক ক্রয়: {money(day.purchases)}
                                </span>
                              )}
                              {day.investments === 0 && day.withdrawals === 0 && day.purchases === 0 && (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </div>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`date-preset-btn ${isSelectedDay ? 'active' : ''}`}
                              style={{ padding: '5px 10px', fontSize: '11.5px' }}
                              onClick={() => {
                                if (isSelectedDay) {
                                  setDashPreset('all');
                                } else if (day.isToday) {
                                  setDashPreset('today');
                                } else if (day.isYesterday) {
                                  setDashPreset('yesterday');
                                } else {
                                  setDashSingleDate(day.date);
                                  setDashPreset('single_day');
                                }
                              }}
                            >
                              {isSelectedDay ? 'নির্বাচিত ✓' : 'দেখুন →'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SELECTED PERIOD / DAY TRANSACTIONS LIST ON DASHBOARD */}
            <div className="panel">
              <div className="panel-head">
                <div className="panel-head-info">
                  <h3>{dashPeriodLabel} — লেনদেন তালিকা ({dashDisplayEntries.length}টি)</h3>
                  <p>নির্বাচিত দিন বা সময়ের প্রতিটি বিক্রয়, খরচ, বিনিয়োগ ও উত্তোলনের পূর্ণাঙ্গ বিবরণ</p>
                </div>
                <button className="text-btn" onClick={() => setTab('transactions')}>
                  সকল লেনদেন পেজে যান →
                </button>
              </div>

              <div className="filter-bar" style={{ marginBottom: '14px' }}>
                <button
                  type="button"
                  className={`tab-pill ${dashTypeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setDashTypeFilter('all')}
                >
                  <span>সকল</span>
                  <span className="pill-count">{dashPeriodEntries.length}</span>
                </button>
                {filterPills.map(({ key, label }) => {
                  const c = dashPeriodEntries.filter((e) => e.type === key).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`tab-pill ${dashTypeFilter === key ? 'active' : ''}`}
                      onClick={() => setDashTypeFilter(key)}
                    >
                      <span>{label}</span>
                      <span className="pill-count">{c}</span>
                    </button>
                  );
                })}
              </div>

              <EntryTable
                rows={dashDisplayEntries.slice(0, 15)}
                investors={investors}
                products={products}
                admin={admin}
                selectedIds={selectedIds}
                onToggleSelect={(id) =>
                  setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
                }
                onEdit={handleOpenEdit}
                onView={(e) => setViewRecordModal(e)}
                onDelete={handleInitiateDelete}
                onVoid={(e) => { setShowVoidModal(e); setVoidReasonInput(''); }}
              />
            </div>

            {/* CONSOLIDATED BUSINESS CASH BALANCE & PARTNER ACCOUNTS */}
            <div className="panel">
              <div className="panel-head">
                <div className="panel-head-info">
                  <h3>প্রতিষ্ঠানের সর্বমোট ক্যাশ ব্যালেন্স ও অংশীদারদের হিসাব (Partner Equity & Cash)</h3>
                  <p>
                    নগদ ব্যালেন্স সূত্র: মোট মূলধন ({money(cashSummary.totalInvestments)}) + সর্বমোট নিট লাভ ({money(cashSummary.netProfit)}) − মোট উত্তোলন ({money(cashSummary.totalWithdrawals)}) = <b style={{ color: '#0d9488' }}>{money(cashSummary.availableCash)}</b>
                  </p>
                </div>
                <button className="text-btn" onClick={() => setTab('investors')}>
                  অংশীদার লেজার →
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>অংশীদারের নাম</th>
                      <th>স্থির মূলধন (লককৃত)</th>
                      <th>শেয়ার %</th>
                      <th>বরাদ্দকৃত লাভ</th>
                      <th>মোট উত্তোলন</th>
                      <th>উত্তোলনযোগ্য লাভ</th>
                      <th>অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerAccounts.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <b>{p.name}</b>
                          {p.demo && <span className="badge demo" style={{ marginLeft: '6px' }}>ডেমো</span>}
                        </td>
                        <td>{money(p.capital)}</td>
                        <td>
                          <b style={{ color: '#087f70' }}>{p.share.toFixed(2)}%</b>
                        </td>
                        <td style={{ color: '#07845c', fontWeight: 600 }}>{money(p.allocatedProfit)}</td>
                        <td style={{ color: '#b42318' }}>{money(p.withdrawals)}</td>
                        <td>
                          <b style={{ color: '#0d9488', fontSize: '14px' }}>{money(p.withdrawableLimit)}</b>
                          <span className="cell-sub">মোট ইক্যুইটি: {money(p.accountBalance)}</span>
                        </td>
                        <td>
                          <div className="action-group">
                            <button
                              className="action-btn"
                              title="বিস্তারিত হিসাব দেখুন"
                              onClick={() => setViewPartnerModal(p)}
                            >
                              <Eye size={16} /> বিস্তারিত
                            </button>
                            {admin && (
                              <button
                                className="action-btn danger"
                                title="অংশীদার ডিলিট"
                                onClick={() => setShowInvestorDeleteModal(p)}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!partnerAccounts.length && (
                      <tr>
                        <td colSpan={7} className="empty">কোনো অংশীদার পাওয়া যায়নি</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: TRANSACTIONS & DELETE SYSTEM */}
        {tab === 'transactions' && (
          <div className="panel">
            <div className="panel-head">
              <div className="inline-actions" style={{ width: '100%' }}>
                <div className="search">
                  <Search size={16} />
                  <input
                    placeholder="খুঁজুন…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{ border: 0, background: 'transparent', color: '#94a3b8', padding: '0 4px', display: 'flex', cursor: 'pointer' }}
                      title="মুছুন"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {admin && (
                  <>
                    <button
                      className="primary"
                      onClick={() => {
                        setEditingEntry(null);
                        setEntryForm({
                          type: 'sale',
                          seller: (currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib') as 'Rakib' | 'Limon',
                          title: '',
                          amount: '',
                          profit: '',
                          cost: '',
                          date: today(),
                          status: 'posted',
                          investorId: '',
                          productId: '',
                          quantity: '',
                          unitPrice: '',
                          unitCost: '',
                          category: '',
                          notes: '',
                        });
                        setShowEntryModal(true);
                      }}
                    >
                      <Plus size={17} /> নতুন যোগ
                    </button>
                    {selectedIds.length > 0 && (
                      <button className="danger" onClick={() => setShowBulkDeleteModal(true)}>
                        <Trash2 size={16} /> বাল্ক ডিলিট ({selectedIds.length})
                      </button>
                    )}
                  </>
                )}
                <button className="secondary" onClick={exportCsv}>
                  <Download size={17} /> CSV
                </button>
              </div>
            </div>

            {/* Filter Section & Single-Row Horizontal Carousel */}
            <div className="filter-section">
              <div className="filter-header">
                <span className="filter-title">
                  <Filter size={15} /> ধরন অনুযায়ী ফিল্টার:
                </span>
                <span className="filter-count-badge">
                  {typeFilter === 'all' ? 'সকল লেনদেন' : typeLabels[typeFilter as RecordType]} ({filtered.length}টি)
                  {(startDateFilter || endDateFilter) && (
                    <span className="date-filter-indicator">
                      • {startDateFilter ? dateLabel(startDateFilter) : 'শুরু'} হতে {endDateFilter ? dateLabel(endDateFilter) : 'বর্তমান'}
                    </span>
                  )}
                </span>
              </div>

              <div className="filter-bar">
                <button
                  type="button"
                  className={`tab-pill ${typeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setTypeFilter('all')}
                >
                  <span>সকল লেনদেন</span>
                  <span className="pill-count">{entries.length}</span>
                </button>
                {filterPills.map(({ key, label }) => {
                  const count = entries.filter((e) => e.type === key).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`tab-pill ${typeFilter === key ? 'active' : ''}`}
                      onClick={() => setTypeFilter(key)}
                    >
                      <span>{label}</span>
                      <span className="pill-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Date-Range Picker Section */}
              <div className="date-filter-section">
                <div className="date-filter-header">
                  <span className="filter-title">
                    <Calendar size={15} /> তারিখ অনুযায়ী ফিল্টার (Date Range):
                  </span>
                  {(startDateFilter || endDateFilter) && (
                    <button
                      type="button"
                      className="date-clear-btn"
                      onClick={() => {
                        setStartDateFilter('');
                        setEndDateFilter('');
                      }}
                      title="তারিখ ফিল্টার মুছুন"
                    >
                      <X size={13} /> ফিল্টার মুছুন
                    </button>
                  )}
                </div>

                {/* Row 1: Start and End Date Inputs */}
                <div className="date-inputs-row">
                  <div className="date-input-group">
                    <span className="input-group-tag">শুরুর তারিখ:</span>
                    <input
                      id="tx-start-date"
                      type="date"
                      value={startDateFilter}
                      onChange={(e) => setStartDateFilter(e.target.value)}
                      title="শুরুর তারিখ"
                    />
                    {startDateFilter && (
                      <button
                        type="button"
                        className="input-clear-icon"
                        onClick={() => setStartDateFilter('')}
                        title="শুরু তারিখ মুছুন"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="date-input-group">
                    <span className="input-group-tag">শেষ তারিখ:</span>
                    <input
                      id="tx-end-date"
                      type="date"
                      value={endDateFilter}
                      onChange={(e) => setEndDateFilter(e.target.value)}
                      title="শেষ তারিখ"
                    />
                    {endDateFilter && (
                      <button
                        type="button"
                        className="input-clear-icon"
                        onClick={() => setEndDateFilter('')}
                        title="শেষ তারিখ মুছুন"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Quick Presets Bar (Always visible, responsive wrap, no cut-off!) */}
                <div className="date-presets-row">
                  <span className="presets-label">দ্রুত ফিল্টার:</span>
                  <div className="date-presets-wrapper">
                    <button
                      type="button"
                      className={`date-preset-btn ${!startDateFilter && !endDateFilter ? 'active' : ''}`}
                      onClick={() => {
                        setStartDateFilter('');
                        setEndDateFilter('');
                      }}
                    >
                      সব তারিখ (সকল রেকর্ড)
                    </button>
                    <button
                      type="button"
                      className={`date-preset-btn ${startDateFilter === today() && endDateFilter === today() ? 'active' : ''}`}
                      onClick={() => {
                        const t = today();
                        setStartDateFilter(t);
                        setEndDateFilter(t);
                      }}
                    >
                      আজকে
                    </button>
                    <button
                      type="button"
                      className={`date-preset-btn ${startDateFilter === getNDaysAgo(6) && endDateFilter === today() ? 'active' : ''}`}
                      onClick={() => {
                        setStartDateFilter(getNDaysAgo(6));
                        setEndDateFilter(today());
                      }}
                    >
                      গত ৭ দিন
                    </button>
                    <button
                      type="button"
                      className={`date-preset-btn ${startDateFilter === getStartOfMonth() && endDateFilter === today() ? 'active' : ''}`}
                      onClick={() => {
                        setStartDateFilter(getStartOfMonth());
                        setEndDateFilter(today());
                      }}
                    >
                      চলতি মাস
                    </button>
                    <button
                      type="button"
                      className={`date-preset-btn ${startDateFilter === getNDaysAgo(29) && endDateFilter === today() ? 'active' : ''}`}
                      onClick={() => {
                        setStartDateFilter(getNDaysAgo(29));
                        setEndDateFilter(today());
                      }}
                    >
                      গত ৩০ দিন
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {sellerFilter !== 'all' && (
              <div
                style={{
                  margin: '12px 0',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: sellerFilter === 'Rakib' ? '#eff6ff' : '#faf5ff',
                  border: sellerFilter === 'Rakib' ? '2px solid #93c5fd' : '2px solid #d8b4fe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: sellerFilter === 'Rakib' ? '#2563eb' : '#9333ea',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '15px',
                    }}
                  >
                    {sellerFilter === 'Rakib' ? 'রা' : 'লি'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: sellerFilter === 'Rakib' ? '#1e3a8a' : '#581c87' }}>
                      {sellerFilter === 'Rakib' ? '👤 রাকিবের (Rakib) একক বিক্রয় হিসাব' : '👤 লিমনের (Limon) একক বিক্রয় হিসাব'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      মোট {toBengaliNumerals(sellerFilter === 'Rakib' ? txSellerSummary.rakib.salesCount : txSellerSummary.limon.salesCount)}টি সেল রেকর্ড প্রদর্শিত হচ্ছে
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>মোট বিক্রয় (ক্যাশ জমা):</span>
                    <strong style={{ fontSize: '18px', color: sellerFilter === 'Rakib' ? '#1d4ed8' : '#7e22ce' }}>
                      {money(sellerFilter === 'Rakib' ? txSellerSummary.rakib.totalSales : txSellerSummary.limon.totalSales)}
                    </strong>
                  </div>
                  <div style={{ textAlign: 'right', borderLeft: '1px solid #cbd5e1', paddingLeft: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>অর্জিত নিট লাভ:</span>
                    <strong style={{ fontSize: '16px', color: '#059669' }}>
                      +{money(sellerFilter === 'Rakib' ? txSellerSummary.rakib.grossProfit : txSellerSummary.limon.grossProfit)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSellerFilter('all')}
                    style={{
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: '#475569',
                    }}
                  >
                    ✕ ফিল্টার মুছুন
                  </button>
                </div>
              </div>
            )}
            <EntryTable
              rows={filtered}
              investors={investors}
              products={products}
              admin={admin}
              selectedIds={selectedIds}
              onToggleSelect={(id) =>
                setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
              }
              onEdit={handleOpenEdit}
              onView={(e) => setViewRecordModal(e)}
              onDelete={handleInitiateDelete}
              onVoid={(e) => { setShowVoidModal(e); setVoidReasonInput(''); }}
            />
          </div>
        )}

        {/* TAB 2.5: SELLER SALES & DAILY RECONCILIATION (রাকিব বনাম লিমন) */}
        {tab === 'seller_sales' && (
          <div className="panel" style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            {/* Header & Quick Action Buttons */}
            <div className="welcome" style={{ marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={22} style={{ color: '#2563eb' }} />
                  বিক্রেতা অনুযায়ী প্রতিদিনের হিসাব (রাকিব বনাম লিমন)
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  রাকিব ও লিমনের প্রতিদিনের আলাদা বিক্রয়, মোট লাভ এবং ক্যাশ ড্রয়ার মেলানোর লাইভ বিবরণ
                </p>
              </div>

              <div className="welcome-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
                {settings.enableCameraScan !== false && (
                  <button
                    type="button"
                    className="primary"
                    style={{ background: 'linear-gradient(135deg, #059669, #0d9488)', border: 'none' }}
                    onClick={() => setShowCameraSaleModal(true)}
                  >
                    <Camera size={16} /> ক্যামেরা স্ক্যান সেল
                  </button>
                )}
                {settings.enableDrawingPad !== false && (
                  <button
                    type="button"
                    className="secondary"
                    style={{ borderColor: '#6366f1', color: '#4f46e5', background: '#eef2ff' }}
                    onClick={() => setShowDrawingSaleModal(true)}
                  >
                    <PenTool size={16} /> ড্রইং প্যাড সেল
                  </button>
                )}
                {admin && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setEditingEntry(null);
                      setEntryForm({
                        type: 'sale',
                        seller: (currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib') as 'Rakib' | 'Limon',
                        title: '',
                        amount: '',
                        profit: '',
                        cost: '',
                        date: today(),
                        status: 'posted',
                        investorId: '',
                        productId: '',
                        quantity: '',
                        unitPrice: '',
                        unitCost: '',
                        category: '',
                        notes: '',
                      });
                      setShowEntryModal(true);
                    }}
                  >
                    <Plus size={16} /> নতুন বিক্রয় যোগ
                  </button>
                )}
              </div>
            </div>

            {/* TODAY'S LIVE SALES COUNTER (আজকের সরাসরি সেল ও ক্যাশ মেলানো) */}
            <div
              style={{
                marginBottom: '18px',
                padding: '16px 20px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 50%, #faf5ff 100%)',
                border: '1.5px solid #bfdbfe',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} style={{ color: '#2563eb' }} />
                  <strong style={{ fontSize: '15px', color: '#1e3a8a' }}>
                    📅 আজকের লাইভ বিক্রয় ও ক্যাশ কাউন্টার ({dateLabel(todayStr)})
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', background: '#ffffff', padding: '4px 12px', borderRadius: '20px', border: '1px solid #cbd5e1', fontWeight: 700, color: '#0f172a' }}>
                    আজকের সর্বমোট সেল: <strong style={{ color: '#059669' }}>{money(todaySellerSummary.rakib.todaySales + todaySellerSummary.limon.todaySales)}</strong> ({toBengaliNumerals(todaySellerSummary.rakib.todayCount + todaySellerSummary.limon.todayCount)}টি সেল)
                  </span>
                </div>
              </div>

              {/* Today Metric 4-Boxes Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                {/* Rakib Today Box */}
                <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #bfdbfe' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>👤 রাকিবের আজকের বিক্রয়</span>
                    <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {toBengaliNumerals(todaySellerSummary.rakib.todayCount)}টি সেল
                    </span>
                  </div>
                  <strong style={{ fontSize: '20px', color: '#1d4ed8', display: 'block' }}>
                    {money(todaySellerSummary.rakib.todaySales)}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                    আজকের নিট লাভ: +{money(todaySellerSummary.rakib.grossProfit)}
                  </span>
                </div>

                {/* Limon Today Box */}
                <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #d8b4fe' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#7e22ce' }}>👤 লিমনের আজকের বিক্রয়</span>
                    <span style={{ fontSize: '11px', background: '#f3e8ff', color: '#6b21a8', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {toBengaliNumerals(todaySellerSummary.limon.todayCount)}টি সেল
                    </span>
                  </div>
                  <strong style={{ fontSize: '20px', color: '#7e22ce', display: 'block' }}>
                    {money(todaySellerSummary.limon.todaySales)}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                    আজকের নিট লাভ: +{money(todaySellerSummary.limon.grossProfit)}
                  </span>
                </div>

                {/* Today Difference & Drawer Status */}
                <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    ⚖️ আজকের ক্যাশ ড্রয়ার মেলানো
                  </span>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    {todaySellerSummary.difference === 0 ? (
                      <span style={{ color: '#059669' }}>উভয় বিক্রেতার সেল সমান সমান</span>
                    ) : (
                      <>
                        <span style={{ color: todaySellerSummary.leader === 'Rakib' ? '#1d4ed8' : '#7e22ce' }}>
                          {todaySellerSummary.leader === 'Rakib' ? 'রাকিব' : 'লিমন'}
                        </span>{' '}
                        {money(todaySellerSummary.difference)} বেশি
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                    ড্রয়ারে রাকিবের {money(todaySellerSummary.rakib.todaySales)} ও লিমনের {money(todaySellerSummary.limon.todaySales)} জমা
                  </span>
                </div>

                {/* Today Total Profit */}
                <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #86efac' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', display: 'block', marginBottom: '4px' }}>
                    📊 আজকের যৌথ মোট লাভ
                  </span>
                  <strong style={{ fontSize: '20px', color: '#059669', display: 'block' }}>
                    +{money(todaySellerSummary.totalGrossProfit)}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                    মোট বিক্রয়ের ওপর গড় লাভ
                  </span>
                </div>
              </div>
            </div>

            {/* OVERALL COMPARISON CARDS (রাকিব বনাম লিমন সর্বমোট প্রোফাইল) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '16px',
                marginBottom: '20px',
              }}
            >
              {/* RAKIB OVERALL CARD */}
              <div
                style={{
                  background: '#ffffff',
                  border: '2px solid #bfdbfe',
                  borderRadius: '14px',
                  padding: '16px',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {adminAvatars.rakib ? (
                      <img
                        src={adminAvatars.rakib}
                        alt="রাকিব"
                        style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #3b82f6' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: '#2563eb',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '18px',
                        }}
                      >
                        রা
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '16px', color: '#1e3a8a' }}>রাকিব (Rakib)</strong>
                        {allTimeSellerSummary.leader === 'Rakib' && allTimeSellerSummary.rakib.totalSales > 0 && (
                          <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            👑 সার্বিক শীর্ষে
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>অংশীদার ও বিক্রেতা</span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#2563eb',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    {allTimeSellerSummary.rakib.sharePercent.toFixed(1)}% সেল শেয়ার
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>সর্বমোট বিক্রয়:</span>
                    <strong style={{ fontSize: '18px', color: '#1d4ed8', display: 'block', marginTop: '2px' }}>
                      {money(allTimeSellerSummary.rakib.totalSales)}
                    </strong>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      {toBengaliNumerals(allTimeSellerSummary.rakib.salesCount)}টি সেল রসিদ
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>অর্জিত মোট লাভ:</span>
                    <strong style={{ fontSize: '18px', color: '#059669', display: 'block', marginTop: '2px' }}>
                      +{money(allTimeSellerSummary.rakib.grossProfit)}
                    </strong>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      আজকের সেল: {money(allTimeSellerSummary.rakib.todaySales)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTab('transactions');
                    setTypeFilter('sale');
                    setSellerFilter('Rakib');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #93c5fd',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  🔍 রাকিবের সকল বিক্রয় লেনদেন দেখুন →
                </button>
              </div>

              {/* LIMON OVERALL CARD */}
              <div
                style={{
                  background: '#ffffff',
                  border: '2px solid #e9d5ff',
                  borderRadius: '14px',
                  padding: '16px',
                  boxShadow: '0 2px 8px rgba(147, 51, 234, 0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {adminAvatars.limon ? (
                      <img
                        src={adminAvatars.limon}
                        alt="লিমন"
                        style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #a855f7' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: '#9333ea',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '18px',
                        }}
                      >
                        লি
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '16px', color: '#581c87' }}>লিমন (Limon)</strong>
                        {allTimeSellerSummary.leader === 'Limon' && allTimeSellerSummary.limon.totalSales > 0 && (
                          <span style={{ fontSize: '10px', background: '#f3e8ff', color: '#7e22ce', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            👑 সার্বিক শীর্ষে
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>অংশীদার ও বিক্রেতা</span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#9333ea',
                      background: '#faf5ff',
                      border: '1px solid #d8b4fe',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    {allTimeSellerSummary.limon.sharePercent.toFixed(1)}% সেল শেয়ার
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>সর্বমোট বিক্রয়:</span>
                    <strong style={{ fontSize: '18px', color: '#7e22ce', display: 'block', marginTop: '2px' }}>
                      {money(allTimeSellerSummary.limon.totalSales)}
                    </strong>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      {toBengaliNumerals(allTimeSellerSummary.limon.salesCount)}টি সেল রসিদ
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>অর্জিত মোট লাভ:</span>
                    <strong style={{ fontSize: '18px', color: '#059669', display: 'block', marginTop: '2px' }}>
                      +{money(allTimeSellerSummary.limon.grossProfit)}
                    </strong>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      আজকের সেল: {money(allTimeSellerSummary.limon.todaySales)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTab('transactions');
                    setTypeFilter('sale');
                    setSellerFilter('Limon');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #d8b4fe',
                    background: '#faf5ff',
                    color: '#7e22ce',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  🔍 লিমনের সকল বিক্রয় লেনদেন দেখুন →
                </button>
              </div>
            </div>

            {/* DAILY SALES BREAKDOWN SECTION (প্রতিদিনের দিনভিত্তিক আলাদা বিক্রয় ও হিসাব মেলানো) */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '18px 20px',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
              }}
            >
              {/* Daily Section Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={18} style={{ color: '#0f766e' }} />
                    📅 প্রতিদিনের বিক্রয় তালিকা ও হিসাব মেলানো (Day-by-Day)
                  </h3>
                  <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    কোন তারিখে কে কত টাকা বিক্রি করেছে তা তারিখ অনুযায়ী বিস্তারিত দেখুন
                  </p>
                </div>

                {/* Date Quick Preset Buttons */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`tab-pill ${dailySellerPreset === 'all' && !dailySellerDateFilter ? 'active' : ''}`}
                    onClick={() => { setDailySellerPreset('all'); setDailySellerDateFilter(''); }}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    সব দিন
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${dailySellerPreset === 'today' ? 'active' : ''}`}
                    onClick={() => { setDailySellerPreset('today'); setDailySellerDateFilter(''); }}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    আজকে
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${dailySellerPreset === 'yesterday' ? 'active' : ''}`}
                    onClick={() => { setDailySellerPreset('yesterday'); setDailySellerDateFilter(''); }}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    গতকাল
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${dailySellerPreset === '7d' ? 'active' : ''}`}
                    onClick={() => { setDailySellerPreset('7d'); setDailySellerDateFilter(''); }}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    গত ৭ দিন
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${dailySellerPreset === 'month' ? 'active' : ''}`}
                    onClick={() => { setDailySellerPreset('month'); setDailySellerDateFilter(''); }}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    চলতি মাস
                  </button>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                    <input
                      type="date"
                      value={dailySellerDateFilter}
                      onChange={(e) => {
                        setDailySellerDateFilter(e.target.value);
                        setDailySellerPreset('all');
                      }}
                      style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      title="নির্দিষ্ট তারিখ বেছে নিন"
                    />
                    {dailySellerDateFilter && (
                      <button
                        type="button"
                        onClick={() => setDailySellerDateFilter('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
                        title="ফিল্টার মুছুন"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* View Mode Pills: Both / Rakib / Limon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>ফিল্টার:</span>
                <button
                  type="button"
                  onClick={() => setSellerDailyViewMode('all')}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    border: sellerDailyViewMode === 'all' ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                    background: sellerDailyViewMode === 'all' ? '#f0fdfa' : '#ffffff',
                    color: sellerDailyViewMode === 'all' ? '#0f766e' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  👥 উভয় বিক্রেতার বিক্রয়
                </button>
                <button
                  type="button"
                  onClick={() => setSellerDailyViewMode('Rakib')}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    border: sellerDailyViewMode === 'Rakib' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: sellerDailyViewMode === 'Rakib' ? '#eff6ff' : '#ffffff',
                    color: sellerDailyViewMode === 'Rakib' ? '#1d4ed8' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  👤 শুধু রাকিব
                </button>
                <button
                  type="button"
                  onClick={() => setSellerDailyViewMode('Limon')}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    border: sellerDailyViewMode === 'Limon' ? '1.5px solid #9333ea' : '1px solid #cbd5e1',
                    background: sellerDailyViewMode === 'Limon' ? '#faf5ff' : '#ffffff',
                    color: sellerDailyViewMode === 'Limon' ? '#7e22ce' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  👤 শুধু লিমন
                </button>
              </div>

              {/* Day-by-Day List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredDailySellerSales.map((day) => {
                  const isExpanded = expandedDailyDate === day.date;
                  const dayEntries = day.entries.filter((s) => {
                    if (sellerDailyViewMode === 'Rakib') return getEntrySeller(s) === 'Rakib';
                    if (sellerDailyViewMode === 'Limon') return getEntrySeller(s) === 'Limon';
                    return true;
                  });

                  return (
                    <div
                      key={day.date}
                      style={{
                        background: day.isToday ? '#f0fdfa' : '#f8fafc',
                        borderRadius: '12px',
                        border: day.isToday ? '2px solid #5eead4' : '1px solid #e2e8f0',
                        overflow: 'hidden',
                        transition: 'box-shadow 0.2s ease',
                      }}
                    >
                      {/* Day Header Row */}
                      <div
                        style={{
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '10px',
                          cursor: 'pointer',
                          background: day.isToday ? 'rgba(204, 251, 241, 0.4)' : '#ffffff',
                        }}
                        onClick={() => setExpandedDailyDate(isExpanded ? null : day.date)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                            📅 {dateLabel(day.date)}
                            {day.isToday && (
                              <span style={{ marginLeft: '6px', fontSize: '11px', background: '#ccfbf1', color: '#0f766e', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                আজ
                              </span>
                            )}
                            {day.isYesterday && (
                              <span style={{ marginLeft: '6px', fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                গতকাল
                              </span>
                            )}
                          </span>

                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            ({toBengaliNumerals(day.totalSalesCount)}টি সেল)
                          </span>
                        </div>

                        {/* Mid Stats: Rakib vs Limon */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          {/* Rakib Day Total */}
                          <div style={{ background: '#eff6ff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                            <span style={{ fontSize: '11px', color: '#1e40af', fontWeight: 600 }}>👤 রাকিব: </span>
                            <strong style={{ fontSize: '13px', color: '#1d4ed8' }}>{money(day.rakib.totalSales)}</strong>
                            <small style={{ fontSize: '10px', color: '#60a5fa', marginLeft: '4px' }}>({toBengaliNumerals(day.rakib.salesCount)}টি)</small>
                          </div>

                          {/* Limon Day Total */}
                          <div style={{ background: '#faf5ff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                            <span style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 600 }}>👤 লিমন: </span>
                            <strong style={{ fontSize: '13px', color: '#7e22ce' }}>{money(day.limon.totalSales)}</strong>
                            <small style={{ fontSize: '10px', color: '#c084fc', marginLeft: '4px' }}>({toBengaliNumerals(day.limon.salesCount)}টি)</small>
                          </div>

                          {/* Day Total */}
                          <div style={{ background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                            <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>মোট: </span>
                            <strong style={{ fontSize: '13px', color: '#059669' }}>{money(day.totalSales)}</strong>
                          </div>

                          {/* Day Difference / Drawer indicator */}
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                            {day.difference === 0 ? (
                              '⚖️ সমান'
                            ) : (
                              <>
                                ⚖️ {day.leader === 'Rakib' ? 'রাকিব +' : 'লিমন +'}{money(day.difference)}
                              </>
                            )}
                          </span>

                          {/* Toggle Expand button */}
                          <button
                            type="button"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            {isExpanded ? '▲ বন্ধ করুন' : '▼ রসিদ দেখুন'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Entries for this Day */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 16px', background: '#ffffff' }}>
                          {dayEntries.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '12px', color: '#94a3b8', fontSize: '13px' }}>
                              এই দিনে কোনো বিক্রয় রেকর্ড পাওয়া যায়নি
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>📋 ওইদিনের পৃথক বিক্রয় রসিদের তালিকা:</span>
                                <span>মোট লাভ: +{money(dayEntries.reduce((sum, s) => sum + (s.grossProfit || 0), 0))}</span>
                              </div>

                              {dayEntries.map((sale) => {
                                const seller = getEntrySeller(sale);
                                const isRakib = seller === 'Rakib';
                                const isLimon = seller === 'Limon';

                                return (
                                  <div
                                    key={sale.id}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '8px 12px',
                                      borderRadius: '8px',
                                      background: isRakib ? '#f8faff' : isLimon ? '#fdfaff' : '#f8fafc',
                                      border: isRakib ? '1px solid #dbeafe' : isLimon ? '1px solid #f3e8ff' : '1px solid #e2e8f0',
                                      flexWrap: 'wrap',
                                      gap: '8px',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span
                                        style={{
                                          fontSize: '11px',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontWeight: 700,
                                          background: isRakib ? '#2563eb' : isLimon ? '#9333ea' : '#64748b',
                                          color: '#ffffff',
                                        }}
                                      >
                                        👤 {isRakib ? 'রাকিব' : isLimon ? 'লিমন' : 'অন্য'}
                                      </span>

                                      <div>
                                        <b style={{ fontSize: '13px', color: '#0f172a', display: 'block' }}>
                                          {sale.title}
                                        </b>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                                          {sale.category || 'বিক্রয়'} {sale.notes ? (' • ' + sale.notes) : ''}
                                        </span>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                      <div style={{ textAlign: 'right' }}>
                                        <strong style={{ fontSize: '14px', color: isRakib ? '#1d4ed8' : isLimon ? '#7e22ce' : '#0f172a' }}>
                                          {money(sale.amount)}
                                        </strong>
                                        {(sale.grossProfit !== undefined || sale.cogsAmount !== undefined) && (
                                          <small style={{ display: 'block', fontSize: '10px', color: '#059669', fontWeight: 600 }}>
                                            লাভ: +{money(sale.grossProfit !== undefined ? sale.grossProfit : Math.max(0, sale.amount - (sale.cogsAmount || 0)))}
                                          </small>
                                        )}
                                      </div>

                                      <button
                                        type="button"
                                        className="action-btn"
                                        title="পূর্ণাঙ্গ রসিদ দেখুন"
                                        onClick={() => setViewRecordModal(sale)}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff', cursor: 'pointer' }}
                                      >
                                        <Eye size={14} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredDailySellerSales.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                    কোনো দিনের বিক্রয় হিসাব পাওয়া যায়নি।
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INVESTORS */}
        {tab === 'investors' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-head">
                <div className="panel-head-info">
                  <h2>অংশীদারদের লেজার ও অ্যাকাউন্ট ব্যালেন্স</h2>
                  <p>বিনিয়োগ (উত্তোলনযোগ্য নয়), মালিকানার শেয়ার %, লাভাংশ উত্তোলন, বিশেষ লোন সমন্বয় ও বর্তমান ব্যালেন্স</p>
                </div>
                {admin && (
                  <button className="primary" onClick={() => setShowInvestorModal(true)}>
                    <Plus size={17} /> নতুন অংশীদার যোগ
                  </button>
                )}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>অংশীদারের নাম</th>
                      <th>ফোন নম্বর</th>
                      <th>স্থির মূলধন (উত্তোলনযোগ্য নয়)</th>
                      <th>শেয়ার %</th>
                      <th>বরাদ্দকৃত লাভাংশ</th>
                      <th>উত্তোলন ও বিশেষ লোন</th>
                      <th>উত্তোলনযোগ্য লাভাংশ</th>
                      <th>বিস্তারিত</th>
                      {admin && <th>অ্যাকশন</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {partnerAccounts.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <b>{p.name}</b>
                          {p.demo && <span className="badge demo" style={{ marginLeft: '6px' }}>ডেমো</span>}
                        </td>
                        <td>{p.phone || '—'}</td>
                        <td>
                          <b>{money(p.capital)}</b>
                          <span className="cell-sub" style={{ color: '#dc2626' }}>🔒 উত্তোলনযোগ্য নয়</span>
                        </td>
                        <td>
                          <b style={{ color: '#0d9488' }}>{p.share.toFixed(2)}%</b>
                        </td>
                        <td style={{ color: '#16a34a', fontWeight: 700 }}>{money(p.allocatedProfit)}</td>
                        <td style={{ color: '#b91c1c' }}>
                          <b>-{money(p.withdrawals + p.loans)}</b>
                          <span className="cell-sub">
                            উত্তোলন: {money(p.withdrawals)} | লোন: {money(p.loans)}
                          </span>
                        </td>
                        <td>
                          <b style={{ color: '#0d9488' }}>{money(p.withdrawableLimit)}</b>
                          <span className="cell-sub">প্রতি শুক্রবার রাতে উত্তোলনযোগ্য</span>
                        </td>
                        <td>
                          <button className="action-btn" onClick={() => setViewPartnerModal(p)}>
                            <Eye size={16} /> দেখুন
                          </button>
                        </td>
                        {admin && (
                          <td>
                            <button
                              className="action-btn danger"
                              title="ইনভেস্টর ডিলিট"
                              onClick={() => setShowInvestorDeleteModal(p)}
                            >
                              <Trash2 size={16} /> ডিলিট
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Official Partnership Terms & Conditions inside Investors Tab */}
            <TermsConditionsCard
              currentAdminName={currentAdmin?.displayName}
              partnerName={otherPartner?.displayName}
            />
          </div>
        )}

        {/* DEDICATED TAB: TERMS & CONDITIONS (শর্তাবলী ও নীতিমালা) */}
        {tab === 'terms' && (
          <TermsConditionsCard
            currentAdminName={currentAdmin?.displayName}
            partnerName={otherPartner?.displayName}
          />
        )}

        {/* TAB 4: INVENTORY */}
        {tab === 'inventory' && (
          <div className="panel">
            <div className="panel-head" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div className="panel-head-info">
                <h2>মজুদ পণ্য ও ইনভেন্টরি কস্টিং (COGS)</h2>
                <p>একটা করে পণ্য আপলোড অথবা একসাথে ৫-৬টি পণ্যের গড় ক্রয়মূল্য ও বিক্রয়মূল্য সংযোজন</p>
              </div>
              <div className="inventory-top-actions">
                <button
                  type="button"
                  className="primary"
                  style={{
                    background: '#0f2438',
                    borderColor: '#0f2438',
                  }}
                  onClick={() => setShowProfitabilityModal(true)}
                >
                  <PieChart size={16} />
                  <span>পণ্যভিত্তিক লাভজনকতা ও অচল স্টক রিপোর্ট</span>
                </button>
                {admin && (
                  <>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        setEditingProduct(null);
                        setProductUploadMode('single');
                        setShowProductModal(true);
                      }}
                    >
                      <Plus size={16} />
                      <span>একটা করে পণ্য যোগ</span>
                    </button>
                    <button
                      type="button"
                      className="primary inventory-batch-btn"
                      style={{
                        background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                        borderColor: '#0284c7',
                        boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
                      }}
                      onClick={() => {
                        setEditingProduct(null);
                        setProductUploadMode('batch_avg');
                        if (batchProductsForm.length < 5) {
                          setBatchProductsForm(createDefaultBatchRows(5));
                        }
                        setShowProductModal(true);
                      }}
                    >
                      <Boxes size={16} />
                      <span>৫-৬টি পণ্য গড় হিসাবে যোগ</span>
                    </button>
                    <button
                      type="button"
                      className="primary"
                      style={{
                        background: 'linear-gradient(135deg, #e11d48, #be123c)',
                        borderColor: '#e11d48',
                        boxShadow: '0 2px 8px rgba(225, 29, 72, 0.25)',
                      }}
                      onClick={() => {
                        setWasteForm({
                          productId: products[0]?.id || '',
                          quantity: '',
                          reason: 'মেয়াদোত্তীর্ণ (Expired)',
                          lossAmount: '',
                          date: today(),
                          notes: '',
                        });
                        setShowWasteModal(true);
                      }}
                    >
                      <AlertTriangle size={16} />
                      <span>নষ্ট / ক্ষতিগ্রস্থ পণ্য এন্ট্রি</span>
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '56px' }}>ছবি</th>
                    <th>পণ্যের নাম</th>
                    <th>SKU</th>
                    <th>স্টক</th>
                    <th>গড় ক্রয়মূল্য</th>
                    <th>বিক্রয়মূল্য</th>
                    <th>মোট স্টক মূল্য</th>
                    {admin && <th>অ্যাকশন</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => (
                    <tr key={p.id}>
                      <td>
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '8px',
                              objectFit: 'cover',
                              border: '1px solid #cbd5e1',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                              display: 'block'
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '8px',
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#94a3b8'
                            }}
                            title="কোনো ছবি নেই"
                          >
                            <Package size={20} />
                          </div>
                        )}
                      </td>
                      <td><b>{p.name}</b></td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: p.sku ? '#ecfdf5' : '#f1f5f9',
                            color: p.sku ? '#047857' : '#334155',
                            border: `1px solid ${p.sku ? '#6ee7b7' : '#cbd5e1'}`,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 800,
                          }}
                          title="এই SKU কোডটি প্রডাক্টের গায়ে লিখে ক্যামেরায় ধরলে অটো-সেল হবে"
                        >
                          🏷️ {p.sku && p.sku.trim() ? p.sku.trim() : `SKU-${idx + 1}`}
                        </span>
                      </td>
                      <td>{p.currentStock} {p.unit}</td>
                      <td>{money(p.averageCost)}</td>
                      <td>{money(p.sellingPrice)}</td>
                      <td><b>{money(p.currentStock * p.averageCost)}</b></td>
                      {admin && (
                        <td>
                          <div className="action-group">
                            <button
                              className="action-btn"
                              title="পণ্য সম্পাদনা ও ছবি পরিবর্তন"
                              onClick={() => handleOpenEditProduct(p)}
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              className="action-btn danger"
                              title="পণ্য ডিলিট"
                              onClick={() => setShowProductDeleteModal(p)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!products.length && (
                    <tr><td colSpan={admin ? 8 : 7} className="empty">কোনো পণ্য পাওয়া যায়নি</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Damaged & Waste Goods Audit Trail and History */}
            {(() => {
              const wasteRequests = approvalRequests.filter(
                (r) => r.actionType === 'record_waste'
              );
              const approvedWaste = wasteRequests.filter((r) => r.status === 'approved');
              const pendingWaste = wasteRequests.filter((r) => r.status === 'pending');
              const totalLossAmount = approvedWaste.reduce(
                (acc, r) => acc + (Number(r.payload?.lossAmount) || 0),
                0
              );

              return (
                <div style={{ marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <div
                    style={{
                      background: '#fff1f2',
                      border: '1.5px solid #fecaca',
                      borderRadius: '12px',
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '14px',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: '#fee2e2',
                          color: '#e11d48',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <AlertTriangle size={20} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15.5px', color: '#9f1239', fontWeight: 800 }}>
                          নষ্ট বা ক্ষতিগ্রস্থ পণ্যের অডিট ট্রেইল (Waste / Damaged Goods Log)
                        </h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#be123c' }}>
                          শর্তাবলী অনুযায়ী পণ্য নষ্ট হলে অপর অংশীদারের অনুমোদনে স্টক থেকে কর্তন ও ক্ষতি সমন্বয় হয়
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ background: '#ffffff', padding: '6px 14px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>অনুমোদিত মোট ক্ষতি:</span>
                        <b style={{ color: '#e11d48', fontSize: '15px' }}>{money(totalLossAmount)}</b>
                      </div>
                      <div style={{ background: '#ffffff', padding: '6px 14px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>মোট নষ্ট রেকর্ড:</span>
                        <b style={{ color: '#0f172a', fontSize: '15px' }}>{toBengaliNumerals(approvedWaste.length)}টি</b>
                      </div>
                      {pendingWaste.length > 0 && (
                        <div style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                          <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>অপেক্ষমান অনুমোদন:</span>
                          <b style={{ color: '#b45309', fontSize: '15px' }}>{toBengaliNumerals(pendingWaste.length)}টি</b>
                        </div>
                      )}
                    </div>
                  </div>

                  {wasteRequests.length > 0 ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>তারিখ</th>
                            <th>পণ্যের নাম</th>
                            <th>নষ্টের পরিমাণ</th>
                            <th>আর্থিক ক্ষতি</th>
                            <th>কারণ ও নোট</th>
                            <th>অনুরোধকারী (Maker)</th>
                            <th>অনুমোদনকারী (Checker)</th>
                            <th>স্ট্যাটাস</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wasteRequests.map((w) => {
                            const isAppr = w.status === 'approved';
                            const isRej = w.status === 'rejected';
                            return (
                              <tr key={w.id}>
                                <td>{dateLabel(w.payload?.date || w.requestedAt?.slice(0, 10))}</td>
                                <td><b>{w.payload?.productName || 'পণ্য'}</b></td>
                                <td style={{ color: '#dc2626', fontWeight: 700 }}>
                                  -{w.payload?.quantity} {w.payload?.unit || 'পিস'}
                                </td>
                                <td style={{ color: '#e11d48', fontWeight: 700 }}>
                                  {money(w.payload?.lossAmount || 0)}
                                </td>
                                <td>
                                  <div><b>{w.payload?.reason || w.reason}</b></div>
                                  {w.payload?.notes && <small style={{ color: '#64748b' }}>{w.payload.notes}</small>}
                                </td>
                                <td>
                                  <b>{w.requestedByName}</b>
                                  <span className="cell-sub">{w.requestedAtFormatted}</span>
                                </td>
                                <td>
                                  {isAppr ? (
                                    <div>
                                      <b style={{ color: '#059669' }}>{w.reviewedByName || w.targetApproverName}</b>
                                      <span className="cell-sub">{w.reviewedAtFormatted}</span>
                                    </div>
                                  ) : isRej ? (
                                    <div>
                                      <b style={{ color: '#dc2626' }}>{w.reviewedByName || w.targetApproverName} (বাতিল)</b>
                                      <span className="cell-sub">কারণ: {w.reviewNote}</span>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#d97706', fontWeight: 600 }}>
                                      {w.targetApproverName}-এর অনুমোদন অপেক্ষমান
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className={`badge ${isAppr ? 'posted' : isRej ? 'void' : 'draft'}`}>
                                    {isAppr ? 'অনুমোদিত ও স্টক কর্তনকৃত' : isRej ? 'প্রত্যাখ্যাত' : 'অপেক্ষমান'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '10px', color: '#64748b', fontSize: '13px' }}>
                      এখনও কোনো নষ্ট বা ক্ষতিগ্রস্থ পণ্যের রেকর্ড নেই। কোনো পণ্য নষ্ট বা ভাঙা হলে উপরের "নষ্ট / ক্ষতিগ্রস্থ পণ্য এন্ট্রি" বাটনে ক্লিক করে এন্ট্রি দিন।
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 5: PROFIT DISTRIBUTION */}
        {tab === 'profit' && (
          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-info">
                <h2>অংশীদারদের মাঝে মুনাফা বণ্টন</h2>
                <p>নিট মুনাফা এবং অংশীদারদের মূলধনের অনুপাতে লাভ বণ্টন</p>
              </div>
              {admin && (
                <button
                  className="primary"
                  onClick={() => {
                    setDistributionForm({
                      ...distributionForm,
                      distributableAmount: String(Math.max(0, stats.netProfit)),
                    });
                    setShowProfitModal(true);
                  }}
                >
                  <Percent size={17} /> মুনাফা বণ্টন হিসাব
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>তারিখ</th>
                    <th>মেয়াদ</th>
                    <th>মোট নিট লাভ</th>
                    <th>বণ্টনকৃত অর্থ</th>
                    <th>অংশীদারদের ভাগ</th>
                    {admin && <th>অ্যাকশন</th>}
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((d) => (
                    <tr key={d.id}>
                      <td>{dateLabel(d.date)}</td>
                      <td><b>{d.periodName}</b></td>
                      <td>{money(d.totalNetProfit)}</td>
                      <td style={{ color: '#0d9488' }}>{money(d.distributedAmount)}</td>
                      <td>
                        {d.shares?.map((s) => (
                          <div key={s.investorId}>
                            {s.investorName}: <b>{money(s.allocatedAmount)}</b> ({s.sharePercent}%)
                          </div>
                        ))}
                      </td>
                      {admin && (
                        <td>
                          <button
                            className="action-btn danger"
                            title="মুনাফা বণ্টন ডিলিট"
                            onClick={() => setShowDistributionDeleteModal(d)}
                          >
                            <Trash2 size={16} /> ডিলিট
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!distributions.length && (
                    <tr><td colSpan={admin ? 6 : 5} className="empty">কোনো মুনাফা বণ্টন রেকর্ড পাওয়া যায়নি</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: REPORTS */}
        {tab === 'reports' && (
          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-info">
                <h2>আর্থিক প্রতিবেদন ও পূর্ণাঙ্গ স্টেটমেন্ট</h2>
                <p>মাসিক ও সার্বিক ব্যবসায়িক লাভ-ক্ষতি বিবরণী, ক্যাশ ফ্লো এবং পার্টনার লেজার ডাউনলোড ও পর্যালোচনা করুন</p>
              </div>
              <div className="report-top-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowProfitabilityModal(true)}
                  style={{
                    borderColor: '#0d9488',
                    color: '#0f766e',
                    background: '#f0fdfa',
                  }}
                >
                  <PieChart size={16} />
                  <span>পণ্যভিত্তিক লাভজনকতা ও স্টক রিপোর্ট</span>
                </button>
                <button className="primary" onClick={handleDownloadPdf} disabled={isPdfLoading}>
                  <FileText size={16} />
                  <span>{isPdfLoading ? 'পিডিএফ প্রস্তুত হচ্ছে…' : 'সার্বিক বাংলা PDF ডাউনলোড'}</span>
                </button>
                <button className="secondary" onClick={exportCsv}>
                  <FileSpreadsheet size={16} />
                  <span>CSV এক্সপোর্ট</span>
                </button>
              </div>
            </div>

            {/* DEDICATED MONTHLY PDF REPORT GENERATOR */}
            <div
              style={{
                background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)',
                border: '1.5px solid #99f6e4',
                borderRadius: '14px',
                padding: '20px',
                marginBottom: '26px',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px',
                  flexWrap: 'wrap',
                  marginBottom: '16px',
                  paddingBottom: '14px',
                  borderBottom: '1px solid #ccfbf1',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Calendar size={19} style={{ color: '#0d9488' }} />
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                      মাসিক আর্থিক প্রতিবেদন ও PDF জেনারেটর ({formatMonthLabelBn(reportMonth)})
                    </h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                    যেকোনো ক্যালেন্ডার মাস নির্বাচন করে সেই মাসের মোট বিক্রয়, মোট খরচ এবং নিট লাভের পূর্ণাঙ্গ PDF রিপোর্ট ডাউনলোড করুন
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '6px 12px',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>মাস নির্বাচন:</span>
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => {
                        if (e.target.value) setReportMonth(e.target.value);
                      }}
                      style={{
                        border: 'none',
                        outline: 'none',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        color: '#0f766e',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                      title="ক্যালেন্ডার মাস নির্বাচন করুন"
                    />
                  </div>

                  <button
                    type="button"
                    className="primary"
                    onClick={handleDownloadMonthlyPdf}
                    disabled={isMonthlyPdfLoading}
                    style={{
                      background: '#0f766e',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      fontWeight: 700,
                    }}
                  >
                    <Download size={16} />
                    {isMonthlyPdfLoading
                      ? 'মাসিক PDF তৈরি হচ্ছে…'
                      : `${formatMonthLabelBn(reportMonth)}-এর PDF ডাউনলোড`}
                  </button>
                </div>
              </div>

              {/* Quick Month Selector Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>দ্রুত মাস নির্বাচন:</span>
                {availableReportMonths.map((ym) => {
                  const isCurrent = ym === today().slice(0, 7);
                  const isSelected = ym === reportMonth;
                  return (
                    <button
                      key={ym}
                      type="button"
                      onClick={() => setReportMonth(ym)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? 700 : 600,
                        border: isSelected ? '1.5px solid #0d9488' : '1px solid #cbd5e1',
                        background: isSelected ? '#0d9488' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#334155',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {formatMonthLabelBn(ym)} {isCurrent ? '(চলতি মাস)' : ''}
                    </button>
                  );
                })}
              </div>

              {/* Monthly Summary KPI Cards */}
              <div className="card-grid" style={{ marginBottom: '16px' }}>
                <div className="info-card" style={{ background: '#ffffff', borderColor: '#bbf7d0' }}>
                  <h4>মাসিক মোট বিক্রয় (Total Sales)</h4>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#15803d', margin: '4px 0' }}>
                    {money(monthlyReportStats.sales)}
                  </p>
                  <small style={{ color: '#059669', fontWeight: 600 }}>
                    মাসিক গ্রস লাভ: +{money(monthlyReportStats.grossProfit)}
                  </small>
                </div>

                <div className="info-card" style={{ background: '#ffffff', borderColor: '#fde68a' }}>
                  <h4>মাসিক মোট খরচ (Total Expenses)</h4>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#b45309', margin: '4px 0' }}>
                    {money(monthlyReportStats.cogs + monthlyReportStats.expenses)}
                  </p>
                  <small style={{ color: '#78350f' }}>
                    ক্রয় খরচ (COGS): {money(monthlyReportStats.cogs)} | পরিচালন ব্যয়: {money(monthlyReportStats.expenses)}
                  </small>
                </div>

                <div
                  className="info-card"
                  style={{
                    background: monthlyReportStats.netProfit >= 0 ? '#f0fdf4' : '#fef2f2',
                    borderColor: monthlyReportStats.netProfit >= 0 ? '#86efac' : '#fecaca',
                  }}
                >
                  <h4>মাসিক নিট লাভ / ক্ষতি (Net Profit)</h4>
                  <p
                    style={{
                      fontSize: '20px',
                      fontWeight: 800,
                      color: monthlyReportStats.netProfit >= 0 ? '#059669' : '#dc2626',
                      margin: '4px 0',
                    }}
                  >
                    {monthlyReportStats.netProfit >= 0 ? '+' : ''}
                    {money(monthlyReportStats.netProfit)}
                  </p>
                  <small style={{ color: '#475569', fontWeight: 600 }}>
                    বিক্রয় ({money(monthlyReportStats.sales)}) − মোট খরচ ({money(monthlyReportStats.cogs + monthlyReportStats.expenses)})
                  </small>
                </div>

                <div className="info-card" style={{ background: '#ffffff', borderColor: '#e2e8f0' }}>
                  <h4>মাসের লেনদেন সংখ্যা</h4>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>
                    {toBengaliNumerals(monthlyReportStats.postedCount)}টি রেকর্ড
                  </p>
                  <small style={{ color: '#64748b' }}>
                    মাল ক্রয়: {money(monthlyReportStats.purchases)} | উত্তোলন: {money(monthlyReportStats.withdrawals)}
                  </small>
                </div>
              </div>

              {/* Selected Month Quick Breakdown Table */}
              <div className="table-wrap" style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{formatMonthLabelBn(reportMonth)} মাসের হিসাব খাত</th>
                      <th>হিসাবের ধরন</th>
                      <th>টাকার পরিমাণ (৳)</th>
                      <th>বিবরণ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><b>মাসিক মোট বিক্রয় (Monthly Sales)</b></td>
                      <td>আয় (Revenue)</td>
                      <td style={{ color: '#059669', fontWeight: 700 }}>{money(monthlyReportStats.sales)}</td>
                      <td>নির্বাচিত মাসের মোট বিক্রয় রাজস্ব</td>
                    </tr>
                    <tr>
                      <td><b>বিক্রিত পণ্যের ক্রয়মূল্য (Monthly COGS)</b></td>
                      <td>প্রত্যক্ষ পণ্য খরচ</td>
                      <td style={{ color: '#b45309', fontWeight: 600 }}>-{money(monthlyReportStats.cogs)}</td>
                      <td>বিক্রিত পণ্যের আসল কেনা খরচ</td>
                    </tr>
                    <tr>
                      <td><b>মাসিক পরিচালন খরচ (Operating Expenses)</b></td>
                      <td>পরিচালন ব্যয়</td>
                      <td style={{ color: '#dc2626', fontWeight: 600 }}>-{money(monthlyReportStats.expenses)}</td>
                      <td>নির্বাচিত মাসের দোকান, পরিবহন ও অন্যান্য খরচ</td>
                    </tr>
                    <tr style={{ background: '#fffbeb' }}>
                      <td><b>মাসের সর্বমোট খরচ (Total Monthly Expenses)</b></td>
                      <td>মোট ব্যয় (COGS + Expense)</td>
                      <td style={{ color: '#b45309', fontWeight: 700 }}>
                        -{money(monthlyReportStats.cogs + monthlyReportStats.expenses)}
                      </td>
                      <td>পণ্য ক্রয় খরচ ও পরিচালন ব্যয়ের যোগফল</td>
                    </tr>
                    <tr style={{ background: monthlyReportStats.netProfit >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                      <td><b>মাসিক প্রকৃত নিট মুনাফা / ক্ষতি (Monthly Net Profit)</b></td>
                      <td>মাসিক চূড়ান্ত ফলাফল</td>
                      <td
                        style={{
                          color: monthlyReportStats.netProfit >= 0 ? '#059669' : '#dc2626',
                          fontWeight: 800,
                          fontSize: '14.5px',
                        }}
                      >
                        {monthlyReportStats.netProfit >= 0 ? '+' : ''}
                        {money(monthlyReportStats.netProfit)}
                      </td>
                      <td>{formatMonthLabelBn(reportMonth)} মাসের নিট অর্জিত লাভ বা ক্ষতি</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px 0' }}>
              সার্বিক ব্যবসায়িক আর্থিক সারাংশ (শুরু থেকে বর্তমান)
            </h3>

            <div className="card-grid" style={{ marginBottom: '20px' }}>
              <div className="info-card">
                <h4>মোট বিক্রয় ও গ্রস লাভ</h4>
                <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>{money(stats.sales)}</p>
                <small style={{ color: '#059669', fontWeight: 600 }}>গ্রস লাভ: +{money(stats.grossProfit)} (COGS: {money(stats.cogs)})</small>
              </div>
              <div className="info-card">
                <h4>পরিচালন ব্যয় ও নিট মুনাফা</h4>
                <p style={{ fontSize: '20px', fontWeight: 700, color: stats.netProfit >= 0 ? '#059669' : '#dc2626', margin: '4px 0' }}>
                  {stats.netProfit >= 0 ? '+' : ''}{money(stats.netProfit)}
                </p>
                <small style={{ color: '#64748b' }}>মোট পরিচালন খরচ: {money(stats.expenses)}</small>
              </div>
              <div className="info-card">
                <h4>বর্তমান মজুদ পণ্যের মূল্য</h4>
                <p style={{ fontSize: '20px', fontWeight: 700, color: '#0284c7', margin: '4px 0' }}>{money(stats.inventoryValuation)}</p>
                <small style={{ color: '#64748b' }}>মোট পণ্য আইটেম: {products.length}টি</small>
              </div>
              <div className="info-card">
                <h4>উপলব্ধ নগদ ক্যাশ ব্যালেন্স</h4>
                <p style={{ fontSize: '20px', fontWeight: 700, color: '#0d9488', margin: '4px 0' }}>{money(cashSummary.availableCash)}</p>
                <small style={{ color: '#64748b' }}>মূলধন ({money(cashSummary.totalInvestments)}) + নিট লাভ − উত্তোলন</small>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>বিবরণ (আর্থিক খাত)</th>
                    <th>হিসাবের ধরন</th>
                    <th>টাকার পরিমাণ (৳)</th>
                    <th>মন্তব্য / প্রভাব</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>মোট বিক্রয় রাজস্ব (Total Sales)</b></td>
                    <td>আয় (Revenue)</td>
                    <td style={{ color: '#059669', fontWeight: 700 }}>{money(stats.sales)}</td>
                    <td>মোট বিক্রয়কৃত পণ্যের মূল্য</td>
                  </tr>
                  <tr>
                    <td><b>বিক্রয়কৃত পণ্যের ক্রয় খরচ (COGS)</b></td>
                    <td>প্রত্যক্ষ খরচ</td>
                    <td style={{ color: '#b45309', fontWeight: 600 }}>-{money(stats.cogs)}</td>
                    <td>বিক্রয়কৃত পণ্যের আসল কেনা দাম</td>
                  </tr>
                  <tr>
                    <td><b>মোট বিক্রয় মুনাফা (Gross Profit)</b></td>
                    <td>মুনাফা</td>
                    <td style={{ color: '#059669', fontWeight: 700 }}>{money(stats.grossProfit)}</td>
                    <td>বিক্রয় রাজস্ব − ক্রয় খরচ (COGS)</td>
                  </tr>
                  <tr>
                    <td><b>পরিচালন ও অন্যান্য খরচ (Operating Expenses)</b></td>
                    <td>ব্যয় (Expense)</td>
                    <td style={{ color: '#dc2626', fontWeight: 600 }}>-{money(stats.expenses)}</td>
                    <td>দোকান, পরিবহন ও দৈনন্দিন খরচ</td>
                  </tr>
                  <tr style={{ background: '#f0fdf4' }}>
                    <td><b>প্রকৃত নিট লাভ / ক্ষতি (Net Profit / Loss)</b></td>
                    <td>চূড়ান্ত ফলাফল</td>
                    <td style={{ color: stats.netProfit >= 0 ? '#059669' : '#dc2626', fontWeight: 800, fontSize: '14.5px' }}>
                      {stats.netProfit >= 0 ? '+' : ''}{money(stats.netProfit)}
                    </td>
                    <td>অংশীদারদের মাঝে বণ্টনযোগ্য নিট লাভ</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: AUDIT LOG */}
        {tab === 'audit' && (
          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-info">
                <h2>অডিট লগ ও ডিলিট ইতিহাস</h2>
                <p>সিস্টেমে হওয়া সমস্ত ডিলিট, পরিবর্তন ও কার্যকলাপের রেকর্ড</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>তারিখ ও সময়</th>
                    <th>অ্যাকশন</th>
                    <th>অনুরোধকারী (Maker)</th>
                    <th>অনুমোদনকারী (Approver)</th>
                    <th>কারণ ও বিবরণ</th>
                    <th>স্ট্যাটাস / প্রমাণ</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => {
                    const isDual = log.action.startsWith('dual_') || log.action.startsWith('request_');
                    const timeStr = log.formattedTime || (log.createdAt?.toDate ? formatBengaliDateTime(log.createdAt.toDate()) : 'এইমাত্র');
                    const makerName = log.makerName || log.maker || (log.actorEmail?.includes('rakib') ? 'Rakib' : log.actorEmail?.includes('limon') ? 'Limon' : log.actor);
                    const approverName = log.approverName || log.approver;

                    return (
                      <tr key={log.id}>
                        <td>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                            {timeStr}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${log.action.includes('delete') ? 'void' : log.action.includes('approved') ? 'posted' : 'demo'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td>
                          <b style={{ color: '#0f172a' }}>{makerName}</b>
                        </td>
                        <td>
                          {approverName ? (
                            <div>
                              <b style={{ color: '#0d9488' }}>{approverName}</b>
                              {log.approvedAtFormatted && (
                                <small style={{ display: 'block', color: '#64748b', fontSize: '11px' }}>
                                  {log.approvedAtFormatted}
                                </small>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td style={{ maxWidth: '280px' }}>
                          <div style={{ fontSize: '12.5px', color: '#1e293b' }}>
                            {log.reason || '—'}
                          </div>
                          {log.details?.title && (
                            <small style={{ display: 'block', color: '#64748b', marginTop: '2px' }}>
                              বিষয়: {log.details.title}
                            </small>
                          )}
                        </td>
                        <td>
                          <span className={`status ${log.action.includes('approved') ? 'posted' : log.action.includes('rejected') ? 'void' : 'posted'}`}>
                            {isDual ? '🛡️ দ্বৈত অডিট' : 'সিস্টেম লগ'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!auditLogs.length && (
                    <tr>
                      <td colSpan={6} className="empty">কোনো অডিট লগ রেকর্ড নেই</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 8: SETTINGS */}
        {tab === 'settings' && (
          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-info">
                <h2>ব্যবসার সেটিংস ও সিস্টেম ব্যবস্থাপনা</h2>
                <p>প্রতিষ্ঠানের নাম, ঠিকানা, স্বয়ংক্রিয় হিসাব যাচাই ও ডেটা রিসেট</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleSaveSettings} style={{ marginBottom: '24px' }}>
              <label>
                প্রতিষ্ঠানের নাম
                <input
                  required
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  placeholder="যেমন: Glowzaa Shop"
                />
              </label>
              <label>
                ব্যবসার ধরন
                <input
                  value={settings.type || ''}
                  onChange={(e) => setSettings({ ...settings, type: e.target.value })}
                  placeholder="খুচরা ও পাইকারি ব্যবসা"
                />
              </label>
              <label>
                ফোন নম্বর
                <input
                  value={settings.phone || ''}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="০১৭১১-০০০০০০"
                />
              </label>
              <label>
                ঠিকানা
                <input
                  value={settings.address || ''}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder="ঢাকা, বাংলাদেশ"
                />
              </label>
              <div className="full">
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? (
                    <>
                      <span className="btn-spinner" />
                      <span>সংরক্ষণ হচ্ছে…</span>
                    </>
                  ) : (
                    'সেটিংস সংরক্ষণ করুন'
                  )}
                </button>
              </div>
            </form>

            {/* WEBSITE ENTRY BRAND POPUP ANIMATION ("Glowzaa এটা ব্রান্ড") ON/OFF SETTING CARD */}
            <div className="brand-popup-setting-card">
              <div className="brand-popup-setting-top">
                <div className="brand-popup-setting-info">
                  <div className="brand-popup-setting-icon">
                    <Sparkles size={22} />
                  </div>
                  <div className="brand-popup-setting-text">
                    <div className="brand-popup-setting-title-row">
                      <h3>ওয়েবসাইট ওয়েলকাম পপআপ এনিমেশন (&ldquo;Glowzaa এটা ব্রান্ড&rdquo;)</h3>
                      <span
                        className={`brand-popup-status-pill ${
                          settings.showBrandPopup !== false ? 'is-on' : 'is-off'
                        }`}
                      >
                        {settings.showBrandPopup !== false ? 'চালু আছে (ON)' : 'বন্ধ আছে (OFF)'}
                      </span>
                    </div>
                    <p>
                      ওয়েবসাইটে ঢুকলেই প্রিমিয়াম পপআপ এনিমেশনে <b>&ldquo;{settings.brandPopupText || 'Glowzaa এটা ব্রান্ড'}&rdquo;</b> লেখাটি দেখাবে। আপনি এখান থেকে যেকোনো সময় এটি অন বা অফ করে রাখতে পারবেন।
                    </p>
                  </div>
                </div>

                <div className="brand-popup-setting-controls">
                  {/* Interactive ON / OFF Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.showBrandPopup !== false}
                    className={`brand-toggle-switch-btn ${
                      settings.showBrandPopup !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggleBrandPopup(settings.showBrandPopup === false)}
                  >
                    <span className="brand-toggle-knob" />
                    <span className="brand-toggle-label">
                      {settings.showBrandPopup !== false ? 'এনিমেশন: ON' : 'এনিমেশন: OFF'}
                    </span>
                  </button>

                  {/* Preview Popup Button */}
                  <button
                    type="button"
                    className="brand-preview-trigger-btn"
                    onClick={() => setShowBrandWelcome(true)}
                  >
                    <PlayCircle size={16} />
                    <span>এনিমেশন প্রিভিউ দেখুন</span>
                  </button>
                </div>
              </div>

              <div className="brand-popup-custom-row">
                <label className="brand-popup-input-label">
                  <span>পপআপ এনিমেশনের লেখা (চাইলে পরিবর্তন করতে পারেন):</span>
                  <div className="brand-popup-input-group">
                    <input
                      type="text"
                      value={settings.brandPopupText ?? 'Glowzaa এটা ব্রান্ড'}
                      onChange={(e) =>
                        setSettings({ ...settings, brandPopupText: e.target.value })
                      }
                      placeholder="Glowzaa এটা ব্রান্ড"
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        const defaultText = 'Glowzaa এটা ব্রান্ড';
                        const updated = { ...settings, brandPopupText: defaultText };
                        setSettings(updated);
                        try {
                          localStorage.setItem('glowzaa_business_settings', JSON.stringify(updated));
                        } catch {}
                        if (db) {
                          try {
                            await setDoc(
                              doc(db, 'businessSettings', 'main'),
                              { brandPopupText: defaultText, updatedAt: serverTimestamp() },
                              { merge: true }
                            );
                          } catch {}
                        }
                        setMessage('পপআপ টেক্সট "Glowzaa এটা ব্রান্ড"-এ রিসেট করা হয়েছে!');
                      }}
                    >
                      ডিফল্ট টেক্সট
                    </button>
                  </div>
                </label>
              </div>
            </div>

            {/* PERSISTENT FLOATING BUSINESS CALCULATOR ON/OFF SETTING CARD */}
            <div className="brand-popup-setting-card" style={{ marginTop: '16px' }}>
              <div className="brand-popup-setting-top">
                <div className="brand-popup-setting-info">
                  <div
                    className="brand-popup-setting-icon"
                    style={{
                      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                      color: '#ffffff',
                    }}
                  >
                    <Calculator size={22} />
                  </div>
                  <div className="brand-popup-setting-text">
                    <div className="brand-popup-setting-title-row">
                      <h3>ব্যবসার স্থির (Floating) ক্যালকুলেটর বাটন</h3>
                      <span
                        className={`brand-popup-status-pill ${
                          settings.showCalculator !== false ? 'is-on' : 'is-off'
                        }`}
                      >
                        {settings.showCalculator !== false ? 'চালু আছে (ON)' : 'বন্ধ আছে (OFF)'}
                      </span>
                    </div>
                    <p>
                      এটি চালু থাকলে সব পেজে ডান পাশে ক্যালকুলেটর আইকন বাটনটি স্থির থাকবে (স্ক্রল করলেও সরে যাবে না) এবং মিনিমাইজ করলে হিসাব জমা থাকবে। চাইলে এখান থেকে অন বা অফ রাখতে পারবেন।
                    </p>
                  </div>
                </div>

                <div className="brand-popup-setting-controls">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.showCalculator !== false}
                    className={`brand-toggle-switch-btn ${
                      settings.showCalculator !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggleCalculator(settings.showCalculator === false)}
                  >
                    <span className="brand-toggle-knob" />
                    <span className="brand-toggle-label">
                      {settings.showCalculator !== false ? 'ক্যালকুলেটর: ON' : 'ক্যালকুলেটর: OFF'}
                    </span>
                  </button>

                  {settings.showCalculator !== false && (
                    <button
                      type="button"
                      className="brand-preview-trigger-btn"
                      onClick={() => setShowCalculatorModal(true)}
                    >
                      <Calculator size={16} />
                      <span>ক্যালকুলেটর খুলুন</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="brand-popup-setting-card" style={{ marginTop: '16px' }}>
              <div className="brand-popup-setting-top">
                <div className="brand-popup-setting-info">
                  <div
                    className="brand-popup-setting-icon"
                    style={{
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      color: '#ffffff',
                    }}
                  >
                    <Mic size={22} />
                  </div>
                  <div className="brand-popup-setting-text">
                    <div className="brand-popup-setting-title-row">
                      <h3>সকল ভয়েস ইনপুট ও অটো-ফিল ফিচার (All Voice Features ON/OFF)</h3>
                      <span
                        className={`brand-popup-status-pill ${
                          settings.enableVoiceInput !== false ? 'is-on' : 'is-off'
                        }`}
                      >
                        {settings.enableVoiceInput !== false ? 'চালু আছে (ON)' : 'বন্ধ আছে (OFF)'}
                      </span>
                    </div>
                    <p>
                      এটি চালু থাকলে সব এন্ট্রি ফর্ম (বিক্রয়, ক্রয়, খরচ, পণ্য যোগ, অংশীদার, মুনাফা বণ্টন, উত্তোলন/লোন, নষ্ট পণ্য) এবং ক্যালকুলেটরে ভয়েস ইনপুট ও অটো-ফিল কাজ করবে। চাইলে এখান থেকে সব ভয়েস ফিচার এক ক্লিকে অন বা অফ রাখতে পারবেন।
                    </p>
                  </div>
                </div>

                <div className="brand-popup-setting-controls">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.enableVoiceInput !== false}
                    className={`brand-toggle-switch-btn ${
                      settings.enableVoiceInput !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggleVoiceFeatures(settings.enableVoiceInput === false)}
                  >
                    <span className="brand-toggle-knob" />
                    <span className="brand-toggle-label">
                      {settings.enableVoiceInput !== false ? 'ভয়েস ফিচার: ON' : 'ভয়েস ফিচার: OFF'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="brand-popup-setting-card" style={{ marginTop: '16px' }}>
              <div className="brand-popup-setting-top">
                <div className="brand-popup-setting-info">
                  <div
                    className="brand-popup-setting-icon"
                    style={{
                      background: 'linear-gradient(135deg, #059669, #0284c7)',
                      color: '#ffffff',
                    }}
                  >
                    <Camera size={22} />
                  </div>
                  <div className="brand-popup-setting-text">
                    <div className="brand-popup-setting-title-row">
                      <h3>লাইভ ক্যামেরা অটো-সেল স্ক্যানার (Camera Auto-Sale POS)</h3>
                      <span
                        className={`brand-popup-status-pill ${
                          settings.enableCameraScan !== false ? 'is-on' : 'is-off'
                        }`}
                      >
                        {settings.enableCameraScan !== false ? 'চালু আছে (ON)' : 'বন্ধ আছে (OFF)'}
                      </span>
                    </div>
                    <p>
                      এটি চালু থাকলে আলাদা ক্যামেরা বাটনে চাপ দিয়ে ফোনের ক্যামেরার সামনে বিক্রির প্রডাক্ট ধরলেই স্টকের প্রডাক্টের SKU কোডের সাথে মিলিয়ে স্বয়ংক্রিয়ভাবে বিক্রি এন্ট্রি ও স্টক আপডেট হয়ে যাবে।
                    </p>
                  </div>
                </div>

                <div className="brand-popup-setting-controls">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.enableCameraScan !== false}
                    className={`brand-toggle-switch-btn ${
                      settings.enableCameraScan !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggleCameraScan(settings.enableCameraScan === false)}
                  >
                    <span className="brand-toggle-knob" />
                    <span className="brand-toggle-label">
                      {settings.enableCameraScan !== false ? 'ক্যামেরা সেল: ON' : 'ক্যামেরা সেল: OFF'}
                    </span>
                  </button>

                  {settings.enableCameraScan !== false && (
                    <button
                      type="button"
                      className="brand-preview-trigger-btn"
                      onClick={() => setShowCameraSaleModal(true)}
                    >
                      <Camera size={16} />
                      <span>ক্যামেরা স্ক্যানার খুলুন</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="brand-popup-setting-card" style={{ marginTop: '16px' }}>
              <div className="brand-popup-setting-top">
                <div className="brand-popup-setting-info">
                  <div
                    className="brand-popup-setting-icon"
                    style={{
                      background: 'linear-gradient(135deg, #2563eb, #0284c7)',
                      color: '#ffffff',
                    }}
                  >
                    <PenTool size={22} />
                  </div>
                  <div className="brand-popup-setting-text">
                    <div className="brand-popup-setting-title-row">
                      <h3>ড্রইং প্যাড অটো-সেল (Drawing Pad SKU Auto-Sale)</h3>
                      <span
                        className={`brand-popup-status-pill ${
                          settings.enableDrawingPad !== false ? 'is-on' : 'is-off'
                        }`}
                      >
                        {settings.enableDrawingPad !== false ? 'চালু আছে (ON)' : 'বন্ধ আছে (OFF)'}
                      </span>
                    </div>
                    <p>
                      এটি চালু থাকলে আলাদা ড্রইং প্যাড বাটনে চাপ দিয়ে সাদা প্যাডে আঙুল বা মাউস দিয়ে A, B, AB, GZ লিখলেই সাথে সাথে প্রডাক্টের SKU ম্যাচ করে অটোমেটিক সেল কনফার্ম হয়ে যাবে।
                    </p>
                  </div>
                </div>

                <div className="brand-popup-setting-controls">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.enableDrawingPad !== false}
                    className={`brand-toggle-switch-btn ${
                      settings.enableDrawingPad !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggleDrawingPad(settings.enableDrawingPad === false)}
                  >
                    <span className="brand-toggle-knob" />
                    <span className="brand-toggle-label">
                      {settings.enableDrawingPad !== false ? 'ড্রইং প্যাড: ON' : 'ড্রইং প্যাড: OFF'}
                    </span>
                  </button>

                  {settings.enableDrawingPad !== false && (
                    <button
                      type="button"
                      className="brand-preview-trigger-btn"
                      onClick={() => setShowDrawingSaleModal(true)}
                    >
                      <PenTool size={16} />
                      <span>ড্রইং প্যাড খুলুন</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* CUSTOM SCANNER SOUND UPLOAD & AUDIO SETTINGS CARD */}
            <ScannerSoundSettingsCard onStatusMessage={(msg) => setMessage(msg)} />

            <EmailNotificationSection
              currentActorName={currentAdmin?.displayName || 'রাকিব (Rakib)'}
              currentActorUid={currentAdmin?.username || user?.uid || 'Rakib'}
            />

            <div style={{ marginBottom: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '15px', margin: '0 0 8px', color: '#0f2438' }}>অ্যাকাউন্টিং ইঞ্জিন স্বয়ংক্রিয় যাচাই</h3>
              <button className="secondary" onClick={handleRunTests}>
                <PlayCircle size={16} /> স্বয়ংক্রিয় টেস্ট চালান
              </button>
              {testResults && (
                <div className="preview-box" style={{ marginTop: '10px', background: testResults.passed ? '#f0fdf4' : '#fef2f2' }}>
                  <b>{testResults.message}</b>
                </div>
              )}
            </div>

            {admin && (
              <div className="preview-box" style={{ border: '1px solid #fecaca', marginTop: '20px', background: '#fef2f2' }}>
                <div className="panel-head" style={{ marginBottom: 0 }}>
                  <div className="panel-head-info">
                    <h3 style={{ color: '#991b1b', margin: '0 0 4px' }}>ডেটা রিসেট (Full Website Data Reset)</h3>
                    <p style={{ color: '#7f1d1d', margin: 0 }}>সতর্কবার্তা: সমস্ত লেনদেন, অংশীদার, ইনভেন্টরি ও অডিট লগ চিরতরে মুছে ফেলুন।</p>
                  </div>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      setResetPasswordInput('');
                      setResetPasswordError('');
                      setShowResetPass(false);
                      setShowResetDataModal(true);
                    }}
                  >
                    <Trash2 size={16} /> সমস্ত ডেটা রিসেট করুন
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MOBILE FIXED BOTTOM NAVIGATION BAR (Ergonomic Thumb Zone) */}
      <nav className="mobile-bottom-nav" aria-label="মোবাইল বটম নেভিগেশন">
        <button
          type="button"
          className={`mobile-bottom-item ${tab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setTab('dashboard')}
        >
          <Activity size={19} />
          <span>ড্যাশবোর্ড</span>
        </button>
        <button
          type="button"
          className={`mobile-bottom-item ${tab === 'transactions' ? 'active' : ''}`}
          onClick={() => setTab('transactions')}
        >
          <Banknote size={19} />
          <span>লেনদেন</span>
        </button>
        <button
          type="button"
          className={`mobile-bottom-item ${tab === 'inventory' ? 'active' : ''}`}
          onClick={() => setTab('inventory')}
        >
          <Boxes size={19} />
          <span>স্টক/পণ্য</span>
        </button>
        <button
          type="button"
          className={`mobile-bottom-item ${tab === 'investors' ? 'active' : ''}`}
          onClick={() => setTab('investors')}
        >
          <Users size={19} />
          <span>অংশীদার</span>
        </button>
        <button
          type="button"
          className={`mobile-bottom-item ${tab === 'profile' ? 'active' : ''}`}
          onClick={() => setTab('profile')}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <UserIcon size={19} />
            {pendingForMeCount > 0 && (
              <span className="bottom-nav-badge">{pendingForMeCount}</span>
            )}
          </div>
          <span>প্রোফাইল</span>
        </button>
      </nav>

      {/* MODAL: ADD / EDIT ENTRY */}
      {showEntryModal && (
        <Modal title={editingEntry ? 'রেকর্ড সম্পাদনা' : 'নতুন হিসাব যোগ করুন'} close={() => setShowEntryModal(false)}>
          <form className="form-grid" onSubmit={handleSaveEntry}>
            {settings.enableVoiceInput !== false && (
              <VoiceFormAssistant
                formType="entry"
                title="✨ AI ভয়েস ও স্মার্ট লেনদেন এন্ট্রি (মুখে বলুন বা লিখুন)"
                placeholder="যেমন: ১০ কেজি সামুদ্রিক কাকড়া ৪৫০০ টাকায় বিক্রি অথবা দোকান ভাড়া বাবদ ৩০০০ টাকা খরচ"
                chips={[
                  { label: '🦀 ১০ কেজি কাকড়া বিক্রি ৪৫০০৳', text: '১০ কেজি সামুদ্রিক কাকড়া ৪৫০০ টাকায় বিক্রি করলাম' },
                  { label: '📦 ২০ কেজি কাকড়া ক্রয় ৬০০০৳', text: '২০ কেজি সামুদ্রিক কাকড়া ৬০০০ টাকায় ক্রয় করলাম' },
                  { label: '🧾 দোকান ও পরিবহন খরচ ১২০০৳', text: 'দোকান ও পরিবহন বাবদ ১২০০ টাকা খরচ' },
                  { label: '💼 রাকিব মূলধন জমা ১০০০০৳', text: 'রাকিব ব্যবসায় ১০০০০ টাকা নতুন মূলধন জমা দিল' },
                ]}
                products={products}
                investors={investors}
                onApplyFields={(fields) => {
                  const validTypes: RecordType[] = ['investment', 'sale', 'purchase', 'expense', 'withdrawal', 'loan'];
                  const nextType: RecordType = validTypes.includes(fields.type) ? fields.type : entryForm.type;
                  const matchedProd = fields.productId ? products.find((p) => p.id === fields.productId) : undefined;
                  const qty = fields.quantity !== undefined && fields.quantity !== '' ? Number(fields.quantity) : 0;
                  const uPrice =
                    fields.unitPrice !== undefined && fields.unitPrice !== ''
                      ? Number(fields.unitPrice)
                      : matchedProd && nextType === 'sale'
                      ? Number(matchedProd.sellingPrice) || 0
                      : 0;
                  const uCost =
                    fields.unitCost !== undefined && fields.unitCost !== ''
                      ? Number(fields.unitCost)
                      : matchedProd
                      ? Number(matchedProd.averageCost) || 0
                      : 0;
                  const totalAmt =
                    fields.amount !== undefined && fields.amount !== ''
                      ? Number(fields.amount)
                      : qty > 0 && uPrice > 0
                      ? Math.round(qty * uPrice * 100) / 100
                      : 0;
                  const totalCost =
                    fields.cost !== undefined && fields.cost !== ''
                      ? Number(fields.cost)
                      : nextType === 'sale' && qty > 0 && uCost > 0
                      ? Math.round(qty * uCost * 100) / 100
                      : 0;
                  const totalProfit =
                    fields.profit !== undefined && fields.profit !== ''
                      ? Number(fields.profit)
                      : nextType === 'sale' && totalAmt > 0
                      ? Math.round((totalAmt - totalCost) * 100) / 100
                      : 0;

                  setEntryForm((prev) => ({
                    ...prev,
                    type: nextType,
                    seller: (fields.seller === 'Limon' ? 'Limon' : fields.seller === 'Rakib' ? 'Rakib' : prev.seller),
                    title: fields.title || prev.title,
                    productId: fields.productId !== undefined ? fields.productId : prev.productId,
                    investorId: fields.investorId !== undefined ? fields.investorId : prev.investorId,
                    quantity: qty > 0 ? String(qty) : prev.quantity,
                    unitPrice: uPrice > 0 ? String(uPrice) : prev.unitPrice,
                    unitCost: uCost > 0 ? String(uCost) : prev.unitCost,
                    amount: totalAmt > 0 ? String(totalAmt) : prev.amount,
                    cost: totalCost > 0 ? String(totalCost) : prev.cost,
                    profit: nextType === 'sale' && totalAmt > 0 ? String(totalProfit) : prev.profit,
                    category: fields.category || prev.category,
                    notes: fields.notes || prev.notes,
                  }));
                  if (fields.reason) {
                    setEntryReason(fields.reason);
                  }
                }}
              />
            )}

            <label>
              হিসাবের ধরন
              <select
                value={entryForm.type}
                onChange={(e) => setEntryForm({ ...entryForm, type: e.target.value as RecordType })}
              >
                {Object.entries(typeLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>

            <label>
              বিবরণ / শিরোনাম
              <input
                required
                value={entryForm.title}
                placeholder="যেমন: মাসিক উত্তোলন বা মূলধন"
                onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
              />
            </label>

            {entryForm.type === 'sale' ? (
              <>
                <div style={{ background: currentAdmin?.username === 'Limon' ? '#faf5ff' : '#eff6ff', border: currentAdmin?.username === 'Limon' ? '1.5px solid #d8b4fe' : '1.5px solid #bfdbfe', borderRadius: '10px', padding: '10px 14px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Lock size={15} style={{ color: currentAdmin?.username === 'Limon' ? '#7e22ce' : '#1d4ed8' }} />
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 600 }}>বিক্রয়কারী বিক্রেতা (লগইন অ্যাকাউন্ট অনুযায়ী ফিক্সড):</span>
                      <strong style={{ fontSize: '14px', color: currentAdmin?.username === 'Limon' ? '#7e22ce' : '#1d4ed8' }}>
                        {currentAdmin?.username === 'Limon' ? '👤 লিমন (Limon)' : '👤 রাকিব (Rakib)'}
                      </strong>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', fontWeight: 700 }}>
                    🔒 অ্যাকাউন্ট সুরক্ষিত
                  </span>
                </div>
                <label>
                  পণ্য নির্বাচন (ঐচ্ছিক)
                  <select
                    value={entryForm.productId}
                    onChange={(e) => handleEntryProductChange(e.target.value)}
                  >
                    <option value="">কোনো নির্দিষ্ট পণ্য লিংক নেই (সাধারণ বিক্রয় / সেবা)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (মজুদ: {p.currentStock} {p.unit} | গড় কেনা দাম: {money(p.averageCost)})
                      </option>
                    ))}
                  </select>
                </label>

                {(() => {
                  const selectedProd = products.find((p) => p.id === entryForm.productId);
                  const numAmt = Number(entryForm.amount) || 0;
                  const numCost = Number(entryForm.cost) || 0;
                  const numProfit = entryForm.profit !== '' ? Number(entryForm.profit) : (numAmt > 0 && entryForm.cost !== '' ? numAmt - numCost : 0);
                  const profitMargin = numAmt > 0 ? ((numProfit / numAmt) * 100).toFixed(1) : '0';
                  const isLoss = numProfit < 0;

                  return (
                    <>
                      {selectedProd && (
                        <div className="full note" style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {selectedProd.imageUrl ? (
                            <img
                              src={selectedProd.imageUrl}
                              alt={selectedProd.name}
                              style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #7dd3fc', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0 }}>
                              <Package size={22} />
                            </div>
                          )}
                          <div>
                            <div>📦 <b>নির্বাচিত পণ্য:</b> {selectedProd.name}</div>
                            <div style={{ fontSize: '12px', marginTop: '2px', color: '#0369a1' }}>
                              বর্তমান মজুদ: <b>{selectedProd.currentStock} {selectedProd.unit}</b> | গড় ক্রয়মূল্য: <b>{money(selectedProd.averageCost)}</b> প্রতি {selectedProd.unit}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                        <label>
                          বিক্রয়ের পরিমাণ {selectedProd ? `(${selectedProd.unit})` : ''}
                          <input
                            type="number"
                            step="any"
                            placeholder="যেমন: ৮০"
                            value={entryForm.quantity}
                            onChange={(e) => handleEntryQuantityChange(e.target.value)}
                          />
                        </label>

                        <label>
                          একক বিক্রয় দর (৳)
                          <input
                            type="number"
                            step="0.01"
                            placeholder="যেমন: ১৫.০০"
                            value={entryForm.unitPrice}
                            onChange={(e) => handleEntryUnitPriceChange(e.target.value)}
                          />
                        </label>

                        <label>
                          একক ক্রয়মূল্য (৳)
                          <input
                            type="number"
                            step="0.01"
                            placeholder="যেমন: ১৩.১০"
                            value={entryForm.unitCost}
                            onChange={(e) => handleEntryUnitCostChange(e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                        <label>
                          মোট বিক্রয় মূল্য (৳) *
                          <input
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="যেমন: ১২০০.০০"
                            value={entryForm.amount}
                            onChange={(e) => handleEntryAmountChange(e.target.value)}
                          />
                        </label>

                        <label>
                          পণ্যের মোট ক্রয় খরচ (Cost ৳)
                          <input
                            type="number"
                            step="0.01"
                            placeholder="যেমন: ১০৪৮.০০"
                            value={entryForm.cost}
                            onChange={(e) => handleEntryCostChange(e.target.value)}
                          />
                        </label>

                        <label>
                          এই বিক্রয়ে নিট লাভ (Profit ৳)
                          <input
                            type="number"
                            step="0.01"
                            placeholder="যেমন: ১৫২.০০"
                            value={entryForm.profit}
                            onChange={(e) => handleEntryProfitChange(e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="full" style={{
                        background: isLoss ? '#fff1f2' : '#f0fdf4',
                        border: `1px solid ${isLoss ? '#fca5a5' : '#86efac'}`,
                        borderRadius: '10px',
                        padding: '12px 14px',
                        fontSize: '13px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: isLoss ? '#991b1b' : '#166534' }}>
                            📊 বিক্রয় ও লাভ-লোকসানের নিখুঁত হিসাব
                          </span>
                          {numAmt > 0 && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: isLoss ? '#fee2e2' : '#dcfce7',
                              color: isLoss ? '#b91c1c' : '#15803d'
                            }}>
                              {isLoss ? `ক্ষতি: ${profitMargin}%` : `লাভের হার: ${profitMargin}%`}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: '#ffffff', padding: '10px', borderRadius: '8px', border: `1px solid ${isLoss ? '#fecaca' : '#bbf7d0'}`, textAlign: 'center' }}>
                          <div>
                            <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>মোট বিক্রয় মূল্য</span>
                            <b style={{ fontSize: '14px', color: '#0f172a' }}>{money(numAmt)}</b>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>মোট ক্রয় খরচ (Cost)</span>
                            <b style={{ fontSize: '14px', color: '#b45309' }}>{money(numCost)}</b>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>নিট মুনাফা (Profit)</span>
                            <b style={{ fontSize: '14px', color: isLoss ? '#b91c1c' : '#15803d' }}>
                              {numProfit >= 0 ? '+' : ''}{money(numProfit)}
                            </b>
                          </div>
                        </div>

                        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: isLoss ? '#991b1b' : '#14532d', lineHeight: '1.5' }}>
                          💡 <b>মূলধনে প্রভাবের নিয়ম:</b> বিক্রয়মূল্যের ({money(numAmt)}) মধ্য থেকে কেবল <b>নিট {isLoss ? 'ক্ষতি' : 'লাভ'} ({money(numProfit)})</b> মূলধনের সাথে সমন্বয় হয়ে ক্যাশ ব্যালেন্স গঠিত হবে। ক্রয় খরচ ({money(numCost)}) মূলধনে বাড়তি যোগ হবে না।
                        </p>
                      </div>
                    </>
                  );
                })()}
              </>
            ) : entryForm.type === 'purchase' ? (
              <>
                <label>
                  পণ্য নির্বাচন (ঐচ্ছিক)
                  <select
                    value={entryForm.productId}
                    onChange={(e) => handleEntryProductChange(e.target.value)}
                  >
                    <option value="">কোনো নির্দিষ্ট পণ্য লিংক নেই (সাধারণ কেনাকাটা)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (মজুদ: {p.currentStock} {p.unit} | গড় কেনা দাম: {money(p.averageCost)})
                      </option>
                    ))}
                  </select>
                </label>

                {(() => {
                  const selectedProd = products.find((p) => p.id === entryForm.productId);
                  return (
                    <>
                      {selectedProd && (
                        <div className="full note" style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {selectedProd.imageUrl ? (
                            <img
                              src={selectedProd.imageUrl}
                              alt={selectedProd.name}
                              style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #7dd3fc', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0 }}>
                              <Package size={22} />
                            </div>
                          )}
                          <div>
                            <div>📦 <b>নির্বাচিত পণ্য:</b> {selectedProd.name}</div>
                            <div style={{ fontSize: '12px', marginTop: '2px', color: '#0369a1' }}>
                              বর্তমান স্টক: <b>{selectedProd.currentStock} {selectedProd.unit}</b>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                        <label>
                          ক্রয়ের পরিমাণ {selectedProd ? `(${selectedProd.unit})` : ''}
                          <input
                            type="number"
                            step="any"
                            placeholder="যেমন: ১০০"
                            value={entryForm.quantity}
                            onChange={(e) => handleEntryQuantityChange(e.target.value)}
                          />
                        </label>

                        <label>
                          একক ক্রয়মূল্য (৳)
                          <input
                            type="number"
                            step="0.01"
                            placeholder="যেমন: ১৩.১০"
                            value={entryForm.unitCost}
                            onChange={(e) => handleEntryUnitCostChange(e.target.value)}
                          />
                        </label>

                        <label>
                          মোট ক্রয়ের টাকা (৳) *
                          <input
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="যেমন: ১৩১০.০০"
                            value={entryForm.amount}
                            onChange={(e) => handleEntryAmountChange(e.target.value)}
                          />
                        </label>
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              <label>
                টাকার পরিমাণ (৳)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={entryForm.amount}
                  onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
                />
              </label>
            )}

            <label>
              তারিখ
              <input
                required
                type="date"
                value={entryForm.date}
                onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
              />
            </label>

            {(entryForm.type === 'investment' || entryForm.type === 'withdrawal' || entryForm.type === 'loan') && (
              <label>
                অংশীদার / ইনভেস্টর
                <select
                  required
                  value={entryForm.investorId}
                  onChange={(e) => setEntryForm({ ...entryForm, investorId: e.target.value })}
                >
                  <option value="">অংশীদার নির্বাচন করুন</option>
                  {investors.map((inv) => (
                    <option key={inv.id} value={inv.id}>{inv.name}</option>
                  ))}
                </select>
              </label>
            )}

            {entryForm.type === 'withdrawal' && entryForm.investorId && (() => {
              const pAcc = partnerAccounts.find(p => p.id === entryForm.investorId);
              return (
                <div className="full note" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                  🔒 <b>মূলধন ({money(pAcc?.capital || 0)}) উত্তোলনযোগ্য নয়।</b> শুধুমাত্র অর্জিত লাভ উত্তোলন করা যাবে। এই অংশীদারের বর্তমান <b>উত্তোলনযোগ্য লাভের সীমা: {money(pAcc?.withdrawableLimit || 0)}</b> (মোট লাভ: {money(pAcc?.allocatedProfit || 0)} − পূর্বের উত্তোলন: {money((pAcc?.withdrawals || 0) + (pAcc?.loans || 0))})
                </div>
              );
            })()}

            <label>
              স্ট্যাটাস
              <select
                value={entryForm.status}
                onChange={(e) => setEntryForm({ ...entryForm, status: e.target.value as EntryStatus })}
              >
                <option value="posted">পোস্টেড (Posted)</option>
                <option value="draft">ড্রাফট (Draft)</option>
              </select>
            </label>

            <label>
              ক্যাটাগরি
              <input
                placeholder="যেমন: মূলধন, খরচ"
                value={entryForm.category}
                onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })}
              />
            </label>

            <label className="full">
              নোট / মন্তব্য
              <textarea
                value={entryForm.notes}
                onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
              />
            </label>

            {currentAdmin && needsPartnerApproval && (
              <div className="full" style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                  🛡️ রাকিব (Rakib)-এর অনুমোদনের কারণ / নোট:
                  <input
                    placeholder="উদাঃ আজকের পণ্য বিক্রয় / নতুন স্টক ক্রয়..."
                    value={entryReason}
                    onChange={(e) => setEntryReason(e.target.value)}
                    style={{ background: '#ffffff' }}
                  />
                </label>
                <small style={{ color: '#0d9488', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                  এটি জমা দিলে {otherPartner.displayName}-এর অনুমোদনের পর মূল হিসাবে যুক্ত হবে।
                </small>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShowEntryModal(false)} disabled={busy}>বাতিল</button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="btn-spinner" />
                    <span>সংরক্ষণ হচ্ছে…</span>
                  </>
                ) : needsPartnerApproval ? (
                  `অনুমোদনের জন্য পাঠান (${otherPartner.displayName})`
                ) : editingEntry ? (
                  'আপডেট করুন'
                ) : (
                  'সংরক্ষণ করুন'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: ADD INVESTOR */}
      {showInvestorModal && (
        <Modal title="নতুন অংশীদার যোগ" close={() => setShowInvestorModal(false)}>
          <form className="form-grid" onSubmit={handleSaveInvestor}>
            {settings.enableVoiceInput !== false && (
              <VoiceFormAssistant
                formType="investor"
                title="✨ ভয়েসে নতুন অংশীদারের নাম ও ফোন নম্বর পূরণ করুন"
                placeholder="মুখে বলুন: যেমন 'নতুন অংশীদার তানভীর আহমেদ, ফোন ০১৭১১২২৩৩৪৪'"
                chips={[
                  { label: '👤 অংশীদার তানভীর', text: 'নতুন অংশীদার তানভীর আহমেদ ফোন ০১৭১১২২৩৩৪৪' },
                ]}
                onApplyFields={(fields) => {
                  if (fields.name) setInvestorName(fields.name);
                  if (fields.phone) setInvestorPhone(fields.phone);
                  if (fields.reason) setInvestorReason(fields.reason);
                }}
              />
            )}
            <label>
              অংশীদারের নাম
              <input
                required
                value={investorName}
                placeholder="যেমন: লিমন"
                onChange={(e) => setInvestorName(e.target.value)}
              />
            </label>
            <label>
              ফোন নম্বর
              <input
                value={investorPhone}
                placeholder="০১৭১১-xxxxxx"
                onChange={(e) => setInvestorPhone(e.target.value)}
              />
            </label>
            {currentAdmin && needsPartnerApproval && (
              <div className="full" style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                  🛡️ রাকিব (Rakib)-এর অনুমোদনের কারণ / নোট:
                  <input
                    placeholder="উদাঃ নতুন পার্টনার অন্তর্ভুক্তি..."
                    value={investorReason}
                    onChange={(e) => setInvestorReason(e.target.value)}
                    style={{ background: '#ffffff' }}
                  />
                </label>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShowInvestorModal(false)} disabled={busy}>বাতিল</button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="btn-spinner" />
                    <span>সংরক্ষণ হচ্ছে…</span>
                  </>
                ) : needsPartnerApproval ? (
                  `অনুমোদনের জন্য পাঠান (${otherPartner.displayName})`
                ) : (
                  'যোগ করুন'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: ADD / EDIT PRODUCT (SINGLE OR 5-6 PRODUCTS AVERAGE UPLOAD) */}
      {showProductModal && (
        <Modal
          title={
            editingProduct
              ? 'পণ্য সম্পাদনা ও ছবি'
              : productUploadMode === 'batch_avg'
              ? '৫-৬টি পণ্য গড় হিসাবে ক্রয়মূল্য ও বিক্রয়মূল্য আপলোড'
              : 'নতুন পণ্য যোগ (একটা করে আপলোড)'
          }
          close={() => setShowProductModal(false)}
        >
          {/* MODE SWITCHER TAB BAR (Only when adding new products) */}
          {!editingProduct && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                background: '#f1f5f9',
                padding: '6px',
                borderRadius: '12px',
                marginBottom: '16px',
                border: '1px solid #cbd5e1',
              }}
            >
              <button
                type="button"
                onClick={() => setProductUploadMode('single')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 12px',
                  borderRadius: '9px',
                  border: productUploadMode === 'single' ? '1.5px solid #0d9488' : '1px solid transparent',
                  background: productUploadMode === 'single' ? '#ffffff' : 'transparent',
                  color: productUploadMode === 'single' ? '#0f766e' : '#475569',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: productUploadMode === 'single' ? '0 2px 6px rgba(13, 148, 136, 0.15)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Plus size={16} /> একটা করে আপলোড (Single)
              </button>

              <button
                type="button"
                onClick={() => {
                  setProductUploadMode('batch_avg');
                  if (batchProductsForm.length < 5) {
                    setBatchProductsForm(createDefaultBatchRows(5));
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 12px',
                  borderRadius: '9px',
                  border: productUploadMode === 'batch_avg' ? '1.5px solid #0284c7' : '1px solid transparent',
                  background: productUploadMode === 'batch_avg' ? '#ffffff' : 'transparent',
                  color: productUploadMode === 'batch_avg' ? '#0369a1' : '#475569',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: productUploadMode === 'batch_avg' ? '0 2px 6px rgba(2, 132, 199, 0.15)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Boxes size={16} /> ৫-৬টি পণ্য গড় হিসাবে আপলোড
              </button>
            </div>
          )}

          {/* ✨ AI SMART PRODUCT UPLOAD ASSISTANT (SAVES TYPING TIME FOR SINGLE & 5-6 BATCH MODES) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f0fdfa 0%, #eff6ff 100%)',
              border: '1.5px solid #5eead4',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 2px 8px rgba(13, 148, 136, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="#0d9488" />
                {productUploadMode === 'batch_avg' && !editingProduct
                  ? '✨ AI ম্যাজিক লট অটো-ফিল (লেখালেখির সময় বাঁচান)'
                  : '✨ AI ম্যাজিক অটো-ফিল (ভয়েস, ১-লাইন টেক্সট বা ছবি স্ক্যান)'}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#ccfbf1',
                  color: '#115e59',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                ১ ক্লিকে সব ঘর পূরণ
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={aiProductPrompt}
                onChange={(e) => setAiProductPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAiParseProduct();
                  }
                }}
                placeholder={
                  productUploadMode === 'batch_avg' && !editingProduct
                    ? 'যেমন: কাকড়া ২০ কেজি, চিংড়ি ১৫ কেজি, ইলিশ ১০ কেজি, রুই ২৫ কেজি, কাতলা ১৫ কেজি মোট ২৫০০০ টাকা'
                    : 'যেমন: ৫০ কেজি কাকড়া কেনা ১৫০০০ টাকা, বিক্রি ৪২০ টাকা'
                }
                style={{
                  flex: 1,
                  minWidth: '180px',
                  background: '#ffffff',
                  border: '1px solid #99f6e4',
                  borderRadius: '8px',
                  padding: '8px 11px',
                  fontSize: '12.5px',
                }}
              />

              {settings.enableVoiceInput !== false && (
                <button
                  type="button"
                  onClick={handleStartVoiceInput}
                  disabled={isAiParsingProduct}
                  title="মুখে বলুন (বাংলা ভয়েস টাইপিং)"
                  style={{
                    background: isVoiceListening ? '#dc2626' : '#ffffff',
                    color: isVoiceListening ? '#ffffff' : '#0f766e',
                    border: '1px solid #0d9488',
                    borderRadius: '8px',
                    padding: '8px 11px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  🎙️ {isVoiceListening ? `থামান (${toBengaliNumerals(productVoiceSec)}s)` : 'মুখে বলুন'}
                </button>
              )}

              <label
                title="ভাউচার, ক্যাশ মেমো বা পণ্যের ছবি স্ক্যান করে অটো-ফিল করুন"
                style={{
                  background: '#ffffff',
                  color: '#0369a1',
                  border: '1px solid #38bdf8',
                  borderRadius: '8px',
                  padding: '8px 11px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  margin: 0,
                }}
              >
                <Camera size={14} /> রসিদ/ছবি স্ক্যান
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const compressed = await compressImage(file);
                        if (editingProduct || productUploadMode === 'single') {
                          setProductForm((prev) => ({ ...prev, imageUrl: compressed }));
                        }
                        await handleAiParseProduct(aiProductPrompt, compressed);
                      } catch {
                        setError('ছবি স্ক্যান করতে সমস্যা হয়েছে');
                      }
                    }
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => handleAiParseProduct()}
                disabled={isAiParsingProduct}
                style={{
                  background: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Sparkles size={14} />
                {isAiParsingProduct ? 'AI বসাচ্ছে…' : 'AI অটো-ফিল'}
              </button>
            </div>

            {/* 1-Click Instant Sample Chips to save typing */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px', color: '#475569' }}>
              <span style={{ fontWeight: 700 }}>⚡ ১-ক্লিক রেডি টেমপ্লেট:</span>
              {(productUploadMode === 'batch_avg' && !editingProduct
                ? [
                    {
                      label: '📦 ৫টি মাছ-কাকড়া লট',
                      text: 'কাকড়া ২০ কেজি কেনা ৩০০ বিক্রি ৪২০, গলদা চিংড়ি ১৫ কেজি কেনা ৫৫০ বিক্রি ৭০০, ইলিশ ১০ কেজি কেনা ৮০০ বিক্রি ১০০০, রুই মাছ ২৫ কেজি কেনা ২৬০ বিক্রি ৩৪০, কাতলা ১৫ কেজি কেনা ২৮০ বিক্রি ৩৬০',
                    },
                    {
                      label: '🦀 কাকড়া ও চিংড়ি লট (গড় ৩৫০৳)',
                      text: 'বড় কাকড়া ২৫ কেজি ৩৫০ টাকা, মাঝারি কাকড়া ৩০ কেজি ৩২০ টাকা, ছোট কাকড়া ২০ কেজি ২৫০ টাকা, বাগদা চিংড়ি ১৫ কেজি ৪৮০ টাকা, গলদা চিংড়ি ১০ কেজি ৫৫০ টাকা',
                    },
                  ]
                : [
                    { label: '🦀 কাকড়া ৫০ কেজি', text: 'সামুদ্রিক কাকড়া ৫০ কেজি মোট কেনা ১৫০০০ টাকা, বিক্রি ৪২০ টাকা' },
                    { label: '🦐 চিংড়ি ৩০ কেজি', text: 'গলদা চিংড়ি ৩০ কেজি কেনা ৫৫০ টাকা, বিক্রি ৭০০ টাকা' },
                    { label: '🐟 ইলিশ ২০ কেজি', text: 'পদ্মার ইলিশ ২০ কেজি কেনা ৮৫০ টাকা, বিক্রি ১০৫০ টাকা' },
                    { label: '🐟 রুই মাছ ৪০ কেজি', text: 'দেশি রুই মাছ ৪০ কেজি কেনা ২৬০ টাকা, বিক্রি ৩৪০ টাকা' },
                  ]
              ).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setAiProductPrompt(chip.text);
                    handleAiParseProduct(chip.text);
                  }}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #99f6e4',
                    color: '#0f766e',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {aiSummaryNote && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #99f6e4',
                  borderRadius: '7px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: '#0f766e',
                  fontWeight: 600,
                }}
              >
                {aiSummaryNote}
              </div>
            )}
          </div>

          {editingProduct || productUploadMode === 'single' ? (
            <form className="form-grid" onSubmit={handleSaveProduct}>
              {/* PRODUCT PHOTO SECTION */}
              <div className="full" style={{
                background: '#f8fafc',
                border: '1px dashed #cbd5e1',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ImageIcon size={16} color="#0d9488" /> পণ্যের ছবি (Product Photo)
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {productForm.imageUrl && productForm.imageUrl.startsWith('data:image/') && (
                      <button
                        type="button"
                        disabled={isAiParsingProduct}
                        onClick={() => handleAiParseProduct(aiProductPrompt, productForm.imageUrl)}
                        style={{
                          background: '#f0fdfa',
                          border: '1px solid #0d9488',
                          color: '#0f766e',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Sparkles size={12} /> ছবি থেকে নাম ও তথ্য বসান
                      </button>
                    )}
                    {productForm.imageUrl && (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => setProductForm({ ...productForm, imageUrl: '' })}
                      >
                        ছবি মুছুন
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  {productForm.imageUrl ? (
                    <div style={{ position: 'relative' }}>
                      <img
                        src={productForm.imageUrl}
                        alt="Product preview"
                        style={{
                          width: '74px',
                          height: '74px',
                          borderRadius: '10px',
                          objectFit: 'cover',
                          border: '2px solid #0d9488',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '74px',
                      height: '74px',
                      borderRadius: '10px',
                      background: '#e2e8f0',
                      border: '1px solid #cbd5e1',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b',
                      fontSize: '11px',
                      gap: '4px'
                    }}>
                      <Camera size={22} />
                      <span>ছবি নেই</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '200px' }}>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        background: '#0d9488',
                        color: '#ffffff',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        width: 'fit-content'
                      }}
                    >
                      <Camera size={16} /> ক্যামেরা / ডিভাইস থেকে ছবি আপলোড
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const compressed = await compressImage(file);
                              setProductForm((prev) => ({ ...prev, imageUrl: compressed }));
                              if (!productForm.name.trim()) {
                                await handleAiParseProduct(aiProductPrompt, compressed);
                              }
                            } catch (err) {
                              setError('ছবি প্রসেস করতে সমস্যা হয়েছে');
                            }
                          }
                        }}
                      />
                    </label>

                    <input
                      type="url"
                      placeholder="অথবা ছবির সরাসরি ওয়েব লিঙ্ক (URL) পেস্ট করুন..."
                      value={productForm.imageUrl.startsWith('data:') ? '' : productForm.imageUrl}
                      onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
                      style={{ fontSize: '12px', padding: '6px 10px' }}
                    />
                  </div>
                </div>

                {/* Quick Preset Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '12px', color: '#64748b' }}>
                  <span>দ্রুত আইকন ছবি:</span>
                  {[
                    { label: '🦀 কাকড়া', url: 'https://images.unsplash.com/photo-1548811579-017cf2a4268b?w=300&auto=format&fit=crop&q=80' },
                    { label: '🐟 মাছ', url: 'https://images.unsplash.com/photo-1534043464124-3be32fe00099?w=300&auto=format&fit=crop&q=80' },
                    { label: '🦐 চিংড়ি', url: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=300&auto=format&fit=crop&q=80' },
                    { label: '🥩 মাংস', url: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=300&auto=format&fit=crop&q=80' },
                    { label: '🥚 ডিম', url: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=300&auto=format&fit=crop&q=80' },
                    { label: '🥬 সবজি', url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&auto=format&fit=crop&q=80' },
                    { label: '📦 পণ্য', url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                      onClick={() => setProductForm({ ...productForm, imageUrl: preset.url })}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                পণ্যের নাম *
                <input
                  required
                  value={productForm.name}
                  placeholder="যেমন: কাকড়া"
                  onChange={(e) => {
                    const newName = e.target.value;
                    const suggested = autoSuggestFromProductName(newName);
                    setProductForm((prev) => ({
                      ...prev,
                      name: newName,
                      sku: prev.sku || suggested.sku || '',
                      unit: prev.unit === 'পিস' && suggested.unit ? suggested.unit : prev.unit,
                      imageUrl: prev.imageUrl || suggested.imageUrl || '',
                    }));
                  }}
                />
              </label>

              <label>
                SKU / কোড (A–Z / AA–GZ) *
                <select
                  value={
                    toStrictAllowedSkuClient(productForm.sku) ||
                    ALLOWED_SKU_CODES[products.length % ALLOWED_SKU_CODES.length] ||
                    'A'
                  }
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                >
                  {ALLOWED_SKU_CODES.map((code) => (
                    <option key={code} value={code}>
                      কোড: {code}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                একক (Unit)
                <input
                  value={productForm.unit}
                  placeholder="যেমন: পিস বা কেজি"
                  onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                />
              </label>

              <label>
                বর্তমান স্টক
                <input
                  type="number"
                  value={productForm.currentStock}
                  placeholder="0"
                  onChange={(e) => setProductForm({ ...productForm, currentStock: e.target.value })}
                />
              </label>

              <label>
                গড় ক্রয়মূল্য (৳)
                <input
                  type="number"
                  step="0.01"
                  value={productForm.averageCost}
                  placeholder="0.00"
                  onChange={(e) => setProductForm({ ...productForm, averageCost: e.target.value })}
                />
              </label>

              <label>
                বিক্রয়মূল্য (৳)
                <input
                  type="number"
                  step="0.01"
                  value={productForm.sellingPrice}
                  placeholder="0.00"
                  onChange={(e) => setProductForm({ ...productForm, sellingPrice: e.target.value })}
                />
              </label>

              {currentAdmin && needsPartnerApproval && (
                <div className="full" style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                  <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                    🛡️ রাকিব (Rakib)-এর অনুমোদনের কারণ / নোট (Reason for Approval):
                    <input
                      placeholder="উদাঃ নতুন স্টক ক্রয় / পণ্যের মূল্য পরিবর্তন..."
                      value={productReason}
                      onChange={(e) => setProductReason(e.target.value)}
                      style={{ background: '#ffffff' }}
                    />
                  </label>
                  <small style={{ color: '#0d9488', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                    এটি জমা দিলে {otherPartner.displayName}-এর অনুমোদনের পর ইনভেন্টরিতে যুক্ত হবে।
                  </small>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setShowProductModal(false)} disabled={busy}>বাতিল</button>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? (
                    <>
                      <span className="btn-spinner" />
                      <span>পণ্য সংরক্ষণ হচ্ছে…</span>
                    </>
                  ) : needsPartnerApproval ? (
                    `অনুমোদনের জন্য পাঠান (${otherPartner.displayName})`
                  ) : editingProduct ? (
                    'আপডেট করুন'
                  ) : (
                    'পণ্য সংরক্ষণ করুন'
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* SEPARATE FEATURE: 5-6 PRODUCTS AVERAGE COST & SELLING PRICE UPLOAD */
            <form onSubmit={handleSaveBatchProducts} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* LIVE AVERAGE COST & SELLING PRICE DASHBOARD */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                  border: '1.5px solid #7dd3fc',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Boxes size={18} color="#0284c7" />
                    <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0c4a6e' }}>
                      📊 ৫-৬টি পণ্যের স্বয়ংক্রিয় গড় ক্রয়মূল্য ও গড় বিক্রয়মূল্য হিসাব
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setBatchProductsForm(createDefaultBatchRows(5))}
                      style={{
                        background: batchProductsForm.length === 5 ? '#0284c7' : '#ffffff',
                        color: batchProductsForm.length === 5 ? '#ffffff' : '#0369a1',
                        border: '1px solid #7dd3fc',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ৫টি পণ্য সারি
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (batchProductsForm.length < 6) {
                          const extra = createDefaultBatchRows(6 - batchProductsForm.length);
                          setBatchProductsForm([...batchProductsForm, ...extra]);
                        } else {
                          setBatchProductsForm(batchProductsForm.slice(0, 6));
                        }
                      }}
                      style={{
                        background: batchProductsForm.length === 6 ? '#0284c7' : '#ffffff',
                        color: batchProductsForm.length === 6 ? '#ffffff' : '#0369a1',
                        border: '1px solid #7dd3fc',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ৬টি পণ্য সারি
                    </button>
                  </div>
                </div>

                {/* Live Calculated Average Cards */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      border: '1px solid #bae6fd',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>পূরণকৃত পণ্য</span>
                    <b style={{ fontSize: '15px', color: '#0f172a' }}>
                      {toBengaliNumerals(batchAverageSummary.validCount)} / {toBengaliNumerals(batchAverageSummary.totalRows)} টি
                    </b>
                  </div>

                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      border: '1px solid #bae6fd',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 600, display: 'block' }}>
                      গড় ক্রয়মূল্য (Avg Cost)
                    </span>
                    <b style={{ fontSize: '15px', color: '#b45309' }}>{money(batchAverageSummary.avgCost)}</b>
                  </div>

                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      border: '1px solid #bae6fd',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#0f766e', fontWeight: 600, display: 'block' }}>
                      গড় বিক্রয়মূল্য (Avg Sell)
                    </span>
                    <b style={{ fontSize: '15px', color: '#0f766e' }}>{money(batchAverageSummary.avgSellingPrice)}</b>
                  </div>

                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      border: '1px solid #bae6fd',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600, display: 'block' }}>
                      গড় সম্ভাব্য লাভ (প্রতি একক)
                    </span>
                    <b
                      style={{
                        fontSize: '15px',
                        color: batchAverageSummary.avgProfitPerUnit >= 0 ? '#15803d' : '#dc2626',
                      }}
                    >
                      {batchAverageSummary.avgProfitPerUnit >= 0 ? '+' : ''}
                      {money(batchAverageSummary.avgProfitPerUnit)}
                    </b>
                  </div>
                </div>

                {/* Quick Lot Total OR Direct Average Price Input Helper */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '9px',
                    padding: '10px 12px',
                    border: '1px dashed #38bdf8',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1' }}>
                    ⚡ দ্রুত গড় হিসাব টুল: (মোট দাম থেকে গড় বের করুন অথবা সব সারিতে এক ক্লিকে গড় দাম বসান)
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '8px',
                      alignItems: 'end',
                    }}
                  >
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', margin: 0 }}>
                      সব পণ্যের মোট কেনা দাম (৳)
                      <input
                        type="number"
                        step="0.01"
                        placeholder="যেমন: ১৫০০"
                        value={quickTotalLotCost}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickTotalLotCost(val);
                          const count = Math.max(
                            1,
                            batchProductsForm.filter((r) => r.name.trim()).length || batchProductsForm.length
                          );
                          const num = Number(val);
                          if (num > 0) {
                            const avg = String(Math.round((num / count) * 100) / 100);
                            setQuickDirectAvgCost(avg);
                            setBatchProductsForm((prev) => prev.map((row) => ({ ...row, averageCost: avg })));
                          }
                        }}
                        style={{ padding: '6px 8px', fontSize: '12.5px' }}
                      />
                    </label>

                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', margin: 0 }}>
                      সব পণ্যের মোট বিক্রয় দাম (৳)
                      <input
                        type="number"
                        step="0.01"
                        placeholder="যেমন: ২১০০"
                        value={quickTotalLotSell}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickTotalLotSell(val);
                          const count = Math.max(
                            1,
                            batchProductsForm.filter((r) => r.name.trim()).length || batchProductsForm.length
                          );
                          const num = Number(val);
                          if (num > 0) {
                            const avg = String(Math.round((num / count) * 100) / 100);
                            setQuickDirectAvgSell(avg);
                            setBatchProductsForm((prev) => prev.map((row) => ({ ...row, sellingPrice: avg })));
                          }
                        }}
                        style={{ padding: '6px 8px', fontSize: '12.5px' }}
                      />
                    </label>

                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#b45309', margin: 0 }}>
                      গড় ক্রয়মূল্য (৳) সব সারিতে
                      <input
                        type="number"
                        step="0.01"
                        placeholder="যেমন: ৩০০"
                        value={quickDirectAvgCost}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickDirectAvgCost(val);
                          setBatchProductsForm((prev) => prev.map((row) => ({ ...row, averageCost: val })));
                        }}
                        style={{ padding: '6px 8px', fontSize: '12.5px', borderColor: '#fcd34d' }}
                      />
                    </label>

                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#0f766e', margin: 0 }}>
                      গড় বিক্রয়মূল্য (৳) সব সারিতে
                      <input
                        type="number"
                        step="0.01"
                        placeholder="যেমন: ৪২০"
                        value={quickDirectAvgSell}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickDirectAvgSell(val);
                          setBatchProductsForm((prev) => prev.map((row) => ({ ...row, sellingPrice: val })));
                        }}
                        style={{ padding: '6px 8px', fontSize: '12.5px', borderColor: '#5eead4' }}
                      />
                    </label>
                  </div>

                  {/* Checkbox & One-Click Apply Calculated Average */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#0f172a',
                        cursor: 'pointer',
                        margin: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={useCalculatedAvgForAll}
                        onChange={(e) => setUseCalculatedAvgForAll(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#0284c7' }}
                      />
                      <span>
                        আপলোডের সময় সব পণ্যে গড় ক্রয়মূল্য ({money(batchAverageSummary.avgCost)}) ও গড় বিক্রয়মূল্য (
                        {money(batchAverageSummary.avgSellingPrice)}) সেট করুন
                      </span>
                    </label>

                    {(batchAverageSummary.avgCost > 0 || batchAverageSummary.avgSellingPrice > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setBatchProductsForm((prev) =>
                            prev.map((row) => ({
                              ...row,
                              averageCost:
                                batchAverageSummary.avgCost > 0
                                  ? String(batchAverageSummary.avgCost)
                                  : row.averageCost,
                              sellingPrice:
                                batchAverageSummary.avgSellingPrice > 0
                                  ? String(batchAverageSummary.avgSellingPrice)
                                  : row.sellingPrice,
                            }))
                          );
                        }}
                        style={{
                          background: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        সব সারিতে এই গড় মূল্য বসান
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 5-6 PRODUCT ROWS LIST */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {batchProductsForm.map((row, index) => (
                  <div
                    key={row.id}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                          }}
                        >
                          পণ্য #{toBengaliNumerals(index + 1)}
                        </span>

                        {/* Mini Photo Preview & Quick Icons for this row */}
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt=""
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              objectFit: 'cover',
                              border: '1.5px solid #0284c7',
                            }}
                          />
                        ) : null}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {[
                            { label: '🦀', url: 'https://images.unsplash.com/photo-1548811579-017cf2a4268b?w=300&auto=format&fit=crop&q=80', title: 'কাকড়া' },
                            { label: '🐟', url: 'https://images.unsplash.com/photo-1534043464124-3be32fe00099?w=300&auto=format&fit=crop&q=80', title: 'মাছ' },
                            { label: '🦐', url: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=300&auto=format&fit=crop&q=80', title: 'চিংড়ি' },
                            { label: '🥩', url: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=300&auto=format&fit=crop&q=80', title: 'মাংস' },
                            { label: '📦', url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80', title: 'পণ্য' },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              title={`${preset.title} ছবি সেট করুন`}
                              onClick={() =>
                                setBatchProductsForm((prev) =>
                                  prev.map((r, i) => (i === index ? { ...r, imageUrl: preset.url } : r))
                                )
                              }
                              style={{
                                background: row.imageUrl === preset.url ? '#e0f2fe' : '#ffffff',
                                border: row.imageUrl === preset.url ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                borderRadius: '5px',
                                padding: '2px 5px',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              {preset.label}
                            </button>
                          ))}

                          <label
                            title="গ্যালারি থেকে ছবি দিন"
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '5px',
                              padding: '2px 6px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              color: '#0f766e',
                              fontWeight: 600,
                            }}
                          >
                            <Camera size={12} /> ছবি
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    const compressed = await compressImage(file);
                                    setBatchProductsForm((prev) =>
                                      prev.map((r, i) => (i === index ? { ...r, imageUrl: compressed } : r))
                                    );
                                  } catch {
                                    setError('ছবি প্রসেস করতে সমস্যা হয়েছে');
                                  }
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      {batchProductsForm.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setBatchProductsForm((prev) => prev.filter((_, i) => i !== index))
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Trash2 size={13} /> মুছুন
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
                        gap: '8px',
                      }}
                    >
                      <label style={{ fontSize: '11.5px', margin: 0 }}>
                        পণ্যের নাম *
                        <input
                          placeholder={`যেমন: পণ্য ${toBengaliNumerals(index + 1)}`}
                          value={row.name}
                          onChange={(e) =>
                            setBatchProductsForm((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, name: e.target.value } : r))
                            )
                          }
                          style={{ padding: '6px 8px', fontSize: '12.5px' }}
                        />
                      </label>

                      <label style={{ fontSize: '11.5px', margin: 0 }}>
                        একক (Unit)
                        <input
                          placeholder="কেজি / পিস"
                          value={row.unit}
                          onChange={(e) =>
                            setBatchProductsForm((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, unit: e.target.value } : r))
                            )
                          }
                          style={{ padding: '6px 8px', fontSize: '12.5px' }}
                        />
                      </label>

                      <label style={{ fontSize: '11.5px', margin: 0 }}>
                        বর্তমান স্টক
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={row.currentStock}
                          onChange={(e) =>
                            setBatchProductsForm((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, currentStock: e.target.value } : r))
                            )
                          }
                          style={{ padding: '6px 8px', fontSize: '12.5px' }}
                        />
                      </label>

                      <label style={{ fontSize: '11.5px', margin: 0, color: '#b45309', fontWeight: 600 }}>
                        ক্রয়মূল্য (৳)
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={row.averageCost}
                          onChange={(e) =>
                            setBatchProductsForm((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, averageCost: e.target.value } : r))
                            )
                          }
                          style={{ padding: '6px 8px', fontSize: '12.5px' }}
                        />
                      </label>

                      <label style={{ fontSize: '11.5px', margin: 0, color: '#0f766e', fontWeight: 600 }}>
                        বিক্রয়মূল্য (৳)
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={row.sellingPrice}
                          onChange={(e) =>
                            setBatchProductsForm((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, sellingPrice: e.target.value } : r))
                            )
                          }
                          style={{ padding: '6px 8px', fontSize: '12.5px' }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setBatchProductsForm((prev) => [
                    ...prev,
                    {
                      id: `row-${Date.now()}-${prev.length}`,
                      name: '',
                      sku: '',
                      unit: 'কেজি',
                      currentStock: '',
                      averageCost:
                        batchAverageSummary.avgCost > 0 ? String(batchAverageSummary.avgCost) : '',
                      sellingPrice:
                        batchAverageSummary.avgSellingPrice > 0
                          ? String(batchAverageSummary.avgSellingPrice)
                          : '',
                      imageUrl: '',
                    },
                  ])
                }
                style={{
                  background: '#f8fafc',
                  border: '1.5px dashed #0284c7',
                  color: '#0284c7',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={15} /> আরও একটি পণ্যের সারি যোগ করুন (বর্তমানে {toBengaliNumerals(batchProductsForm.length)}টি)
              </button>

              {currentAdmin && needsPartnerApproval && (
                <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                  <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                    🛡️ রাকিব (Rakib)-এর অনুমোদনের কারণ / নোট (Reason for Approval):
                    <input
                      placeholder="উদাঃ ৫-৬টি পণ্য গড় হিসাবে নতুন স্টক আপলোড..."
                      value={productReason}
                      onChange={(e) => setProductReason(e.target.value)}
                      style={{ background: '#ffffff' }}
                    />
                  </label>
                  <small style={{ color: '#0d9488', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                    এটি জমা দিলে {otherPartner.displayName}-এর অনুমোদনের পর একসাথে সবগুলো পণ্য ইনভেন্টরিতে যুক্ত হবে।
                  </small>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setShowProductModal(false)} disabled={busy}>
                  বাতিল
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? (
                    <>
                      <span className="btn-spinner" />
                      <span>পণ্যগুলো আপলোড হচ্ছে…</span>
                    </>
                  ) : needsPartnerApproval ? (
                    `গড় হিসাবে ${toBengaliNumerals(batchAverageSummary.validCount || batchProductsForm.length)}টি পণ্য অনুমোদনের জন্য পাঠান`
                  ) : (
                    `গড় হিসাবে ${toBengaliNumerals(batchAverageSummary.validCount || batchProductsForm.length)}টি পণ্য সংরক্ষণ করুন`
                  )}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* MODAL: PROFIT DISTRIBUTION */}
      {showProfitModal && (
        <Modal title="মুনাফা বণ্টন" close={() => setShowProfitModal(false)}>
          <form className="form-grid" onSubmit={handleSaveProfitDistribution}>
            {settings.enableVoiceInput !== false && (
              <VoiceFormAssistant
                formType="distribution"
                title="✨ ভয়েসে মুনাফা বণ্টনের মেয়াদ ও টাকার পরিমাণ বলুন"
                placeholder="মুখে বলুন: যেমন 'অক্টোবর মাসের মুনাফা বণ্টন ১৫০০০ টাকা'"
                chips={[
                  { label: '📊 চলতি মাসের মুনাফা ১০০০০৳', text: 'চলতি মাসের মুনাফা বণ্টন ১০০০০ টাকা' },
                  { label: '📊 সাপ্তাহিক মুনাফা ৫০০০৳', text: 'সাপ্তাহিক মুনাফা বণ্টন ৫০০০ টাকা' },
                ]}
                onApplyFields={(fields) => {
                  if (fields.periodName) {
                    setDistributionForm((prev) => ({ ...prev, periodName: fields.periodName }));
                  }
                  if (fields.distributableAmount !== undefined && Number(fields.distributableAmount) > 0) {
                    setDistributionForm((prev) => ({
                      ...prev,
                      distributableAmount: String(fields.distributableAmount),
                    }));
                  }
                }}
              />
            )}
            <label>
              মেয়াদ
              <input
                required
                value={distributionForm.periodName}
                onChange={(e) => setDistributionForm({ ...distributionForm, periodName: e.target.value })}
              />
            </label>
            <label>
              বণ্টনযোগ্য টাকার পরিমাণ
              <input
                required
                type="number"
                step="0.01"
                value={distributionForm.distributableAmount}
                onChange={(e) => setDistributionForm({ ...distributionForm, distributableAmount: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShowProfitModal(false)} disabled={busy}>বাতিল</button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="btn-spinner" />
                    <span>সংরক্ষণ হচ্ছে…</span>
                  </>
                ) : (
                  'বণ্টন নিশ্চিত করুন'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: PARTNER ACCOUNT DETAILS */}
      {viewPartnerModal && (
        <Modal title={`পার্টনার হিসাব: ${viewPartnerModal.name}`} close={() => setViewPartnerModal(null)}>
          <div className="modal-body">
            <div className="preview-box" style={{ margin: 0 }}>
              <div className="modal-stat-grid-2">
                <div className="modal-stat-box">
                  <span>🔒 স্থির মূলধন বিনিয়োগ (উত্তোলনযোগ্য নয়)</span>
                  <b>{money(viewPartnerModal.capital)}</b>
                </div>
                <div className="modal-stat-box">
                  <span>মালিকানার শেয়ার %</span>
                  <b style={{ color: '#087f70' }}>{viewPartnerModal.share.toFixed(2)}%</b>
                </div>
                <div className="modal-stat-box">
                  <span>বরাদ্দকৃত মোট লাভ</span>
                  <b style={{ color: '#07845c' }}>+{money(viewPartnerModal.allocatedProfit)}</b>
                </div>
                <div className="modal-stat-box">
                  <span>মোট লাভ উত্তোলন</span>
                  <b style={{ color: '#b42318' }}>-{money(viewPartnerModal.withdrawals + viewPartnerModal.loans)}</b>
                </div>
              </div>
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ color: '#0f766e', fontSize: '12px', fontWeight: 700, display: 'block' }}>উত্তোলনযোগ্য অবশিষ্ট লাভ:</span>
                  <b style={{ display: 'block', fontSize: '20px', color: '#0d9488', marginTop: '2px' }}>
                    {money(viewPartnerModal.withdrawableLimit)}
                  </b>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>শুধু অর্জিত লাভ উত্তোলনযোগ্য</small>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '12px', display: 'block' }}>মোট ইক্যুইটি ব্যালেন্স (মূলধন সহ):</span>
                  <b style={{ display: 'block', fontSize: '18px', color: '#0f2438', marginTop: '2px' }}>
                    {money(viewPartnerModal.accountBalance)}
                  </b>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>স্থির মূলধন + অবশিষ্ট লাভ</small>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setViewPartnerModal(null)}>বন্ধ করুন</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: VIEW RECORD DETAILS */}
      {viewRecordModal && (
        <Modal title={`লেনদেন বিবরণ: ${viewRecordModal.title}`} close={() => setViewRecordModal(null)}>
          <div className="modal-body">
            <div className="preview-box" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <span className="type-pill">{typeLabels[viewRecordModal.type] || viewRecordModal.type}</span>
                <span className={`status ${viewRecordModal.status}`}>
                  {viewRecordModal.status === 'posted' ? 'পোস্টেড' : viewRecordModal.status === 'void' ? 'বাতিল' : 'ড্রাফট'}
                </span>
              </div>

              <div className="modal-stat-grid-2">
                <div className="modal-stat-box">
                  <span>তারিখ</span>
                  <b>{dateLabel(viewRecordModal.date)}</b>
                </div>
                <div className="modal-stat-box">
                  <span>মোট টাকার পরিমাণ</span>
                  <b style={{ color: viewRecordModal.type === 'sale' ? '#047857' : '#0f172a' }}>
                    {money(viewRecordModal.amount)}
                  </b>
                </div>
                {viewRecordModal.investorId && (
                  <div className="modal-stat-box">
                    <span>সংশ্লিষ্ট অংশীদার</span>
                    <b>{investors.find((i) => i.id === viewRecordModal.investorId)?.name || '—'}</b>
                  </div>
                )}
                {viewRecordModal.category && (
                  <div className="modal-stat-box">
                    <span>ক্যাটাগরি</span>
                    <b>{viewRecordModal.category}</b>
                  </div>
                )}
              </div>

              {viewRecordModal.type === 'sale' && (() => {
                const seller = getEntrySeller(viewRecordModal);
                return (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: seller === 'Limon' ? '#faf5ff' : '#eff6ff', borderRadius: '10px', border: seller === 'Limon' ? '1px solid #d8b4fe' : '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: seller === 'Limon' ? '#9333ea' : '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                        {seller === 'Limon' ? 'লি' : 'রা'}
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 600 }}>বিক্রয়কারী বিক্রেতা (Seller):</span>
                        <strong style={{ fontSize: '14px', color: seller === 'Limon' ? '#7e22ce' : '#1d4ed8' }}>
                          {seller === 'Limon' ? '👤 লিমন (Limon)' : seller === 'Rakib' ? '👤 রাকিব (Rakib)' : 'অনির্দিষ্ট বিক্রেতা'}
                        </strong>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#ffffff', border: '1px solid #cbd5e1', fontWeight: 600, color: '#475569' }}>
                      ক্যাশ ড্রয়ার সমন্বিত
                    </span>
                  </div>
                );
              })()}
              {viewRecordModal.productId && (() => {
                const lp = products.find((p) => p.id === viewRecordModal.productId);
                return (
                  <div style={{ marginTop: '12px', padding: '10px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {lp?.imageUrl && (
                      <img
                        src={lp.imageUrl}
                        alt={lp.name}
                        style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #cbd5e1', flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>পণ্য ও পরিমাণ:</span>
                      <b>{lp?.name || 'পণ্য'}</b>
                      {viewRecordModal.quantity ? ` — ${viewRecordModal.quantity} ${lp?.unit || 'টি'}` : ''}
                      {viewRecordModal.unitPrice ? ` (বিক্রয় দর: ${money(viewRecordModal.unitPrice)})` : ''}
                      {viewRecordModal.unitCost ? ` (ক্রয় দর: ${money(viewRecordModal.unitCost)})` : ''}
                    </div>
                  </div>
                );
              })()}

              {viewRecordModal.type === 'sale' && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #86efac' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#166534', marginBottom: '8px' }}>
                    📊 লাভ-ক্ষতির পূর্ণাঙ্গ বিশ্লেষণ:
                  </div>
                  <div className="modal-stat-grid-3">
                    <div className="modal-stat-box">
                      <span>মোট বিক্রয় মূল্য</span>
                      <b>{money(viewRecordModal.amount)}</b>
                    </div>
                    <div className="modal-stat-box">
                      <span>পণ্যের ক্রয় খরচ</span>
                      <b style={{ color: '#b45309' }}>{money(viewRecordModal.cogsAmount || 0)}</b>
                    </div>
                    <div className="modal-stat-box">
                      <span>অর্জিত নিট লাভ</span>
                      <b style={{ color: '#15803d' }}>
                        +{money(viewRecordModal.grossProfit !== undefined ? viewRecordModal.grossProfit : (viewRecordModal.profit !== undefined ? viewRecordModal.profit : Math.max(0, viewRecordModal.amount - (viewRecordModal.cogsAmount || 0))))}
                      </b>
                    </div>
                  </div>
                </div>
              )}

              {viewRecordModal.notes && (
                <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#475569', background: '#ffffff', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <b>মন্তব্য:</b> {viewRecordModal.notes}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setViewRecordModal(null)}>বন্ধ করুন</button>
              {admin && viewRecordModal.status !== 'void' && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const cur = viewRecordModal;
                    setViewRecordModal(null);
                    handleOpenEdit(cur);
                  }}
                >
                  <Edit3 size={15} /> সম্পাদনা করুন
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {showDeleteModal && (
        <Modal title="নিশ্চিতকরণ: রেকর্ড স্থায়ীভাবে ডিলিট" close={() => setShowDeleteModal(null)}>
          <div className="modal-body">
            <div className="preview-box modal-danger-box">
              <p className="modal-danger-lead">
                আপনি নিচের রেকর্ডটি সরাসরি ও স্থায়ীভাবে ডিলিট করতে যাচ্ছেন:
              </p>
              <h3 className="modal-danger-title">{showDeleteModal.title}</h3>
              <div className="modal-meta-pills">
                <span className="type-pill">{typeLabels[showDeleteModal.type] || showDeleteModal.type}</span>
                <span style={{ fontWeight: 800, color: '#b91c1c', fontSize: '14.5px' }}>{money(showDeleteModal.amount)}</span>
                <span style={{ color: '#64748b', fontSize: '12.5px' }}>({dateLabel(showDeleteModal.date)})</span>
                <span className={`status ${showDeleteModal.status}`}>
                  {showDeleteModal.status === 'posted' ? 'পোস্টেড' : showDeleteModal.status === 'void' ? 'বাতিল' : 'ড্রাফট'}
                </span>
              </div>
              {showDeleteModal.productId && showDeleteModal.quantity && (
                <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#b91c1c', lineHeight: 1.45 }}>
                  ℹ️ এই লেনদেনটি ডিলিট করলে সংশ্লিষ্ট পণ্যের স্টক পরিমাণ স্বয়ংক্রিয়ভাবে পুনঃসমন্বয় করা হবে।
                </p>
              )}
            </div>

            {currentAdmin && needsPartnerApproval && (
              <div className="modal-field">
                <label htmlFor="delete-entry-reason">
                  🛡️ ডিলিট করার কারণ লিখুন (আবশ্যক - রাকিবের অনুমোদনের জন্য):
                </label>
                <input
                  id="delete-entry-reason"
                  required
                  placeholder="উদাঃ ভুলবশত ডাবল এন্ট্রি হয়েছিল / হিসাব সংশোধন..."
                  value={deleteReasonInput}
                  onChange={(e) => setDeleteReasonInput(e.target.value)}
                />
                <small style={{ color: '#64748b', fontSize: '11.5px' }}>
                  {otherPartner.displayName}-এর অনুমোদনের পর এটি স্থায়ীভাবে মুছে যাবে।
                </small>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={handleConfirmDelete}
                disabled={busy || (needsPartnerApproval && !deleteReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>
                  {busy
                    ? 'ডিলিট প্রসেস হচ্ছে…'
                    : needsPartnerApproval
                    ? `ডিলিটের অনুমোদন পাঠান (${otherPartner.displayName})`
                    : 'স্থায়ীভাবে ডিলিট করুন'}
                </span>
              </button>

              {showDeleteModal.status === 'posted' && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const cur = showDeleteModal;
                    setShowDeleteModal(null);
                    setShowVoidModal(cur);
                    setVoidReasonInput('');
                  }}
                >
                  <RotateCcw size={15} />
                  <span>অথবা হিসাব রিভার্স (Void) করুন</span>
                </button>
              )}

              <button type="button" className="secondary" onClick={() => setShowDeleteModal(null)} disabled={busy}>
                বাতিল করুন
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: VOID / REVERSE */}
      {showVoidModal && (
        <Modal title="হিসাব বাতিল / রিভার্স করুন" close={() => setShowVoidModal(null)}>
          <div className="modal-body">
            <div className="preview-box" style={{ margin: 0 }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#0f2438' }}>
                {showVoidModal.title} — <span style={{ color: '#b91c1c' }}>{money(showVoidModal.amount)}</span>
              </h3>
              <small style={{ color: '#64748b' }}>তারিখ: {dateLabel(showVoidModal.date)}</small>
            </div>
            <div className="modal-field">
              <label htmlFor="void-reason-input">
                রিভার্স বা বাতিল করার কারণ {needsPartnerApproval ? '(আবশ্যক)' : '(ঐচ্ছিক)'}:
              </label>
              <input
                id="void-reason-input"
                required={needsPartnerApproval}
                placeholder="কারণ লিখুন..."
                value={voidReasonInput}
                onChange={(e) => setVoidReasonInput(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={handleConfirmVoid}
                disabled={busy || (needsPartnerApproval && !voidReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <RotateCcw size={15} />}
                <span>
                  {busy
                    ? 'রিভার্স প্রসেস হচ্ছে…'
                    : needsPartnerApproval
                    ? `রিভার্সের অনুমোদন পাঠান (${otherPartner.displayName})`
                    : 'রিভার্স নিশ্চিত করুন'}
                </span>
              </button>
              <button type="button" className="secondary" onClick={() => setShowVoidModal(null)} disabled={busy}>ফিরে যান</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: INVESTOR DELETE CONFIRMATION */}
      {showInvestorDeleteModal && (
        <Modal title="অংশীদার ডিলিট নিশ্চিতকরণ" close={() => setShowInvestorDeleteModal(null)}>
          <div className="modal-body">
            <div className="preview-box modal-danger-box">
              <p className="modal-danger-lead">
                আপনি নিচের অংশীদারকে স্থায়ীভাবে সিস্টেম থেকে মুছে ফেলতে যাচ্ছেন:
              </p>
              <h3 className="modal-danger-title">{showInvestorDeleteModal.name}</h3>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#475569' }}>
                ফোন: {showInvestorDeleteModal.phone || '—'}
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#b91c1c' }}>
                সতর্কবার্তা: এই অংশীদারকে ডিলিট করলে অংশীদার তালিকা থেকে তিনি বাদ পড়বেন।
              </p>
            </div>
            {currentAdmin && needsPartnerApproval && (
              <div className="modal-field">
                <label htmlFor="delete-investor-reason">🛡️ ডিলিটের কারণ লিখুন (আবশ্যক):</label>
                <input
                  id="delete-investor-reason"
                  required
                  placeholder="উদাঃ পার্টনারশিপ সমাপ্তি / ভুল এন্ট্রি..."
                  value={deleteReasonInput}
                  onChange={(e) => setDeleteReasonInput(e.target.value)}
                />
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={handleConfirmDeleteInvestor}
                disabled={busy || (needsPartnerApproval && !deleteReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>
                  {busy
                    ? 'ডিলিট প্রসেস হচ্ছে…'
                    : needsPartnerApproval
                    ? `ডিলিটের অনুমোদন পাঠান (${otherPartner.displayName})`
                    : 'অংশীদার ডিলিট নিশ্চিত করুন'}
                </span>
              </button>
              <button type="button" className="secondary" onClick={() => setShowInvestorDeleteModal(null)} disabled={busy}>বাতিল করুন</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: PRODUCT DELETE CONFIRMATION */}
      {showProductDeleteModal && (
        <Modal title="পণ্য ডিলিট নিশ্চিতকরণ" close={() => setShowProductDeleteModal(null)}>
          <div className="modal-body">
            <div className="preview-box modal-danger-box">
              <p className="modal-danger-lead">
                আপনি নিচের পণ্যটি ইনভেন্টরি থেকে মুছে ফেলতে যাচ্ছেন:
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '10px 0 8px 0' }}>
                {showProductDeleteModal.imageUrl && (
                  <img
                    src={showProductDeleteModal.imageUrl}
                    alt={showProductDeleteModal.name}
                    style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #fca5a5', flexShrink: 0 }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <h3 className="modal-danger-title" style={{ margin: 0 }}>{showProductDeleteModal.name}</h3>
                  {showProductDeleteModal.sku && <small style={{ color: '#64748b' }}>SKU: {showProductDeleteModal.sku}</small>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '13px', color: '#475569' }}>
                <span>স্টক: <b>{showProductDeleteModal.currentStock} {showProductDeleteModal.unit}</b></span>
                <span>গড় ক্রয়মূল্য: <b>{money(showProductDeleteModal.averageCost)}</b></span>
              </div>
            </div>
            {currentAdmin && needsPartnerApproval && (
              <div className="modal-field">
                <label htmlFor="delete-product-reason">🛡️ পণ্য ডিলিটের কারণ লিখুন (আবশ্যক):</label>
                <input
                  id="delete-product-reason"
                  required
                  placeholder="উদাঃ মেয়াদোত্তীর্ণ পণ্য / বিক্রয় বন্ধ / ভুল পণ্য..."
                  value={deleteReasonInput}
                  onChange={(e) => setDeleteReasonInput(e.target.value)}
                />
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={handleConfirmDeleteProduct}
                disabled={busy || (needsPartnerApproval && !deleteReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>
                  {busy
                    ? 'পণ্য ডিলিট হচ্ছে…'
                    : needsPartnerApproval
                    ? `ডিলিটের অনুমোদন পাঠান (${otherPartner.displayName})`
                    : 'পণ্য ডিলিট নিশ্চিত করুন'}
                </span>
              </button>
              <button type="button" className="secondary" onClick={() => setShowProductDeleteModal(null)} disabled={busy}>বাতিল করুন</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: DISTRIBUTION DELETE CONFIRMATION */}
      {showDistributionDeleteModal && (
        <Modal title="মুনাফা বণ্টন ডিলিট নিশ্চিতকরণ" close={() => setShowDistributionDeleteModal(null)}>
          <div className="modal-body">
            <div className="preview-box modal-danger-box">
              <p className="modal-danger-lead">
                আপনি নিচের মুনাফা বণ্টন রেকর্ডটি মুছে ফেলতে যাচ্ছেন:
              </p>
              <h3 className="modal-danger-title">{showDistributionDeleteModal.periodName}</h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569' }}>
                বণ্টনকৃত মোট অর্থ: <b style={{ color: '#087f70' }}>{money(showDistributionDeleteModal.distributedAmount)}</b>
              </p>
            </div>
            {currentAdmin && needsPartnerApproval && (
              <div className="modal-field">
                <label htmlFor="delete-dist-reason">🛡️ ডিলিটের কারণ লিখুন (আবশ্যক):</label>
                <input
                  id="delete-dist-reason"
                  required
                  placeholder="কারণ লিখুন..."
                  value={deleteReasonInput}
                  onChange={(e) => setDeleteReasonInput(e.target.value)}
                />
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={handleConfirmDeleteDistribution}
                disabled={busy || (needsPartnerApproval && !deleteReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>
                  {busy
                    ? 'ডিলিট হচ্ছে…'
                    : needsPartnerApproval
                    ? `ডিলিটের অনুমোদন পাঠান (${otherPartner.displayName})`
                    : 'বণ্টন ডিলিট নিশ্চিত করুন'}
                </span>
              </button>
              <button type="button" className="secondary" onClick={() => setShowDistributionDeleteModal(null)} disabled={busy}>বাতিল করুন</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: FULL WEBSITE DATA RESET */}
      {showResetDataModal && (
        <Modal
          title="সতর্কবার্তা: সম্পূর্ণ ওয়েবসাইট ডেটা রিসেট"
          close={() => {
            setShowResetDataModal(false);
            setResetPasswordInput('');
            setResetPasswordError('');
            setShowResetPass(false);
          }}
        >
          <form className="modal-body" onSubmit={handleConfirmResetWebsiteData}>
            <div className="preview-box modal-danger-box">
              <h3 className="modal-danger-title" style={{ marginTop: 0 }}>আপনি কি সম্পূর্ণ ওয়েবসাইট রিসেট করতে চান?</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#7f1d1d', lineHeight: 1.6 }}>
                সতর্কবার্তা: এই অপশনটি নিশ্চিত করলে সিস্টেমের সমস্ত লেনদেন, বিনিয়োগকারী/অংশীদার, পণ্য তালিকা, ইনভেন্টরি স্টক, মুনাফা বণ্টন এবং অডিট লগ চিরতরে মুছে যাবে। এই প্রক্রিয়াটি অপরিবর্তনীয়।
              </p>
            </div>

            <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={15} color="#dc2626" /> রিসেট নিশ্চিত করতে সিকিউরিটি পাসওয়ার্ড দিন:
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showResetPass ? 'text' : 'password'}
                  value={resetPasswordInput}
                  onChange={(e) => {
                    setResetPasswordInput(e.target.value);
                    if (resetPasswordError) setResetPasswordError('');
                  }}
                  placeholder="সিকিউরিটি পাসওয়ার্ড লিখুন..."
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    borderRadius: '8px',
                    border: resetPasswordError ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowResetPass((prev) => !prev)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    padding: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={showResetPass ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                >
                  {showResetPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {resetPasswordError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '12.5px', fontWeight: 600 }}>
                  <AlertTriangle size={14} /> {resetPasswordError}
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                type="submit"
                className="danger"
                disabled={busy || !resetPasswordInput.trim()}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>{busy ? 'সমস্ত ডেটা রিসেট হচ্ছে…' : 'হ্যাঁ, সমস্ত ডেটা স্থায়ীভাবে রিসেট করুন'}</span>
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setShowResetDataModal(false);
                  setResetPasswordInput('');
                  setResetPasswordError('');
                  setShowResetPass(false);
                }}
                disabled={busy}
              >
                বাতিল করুন
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: BULK DELETE DRAFTS */}
      {showBulkDeleteModal && (
        <Modal title="বাল্ক ডিলিট নিশ্চিতকরণ" close={() => setShowBulkDeleteModal(false)}>
          <div className="modal-body">
            <div className="preview-box modal-danger-box">
              <h3 className="modal-danger-title" style={{ marginTop: 0 }}>
                নির্বাচিত {selectedIds.length}টি রেকর্ড স্থায়ীভাবে মুছে ফেলতে চান?
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#7f1d1d' }}>
                নির্বাচিত রেকর্ডগুলো ডাটাবেস থেকে স্থায়ীভাবে মুছে ফেলা হবে।
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="danger" onClick={handleConfirmBulkDelete} disabled={busy}>
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>{busy ? 'ডিলিট করা হচ্ছে…' : 'স্থায়ীভাবে ডিলিট করুন'}</span>
              </button>
              <button type="button" className="secondary" onClick={() => setShowBulkDeleteModal(false)} disabled={busy}>বাতিল করুন</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: RECORD WASTE / DAMAGED GOODS (নষ্ট বা ক্ষতিগ্রস্থ পণ্য) */}
      {showWasteModal && currentAdmin && (
        <Modal title="📦 নষ্ট বা ক্ষতিগ্রস্থ পণ্য রেকর্ড (Waste / Damaged Goods)" close={() => setShowWasteModal(false)}>
          <form className="modal-body" onSubmit={handleSaveWaste}>
            {settings.enableVoiceInput !== false && (
              <VoiceFormAssistant
                formType="waste"
                title="✨ ভয়েসে নষ্ট বা ক্ষতিগ্রস্থ পণ্যের হিসাব পূরণ করুন"
                placeholder="মুখে বলুন: যেমন '৫ কেজি সামুদ্রিক কাকড়া পচে নষ্ট হয়ে গেছে, কার্টনে পানি লেগেছিল'"
                chips={[
                  { label: '🦀 ৩ কেজি কাকড়া পচে নষ্ট', text: '৩ কেজি সামুদ্রিক কাকড়া পচে নষ্ট হয়ে গেছে' },
                  { label: '📦 ২ কেজি পণ্য পরিবহনে ক্ষতিগ্রস্থ', text: '২ কেজি পণ্য পরিবহনে ক্ষতিগ্রস্থ হয়েছে' },
                ]}
                products={products}
                onApplyFields={(fields) => {
                  const selId = fields.productId || wasteForm.productId || products[0]?.id || '';
                  const matchedP = products.find((prod) => prod.id === selId);
                  const qty = fields.quantity && Number(fields.quantity) > 0 ? Number(fields.quantity) : Number(wasteForm.quantity) || 0;
                  const computedLoss =
                    fields.lossAmount && Number(fields.lossAmount) > 0
                      ? Number(fields.lossAmount)
                      : matchedP && qty > 0
                      ? Math.round(qty * (matchedP.averageCost || 0) * 100) / 100
                      : 0;
                  setWasteForm((prev) => ({
                    ...prev,
                    productId: selId,
                    quantity: qty > 0 ? String(qty) : prev.quantity,
                    lossAmount: computedLoss > 0 ? String(computedLoss) : prev.lossAmount,
                    reason: fields.reason || prev.reason,
                    notes: fields.notes || prev.notes,
                  }));
                }}
              />
            )}
            <div
              style={{
                background: needsPartnerApproval ? '#fff1f2' : '#f0fdf4',
                border: `1.5px solid ${needsPartnerApproval ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: '10px',
                padding: '12px 14px',
                fontSize: '12.5px',
                color: needsPartnerApproval ? '#991b1b' : '#166534',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                {needsPartnerApproval ? (
                  <>
                    <b>অনুমোদন শর্ত:</b> নষ্ট বা ক্ষতিগ্রস্থ পণ্য এন্ট্রি দিলে {otherPartner.displayName}-এর কাছে অনুমোদনের অনুরোধ যাবে। তিনি অনুমোদন দিলে স্বয়ংক্রিয়ভাবে স্টক থেকে মাইনাস হবে এবং ব্যবসায়িক খরচে যুক্ত হবে।
                  </>
                ) : (
                  <>
                    <b>সরাসরি কার্যকর:</b> রাকিব (Rakib) হিসেবে নষ্ট পণ্য এন্ট্রি দিলে লিমনের অনুমোদন ছাড়াই তাৎক্ষণিকভাবে স্টক থেকে মাইনাস হবে এবং খরচে যুক্ত হবে।
                  </>
                )}
              </div>
            </div>

            <div className="modal-field" style={{ marginTop: '12px' }}>
              <label htmlFor="waste-product-select">পণ্য নির্বাচন করুন (আবশ্যক):</label>
              <select
                id="waste-product-select"
                required
                value={wasteForm.productId}
                onChange={(e) => {
                  const selId = e.target.value;
                  const p = products.find((prod) => prod.id === selId);
                  const qty = Number(wasteForm.quantity) || 0;
                  setWasteForm((prev) => ({
                    ...prev,
                    productId: selId,
                    lossAmount: p && qty > 0 ? String(Math.round(qty * (p.averageCost || 0) * 100) / 100) : prev.lossAmount,
                  }));
                }}
              >
                <option value="">-- পণ্য বেছে নিন --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (বর্তমান স্টক: {p.currentStock} {p.unit} | গড় ক্রয়মূল্য: ৳{p.averageCost})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid-2">
              <div className="modal-field">
                <label htmlFor="waste-qty">নষ্টের পরিমাণ (আবশ্যক):</label>
                <input
                  id="waste-qty"
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="উদাঃ 5"
                  value={wasteForm.quantity}
                  onChange={(e) => {
                    const qVal = e.target.value;
                    const qNum = Number(qVal) || 0;
                    const p = products.find((prod) => prod.id === wasteForm.productId);
                    const calculatedLoss = p && qNum > 0 ? String(Math.round(qNum * (p.averageCost || 0) * 100) / 100) : '';
                    setWasteForm((prev) => ({
                      ...prev,
                      quantity: qVal,
                      lossAmount: calculatedLoss,
                    }));
                  }}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="waste-reason">নষ্ট হওয়ার কারণ:</label>
                <select
                  id="waste-reason"
                  value={wasteForm.reason}
                  onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })}
                >
                  <option value="মেয়াদোত্তীর্ণ (Expired)">মেয়াদোত্তীর্ণ (Expired)</option>
                  <option value="ভাঙা / ত্রুটিপূর্ণ (Broken/Defective)">ভাঙা / ত্রুটিপূর্ণ (Broken/Defective)</option>
                  <option value="পচে যাওয়া / নষ্ট (Spoiled/Rotten)">পচে যাওয়া / নষ্ট (Spoiled/Rotten)</option>
                  <option value="পরিবহনে ক্ষতিগ্রস্থ (Transit Damage)">পরিবহনে ক্ষতিগ্রস্থ (Transit Damage)</option>
                  <option value="অন্যান্য কারণ (Other)">অন্যান্য কারণ (Other)</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="modal-field">
                <label htmlFor="waste-loss-amount">আনুমানিক আর্থিক ক্ষতি (৳):</label>
                <input
                  id="waste-loss-amount"
                  type="number"
                  step="any"
                  placeholder="গড় ক্রয়মূল্য অনুযায়ী স্বয়ংক্রিয়"
                  value={wasteForm.lossAmount}
                  onChange={(e) => setWasteForm({ ...wasteForm, lossAmount: e.target.value })}
                />
                <small style={{ color: '#64748b', fontSize: '11px' }}>
                  গড় ক্রয়মূল্য × পরিমাণের ভিত্তিতে স্বয়ংক্রিয়ভাবে হিসাবকৃত
                </small>
              </div>

              <div className="modal-field">
                <label htmlFor="waste-date">তারিখ:</label>
                <input
                  id="waste-date"
                  type="date"
                  value={wasteForm.date}
                  onChange={(e) => setWasteForm({ ...wasteForm, date: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-field">
              <label htmlFor="waste-notes">বিস্তারিত নোট / কারণ ব্যাখ্যা:</label>
              <textarea
                id="waste-notes"
                rows={2}
                placeholder="যেমন: কার্টনে পানি লেগে পণ্য নষ্ট হয়েছে..."
                value={wasteForm.notes}
                onChange={(e) => setWasteForm({ ...wasteForm, notes: e.target.value })}
              />
            </div>

            <div className="modal-actions">
              <button
                type="submit"
                className="primary"
                style={{ background: '#e11d48', borderColor: '#e11d48' }}
                disabled={busy || !wasteForm.productId || !wasteForm.quantity}
              >
                {busy ? <span className="btn-spinner" /> : <AlertTriangle size={16} />}
                <span>
                  {busy
                    ? 'প্রসেস হচ্ছে…'
                    : needsPartnerApproval
                    ? `নষ্ট পণ্যের অনুমোদন পাঠান (${otherPartner.displayName})`
                    : 'নষ্ট পণ্য রেকর্ড নিশ্চিত করুন'}
                </span>
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowWasteModal(false)}
                disabled={busy}
              >
                বাতিল করুন
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: DEDICATED NOTIFICATIONS & DUAL-APPROVAL CENTER */}
      {showNotificationModal && currentAdmin && (() => {
        const myUname = currentAdmin.username.toLowerCase();
        const pendingForMeList = approvalRequests.filter(
          (r) =>
            r.status === 'pending' &&
            (r.targetApprover?.toLowerCase() === myUname ||
              (r.requestedBy?.toLowerCase() !== myUname && (!r.targetApprover || r.targetApprover.trim() === '')))
        );
        const mySentPendingList = approvalRequests.filter(
          (r) => r.status === 'pending' && r.requestedBy?.toLowerCase() === myUname
        );
        const completedRequestsList = approvalRequests.filter((r) => r.status !== 'pending').slice(0, 15);

        const actionLabelMap: Record<string, { label: string; isDelete?: boolean }> = {
          create_entry: { label: 'নতুন লেনদেন যুক্ত' },
          edit_entry: { label: 'লেনদেন সংশোধন' },
          delete_entry: { label: 'লেনদেন ডিলিট', isDelete: true },
          create_product: { label: 'নতুন পণ্য যুক্ত' },
          edit_product: { label: 'পণ্য/স্টক আপডেট' },
          delete_product: { label: 'পণ্য ডিলিট', isDelete: true },
          create_investor: { label: 'নতুন অংশীদার যুক্ত' },
          edit_investor: { label: 'অংশীদার আপডেট' },
          delete_investor: { label: 'অংশীদার ডিলিট', isDelete: true },
          distribute_profit: { label: 'মুনাফা বণ্টন' },
          record_waste: { label: 'নষ্ট/ক্ষতিগ্রস্থ পণ্য', isDelete: true },
        };

        return (
          <Modal
            title="🔔 নোটিফিকেশন ও অনুমোদন কেন্দ্র"
            close={() => {
              setShowNotificationModal(false);
              setNotifRejectingId(null);
              setNotifRejectReason('');
            }}
          >
            <div className="modal-body" style={{ display: 'grid', gap: '14px' }}>
              {/* Sub-Navigation Pills */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '6px',
                  background: '#f1f5f9',
                  padding: '5px',
                  borderRadius: '10px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setNotifTab('pending_for_me')}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: notifTab === 'pending_for_me' ? '#0d9488' : 'transparent',
                    color: notifTab === 'pending_for_me' ? '#ffffff' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                  }}
                >
                  <span>অনুমোদন বাকি</span>
                  <span
                    style={{
                      background: notifTab === 'pending_for_me' ? '#ffffff' : pendingForMeList.length > 0 ? '#ef4444' : '#cbd5e1',
                      color: notifTab === 'pending_for_me' ? '#0d9488' : pendingForMeList.length > 0 ? '#ffffff' : '#334155',
                      borderRadius: '999px',
                      padding: '1px 6px',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                  >
                    {pendingForMeList.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNotifTab('recent_activity')}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: notifTab === 'recent_activity' ? '#0d9488' : 'transparent',
                    color: notifTab === 'recent_activity' ? '#ffffff' : '#475569',
                  }}
                >
                  সাম্প্রতিক নোটিফিকেশন
                </button>

                <button
                  type="button"
                  onClick={() => setNotifTab('my_sent')}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: notifTab === 'my_sent' ? '#0d9488' : 'transparent',
                    color: notifTab === 'my_sent' ? '#ffffff' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                  }}
                >
                  <span>পাঠানো অনুরোধ</span>
                  {mySentPendingList.length > 0 && (
                    <span
                      style={{
                        background: notifTab === 'my_sent' ? '#ffffff' : '#f59e0b',
                        color: notifTab === 'my_sent' ? '#0d9488' : '#ffffff',
                        borderRadius: '999px',
                        padding: '1px 6px',
                        fontSize: '11px',
                        fontWeight: 800,
                      }}
                    >
                      {mySentPendingList.length}
                    </span>
                  )}
                </button>
              </div>

              {/* TAB 1: PENDING APPROVALS FOR CURRENT ADMIN */}
              {notifTab === 'pending_for_me' && (
                <div style={{ display: 'grid', gap: '12px', maxHeight: '62vh', overflowY: 'auto', paddingRight: '2px' }}>
                  {pendingForMeList.length === 0 ? (
                    <div
                      style={{
                        padding: '28px 16px',
                        textAlign: 'center',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        border: '1px dashed #cbd5e1',
                      }}
                    >
                      <CheckCircle2 size={34} style={{ color: '#10b981', margin: '0 auto 8px', display: 'block' }} />
                      <h4 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '15px' }}>
                        আপনার অনুমোদনের জন্য কোনো অপেক্ষমান অনুরোধ নেই
                      </h4>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px', lineHeight: 1.5 }}>
                        {otherPartner.displayName} যখন নতুন কোনো হিসাব, উত্তোলন বা পণ্য যোগ/ডিলিট করার অনুরোধ পাঠাবেন, তা সাথে সাথে এখানে দেখা যাবে।
                      </p>
                    </div>
                  ) : (
                    pendingForMeList.map((req) => {
                      const meta = actionLabelMap[req.actionType] || { label: req.actionType };
                      const isRejectingThis = notifRejectingId === req.id;

                      return (
                        <div
                          key={req.id}
                          style={{
                            border: `1.5px solid ${meta.isDelete ? '#fca5a5' : '#99f6e4'}`,
                            background: meta.isDelete ? '#fff1f2' : '#f0fdfa',
                            borderRadius: '12px',
                            padding: '14px',
                            display: 'grid',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                            <div>
                              <span
                                className="badge"
                                style={{
                                  background: meta.isDelete ? '#fee2e2' : '#ccfbf1',
                                  color: meta.isDelete ? '#b91c1c' : '#0f766e',
                                  marginBottom: '4px',
                                  display: 'inline-block',
                                }}
                              >
                                {meta.label}
                              </span>
                              <h4 style={{ margin: 0, fontSize: '14.5px', color: '#0f172a', fontWeight: 700 }}>
                                {req.title}
                              </h4>
                            </div>
                            <small style={{ color: '#64748b', fontSize: '11.5px' }}>
                              {req.requestedAtFormatted}
                            </small>
                          </div>

                          <div
                            style={{
                              background: '#ffffff',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              border: '1px solid #e2e8f0',
                              fontSize: '12.5px',
                              color: '#334155',
                              display: 'grid',
                              gap: '4px',
                            }}
                          >
                            <div>
                              <b>অনুরোধকারী:</b> {req.requestedByName}
                            </div>
                            <div>
                              <b>বিবরণ:</b> {req.description}
                            </div>
                            {req.reason && (
                              <div style={{ color: '#047857' }}>
                                <b>কারণ / নোট:</b> "{req.reason}"
                              </div>
                            )}
                          </div>

                          {isRejectingThis ? (
                            <div style={{ display: 'grid', gap: '8px', background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                              <input
                                placeholder="বাতিল করার কারণ লিখুন..."
                                value={notifRejectReason}
                                onChange={(e) => setNotifRejectReason(e.target.value)}
                                style={{ fontSize: '12.5px', padding: '8px 10px' }}
                              />
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="secondary"
                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                  onClick={() => {
                                    setNotifRejectingId(null);
                                    setNotifRejectReason('');
                                  }}
                                >
                                  ফিরে যান
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                  disabled={busy || !notifRejectReason.trim()}
                                  onClick={async () => {
                                    await handleRejectRequest(req, notifRejectReason.trim());
                                    setNotifRejectingId(null);
                                    setNotifRejectReason('');
                                  }}
                                >
                                  {busy ? <span className="btn-spinner" /> : null}
                                  <span>{busy ? 'বাতিল হচ্ছে…' : 'নিশ্চিত বাতিল করুন'}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="primary"
                                style={{ flex: 1, justifyContent: 'center', padding: '9px 12px', fontSize: '12.5px' }}
                                disabled={busy}
                                onClick={() => handleApproveRequest(req)}
                              >
                                {busy ? <span className="btn-spinner" /> : <CheckCircle2 size={15} />}
                                <span>{busy ? 'কার্যকর হচ্ছে…' : 'অনুমোদন করুন'}</span>
                              </button>
                              <button
                                type="button"
                                className="danger"
                                style={{ padding: '9px 14px', fontSize: '12.5px' }}
                                disabled={busy}
                                onClick={() => {
                                  setNotifRejectingId(req.id);
                                  setNotifRejectReason('');
                                }}
                              >
                                <XCircle size={15} /> বাতিল করুন
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 2: RECENT NOTIFICATIONS & ACTIVITY FEED */}
              {notifTab === 'recent_activity' && (
                <div style={{ display: 'grid', gap: '10px', maxHeight: '62vh', overflowY: 'auto', paddingRight: '2px' }}>
                  {completedRequestsList.length === 0 && auditLogs.length === 0 ? (
                    <div
                      style={{
                        padding: '28px 16px',
                        textAlign: 'center',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        border: '1px dashed #cbd5e1',
                      }}
                    >
                      <Bell size={32} style={{ color: '#94a3b8', margin: '0 auto 8px', display: 'block' }} />
                      <h4 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '15px' }}>
                        এখনো কোনো নোটিফিকেশন নেই
                      </h4>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px' }}>
                        সিস্টেমের সকল অনুমোদন ও লেনদেনের নোটিফিকেশন এখানে প্রদর্শিত হবে।
                      </p>
                    </div>
                  ) : (
                    <>
                      {completedRequestsList.map((req) => {
                        const isApproved = req.status === 'approved';
                        return (
                          <div
                            key={req.id}
                            style={{
                              padding: '12px',
                              borderRadius: '10px',
                              border: `1px solid ${isApproved ? '#bbf7d0' : '#fecaca'}`,
                              background: isApproved ? '#f0fdf4' : '#fef2f2',
                              display: 'grid',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <span
                                className={`status ${isApproved ? 'posted' : 'void'}`}
                                style={{ fontSize: '11px' }}
                              >
                                {isApproved ? '✓ অনুমোদিত' : '✕ বাতিলকৃত'}
                              </span>
                              <small style={{ color: '#64748b', fontSize: '11px' }}>
                                {req.reviewedAtFormatted || req.requestedAtFormatted}
                              </small>
                            </div>
                            <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{req.title}</strong>
                            <div style={{ fontSize: '12px', color: '#475569' }}>
                              অনুরোধকারী: <b>{req.requestedByName}</b> • সিদ্ধান্ত: <b>{req.reviewedByName || '—'}</b>
                            </div>
                            {req.reviewNote && (
                              <div style={{ fontSize: '11.5px', color: isApproved ? '#047857' : '#b91c1c' }}>
                                নোট: "{req.reviewNote}"
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {auditLogs.slice(0, 10).map((log) => {
                        const timeStr =
                          log.formattedTime ||
                          (log.createdAt?.toDate ? formatBengaliDateTime(log.createdAt.toDate()) : 'এইমাত্র');
                        const makerName =
                          log.makerName ||
                          log.maker ||
                          (log.actorEmail?.includes('rakib')
                            ? 'Rakib'
                            : log.actorEmail?.includes('limon')
                            ? 'Limon'
                            : log.actor);

                        return (
                          <div
                            key={log.id}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              border: '1px solid #e2e8f0',
                              background: '#ffffff',
                              display: 'grid',
                              gap: '3px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <span className="badge demo" style={{ fontSize: '10.5px' }}>
                                {log.action}
                              </span>
                              <small style={{ color: '#64748b', fontSize: '11px' }}>{timeStr}</small>
                            </div>
                            <div style={{ fontSize: '12.5px', color: '#1e293b', fontWeight: 600 }}>
                              {log.reason || log.details?.title || 'সিস্টেম কার্যকলাপ'}
                            </div>
                            <small style={{ color: '#64748b', fontSize: '11.5px' }}>
                              সম্পাদনকারী: <b>{makerName}</b>
                              {log.approverName ? ` • অনুমোদনকারী: ${log.approverName}` : ''}
                            </small>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: MY SENT PENDING REQUESTS */}
              {notifTab === 'my_sent' && (
                <div style={{ display: 'grid', gap: '10px', maxHeight: '62vh', overflowY: 'auto', paddingRight: '2px' }}>
                  {mySentPendingList.length === 0 ? (
                    <div
                      style={{
                        padding: '28px 16px',
                        textAlign: 'center',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        border: '1px dashed #cbd5e1',
                      }}
                    >
                      <CheckCircle2 size={32} style={{ color: '#0d9488', margin: '0 auto 8px', display: 'block' }} />
                      <h4 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '15px' }}>
                        আপনার পাঠানো কোনো অপেক্ষমান অনুরোধ নেই
                      </h4>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px' }}>
                        আপনি কোনো এন্ট্রি বা পরিবর্তনের অনুরোধ পাঠালে তা {otherPartner.displayName}-এর অনুমোদনের অপেক্ষায় এখানে দেখাবে।
                      </p>
                    </div>
                  ) : (
                    mySentPendingList.map((req) => (
                      <div
                        key={req.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid #fde68a',
                          background: '#fffbeb',
                          display: 'grid',
                          gap: '5px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                            ⏳ {otherPartner.displayName}-এর অনুমোদনের অপেক্ষায়
                          </span>
                          <small style={{ color: '#64748b', fontSize: '11px' }}>{req.requestedAtFormatted}</small>
                        </div>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>{req.title}</strong>
                        <div style={{ fontSize: '12.5px', color: '#475569' }}>{req.description}</div>
                        {req.reason && (
                          <div style={{ fontSize: '12px', color: '#047857' }}>
                            কারণ: "{req.reason}"
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '4px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowNotificationModal(false);
                    setTab('settings');
                  }}
                >
                  📧 ইমেইল সারাংশ ও অ্যালার্ট সেটিংস
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowNotificationModal(false);
                    setTab('audit');
                  }}
                >
                  <History size={15} /> সম্পূর্ণ অডিট লগ দেখুন
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setShowNotificationModal(false)}
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* DASHBOARD METRIC & BUTTON INTERACTIVE BREAKDOWN MODAL */}
      {dashDetailModal && (() => {
        const postedAll = entries
          .filter((e) => e.status === 'posted')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const withdrawalEntries = postedAll.filter((e) => e.type === 'withdrawal' || e.type === 'loan');
        const investmentEntries = postedAll.filter((e) => e.type === 'investment');
        const saleEntries = postedAll.filter((e) => e.type === 'sale');
        const expenseEntries = postedAll.filter((e) => e.type === 'expense');
        const purchaseAndSaleCostEntries = postedAll.filter(
          (e) => e.type === 'purchase' || (e.type === 'sale' && ((e.cogsAmount || 0) > 0 || e.productId))
        );

        // Partner-wise withdrawal summary (even if partner Id was only in title)
        const partnerWithdrawalStats = partnerAccounts.map((p) => {
          const matchingEntries = withdrawalEntries.filter((e) => {
            const pName = resolveEntryPartnerName(e, investors).toLowerCase();
            return (
              e.investorId === p.id ||
              pName.includes(p.name.toLowerCase()) ||
              (p.name.toLowerCase().includes('rakib') && (pName.includes('rakib') || pName.includes('রাকিব'))) ||
              (p.name.toLowerCase().includes('limon') && (pName.includes('limon') || pName.includes('লিমন')))
            );
          });
          const totalWithdrawn = matchingEntries
            .filter((e) => e.type === 'withdrawal')
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
          const totalLoan = matchingEntries
            .filter((e) => e.type === 'loan')
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
          return {
            ...p,
            computedWithdrawals: Math.max(p.withdrawals, totalWithdrawn),
            computedLoans: Math.max(p.loans, totalLoan),
            txCount: matchingEntries.length,
          };
        });

        const modalTitles: Record<DashDetailCategory, string> = {
          withdrawals: 'মোট উত্তোলন ও লোন — কবে, কে, কত টাকা উত্তোলন করেছেন',
          investments: 'মোট মূলধন (বিনিয়োগ) — অংশীদার ও জমার বিস্তারিত তালিকা',
          balance: 'মূলধন সহ বর্তমান ব্যালান্স — সম্পূর্ণ হিসাব ও লেনদেন',
          purchases: 'সর্বমোট ক্রয় (মাল কেনা ও কেনা খরচ) — বিস্তারিত হিসাব',
          expenses: 'সর্বমোট অতিরিক্ত ও পরিচালন খরচ — বিস্তারিত তালিকা',
          sales: 'মোট বিক্রয় রাজস্ব ও বিক্রয় মুনাফা — বিস্তারিত তালিকা',
          net_profit: 'প্রকৃত নিট মুনাফা ও অংশীদারদের লাভের ভাগ — বিস্তারিত হিসাব',
        };

        return (
          <Modal title={modalTitles[dashDetailModal]} close={() => setDashDetailModal(null)}>
            <div style={{ display: 'grid', gap: '14px' }}>
              {/* Quick Category Switcher Bar inside Modal */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  overflowX: 'auto',
                  paddingBottom: '4px',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                {(
                  [
                    { key: 'balance', label: 'বর্তমান ব্যালান্স' },
                    { key: 'withdrawals', label: `উত্তোলন ও লোন (${withdrawalEntries.length})` },
                    { key: 'investments', label: `মূলধন (${investmentEntries.length})` },
                    { key: 'net_profit', label: 'নিট মুনাফা' },
                    { key: 'purchases', label: 'মোট ক্রয়' },
                    { key: 'expenses', label: `অতিরিক্ত খরচ (${expenseEntries.length})` },
                    { key: 'sales', label: `বিক্রয় (${saleEntries.length})` },
                  ] as { key: DashDetailCategory; label: string }[]
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDashDetailModal(item.key)}
                    style={{
                      padding: '6px 11px',
                      borderRadius: '999px',
                      border: dashDetailModal === item.key ? '1.5px solid #0d9488' : '1px solid #cbd5e1',
                      background: dashDetailModal === item.key ? '#0d9488' : '#f8fafc',
                      color: dashDetailModal === item.key ? '#ffffff' : '#334155',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* 1. WITHDRAWALS & LOANS DETAILED VIEW */}
              {dashDetailModal === 'withdrawals' && (
                <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '2px' }}>
                  {/* Top Summary Box */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%)',
                      border: '1.5px solid #fecaca',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#991b1b', display: 'block' }}>সর্বমোট উত্তোলন ও লোন</span>
                      <strong style={{ fontSize: '17px', color: '#dc2626' }}>
                        -{money(cashSummary.totalWithdrawals + cashSummary.totalLoans)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#7f1d1d', display: 'block' }}>লাভাংশ উত্তোলন</span>
                      <strong style={{ fontSize: '15px', color: '#b91c1c' }}>
                        {money(cashSummary.totalWithdrawals)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>বিশেষ লোন</span>
                      <strong style={{ fontSize: '15px', color: '#d97706' }}>
                        {money(cashSummary.totalLoans)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#065f46', display: 'block' }}>উত্তোলন বাদে বর্তমান ব্যালান্স</span>
                      <strong style={{ fontSize: '15px', color: '#047857' }}>
                        {money(cashSummary.availableCash)}
                      </strong>
                    </div>
                  </div>

                  {/* Partner-by-Partner Withdrawal Summary */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px',
                    }}
                  >
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      👥 কোন অংশীদার মোট কত টাকা উত্তোলন করেছেন:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                      {partnerWithdrawalStats.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'grid',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{p.name}</strong>
                            <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                              {p.txCount} বার উত্তোলন
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: '#64748b' }}>মোট উত্তোলন:</span>
                            <b style={{ color: '#dc2626' }}>-{money(p.computedWithdrawals + p.computedLoans)}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
                            <span style={{ color: '#64748b' }}>অবশিষ্ট উত্তোলনযোগ্য লাভ:</span>
                            <b style={{ color: '#0d9488' }}>{money(p.withdrawableLimit)}</b>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chronological List of Every Withdrawal & Loan */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      📋 কবে, কে, কত টাকা উত্তোলন করেছেন তার বিস্তারিত তালিকা ({withdrawalEntries.length}টি):
                    </h4>
                    {withdrawalEntries.length === 0 ? (
                      <div
                        style={{
                          padding: '24px 14px',
                          textAlign: 'center',
                          background: '#f8fafc',
                          borderRadius: '10px',
                          border: '1px dashed #cbd5e1',
                          color: '#64748b',
                          fontSize: '13px',
                        }}
                      >
                        এখনো কোনো উত্তোলন বা লোন রেকর্ড করা হয়নি।
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {withdrawalEntries.map((e, idx) => {
                          const partnerName = resolveEntryPartnerName(e, investors);
                          return (
                            <div
                              key={e.id}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #fecaca',
                                borderRadius: '11px',
                                padding: '11px 13px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      background: '#0f2438',
                                      color: '#ffffff',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                    }}
                                  >
                                    #{withdrawalEntries.length - idx} • {partnerName}
                                  </span>
                                  <span
                                    className="badge"
                                    style={{
                                      background: e.type === 'loan' ? '#fef3c7' : '#fee2e2',
                                      color: e.type === 'loan' ? '#92400e' : '#b91c1c',
                                    }}
                                  >
                                    {e.type === 'loan' ? 'বিশেষ লোন' : 'লাভাংশ উত্তোলন'}
                                  </span>
                                  {e.category && (
                                    <span style={{ fontSize: '11px', color: '#475569', background: '#f1f5f9', padding: '2px 7px', borderRadius: '6px' }}>
                                      মাধ্যম: {e.category}
                                    </span>
                                  )}
                                </div>
                                <strong style={{ fontSize: '15.5px', color: '#dc2626' }}>
                                  -{money(e.amount)}
                                </strong>
                              </div>

                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                                {e.title}
                              </div>

                              {e.notes && (
                                <div style={{ fontSize: '12px', color: '#475569', background: '#f8fafc', padding: '6px 9px', borderRadius: '7px' }}>
                                  নোট / কারণ: {e.notes}
                                </div>
                              )}

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', paddingTop: '4px', borderTop: '1px dashed #f1f5f9', fontSize: '11.5px', color: '#64748b' }}>
                                <span>📅 তারিখ: <b style={{ color: '#334155' }}>{dateLabel(e.date)} ({e.date})</b></span>
                                <button
                                  type="button"
                                  className="text-btn"
                                  style={{ fontSize: '11.5px', padding: '2px 6px' }}
                                  onClick={() => {
                                    setDashDetailModal(null);
                                    setViewRecordModal(e);
                                  }}
                                >
                                  সম্পূর্ণ রশিদ দেখুন →
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. INVESTMENTS (CAPITAL) DETAILED VIEW */}
              {dashDetailModal === 'investments' && (
                <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '2px' }}>
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                      border: '1.5px solid #ddd6fe',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#5b21b6', display: 'block' }}>প্রতিষ্ঠানের সর্বমোট মূলধন (বিনিয়োগ)</span>
                      <strong style={{ fontSize: '19px', color: '#6d28d9' }}>{money(cashSummary.totalInvestments)}</strong>
                    </div>
                    <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }}>
                      🔒 শর্তাবলী অনুযায়ী মূলধন উত্তোলনযোগ্য নয়
                    </span>
                  </div>

                  {/* Partner Capital Shares */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
                    {partnerAccounts.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '10px 12px',
                          display: 'grid',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{p.name}</strong>
                          <span className="badge posted">{p.share.toFixed(1)}% শেয়ার</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                          <span style={{ color: '#64748b' }}>জমাকৃত মূলধন:</span>
                          <b style={{ color: '#6d28d9' }}>{money(p.capital)}</b>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* List of Investment Entries */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      📋 কবে, কে, কত টাকা মূলধন জমা দিয়েছেন ({investmentEntries.length}টি):
                    </h4>
                    {investmentEntries.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b' }}>
                        কোনো মূলধন জমার এন্ট্রি পাওয়া যায়নি।
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {investmentEntries.map((e, idx) => {
                          const partnerName = resolveEntryPartnerName(e, investors);
                          return (
                            <div
                              key={e.id}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #ddd6fe',
                                borderRadius: '10px',
                                padding: '10px 13px',
                                display: 'grid',
                                gap: '4px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                <span style={{ background: '#5b21b6', color: '#ffffff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
                                  #{investmentEntries.length - idx} • {partnerName}
                                </span>
                                <strong style={{ fontSize: '15px', color: '#6d28d9' }}>+{money(e.amount)}</strong>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{e.title}</div>
                              {e.notes && <div style={{ fontSize: '12px', color: '#475569' }}>নোট: {e.notes}</div>}
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b', paddingTop: '3px', borderTop: '1px dashed #f1f5f9' }}>
                                <span>📅 তারিখ: <b>{dateLabel(e.date)} ({e.date})</b></span>
                                <button
                                  type="button"
                                  className="text-btn"
                                  style={{ fontSize: '11.5px', padding: 0 }}
                                  onClick={() => {
                                    setDashDetailModal(null);
                                    setViewRecordModal(e);
                                  }}
                                >
                                  রশিদ দেখুন →
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. CURRENT BALANCE WITH CAPITAL DETAILED VIEW */}
              {dashDetailModal === 'balance' && (
                <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '2px' }}>
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)',
                      border: '1.5px solid #34d399',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#065f46', fontWeight: 700, display: 'block' }}>
                          মূলধন সহ বর্তমান ব্যালান্স (উত্তোলন করলে ব্যালেন্স কমে)
                        </span>
                        <strong style={{ fontSize: '22px', color: '#047857' }}>{money(cashSummary.availableCash)}</strong>
                      </div>
                      <span className="badge posted" style={{ fontSize: '11.5px' }}>লাইভ আপডেটেড</span>
                    </div>

                    <div style={{ background: '#ffffff', borderRadius: '10px', padding: '10px 12px', border: '1px solid #a7f3d0', display: 'grid', gap: '6px', fontSize: '12.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#475569' }}>(+) মোট মূলধন (বিনিয়োগ):</span>
                        <b style={{ color: '#6d28d9' }}>{money(cashSummary.totalInvestments)}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#475569' }}>
                          (+) সর্বমোট নিট মুনাফা (বিক্রয় লাভ {money(cashSummary.totalSalesProfit)} − অতিরিক্ত খরচ {money(cashSummary.totalExpenses)}):
                        </span>
                        <b style={{ color: '#059669' }}>+{money(cashSummary.netProfit)}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#991b1b' }}>(−) মোট উত্তোলন ও বিশেষ লোন:</span>
                        <b style={{ color: '#dc2626' }}>-{money(cashSummary.totalWithdrawals + cashSummary.totalLoans)}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1.5px solid #e2e8f0', fontSize: '13.5px' }}>
                        <strong style={{ color: '#0f172a' }}>(=) মূলধন সহ বর্তমান ব্যালান্স:</strong>
                        <strong style={{ color: '#047857' }}>{money(cashSummary.availableCash)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Recent Balance-Affecting Transactions */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      📋 ব্যালান্সে প্রভাব বিস্তারকারী সকল লেনদেনের তালিকা ({postedAll.length}টি):
                    </h4>
                    <div style={{ display: 'grid', gap: '7px' }}>
                      {postedAll.slice(0, 30).map((e) => {
                        const partnerName = resolveEntryPartnerName(e, investors);
                        const isOut = e.type === 'withdrawal' || e.type === 'loan' || e.type === 'expense' || e.type === 'purchase';
                        return (
                          <div
                            key={e.id}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              padding: '9px 12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span className="type-pill" style={{ fontSize: '10.5px' }}>{typeLabels[e.type] || e.type}</span>
                                <small style={{ color: '#64748b', fontSize: '11px' }}>{dateLabel(e.date)}</small>
                                {partnerName !== 'সাধারণ / উল্লেখ নেই' && (
                                  <small style={{ color: '#0f766e', fontWeight: 700, fontSize: '11px' }}>• {partnerName}</small>
                                )}
                              </div>
                              <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginTop: '2px' }}>{e.title}</strong>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <strong style={{ fontSize: '13.5px', color: isOut ? '#dc2626' : '#059669', display: 'block' }}>
                                {isOut ? '-' : '+'}{money(e.amount)}
                              </strong>
                              {e.type === 'sale' && e.grossProfit !== undefined && (
                                <small style={{ fontSize: '10.5px', color: '#047857', fontWeight: 700 }}>
                                  লাভ: +{money(e.grossProfit)}
                                </small>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. TOTAL PURCHASES (মাল কেনা ও COGS) DETAILED VIEW */}
              {dashDetailModal === 'purchases' && (
                <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '2px' }}>
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1.5px solid #fde68a',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>সর্বমোট ক্রয় (মাল কেনা)</span>
                      <strong style={{ fontSize: '18px', color: '#b45309' }}>{money(overallTotalPurchase)}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>বিক্রিত পণ্যের ক্রয়মূল্য (COGS)</span>
                      <strong style={{ fontSize: '15px', color: '#d97706' }}>{money(stats.cogs)}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>বর্তমান মজুদ স্টকের মূল্য</span>
                      <strong style={{ fontSize: '15px', color: '#0f766e' }}>{money(stats.inventoryValuation)}</strong>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      📦 ক্রয়কৃত পণ্য ও বিক্রিত পণ্যের কেনা খরচের বিস্তারিত তালিকা ({purchaseAndSaleCostEntries.length}টি):
                    </h4>
                    {purchaseAndSaleCostEntries.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b' }}>
                        কোনো ক্রয় বা পণ্যের কেনা খরচের রেকর্ড পাওয়া যায়নি।
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {purchaseAndSaleCostEntries.map((e) => {
                          const linkedProd = e.productId ? products.find((p) => p.id === e.productId) : null;
                          const itemCost =
                            e.type === 'purchase'
                              ? e.amount
                              : e.cogsAmount !== undefined
                              ? e.cogsAmount
                              : linkedProd && e.quantity
                              ? e.quantity * linkedProd.averageCost
                              : 0;
                          return (
                            <div
                              key={e.id}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #fde68a',
                                borderRadius: '10px',
                                padding: '10px 13px',
                                display: 'grid',
                                gap: '4px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                                  {e.type === 'purchase' ? 'সরাসরি মাল ক্রয়' : 'বিক্রিত পণ্যের কেনা খরচ (COGS)'}
                                </span>
                                <strong style={{ fontSize: '14.5px', color: '#b45309' }}>ক্রয় খরচ: {money(itemCost)}</strong>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{e.title}</div>
                              <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                <span>📅 তারিখ: <b>{dateLabel(e.date)}</b></span>
                                {e.type === 'sale' && <span>বিক্রয় মূল্য: <b>{money(e.amount)}</b></span>}
                                {e.quantity && <span>পরিমাণ: <b>{e.quantity}টি</b></span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. EXTRA / OPERATING EXPENSES DETAILED VIEW */}
              {dashDetailModal === 'expenses' && (
                <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '2px' }}>
                  <div
                    style={{
                      background: '#fff1f2',
                      border: '1.5px solid #fecdd3',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11.5px', color: '#9f1239', display: 'block' }}>সর্বমোট অতিরিক্ত ও পরিচালন খরচ</span>
                      <strong style={{ fontSize: '19px', color: '#e11d48' }}>{money(cashSummary.totalExpenses)}</strong>
                    </div>
                    <span className="badge" style={{ background: '#ffe4e6', color: '#be123c' }}>
                      মোট {expenseEntries.length}টি খরচের এন্ট্রি
                    </span>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      📋 কবে, কী বাবদ কত টাকা অতিরিক্ত খরচ হয়েছে ({expenseEntries.length}টি):
                    </h4>
                    {expenseEntries.length === 0 ? (
                      <div style={{ padding: '24px 14px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13px' }}>
                        এখনো কোনো অতিরিক্ত বা পরিচালন খরচ রেকর্ড করা হয়নি।
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {expenseEntries.map((e, idx) => (
                          <div
                            key={e.id}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #fecdd3',
                              borderRadius: '10px',
                              padding: '10px 13px',
                              display: 'grid',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="badge" style={{ background: '#ffe4e6', color: '#be123c' }}>
                                #{expenseEntries.length - idx} • {e.category || 'অতিরিক্ত খরচ'}
                              </span>
                              <strong style={{ fontSize: '15px', color: '#e11d48' }}>-{money(e.amount)}</strong>
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{e.title}</div>
                            {e.notes && <div style={{ fontSize: '12px', color: '#475569' }}>বিবরণ: {e.notes}</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b', paddingTop: '3px', borderTop: '1px dashed #f1f5f9' }}>
                              <span>📅 তারিখ: <b>{dateLabel(e.date)} ({e.date})</b></span>
                              <button
                                type="button"
                                className="text-btn"
                                style={{ fontSize: '11.5px', padding: 0 }}
                                onClick={() => {
                                  setDashDetailModal(null);
                                  setViewRecordModal(e);
                                }}
                              >
                                রশিদ দেখুন →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 6. SALES DETAILED VIEW */}
              {dashDetailModal === 'sales' && (
                <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '2px' }}>
                  <div
                    style={{
                      background: '#eff6ff',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#1e40af', display: 'block' }}>সর্বমোট বিক্রয় রাজস্ব</span>
                      <strong style={{ fontSize: '17px', color: '#1d4ed8' }}>{money(stats.sales)}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>বিক্রিত পণ্যের কেনা খরচ</span>
                      <strong style={{ fontSize: '15px', color: '#b45309' }}>{money(stats.cogs)}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#065f46', display: 'block' }}>মোট বিক্রয় মুনাফা (Gross)</span>
                      <strong style={{ fontSize: '15px', color: '#059669' }}>+{money(stats.grossProfit)}</strong>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      🛒 সকল বিক্রয়ের বিস্তারিত তালিকা ({saleEntries.length}টি):
                    </h4>
                    {saleEntries.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b' }}>
                        কোনো বিক্রয় রেকর্ড পাওয়া যায়নি।
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {saleEntries.map((e, idx) => {
                          const profitVal =
                            e.grossProfit !== undefined
                              ? e.grossProfit
                              : Math.max(0, e.amount - (e.cogsAmount || 0));
                          const costVal = e.cogsAmount !== undefined ? e.cogsAmount : Math.max(0, e.amount - profitVal);
                          return (
                            <div
                              key={e.id}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '10px',
                                padding: '10px 13px',
                                display: 'grid',
                                gap: '4px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>
                                  বিক্রয় #{saleEntries.length - idx} • {dateLabel(e.date)}
                                </span>
                                <strong style={{ fontSize: '15px', color: '#0f172a' }}>{money(e.amount)}</strong>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{e.title}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '11.5px', paddingTop: '3px', borderTop: '1px dashed #f1f5f9' }}>
                                <span style={{ color: '#b45309' }}>ক্রয় খরচ: <b>{money(costVal)}</b></span>
                                <span style={{ color: '#059669' }}>লাভ: <b>+{money(profitVal)}</b></span>
                                <button
                                  type="button"
                                  className="text-btn"
                                  style={{ fontSize: '11.5px', padding: 0 }}
                                  onClick={() => {
                                    setDashDetailModal(null);
                                    setViewRecordModal(e);
                                  }}
                                >
                                  রশিদ দেখুন →
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 7. NET PROFIT & PARTNER SHARE DETAILED VIEW */}
              {dashDetailModal === 'net_profit' && (
                <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '2px' }}>
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1.5px solid #bbf7d0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'grid',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '11.5px', color: '#166534', display: 'block' }}>সর্বমোট প্রকৃত নিট মুনাফা (Net Profit)</span>
                        <strong style={{ fontSize: '20px', color: '#15803d' }}>
                          {cashSummary.netProfit >= 0 ? '+' : ''}{money(cashSummary.netProfit)}
                        </strong>
                      </div>
                      <span className="badge posted">
                        লাভের হার: {stats.sales > 0 ? `${((stats.netProfit / stats.sales) * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </div>
                    <div style={{ background: '#ffffff', borderRadius: '8px', padding: '8px 10px', border: '1px solid #dcfce7', fontSize: '12px', display: 'grid', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>মোট বিক্রয় রাজস্ব:</span>
                        <b>{money(stats.sales)}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>(−) বিক্রিত পণ্যের কেনা খরচ (COGS):</span>
                        <b style={{ color: '#b45309' }}>-{money(stats.cogs)}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>(−) অতিরিক্ত ও পরিচালন খরচ:</span>
                        <b style={{ color: '#dc2626' }}>-{money(stats.expenses)}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #cbd5e1', fontWeight: 700 }}>
                        <span>(=) প্রকৃত নিট মুনাফা:</span>
                        <b style={{ color: '#15803d' }}>+{money(stats.netProfit)}</b>
                      </div>
                    </div>
                  </div>

                  {/* Partner Profit Allocation */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>
                      👥 অংশীদারদের মুনাফার ভাগ ও উত্তোলনযোগ্য ব্যালান্স:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                      {partnerAccounts.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #bbf7d0',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'grid',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{p.name}</strong>
                            <span className="badge posted">{p.share.toFixed(1)}% শেয়ার</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: '#64748b' }}>মোট অর্জিত লাভাংশ:</span>
                            <b style={{ color: '#059669' }}>+{money(p.allocatedProfit)}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: '#64748b' }}>উত্তোলন ও লোন:</span>
                            <b style={{ color: '#dc2626' }}>-{money(p.withdrawals + p.loans)}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                            <span style={{ color: '#0f766e', fontWeight: 700 }}>উত্তোলনযোগ্য লাভ:</span>
                            <b style={{ color: '#0d9488' }}>{money(p.withdrawableLimit)}</b>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const targetType: Record<DashDetailCategory, 'all' | RecordType> = {
                      withdrawals: 'withdrawal',
                      investments: 'investment',
                      balance: 'all',
                      purchases: 'purchase',
                      expenses: 'expense',
                      sales: 'sale',
                      net_profit: 'sale',
                    };
                    setTypeFilter(targetType[dashDetailModal]);
                    setDashDetailModal(null);
                    setTab('transactions');
                  }}
                >
                  সকল লেনদেন পেজে দেখুন →
                </button>
                <button type="button" className="primary" onClick={() => setDashDetailModal(null)}>
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* PRODUCT-LEVEL PROFITABILITY & STAGNATING STOCK REPORT MODAL */}
      <ProductProfitabilityModal
        isOpen={showProfitabilityModal}
        onClose={() => setShowProfitabilityModal(false)}
        products={products}
        entries={entries}
        admin={admin}
        onRecordSaleForProduct={(prod) => {
          setShowProfitabilityModal(false);
          setEditingEntry(null);
          const sellPrice = Number(prod.sellingPrice) || 0;
          const avgCost = Number(prod.averageCost) || 0;
          const unitProfit = Math.max(0, sellPrice - avgCost);
          setEntryForm({
            type: 'sale',
            seller: (currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib') as 'Rakib' | 'Limon',
            title: `${prod.name} বিক্রয়`,
            amount: sellPrice > 0 ? String(sellPrice) : '',
            profit: sellPrice > 0 ? String(unitProfit) : '',
            cost: avgCost > 0 ? String(avgCost) : '',
            date: today(),
            status: 'posted',
            investorId: '',
            productId: prod.id,
            quantity: '1',
            unitPrice: sellPrice > 0 ? String(sellPrice) : '',
            unitCost: avgCost > 0 ? String(avgCost) : '',
            category: 'পণ্য বিক্রয়',
            notes: '',
          });
          setShowEntryModal(true);
        }}
        onEditProduct={(prod) => {
          setShowProfitabilityModal(false);
          handleOpenEditProduct(prod);
        }}
        onAddNewProduct={() => {
          setShowProfitabilityModal(false);
          setEditingProduct(null);
          setProductUploadMode('single');
          setShowProductModal(true);
        }}
      />

      {/* GLOBAL FIXED FLOATING DRAWING PAD & CAMERA AUTO-SALE BUTTONS (SEPARATE FEATURES) */}
      {settings.enableDrawingPad !== false && (
        <button
          type="button"
          onClick={() => setShowDrawingSaleModal(true)}
          title="ড্রইং প্যাড অটো-সেল (হাতে A, AB লিখলেই অটোমেটিক সেল এন্ট্রি)"
          aria-label="ড্রইং প্যাড অটো-সেল"
          style={{
            position: 'fixed',
            right: '16px',
            bottom:
              settings.showCalculator !== false
                ? settings.enableCameraScan !== false
                  ? '192px'
                  : '138px'
                : settings.enableCameraScan !== false
                ? '136px'
                : '82px',
            zIndex: 1150,
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #0284c7)',
            color: '#ffffff',
            border: '2px solid #ffffff',
            boxShadow: '0 6px 18px rgba(37, 99, 235, 0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <PenTool size={19} />
        </button>
      )}

      {settings.enableCameraScan !== false && (
        <button
          type="button"
          onClick={() => setShowCameraSaleModal(true)}
          title="লাইভ ক্যামেরা অটো-সেল স্ক্যানার"
          aria-label="লাইভ ক্যামেরা অটো-সেল"
          style={{
            position: 'fixed',
            right: '16px',
            bottom: settings.showCalculator !== false ? '138px' : '82px',
            zIndex: 1150,
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #059669, #0284c7)',
            color: '#ffffff',
            border: '2px solid #ffffff',
            boxShadow: '0 6px 18px rgba(5, 150, 105, 0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Camera size={20} />
        </button>
      )}

      {/* GLOBAL FIXED FLOATING CALCULATOR BUTTON (Visible across all pages & stays fixed on scroll) */}
      {settings.showCalculator !== false && (
        <button
          type="button"
          className={`floating-calc-trigger-btn ${
            calcState.display !== '0' || Boolean(calcState.expression) || calcState.memory !== 0
              ? 'has-saved-calc'
              : ''
          }`}
          onClick={() => setShowCalculatorModal(true)}
          title={
            calcState.display !== '0' || Boolean(calcState.expression)
              ? `ব্যবসার ক্যালকুলেটর (সংরক্ষিত হিসাব: ৳${toBengaliNumerals(calcState.display)})`
              : 'ব্যবসার ক্যালকুলেটর খুলুন'
          }
          aria-label="ব্যবসার ক্যালকুলেটর"
        >
          <Calculator size={19} />
          {(calcState.display !== '0' || Boolean(calcState.expression) || calcState.memory !== 0) && (
            <span className="quick-calc-saved-dot" aria-hidden="true" />
          )}
        </button>
      )}

      {/* PERSISTENT BUSINESS CALCULATOR POPUP MODAL */}
      {settings.showCalculator !== false && (
        <BusinessCalculatorModal
          isOpen={showCalculatorModal}
          onMinimize={() => setShowCalculatorModal(false)}
          calcState={calcState}
          setCalcState={setCalcState}
          enableVoiceInput={settings.enableVoiceInput !== false}
        />
      )}

      {/* SEPARATE LIVE CAMERA AUTO-SALE POS MODAL */}
      {settings.enableCameraScan !== false && (
        <CameraAutoSaleModal
          isOpen={showCameraSaleModal}
          onClose={() => setShowCameraSaleModal(false)}
          products={products}
          featureMode="camera"
          initialSeller={currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib'}
          onExecuteSale={async ({ product, quantity, matchMethod, seller }) => {
            const saleSeller: 'Rakib' | 'Limon' = currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib';
            const actorId = saleSeller;
            const actorEmail = `${saleSeller.toLowerCase()}@glowzaa.shop`;
            const actorDisplay = saleSeller === 'Limon' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

            const unitPrice = Number(product.sellingPrice) || 0;
            const unitCost = Number(product.averageCost) || 0;
            const totalAmount = Math.round(quantity * unitPrice * 100) / 100;
            const cogsAmount = Math.round(quantity * unitCost * 100) / 100;
            const grossProfit = Math.round((totalAmount - cogsAmount) * 100) / 100;

            const methodLabel =
              matchMethod === 'barcode'
                ? 'SKU কোড স্ক্যান'
                : matchMethod === 'quick_tap'
                ? 'কুইক ট্যাপ ক্যামেরা সেল'
                : 'ক্যামেরা অটো-স্ক্যান';

            const createdId = await addEntry(
              {
                type: 'sale',
                title: `${product.name} বিক্রয় (${toBengaliNumerals(quantity)} ${product.unit || 'পিস'})`,
                amount: totalAmount,
                date: today(),
                status: 'posted',
                productId: product.id,
                quantity,
                unitPrice,
                unitCost,
                cogsAmount,
                grossProfit,
                profit: grossProfit,
                category: 'ক্যামেরা অটো-সেল (POS)',
                notes: `${methodLabel} দ্বারা স্বয়ংক্রিয়ভাবে এন্ট্রিকৃত (${actorDisplay})`,
                demo: false,
              },
              actorId,
              actorEmail,
              actorDisplay
            );

            setMessage(
              `✅ ক্যামেরা অটো-সেল সম্পন্ন: ${toBengaliNumerals(quantity)} ${product.unit || 'পিস'} ${product.name} — ${money(totalAmount)} (লাভ: +${money(grossProfit)})`
            );
            return createdId;
          }}
          onUndoSale={async (entryId, product, quantity) => {
            const actorId = currentAdmin?.username || user?.uid || 'admin';
            const actorEmail = currentAdmin
              ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
              : user?.email || '';
            await removeEntry(entryId, actorId, actorEmail);
            setMessage(
              `↩️ ক্যামেরা সেল বাতিল করা হয়েছে: ${toBengaliNumerals(quantity)} ${product.unit || 'পিস'} ${product.name} (স্টক পুনঃসমন্বয় হয়েছে)`
            );
          }}
          onUpdateProductSku={async (product, newSku) => {
            const actorId = currentAdmin?.username || user?.uid || 'admin';
            const actorEmail = currentAdmin
              ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
              : user?.email || '';
            await updateProduct(product.id, { sku: newSku }, actorId, actorEmail);
            setMessage(`✅ "${product.name}"-এর SKU কোড "${newSku}" সফলভাবে সংরক্ষণ করা হয়েছে!`);
          }}
        />
      )}

      {/* SEPARATE DRAWING PAD AUTO-SALE POS MODAL */}
      {settings.enableDrawingPad !== false && (
        <CameraAutoSaleModal
          isOpen={showDrawingSaleModal}
          onClose={() => setShowDrawingSaleModal(false)}
          products={products}
          featureMode="drawing"
          initialSeller={currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib'}
          onExecuteSale={async ({ product, quantity, matchMethod, seller }) => {
            const saleSeller: 'Rakib' | 'Limon' = currentAdmin?.username === 'Limon' ? 'Limon' : 'Rakib';
            const actorId = saleSeller;
            const actorEmail = `${saleSeller.toLowerCase()}@glowzaa.shop`;
            const actorDisplay = saleSeller === 'Limon' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

            const unitPrice = Number(product.sellingPrice) || 0;
            const unitCost = Number(product.averageCost) || 0;
            const totalAmount = Math.round(quantity * unitPrice * 100) / 100;
            const cogsAmount = Math.round(quantity * unitCost * 100) / 100;
            const grossProfit = Math.round((totalAmount - cogsAmount) * 100) / 100;

            const methodLabel =
              matchMethod === 'barcode'
                ? 'ড্রইং প্যাড SKU এন্ট্রি'
                : matchMethod === 'quick_tap'
                ? 'ড্রইং প্যাড কুইক সেল'
                : 'ড্রইং প্যাড হাতের লেখা (A–GZ)';

            const createdId = await addEntry(
              {
                type: 'sale',
                title: `${product.name} বিক্রয় (${toBengaliNumerals(quantity)} ${product.unit || 'পিস'})`,
                amount: totalAmount,
                date: today(),
                status: 'posted',
                productId: product.id,
                quantity,
                unitPrice,
                unitCost,
                cogsAmount,
                grossProfit,
                profit: grossProfit,
                category: 'ড্রইং প্যাড অটো-সেল (POS)',
                notes: `${methodLabel} দ্বারা স্বয়ংক্রিয়ভাবে এন্ট্রিকৃত (${actorDisplay})`,
                demo: false,
              },
              actorId,
              actorEmail,
              actorDisplay
            );

            setMessage(
              `✅ ড্রইং প্যাড অটো-সেল সম্পন্ন: ${toBengaliNumerals(quantity)} ${product.unit || 'পিস'} ${product.name} — ${money(totalAmount)} (লাভ: +${money(grossProfit)})`
            );
            return createdId;
          }}
          onUndoSale={async (entryId, product, quantity) => {
            const actorId = currentAdmin?.username || user?.uid || 'admin';
            const actorEmail = currentAdmin
              ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
              : user?.email || '';
            await removeEntry(entryId, actorId, actorEmail);
            setMessage(
              `↩️ ড্রইং প্যাড সেল বাতিল করা হয়েছে: ${toBengaliNumerals(quantity)} ${product.unit || 'পিস'} ${product.name} (স্টক পুনঃসমন্বয় হয়েছে)`
            );
          }}
          onUpdateProductSku={async (product, newSku) => {
            const actorId = currentAdmin?.username || user?.uid || 'admin';
            const actorEmail = currentAdmin
              ? `${currentAdmin.username.toLowerCase()}@glowzaa.shop`
              : user?.email || '';
            await updateProduct(product.id, { sku: newSku }, actorId, actorEmail);
            setMessage(`✅ "${product.name}"-এর SKU কোড "${newSku}" সফলভাবে সংরক্ষণ করা হয়েছে!`);
          }}
        />
      )}
    </div>
  );
}

// Subcomponents
function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close-btn" onClick={close} aria-label="বন্ধ করুন">
            <X size={18} />
          </button>
        </div>
        <div className="modal-content-area">
          {children}
        </div>
      </div>
    </div>
  );
}

function EntryTable({
  rows,
  investors,
  products,
  admin,
  selectedIds,
  onToggleSelect,
  onEdit,
  onView,
  onDelete,
  onVoid,
}: {
  rows: Entry[];
  investors: Investor[];
  products: Product[];
  admin: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onEdit: (e: Entry) => void;
  onView: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  onVoid: (e: Entry) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {admin && <th style={{ width: '40px' }}>নির্বাচন</th>}
            <th>তারিখ</th>
            <th>ধরন</th>
            <th>বিবরণ</th>
            <th>ইনভেস্টর</th>
            <th>পরিমাণ</th>
            <th>স্ট্যাটাস</th>
            {admin && <th>অ্যাকশন</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const partner = investors.find((i) => i.id === e.investorId);
            const resolvedPartnerName = partner?.name || (
              e.type === 'withdrawal' || e.type === 'loan' || e.type === 'investment'
                ? resolveEntryPartnerName(e, investors)
                : '—'
            );
            const isSelected = selectedIds.includes(e.id);

            return (
              <tr key={e.id}>
                {admin && (
                  <td>
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(e.id)} />
                  </td>
                )}
                <td>{dateLabel(e.date)}</td>
                <td><span className="type-pill">{typeLabels[e.type] || e.type}</span></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(() => {
                      const lp = e.productId ? products.find((p) => p.id === e.productId) : null;
                      if (!lp?.imageUrl) return null;
                      return (
                        <img
                          src={lp.imageUrl}
                          alt={lp.name}
                          title={lp.name}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            objectFit: 'cover',
                            border: '1px solid #cbd5e1',
                            flexShrink: 0
                          }}
                        />
                      );
                    })()}
                    <div>
                      <b style={{ display: 'block' }}>{e.title}</b>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {e.productId && (() => {
                          const lp = products.find((p) => p.id === e.productId);
                          return lp ? (
                            <span style={{ fontSize: '11px', color: '#0d9488', fontWeight: 600 }}>
                              📦 {lp.name} {e.quantity ? `(${e.quantity} ${lp.unit})` : ''}
                            </span>
                          ) : null;
                        })()}
                        {e.type === 'sale' && (() => {
                          const s = getEntrySeller(e);
                          if (s === 'Rakib') {
                            return (
                              <span style={{ fontSize: '11px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 700 }}>
                                👤 রাকিব
                              </span>
                            );
                          }
                          if (s === 'Limon') {
                            return (
                              <span style={{ fontSize: '11px', background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', borderRadius: '4px', padding: '1px 6px', fontWeight: 700 }}>
                                👤 লিমন
                              </span>
                            );
                          }
                          return null;
                        })()}
                        {e.demo && <span className="badge demo">ডেমো</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  {e.type === 'sale' ? (
                    (() => {
                      const s = getEntrySeller(e);
                      return s === 'Rakib' ? (
                        <span style={{ color: '#1d4ed8', fontWeight: 600 }}>👤 রাকিব (Rakib)</span>
                      ) : s === 'Limon' ? (
                        <span style={{ color: '#7e22ce', fontWeight: 600 }}>👤 লিমন (Limon)</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      );
                    })()
                  ) : (
                    resolvedPartnerName
                  )}
                </td>
                <td className={e.type === 'sale' ? 'positive' : ''}>
                  <div>{money(e.amount)}</div>
                  {e.type === 'sale' && (e.grossProfit !== undefined || e.cogsAmount !== undefined) && (
                    <small style={{ display: 'block', fontSize: '11px', color: '#047857', fontWeight: 600 }}>
                      লাভ: +{money(e.grossProfit !== undefined ? e.grossProfit : Math.max(0, e.amount - (e.cogsAmount || 0)))}
                    </small>
                  )}
                </td>
                <td><span className={`status ${e.status}`}>{e.status === 'posted' ? 'পোস্টেড' : e.status === 'void' ? 'বাতিল' : 'ড্রাফট'}</span></td>
                <td>
                  <div className="action-group">
                    <button className="action-btn" title="বিস্তারিত দেখুন" onClick={() => onView(e)}><Eye size={16} /></button>
                    {admin && (
                      <>
                        <button className="action-btn" title="সম্পাদনা" onClick={() => onEdit(e)}><Edit3 size={16} /></button>
                        <button className="action-btn danger" title="স্থায়ী ডিলিট" onClick={() => onDelete(e)}><Trash2 size={16} /></button>
                        {e.status === 'posted' && (
                          <button className="action-btn warning" title="রিভার্স (Void)" onClick={() => onVoid(e)}><RotateCcw size={16} /></button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr><td colSpan={admin ? 8 : 6} className="empty">কোনো লেনদেন পাওয়া যায়নি</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
