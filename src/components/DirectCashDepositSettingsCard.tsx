import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Package,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import type { Entry } from '../types';
import { dateLabel, money, toBengaliNumerals } from '../accounting';

interface DirectCashDepositSettingsCardProps {
  entries: Entry[];
  availableCash: number;
  totalSales: number;
  netProfit: number;
  currentSeller: 'Rakib' | 'Limon' | string;
  isFullAdmin: boolean;
  onDepositCash: (payload: Omit<Entry, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteDeposit?: (entryId: string, title: string) => Promise<void>;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000, 10000];

const TITLE_PRESETS = [
  'বেচা-কেনার পর এককালীন নগদ ক্যাশ জমা (প্রডাক্ট ছাড়া)',
  'সারাদিনের বেচা-কেনার নগদ ক্যাশ জমা',
  'মেলার বেচা-কেনার ক্যাশ জমা (স্টক কমানো ছাড়া)',
  'খুচরা বেচা-কেনার ক্যাশ জমা',
];

export const DirectCashDepositSettingsCard: React.FC<DirectCashDepositSettingsCardProps> = ({
  entries,
  availableCash,
  totalSales,
  currentSeller,
  isFullAdmin,
  onDepositCash,
  onDeleteDeposit,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [depositMode, setDepositMode] = useState<'sale_cash' | 'balance_only'>('sale_cash');
  const [profitMode, setProfitMode] = useState<'full_cash' | 'custom_profit'>('full_cash');
  const [amountInput, setAmountInput] = useState<string>('');
  const [customProfitInput, setCustomProfitInput] = useState<string>('');
  const [titleInput, setTitleInput] = useState<string>(
    'বেচা-কেনার পর এককালীন নগদ ক্যাশ জমা (প্রডাক্ট ছাড়া)'
  );
  const [sellerInput, setSellerInput] = useState<'Rakib' | 'Limon' | string>(
    currentSeller === 'Limon' ? 'Limon' : 'Rakib'
  );
  const [dateInput, setDateInput] = useState<string>(todayStr());
  const [notesInput, setNotesInput] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string>('');
  const [localSuccess, setLocalSuccess] = useState<string>('');

  const parsedAmount = useMemo(() => {
    const n = Number(amountInput);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }, [amountInput]);

  const effectiveProfit = useMemo(() => {
    if (depositMode === 'balance_only') return 0;
    if (profitMode === 'full_cash') return parsedAmount;
    const cp = Number(customProfitInput);
    if (!Number.isFinite(cp) || cp < 0) return 0;
    return Math.min(parsedAmount, Math.round(cp * 100) / 100);
  }, [depositMode, profitMode, parsedAmount, customProfitInput]);

  const balanceAddition = useMemo(() => {
    if (depositMode === 'balance_only') return parsedAmount;
    return effectiveProfit;
  }, [depositMode, parsedAmount, effectiveProfit]);

  const recentCashDeposits = useMemo(() => {
    return entries
      .filter(
        (e) =>
          e.status === 'posted' &&
          (e.category === 'প্রডাক্ট ছাড়া ক্যাশ জমা' ||
            e.category === 'সরাসরি ক্যাশ জমা' ||
            (!e.productId &&
              !e.comboItems?.length &&
              (e.title?.includes('প্রডাক্ট ছাড়া') || e.title?.includes('এককালীন নগদ ক্যাশ জমা'))))
      )
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [entries]);

  const totalDepositedWithoutProduct = useMemo(
    () => recentCashDeposits.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [recentCashDeposits]
  );

  const handleQuickAddAmount = (addVal: number) => {
    setLocalError('');
    setLocalSuccess('');
    const current = Number(amountInput) || 0;
    const next = current + addVal;
    setAmountInput(String(next));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setLocalSuccess('');

    if (parsedAmount <= 0) {
      setLocalError('অনুগ্রহ করে ক্যাশ জমার সঠিক পরিমাণ (৳) লিখুন।');
      return;
    }

    const cleanTitle =
      titleInput.trim() || 'বেচা-কেনার পর এককালীন নগদ ক্যাশ জমা (প্রডাক্ট ছাড়া)';

    setSubmitting(true);
    try {
      if (depositMode === 'sale_cash') {
        const cogsVal = Math.max(0, Math.round((parsedAmount - effectiveProfit) * 100) / 100);
        await onDepositCash({
          type: 'sale',
          title: cleanTitle,
          amount: parsedAmount,
          date: dateInput || todayStr(),
          status: 'posted',
          category: 'প্রডাক্ট ছাড়া ক্যাশ জমা',
          seller: sellerInput || 'Rakib',
          cogsAmount: cogsVal,
          grossProfit: effectiveProfit,
          profit: effectiveProfit,
          notes:
            notesInput.trim() ||
            `বেচা-কেনার পর প্রডাক্ট সেল ও স্টক কমানো ছাড়া সরাসরি ক্যাশ জমা (${
              sellerInput === 'Limon' ? 'লিমন' : 'রাকিব'
            })`,
        });
      } else {
        await onDepositCash({
          type: 'other',
          title: cleanTitle,
          amount: parsedAmount,
          date: dateInput || todayStr(),
          status: 'posted',
          category: 'সরাসরি ক্যাশ জমা',
          seller: sellerInput || 'Rakib',
          notes:
            notesInput.trim() ||
            `শুধু ক্যাশ ব্যালেন্সে নগদ জমা — বিক্রয় বা প্রডাক্ট স্টকে কোনো প্রভাব নেই (${
              sellerInput === 'Limon' ? 'লিমন' : 'রাকিব'
            })`,
        });
      }

      setLocalSuccess(
        `✅ ${money(parsedAmount)} প্রডাক্ট সেল ছাড়াই সফলভাবে ক্যাশ জমা হয়েছে! (কোনো প্রডাক্টের স্টক কমেনি)`
      );
      setAmountInput('');
      setCustomProfitInput('');
      setNotesInput('');
    } catch (err: any) {
      setLocalError(err?.message || 'ক্যাশ জমা করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: '22px',
        borderRadius: '18px',
        overflow: 'hidden',
        border: '1.5px solid #0d9488',
        background: '#ffffff',
        boxShadow: '0 12px 32px -10px rgba(15, 23, 42, 0.14)',
      }}
    >
      {/* Executive Dark-Emerald & Slate Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #0f172a 58%, #0f766e 100%)',
          padding: '16px 18px',
          color: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: '1 1 240px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)',
                border: '1px solid rgba(167, 243, 208, 0.4)',
              }}
            >
              <Banknote size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.02rem',
                    fontWeight: 900,
                    color: '#ffffff',
                    letterSpacing: '-0.01em',
                  }}
                >
                  বেচা-কেনার পর প্রডাক্ট সেল ছাড়া ক্যাশ জমা
                </h3>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: '999px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    background: 'rgba(16, 185, 129, 0.22)',
                    color: '#6ee7b7',
                    border: '1px solid rgba(110, 231, 183, 0.38)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📦 স্টক অপরিবর্তিত • Direct Cash In
                </span>
              </div>
              <p
                style={{
                  margin: '5px 0 0',
                  fontSize: '0.78rem',
                  color: '#cbd5e1',
                  lineHeight: 1.45,
                }}
              >
                প্রডাক্ট সিলেক্ট বা স্টক কমানো ছাড়াই এককালীন নগদ ক্যাশ সরাসরি ব্যবসার হিসাবে জমা দিন।
              </p>
            </div>
          </div>

          {/* Header Action Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: showHistory ? '#ffffff' : 'rgba(255, 255, 255, 0.1)',
                color: showHistory ? '#0f172a' : '#f8fafc',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <History size={14} />
              <span>জমার তালিকা ({toBengaliNumerals(recentCashDeposits.length)}টি)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              style={{
                padding: '7px 12px',
                borderRadius: '10px',
                border: '1px solid #34d399',
                background: isExpanded
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>{isExpanded ? 'ফর্ম সংকুচিত করুন' : '+ ক্যাশ জমা ফর্ম'}</span>
            </button>
          </div>
        </div>

        {/* Compact 3-Column KPI Strip inside Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '8px',
            marginTop: '14px',
          }}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              borderRadius: '11px',
              padding: '8px 10px',
            }}
          >
            <div
              style={{
                fontSize: '0.68rem',
                color: '#94a3b8',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              বর্তমান ক্যাশ ব্যালান্স
            </div>
            <div
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: '#34d399',
                marginTop: '2px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {money(availableCash)}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              borderRadius: '11px',
              padding: '8px 10px',
            }}
          >
            <div
              style={{
                fontSize: '0.68rem',
                color: '#94a3b8',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              মোট বিক্রয় হিসাব
            </div>
            <div
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: '#f8fafc',
                marginTop: '2px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {money(totalSales)}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(16, 185, 129, 0.16)',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              borderRadius: '11px',
              padding: '8px 10px',
            }}
          >
            <div
              style={{
                fontSize: '0.68rem',
                color: '#a7f3d0',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              প্রডাক্ট ছাড়া জমা ({toBengaliNumerals(recentCashDeposits.length)}টি)
            </div>
            <div
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: '#6ee7b7',
                marginTop: '2px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {money(totalDepositedWithoutProduct)}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Professional Deposit Form Body */}
      {isExpanded && (
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '16px 18px',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* 1. Segmented Mode Switcher */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                ১. ক্যাশ জমার ধরন নির্বাচন করুন
              </span>
              <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>
                ✓ স্টক ১ পিসও কমবে না
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                background: '#e2e8f0',
                padding: '4px',
                borderRadius: '12px',
              }}
            >
              <button
                type="button"
                onClick={() => setDepositMode('sale_cash')}
                style={{
                  padding: '9px 10px',
                  borderRadius: '9px',
                  border: 'none',
                  background:
                    depositMode === 'sale_cash'
                      ? 'linear-gradient(135deg, #059669 0%, #0d9488 100%)'
                      : 'transparent',
                  color: depositMode === 'sale_cash' ? '#ffffff' : '#334155',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow:
                    depositMode === 'sale_cash'
                      ? '0 4px 10px rgba(5, 150, 105, 0.25)'
                      : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                🛍️ বিক্রয় ও ব্যালেন্সে জমা
              </button>

              <button
                type="button"
                onClick={() => setDepositMode('balance_only')}
                style={{
                  padding: '9px 10px',
                  borderRadius: '9px',
                  border: 'none',
                  background:
                    depositMode === 'balance_only'
                      ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)'
                      : 'transparent',
                  color: depositMode === 'balance_only' ? '#ffffff' : '#334155',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow:
                    depositMode === 'balance_only'
                      ? '0 4px 10px rgba(2, 132, 199, 0.25)'
                      : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                🏦 শুধু ক্যাশ ব্যালেন্সে জমা
              </button>
            </div>

            <div
              style={{
                marginTop: '6px',
                fontSize: '0.74rem',
                color: depositMode === 'sale_cash' ? '#047857' : '#0369a1',
                background: depositMode === 'sale_cash' ? '#ecfdf5' : '#f0f9ff',
                border:
                  depositMode === 'sale_cash'
                    ? '1px solid #a7f3d0'
                    : '1px solid #bae6fd',
                padding: '6px 10px',
                borderRadius: '8px',
                fontWeight: 600,
              }}
            >
              {depositMode === 'sale_cash'
                ? '💡 এই মোডে টাকা জমা দিলে প্রডাক্টের স্টক না কমিয়ে মোট বিক্রয় এবং বর্তমান ক্যাশ ব্যালেন্সে যোগ হবে।'
                : '💡 এই মোডে বিক্রয় বা লাভে কোনো পরিবর্তন না করে সরাসরি বর্তমান ক্যাশ ব্যালেন্সে টাকা যোগ হবে।'}
            </div>
          </div>

          {/* 2. Banking-Style Currency Input + Quick Chips */}
          <div
            style={{
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '14px',
              padding: '12px',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <label
                htmlFor="direct-cash-amount-input"
                style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}
              >
                ২. ক্যাশ জমার পরিমাণ লিখুন (৳) *
              </label>
              {amountInput && (
                <button
                  type="button"
                  onClick={() => setAmountInput('')}
                  style={{
                    border: 'none',
                    background: '#fee2e2',
                    color: '#dc2626',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ✕ মুছুন
                </button>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: '11px',
                border: '2px solid #10b981',
                background: '#f0fdf4',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  padding: '10px 14px',
                  background: '#059669',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ৳
              </span>
              <input
                id="direct-cash-amount-input"
                type="number"
                min="1"
                step="any"
                required
                value={amountInput}
                onChange={(e) => {
                  setLocalError('');
                  setLocalSuccess('');
                  setAmountInput(e.target.value);
                }}
                placeholder="০.০০ (যেমন: 2500)"
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: '10px 12px',
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  color: '#064e3b',
                  outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>

            {/* 6 Quick Amount Chips in Responsive Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(82px, 1fr))',
                gap: '6px',
                marginTop: '9px',
              }}
            >
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAddAmount(amt)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '8px',
                    border: '1px solid #a7f3d0',
                    background: '#ecfdf5',
                    color: '#065f46',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  +৳{toBengaliNumerals(amt)}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Profit Option when sale_cash is selected */}
          {depositMode === 'sale_cash' && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                ব্যালেন্স ও লাভে হিসাব পদ্ধতি:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setProfitMode('full_cash')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border:
                      profitMode === 'full_cash'
                        ? '1.5px solid #059669'
                        : '1px solid #cbd5e1',
                    background: profitMode === 'full_cash' ? '#d1fae5' : '#ffffff',
                    color: profitMode === 'full_cash' ? '#065f46' : '#475569',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ✅ ১০০% ব্যালেন্সে যোগ
                </button>
                <button
                  type="button"
                  onClick={() => setProfitMode('custom_profit')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border:
                      profitMode === 'custom_profit'
                        ? '1.5px solid #059669'
                        : '1px solid #cbd5e1',
                    background: profitMode === 'custom_profit' ? '#d1fae5' : '#ffffff',
                    color: profitMode === 'custom_profit' ? '#065f46' : '#475569',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ✏️ কাস্টম লাভ উল্লেখ
                </button>
              </div>

              {profitMode === 'custom_profit' && (
                <div style={{ marginTop: '8px' }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={customProfitInput}
                    onChange={(e) => setCustomProfitInput(e.target.value)}
                    placeholder="এই ক্যাশের মধ্যে নিট লাভ কত টাকা (৳)?"
                    style={{
                      width: '100%',
                      padding: '8px 11px',
                      borderRadius: '8px',
                      border: '1px solid #94a3b8',
                      fontSize: '0.82rem',
                      background: '#ffffff',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 4. Side-by-Side 2-Column Seller & Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>
              জমা দানকারী
              <select
                value={sellerInput}
                onChange={(e) => setSellerInput(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '8px 10px',
                  borderRadius: '9px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              >
                <option value="Rakib">👤 রাকিব (Rakib)</option>
                <option value="Limon">👤 লিমন (Limon)</option>
              </select>
            </label>

            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>
              জমার তারিখ
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '8px 10px',
                  borderRadius: '9px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              />
            </label>
          </div>

          {/* 5. Title & Quick Presets */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>
              বিবরণ / নোট
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="বেচা-কেনার পর এককালীন নগদ ক্যাশ জমা (প্রডাক্ট ছাড়া)"
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '8px 11px',
                  borderRadius: '9px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.82rem',
                }}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
              {TITLE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitleInput(preset)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '999px',
                    border:
                      titleInput === preset ? '1px solid #059669' : '1px solid #cbd5e1',
                    background: titleInput === preset ? '#ecfdf5' : '#f8fafc',
                    color: titleInput === preset ? '#065f46' : '#475569',
                    fontSize: '0.7rem',
                    fontWeight: titleInput === preset ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Live Impact Preview Bar */}
          {parsedAmount > 0 && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)',
                color: '#ffffff',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.7rem', color: '#a7f3d0', fontWeight: 700 }}>
                  জমার পর নতুন ক্যাশ ব্যালান্স হবে:
                </div>
                <div
                  style={{
                    fontSize: '0.96rem',
                    fontWeight: 900,
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '2px',
                  }}
                >
                  <span>{money(availableCash)}</span>
                  <ArrowRight size={14} />
                  <span>{money(availableCash + balanceAddition)}</span>
                </div>
              </div>
              <span
                style={{
                  padding: '4px 9px',
                  borderRadius: '999px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  color: '#6ee7b7',
                }}
              >
                📦 স্টক পরিবর্তন: ০ পিস
              </span>
            </div>
          )}

          {localError && (
            <div
              style={{
                padding: '9px 12px',
                borderRadius: '9px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              {localError}
            </div>
          )}

          {localSuccess && (
            <div
              style={{
                padding: '9px 12px',
                borderRadius: '9px',
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                color: '#065f46',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              {localSuccess}
            </div>
          )}

          {/* Submit CTA */}
          <button
            type="submit"
            className="primary"
            disabled={submitting || parsedAmount <= 0}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
              padding: '12px 18px',
              fontSize: '0.92rem',
              fontWeight: 900,
              borderRadius: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 16px -4px rgba(5, 150, 105, 0.4)',
            }}
          >
            <CheckCircle2 size={18} />
            <span>
              {submitting
                ? 'ক্যাশ জমা হচ্ছে…'
                : `প্রডাক্ট সেল ছাড়া ${parsedAmount > 0 ? money(parsedAmount) : ''} ক্যাশ জমা কনফার্ম করুন`}
            </span>
          </button>
        </form>
      )}

      {/* Recent Non-Product Cash Deposits List */}
      {showHistory && (
        <div
          style={{
            padding: '14px 18px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
              📋 প্রডাক্ট ছাড়া জমা দেওয়া ক্যাশের তালিকা ({toBengaliNumerals(recentCashDeposits.length)}টি)
            </h4>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              style={{
                border: 'none',
                background: '#e2e8f0',
                color: '#334155',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '0.73rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              বন্ধ করুন ✕
            </button>
          </div>

          {recentCashDeposits.length === 0 ? (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '0.8rem',
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px dashed #cbd5e1',
              }}
            >
              এখনো প্রডাক্ট ছাড়া সরাসরি কোনো ক্যাশ জমা দেওয়া হয়নি।
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {recentCashDeposits.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                      📅 {dateLabel(item.date)} • 👤{' '}
                      {item.seller === 'Limon'
                        ? 'লিমন (Limon)'
                        : item.seller === 'Rakib'
                        ? 'রাকিব (Rakib)'
                        : item.seller || 'অ্যাডমিন'}{' '}
                      •{' '}
                      <span style={{ color: '#059669', fontWeight: 700 }}>
                        {item.type === 'sale' ? 'বিক্রয় ও ব্যালেন্সে জমা' : 'শুধু ক্যাশ ব্যালেন্সে জমা'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontWeight: 900,
                        fontSize: '0.9rem',
                        color: '#059669',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      +{money(item.amount)}
                    </span>
                    {isFullAdmin && onDeleteDeposit && (
                      <button
                        type="button"
                        onClick={() => onDeleteDeposit(item.id, item.title)}
                        title="মুছে ফেলুন"
                        style={{
                          padding: '5px 7px',
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          background: '#fef2f2',
                          color: '#dc2626',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
