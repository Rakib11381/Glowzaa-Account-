import React, { useEffect, useMemo, useState } from 'react';
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
  Package,
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
  type DemoCleanupPreview,
} from './data';
import AdminProfile from './components/AdminProfile';
import TermsConditionsCard from './components/TermsConditionsCard';
import PWAInstallButton from './components/PWAInstallButton';
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
  formatBengaliDateTime,
  type PartnerAccountBalance,
  type DailyFinancialBreakdown,
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
  expense: 'পরিচালন খরচ',
  investment: 'মূলধন বিনিয়োগ',
  withdrawal: 'পার্টনার উত্তোলন',
  loan: 'পার্টনার লোন',
  other: 'অন্যান্য লেনদেন',
};

const filterPills: { key: RecordType; label: string }[] = [
  { key: 'sale', label: 'বিক্রয়' },
  { key: 'purchase', label: 'মাল ক্রয়' },
  { key: 'expense', label: 'পরিচালন খরচ' },
  { key: 'investment', label: 'মূলধন বিনিয়োগ' },
  { key: 'withdrawal', label: 'উত্তোলন' },
  { key: 'loan', label: 'পার্টনার লোন' },
  { key: 'other', label: 'অন্যান্য' },
];

const blankSettings: BusinessSettings = {
  name: 'Glowzaa Shop',
  type: 'খুচরা ও পাইকারি ব্যবসা',
  address: 'ঢাকা, বাংলাদেশ',
  phone: '০১৭১১-০০০০০০',
  currencySymbol: '৳',
  superAdminEmail: 'glowzaabd.shop@gmail.com',
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
  const [role, setRole] = useState<Role | null>(null);
  const [authReady, setAuthReady] = useState(false);

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

  // Core Data Collections
  const [entries, setEntries] = useState<Entry[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [distributions, setDistributions] = useState<ProfitDistribution[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(blankSettings);

  // UI state
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<
    'dashboard' | 'transactions' | 'investors' | 'inventory' | 'profit' | 'reports' | 'audit' | 'settings' | 'profile' | 'terms'
  >('dashboard');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
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
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [showInvestorModal, setShowInvestorModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
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
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
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

  // Profit Distribution Form
  const [distributionForm, setDistributionForm] = useState({
    periodName: `মুনাফা বণ্টন (${new Date().toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })})`,
    date: today(),
    distributableAmount: '',
    status: 'posted' as EntryStatus,
  });

  // 1. Initial Auth Setup & Connection Test
  useEffect(() => {
    testConnection();
    getAdminAuthData().then((authData) => {
      setAdminPasswords({ rakib: authData.rakib, limon: authData.limon });
      setAdminAvatars({
        rakib: authData.rakibAvatar || '',
        limon: authData.limonAvatar || '',
      });
    });

    if (!auth) {
      setAuthReady(true);
      return;
    }

    if (currentAdmin && !auth.currentUser) {
      signInAnonymously(auth).catch(() => {});
    }

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const profile = await syncUserProfile(u.uid, u.email || '', u.displayName || undefined);
          setRole(profile.role);
          ensureAdminInvestors(u.uid);
        } catch {
          setRole('admin');
        }
      } else if (currentAdmin) {
        setRole('admin');
        ensureAdminInvestors(currentAdmin.username);
      } else {
        setRole(null);
      }
      setAuthReady(true);
    });
  }, [currentAdmin]);

  // 2. Real-time Firestore Listeners
  useEffect(() => {
    if ((!currentAdmin && !user) || !db) return;

    const unsubEntries = watchEntries(setEntries, (e) => console.warn('Entries sync warning:', e));
    const unsubInvestors = watchInvestors(setInvestors, (e) => console.warn('Investors sync warning:', e));
    const unsubProducts = watchProducts(setProducts, (e) => console.warn('Products sync warning:', e));
    const unsubDist = watchDistributions(setDistributions, (e) => console.warn('Distributions sync warning:', e));
    const unsubAudit = watchAuditLogs(setAuditLogs, (e) => console.warn('Audit logs sync warning:', e));
    const unsubApprovals = watchApprovalRequests(setApprovalRequests, (e) => console.warn('Approvals sync warning:', e));

    getDoc(doc(db, 'businessSettings', 'main'))
      .then((s) => {
        if (s.exists()) {
          setSettings({ ...blankSettings, ...(s.data() as BusinessSettings) });
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
  }, [user, currentAdmin]);

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

  const pendingForMeCount = useMemo(() => {
    if (!currentAdmin) return 0;
    return approvalRequests.filter(
      (r) => r.status === 'pending' && r.targetApprover === currentAdmin.username
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

      return matchesSearch && matchesType && matchesStatus && matchesDate;
    });
  }, [entries, search, typeFilter, statusFilter, startDateFilter, endDateFilter]);

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

      if (auth?.currentUser?.uid) {
        ensureAdminInvestors(auth.currentUser.uid);
      }

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
        if (uPrice > 0 && (!entryForm.amount || Number(entryForm.amount) === 0)) {
          newAmount = String(Math.round(qty * uPrice * 100) / 100);
        }
        const effectiveAmt = Number(newAmount) || 0;
        if (effectiveAmt > 0 && newCost !== '') {
          newProfit = String(Math.round((effectiveAmt - Number(newCost)) * 100) / 100);
        }
      }
    } else if (entryForm.type === 'purchase') {
      if (qty > 0 && uCost > 0) {
        newAmount = String(Math.round(qty * uCost * 100) / 100);
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
      if (entryForm.type === 'withdrawal' && entryForm.investorId) {
        const pAcc = partnerAccounts.find((p) => p.id === entryForm.investorId);
        if (pAcc && amount > pAcc.withdrawableLimit) {
          throw new Error(
            `উত্তোলন ব্যর্থ: মূলধন বা বিনিয়োগ (${money(pAcc.capital)}) উত্তোলন করা যাবে না—শুধুমাত্র অর্জিত লাভ উত্তোলন করা যাবে। ${pAcc.name}-এর বর্তমান উত্তোলনযোগ্য লাভের সীমা ${money(pAcc.withdrawableLimit)}।`
          );
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

      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';
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

        setMessage(`অনুরোধ সফলভাবে তৈরি হয়েছে! জালিয়াতি রোধে এটি কার্যকর হতে ${targetApproverName}-এর অনুমোদন প্রয়োজন।`);
        setEditingEntry(null);
        setEntryReason('');
      } else if (user) {
        if (editingEntry) {
          await updateEntry(editingEntry.id, entryPayload, user.uid, user.email || undefined);
          setMessage('রেকর্ড সফলভাবে আপডেট করা হয়েছে');
          setEditingEntry(null);
        } else {
          await addEntry(entryPayload, user.uid, user.email || undefined);
          setMessage(entryForm.status === 'draft' ? 'ড্রাফট হিসেবে সংরক্ষণ করা হয়েছে' : 'লেনদেন সফলভাবে পোস্টেড করা হয়েছে');
        }
      }

      setEntryForm({
        type: 'sale',
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

      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

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
      const payload = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || undefined,
        unit: productForm.unit.trim() || 'পিস',
        currentStock: Number(productForm.currentStock) || 0,
        averageCost: Number(productForm.averageCost) || 0,
        sellingPrice: Number(productForm.sellingPrice) || 0,
        imageUrl: productForm.imageUrl.trim() || undefined,
      };

      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

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
        if (editingProduct && user) {
          await updateProduct(editingProduct.id, payload, user.uid, user.email || undefined);
          setMessage(`পণ্য "${payload.name}" সফলভাবে আপডেট করা হয়েছে`);
        } else {
          await addProduct(payload);
          setMessage('ইনভেন্টরি পণ্য সফলভাবে যোগ করা হয়েছে');
        }
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

      const payloads = filledRows.map((row) => {
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

        return {
          name: row.name.trim(),
          sku: row.sku.trim() || undefined,
          unit: row.unit.trim() || 'কেজি',
          currentStock: Number(row.currentStock) || 0,
          averageCost: finalCost,
          sellingPrice: finalSell,
          imageUrl: row.imageUrl.trim() || undefined,
        };
      });

      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';
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

      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

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
      } else if (user) {
        await addProfitDistribution(distPayload, user.uid);
        setMessage('মুনাফা বণ্টন সফলভাবে সংরক্ষিত হয়েছে');
      }

      setShowProfitModal(false);
    } catch (err: any) {
      setError(err?.message || 'মুনাফা বণ্টন ব্যর্থ হয়েছে');
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
      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

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
      } else if (user) {
        await removeEntry(showDeleteModal.id, user.uid, user.email || undefined);
        setMessage(`রেকর্ড "${showDeleteModal.title}" সফলভাবে স্থায়ীভাবে মুছে ফেলা হয়েছে।`);
        setShowDeleteModal(null);
      }
    } catch (e: any) {
      setError(e?.message || 'মুছে ফেলা ব্যর্থ হয়েছে');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmVoid() {
    if (!showVoidModal) return;
    if (!voidReasonInput.trim()) {
      setError('বাতিল বা রিভার্স করার কারণ উল্লেখ করা আবশ্যক');
      return;
    }

    setBusyTone('danger');
    setBusyText('হিসাব রিভার্স (Void) করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

        await createApprovalRequest({
          actionType: 'edit_entry',
          targetCollection: 'entries',
          targetId: showVoidModal.id,
          title: `হিসাব বাতিল (Void/Reverse): ${showVoidModal.title} (${money(showVoidModal.amount)})`,
          description: `হিসাব রিভার্স করার অনুরোধ। আগের স্ট্যাটাস: ${showVoidModal.status}`,
          reason: voidReasonInput.trim(),
          requestedBy: currentAdmin.username,
          requestedByName: currentAdmin.displayName,
          requestedAt: new Date().toISOString(),
          requestedAtFormatted: formatBengaliDateTime(new Date()),
          targetApprover,
          targetApproverName,
          status: 'pending',
          payload: {
            status: 'void',
            voidReason: voidReasonInput.trim(),
            voidedBy: currentAdmin.username,
          },
          previousData: showVoidModal,
        });

        setMessage(`রিভার্স করার অনুরোধ পাঠানো হয়েছে! ${targetApproverName}-এর অনুমোদনের পর তা কার্যকর হবে।`);
        setShowVoidModal(null);
        setVoidReasonInput('');
      } else if (user) {
        await voidPostedEntry(showVoidModal, voidReasonInput.trim(), user.uid, user.email || undefined);
        setMessage(`লেনদেন "${showVoidModal.title}" সফলভাবে বাতিল (Void/Reverse) করা হয়েছে; ব্যালেন্স স্বয়ংক্রিয়ভাবে আপডেট হয়েছে।`);
        setShowVoidModal(null);
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
      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

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
      } else if (user) {
        await removeInvestor(showInvestorDeleteModal.id, user.uid, user.email || undefined);
        setMessage(`অংশীদার "${showInvestorDeleteModal.name}" সফলভাবে ডিলিট করা হয়েছে।`);
        setShowInvestorDeleteModal(null);
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
      if (currentAdmin) {
        const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
        const targetApproverName = currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

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
      } else if (user) {
        await removeProduct(showProductDeleteModal.id, user.uid, user.email || undefined);
        setMessage(`পণ্য "${showProductDeleteModal.name}" সফলভাবে ডিলিট করা হয়েছে।`);
        setShowProductDeleteModal(null);
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
      const actorUid = user?.uid || currentAdmin?.username || 'admin';
      await removeProfitDistribution(showDistributionDeleteModal.id, actorUid, user?.email || currentAdmin?.displayName);
      setMessage(`মুনাফা বণ্টন "${showDistributionDeleteModal.periodName}" সফলভাবে ডিলিট করা হয়েছে।`);
      setShowDistributionDeleteModal(null);
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

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!admin || !db) return;
    setBusyTone('default');
    setBusyText('ব্যবসার সেটিংস সংরক্ষণ করা হচ্ছে…');
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 380));
      await setDoc(doc(db, 'businessSettings', 'main'), {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      }, { merge: true });
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
              const targetApprover = currentAdmin.username === 'Rakib' ? 'Limon' : 'Rakib';
              const targetApproverName =
                currentAdmin.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';
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
                <button className="secondary" onClick={handleDownloadPdf} disabled={isPdfLoading}>
                  <Download size={17} /> {isPdfLoading ? 'প্রস্তুত হচ্ছে…' : 'পিডিএফ রিপোর্ট'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setTab('terms')}
                  style={{ borderColor: '#99f6e4', background: '#f0fdfa', color: '#0f766e', fontWeight: 700 }}
                >
                  <ShieldCheck size={16} /> শর্তাবলী ও নীতিমালা
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
                <button
                  type="button"
                  className={`today-inspect-btn ${dashPreset === 'today' ? 'active' : ''}`}
                  onClick={() => setDashPreset(dashPreset === 'today' ? 'all' : 'today')}
                >
                  {dashPreset === 'today' ? 'সব দিনের হিসাবে ফিরুন' : 'শুধু আজকের বিস্তারিত দেখুন →'}
                </button>
              </div>
              <div className="today-metrics-strip">
                <div className="today-metric-item">
                  <span>আজকের বিক্রয় ({todayBreakdown.salesCount}টি)</span>
                  <strong className="text-blue">{money(todayBreakdown.sales)}</strong>
                </div>
                <div className="today-metric-item">
                  <span>আজকের ক্রয় খরচ (COGS)</span>
                  <strong className="text-amber">{money(todayBreakdown.cogs)}</strong>
                </div>
                <div className="today-metric-item">
                  <span>আজকের পরিচালন খরচ</span>
                  <strong className="text-red">{money(todayBreakdown.expenses)}</strong>
                </div>
                <div className="today-metric-item highlight">
                  <span>আজকের নিট {todayBreakdown.netProfit >= 0 ? 'লাভ' : 'ক্ষতি'}</span>
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

            {/* 4 FILTERED PERIOD KPI CARDS */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon blue"><ArrowUpRight /></div>
                <div className="stat-content">
                  <span>{dashPreset === 'all' ? 'মোট বিক্রয় রাজস্ব' : 'নির্বাচিত সময়ের বিক্রয়'}</span>
                  <strong>{money(dashPeriodStats.sales)}</strong>
                  <small className="stat-sub-meta">
                    বিক্রয় মুনাফা (Gross): <b style={{ color: '#059669' }}>+{money(dashPeriodStats.grossProfit)}</b>
                  </small>
                </div>
              </div>

              <div className="stat-card">
                <div className={`stat-icon ${dashPeriodStats.netProfit >= 0 ? 'green' : 'orange'}`}>
                  <Activity />
                </div>
                <div className="stat-content">
                  <span>
                    {dashPreset === 'all'
                      ? 'প্রকৃত নিট মুনাফা (Net Profit)'
                      : `নির্বাচিত সময়ের নিট ${dashPeriodStats.netProfit >= 0 ? 'লাভ' : 'ক্ষতি'}`}
                  </span>
                  <strong style={{ color: dashPeriodStats.netProfit >= 0 ? '#059669' : '#dc2626' }}>
                    {dashPeriodStats.netProfit >= 0 ? '+' : ''}{money(dashPeriodStats.netProfit)}
                  </strong>
                  <small className="stat-sub-meta">
                    {dashPeriodStats.sales > 0
                      ? `লাভের হার: ${((dashPeriodStats.netProfit / dashPeriodStats.sales) * 100).toFixed(1)}%`
                      : 'বিক্রয় লাভ − পরিচালন খরচ'}
                  </small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon orange"><ArrowDownLeft /></div>
                <div className="stat-content">
                  <span>ক্রয় খরচ (COGS) ও ব্যয়</span>
                  <strong>{money(dashPeriodStats.cogs + dashPeriodStats.expenses)}</strong>
                  <small className="stat-sub-meta">
                    COGS: {money(dashPeriodStats.cogs)} · খরচ: {money(dashPeriodStats.expenses)}
                  </small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon purple"><Wallet /></div>
                <div className="stat-content">
                  <span>বিনিয়োগ ও উত্তোলন</span>
                  <strong>{money(dashPeriodStats.investments)}</strong>
                  <small className="stat-sub-meta">
                    উত্তোলন: <b style={{ color: '#b91c1c' }}>{money(dashPeriodStats.withdrawals)}</b> · মাল ক্রয়: {money(dashPeriodStats.purchases)}
                  </small>
                </div>
              </div>
            </div>

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
                      <th>ক্রয় খরচ (COGS)</th>
                      <th>পরিচালন খরচ</th>
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
                            <span style={{ color: '#b45309', fontWeight: 600 }}>{money(day.cogs)}</span>
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
              {admin && (
                <div className="inventory-top-actions">
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
                </div>
              )}
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
                  {products.map((p) => (
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
                      <td>{p.sku || '—'}</td>
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
                  🔒 <b>মূলধন ({money(pAcc?.capital || 0)}) উত্তোলনযোগ্য নয়।</b> শুধুমাত্র অর্জিত লাভ উত্তোলন করা যাবে। এই অংশীদারের বর্তমান <b>উত্তোলনযোগ্য লাভের সীমা: {money(pAcc?.withdrawableLimit || 0)}</b> (মোট লাভ: {money(pAcc?.allocatedProfit || 0)} − পূর্বের উত্তোলন: {money(pAcc?.withdrawals || 0)})
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

            {currentAdmin && (
              <div className="full" style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                  🛡️ দ্বৈত-অনুমোদনের কারণ / নোট (Reason for Approval):
                  <input
                    placeholder="উদাঃ আজকের পণ্য বিক্রয় / নতুন স্টক ক্রয়..."
                    value={entryReason}
                    onChange={(e) => setEntryReason(e.target.value)}
                    style={{ background: '#ffffff' }}
                  />
                </label>
                <small style={{ color: '#0d9488', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                  জালিয়াতি রোধে এটি জমা দিলে {otherPartner.displayName}-এর অনুমোদনের পর মূল হিসাবে যুক্ত হবে।
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
                ) : currentAdmin ? (
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
            {currentAdmin && (
              <div className="full" style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                  🛡️ দ্বৈত-অনুমোদনের কারণ / নোট:
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
                ) : currentAdmin ? (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ImageIcon size={16} color="#0d9488" /> পণ্যের ছবি (Product Photo)
                  </span>
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
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
              </label>

              <label>
                SKU / কোড (ঐচ্ছিক)
                <input
                  value={productForm.sku}
                  placeholder="যেমন: CRAB-01"
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                />
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

              {currentAdmin && (
                <div className="full" style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                  <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                    🛡️ দ্বৈত-অনুমোদনের কারণ / নোট (Reason for Approval):
                    <input
                      placeholder="উদাঃ নতুন স্টক ক্রয় / পণ্যের মূল্য পরিবর্তন..."
                      value={productReason}
                      onChange={(e) => setProductReason(e.target.value)}
                      style={{ background: '#ffffff' }}
                    />
                  </label>
                  <small style={{ color: '#0d9488', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                    জালিয়াতি রোধে এটি জমা দিলে {otherPartner.displayName}-এর অনুমোদনের পর ইনভেন্টরিতে যুক্ত হবে।
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
                  ) : currentAdmin ? (
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

              {currentAdmin && (
                <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '10px 12px' }}>
                  <label style={{ display: 'grid', gap: '4px', fontSize: '12.5px', fontWeight: 600, color: '#0f766e' }}>
                    🛡️ দ্বৈত-অনুমোদনের কারণ / নোট (Reason for Approval):
                    <input
                      placeholder="উদাঃ ৫-৬টি পণ্য গড় হিসাবে নতুন স্টক আপলোড..."
                      value={productReason}
                      onChange={(e) => setProductReason(e.target.value)}
                      style={{ background: '#ffffff' }}
                    />
                  </label>
                  <small style={{ color: '#0d9488', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                    জালিয়াতি রোধে এটি জমা দিলে {otherPartner.displayName}-এর অনুমোদনের পর একসাথে সবগুলো পণ্য ইনভেন্টরিতে যুক্ত হবে।
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
                  ) : currentAdmin ? (
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
                  <b style={{ color: '#b42318' }}>-{money(viewPartnerModal.withdrawals)}</b>
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

            {currentAdmin && (
              <div className="modal-field">
                <label htmlFor="delete-entry-reason">
                  🛡️ ডিলিট করার কারণ লিখুন (আবশ্যক):
                </label>
                <input
                  id="delete-entry-reason"
                  required
                  placeholder="উদাঃ ভুলবশত ডাবল এন্ট্রি হয়েছিল / হিসাব সংশোধন..."
                  value={deleteReasonInput}
                  onChange={(e) => setDeleteReasonInput(e.target.value)}
                />
                <small style={{ color: '#64748b', fontSize: '11.5px' }}>
                  জালিয়াতি রোধে {otherPartner.displayName}-এর অনুমোদনের পর এটি স্থায়ীভাবে মুছে যাবে।
                </small>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={handleConfirmDelete}
                disabled={busy || (Boolean(currentAdmin) && !deleteReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>
                  {busy
                    ? 'ডিলিট প্রসেস হচ্ছে…'
                    : currentAdmin
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
              <label htmlFor="void-reason-input">রিভার্স বা বাতিল করার কারণ (আবশ্যক):</label>
              <input
                id="void-reason-input"
                required
                placeholder="কারণ লিখুন..."
                value={voidReasonInput}
                onChange={(e) => setVoidReasonInput(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="danger" onClick={handleConfirmVoid} disabled={busy || !voidReasonInput.trim()}>
                {busy ? <span className="btn-spinner" /> : <RotateCcw size={15} />}
                <span>
                  {busy
                    ? 'রিভার্স প্রসেস হচ্ছে…'
                    : currentAdmin
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
            {currentAdmin && (
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
                disabled={busy || (Boolean(currentAdmin) && !deleteReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>
                  {busy
                    ? 'ডিলিট প্রসেস হচ্ছে…'
                    : currentAdmin
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
            {currentAdmin && (
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
                disabled={busy || (Boolean(currentAdmin) && !deleteReasonInput.trim())}
              >
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>
                  {busy
                    ? 'পণ্য ডিলিট হচ্ছে…'
                    : currentAdmin
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
            <div className="modal-actions">
              <button type="button" className="danger" onClick={handleConfirmDeleteDistribution} disabled={busy}>
                {busy ? <span className="btn-spinner" /> : <Trash2 size={16} />}
                <span>{busy ? 'ডিলিট হচ্ছে…' : 'বণ্টন ডিলিট নিশ্চিত করুন'}</span>
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

      {/* MODAL: DEDICATED NOTIFICATIONS & DUAL-APPROVAL CENTER */}
      {showNotificationModal && currentAdmin && (() => {
        const pendingForMeList = approvalRequests.filter(
          (r) => r.status === 'pending' && r.targetApprover === currentAdmin.username
        );
        const mySentPendingList = approvalRequests.filter(
          (r) => r.status === 'pending' && r.requestedBy === currentAdmin.username
        );
        const completedRequestsList = approvalRequests.filter((r) => r.status !== 'pending').slice(0, 12);

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

              <div className="modal-actions" style={{ marginTop: '4px' }}>
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
                        {e.demo && <span className="badge demo">ডেমো</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td>{partner?.name || '—'}</td>
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
