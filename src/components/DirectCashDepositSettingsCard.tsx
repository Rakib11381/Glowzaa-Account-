import React, { useMemo, useState } from 'react';
import {
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Package,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
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
      className="brand-popup-setting-card"
      style={{
        marginBottom: '20px',
        border: '2px solid #10b981',
        background: 'linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%)',
        boxShadow: '0 8px 24px -8px rgba(16, 185, 129, 0.22)',
      }}
    >
      {/* Top Header */}
      <div className="brand-popup-setting-top">
        <div className="brand-popup-setting-info">
          <div
            className="brand-popup-setting-icon"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
              color: '#ffffff',
            }}
          >
            <Banknote size={24} />
          </div>
          <div className="brand-popup-setting-text">
            <div className="brand-popup-setting-title-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ color: '#064e3b' }}>
                💵 বেচা-কেনার পর প্রডাক্ট সেল ছাড়া ক্যাশ জমা (Direct Cash Deposit)
              </h3>
              <span
                className="brand-popup-status-pill is-on"
                style={{
                  background: '#d1fae5',
                  color: '#065f46',
                  border: '1px solid #6ee7b7',
                }}
              >
                📦 স্টক কমবে না • সরাসরি ক্যাশ জমা
              </span>
            </div>
            <p style={{ color: '#047857' }}>
              বেচা-কেনার পর আলাদা করে প্রডাক্ট সিলেক্ট বা স্টক কমানো ছাড়াই এককালীন নগদ ক্যাশ টাকা ব্যবসার হিসাবে জমা দিন। এতে{' '}
              <b>কোনো প্রডাক্টের স্টক ১ পিসও কমবে না</b>, কিন্তু আপনার ক্যাশ ব্যালান্স ও হিসাব সাথে সাথে আপডেট হয়ে যাবে।
            </p>
          </div>
        </div>

        <div className="brand-popup-setting-controls" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className="brand-preview-trigger-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            style={{
              background: isExpanded ? '#059669' : '#ecfdf5',
              color: isExpanded ? '#ffffff' : '#065f46',
              borderColor: '#10b981',
              fontWeight: 700,
            }}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{isExpanded ? 'ক্যাশ জমা ফর্ম লুকান' : '+ ক্যাশ জমা দিন'}</span>
          </button>

          <button
            type="button"
            className="brand-preview-trigger-btn"
            onClick={() => setShowHistory((prev) => !prev)}
            style={{
              borderColor: '#a7f3d0',
              color: '#047857',
              background: '#ffffff',
            }}
          >
            <History size={16} />
            <span>জমার তালিকা ({toBengaliNumerals(recentCashDeposits.length)}টি)</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
          marginTop: '14px',
          padding: '12px',
          borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid #a7f3d0',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #d1fae5',
          }}
        >
          <div style={{ fontSize: '0.76rem', color: '#047857', fontWeight: 600 }}>
            বর্তমান মোট ক্যাশ ব্যালান্স
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#064e3b', marginTop: '2px' }}>
            {money(availableCash)}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #d1fae5',
          }}
        >
          <div style={{ fontSize: '0.76rem', color: '#047857', fontWeight: 600 }}>
            মোট বিক্রয় হিসাব
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f766e', marginTop: '2px' }}>
            {money(totalSales)}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #d1fae5',
          }}
        >
          <div style={{ fontSize: '0.76rem', color: '#047857', fontWeight: 600 }}>
            প্রডাক্ট ছাড়া মোট ক্যাশ জমা ({toBengaliNumerals(recentCashDeposits.length)}টি)
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
            {money(totalDepositedWithoutProduct)}
          </div>
        </div>
      </div>

      {/* Expandable Deposit Form */}
      {isExpanded && (
        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: '14px',
            padding: '16px',
            borderRadius: '14px',
            background: '#ffffff',
            border: '1.5px solid #a7f3d0',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Mode Selector */}
          <div>
            <div
              style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#064e3b',
                marginBottom: '8px',
              }}
            >
              ১. ক্যাশ জমার ধরন নির্বাচন করুন:
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '10px',
              }}
            >
              <button
                type="button"
                onClick={() => setDepositMode('sale_cash')}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border:
                    depositMode === 'sale_cash'
                      ? '2px solid #059669'
                      : '1.5px solid #cbd5e1',
                  background:
                    depositMode === 'sale_cash'
                      ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
                      : '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    color: depositMode === 'sale_cash' ? '#065f46' : '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🛍️ বেচা-কেনার নগদ ক্যাশ জমা (বিক্রয় ও ব্যালেন্সে যোগ)</span>
                </div>
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: depositMode === 'sale_cash' ? '#047857' : '#64748b',
                    marginTop: '4px',
                    lineHeight: 1.4,
                  }}
                >
                  প্রডাক্ট স্টক না কমিয়ে মোট বিক্রয় ও ক্যাশ ব্যালেন্সে টাকা জমা হবে।
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDepositMode('balance_only')}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border:
                    depositMode === 'balance_only'
                      ? '2px solid #0284c7'
                      : '1.5px solid #cbd5e1',
                  background:
                    depositMode === 'balance_only'
                      ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
                      : '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    color: depositMode === 'balance_only' ? '#075985' : '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🏦 শুধু বর্তমান ক্যাশ ব্যালেন্সে জমা (বিক্রয় ছাড়া)</span>
                </div>
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: depositMode === 'balance_only' ? '#0369a1' : '#64748b',
                    marginTop: '4px',
                    lineHeight: 1.4,
                  }}
                >
                  বিক্রয় বা স্টকে কোনো পরিবর্তন না করে সরাসরি বর্তমান ক্যাশ ব্যালেন্সে টাকা যোগ হবে।
                </div>
              </button>
            </div>
          </div>

          {/* Amount + Quick Chips */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.86rem',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '6px',
              }}
            >
              ২. ক্যাশ জমার পরিমাণ (৳) *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
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
                placeholder="যেমন: 2500"
                style={{
                  flex: '1 1 200px',
                  padding: '11px 14px',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  borderRadius: '10px',
                  border: '2px solid #10b981',
                  background: '#f0fdf4',
                  color: '#064e3b',
                }}
              />
              {amountInput && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setAmountInput('')}
                  style={{ padding: '10px 14px', borderRadius: '10px' }}
                >
                  ক্লিয়ার
                </button>
              )}
            </div>

            {/* Quick Amount Chips */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginTop: '8px',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600 }}>
                দ্রুত টাকা যোগ করুন:
              </span>
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAddAmount(amt)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    border: '1px solid #6ee7b7',
                    background: '#ecfdf5',
                    color: '#065f46',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  +৳{toBengaliNumerals(amt)}
                </button>
              ))}
            </div>
          </div>

          {/* Profit Option when sale_cash is selected */}
          {depositMode === 'sale_cash' && (
            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#1e293b',
                  marginBottom: '8px',
                }}
              >
                এই জমার টাকা ব্যালেন্স ও লাভে কীভাবে যুক্ত হবে?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setProfitMode('full_cash')}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border:
                      profitMode === 'full_cash'
                        ? '1.5px solid #059669'
                        : '1px solid #cbd5e1',
                    background: profitMode === 'full_cash' ? '#d1fae5' : '#ffffff',
                    color: profitMode === 'full_cash' ? '#065f46' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✅ পুরো ক্যাশটাই ব্যালেন্স ও লাভে যোগ করুন (১০০%)
                </button>
                <button
                  type="button"
                  onClick={() => setProfitMode('custom_profit')}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border:
                      profitMode === 'custom_profit'
                        ? '1.5px solid #059669'
                        : '1px solid #cbd5e1',
                    background: profitMode === 'custom_profit' ? '#d1fae5' : '#ffffff',
                    color: profitMode === 'custom_profit' ? '#065f46' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✏️ আলাদা লাভের পরিমাণ উল্লেখ করুন
                </button>
              </div>

              {profitMode === 'custom_profit' && (
                <div style={{ marginTop: '10px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    জমা দেওয়া মোট ক্যাশের মধ্যে নিট লাভ কত টাকা (৳)?
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={customProfitInput}
                    onChange={(e) => setCustomProfitInput(e.target.value)}
                    placeholder="যেমন: 800 (খালি রাখলে ০ ধরা হবে)"
                    style={{
                      maxWidth: '280px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #94a3b8',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Seller, Date, and Title */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
              জমা দানকারী / বিক্রেতা
              <select
                value={sellerInput}
                onChange={(e) => setSellerInput(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                }}
              >
                <option value="Rakib">রাকিব (Rakib)</option>
                <option value="Limon">লিমন (Limon)</option>
              </select>
            </label>

            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
              তারিখ
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                }}
              />
            </label>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
              ক্যাশ জমার বিবরণ / শিরোনাম
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="বেচা-কেনার পর এককালীন নগদ ক্যাশ জমা (প্রডাক্ট ছাড়া)"
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                }}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {TITLE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitleInput(preset)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: titleInput === preset ? '#e2e8f0' : '#f8fafc',
                    color: '#334155',
                    fontSize: '0.73rem',
                    cursor: 'pointer',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview before submitting */}
          {parsedAmount > 0 && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '1px solid #86efac',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 700 }}>
                  জমার পর নতুন ক্যাশ ব্যালান্স হবে:
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#14532d' }}>
                  {money(availableCash)} + {money(balanceAddition)} ={' '}
                  {money(availableCash + balanceAddition)}
                </div>
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #86efac',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Package size={15} />
                <span>স্টক পরিবর্তন: ০ পিস (কোনো প্রডাক্ট কমবে না)</span>
              </div>
            </div>
          )}

          {localError && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '0.84rem',
                fontWeight: 600,
              }}
            >
              {localError}
            </div>
          )}

          {localSuccess && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                color: '#065f46',
                fontSize: '0.84rem',
                fontWeight: 700,
              }}
            >
              {localSuccess}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="primary"
              disabled={submitting || parsedAmount <= 0}
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                padding: '12px 22px',
                fontSize: '0.95rem',
                fontWeight: 800,
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={18} />
              <span>
                {submitting
                  ? 'ক্যাশ জমা হচ্ছে…'
                  : `প্রডাক্ট সেল ছাড়া ${parsedAmount > 0 ? money(parsedAmount) : ''} ক্যাশ জমা দিন`}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Recent Non-Product Cash Deposits List */}
      {showHistory && (
        <div
          style={{
            marginTop: '14px',
            padding: '14px',
            borderRadius: '12px',
            background: '#ffffff',
            border: '1px solid #a7f3d0',
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
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#064e3b' }}>
              📋 প্রডাক্ট ছাড়া জমা দেওয়া ক্যাশের তালিকা ({toBengaliNumerals(recentCashDeposits.length)}টি)
            </h4>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              বন্ধ করুন ✕
            </button>
          </div>

          {recentCashDeposits.length === 0 ? (
            <div
              style={{
                padding: '18px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '0.84rem',
                background: '#f8fafc',
                borderRadius: '8px',
              }}
            >
              এখনো প্রডাক্ট ছাড়া সরাসরি কোনো ক্যাশ জমা দেওয়া হয়নি।
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {recentCashDeposits.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      📅 {dateLabel(item.date)} • 👤{' '}
                      {item.seller === 'Limon'
                        ? 'লিমন (Limon)'
                        : item.seller === 'Rakib'
                        ? 'রাকিব (Rakib)'
                        : item.seller || 'অ্যাডমিন'}{' '}
                      •{' '}
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        {item.type === 'sale' ? 'বিক্রয় ও ব্যালেন্সে জমা' : 'শুধু ক্যাশ ব্যালেন্সে জমা'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#059669' }}>
                      +{money(item.amount)}
                    </span>
                    {isFullAdmin && onDeleteDeposit && (
                      <button
                        type="button"
                        onClick={() => onDeleteDeposit(item.id, item.title)}
                        title="মুছে ফেলুন"
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          background: '#fef2f2',
                          color: '#dc2626',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={14} />
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
