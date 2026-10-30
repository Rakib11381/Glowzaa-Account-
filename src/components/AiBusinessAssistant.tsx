import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Calculator,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Database,
  Edit3,
  ExternalLink,
  FileText,
  History,
  Info,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  executeBusinessAssistantQuery,
  getDhakaTodayStr,
  type AssistantAuthContext,
  type BusinessDataset,
} from '../aiAssistantEngine';
import {
  watchAiChatSessions,
  saveAiChatSession,
  renameAiChatSession,
  deleteAiChatSession,
  recordAiAssistantAuditLog,
} from '../data';
import {
  calculateCashBalance,
  dateLabel,
  formatBengaliDateTime,
  money,
  toBengaliNumerals,
} from '../accounting';
import type {
  AiAssistantStructuredResponse,
  AiChatMessage,
  AiChatSession,
  AiEvidenceTransaction,
  ApprovalRequest,
  Entry,
  Investor,
  Product,
  ProfitDistribution,
  Role,
} from '../types';

export interface AiBusinessAssistantProps {
  currentAdmin: {
    username: 'Rakib' | 'Limon';
    displayName: string;
    role: Role;
  };
  entries: Entry[];
  investors: Investor[];
  products: Product[];
  distributions: ProfitDistribution[];
  approvalRequests: ApprovalRequest[];
  onNavigateToTransactions: (preset?: {
    type?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) => void;
  onViewEntryRecord?: (entry: Entry) => void;
  onOpenSettings?: () => void;
}

const SUGGESTED_QUICK_QUESTIONS: Array<{
  label: string;
  question: string;
  badge: string;
  tone: 'teal' | 'blue' | 'emerald' | 'amber' | 'purple' | 'rose';
}> = [
  {
    label: 'আজ পর্যন্ত ব্যবসায় মোট কত টাকা বিনিয়োগ হয়েছে?',
    question: 'আজ পর্যন্ত ব্যবসায় মোট কত টাকা বিনিয়োগ হয়েছে?',
    badge: 'মূলধন',
    tone: 'teal',
  },
  {
    label: 'ব্যবসার বর্তমান প্রকৃত ব্যালেন্স কত?',
    question: 'ব্যবসার বর্তমান প্রকৃত ব্যালেন্স কত?',
    badge: 'ব্যালেন্স',
    tone: 'emerald',
  },
  {
    label: 'রাকিব ও লিমন কত টাকা বিনিয়োগ করেছেন?',
    question: 'রাকিব ও লিমন কত টাকা বিনিয়োগ করেছেন?',
    badge: 'অংশীদার',
    tone: 'blue',
  },
  {
    label: 'এই মাসের মোট আয় ও খরচ কত?',
    question: 'এই মাসের মোট আয় ও খরচ কত?',
    badge: 'আয়-ব্যয়',
    tone: 'amber',
  },
  {
    label: 'কোন খাতে সবচেয়ে বেশি খরচ হয়েছে?',
    question: 'কোন খাতে সবচেয়ে বেশি খরচ হয়েছে?',
    badge: 'খরচ বিশ্লেষণ',
    tone: 'rose',
  },
  {
    label: 'এখন পর্যন্ত মোট কত টাকা লাভ হয়েছে?',
    question: 'এখন পর্যন্ত মোট কত টাকা লাভ হয়েছে?',
    badge: 'নিট লাভ',
    tone: 'emerald',
  },
  {
    label: 'গত মাসের তুলনায় এই মাসের লাভ কত বেড়েছে?',
    question: 'গত মাসের তুলনায় এই মাসের লাভ কত বেড়েছে?',
    badge: 'মাসিক তুলনা',
    tone: 'purple',
  },
  {
    label: 'আমার কত টাকা লাভ উত্তোলনযোগ্য?',
    question: 'আমার কত টাকা লাভ উত্তোলনযোগ্য?',
    badge: 'আমার প্রাপ্য',
    tone: 'teal',
  },
  {
    label: '১৫ অক্টোবর কত টাকা উত্তোলন করা হয়েছে?',
    question: '১৫ অক্টোবর কত টাকা উত্তোলন করা হয়েছে?',
    badge: 'উত্তোলন',
    tone: 'amber',
  },
  {
    label: 'সর্বশেষ ১০টি লেনদেন দেখাও।',
    question: 'সর্বশেষ ১০টি লেনদেন দেখাও।',
    badge: 'সাম্প্রতিক লেনদেন',
    tone: 'blue',
  },
  {
    label: 'কোন লেনদেনগুলো এখনো অনুমোদনের অপেক্ষায় রয়েছে?',
    question: 'কোন লেনদেনগুলো এখনো অনুমোদনের অপেক্ষায় রয়েছে?',
    badge: 'পেন্ডিং অনুমোদন',
    tone: 'rose',
  },
];

export default function AiBusinessAssistant({
  currentAdmin,
  entries,
  investors,
  products,
  distributions,
  approvalRequests,
  onNavigateToTransactions,
  onViewEntryRecord,
  onOpenSettings,
}: AiBusinessAssistantProps) {
  const ownerId = currentAdmin.username;
  const ownerName = currentAdmin.displayName;

  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [questionInput, setQuestionInput] = useState<string>('');
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Rename conversation inline state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState<string>('');

  // Desktop history panel collapse & Mobile history drawer state
  const [showDesktopSidebar, setShowDesktopSidebar] = useState<boolean>(true);
  const [showMobileHistory, setShowMobileHistory] = useState<boolean>(false);

  // Evidence transactions modal state (`[লেনদেনগুলো দেখুন]`)
  const [evidenceModalData, setEvidenceModalData] = useState<{
    title: string;
    dateRangeBn: string;
    calculationMethodBn: string;
    transactions: AiEvidenceTransaction[];
    filterPreset?: {
      type?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const authContext: AssistantAuthContext = useMemo(
    () => ({
      authenticated: true,
      actorUid: currentAdmin.username,
      actorName: currentAdmin.displayName,
      role: currentAdmin.role || 'admin',
    }),
    [currentAdmin]
  );

  const liveDataset: BusinessDataset = useMemo(
    () => ({
      entries,
      investors,
      products,
      distributions,
      approvalRequests,
      referenceDate: getDhakaTodayStr(),
    }),
    [entries, investors, products, distributions, approvalRequests]
  );

  // Real-time financial pulse metrics for the top quick-glance bar
  const liveCashPulse = useMemo(
    () => calculateCashBalance(entries, products),
    [entries, products]
  );
  const pendingApprovalCount = useMemo(
    () => approvalRequests.filter((r) => r.status === 'pending').length,
    [approvalRequests]
  );

  // Subscribe to partner's own chat sessions
  useEffect(() => {
    const unsub = watchAiChatSessions(ownerId, (loaded) => {
      setSessions(loaded);
      setActiveSessionId((prev) => {
        if (prev && loaded.some((s) => s.id === prev)) return prev;
        return loaded[0]?.id || '';
      });
    });
    return () => unsub();
  }, [ownerId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  function createNewChatSession(): AiChatSession {
    const nowIso = new Date().toISOString();
    const newSession: AiChatSession = {
      id: `chat_${ownerId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId,
      ownerName,
      title: `নতুন হিসাব আলোচনা (${new Date().toLocaleDateString('bn-BD', { month: 'short', day: 'numeric' })})`,
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [],
    };
    return newSession;
  }

  async function handleStartNewChat() {
    setErrorMsg('');
    const newSession = createNewChatSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setShowMobileHistory(false);
    await saveAiChatSession(newSession);
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  async function handleClearCurrentChat() {
    if (!activeSession) return;
    setErrorMsg('');
    const nowIso = new Date().toISOString();
    const cleared: AiChatSession = {
      ...activeSession,
      messages: [],
      updatedAt: nowIso,
    };
    setSessions((prev) => prev.map((s) => (s.id === cleared.id ? cleared : s)));
    await saveAiChatSession(cleared);
  }

  async function handleConfirmRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renamingSessionId || !renameTitleInput.trim()) {
      setRenamingSessionId(null);
      return;
    }
    const cleanTitle = renameTitleInput.trim();
    setSessions((prev) =>
      prev.map((s) => (s.id === renamingSessionId ? { ...s, title: cleanTitle } : s))
    );
    setRenamingSessionId(null);
    await renameAiChatSession(renamingSessionId, ownerId, cleanTitle);
  }

  async function handleDeleteChat(sessionId: string) {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0]?.id || '');
      }
      return remaining;
    });
    await deleteAiChatSession(sessionId, ownerId);
  }

  function handleCopyAnswer(msg: AiChatMessage) {
    const ev = msg.evidence;
    const textToCopy = ev
      ? `${ev.directAnswerBn}\n\nসময়সীমা: ${ev.dateRangeBn}\nহিসাবের পদ্ধতি: ${ev.calculationMethodBn}\nব্যবহৃত রেকর্ড: ${ev.recordsUsedSummaryBn}`
      : msg.text;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopiedMsgId(msg.id);
        setTimeout(() => setCopiedMsgId(null), 2200);
      });
    }
  }

  /**
   * Always queries fresh live database records for every financial question
   * (never reuses stale cached numbers).
   */
  async function handleAskQuestion(rawQ?: string) {
    const question = (rawQ !== undefined ? rawQ : questionInput).trim();
    if (!question || isAsking) return;

    setErrorMsg('');
    setIsAsking(true);
    if (rawQ === undefined) {
      setQuestionInput('');
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const formattedTime = formatBengaliDateTime(now);

    let targetSession = activeSession;
    if (!targetSession) {
      targetSession = createNewChatSession();
    }

    const isFirstMessage = targetSession.messages.length === 0;
    const updatedTitle = isFirstMessage
      ? question.slice(0, 48) + (question.length > 48 ? '…' : '')
      : targetSession.title;

    const userMessage: AiChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      text: question,
      createdAt: nowIso,
      createdAtFormatted: formattedTime,
    };

    const sessionWithUserMsg: AiChatSession = {
      ...targetSession,
      title: updatedTitle,
      updatedAt: nowIso,
      messages: [...targetSession.messages, userMessage],
    };

    setSessions((prev) => [
      sessionWithUserMsg,
      ...prev.filter((s) => s.id !== sessionWithUserMsg.id),
    ]);
    setActiveSessionId(sessionWithUserMsg.id);

    try {
      let structuredResponse: AiAssistantStructuredResponse | null = null;

      try {
        const res = await fetch('/api/ai-assistant/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            authContext,
            dataset: liveDataset,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.ok && data.directAnswerBn) {
            structuredResponse = data as AiAssistantStructuredResponse;
          }
        } else if (res.status === 401 || res.status === 403 || res.status === 429) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'অনুরোধটি অনুমোদিত নয়।');
        }
      } catch (networkOrServerErr: any) {
        if (
          String(networkOrServerErr?.message || '').includes('অনুমোদন') ||
          String(networkOrServerErr?.message || '').includes('অনুমতি') ||
          String(networkOrServerErr?.message || '').includes('অপেক্ষা')
        ) {
          throw networkOrServerErr;
        }
        // Fallback to local deterministic execution over live database records
      }

      if (!structuredResponse) {
        structuredResponse = executeBusinessAssistantQuery({
          question,
          dataset: liveDataset,
          authContext,
        });
      }

      const assistantMessage: AiChatMessage = {
        id: `msg_a_${Date.now() + 1}`,
        role: 'assistant',
        text: structuredResponse.directAnswerBn,
        createdAt: new Date().toISOString(),
        createdAtFormatted: formatBengaliDateTime(new Date()),
        evidence: structuredResponse,
      };

      const completedSession: AiChatSession = {
        ...sessionWithUserMsg,
        updatedAt: new Date().toISOString(),
        messages: [...sessionWithUserMsg.messages, assistantMessage],
      };

      setSessions((prev) => [
        completedSession,
        ...prev.filter((s) => s.id !== completedSession.id),
      ]);
      await saveAiChatSession(completedSession);

      recordAiAssistantAuditLog({
        actor: ownerId,
        actorName: ownerName,
        question,
        toolUsed: structuredResponse.toolUsed,
        dateRangeBn: structuredResponse.dateRangeBn,
      });

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'আপনার প্রশ্নের উত্তর প্রস্তুত করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।'
      );
    } finally {
      setIsAsking(false);
    }
  }

  const hasMessages = Boolean(activeSession && activeSession.messages.length > 0);

  const renderHistoryList = () => (
    <>
      <div className="ai-history-head">
        <div className="ai-history-head-title">
          <MessageSquare size={16} className="ai-history-icon" />
          <div>
            <strong>চ্যাট হিস্ট্রি ({toBengaliNumerals(sessions.length)})</strong>
            <small>{ownerName}-এর সংরক্ষিত আলোচনা</small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="ai-history-new-btn"
            onClick={handleStartNewChat}
            title="নতুন কথোপকথন শুরু করুন"
          >
            <Plus size={13} />
            <span>নতুন</span>
          </button>
          <button
            type="button"
            className="ai-history-mobile-close"
            onClick={() => setShowMobileHistory(false)}
            aria-label="হিস্ট্রি বন্ধ করুন"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="ai-history-live-note">
        <ShieldCheck size={14} style={{ color: '#0d9488', flexShrink: 0 }} />
        <span>প্রতিটি উত্তর সরাসরি লাইভ ডেটাবেস থেকে তাৎক্ষণিক হিসাব করে দেখানো হয়।</span>
      </div>

      {sessions.length === 0 ? (
        <div className="ai-history-empty">
          <Bot size={26} style={{ color: '#94a3b8', marginBottom: '4px' }} />
          <p>এখনো কোনো কথোপকথন সংরক্ষিত নেই।</p>
          <small>চ্যাট বক্স থেকে যেকোনো প্রশ্নে ক্লিক করুন বা নতুন প্রশ্ন লিখুন।</small>
        </div>
      ) : (
        <div className="ai-history-list">
          {sessions.map((sess) => {
            const isSelected = sess.id === activeSession?.id;
            const isRenaming = renamingSessionId === sess.id;
            const qCount = sess.messages.filter((m) => m.role === 'user').length;

            return (
              <div
                key={sess.id}
                className={`ai-history-item ${isSelected ? 'active' : ''}`}
              >
                {isRenaming ? (
                  <form onSubmit={handleConfirmRename} className="ai-rename-form">
                    <input
                      type="text"
                      value={renameTitleInput}
                      onChange={(e) => setRenameTitleInput(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="ai-rename-save">
                      সেভ
                    </button>
                    <button
                      type="button"
                      className="ai-rename-cancel"
                      onClick={() => setRenamingSessionId(null)}
                    >
                      বাতিল
                    </button>
                  </form>
                ) : (
                  <div
                    className="ai-history-item-body"
                    onClick={() => {
                      setActiveSessionId(sess.id);
                      setShowMobileHistory(false);
                    }}
                  >
                    <div className="ai-history-item-title">{sess.title}</div>
                    <div className="ai-history-item-meta">
                      <span className="ai-history-q-badge">
                        {toBengaliNumerals(qCount)}টি প্রশ্ন
                      </span>
                      <span>{dateLabel((sess.updatedAt || '').slice(0, 10))}</span>
                    </div>
                  </div>
                )}

                <div className="ai-history-item-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingSessionId(sess.id);
                      setRenameTitleInput(sess.title);
                    }}
                    title="নাম পরিবর্তন করুন"
                  >
                    <Edit3 size={12} /> নাম পরিবর্তন
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => handleDeleteChat(sess.id)}
                    title="চ্যাট ডিলিট করুন"
                  >
                    <Trash2 size={12} /> মুছুন
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="ai-workspace-shell">
      {/* 1. EXECUTIVE TOP HEADER BAR */}
      <div className="ai-workspace-header">
        <div className="ai-header-brand">
          <div className="ai-header-bot-badge">
            <Bot size={26} />
          </div>
          <div className="ai-header-titles">
            <div className="ai-header-title-row">
              <h2>AI Business Assistant</h2>
              <span className="ai-verified-pill">
                <span className="ai-pulse-dot" />
                ১০০% লাইভ ডেটাবেস ভেরিফাইড
              </span>
            </div>
            <p>
              আপনার ব্যবসার হিসাব জিজ্ঞাসা করুন — বাংলা, English বা Banglish ভাষায় তাৎক্ষণিক নির্ভুল উত্তর
            </p>
          </div>
        </div>

        <div className="ai-header-actions">
          {/* Desktop Sidebar Toggle */}
          <button
            type="button"
            className="ai-hdr-btn desktop-only-btn"
            onClick={() => setShowDesktopSidebar((prev) => !prev)}
            title={showDesktopSidebar ? 'চ্যাট হিস্ট্রি প্যানেল লুকান' : 'চ্যাট হিস্ট্রি প্যানেল দেখুন'}
          >
            {showDesktopSidebar ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            <span>হিস্ট্রি ({toBengaliNumerals(sessions.length)})</span>
          </button>

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            className="ai-hdr-btn mobile-only-btn"
            onClick={() => setShowMobileHistory(true)}
          >
            <History size={15} />
            <span>পূর্বের চ্যাট ({toBengaliNumerals(sessions.length)})</span>
          </button>

          <button
            type="button"
            className="ai-hdr-btn primary-teal"
            onClick={handleStartNewChat}
          >
            <Plus size={16} />
            <span>নতুন চ্যাট</span>
          </button>

          {onOpenSettings && (
            <button
              type="button"
              className="ai-hdr-btn icon-only-mobile"
              onClick={onOpenSettings}
              title="সেটিংস থেকে AI Assistant অন/অফ করুন"
            >
              <Settings size={15} />
              <span className="hide-on-xs">সেটিংস</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. REAL-TIME FINANCIAL PULSE STRIP (1-Click Contextual Ask) */}
      <div className="ai-pulse-grid">
        <button
          type="button"
          className="ai-pulse-card"
          disabled={isAsking}
          onClick={() => handleAskQuestion('আজ পর্যন্ত ব্যবসায় মোট কত টাকা বিনিয়োগ হয়েছে?')}
          title="ক্লিক করে বিস্তারিত বিনিয়োগ রিপোর্ট দেখুন"
        >
          <div className="ai-pulse-icon teal">
            <Database size={16} />
          </div>
          <div className="ai-pulse-info">
            <span>মোট মূলধন বিনিয়োগ</span>
            <strong>{money(liveCashPulse.totalInvestments)}</strong>
          </div>
          <ArrowUpRight size={14} className="ai-pulse-arrow" />
        </button>

        <button
          type="button"
          className="ai-pulse-card"
          disabled={isAsking}
          onClick={() => handleAskQuestion('ব্যবসার বর্তমান প্রকৃত ব্যালেন্স কত?')}
          title="ক্লিক করে প্রকৃত ক্যাশ ব্যালেন্সের সূত্র ও হিসাব দেখুন"
        >
          <div className="ai-pulse-icon emerald">
            <Wallet size={16} />
          </div>
          <div className="ai-pulse-info">
            <span>বর্তমান প্রকৃত ব্যালেন্স</span>
            <strong className="text-teal">{money(liveCashPulse.availableCash)}</strong>
          </div>
          <ArrowUpRight size={14} className="ai-pulse-arrow" />
        </button>

        <button
          type="button"
          className="ai-pulse-card"
          disabled={isAsking}
          onClick={() => handleAskQuestion('এখন পর্যন্ত মোট কত টাকা লাভ হয়েছে?')}
          title="ক্লিক করে নিট লাভ-ক্ষতির বিস্তারিত হিসাব দেখুন"
        >
          <div className="ai-pulse-icon blue">
            <TrendingUp size={16} />
          </div>
          <div className="ai-pulse-info">
            <span>সর্বমোট নিট মুনাফা</span>
            <strong className={liveCashPulse.netProfit >= 0 ? 'text-emerald' : 'text-danger'}>
              {liveCashPulse.netProfit >= 0 ? '+' : ''}
              {money(liveCashPulse.netProfit)}
            </strong>
          </div>
          <ArrowUpRight size={14} className="ai-pulse-arrow" />
        </button>

        <button
          type="button"
          className="ai-pulse-card"
          disabled={isAsking}
          onClick={() => handleAskQuestion('কোন লেনদেনগুলো এখনো অনুমোদনের অপেক্ষায় রয়েছে?')}
          title="ক্লিক করে পেন্ডিং অনুমোদনের তালিকা দেখুন"
        >
          <div className="ai-pulse-icon amber">
            <ShieldCheck size={16} />
          </div>
          <div className="ai-pulse-info">
            <span>অপেক্ষমান অনুমোদন</span>
            <strong>{toBengaliNumerals(pendingApprovalCount)}টি অনুরোধ</strong>
          </div>
          <ArrowUpRight size={14} className="ai-pulse-arrow" />
        </button>
      </div>

      {/* 3. MAIN WORKSPACE: COLLAPSIBLE SIDEBAR + CHAT INTERFACE */}
      <div className={`ai-workspace-body ${showDesktopSidebar ? 'with-sidebar' : 'full-width'}`}>
        {/* DESKTOP LEFT SIDEBAR */}
        {showDesktopSidebar && (
          <aside className="ai-history-sidebar desktop-sidebar">
            {renderHistoryList()}
          </aside>
        )}

        {/* MOBILE HISTORY SLIDE-OVER DRAWER */}
        {showMobileHistory && (
          <div
            className="ai-mobile-drawer-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowMobileHistory(false);
            }}
          >
            <aside className="ai-history-sidebar mobile-drawer">
              {renderHistoryList()}
            </aside>
          </div>
        )}

        {/* MAIN CHAT BOX CONTAINER */}
        <section className="ai-chatbox-panel">
          {/* Chat Box Top Bar */}
          <div className="ai-chatbox-topbar">
            <div className="ai-chatbox-session-info">
              <div className="ai-chatbox-status-dot" />
              <div className="ai-chatbox-session-texts">
                <strong>
                  {activeSession ? activeSession.title : 'নতুন হিসাব বিশ্লেষণ সেশন'}
                </strong>
                <span>
                  👤 লগইনকৃত অংশীদার: <b>{ownerName}</b> •{' '}
                  {hasMessages
                    ? `${toBengaliNumerals(
                        activeSession!.messages.filter((m) => m.role === 'user').length
                      )}টি প্রশ্নোত্তর`
                    : 'প্রশ্ন করার জন্য প্রস্তুত'}
                </span>
              </div>
            </div>

            <div className="ai-chatbox-top-actions">
              {hasMessages && (
                <button
                  type="button"
                  className="ai-clear-chat-btn"
                  onClick={handleClearCurrentChat}
                  title="বর্তমান চ্যাটের মেসেজগুলো পরিষ্কার করুন"
                >
                  <Trash2 size={13} />
                  <span>চ্যাট পরিষ্কার</span>
                </button>
              )}
            </div>
          </div>

          {/* Chat Messages Stream Area */}
          <div className="ai-chatbox-messages">
            {!hasMessages && !isAsking ? (
              <div className="ai-welcome-container">
                <div className="ai-welcome-hero">
                  <div className="ai-welcome-bot-ring">
                    <Bot size={28} />
                  </div>
                  <h3>স্বাগতম, {ownerName}! আপনার ব্যবসার কোন হিসাবটি জানতে চান?</h3>
                  <p>
                    নিচের যেকোনো একটি প্রশ্নে ক্লিক করুন অথবা নিচের বক্সে বাংলা, ইংরেজি বা বাংলিশে আপনার প্রশ্ন লিখুন।
                  </p>
                </div>

                <div className="ai-welcome-section-label">
                  <Sparkles size={15} style={{ color: '#0d9488' }} />
                  <span>এক ক্লিকে জিজ্ঞাসা করুন (জনপ্রিয় হিসাব প্রশ্নসমূহ):</span>
                </div>

                <div className="ai-welcome-prompts-grid">
                  {SUGGESTED_QUICK_QUESTIONS.map((item) => (
                    <button
                      key={item.question}
                      type="button"
                      disabled={isAsking}
                      className={`ai-prompt-card tone-${item.tone}`}
                      onClick={() => handleAskQuestion(item.question)}
                    >
                      <div className="ai-prompt-card-top">
                        <span className={`ai-prompt-badge tone-${item.tone}`}>
                          {item.badge}
                        </span>
                        <ChevronRight size={15} className="ai-prompt-chevron" />
                      </div>
                      <div className="ai-prompt-card-text">{item.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ai-messages-list">
                {activeSession?.messages.map((msg) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="ai-user-msg-row">
                        <div className="ai-user-bubble">
                          <div className="ai-user-bubble-text">{msg.text}</div>
                          <div className="ai-user-bubble-meta">
                            <span>👤 {ownerName}</span>
                            <span>•</span>
                            <span>{msg.createdAtFormatted}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const ev = msg.evidence;
                  return (
                    <div key={msg.id} className="ai-bot-msg-row">
                      <div className="ai-bot-avatar">
                        <Bot size={18} />
                      </div>

                      <div className="ai-bot-card">
                        {/* Top Meta Header */}
                        <div className="ai-bot-card-head">
                          <div className="ai-bot-head-badges">
                            <span className="ai-bot-tag">
                              <Sparkles size={12} /> AI হিসাব বিশ্লেষক
                            </span>
                            {ev?.dateRangeBn && (
                              <span className="ai-bot-period-tag">
                                <Calendar size={12} /> সময়সীমা: {ev.dateRangeBn}
                              </span>
                            )}
                          </div>

                          <div className="ai-bot-head-tools">
                            {ev?.question && (
                              <button
                                type="button"
                                className="ai-tool-mini-btn"
                                onClick={() => handleAskQuestion(ev.question)}
                                disabled={isAsking}
                                title="লাইভ ডেটা দিয়ে পুনরায় হিসাব যাচাই করুন"
                              >
                                <RefreshCw size={12} />
                                <span>রিফ্রেশ</span>
                              </button>
                            )}

                            <button
                              type="button"
                              className={`ai-tool-mini-btn ${
                                copiedMsgId === msg.id ? 'copied' : ''
                              }`}
                              onClick={() => handleCopyAnswer(msg)}
                              title="উত্তর কপি করুন"
                            >
                              {copiedMsgId === msg.id ? (
                                <Check size={12} />
                              ) : (
                                <Copy size={12} />
                              )}
                              <span>{copiedMsgId === msg.id ? 'কপি হয়েছে' : 'কপি'}</span>
                            </button>
                          </div>
                        </div>

                        {/* 1. Direct Bengali Answer */}
                        <div className="ai-bot-answer-box">
                          {ev?.directAnswerBn || msg.text}
                        </div>

                        {/* 2. Structured Financial Breakdown Tables */}
                        {ev?.tables && ev.tables.length > 0 && (
                          <div className="ai-bot-tables-stack">
                            {ev.tables.map((tbl, tIdx) => (
                              <div key={tIdx} className="ai-bot-table-card">
                                <div className="ai-bot-table-title">
                                  <span>📊 {tbl.titleBn}</span>
                                </div>
                                <div className="ai-bot-table-scroll">
                                  <table className="ai-bot-table">
                                    <thead>
                                      <tr>
                                        {tbl.headers.map((h, hIdx) => (
                                          <th
                                            key={hIdx}
                                            className={hIdx === 0 ? 'align-left' : 'align-right'}
                                          >
                                            {h}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {tbl.rows.map((r, rIdx) => (
                                        <tr key={rIdx}>
                                          {r.map((cell, cIdx) => (
                                            <td
                                              key={cIdx}
                                              className={`${
                                                cIdx === 0 ? 'align-left' : 'align-right'
                                              } ${
                                                cIdx === 0 || cIdx === r.length - 1
                                                  ? 'font-bold'
                                                  : ''
                                              }`}
                                            >
                                              {cell}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                    {tbl.footer && (
                                      <tfoot>
                                        <tr>
                                          {tbl.footer.map((fCell, fIdx) => (
                                            <td
                                              key={fIdx}
                                              className={
                                                fIdx === 0 ? 'align-left' : 'align-right'
                                              }
                                            >
                                              {fCell}
                                            </td>
                                          ))}
                                        </tr>
                                      </tfoot>
                                    )}
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 3. Calculation Formula & Data Source Box */}
                        {ev && (
                          <div className="ai-bot-formula-box">
                            <div className="ai-formula-row">
                              <Calculator size={14} className="ai-formula-icon" />
                              <div>
                                <b>হিসাবের পদ্ধতি:</b> {ev.calculationMethodBn}
                              </div>
                            </div>
                            <div className="ai-formula-row">
                              <Database size={14} className="ai-formula-icon" />
                              <div>
                                <b>ব্যবহৃত রেকর্ড ও উৎস:</b> {ev.recordsUsedSummaryBn}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 4. Data Integrity Notices */}
                        {ev?.integrityNotices && ev.integrityNotices.length > 0 && (
                          <div className="ai-bot-notices-stack">
                            {ev.integrityNotices.map((notice, nIdx) => (
                              <div
                                key={nIdx}
                                className={`ai-bot-notice ${
                                  notice.level === 'warning' ? 'warning' : 'info'
                                }`}
                              >
                                {notice.level === 'warning' ? (
                                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                ) : (
                                  <Info size={14} style={{ flexShrink: 0 }} />
                                )}
                                <span>{notice.messageBn}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 5. Action Footer: [লেনদেনগুলো দেখুন] */}
                        {ev && (
                          <div className="ai-bot-actions-footer">
                            <div className="ai-bot-action-btns">
                              <button
                                type="button"
                                className="ai-view-tx-btn"
                                onClick={() =>
                                  setEvidenceModalData({
                                    title: ev.question,
                                    dateRangeBn: ev.dateRangeBn,
                                    calculationMethodBn: ev.calculationMethodBn,
                                    transactions: ev.transactions || [],
                                    filterPreset: ev.filterPreset,
                                  })
                                }
                              >
                                <FileText size={14} />
                                <span>
                                  [লেনদেনগুলো দেখুন (
                                  {toBengaliNumerals((ev.transactions || []).length)}টি)]
                                </span>
                              </button>

                              <button
                                type="button"
                                className="ai-goto-ledger-btn"
                                onClick={() => onNavigateToTransactions(ev.filterPreset)}
                              >
                                <span>সকল লেনদেন পেজে যান</span>
                                <ExternalLink size={13} />
                              </button>
                            </div>

                            <span className="ai-bot-timestamp">
                              যাচাইকৃত: {msg.createdAtFormatted}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isAsking && (
                  <div className="ai-bot-msg-row">
                    <div className="ai-bot-avatar">
                      <Bot size={18} />
                    </div>
                    <div className="ai-bot-loading-bubble">
                      <span
                        className="btn-spinner"
                        style={{ borderColor: '#0d9488', borderTopColor: 'transparent' }}
                      />
                      <span>
                        ডাটাবেস থেকে আসল লেনদেন যাচাই ও নির্ভুল হিসাব প্রস্তুত করা হচ্ছে…
                      </span>
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <div className="ai-chat-error-banner">
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Compact Single-Row Scrollable Quick Prompts when conversation is active */}
          {hasMessages && (
            <div className="ai-compact-chips-strip">
              <span className="ai-compact-strip-label">
                <Sparkles size={13} /> দ্রুত প্রশ্ন:
              </span>
              <div className="ai-compact-chips-scroll">
                {SUGGESTED_QUICK_QUESTIONS.map((item) => (
                  <button
                    key={item.question}
                    type="button"
                    disabled={isAsking}
                    className="ai-compact-chip"
                    onClick={() => handleAskQuestion(item.question)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Question Input Composer */}
          <form
            className="ai-chatbox-composer"
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion();
            }}
          >
            <div className="ai-composer-input-wrap">
              <Sparkles size={17} className="ai-composer-sparkle" />
              <input
                ref={inputRef}
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                disabled={isAsking}
                placeholder="আপনার ব্যবসার হিসাব জিজ্ঞাসা করুন (যেমন: এই মাসে মোট কত টাকা খরচ হয়েছে?)"
              />
              {questionInput && !isAsking && (
                <button
                  type="button"
                  className="ai-composer-clear"
                  onClick={() => setQuestionInput('')}
                  title="মুছুন"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="ai-composer-send-btn"
              disabled={isAsking || !questionInput.trim()}
            >
              <Send size={16} />
              <span>জিজ্ঞাসা করুন</span>
            </button>
          </form>
        </section>
      </div>

      {/* EVIDENCE TRANSACTIONS MODAL ([লেনদেনগুলো দেখুন]) */}
      {evidenceModalData && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEvidenceModalData(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: '780px', width: '95%' }}
          >
            <div className="modal-head">
              <div>
                <h2 style={{ margin: 0, fontSize: '17px' }}>
                  📋 উত্তরের স্বপক্ষে ব্যবহৃত আসল লেনদেনসমূহ
                </h2>
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  প্রশ্ন: “{evidenceModalData.title}” • সময়সীমা: {evidenceModalData.dateRangeBn}
                </small>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEvidenceModalData(null)}
                aria-label="বন্ধ করুন"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-content-area" style={{ display: 'grid', gap: '12px' }}>
              <div
                style={{
                  background: '#f0fdfa',
                  border: '1px solid #99f6e4',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#0f766e',
                }}
              >
                <b>হিসাবের সূত্র:</b> {evidenceModalData.calculationMethodBn}
              </div>

              {evidenceModalData.transactions.length === 0 ? (
                <div
                  style={{
                    padding: '28px 16px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px dashed #cbd5e1',
                    color: '#64748b',
                  }}
                >
                  এই সময়সীমায় কোনো লেনদেন পাওয়া যায়নি।
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: '58vh',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                          তারিখ
                        </th>
                        <th style={{ padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                          ধরন
                        </th>
                        <th style={{ padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                          শিরোনাম ও বিবরণ
                        </th>
                        <th style={{ padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                          অংশীদার/খাত
                        </th>
                        <th style={{ padding: '9px 10px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                          পরিমাণ (৳)
                        </th>
                        {onViewEntryRecord && (
                          <th style={{ padding: '9px 10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                            রশিদ
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {evidenceModalData.transactions.map((tx) => {
                        const fullEntry = entries.find((e) => e.id === tx.id);
                        return (
                          <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              {dateLabel(tx.date)}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span className="type-pill">{tx.typeLabelBn}</span>
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f172a' }}>
                              <div>{tx.title}</div>
                              {tx.notes && (
                                <small style={{ color: '#64748b', display: 'block', fontWeight: 400 }}>
                                  {tx.notes}
                                </small>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#475569' }}>
                              {tx.partnerName ||
                                tx.category ||
                                (tx.seller ? `বিক্রেতা: ${tx.seller}` : '—')}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              <div>{money(tx.amount, true)}</div>
                              {tx.profit !== undefined && (
                                <small style={{ color: '#059669', display: 'block' }}>
                                  লাভ: +{money(tx.profit, true)}
                                </small>
                              )}
                            </td>
                            {onViewEntryRecord && (
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                {fullEntry ? (
                                  <button
                                    type="button"
                                    className="text-btn"
                                    style={{ fontSize: '11.5px', padding: '2px 6px' }}
                                    onClick={() => {
                                      setEvidenceModalData(null);
                                      onViewEntryRecord(fullEntry);
                                    }}
                                  >
                                    দেখুন <ChevronRight size={12} />
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const preset = evidenceModalData.filterPreset;
                    setEvidenceModalData(null);
                    onNavigateToTransactions(preset);
                  }}
                >
                  সকল লেনদেন পেজে ফিল্টারসহ দেখুন →
                </button>
                <button type="button" className="primary" onClick={() => setEvidenceModalData(null)}>
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
