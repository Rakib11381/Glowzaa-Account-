import React, { useEffect, useState } from 'react';
import {
  Mail,
  BellRing,
  CheckCircle2,
  Send,
  AlertTriangle,
  Eye,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  X,
  Sliders,
} from 'lucide-react';
import {
  getEmailTriggerConfig,
  loadEmailTriggerConfigFromDb,
  saveEmailTriggerConfig,
  fetchBackendEmailHistory,
  subscribeEmailLogs,
  triggerBackendEmailSummary,
} from '../data';
import { moneyBn, toBengaliNumerals } from '../accounting';
import type { EmailTriggerConfig, EmailNotificationLog } from '../types';

interface EmailNotificationSectionProps {
  currentActorName: string;
  currentActorUid: string;
}

const THRESHOLD_PRESETS = [3000, 5000, 10000, 20000];

export default function EmailNotificationSection({
  currentActorName,
  currentActorUid,
}: EmailNotificationSectionProps) {
  const [config, setConfig] = useState<EmailTriggerConfig>(() => getEmailTriggerConfig());
  const [logs, setLogs] = useState<EmailNotificationLog[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testingType, setTestingType] = useState<'test_summary' | 'high_value_withdrawal_request' | null>(null);
  const [refreshingLogs, setRefreshingLogs] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [previewLog, setPreviewLog] = useState<EmailNotificationLog | null>(null);

  useEffect(() => {
    let mounted = true;
    loadEmailTriggerConfigFromDb().then((loaded) => {
      if (mounted) setConfig(loaded);
    });
    fetchBackendEmailHistory().then(({ logs: histLogs, smtpConfigured: smtpOk }) => {
      if (mounted) {
        setLogs(histLogs);
        setSmtpConfigured(smtpOk);
      }
    });
    const unsub = subscribeEmailLogs((updated) => {
      if (mounted) setLogs(updated);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveEmailTriggerConfig(config, currentActorUid);
      setConfig(saved);
      setFeedback({
        type: 'ok',
        text: 'ইমেইল ট্রিগার ও সতর্কতা সেটিংস সফলভাবে সংরক্ষিত হয়েছে!',
      });
    } catch {
      setFeedback({
        type: 'err',
        text: 'সেটিংস সংরক্ষণ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async (mode: 'test_summary' | 'high_value_withdrawal_request') => {
    setTestingType(mode);
    setFeedback(null);
    try {
      const savedCfg = await saveEmailTriggerConfig(config, currentActorUid);
      setConfig(savedCfg);

      const isHighVal = mode === 'high_value_withdrawal_request';
      const testAmount = isHighVal ? Math.max(savedCfg.highValueWithdrawalThreshold, 10000) : 4500;

      const log = await triggerBackendEmailSummary({
        eventType: mode,
        title: isHighVal
          ? `জরুরি পার্টনার উত্তোলন অনুরোধ (পরীক্ষামূলক অ্যালার্ট)`
          : `দৈনিক লেনদেন ও ক্যাশ ব্যালান্স সারাংশ (পরীক্ষামূলক)`,
        entryType: isHighVal ? 'withdrawal' : 'sale',
        amount: testAmount,
        actorName: currentActorName || 'রাকিব (Rakib)',
        partnerName: currentActorName || 'রাকিব (Rakib)',
        category: isHighVal ? 'পার্টনার উত্তোলন' : 'পণ্য বিক্রয়',
        reason: isHighVal
          ? `উচ্চ-মূল্যের উত্তোলন সীমা (${moneyBn(savedCfg.highValueWithdrawalThreshold)}) অতিক্রম করায় স্বয়ংক্রিয় সতর্কতা ইমেইল ট্রিগার হয়েছে।`
          : 'নতুন লেনদেন পোস্ট হওয়ার পর রাকিব ও লিমনের কাছে স্বয়ংক্রিয় ইমেইল সারাংশ প্রেরণ।',
        notes: 'ব্যাকএন্ড ইমেইল ট্রিগার সিস্টেম পরীক্ষা করা হয়েছে।',
      });

      if (log) {
        setFeedback({
          type: 'ok',
          text: `রাকিব (${savedCfg.rakibEmail}) ও লিমন (${savedCfg.limonEmail})-এর উদ্দেশ্যে ইমেইল সারাংশ সফলভাবে ট্রিগার হয়েছে! নিচে প্রিভিউ দেখুন।`,
        });
        setPreviewLog(log);
      } else {
        setFeedback({
          type: 'err',
          text: 'এই ইভেন্টের জন্য ইমেইল নোটিফিকেশন টগল বন্ধ রয়েছে। অনুগ্রহ করে টগল চালু করুন।',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: (err as Error).message || 'ইমেইল ট্রিগার করতে সমস্যা হয়েছে।',
      });
    } finally {
      setTestingType(null);
    }
  };

  const handleRefreshHistory = async () => {
    setRefreshingLogs(true);
    try {
      const { logs: histLogs, smtpConfigured: smtpOk } = await fetchBackendEmailHistory();
      setLogs(histLogs);
      setSmtpConfigured(smtpOk);
    } finally {
      setRefreshingLogs(false);
    }
  };

  return (
    <div className="email-trigger-wrapper">
      <div className="email-trigger-card">
        {/* Card Header */}
        <div className="email-trigger-header">
          <div className="email-trigger-title-group">
            <div className="email-trigger-icon">
              <Mail size={22} />
            </div>
            <div className="email-trigger-heading-wrap">
              <div className="email-trigger-title-row">
                <h3>স্বয়ংক্রিয় ইমেইল সারাংশ ও উচ্চ-মূল্যের উত্তোলন সতর্কতা</h3>
              </div>
              <p className="email-trigger-desc">
                যখনই কোনো নতুন লেনদেন চূড়ান্ত (Posted) হবে অথবা নির্ধারিত সীমার বেশি টাকার উত্তোলন/লোনের অনুরোধ তৈরি হবে, ব্যাকএন্ড সার্ভার স্বয়ংক্রিয়ভাবে <b>রাকিব (Rakib)</b> এবং <b>লিমন (Limon)</b>-কে তাৎক্ষণিক আর্থিক সারাংশসহ ইমেইল পাঠাবে।
              </p>
            </div>
          </div>

          <div className="email-trigger-badges">
            <span className="email-badge teal">
              <BellRing size={13} />
              <span>সক্রিয় ব্যাকএন্ড ট্রিগার</span>
            </span>
            <span className={`email-badge ${smtpConfigured ? 'emerald' : 'sky'}`}>
              <CheckCircle2 size={13} />
              <span>{smtpConfigured ? 'কাস্টম SMTP সংযুক্ত' : 'অটো ব্যাকএন্ড রিলে সক্রিয়'}</span>
            </span>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className={`email-feedback-banner ${feedback.type}`}>
            <div className="email-feedback-content">
              {feedback.type === 'ok' ? (
                <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              ) : (
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="email-feedback-close"
              aria-label="বার্তা বন্ধ করুন"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={handleSaveConfig} className="email-config-form">
          <div className="email-recipient-grid">
            <div className="email-field-box">
              <label className="email-field-label" htmlFor="rakib-email-input">
                <span>রাকিব (Rakib)-এর ইমেইল</span>
                <span className="email-field-tag partner">পার্টনার ১</span>
              </label>
              <input
                id="rakib-email-input"
                type="email"
                required
                value={config.rakibEmail}
                onChange={(e) => setConfig({ ...config, rakibEmail: e.target.value })}
                placeholder="rakib@glowzaa.shop"
                className="email-field-input"
              />
            </div>

            <div className="email-field-box">
              <label className="email-field-label" htmlFor="limon-email-input">
                <span>লিমন (Limon)-এর ইমেইল</span>
                <span className="email-field-tag partner">পার্টনার ২</span>
              </label>
              <input
                id="limon-email-input"
                type="email"
                required
                value={config.limonEmail}
                onChange={(e) => setConfig({ ...config, limonEmail: e.target.value })}
                placeholder="limon@glowzaa.shop"
                className="email-field-input"
              />
            </div>

            <div className="email-field-box">
              <label className="email-field-label" htmlFor="cc-email-input">
                <span>অতিরিক্ত সিসি (CC) ইমেইল</span>
                <span className="email-field-tag">ঐচ্ছিক</span>
              </label>
              <input
                id="cc-email-input"
                type="email"
                value={config.ccEmail || ''}
                onChange={(e) => setConfig({ ...config, ccEmail: e.target.value })}
                placeholder="audit@glowzaa.shop"
                className="email-field-input"
              />
            </div>
          </div>

          {/* High-Value Withdrawal Threshold Box */}
          <div className="email-threshold-card">
            <div className="email-threshold-info">
              <div className="email-threshold-title">
                <ShieldAlert size={18} />
                <span>উচ্চ-মূল্যের উত্তোলন সতর্কতা সীমা (High-Value Withdrawal Threshold)</span>
              </div>
              <p className="email-threshold-desc">
                এই টাকার সমান বা বেশি পরিমাণের কোনো উত্তোলন বা পার্টনার লোনের অনুরোধ তৈরি হলেই উভয় পার্টনারের কাছে জরুরি সতর্কতা ইমেইল যাবে।
              </p>
            </div>

            <div className="email-threshold-controls">
              <div className="email-threshold-input-wrap">
                <span className="email-threshold-currency">৳</span>
                <input
                  type="number"
                  min={100}
                  step={500}
                  required
                  value={config.highValueWithdrawalThreshold}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      highValueWithdrawalThreshold: Math.max(100, Number(e.target.value) || 0),
                    })
                  }
                  className="email-threshold-input"
                  aria-label="উচ্চ-মূল্যের উত্তোলন সতর্কতা সীমা"
                />
              </div>

              <div className="email-preset-group">
                {THRESHOLD_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, highValueWithdrawalThreshold: preset })
                    }
                    className={`email-preset-btn ${
                      config.highValueWithdrawalThreshold === preset ? 'active' : ''
                    }`}
                  >
                    {moneyBn(preset)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Trigger Toggles */}
          <div className="email-toggle-grid">
            <label
              className={`email-toggle-card ${
                config.notifyOnTransactionPosted ? 'checked-teal' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={config.notifyOnTransactionPosted}
                onChange={(e) =>
                  setConfig({ ...config, notifyOnTransactionPosted: e.target.checked })
                }
                className="email-toggle-checkbox"
              />
              <div className="email-toggle-body">
                <span className="email-toggle-title">
                  নতুন লেনদেন পোস্টেড হলে ইমেইল সারাংশ
                </span>
                <span className="email-toggle-sub">
                  বিক্রয়, ক্রয়, খরচ, বিনিয়োগ বা উত্তোলন চূড়ান্ত (Posted) হওয়া মাত্রই ব্যালান্সসহ ইমেইল যাবে।
                </span>
              </div>
            </label>

            <label
              className={`email-toggle-card ${
                config.notifyOnHighValueWithdrawal ? 'checked-amber' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={config.notifyOnHighValueWithdrawal}
                onChange={(e) =>
                  setConfig({ ...config, notifyOnHighValueWithdrawal: e.target.checked })
                }
                className="email-toggle-checkbox"
              />
              <div className="email-toggle-body">
                <span className="email-toggle-title">
                  উচ্চ-মূল্যের উত্তোলন অনুরোধে তাৎক্ষণিক অ্যালার্ট
                </span>
                <span className="email-toggle-sub">
                  {moneyBn(config.highValueWithdrawalThreshold)} বা তার বেশি উত্তোলন/লোনের অনুরোধ তৈরি হলেই জরুরি ইমেইল যাবে।
                </span>
              </div>
            </label>

            <label
              className={`email-toggle-card ${
                config.notifyOnAllTransactionRequests ? 'checked-teal' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={config.notifyOnAllTransactionRequests}
                onChange={(e) =>
                  setConfig({ ...config, notifyOnAllTransactionRequests: e.target.checked })
                }
                className="email-toggle-checkbox"
              />
              <div className="email-toggle-body">
                <span className="email-toggle-title">
                  যেকোনো লেনদেনের অনুমোদন অনুরোধেই ইমেইল
                </span>
                <span className="email-toggle-sub">
                  যেকোনো নতুন লেনদেন ওয়েটিং ফর অ্যাপ্রুভালে জমা পড়লেই অপর পার্টনারকে ইমেইলে জানানো হবে।
                </span>
              </div>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="email-actions-bar">
            <button type="submit" disabled={saving} className="primary">
              <Sliders size={16} />
              <span>{saving ? 'সংরক্ষণ হচ্ছে…' : 'ইমেইল ট্রিগার সেটিংস সংরক্ষণ করুন'}</span>
            </button>

            <div className="email-test-actions">
              <button
                type="button"
                disabled={testingType !== null}
                onClick={() => handleSendTest('test_summary')}
                className="secondary"
              >
                <Send size={15} />
                <span>
                  {testingType === 'test_summary'
                    ? 'পাঠানো হচ্ছে…'
                    : 'টেস্ট লেনদেন সারাংশ ইমেইল পাঠান'}
                </span>
              </button>

              <button
                type="button"
                disabled={testingType !== null}
                onClick={() => handleSendTest('high_value_withdrawal_request')}
                className="email-amber-btn"
              >
                <AlertTriangle size={15} />
                <span>
                  {testingType === 'high_value_withdrawal_request'
                    ? 'অ্যালার্ট পাঠানো হচ্ছে…'
                    : 'টেস্ট উচ্চ-মূল্যের উত্তোলন অ্যালার্ট'}
                </span>
              </button>
            </div>
          </div>
        </form>

        {/* Sent Email Summaries Log */}
        <div className="email-logs-section">
          <div className="email-logs-head">
            <div>
              <h4>
                📬 সাম্প্রতিক পাঠানো ইমেইল সারাংশ ও অ্যালার্ট লগ ({toBengaliNumerals(logs.length)}টি)
              </h4>
              <p>
                রাকিব ও লিমনের কাছে ব্যাকএন্ড থেকে পাঠানো প্রতিটি ইমেইলের রেকর্ড ও সম্পূর্ণ HTML প্রিভিউ
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefreshHistory}
              disabled={refreshingLogs}
              className="secondary"
              style={{ minHeight: '36px', padding: '6px 12px', fontSize: '12.5px' }}
            >
              <RefreshCw size={14} />
              <span>{refreshingLogs ? 'লোড হচ্ছে…' : 'রিফ্রেশ'}</span>
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="email-logs-empty">
              এখনো কোনো ইমেইল সারাংশ ট্রিগার হয়নি। নতুন লেনদেন পোস্ট করলে বা উপরের{' '}
              <b>"টেস্ট লেনদেন সারাংশ ইমেইল পাঠান"</b> বাটনে চাপ দিলে এখানে সাথে সাথে রেকর্ড ও প্রিভিউ দেখা যাবে।
            </div>
          ) : (
            <div className="email-logs-list">
              {logs.slice(0, 15).map((item) => {
                const isHighWithdrawal = item.eventType === 'high_value_withdrawal_request';
                return (
                  <div
                    key={item.id}
                    className={`email-log-item ${isHighWithdrawal ? 'high-alert' : ''}`}
                  >
                    <div className="email-log-main">
                      <div className="email-log-badges">
                        <span
                          className={`email-log-tag ${
                            isHighWithdrawal
                              ? 'high'
                              : item.eventType === 'test_summary'
                              ? 'test'
                              : 'posted'
                          }`}
                        >
                          {isHighWithdrawal
                            ? '🚨 উচ্চ-মূল্যের উত্তোলন অ্যালার্ট'
                            : item.eventType === 'test_summary'
                            ? '🧪 পরীক্ষামূলক ইমেইল সারাংশ'
                            : '✅ লেনদেন পোস্টেড সারাংশ'}
                        </span>
                        <span className="email-log-time">🕒 {item.sentAtFormatted}</span>
                        <span className="email-log-amount">পরিমাণ: {moneyBn(item.amount)}</span>
                      </div>

                      <div className="email-log-subject">{item.subject}</div>

                      <div className="email-log-meta">
                        <span>
                          <b>প্রাপক:</b> {(item.recipients || []).join(', ')}
                        </span>
                        <span>
                          <b>ট্রিগারকারী:</b> {item.actorName}
                        </span>
                      </div>
                    </div>

                    <div className="email-log-actions">
                      {item.previewUrl && (
                        <a
                          href={item.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="secondary"
                          style={{ minHeight: '36px', padding: '6px 12px', fontSize: '12px' }}
                        >
                          <ExternalLink size={14} />
                          <span>ওয়েব মেইলবক্স</span>
                        </a>
                      )}
                      {item.htmlContent && (
                        <button
                          type="button"
                          onClick={() => setPreviewLog(item)}
                          className="secondary"
                          style={{ minHeight: '36px', padding: '6px 12px', fontSize: '12px' }}
                        >
                          <Eye size={14} />
                          <span>ইমেইল প্রিভিউ দেখুন</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal to Preview Exact Sent HTML Email */}
      {previewLog && (
        <div className="modal-backdrop" onClick={() => setPreviewLog(null)}>
          <div
            className="modal"
            style={{ maxWidth: '680px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>📧 পাঠানো ইমেইল সারাংশের প্রিভিউ</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPreviewLog(null)}
                aria-label="প্রিভিউ বন্ধ করুন"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-content-area">
              <div className="modal-body">
                <div className="email-preview-meta-card">
                  <div>
                    <span style={{ fontWeight: 700, color: '#475569' }}>বিষয় (Subject): </span>
                    <b style={{ color: '#0f172a' }}>{previewLog.subject}</b>
                  </div>
                  <div>
                    <span style={{ fontWeight: 700, color: '#475569' }}>
                      প্রাপক (To Rakib & Limon):{' '}
                    </span>
                    <b style={{ color: '#0f766e' }}>
                      {(previewLog.recipients || []).join(', ')}
                    </b>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: '#475569' }}>পাঠানোর সময়: </span>
                      <span style={{ color: '#1e293b' }}>{previewLog.sentAtFormatted}</span>
                    </div>
                    {previewLog.previewUrl && (
                      <a
                        href={previewLog.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-btn"
                        style={{ fontSize: '12px', padding: 0 }}
                      >
                        <ExternalLink size={13} /> টেস্ট মেইলবক্সে খুলুন
                      </a>
                    )}
                  </div>
                </div>

                {previewLog.htmlContent ? (
                  <div
                    className="email-preview-frame"
                    dangerouslySetInnerHTML={{ __html: previewLog.htmlContent }}
                  />
                ) : (
                  <div className="empty">ইমেইল বডি সংরক্ষিত নেই।</div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setPreviewLog(null)}
                  >
                    বন্ধ করুন
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
