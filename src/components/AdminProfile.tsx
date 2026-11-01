import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  Eye,
  EyeOff,
  Clock,
  FileText,
  BadgeDollarSign,
  Camera,
  Trash2,
  Banknote,
  Calendar,
  Sparkles,
  Check,
  Users,
  UserPlus,
  LogOut,
  Copy,
  Phone,
  Briefcase,
  User as UserIcon,
  Search,
  RefreshCw,
} from 'lucide-react';
import { money, dateLabel, toBengaliNumerals, formatBengaliDateTime, type PartnerAccountBalance } from '../accounting';
import type { Entry, Investor, Product, ApprovalRequest, EmployeeAccount } from '../types';
import TermsConditionsCard from './TermsConditionsCard';
import VoiceFormAssistant from './VoiceFormAssistant';

interface AdminProfileProps {
  adminUser: {
    username: string;
    displayName: string;
    role: 'admin' | 'employee';
    employeeId?: string;
    designation?: string;
    phone?: string;
  };
  avatarUrl?: string;
  onUpdateAvatar: (dataUrl: string) => Promise<void>;
  investors: Investor[];
  entries: Entry[];
  products: Product[];
  partnerAccounts: PartnerAccountBalance[];
  availableBusinessCash: number;
  onSubmitWithdrawal: (data: {
    amount: number;
    date: string;
    method: string;
    reason: string;
    investorId: string;
    investorName: string;
    entryType?: 'withdrawal' | 'loan';
  }) => Promise<void>;
  currentPassword: string;
  onUpdatePassword: (newPass: string) => Promise<void>;
  approvalRequests: ApprovalRequest[];
  onApproveRequest: (req: ApprovalRequest, note?: string) => Promise<void>;
  onRejectRequest: (req: ApprovalRequest, reason: string) => Promise<void>;
  onLogout?: () => void;
  enableVoiceInput?: boolean;
  employees?: EmployeeAccount[];
  onSaveEmployees?: (nextEmployees: EmployeeAccount[], auditReason?: string) => Promise<void>;
}

const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

export function getFridayNightWithdrawalStatus(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const hour = Number.isFinite(rawHour) ? rawHour % 24 : 0;

  // শুক্রবার সারা রাত: শুক্রবার সন্ধ্যা ৬:০০টা (18:00) থেকে শনিবার ভোর ৬:০০টা (05:59) পর্যন্ত এবং শুক্রবার রাত ১২:০০টা - ভোর ৬:০০টা
  const isOpen =
    (weekday === 'Fri' && (hour >= 18 || hour < 6)) ||
    (weekday === 'Sat' && hour < 6);

  const dayTimeBn = new Intl.DateTimeFormat('bn-BD', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  return {
    isOpen,
    dayTimeBn,
    windowTextBn: 'শুক্রবার সন্ধ্যা ৬:০০টা থেকে সারা রাত (শনিবার ভোর ৬:০০টা পর্যন্ত)',
  };
}

function compressAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 320;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        // Center-crop square
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function AdminProfile({
  adminUser,
  avatarUrl,
  onUpdateAvatar,
  investors,
  entries,
  partnerAccounts,
  availableBusinessCash,
  onSubmitWithdrawal,
  currentPassword,
  onUpdatePassword,
  approvalRequests,
  onApproveRequest,
  onRejectRequest,
  onLogout,
  enableVoiceInput = true,
  employees = [],
  onSaveEmployees,
}: AdminProfileProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [profileBannerMsg, setProfileBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isRakibAdmin = adminUser.role === 'admin' && adminUser.username === 'Rakib';
  const isEmployeeUser = adminUser.role === 'employee';

  // Active section filter ('all' | 'employees' | 'approvals' | 'wallet' | 'security' | 'terms')
  const [activeSection, setActiveSection] = useState<
    'all' | 'employees' | 'approvals' | 'wallet' | 'security' | 'terms'
  >('all');

  // Employee Account Creation & Management states (Exclusively for Rakib)
  const [empDisplayName, setEmpDisplayName] = useState('');
  const [empUsername, setEmpUsername] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empDesignation, setEmpDesignation] = useState('মেলার দোকান ও ট্রে ডেটা এন্ট্রি');
  const [showEmpCreatePass, setShowEmpCreatePass] = useState(false);
  const [isSavingEmp, setIsSavingEmp] = useState(false);
  const [empFormMsg, setEmpFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [visibleEmpPassMap, setVisibleEmpPassMap] = useState<Record<string, boolean>>({});
  const [editingEmpPassId, setEditingEmpPassId] = useState<string | null>(null);
  const [newEmpPassInput, setNewEmpPassInput] = useState<string>('');
  const [empSearchQuery, setEmpSearchQuery] = useState<string>('');
  const [empStatusFilter, setEmpStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [copiedEmpId, setCopiedEmpId] = useState<string | null>(null);

  // Withdrawal & Special Loan Modal states
  const [withdrawalWindow, setWithdrawalWindow] = useState(() => getFridayNightWithdrawalStatus());
  const [showFridayLockNotice, setShowFridayLockNotice] = useState(false);
  const [showFridayLockModal, setShowFridayLockModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawMode, setWithdrawMode] = useState<'withdrawal' | 'loan'>('withdrawal');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('নগদ ক্যাশ (Cash)');
  const [withdrawDate, setWithdrawDate] = useState(getTodayStr());
  const [withdrawReason, setWithdrawReason] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextStatus = getFridayNightWithdrawalStatus();
      setWithdrawalWindow(nextStatus);
      if (nextStatus.isOpen) {
        setShowFridayLockNotice(false);
        setShowFridayLockModal(false);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleOpenWithdrawal = () => {
    const currentWindow = getFridayNightWithdrawalStatus();
    setWithdrawalWindow(currentWindow);
    if (!currentWindow.isOpen) {
      setShowFridayLockNotice(true);
      setShowFridayLockModal(true);
      return;
    }
    setShowFridayLockNotice(false);
    setShowFridayLockModal(false);
    setWithdrawMode('withdrawal');
    setWithdrawError(null);
    setWithdrawDate(getTodayStr());
    setShowWithdrawModal(true);
  };

  // Password change form states
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Profile history tab
  const [historyFilter, setHistoryFilter] = useState<'all' | 'withdrawal' | 'loan' | 'investment'>('all');

  // Approval Center states
  const [approvalTab, setApprovalTab] = useState<'waiting_for_me' | 'my_outgoing' | 'audit_history'>('waiting_for_me');
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [rejectingReq, setRejectingReq] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalSuccessMsg, setApprovalSuccessMsg] = useState<string | null>(null);
  const [approvalErrorMsg, setApprovalErrorMsg] = useState<string | null>(null);

  const partnerName = adminUser.username === 'Rakib' ? 'লিমন (Limon)' : 'রাকিব (Rakib)';

  // Find this admin's linked partner account
  const myPartner = useMemo(() => {
    const uname = adminUser.username.toLowerCase();
    const bnName = uname === 'rakib' ? 'রাকিব' : 'লিমন';

    const match = partnerAccounts.find(
      (p) =>
        p.name.toLowerCase().includes(uname) ||
        p.id.toLowerCase().includes(uname) ||
        p.name.includes(bnName)
    );
    if (match) return match;

    const invMatch = investors.find(
      (i) =>
        i.name.toLowerCase().includes(uname) ||
        i.id.toLowerCase().includes(uname) ||
        i.name.includes(bnName)
    );

    if (invMatch) {
      return {
        id: invMatch.id,
        name: invMatch.name,
        active: invMatch.active,
        capital: 0,
        withdrawals: 0,
        loans: 0,
        netCapital: 0,
        share: 50,
        allocatedProfit: 0,
        remainingProfit: 0,
        accountBalance: 0,
        withdrawableLimit: 0,
      };
    }

    return {
      id: uname,
      name: adminUser.displayName,
      active: true,
      capital: 0,
      withdrawals: 0,
      loans: 0,
      netCapital: 0,
      share: 50,
      allocatedProfit: 0,
      remainingProfit: 0,
      accountBalance: 0,
      withdrawableLimit: 0,
    };
  }, [adminUser, partnerAccounts, investors]);

  const formattedShare = useMemo(() => {
    const num = Number(myPartner.share || 0);
    return Number.isInteger(num) ? `${num}%` : `${num.toFixed(2)}%`;
  }, [myPartner.share]);

  // Personal transaction history (strictly for this admin)
  const myEntries = useMemo(() => {
    const uname = adminUser.username.toLowerCase();
    const bnName = uname === 'rakib' ? 'রাকিব' : 'লিমন';

    return entries
      .filter((e) => {
        if (e.investorId && myPartner.id && e.investorId === myPartner.id) return true;
        const lowerTitle = (e.title || '').toLowerCase();
        if (lowerTitle.includes(uname) || lowerTitle.includes(bnName)) return true;
        return false;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [entries, myPartner, adminUser]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return myEntries;
    return myEntries.filter((e) => e.type === historyFilter);
  }, [myEntries, historyFilter]);

  // Pending withdrawal or loan requests made by this admin
  const myPendingWithdrawals = useMemo(() => {
    return approvalRequests.filter(
      (r) =>
        r.status === 'pending' &&
        r.requestedBy === adminUser.username &&
        r.actionType === 'create_entry' &&
        (r.payload?.type === 'withdrawal' || r.payload?.type === 'loan')
    );
  }, [approvalRequests, adminUser.username]);

  // Filter approval requests
  const pendingForMe = useMemo(() => {
    const myUname = adminUser.username.toLowerCase();
    return approvalRequests.filter(
      (r) =>
        r.status === 'pending' &&
        (r.targetApprover?.toLowerCase() === myUname ||
          (r.requestedBy?.toLowerCase() !== myUname && !r.targetApprover))
    );
  }, [approvalRequests, adminUser.username]);

  const myOutgoingRequests = useMemo(() => {
    const myUname = adminUser.username.toLowerCase();
    return approvalRequests.filter(
      (r) => r.status === 'pending' && r.requestedBy?.toLowerCase() === myUname
    );
  }, [approvalRequests, adminUser.username]);

  const completedAuditRequests = useMemo(() => {
    return approvalRequests.filter((r) => r.status !== 'pending');
  }, [approvalRequests]);

  // Live password strength calculation
  const passStrength = useMemo(() => {
    if (!newPass) return { score: 0, label: '', color: '#94a3b8' };
    let score = 0;
    if (newPass.length >= 6) score += 1;
    if (newPass.length >= 8) score += 1;
    if (/[A-Z]/.test(newPass)) score += 1;
    if (/[0-9]/.test(newPass)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPass)) score += 1;

    if (score <= 2) return { score: 1, label: 'দুর্বল পাসওয়ার্ড', color: '#ef4444' };
    if (score === 3) return { score: 2, label: 'মোটামুটি শক্তিশালী', color: '#f59e0b' };
    if (score === 4) return { score: 3, label: 'শক্তিশালী পাসওয়ার্ড', color: '#10b981' };
    return { score: 4, label: 'অত্যন্ত শক্তিশালী পাসওয়ার্ড', color: '#0d9488' };
  }, [newPass]);

  // Handle Profile Photo file selection
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    setProfileBannerMsg(null);
    try {
      const compressedDataUrl = await compressAvatarImage(file);
      await onUpdateAvatar(compressedDataUrl);
      setProfileBannerMsg({
        type: 'success',
        text: 'প্রোফাইল ছবি সফলভাবে যুক্ত ও সংরক্ষিত হয়েছে!',
      });
      setTimeout(() => setProfileBannerMsg(null), 5000);
    } catch (err: any) {
      setProfileBannerMsg({
        type: 'error',
        text: err?.message || 'প্রোফাইল ছবি আপলোড ব্যর্থ হয়েছে।',
      });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleRemoveAvatar() {
    setIsUploadingAvatar(true);
    setProfileBannerMsg(null);
    try {
      await onUpdateAvatar('');
      setProfileBannerMsg({
        type: 'success',
        text: 'প্রোফাইল ছবি সরিয়ে ফেলা হয়েছে।',
      });
      setTimeout(() => setProfileBannerMsg(null), 4000);
    } catch {
      setProfileBannerMsg({
        type: 'error',
        text: 'ছবি মুছতে সমস্যা হয়েছে।',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  // Handle Direct Profit Withdrawal or Special Loan Submit
  async function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawError(null);

    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setWithdrawError('দয়া করে ০ এর অধিক সঠিক টাকার পরিমাণ লিখুন।');
      return;
    }

    if (withdrawMode === 'withdrawal') {
      const currentWindow = getFridayNightWithdrawalStatus();
      setWithdrawalWindow(currentWindow);
      if (!currentWindow.isOpen) {
        setWithdrawError(
          `শুক্রবার সারা রাত ছাড়া উত্তোলন বাটন কাজ করবে না! (${currentWindow.windowTextBn} উত্তোলন করা যাবে — বর্তমান সময়: ${currentWindow.dayTimeBn})।`
        );
        return;
      }

      if (myPartner.withdrawableLimit <= 0) {
        setWithdrawError(
          `আপনার বর্তমানে কোনো উত্তোলনযোগ্য লাভাংশ নেই (${money(0)})। শর্তাবলী অনুযায়ী বিনিয়োগের টাকা (${money(myPartner.capital)}) উত্তোলনযোগ্য নয়—শুধুমাত্র লাভাংশ উত্তোলন করতে পারবেন (বিশেষ প্রয়োজনে "বিশেষ লোন" অপশন ব্যবহার করুন)।`
        );
        return;
      }

      if (amt > myPartner.withdrawableLimit) {
        setWithdrawError(
          `বিনিয়োগের টাকা (${money(myPartner.capital)}) উত্তোলনযোগ্য নয়! আপনি শুধুমাত্র আপনার উত্তোলনযোগ্য অবশিষ্ট লাভাংশ (${money(myPartner.withdrawableLimit)}) পর্যন্ত উত্তোলন করতে পারবেন।`
        );
        return;
      }
    } else {
      // Special Loan mode
      const maxLoanCash = Math.max(0, availableBusinessCash);
      if (maxLoanCash > 0 && amt > maxLoanCash) {
        setWithdrawError(
          `ব্যবসায় বর্তমানে উপলব্ধ নগদ ক্যাশ (${money(maxLoanCash)}) এর বেশি লোন নেওয়া যাবে না।`
        );
        return;
      }
    }

    if (!withdrawReason.trim()) {
      setWithdrawError(
        withdrawMode === 'loan'
          ? 'বিশেষ লোনের কারণ বা প্রয়োজনীয়তা উল্লেখ করা আবশ্যক।'
          : 'স্বচ্ছতার স্বার্থে লাভাংশ উত্তোলনের কারণ বা নোট উল্লেখ করা আবশ্যক।'
      );
      return;
    }

    setIsWithdrawing(true);
    try {
      await onSubmitWithdrawal({
        amount: Math.round(amt * 100) / 100,
        date: withdrawDate || getTodayStr(),
        method: withdrawMethod,
        reason: withdrawReason.trim(),
        investorId: myPartner.id,
        investorName: myPartner.name,
        entryType: withdrawMode,
      });

      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawReason('');
      setProfileBannerMsg({
        type: 'success',
        text:
          adminUser.username === 'Limon'
            ? withdrawMode === 'loan'
              ? `${money(amt)} বিশেষ লোনের অনুরোধ পাঠানো হয়েছে! ${partnerName} অনুমোদন দিলে তা কার্যকর হবে এবং পরবর্তী লাভাংশ থেকে অটোমেটিক কেটে নেওয়া হবে।`
              : `${money(amt)} লাভাংশ উত্তোলনের অনুরোধ পাঠানো হয়েছে! ${partnerName} অনুমোদন দিলেই তা আপনার হিসাবে যুক্ত হবে।`
            : withdrawMode === 'loan'
            ? `${money(amt)} বিশেষ লোন সফলভাবে রেকর্ড করা হয়েছে এবং পরবর্তী লাভাংশ থেকে অটোমেটিক সমন্বয় হবে।`
            : `${money(amt)} লাভাংশ উত্তোলন সফলভাবে সম্পন্ন হয়েছে!`,
      });
      setTimeout(() => setProfileBannerMsg(null), 6000);
    } catch (err: any) {
      setWithdrawError(err?.message || 'সম্পন্ন করা যায়নি।');
    } finally {
      setIsWithdrawing(false);
    }
  }

  // Handle password submit
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);

    if (oldPass !== currentPassword) {
      setFormMsg({ type: 'error', text: 'বর্তমান পাসওয়ার্ড সঠিক নয়!' });
      return;
    }

    if (newPass.length < 4) {
      setFormMsg({ type: 'error', text: 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।' });
      return;
    }

    if (newPass !== confirmPass) {
      setFormMsg({ type: 'error', text: 'নতুন পাসওয়ার্ড দুটি মিলছে না! পুনরায় টাইপ করুন।' });
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdatePassword(newPass);
      setFormMsg({
        type: 'success',
        text: `অভিনন্দন ${adminUser.displayName}! আপনার নতুন পাসওয়ার্ড সফলভাবে সংরক্ষিত হয়েছে।`,
      });
      setOldPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err: any) {
      setFormMsg({
        type: 'error',
        text: err?.message || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle approve request
  async function handleApprove(req: ApprovalRequest) {
    setProcessingReqId(req.id);
    setApprovalSuccessMsg(null);
    setApprovalErrorMsg(null);
    try {
      await onApproveRequest(req);
      setApprovalSuccessMsg(`অনুরোধ "${req.title}" সফলভাবে অনুমোদিত এবং ওয়েবসাইটে কার্যকর করা হয়েছে!`);
      setTimeout(() => setApprovalSuccessMsg(null), 6000);
    } catch (err: any) {
      setApprovalErrorMsg(err?.message || 'অনুমোদন ব্যর্থ হয়েছে');
    } finally {
      setProcessingReqId(null);
    }
  }

  // Handle reject request
  async function handleConfirmReject() {
    if (!rejectingReq) return;
    if (!rejectReason.trim()) {
      setApprovalErrorMsg('বাতিল করার কারণ উল্লেখ করা আবশ্যক!');
      return;
    }

    setProcessingReqId(rejectingReq.id);
    setApprovalErrorMsg(null);
    try {
      await onRejectRequest(rejectingReq, rejectReason.trim());
      setApprovalSuccessMsg(`অনুরোধ "${rejectingReq.title}" বাতিল করা হয়েছে।`);
      setRejectingReq(null);
      setRejectReason('');
      setTimeout(() => setApprovalSuccessMsg(null), 6000);
    } catch (err: any) {
      setApprovalErrorMsg(err?.message || 'বাতিলকরণ ব্যর্থ হয়েছে');
    } finally {
      setProcessingReqId(null);
    }
  }

  const initialLetter = adminUser.username.charAt(0).toUpperCase();

  const actionNameMap: Record<string, { label: string; color: string }> = {
    create_entry: { label: 'নতুন লেনদেন এন্ট্রি', color: '#0284c7' },
    edit_entry: { label: 'লেনদেন সংশোধন', color: '#d97706' },
    delete_entry: { label: 'লেনদেন স্থায়ী ডিলিট', color: '#dc2626' },
    create_product: { label: 'নতুন পণ্য অন্তর্ভুক্তি', color: '#059669' },
    edit_product: { label: 'পণ্য ও স্টক পরিবর্তন', color: '#d97706' },
    delete_product: { label: 'পণ্য স্থায়ী ডিলিট', color: '#dc2626' },
    create_investor: { label: 'নতুন অংশীদার যুক্ত', color: '#0d9488' },
    edit_investor: { label: 'অংশীদার তথ্য আপডেট', color: '#d97706' },
    delete_investor: { label: 'অংশীদার ডিলিট', color: '#dc2626' },
    distribute_profit: { label: 'মুনাফা বণ্টন রেকর্ড', color: '#7c3aed' },
    record_waste: { label: 'নষ্ট/ক্ষতিগ্রস্থ পণ্য রেকর্ড', color: '#e11d48' },
  };

  // Rakib-only Employee Account handlers
  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!isRakibAdmin || !onSaveEmployees) return;
    setEmpFormMsg(null);

    const cleanName = empDisplayName.trim();
    const cleanUser = empUsername.trim().replace(/\s+/g, '');
    const cleanPass = empPassword.trim();

    if (!cleanName || !cleanUser || !cleanPass) {
      setEmpFormMsg({
        type: 'error',
        text: 'অনুগ্রহ করে কর্মচারীর নাম, লগইন ইউজারনেম এবং গোপন পাসওয়ার্ড পূরণ করুন।',
      });
      return;
    }

    if (cleanUser.toLowerCase() === 'rakib' || cleanUser.toLowerCase() === 'limon') {
      setEmpFormMsg({
        type: 'error',
        text: '"Rakib" বা "Limon" সুপার অ্যাডমিন আইডি — কর্মচারীর জন্য আলাদা ইউজারনেম দিন (যেমন: Hasan, Staff1)।',
      });
      return;
    }

    if (cleanPass.length < 4) {
      setEmpFormMsg({
        type: 'error',
        text: 'কর্মচারীর পাসওয়ার্ড কমপক্ষে ৪ অক্ষর বা সংখ্যার হতে হবে।',
      });
      return;
    }

    const exists = employees.some(
      (item) => item.username.toLowerCase() === cleanUser.toLowerCase()
    );
    if (exists) {
      setEmpFormMsg({
        type: 'error',
        text: `"${cleanUser}" ইউজারনেম দিয়ে ইতিমধ্যে একটি কর্মচারী একাউন্ট রয়েছে! ভিন্ন ইউজারনেম দিন।`,
      });
      return;
    }

    const newEmployee: EmployeeAccount = {
      id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUser,
      displayName: cleanName,
      password: cleanPass,
      phone: empPhone.trim() || undefined,
      designation: empDesignation.trim() || 'মেলার দোকান ও ট্রে ডেটা এন্ট্রি',
      active: true,
      createdBy: 'Rakib',
      createdAt: formatBengaliDateTime(new Date()),
    };

    setIsSavingEmp(true);
    try {
      const nextList = [newEmployee, ...employees];
      await onSaveEmployees(
        nextList,
        `👷 রাকিব নতুন কর্মচারী একাউন্ট তৈরি করেছেন: ${cleanName} (ইউজারনেম: ${cleanUser})`
      );
      setEmpDisplayName('');
      setEmpUsername('');
      setEmpPassword('');
      setEmpPhone('');
      setEmpFormMsg({
        type: 'success',
        text: `✅ কর্মচারী "${cleanName}" (ইউজারনেম: ${cleanUser})-এর একাউন্ট সফলভাবে তৈরি হয়েছে! এখন তিনি এই ইউজারনেম ও পাসওয়ার্ড দিয়ে লগইন করে শুধু ডেটা এন্ট্রি ও ট্রে হিসাব রাখতে পারবেন।`,
      });
    } catch (err: any) {
      setEmpFormMsg({
        type: 'error',
        text: err?.message || 'কর্মচারী একাউন্ট তৈরি করতে সমস্যা হয়েছে।',
      });
    } finally {
      setIsSavingEmp(false);
    }
  }

  async function handleToggleEmployeeActive(emp: EmployeeAccount) {
    if (!isRakibAdmin || !onSaveEmployees) return;
    setIsSavingEmp(true);
    setEmpFormMsg(null);
    try {
      const nextActive = !emp.active;
      const nextList = employees.map((item) =>
        item.id === emp.id
          ? { ...item, active: nextActive, updatedAt: formatBengaliDateTime(new Date()) }
          : item
      );
      await onSaveEmployees(
        nextList,
        `👷 রাকিব কর্মচারী "${emp.displayName}" (${emp.username})-এর একাউন্ট ${
          nextActive ? 'সচল (Active)' : 'সাময়িক বন্ধ (Blocked)'
        } করেছেন`
      );
      setEmpFormMsg({
        type: 'success',
        text: `কর্মচারী "${emp.displayName}"-এর একাউন্ট ${
          nextActive ? 'সচল (Active) করা হয়েছে' : 'সাময়িক বন্ধ (Blocked) করা হয়েছে'
        }।`,
      });
    } catch (err: any) {
      setEmpFormMsg({
        type: 'error',
        text: err?.message || 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।',
      });
    } finally {
      setIsSavingEmp(false);
    }
  }

  async function handleSaveEmployeePassword(emp: EmployeeAccount) {
    if (!isRakibAdmin || !onSaveEmployees) return;
    const cleanPass = newEmpPassInput.trim();
    if (cleanPass.length < 4) {
      setEmpFormMsg({
        type: 'error',
        text: 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।',
      });
      return;
    }
    setIsSavingEmp(true);
    setEmpFormMsg(null);
    try {
      const nextList = employees.map((item) =>
        item.id === emp.id
          ? { ...item, password: cleanPass, updatedAt: formatBengaliDateTime(new Date()) }
          : item
      );
      await onSaveEmployees(
        nextList,
        `🔑 রাকিব কর্মচারী "${emp.displayName}" (${emp.username})-এর লগইন পাসওয়ার্ড পরিবর্তন করেছেন`
      );
      setEditingEmpPassId(null);
      setNewEmpPassInput('');
      setEmpFormMsg({
        type: 'success',
        text: `✅ "${emp.displayName}"-এর নতুন পাসওয়ার্ড সফলভাবে সংরক্ষিত হয়েছে!`,
      });
    } catch (err: any) {
      setEmpFormMsg({
        type: 'error',
        text: err?.message || 'পাসওয়ার্ড আপডেট করা যায়নি।',
      });
    } finally {
      setIsSavingEmp(false);
    }
  }

  async function handleDeleteEmployee(emp: EmployeeAccount) {
    if (!isRakibAdmin || !onSaveEmployees) return;
    setIsSavingEmp(true);
    setEmpFormMsg(null);
    try {
      const nextList = employees.filter((item) => item.id !== emp.id);
      await onSaveEmployees(
        nextList,
        `🗑️ রাকিব কর্মচারী "${emp.displayName}" (${emp.username})-এর একাউন্ট ডিলিট করেছেন`
      );
      setEmpFormMsg({
        type: 'success',
        text: `কর্মচারী "${emp.displayName}" (${emp.username})-এর একাউন্ট স্থায়ীভাবে মুছে ফেলা হয়েছে।`,
      });
    } catch (err: any) {
      setEmpFormMsg({
        type: 'error',
        text: err?.message || 'কর্মচারী একাউন্ট ডিলিট করা যায়নি।',
      });
    } finally {
      setIsSavingEmp(false);
    }
  }

  // Dedicated Non-Admin View when an Employee is logged in
  if (isEmployeeUser) {
    const todayStr = getTodayStr();
    const empUnameLower = adminUser.username.toLowerCase();
    const empDispLower = adminUser.displayName.toLowerCase();
    const empEntries = entries
      .filter((e) => {
        const s = String(e.seller || '').toLowerCase();
        const cb = String(e.createdBy || '').toLowerCase();
        const notes = String(e.notes || '').toLowerCase();
        return (
          s === empUnameLower ||
          s === empDispLower ||
          cb === empUnameLower ||
          cb === empDispLower ||
          notes.includes(empUnameLower) ||
          notes.includes(empDispLower)
        );
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const todayEmpEntries = empEntries.filter((e) => e.date === todayStr);
    const todayEmpSales = todayEmpEntries
      .filter((e) => e.type === 'sale' && e.status === 'posted')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalEmpSales = empEntries
      .filter((e) => e.type === 'sale' && e.status === 'posted')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return (
      <div className="profile-container">
        <div
          className="profile-executive-card"
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f766e 100%)',
          }}
        >
          <div className="profile-exec-top">
            <div className="profile-avatar-block">
              <div
                className="profile-avatar-frame"
                style={{ cursor: 'default', border: '3px solid #2dd4bf' }}
              >
                <span className="profile-avatar-initial">{initialLetter}</span>
              </div>
            </div>

            <div className="profile-exec-identity">
              <div className="profile-name-line" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <h2>{adminUser.displayName}</h2>
                <span
                  className="role-tag"
                  style={{
                    background: 'rgba(45, 212, 191, 0.2)',
                    color: '#5eead4',
                    border: '1px solid rgba(94, 234, 212, 0.45)',
                  }}
                >
                  👷 কর্মচারী (ডেটা এন্ট্রি প্যানেল)
                </span>
              </div>
              <p className="profile-exec-role">
                {adminUser.designation || 'মেলার দোকান ও ট্রে ডেটা এন্ট্রি অপারেটর'} · নিয়োগকর্তা: রাকিব (Rakib)
              </p>

              <div className="profile-exec-meta-grid">
                <div className="exec-meta-cell">
                  <span>লগইন ইউজারনেম / আইডি</span>
                  <strong>{adminUser.username}</strong>
                </div>
                <div className="exec-meta-cell">
                  <span>অ্যাক্সেস লেভেল</span>
                  <strong style={{ color: '#5eead4' }}>শুধু ডেটা এন্ট্রি ও হিসাব</strong>
                </div>
                <div className="exec-meta-cell">
                  <span>অ্যাডমিন ক্ষমতা / ডিলিট</span>
                  <strong style={{ color: '#fca5a5' }}>🚫 সম্পূর্ণ নিষিদ্ধ</strong>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '14px',
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.5 }}>
              🔒 <b>নিরাপত্তা নীতিমালা:</b> কর্মচারী একাউন্ট থেকে শুধুমাত্র প্রতিদিনের বিক্রয়, মেলার ট্রে রিফিল/বিক্রয়, QR স্ক্যানার এবং স্টক এন্ট্রি করা যাবে। কোনো প্রকার অ্যাডমিন ফিচার, ডিলিট, অনুমোদন বা অর্থ উত্তোলনের অধিকার নেই।
            </div>
            {onLogout && (
              <button
                type="button"
                className="danger"
                onClick={onLogout}
                style={{ padding: '8px 14px', fontSize: '12.5px', fontWeight: 700 }}
              >
                <LogOut size={15} /> লগআউট করুন
              </button>
            )}
          </div>
        </div>

        {/* Employee Personal Entry KPIs */}
        <div className="profile-stats-grid">
          <div className="stat-card">
            <div className="stat-icon green">
              <TrendingUp size={20} />
            </div>
            <div className="stat-content">
              <span>আমার আজকের বিক্রয় এন্ট্রি</span>
              <strong style={{ color: '#047857' }}>{money(todayEmpSales)}</strong>
              <small className="stat-sub-meta">
                আজ মোট {toBengaliNumerals(todayEmpEntries.length)}টি এন্ট্রি করেছেন
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon blue">
              <FileText size={20} />
            </div>
            <div className="stat-content">
              <span>আমার সর্বমোট বিক্রয় রেকর্ড</span>
              <strong>{money(totalEmpSales)}</strong>
              <small className="stat-sub-meta">
                মোট {toBengaliNumerals(empEntries.length)}টি লেনদেন এন্ট্রি
              </small>
            </div>
          </div>
        </div>

        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-head">
            <div className="panel-head-info">
              <h3>📋 আমার প্রোফাইল থেকে এন্ট্রিকৃত লেনদেন সমূহ ({toBengaliNumerals(empEntries.length)})</h3>
              <p>আপনার আইডি ({adminUser.username}) থেকে যে সকল বিক্রয় ও হিসাব এন্ট্রি করা হয়েছে</p>
            </div>
          </div>
          {empEntries.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              আপনি এখনো কোনো লেনদেন এন্ট্রি করেননি।
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>তারিখ</th>
                    <th>ধরন</th>
                    <th>বিবরণ</th>
                    <th>টাকার পরিমাণ</th>
                  </tr>
                </thead>
                <tbody>
                  {empEntries.slice(0, 50).map((e) => (
                    <tr key={e.id}>
                      <td>{dateLabel(e.date)}</td>
                      <td>
                        <span className="badge posted">
                          {e.type === 'sale' ? 'বিক্রয়' : e.type === 'purchase' ? 'মাল ক্রয়' : 'খরচ'}
                        </span>
                      </td>
                      <td>
                        <b>{e.title}</b>
                      </td>
                      <td style={{ fontWeight: 700, color: '#0f766e' }}>{money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      {/* Hidden File Input for Avatar Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleAvatarChange}
      />

      {profileBannerMsg && (
        <div className={profileBannerMsg.type === 'success' ? 'success' : 'alert'} style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {profileBannerMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{profileBannerMsg.text}</span>
          </div>
          <button type="button" onClick={() => setProfileBannerMsg(null)}>×</button>
        </div>
      )}

      {/* 1. PREMIUM EXECUTIVE PROFILE CARD (Avatar Upload + Identity + Quick Withdraw) */}
      <div className="profile-executive-card">
        <div className="profile-exec-top">
          {/* Avatar with Photo & Camera Trigger */}
          <div className="profile-avatar-block">
            <div
              className="profile-avatar-frame"
              onClick={() => fileInputRef.current?.click()}
              title="প্রোফাইল ছবি পরিবর্তন করতে ক্লিক করুন"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={adminUser.displayName}
                  className="profile-avatar-img"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="profile-avatar-initial">{initialLetter}</span>
              )}
              <button
                type="button"
                className="profile-avatar-cam-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={isUploadingAvatar}
                aria-label="প্রোফাইল ছবি যুক্ত বা পরিবর্তন করুন"
                title="ছবি যুক্ত করুন"
              >
                <Camera size={14} />
              </button>
            </div>

            <div className="profile-avatar-btns">
              <button
                type="button"
                className="avatar-upload-pill"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? <span className="btn-spinner" /> : <Camera size={13} />}
                <span>{isUploadingAvatar ? 'আপলোড হচ্ছে…' : avatarUrl ? 'ছবি পরিবর্তন' : 'ছবি যুক্ত করুন'}</span>
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="avatar-remove-pill"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar}
                  title="প্রোফাইল ছবি মুছে ফেলুন"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Identity & Partner Metadata */}
          <div className="profile-exec-identity">
            <div className="profile-name-line">
              <h2>{adminUser.displayName}</h2>
              <span className="role-tag">সুপার অ্যাডমিন</span>
            </div>
            <p className="profile-exec-role">
              Glowzaa Shop · কো-ফাউন্ডার ও প্রধান অংশীদার
            </p>

            <div className="profile-exec-meta-grid">
              <div className="exec-meta-cell">
                <span>ইউজার আইডি</span>
                <strong>{adminUser.username}</strong>
              </div>
              <div className="exec-meta-cell">
                <span>দ্বৈত-অনুমোদন পার্টনার</span>
                <strong className="text-teal">{partnerName}</strong>
              </div>
              <div className="exec-meta-cell">
                <span>ব্যক্তিগত মালিকানা</span>
                <strong>{formattedShare} শেয়ার</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Integrated Personal Profit Balance & Instant Withdraw / Special Loan Action Bar */}
        <div className="profile-wallet-strip">
          <div className="wallet-strip-info">
            <div className="wallet-strip-label">
              <TrendingUp size={15} style={{ flexShrink: 0 }} />
              <span>আমার উত্তোলনযোগ্য নিট লাভাংশ (বিনিয়োগের টাকা উত্তোলনযোগ্য নয় • প্রতি শুক্রবার রাতে উত্তোলন)</span>
            </div>
            <div className="wallet-strip-amount-row">
              <strong className="wallet-strip-balance">{money(myPartner.withdrawableLimit)}</strong>
              <div className="wallet-strip-meta-pills">
                <span className="wallet-strip-limit" title="বিনিয়োগের টাকা উত্তোলন যোগ্য নয়">
                  🔒 স্থির বিনিয়োগ: <b>{money(myPartner.capital)}</b>
                </span>
                {myPartner.loans > 0 && (
                  <span
                    className="wallet-strip-limit"
                    style={{
                      background: 'rgba(245, 158, 11, 0.2)',
                      borderColor: 'rgba(251, 191, 36, 0.4)',
                      color: '#fef3c7',
                    }}
                  >
                    ⚡ লোন কর্তনকৃত: <b>-{money(myPartner.loans)}</b>
                  </span>
                )}
                <span className="wallet-strip-limit">
                  মোট ইক্যুইটি: <b>{money(myPartner.accountBalance)}</b>
                </span>
              </div>
            </div>
          </div>

          <div className="wallet-strip-actions">
            <div className="wallet-cta-row">
              <button
                type="button"
                className="profile-withdraw-cta"
                onClick={handleOpenWithdrawal}
              >
                <ArrowDownLeft size={16} className="cta-icon" />
                <span>লাভাংশ উত্তোলন</span>
              </button>

              <button
                type="button"
                className="profile-loan-cta"
                onClick={() => {
                  setWithdrawMode('loan');
                  setWithdrawError(null);
                  setWithdrawDate(getTodayStr());
                  setShowWithdrawModal(true);
                }}
              >
                <Banknote size={16} className="cta-icon" />
                <span>বিশেষ লোন নিন</span>
              </button>
            </div>

            {showFridayLockNotice && !withdrawalWindow.isOpen && (
              <div className="wallet-friday-status-bar locked" role="alert">
                <Clock size={14} className="status-clock-icon" />
                <span>
                  🔒 শুক্রবার সারা রাত ছাড়া লাভাংশ উত্তোলন বন্ধ! শুধুমাত্র প্রতি শুক্রবার সন্ধ্যা ৬:০০টা থেকে সারা রাত উত্তোলন করা যাবে। (এখন: {withdrawalWindow.dayTimeBn})
                </span>
                <button
                  type="button"
                  className="friday-notice-close"
                  onClick={() => setShowFridayLockNotice(false)}
                  aria-label="বার্তা বন্ধ করুন"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. PERSONAL FINANCIAL KPI GRID (2x2 on Mobile, 4x1 on Desktop) */}
      <div className="profile-stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Lock size={20} />
          </div>
          <div className="stat-content">
            <span>আমার স্থির মূলধন বিনিয়োগ</span>
            <strong>{money(myPartner.capital)}</strong>
            <small className="stat-sub-meta" style={{ color: '#475569', fontWeight: 600 }}>
              🔒 বিনিয়োগের টাকা উত্তোলনযোগ্য নয় • শেয়ার: {formattedShare}
            </small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <TrendingUp size={20} />
          </div>
          <div className="stat-content">
            <span>আমার অর্জিত মোট লাভাংশ</span>
            <strong style={{ color: '#047857' }}>+{money(myPartner.allocatedProfit)}</strong>
            <small className="stat-sub-meta">প্রতি শুক্রবার রাতে উত্তোলনযোগ্য</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">
            <ArrowDownLeft size={20} />
          </div>
          <div className="stat-content">
            <span>লাভাংশ উত্তোলন ও বিশেষ লোন</span>
            <strong style={{ color: '#b91c1c' }}>-{money(myPartner.withdrawals + myPartner.loans)}</strong>
            <small className="stat-sub-meta">
              উত্তোলন: {money(myPartner.withdrawals)} | লোন (অটো কর্তন): {money(myPartner.loans)}
            </small>
          </div>
        </div>

        <div className="stat-card" style={{ background: '#f0fdfa', borderColor: '#ccfbf1' }}>
          <div className="stat-icon" style={{ background: '#0d9488', color: '#ffffff' }}>
            <BadgeDollarSign size={20} />
          </div>
          <div className="stat-content">
            <span style={{ color: '#0f766e', fontWeight: 700 }}>উত্তোলনযোগ্য অবশিষ্ট লাভাংশ</span>
            <strong style={{ color: '#0f766e' }}>{money(myPartner.withdrawableLimit)}</strong>
            <small className="stat-sub-meta" style={{ color: '#0d9488', fontWeight: 600 }}>
              লোন সমন্বয়ের পর নিট উত্তোলনযোগ্য লাভাংশ
            </small>
          </div>
        </div>
      </div>

      {/* 3. QUICK SECTION FILTER BAR */}
      <div className="profile-section-tabs" role="tablist" aria-label="প্রোফাইল সেকশন ফিল্টার">
        <button
          type="button"
          className={`profile-sec-btn ${activeSection === 'all' ? 'active' : ''}`}
          onClick={() => setActiveSection('all')}
        >
          সব দেখুন
        </button>
        {isRakibAdmin && (
          <button
            type="button"
            className={`profile-sec-btn ${activeSection === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveSection('employees')}
            style={
              activeSection === 'employees'
                ? undefined
                : { borderColor: '#5eead4', background: '#f0fdfa', color: '#0f766e', fontWeight: 800 }
            }
          >
            👷 কর্মচারী একাউন্ট তৈরি ও নিয়ন্ত্রণ
            <span className="sec-badge-count" style={{ background: '#0d9488', color: '#ffffff' }}>
              {toBengaliNumerals(employees.length)}
            </span>
          </button>
        )}
        <button
          type="button"
          className={`profile-sec-btn ${activeSection === 'approvals' ? 'active' : ''}`}
          onClick={() => setActiveSection('approvals')}
        >
          অনুমোদন কেন্দ্র
          {pendingForMe.length > 0 && (
            <span className="sec-badge-count">{pendingForMe.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`profile-sec-btn ${activeSection === 'terms' ? 'active' : ''}`}
          onClick={() => setActiveSection('terms')}
        >
          শর্তাবলী ও নীতিমালা (৭টি শর্ত)
        </button>
        <button
          type="button"
          className={`profile-sec-btn ${activeSection === 'wallet' ? 'active' : ''}`}
          onClick={() => setActiveSection('wallet')}
        >
          উত্তোলন, লোন ও লেনদেন ({myEntries.length})
        </button>
        <button
          type="button"
          className={`profile-sec-btn ${activeSection === 'security' ? 'active' : ''}`}
          onClick={() => setActiveSection('security')}
        >
          পাসওয়ার্ড পরিবর্তন
        </button>
      </div>

      {/* 3.5 EXCLUSIVE EMPLOYEE ACCOUNT CREATION & MANAGEMENT (RAKIB ONLY) */}
      {isRakibAdmin && (activeSection === 'all' || activeSection === 'employees') && (() => {
        const activeEmpCount = employees.filter((e) => e.active).length;
        const blockedEmpCount = employees.length - activeEmpCount;

        const getEmployeeActivity = (emp: EmployeeAccount) => {
          const unameLow = emp.username.toLowerCase();
          const dispLow = emp.displayName.toLowerCase();
          const todayStr = getTodayStr();
          let totalCount = 0;
          let todayCount = 0;
          let totalSalesVal = 0;

          for (const entry of entries) {
            const s = String(entry.seller || '').toLowerCase();
            const cb = String(entry.createdBy || '').toLowerCase();
            if (s === unameLow || s === dispLow || cb === unameLow || cb === dispLow) {
              totalCount += 1;
              if (entry.date === todayStr) todayCount += 1;
              if (entry.type === 'sale' && entry.status === 'posted') {
                totalSalesVal += Number(entry.amount || 0);
              }
            }
          }
          return { totalCount, todayCount, totalSalesVal };
        };

        const totalAllEmpEntries = employees.reduce(
          (sum, emp) => sum + getEmployeeActivity(emp).totalCount,
          0
        );

        const filteredEmployeesList = employees.filter((emp) => {
          if (empStatusFilter === 'active' && !emp.active) return false;
          if (empStatusFilter === 'blocked' && emp.active) return false;
          const q = empSearchQuery.trim().toLowerCase();
          if (!q) return true;
          return (
            emp.displayName.toLowerCase().includes(q) ||
            emp.username.toLowerCase().includes(q) ||
            (emp.phone || '').toLowerCase().includes(q) ||
            (emp.designation || '').toLowerCase().includes(q)
          );
        });

        const rolePresets = [
          { icon: '🍱', label: 'মেলার দোকান ও ট্রে ডেটা এন্ট্রি' },
          { icon: '📷', label: 'QR ও ক্যামেরা সেল অপারেটর' },
          { icon: '📦', label: 'স্টক ও গোডাউন সহকারী' },
          { icon: '🧾', label: 'ক্যাশ ও দৈনিক হিসাব সহকারী' },
        ];

        const handleAutoGenerateCredentials = () => {
          const nextNum = employees.length + 1;
          const asciiFromName = empDisplayName
            .trim()
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 8);
          const generatedUser = asciiFromName
            ? `${asciiFromName}${nextNum}`
            : `Staff${nextNum}`;
          const randPin = Math.floor(1000 + Math.random() * 9000);
          const generatedPass = `G${randPin}`;
          if (!empDisplayName.trim()) {
            setEmpDisplayName(`কর্মচারী #${toBengaliNumerals(nextNum)}`);
          }
          setEmpUsername(generatedUser);
          setEmpPassword(generatedPass);
          setShowEmpCreatePass(true);
          setEmpFormMsg({
            type: 'success',
            text: `✨ অটো আইডি "${generatedUser}" এবং পাসওয়ার্ড "${generatedPass}" তৈরি করা হয়েছে! এখন নাম যাচাই করে নিচের বাটনে চাপ দিন।`,
          });
        };

        const handleCopyCredentials = async (emp: EmployeeAccount) => {
          const textToCopy = `🏪 Glowzaa Shop — কর্মচারী লগইন তথ্য\n👷 নাম: ${emp.displayName}\n🆔 ইউজারনেম (ID): ${emp.username}\n🔑 পাসওয়ার্ড: ${emp.password}\n📌 দায়িত্ব: ${emp.designation || 'ডেটা এন্ট্রি ও হিসাব'}`;
          try {
            await navigator.clipboard.writeText(textToCopy);
            setCopiedEmpId(emp.id);
            setTimeout(() => setCopiedEmpId(null), 3000);
          } catch {
            setEmpFormMsg({
              type: 'success',
              text: `লগইন তথ্য — আইডি: ${emp.username} | পাসওয়ার্ড: ${emp.password}`,
            });
          }
        };

        const empCreatePassLen = empPassword.trim().length;
        const empPassStrengthLabel =
          empCreatePassLen === 0
            ? ''
            : empCreatePassLen < 4
            ? 'কমপক্ষে ৪ অক্ষর দিন'
            : empCreatePassLen < 6
            ? 'সুরক্ষিত (Valid)'
            : 'শক্তিশালী পাসওয়ার্ড';
        const empPassStrengthColor =
          empCreatePassLen < 4 ? '#ef4444' : empCreatePassLen < 6 ? '#f59e0b' : '#10b981';

        return (
          <div className="emp-mgmt-shell">
            {/* Executive Gradient Header + 3 KPI Strip */}
            <div className="emp-mgmt-hero">
              <div className="emp-mgmt-hero-top">
                <div className="emp-mgmt-title-group">
                  <div className="emp-mgmt-icon-box">
                    <UserPlus size={24} />
                  </div>
                  <div className="emp-mgmt-heading-text">
                    <div className="emp-mgmt-badge-row">
                      <span className="emp-rakib-lock-badge">
                        <Lock size={12} /> শুধু Rakib নিয়ন্ত্রিত
                      </span>
                      <span className="emp-zero-admin-badge">
                        🛡️ জিরো-অ্যাডমিন রেস্ট্রিকশন সক্রিয়
                      </span>
                    </div>
                    <h3>👷 কর্মচারীর একাউন্ট তৈরি ও নিয়ন্ত্রণ প্যানেল</h3>
                    <p>
                      এখান থেকে কর্মচারীর লগইন আইডি ও পাসওয়ার্ড তৈরি করুন। কর্মচারী শুধু{' '}
                      <b>ডেটা এন্ট্রি, QR স্ক্যান এবং মেলার ট্রে ও বিক্রয় হিসাব</b> রাখতে পারবে — কোনো প্রকার{' '}
                      <b>অ্যাডমিন ফিচার বা ডিলিট অধিকার পাবে না</b>।
                    </p>
                  </div>
                </div>
              </div>

              <div className="emp-mgmt-kpi-strip">
                <div className="emp-kpi-box">
                  <span>মোট কর্মচারী একাউন্ট</span>
                  <strong>{toBengaliNumerals(employees.length)} জন</strong>
                </div>
                <div className="emp-kpi-box active-tone">
                  <span>🟢 সচল / 🔴 বন্ধ</span>
                  <strong>
                    {toBengaliNumerals(activeEmpCount)} সচল • {toBengaliNumerals(blockedEmpCount)} বন্ধ
                  </strong>
                </div>
                <div className="emp-kpi-box sales-tone">
                  <span>📊 কর্মচারী কর্তৃক এন্ট্রি</span>
                  <strong>{toBengaliNumerals(totalAllEmpEntries)}টি রেকর্ড</strong>
                </div>
              </div>
            </div>

            <div className="emp-mgmt-body">
              {empFormMsg && (
                <div
                  className={empFormMsg.type === 'success' ? 'success' : 'alert'}
                  style={{ marginBottom: '16px', borderRadius: '12px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {empFormMsg.type === 'success' ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                    <span>{empFormMsg.text}</span>
                  </div>
                  <button type="button" onClick={() => setEmpFormMsg(null)}>
                    ×
                  </button>
                </div>
              )}

              <div className="emp-mgmt-grid">
                {/* LEFT CARD: CREATE NEW EMPLOYEE ACCOUNT FORM */}
                <form
                  onSubmit={handleCreateEmployee}
                  className="emp-modern-card create-card"
                  autoComplete="off"
                >
                  <div className="emp-card-head">
                    <div className="emp-card-head-title">
                      <div className="emp-card-head-icon">
                        <UserPlus size={18} />
                      </div>
                      <div>
                        <h4>নতুন কর্মচারী একাউন্ট তৈরি করুন</h4>
                        <small>কর্মচারীর নাম, লগইন আইডি ও পাসওয়ার্ড নির্ধারণ করুন</small>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="emp-auto-gen-btn"
                      onClick={handleAutoGenerateCredentials}
                      title="এক ক্লিকে অটোমেটিক ইউজারনেম ও পাসওয়ার্ড তৈরি করুন"
                    >
                      <Sparkles size={13} />
                      <span>অটো আইডি/পাসওয়ার্ড</span>
                    </button>
                  </div>

                  {/* Field 1: Full Name */}
                  <div className="emp-field">
                    <div className="emp-field-label">
                      <span>
                        কর্মচারীর পূর্ণ নাম (বাংলায় বা ইংরেজিতে)
                        <span className="req-star">*</span>
                      </span>
                      <span style={{ fontSize: '11px', color: '#0d9488', fontWeight: 700 }}>
                        প্রোফাইল নাম
                      </span>
                    </div>
                    <div className="emp-input-box">
                      <span className="emp-input-prefix">
                        <UserIcon size={16} />
                      </span>
                      <input
                        type="text"
                        required
                        className="emp-modern-input"
                        value={empDisplayName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEmpDisplayName(val);
                          if (!empUsername.trim()) {
                            const cleanAscii = val.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
                            if (cleanAscii.length >= 3) {
                              setEmpUsername(cleanAscii);
                            }
                          }
                        }}
                        placeholder="যেমন: হাসান (কর্মচারী) বা রহিম"
                      />
                    </div>
                  </div>

                  {/* Row 2: Login Username + Secret Password (Stacks on mobile, 2 cols on desktop) */}
                  <div className="emp-form-row-2">
                    <div className="emp-field">
                      <div className="emp-field-label">
                        <span>
                          লগইন ইউজারনেম (ID)
                          <span className="req-star">*</span>
                        </span>
                      </div>
                      <div className="emp-input-box">
                        <span className="emp-input-prefix">
                          <Key size={15} />
                        </span>
                        <input
                          type="text"
                          required
                          className="emp-modern-input"
                          value={empUsername}
                          onChange={(e) => setEmpUsername(e.target.value.replace(/\s+/g, ''))}
                          placeholder="যেমন: Hasan বা Staff1"
                        />
                      </div>
                    </div>

                    <div className="emp-field">
                      <div className="emp-field-label">
                        <span>
                          গোপন পাসওয়ার্ড
                          <span className="req-star">*</span>
                        </span>
                        {empPassStrengthLabel && (
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 800,
                              color: empPassStrengthColor,
                            }}
                          >
                            {empPassStrengthLabel}
                          </span>
                        )}
                      </div>
                      <div className="emp-input-box">
                        <span className="emp-input-prefix">
                          <Lock size={15} />
                        </span>
                        <input
                          type={showEmpCreatePass ? 'text' : 'password'}
                          required
                          className="emp-modern-input has-suffix"
                          value={empPassword}
                          onChange={(e) => setEmpPassword(e.target.value)}
                          placeholder="কমপক্ষে ৪ অক্ষর বা সংখ্যা"
                        />
                        <button
                          type="button"
                          className="emp-input-suffix-btn"
                          onClick={() => setShowEmpCreatePass(!showEmpCreatePass)}
                          title={showEmpCreatePass ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                        >
                          {showEmpCreatePass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Mobile Number + Designation Input */}
                  <div className="emp-form-row-2">
                    <div className="emp-field">
                      <div className="emp-field-label">
                        <span>মোবাইল নম্বর (ঐচ্ছিক)</span>
                      </div>
                      <div className="emp-input-box">
                        <span className="emp-input-prefix">
                          <Phone size={15} />
                        </span>
                        <input
                          type="tel"
                          className="emp-modern-input"
                          value={empPhone}
                          onChange={(e) => setEmpPhone(e.target.value)}
                          placeholder="০১৭xxxxxxxx"
                        />
                      </div>
                    </div>

                    <div className="emp-field">
                      <div className="emp-field-label">
                        <span>দায়িত্ব / পদবী</span>
                      </div>
                      <div className="emp-input-box">
                        <span className="emp-input-prefix">
                          <Briefcase size={15} />
                        </span>
                        <input
                          type="text"
                          className="emp-modern-input"
                          value={empDesignation}
                          onChange={(e) => setEmpDesignation(e.target.value)}
                          placeholder="মেলার দোকান ও ট্রে ডেটা এন্ট্রি"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Role / Designation Selector Chips */}
                  <div className="emp-role-presets-wrap">
                    <span className="emp-role-presets-label">
                      ⚡ এক ক্লিকে কর্মচারীর দায়িত্ব (Role) নির্বাচন করুন:
                    </span>
                    <div className="emp-role-presets-grid">
                      {rolePresets.map((preset) => {
                        const isSelected = empDesignation.trim() === preset.label;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            className={`emp-role-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => setEmpDesignation(preset.label)}
                          >
                            <b>{preset.icon}</b>
                            <span>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Modern 2-Column Permission Matrix Preview */}
                  <div className="emp-perm-matrix">
                    <div className="emp-perm-box allowed">
                      <div className="emp-perm-box-head">
                        <CheckCircle2 size={14} />
                        <span>অনুমোদিত কাজ (পাবেন)</span>
                      </div>
                      <ul className="emp-perm-list">
                        <li>বিক্রয়, মাল ক্রয় ও খরচ এন্ট্রি</li>
                        <li>QR ও ক্যামেরা অটো-সেল স্ক্যানার</li>
                        <li>মেলার ট্রে রিফিল ও বিক্রয় হিসাব</li>
                        <li>স্টক দেখা ও নতুন পণ্য যোগ</li>
                      </ul>
                    </div>

                    <div className="emp-perm-box blocked">
                      <div className="emp-perm-box-head">
                        <XCircle size={14} />
                        <span>নিষিদ্ধ অ্যাডমিন ফিচার (পাবেন না)</span>
                      </div>
                      <ul className="emp-perm-list">
                        <li>কোনো লেনদেন বা পণ্য ডিলিট/এডিট</li>
                        <li>অংশীদার, মুনাফা বণ্টন ও উত্তোলন</li>
                        <li>অনুমোদন (Approval) বা AI সহকারী</li>
                        <li>অডিট লগ, সেটিংস ও ডেটা রিসেট</li>
                      </ul>
                    </div>
                  </div>

                  <button type="submit" className="emp-submit-cta" disabled={isSavingEmp}>
                    <UserPlus size={18} />
                    <span>
                      {isSavingEmp
                        ? 'কর্মচারী একাউন্ট তৈরি হচ্ছে…'
                        : 'কর্মচারী একাউন্ট তৈরি ও সংরক্ষণ করুন'}
                    </span>
                  </button>
                </form>

                {/* RIGHT CARD: EXISTING EMPLOYEES DIRECTORY & ACCESS CONTROL */}
                <div className="emp-modern-card">
                  <div className="emp-card-head">
                    <div className="emp-card-head-title">
                      <div
                        className="emp-card-head-icon"
                        style={{
                          background: '#eff6ff',
                          borderColor: '#bfdbfe',
                          color: '#0284c7',
                        }}
                      >
                        <Users size={18} />
                      </div>
                      <div>
                        <h4>
                          তৈরিকৃত কর্মচারী একাউন্ট তালিকা ({toBengaliNumerals(employees.length)} জন)
                        </h4>
                        <small>লগইন তথ্য কপি, পাসওয়ার্ড পরিবর্তন ও অ্যাক্সেস নিয়ন্ত্রণ</small>
                      </div>
                    </div>

                    <div className="emp-dir-filter-pills">
                      <button
                        type="button"
                        className={`emp-dir-pill ${empStatusFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setEmpStatusFilter('all')}
                      >
                        সবাই ({toBengaliNumerals(employees.length)})
                      </button>
                      <button
                        type="button"
                        className={`emp-dir-pill ${empStatusFilter === 'active' ? 'active' : ''}`}
                        onClick={() => setEmpStatusFilter('active')}
                      >
                        🟢 সচল ({toBengaliNumerals(activeEmpCount)})
                      </button>
                      {blockedEmpCount > 0 && (
                        <button
                          type="button"
                          className={`emp-dir-pill ${empStatusFilter === 'blocked' ? 'active' : ''}`}
                          onClick={() => setEmpStatusFilter('blocked')}
                        >
                          🔴 বন্ধ ({toBengaliNumerals(blockedEmpCount)})
                        </button>
                      )}
                    </div>
                  </div>

                  {employees.length > 1 && (
                    <div className="emp-input-box">
                      <span className="emp-input-prefix">
                        <Search size={15} />
                      </span>
                      <input
                        type="text"
                        className="emp-modern-input"
                        value={empSearchQuery}
                        onChange={(e) => setEmpSearchQuery(e.target.value)}
                        placeholder="কর্মচারীর নাম, ইউজারনেম বা মোবাইল নম্বর দিয়ে খুঁজুন…"
                      />
                    </div>
                  )}

                  {filteredEmployeesList.length === 0 ? (
                    <div
                      style={{
                        padding: '34px 18px',
                        textAlign: 'center',
                        background: '#f8fafc',
                        borderRadius: '14px',
                        border: '1.5px dashed #cbd5e1',
                        color: '#64748b',
                        fontSize: '13px',
                        lineHeight: 1.55,
                      }}
                    >
                      <Users
                        size={32}
                        style={{ color: '#94a3b8', margin: '0 auto 8px', display: 'block' }}
                      />
                      {employees.length === 0 ? (
                        <>
                          <b>এখনো কোনো কর্মচারী একাউন্ট তৈরি করা হয়নি।</b>
                          <div style={{ marginTop: '4px', fontSize: '12px' }}>
                            বাম পাশের ফর্ম থেকে কর্মচারীর নাম, ইউজারনেম ও পাসওয়ার্ড দিয়ে একাউন্ট তৈরি করুন।
                          </div>
                        </>
                      ) : (
                        <span>আপনার সার্চ বা ফিল্টারের সাথে মিলে এমন কোনো কর্মচারী পাওয়া যায়নি।</span>
                      )}
                    </div>
                  ) : (
                    <div className="emp-account-list">
                      {filteredEmployeesList.map((emp) => {
                        const showPass = Boolean(visibleEmpPassMap[emp.id]);
                        const isEditingPass = editingEmpPassId === emp.id;
                        const activity = getEmployeeActivity(emp);
                        const isCopied = copiedEmpId === emp.id;
                        const avatarInitial = (emp.displayName || emp.username || 'E')
                          .trim()
                          .charAt(0)
                          .toUpperCase();

                        return (
                          <div
                            key={emp.id}
                            className={`emp-account-card ${!emp.active ? 'is-blocked' : ''}`}
                          >
                            {/* Top Identity + Status */}
                            <div className="emp-account-top">
                              <div className="emp-account-identity">
                                <div className="emp-avatar-circle">{avatarInitial}</div>
                                <div className="emp-account-name-wrap">
                                  <div className="emp-account-name-row">
                                    <strong>{emp.displayName}</strong>
                                    <span
                                      className={`emp-status-pill ${
                                        emp.active ? 'active' : 'blocked'
                                      }`}
                                    >
                                      {emp.active ? '🟢 সচল (Active)' : '🔴 সাময়িক বন্ধ'}
                                    </span>
                                  </div>
                                  <div className="emp-account-sub">
                                    <span>📌 {emp.designation || 'ডেটা এন্ট্রি অপারেটর'}</span>
                                    {emp.phone && <span>• 📞 {emp.phone}</span>}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                className="emp-mini-btn copy"
                                onClick={() => handleCopyCredentials(emp)}
                                title="হোয়াটসঅ্যাপ বা মেসেঞ্জারে পাঠানোর জন্য লগইন আইডি ও পাসওয়ার্ড কপি করুন"
                              >
                                {isCopied ? <Check size={13} /> : <Copy size={13} />}
                                <span>{isCopied ? 'কপি হয়েছে!' : 'লগইন তথ্য কপি'}</span>
                              </button>
                            </div>

                            {/* Credentials & Activity Strip */}
                            <div className="emp-cred-strip">
                              <div className="emp-cred-cell">
                                <span>লগইন ইউজারনেম (ID) ও পাসওয়ার্ড</span>
                                <div className="emp-cred-val-row">
                                  <code style={{ color: '#0f766e', borderColor: '#99f6e4' }}>
                                    ID: {emp.username}
                                  </code>
                                  <code>{showPass ? emp.password : '••••••'}</code>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVisibleEmpPassMap((prev) => ({
                                        ...prev,
                                        [emp.id]: !prev[emp.id],
                                      }))
                                    }
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#0284c7',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      padding: '2px 4px',
                                    }}
                                  >
                                    {showPass ? 'লুকান' : 'দেখুন'}
                                  </button>
                                </div>
                              </div>

                              <div className="emp-cred-cell">
                                <span>কর্মচারীর কাজের হিসাব (Activity)</span>
                                <div
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    color: '#0f172a',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span style={{ color: '#0d9488' }}>
                                    মোট {toBengaliNumerals(activity.totalCount)}টি এন্ট্রি
                                  </span>
                                  <span>•</span>
                                  <span style={{ color: '#0284c7' }}>
                                    বিক্রয়: {money(activity.totalSalesVal)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Inline Password Edit Box (if open) */}
                            {isEditingPass && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  flexWrap: 'wrap',
                                  background: '#f0fdfa',
                                  border: '1px solid #5eead4',
                                  padding: '8px 10px',
                                  borderRadius: '10px',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    color: '#0f766e',
                                  }}
                                >
                                  🔑 নতুন পাসওয়ার্ড:
                                </span>
                                <input
                                  type="text"
                                  value={newEmpPassInput}
                                  onChange={(e) => setNewEmpPassInput(e.target.value)}
                                  placeholder="নতুন পাসওয়ার্ড লিখুন"
                                  style={{
                                    flex: 1,
                                    minWidth: '120px',
                                    padding: '6px 10px',
                                    fontSize: '12.5px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #0d9488',
                                    background: '#ffffff',
                                    fontWeight: 700,
                                  }}
                                />
                                <button
                                  type="button"
                                  className="emp-mini-btn success"
                                  onClick={() => handleSaveEmployeePassword(emp)}
                                  disabled={isSavingEmp}
                                >
                                  <Check size={13} /> সেভ করুন
                                </button>
                                <button
                                  type="button"
                                  className="emp-mini-btn"
                                  onClick={() => {
                                    setEditingEmpPassId(null);
                                    setNewEmpPassInput('');
                                  }}
                                >
                                  বাতিল
                                </button>
                              </div>
                            )}

                            {/* Bottom Action Controls */}
                            <div className="emp-account-actions">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="emp-mini-btn"
                                  onClick={() => {
                                    if (isEditingPass) {
                                      setEditingEmpPassId(null);
                                      setNewEmpPassInput('');
                                    } else {
                                      setEditingEmpPassId(emp.id);
                                      setNewEmpPassInput(emp.password);
                                    }
                                  }}
                                >
                                  <Key size={13} />
                                  <span>পাসওয়ার্ড পরিবর্তন</span>
                                </button>

                                <button
                                  type="button"
                                  className={`emp-mini-btn ${emp.active ? 'warn' : 'success'}`}
                                  onClick={() => handleToggleEmployeeActive(emp)}
                                  disabled={isSavingEmp}
                                >
                                  <RefreshCw size={12} />
                                  <span>{emp.active ? 'সাময়িক বন্ধ করুন' : 'সচল করুন'}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                className="emp-mini-btn danger"
                                onClick={() => handleDeleteEmployee(emp)}
                                disabled={isSavingEmp}
                                title="কর্মচারী একাউন্ট স্থায়ীভাবে ডিলিট করুন"
                              >
                                <Trash2 size={13} />
                                <span>ডিলিট</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. DUAL-ADMIN APPROVAL & INTEGRITY CENTER */}
      {(activeSection === 'all' || activeSection === 'approvals') && (
        <div
          className="panel approval-center-panel"
          style={{
            border: '1.5px solid #0d9488',
            background: '#ffffff',
            boxShadow: '0 4px 20px rgba(13, 148, 136, 0.06)',
            marginBottom: 0,
          }}
        >
          <div
            className="panel-head"
            style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}
          >
            <div className="panel-head-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: '#ccfbf1',
                    color: '#0f766e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ShieldAlert size={19} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16.5px', color: '#0f2438', fontWeight: 800 }}>
                    অনুমোদন ও নিরাপত্তা কেন্দ্র (Approval Center)
                  </h3>
                  <small style={{ color: '#64748b', fontSize: '12px' }}>
                    সকল লেনদেন, উত্তোলন এবং তথ্যের নিরাপত্তা ও অনুমোদন ব্যবস্থাপনা।
                  </small>
                </div>
              </div>
            </div>

            {/* Tab selectors for Approval Center — Side-by-side horizontal row */}
            <div className="approval-nav-tabs">
              <button
                type="button"
                className={`approval-nav-tab ${approvalTab === 'waiting_for_me' ? 'active' : ''}`}
                onClick={() => setApprovalTab('waiting_for_me')}
              >
                <span>আমার অনুমোদন প্রয়োজন</span>
                {pendingForMe.length > 0 && (
                  <span className="tab-counter-badge pulse">{pendingForMe.length}</span>
                )}
              </button>

              <button
                type="button"
                className={`approval-nav-tab ${approvalTab === 'my_outgoing' ? 'active' : ''}`}
                onClick={() => setApprovalTab('my_outgoing')}
              >
                <span>আমার পাঠানো অনুরোধ</span>
                {myOutgoingRequests.length > 0 && (
                  <span className="tab-counter-badge neutral">{myOutgoingRequests.length}</span>
                )}
              </button>

              <button
                type="button"
                className={`approval-nav-tab ${approvalTab === 'audit_history' ? 'active' : ''}`}
                onClick={() => setApprovalTab('audit_history')}
              >
                <span>অনুমোদনের ইতিহাস ({completedAuditRequests.length})</span>
              </button>
            </div>
          </div>

          {approvalSuccessMsg && (
            <div className="success" style={{ marginBottom: '14px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} />
                <span>{approvalSuccessMsg}</span>
              </div>
              <button type="button" onClick={() => setApprovalSuccessMsg(null)}>×</button>
            </div>
          )}
          {approvalErrorMsg && (
            <div className="alert" style={{ marginBottom: '14px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} />
                <span>{approvalErrorMsg}</span>
              </div>
              <button type="button" onClick={() => setApprovalErrorMsg(null)}>×</button>
            </div>
          )}

          {/* TAB 1: PENDING FOR ME */}
          {approvalTab === 'waiting_for_me' && (
            <div>
              {pendingForMe.length === 0 ? (
                <div
                  style={{
                    padding: '32px 18px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <CheckCircle2 size={34} style={{ color: '#10b981', margin: '0 auto 10px', display: 'block' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '15px' }}>
                    এই মুহূর্তে কোনো অপেক্ষমান অনুমোদন নেই
                  </h4>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px' }}>
                    {partnerName} যখন নতুন কোনো লেনদেন, উত্তোলন, স্টক বা পণ্য যুক্ত অথবা ডিলিট করার অনুরোধ করবেন, তা এখানে দেখাবে।
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  <div
                    style={{
                      background: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: '10px',
                      padding: '11px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: '#92400e',
                      fontSize: '12.5px',
                    }}
                  >
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <b>মনোযোগ প্রয়োজন:</b> {partnerName}-এর <b>{pendingForMe.length}টি অনুরোধ</b> আপনার অনুমোদনের অপেক্ষায় রয়েছে।
                    </div>
                  </div>

                  {pendingForMe.map((req) => {
                    const actionMeta = actionNameMap[req.actionType] || { label: req.actionType, color: '#0d9488' };
                    const isProcessing = processingReqId === req.id;
                    const isDelete = req.actionType.includes('delete');

                    return (
                      <div
                        key={req.id}
                        className="approval-item-card"
                        style={{ borderColor: isDelete ? '#fecaca' : '#ccfbf1' }}
                      >
                        <div className="approval-item-head">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              className="badge"
                              style={{
                                background: isDelete ? '#fee2e2' : '#f0fdfa',
                                color: isDelete ? '#b91c1c' : '#0f766e',
                                border: `1px solid ${isDelete ? '#fca5a5' : '#99f6e4'}`,
                              }}
                            >
                              {actionMeta.label}
                            </span>
                            <h4 style={{ margin: 0, fontSize: '15px', color: '#0f2438' }}>{req.title}</h4>
                          </div>
                          <span
                            style={{
                              fontSize: '11.5px',
                              color: '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Clock size={13} /> {req.requestedAtFormatted}
                          </span>
                        </div>

                        <div className="approval-item-body">
                          <div className="approval-meta-box">
                            <div>
                              <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                                অনুরোধকারী (Maker):
                              </span>
                              <b style={{ color: '#0f172a', fontSize: '13px' }}>
                                {req.requestedByName} ({req.requestedBy})
                              </b>
                            </div>
                            <div>
                              <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                                অনুরোধের সময়:
                              </span>
                              <span style={{ color: '#334155', fontSize: '12.5px' }}>{req.requestedAtFormatted}</span>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                                কারণ / নোট:
                              </span>
                              <b style={{ color: '#047857', fontSize: '12.5px' }}>
                                "{req.reason || 'কোনো কারণ উল্লেখ করা হয়নি'}"
                              </b>
                            </div>
                          </div>

                          <div
                            style={{
                              background: isDelete ? '#fff1f2' : '#f8fafc',
                              border: `1px solid ${isDelete ? '#fecaca' : '#e2e8f0'}`,
                              borderRadius: '8px',
                              padding: '10px 12px',
                              fontSize: '12.5px',
                              color: isDelete ? '#991b1b' : '#334155',
                              marginTop: '10px',
                            }}
                          >
                            {isDelete && (
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: '#dc2626',
                                  marginBottom: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <AlertTriangle size={15} /> সতর্কবার্তা: এটি অনুমোদন করলে স্থায়ীভাবে মুছে যাবে!
                              </div>
                            )}
                            <div>
                              <b>বিবরণ:</b> {req.description}
                            </div>
                            {req.payload && (
                              <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569' }}>
                                {req.payload.amount !== undefined && (
                                  <span style={{ marginRight: '14px' }}>
                                    <b>টাকার পরিমাণ:</b> {money(req.payload.amount)}
                                  </span>
                                )}
                                {req.payload.currentStock !== undefined && (
                                  <span style={{ marginRight: '14px' }}>
                                    <b>স্টক:</b> {req.payload.currentStock} {req.payload.unit || 'পিস'}
                                  </span>
                                )}
                                {req.payload.sellingPrice !== undefined && (
                                  <span style={{ marginRight: '14px' }}>
                                    <b>বিক্রয়মূল্য:</b> {money(req.payload.sellingPrice)}
                                  </span>
                                )}
                                {req.payload.date && (
                                  <span>
                                    <b>তারিখ:</b> {dateLabel(req.payload.date)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="approval-item-actions">
                          <button
                            type="button"
                            className="primary"
                            style={{ background: '#0d9488', borderColor: '#0d9488', padding: '9px 16px', fontSize: '13px' }}
                            disabled={isProcessing}
                            onClick={() => handleApprove(req)}
                          >
                            {isProcessing ? <span className="btn-spinner" /> : <CheckCircle2 size={16} />}
                            <span>{isProcessing ? 'কার্যকর হচ্ছে…' : 'অনুমোদন করুন'}</span>
                          </button>

                          <button
                            type="button"
                            className="danger"
                            style={{ padding: '9px 14px', fontSize: '13px' }}
                            disabled={isProcessing}
                            onClick={() => {
                              setRejectingReq(req);
                              setRejectReason('');
                            }}
                          >
                            <XCircle size={16} /> বাতিল করুন
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MY OUTGOING REQUESTS */}
          {approvalTab === 'my_outgoing' && (
            <div>
              {myOutgoingRequests.length === 0 ? (
                <div
                  style={{
                    padding: '32px 18px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <Clock size={34} style={{ color: '#0d9488', margin: '0 auto 10px', display: 'block' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '15px' }}>
                    আপনার কোনো অপেক্ষমান অনুরোধ নেই
                  </h4>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px' }}>
                    আপনি যখন নতুন উত্তোলন, পণ্য, স্টক বা লেনদেন যুক্ত অথবা ডিলিট করবেন, তা {partnerName}-এর অনুমোদনের জন্য এখানে দেখাবে।
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {myOutgoingRequests.map((req) => {
                    const actionMeta = actionNameMap[req.actionType] || { label: req.actionType, color: '#0d9488' };
                    return (
                      <div key={req.id} className="approval-item-card" style={{ borderColor: '#fde68a' }}>
                        <div className="approval-item-head">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              className="badge"
                              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
                            >
                              {actionMeta.label}
                            </span>
                            <h4 style={{ margin: 0, fontSize: '14.5px', color: '#0f2438' }}>{req.title}</h4>
                          </div>
                          <span
                            className="badge"
                            style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fef3c7' }}
                          >
                            {partnerName}-এর অনুমোদনের অপেক্ষায়
                          </span>
                        </div>

                        <div className="approval-item-body">
                          <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '6px' }}>
                            <b>বিবরণ:</b> {req.description}
                          </div>
                          <div style={{ fontSize: '12px', color: '#047857' }}>
                            <b>কারণ:</b> "{req.reason || 'কোনো কারণ নেই'}"
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                            সময়: {req.requestedAtFormatted}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT HISTORY */}
          {approvalTab === 'audit_history' && (
            <div>
              {completedAuditRequests.length === 0 ? (
                <div
                  style={{
                    padding: '32px 18px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <FileText size={34} style={{ color: '#94a3b8', margin: '0 auto 10px', display: 'block' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '15px' }}>
                    এখনো কোনো অনুমোদনের অতীত রেকর্ড নেই
                  </h4>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px' }}>
                    যেকোনো অনুমোদন বা বাতিলকরণের পর উভয় অংশীদারের নাম ও সময় সহ প্রমাণ এখানে সংরক্ষিত থাকবে।
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>সময়</th>
                        <th>অ্যাকশন ও শিরোনাম</th>
                        <th>অনুরোধকারী</th>
                        <th>অনুমোদনকারী</th>
                        <th>কারণ ও নোট</th>
                        <th>ফলাফল</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedAuditRequests.map((req) => (
                        <tr key={req.id}>
                          <td>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                              {req.requestedAtFormatted}
                            </span>
                          </td>
                          <td>
                            <span className="type-pill" style={{ display: 'inline-block', marginBottom: '3px' }}>
                              {actionNameMap[req.actionType]?.label || req.actionType}
                            </span>
                            <strong style={{ display: 'block', fontSize: '12.5px' }}>{req.title}</strong>
                          </td>
                          <td>
                            <b style={{ color: '#0f172a' }}>{req.requestedByName}</b>
                          </td>
                          <td>
                            <b style={{ color: '#0d9488' }}>{req.reviewedByName || '—'}</b>
                            <small style={{ display: 'block', color: '#64748b' }}>
                              {req.reviewedAtFormatted || '—'}
                            </small>
                          </td>
                          <td style={{ maxWidth: '220px' }}>
                            <div style={{ fontSize: '12px', color: '#334155' }}>
                              <b>কারণ:</b> {req.reason}
                            </div>
                            {req.reviewNote && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: req.status === 'rejected' ? '#dc2626' : '#059669',
                                  marginTop: '2px',
                                }}
                              >
                                <b>মন্তব্য:</b> {req.reviewNote}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`status ${req.status === 'approved' ? 'posted' : 'void'}`}>
                              {req.status === 'approved' ? 'অনুমোদিত' : 'বাতিলকৃত'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4.5 PARTNERSHIP TERMS & CONDITIONS (শর্তাবলী ও নীতিমালা) */}
      {(activeSection === 'all' || activeSection === 'terms') && (
        <TermsConditionsCard
          currentAdminName={adminUser.displayName}
          partnerName={partnerName}
        />
      )}

      {/* 5. WALLET / WITHDRAWAL HISTORY & PASSWORD CHANGE */}
      {(activeSection === 'all' || activeSection === 'wallet' || activeSection === 'security') && (
        <div
          className="profile-content-grid"
          style={
            activeSection !== 'all'
              ? { gridTemplateColumns: 'minmax(0, 1fr)' }
              : undefined
          }
        >
          {/* Left Column: Personal Transactions & Withdrawals */}
          {(activeSection === 'all' || activeSection === 'wallet') && (
            <div className="panel" style={{ margin: 0 }}>
              <div className="panel-head" style={{ marginBottom: '14px' }}>
                <div className="panel-head-info">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                    <Banknote size={18} style={{ color: '#0d9488' }} />
                    আমার উত্তোলন, লোন ও লেনদেন ({filteredHistory.length}টি)
                  </h3>
                  <p>আপনার ব্যক্তিগত মূলধন বিনিয়োগ, লাভাংশ উত্তোলন এবং বিশেষ লোনের রেকর্ড</p>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`tab-pill ${historyFilter === 'all' ? 'active' : ''}`}
                    style={{ height: '30px', fontSize: '11.5px', padding: '4px 10px' }}
                    onClick={() => setHistoryFilter('all')}
                  >
                    সকল ({myEntries.length})
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${historyFilter === 'withdrawal' ? 'active' : ''}`}
                    style={{ height: '30px', fontSize: '11.5px', padding: '4px 10px' }}
                    onClick={() => setHistoryFilter('withdrawal')}
                  >
                    লাভাংশ উত্তোলন
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${historyFilter === 'loan' ? 'active' : ''}`}
                    style={{ height: '30px', fontSize: '11.5px', padding: '4px 10px' }}
                    onClick={() => setHistoryFilter('loan')}
                  >
                    বিশেষ লোন
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${historyFilter === 'investment' ? 'active' : ''}`}
                    style={{ height: '30px', fontSize: '11.5px', padding: '4px 10px' }}
                    onClick={() => setHistoryFilter('investment')}
                  >
                    মূলধন
                  </button>
                  <button
                    type="button"
                    className="primary"
                    style={{
                      height: '30px',
                      fontSize: '11.5px',
                      padding: '4px 11px',
                    }}
                    onClick={handleOpenWithdrawal}
                  >
                    <ArrowDownLeft size={13} /> নতুন উত্তোলন
                  </button>
                </div>
              </div>

              {/* Pending Withdrawals Banner if any */}
              {myPendingWithdrawals.length > 0 && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: '#92400e',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    ⏳ অনুমোদনের অপেক্ষায় থাকা আপনার উত্তোলন অনুরোধ ({myPendingWithdrawals.length}টি):
                  </div>
                  {myPendingWithdrawals.map((pw) => (
                    <div
                      key={pw.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '8px',
                        paddingTop: '4px',
                        borderTop: '1px dashed #fde68a',
                      }}
                    >
                      <span>{pw.title}</span>
                      <b>{money(pw.payload?.amount || 0)}</b>
                    </div>
                  ))}
                </div>
              )}

              {filteredHistory.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    background: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <FileText size={30} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                  <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#475569', fontSize: '13.5px' }}>
                    কোনো ব্যক্তিগত লেনদেন বা উত্তোলন রেকর্ড পাওয়া যায়নি।
                  </p>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleOpenWithdrawal}
                  >
                    <ArrowDownLeft size={15} /> টাকা উত্তোলন করুন (Withdraw)
                  </button>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="profile-history-table">
                    <thead>
                      <tr>
                        <th>তারিখ</th>
                        <th>ধরন</th>
                        <th>বিবরণ</th>
                        <th>পরিমাণ</th>
                        <th>স্ট্যাটাস</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((e) => (
                        <tr key={e.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{dateLabel(e.date)}</td>
                          <td>
                            <span className="type-pill">
                              {e.type === 'investment'
                                ? 'মূলধন'
                                : e.type === 'withdrawal'
                                ? 'লাভাংশ উত্তোলন'
                                : e.type === 'loan'
                                ? 'বিশেষ লোন (অটো কর্তন)'
                                : e.type === 'sale'
                                ? 'বিক্রয়'
                                : e.type}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'normal', minWidth: '110px' }}>
                            <strong style={{ display: 'block', lineHeight: 1.3 }}>{e.title}</strong>
                            {e.notes && (
                              <small style={{ display: 'block', color: '#64748b', lineHeight: 1.3, marginTop: '2px' }}>
                                {e.notes}
                              </small>
                            )}
                          </td>
                          <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {e.type === 'withdrawal' || e.type === 'loan' ? (
                              <span style={{ color: '#b91c1c' }}>-{money(e.amount)}</span>
                            ) : e.type === 'investment' ? (
                              <span style={{ color: '#047857' }}>+{money(e.amount)}</span>
                            ) : (
                              money(e.amount)
                            )}
                          </td>
                          <td>
                            <span className={`status ${e.status}`}>
                              {e.status === 'posted' ? 'পোস্টেড' : 'ড্রাফট'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Right Column: Password Change Form */}
          {(activeSection === 'all' || activeSection === 'security') && (
            <div className="panel" style={{ margin: 0 }}>
              <div className="panel-head" style={{ marginBottom: '14px' }}>
                <div className="panel-head-info">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                    <Key size={18} style={{ color: '#0d9488', flexShrink: 0 }} />
                    <span>পাসওয়ার্ড ও সিকিউরিটি সেটিংস</span>
                  </h3>
                  <p>আপনার অ্যাকাউন্ট সুরক্ষিত রাখতে শক্তিশালী পাসওয়ার্ড ব্যবহার করুন</p>
                </div>
              </div>

              {formMsg && (
                <div
                  className={formMsg.type === 'success' ? 'success' : 'alert'}
                  style={{ borderRadius: '8px', padding: '10px 14px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {formMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{formMsg.text}</span>
                  </div>
                  <button type="button" onClick={() => setFormMsg(null)}>×</button>
                </div>
              )}

              <form
                className="form-grid"
                onSubmit={handleChangePassword}
                style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
              >
                <div className="full" style={{ display: 'grid', gap: '6px' }}>
                  <label htmlFor="old-pass" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                    বর্তমান পাসওয়ার্ড:
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      id="old-pass"
                      type={showOld ? 'text' : 'password'}
                      required
                      placeholder="আপনার বর্তমান পাসওয়ার্ড..."
                      value={oldPass}
                      onChange={(e) => setOldPass(e.target.value)}
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOld(!showOld)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                      }}
                      title={showOld ? 'লুকান' : 'দেখুন'}
                    >
                      {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="full" style={{ display: 'grid', gap: '6px' }}>
                  <label htmlFor="new-pass" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                    নতুন পাসওয়ার্ড:
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      id="new-pass"
                      type={showNew ? 'text' : 'password'}
                      required
                      placeholder="নতুন শক্তিশালী পাসওয়ার্ড..."
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                      }}
                      title={showNew ? 'লুকান' : 'দেখুন'}
                    >
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {newPass && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px' }}>
                      <div
                        style={{
                          flex: 1,
                          height: '6px',
                          background: '#e2e8f0',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${(passStrength.score / 4) * 100}%`,
                            backgroundColor: passStrength.color,
                            transition: 'all 0.3s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: passStrength.color }}>
                        {passStrength.label}
                      </span>
                    </div>
                  )}
                </div>

                <div className="full" style={{ display: 'grid', gap: '6px' }}>
                  <label htmlFor="confirm-pass" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                    নতুন পাসওয়ার্ড নিশ্চিতকরণ:
                  </label>
                  <input
                    id="confirm-pass"
                    type={showNew ? 'text' : 'password'}
                    required
                    placeholder="নতুন পাসওয়ার্ডটি পুনরায় লিখুন..."
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                  />
                </div>

                <div
                  className="full"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    color: '#64748b',
                    fontSize: '11.5px',
                    lineHeight: 1.5,
                  }}
                >
                  <Lock size={14} style={{ color: '#0d9488', flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    পাসওয়ার্ড পরিবর্তন করার পর তা ফায়ারস্টোরে সংরক্ষিত হবে। পরবর্তী লগইনে নতুন পাসওয়ার্ড ব্যবহার করুন।
                  </span>
                </div>

                <button
                  type="submit"
                  className="primary full"
                  disabled={isSubmitting || !oldPass || !newPass || !confirmPass}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '11px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="btn-spinner" />
                      <span>সংরক্ষণ হচ্ছে…</span>
                    </>
                  ) : (
                    'পাসওয়ার্ড সংরক্ষণ করুন'
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* PARTNER PROFIT WITHDRAWAL & SPECIAL LOAN MODAL */}
      {showWithdrawModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowWithdrawModal(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f2438' }}>
                {withdrawMode === 'loan' ? (
                  <>
                    <Banknote size={20} style={{ color: '#7c3aed', flexShrink: 0 }} />
                    <span>বিশেষ প্রয়োজনে লোন গ্রহণ (Special Partner Loan)</span>
                  </>
                ) : (
                  <>
                    <ArrowDownLeft size={20} style={{ color: '#0d9488', flexShrink: 0 }} />
                    <span>লাভাংশ উত্তোলন (Profit Withdraw — শুক্রবার রাত)</span>
                  </>
                )}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowWithdrawModal(false)}
                aria-label="বন্ধ করুন"
              >
                ×
              </button>
            </div>

            <div className="modal-content-area">
              <form className="modal-body" onSubmit={handleWithdrawSubmit}>
                {/* Mode Switcher: Profit Withdrawal vs Special Partner Loan */}
                <div className="withdraw-mode-switcher">
                  <button
                    type="button"
                    className={`withdraw-mode-tab ${withdrawMode === 'withdrawal' ? 'active' : ''}`}
                    onClick={() => {
                      const currentWindow = getFridayNightWithdrawalStatus();
                      setWithdrawalWindow(currentWindow);
                      if (!currentWindow.isOpen) {
                        setShowFridayLockNotice(true);
                        setShowFridayLockModal(true);
                        return;
                      }
                      setWithdrawMode('withdrawal');
                      setWithdrawError(null);
                    }}
                  >
                    <ArrowDownLeft size={15} />
                    <div>
                      <strong>লাভাংশ উত্তোলন</strong>
                      <small>প্রতি শুক্রবার সারা রাত • শুধু লাভ</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`withdraw-mode-tab loan-tab ${withdrawMode === 'loan' ? 'active' : ''}`}
                    onClick={() => {
                      setWithdrawMode('loan');
                      setWithdrawError(null);
                    }}
                  >
                    <Banknote size={15} />
                    <div>
                      <strong>বিশেষ প্রয়োজনে লোন</strong>
                      <small>পরবর্তী লাভাংশ থেকে অটো কর্তন</small>
                    </div>
                  </button>
                </div>

                {/* ✨ AI Voice & Smart Auto-Fill for Withdrawal / Loan */}
                {enableVoiceInput !== false && (
                  <VoiceFormAssistant
                    formType="withdraw"
                    title="✨ ভয়েসে উত্তোলন বা লোন ফর্ম পূরণ করুন"
                    placeholder="মুখে বলুন: যেমন 'বিকাশে ২০০০ টাকা সাপ্তাহিক লাভাংশ উত্তোলন' বা 'জরুরি প্রয়োজনে নগদে ১৫০০ টাকা বিশেষ লোন'"
                    chips={[
                      { label: '💸 বিকাশে ২০০০৳ লাভ উত্তোলন', text: 'বিকাশে ২০০০ টাকা সাপ্তাহিক অর্জিত লাভাংশ উত্তোলন' },
                      { label: '🏦 নগদে ১০০০৳ লাভ উত্তোলন', text: 'নগদ ক্যাশে ১০০০ টাকা লাভাংশ উত্তোলন' },
                      { label: '⚡ জরুরি ১৫০০৳ বিশেষ লোন', text: 'জরুরি ব্যক্তিগত প্রয়োজনে নগদ ক্যাশে ১৫০০ টাকা বিশেষ লোন' },
                    ]}
                    investors={investors}
                    onApplyFields={(fields) => {
                      if (fields.mode === 'loan') {
                        setWithdrawMode('loan');
                      } else if (fields.mode === 'withdrawal' && withdrawalWindow.isOpen) {
                        setWithdrawMode('withdrawal');
                      }
                      if (fields.amount && Number(fields.amount) > 0) {
                        setWithdrawAmount(String(fields.amount));
                      }
                      if (fields.method) {
                        setWithdrawMethod(fields.method);
                      }
                      if (fields.reason) {
                        setWithdrawReason(fields.reason);
                      }
                      setWithdrawError(null);
                    }}
                  />
                )}

                {/* Partner Capital (Locked) vs Withdrawable Profit Snapshot */}
                <div className="modal-stat-grid-3">
                  <div className="modal-stat-box" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
                    <span style={{ color: '#475569' }}>🔒 স্থির মূলধন (উত্তোলনযোগ্য নয়)</span>
                    <b style={{ color: '#334155' }}>{money(myPartner.capital)}</b>
                  </div>
                  <div className="modal-stat-box">
                    <span>অর্জিত লাভ − (উত্তোলন + লোন)</span>
                    <b style={{ color: '#047857' }}>
                      {money(myPartner.allocatedProfit)} − {money(myPartner.withdrawals + myPartner.loans)}
                    </b>
                  </div>
                  <div className="modal-stat-box" style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}>
                    <span style={{ color: '#0f766e', fontWeight: 700 }}>উত্তোলনযোগ্য লাভের সীমা</span>
                    <b style={{ color: '#0d9488', fontSize: '15px' }}>{money(myPartner.withdrawableLimit)}</b>
                  </div>
                </div>

                {/* Official Rules Notice based on Mode */}
                {withdrawMode === 'withdrawal' ? (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: '#92400e',
                      display: 'grid',
                      gap: '5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700 }}>
                      <Calendar size={15} style={{ color: '#d97706', flexShrink: 0 }} />
                      <span>শর্তাবলী: লাভাংশ প্রতি শুক্রবার রাতে উত্তোলন হবে এবং বিনিয়োগের টাকা উত্তোলনযোগ্য নয়।</span>
                    </div>
                    <div style={{ color: '#78350f', lineHeight: 1.45 }}>
                      শুধুমাত্র আপনার অর্জিত মুনাফা থেকে অবশিষ্ট লাভাংশ (<b>{money(myPartner.withdrawableLimit)}</b>) উত্তোলন করা যাবে। কোনো লোন থাকলে তা লাভাংশ থেকে স্বয়ংক্রিয়ভাবে সমন্বয় করা হয়েছে।
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: '#5b21b6',
                      display: 'grid',
                      gap: '5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700 }}>
                      <Banknote size={15} style={{ color: '#7c3aed', flexShrink: 0 }} />
                      <span>শর্তাবলী: বিশেষ প্রয়োজনে লোন এবং পরবর্তী লাভাংশ থেকে অটোমেটিক কর্তন</span>
                    </div>
                    <div style={{ color: '#4c1d95', lineHeight: 1.45 }}>
                      বিশেষ প্রয়োজনে আপনি লোন নিতে পারবেন (অপর অ্যাডমিনের অনুমোদন সাপেক্ষে)। এই লোন আপনার পরবর্তী অর্জিত লাভাংশ থেকে <b>অটোমেটিক কেটে নেওয়া হবে</b>। বর্তমান পূর্ববর্তী লোন: <b>{money(myPartner.loans)}</b>।
                    </div>
                  </div>
                )}

                {withdrawError && (
                  <div className="alert" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={16} />
                      <span>{withdrawError}</span>
                    </div>
                  </div>
                )}

                {/* Quick Amount Input & Chips */}
                <div className="modal-field">
                  <label htmlFor="withdraw-amount-input">
                    {withdrawMode === 'loan' ? 'বিশেষ লোনের পরিমাণ (৳) *' : 'লাভাংশ উত্তোলনের পরিমাণ (৳) *'}
                  </label>
                  <input
                    id="withdraw-amount-input"
                    type="number"
                    min="1"
                    max={
                      withdrawMode === 'withdrawal'
                        ? myPartner.withdrawableLimit > 0
                          ? myPartner.withdrawableLimit
                          : undefined
                        : availableBusinessCash > 0
                        ? availableBusinessCash
                        : undefined
                    }
                    step="any"
                    required
                    placeholder={
                      withdrawMode === 'loan'
                        ? 'লোনের টাকার পরিমাণ লিখুন (যেমন: ২০০০)'
                        : myPartner.withdrawableLimit > 0
                        ? `সর্বোচ্চ ${money(myPartner.withdrawableLimit)}`
                        : 'বর্তমানে উত্তোলনযোগ্য লাভাংশ নেই (৳0.00)'
                    }
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                  {withdrawMode === 'withdrawal' ? (
                    myPartner.withdrawableLimit > 0 ? (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {[500, 1000, 2000, 5000]
                          .filter((preset) => preset <= myPartner.withdrawableLimit)
                          .map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className="date-preset-btn"
                              style={{ padding: '4px 10px', fontSize: '11.5px' }}
                              onClick={() => setWithdrawAmount(String(preset))}
                            >
                              ৳{preset.toLocaleString('bn-BD')}
                            </button>
                          ))}
                        <button
                          type="button"
                          className="date-preset-btn"
                          style={{ padding: '4px 10px', fontSize: '11.5px' }}
                          onClick={() =>
                            setWithdrawAmount(String(Math.round(myPartner.withdrawableLimit * 0.5 * 100) / 100))
                          }
                        >
                          ৫০% লাভ ({money(Math.round(myPartner.withdrawableLimit * 0.5 * 100) / 100)})
                        </button>
                        <button
                          type="button"
                          className="date-preset-btn"
                          style={{
                            padding: '4px 10px',
                            fontSize: '11.5px',
                            background: '#f0fdfa',
                            borderColor: '#99f6e4',
                            color: '#0f766e',
                            fontWeight: 700,
                          }}
                          onClick={() => setWithdrawAmount(String(myPartner.withdrawableLimit))}
                        >
                          সম্পূর্ণ লাভ ({money(myPartner.withdrawableLimit)})
                        </button>
                      </div>
                    ) : (
                      <small style={{ color: '#dc2626', fontSize: '11.5px', fontWeight: 600 }}>
                        ⚠️ আপনার উত্তোলনযোগ্য অবশিষ্ট লাভাংশ বর্তমানে ৳০.০০। বিনিয়োগের টাকা উত্তোলনযোগ্য নয় (বিশেষ প্রয়োজনে উপরের "বিশেষ প্রয়োজনে লোন" ট্যাব ব্যবহার করুন)।
                      </small>
                    )
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {[500, 1000, 2000, 5000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="date-preset-btn"
                          style={{ padding: '4px 10px', fontSize: '11.5px' }}
                          onClick={() => setWithdrawAmount(String(preset))}
                        >
                          ৳{preset.toLocaleString('bn-BD')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-grid">
                  <div className="modal-field">
                    <label htmlFor="withdraw-method-select">গ্রহণ করার মাধ্যম</label>
                    <select
                      id="withdraw-method-select"
                      value={withdrawMethod}
                      onChange={(e) => setWithdrawMethod(e.target.value)}
                    >
                      <option value="নগদ ক্যাশ (Cash)">নগদ ক্যাশ (Cash)</option>
                      <option value="বিকাশ (bKash)">বিকাশ (bKash)</option>
                      <option value="নগদ (Nagad)">নগদ (Nagad)</option>
                      <option value="রকেট (Rocket)">রকেট (Rocket)</option>
                      <option value="ব্যাংক ট্রান্সফার (Bank)">ব্যাংক ট্রান্সফার (Bank)</option>
                    </select>
                  </div>

                  <div className="modal-field">
                    <label htmlFor="withdraw-date-input">তারিখ</label>
                    <input
                      id="withdraw-date-input"
                      type="date"
                      required
                      value={withdrawDate}
                      onChange={(e) => setWithdrawDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-field">
                  <label htmlFor="withdraw-reason-input">
                    {withdrawMode === 'loan'
                      ? adminUser.username === 'Limon'
                        ? `বিশেষ লোনের কারণ / বিবরণ (আবশ্যক - ${partnerName}-এর অনুমোদনের জন্য) *`
                        : 'বিশেষ লোনের কারণ / বিবরণ (আবশ্যক) *'
                      : adminUser.username === 'Limon'
                      ? `লাভাংশ উত্তোলনের কারণ / নোট (আবশ্যক - ${partnerName}-এর অনুমোদনের জন্য) *`
                      : 'লাভাংশ উত্তোলনের কারণ / নোট (আবশ্যক) *'}
                  </label>
                  <textarea
                    id="withdraw-reason-input"
                    required
                    placeholder={
                      withdrawMode === 'loan'
                        ? 'উদাঃ জরুরি ব্যক্তিগত প্রয়োজনে বিশেষ লোন (পরবর্তী লাভাংশ থেকে অটো কর্তন হবে)...'
                        : 'উদাঃ শুক্রবার রাতের সাপ্তাহিক অর্জিত লাভাংশ উত্তোলন...'
                    }
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                  />
                </div>

                {adminUser.username === 'Limon' && (
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      শর্তাবলী অনুযায়ী, আপনার অনুরোধটি <b>{partnerName}</b>-এর ব্যক্তিগত প্রোফাইলে যাবে এবং তিনি অনুমোদন দিলে কার্যকর হবে।
                    </span>
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      isWithdrawing ||
                      (withdrawMode === 'withdrawal' &&
                        (!withdrawalWindow.isOpen || myPartner.withdrawableLimit <= 0))
                    }
                  >
                    {isWithdrawing ? (
                      <span className="btn-spinner" />
                    ) : withdrawMode === 'withdrawal' && !withdrawalWindow.isOpen ? (
                      <Lock size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    <span>
                      {isWithdrawing
                        ? 'প্রসেস হচ্ছে…'
                        : withdrawMode === 'withdrawal' && !withdrawalWindow.isOpen
                        ? 'শুক্রবার সারা রাত ছাড়া উত্তোলন বন্ধ'
                        : adminUser.username === 'Limon'
                        ? withdrawMode === 'loan'
                          ? 'বিশেষ লোনের অনুরোধ পাঠান'
                          : 'লাভাংশ উত্তোলন অনুরোধ পাঠান'
                        : withdrawMode === 'loan'
                        ? 'বিশেষ লোন নিশ্চিত করুন'
                        : 'লাভাংশ উত্তোলন নিশ্চিত করুন'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowWithdrawModal(false)}
                  >
                    বাতিল
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectingReq && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRejectingReq(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <XCircle size={20} style={{ flexShrink: 0 }} />
                <span>অনুরোধ বাতিল / প্রত্যাখ্যান</span>
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRejectingReq(null)}
                aria-label="বন্ধ করুন"
              >
                ×
              </button>
            </div>

            <div className="modal-content-area">
              <div className="modal-body">
                <div className="preview-box modal-danger-box">
                  <p className="modal-danger-lead">আপনি নিচের অনুরোধটি বাতিল করতে যাচ্ছেন:</p>
                  <h3 className="modal-danger-title">{rejectingReq.title}</h3>
                  <div style={{ fontSize: '12px', color: '#7f1d1d' }}>
                    অনুরোধকারী: <b>{rejectingReq.requestedByName}</b> • {rejectingReq.requestedAtFormatted}
                  </div>
                </div>

                <div className="modal-field">
                  <label htmlFor="reject-reason-textarea">বাতিল করার কারণ লিখুন (আবশ্যক):</label>
                  <textarea
                    id="reject-reason-textarea"
                    required
                    placeholder="উদাঃ টাকার অংক ভুল হয়েছে, বিলের সাথে মিল নেই, বা পরে যোগ করা হবে..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="danger"
                    disabled={!rejectReason.trim() || processingReqId === rejectingReq.id}
                    onClick={handleConfirmReject}
                  >
                    {processingReqId === rejectingReq.id ? <span className="btn-spinner" /> : <XCircle size={16} />}
                    <span>{processingReqId === rejectingReq.id ? 'বাতিল হচ্ছে…' : 'নিশ্চিত বাতিল করুন'}</span>
                  </button>
                  <button type="button" className="secondary" onClick={() => setRejectingReq(null)}>
                    ফিরে যান
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FRIDAY NIGHT ONLY WITHDRAWAL NOTICE MODAL */}
      {showFridayLockModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowFridayLockModal(false);
          }}
        >
          <div className="modal friday-lock-modal" role="alertdialog" aria-modal="true">
            <div className="modal-head">
              <h2 style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>শুক্রবার ছাড়া লাভাংশ উত্তোলন বন্ধ!</span>
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowFridayLockModal(false)}
                aria-label="বন্ধ করুন"
              >
                ×
              </button>
            </div>

            <div className="modal-content-area">
              <div className="modal-body" style={{ gap: '14px' }}>
                <div className="friday-lock-alert-box">
                  <div className="friday-lock-badge">
                    <Lock size={16} />
                    <span>শুধুমাত্র শুক্রবার সারা রাত উত্তোলনযোগ্য</span>
                  </div>
                  <p className="friday-lock-message">
                    পার্টনারশিপ নিয়ম অনুযায়ী <b>লাভাংশ উত্তোলন শুধুমাত্র প্রতি শুক্রবার সারা রাত</b> (শুক্রবার সন্ধ্যা ৬:০০টা থেকে শনিবার ভোর ৬:০০টা পর্যন্ত) চালু থাকে। আজ শুক্রবার রাত না হওয়ায় এখন লাভাংশ উত্তোলন করা যাবে না।
                  </p>
                  <div className="friday-lock-time-pill">
                    <Clock size={14} />
                    <span>বর্তমান সময়: <b>{withdrawalWindow.dayTimeBn}</b></span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#f5f3ff',
                    border: '1px solid #ddd6fe',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '12.5px',
                    color: '#5b21b6',
                    lineHeight: 1.5,
                  }}
                >
                  💡 <b>জরুরি টাকার প্রয়োজন?</b> আপনি চাইলে এখনই <b>“বিশেষ লোন নিন”</b> বাটনে চাপ দিয়ে লোন নিতে পারবেন, যা আপনার পরবর্তী অর্জিত লাভাংশ থেকে অটোমেটিক সমন্বয় হয়ে যাবে।
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setShowFridayLockModal(false)}
                  >
                    <Check size={16} />
                    <span>বুঝেছি, ঠিক আছে</span>
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setShowFridayLockModal(false);
                      setWithdrawMode('loan');
                      setWithdrawError(null);
                      setWithdrawDate(getTodayStr());
                      setShowWithdrawModal(true);
                    }}
                  >
                    <Banknote size={16} />
                    <span>বিশেষ লোন নিন</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
