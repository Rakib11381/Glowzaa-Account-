import React, { useState, useEffect } from 'react';
import { Download, Smartphone, CheckCircle2, Copy, ExternalLink, X, Sparkles, ShieldCheck } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-pre-xefuxj7pslkxhdmuajs5y3-322659445850.asia-southeast1.run.app';

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(appUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="topbar-bell-btn"
          title="অ্যান্ড্রয়েড অ্যাপ (Android APK / PWA) ইনস্টল ও ডাউনলোড গাইড"
          style={{
            width: 'auto',
            padding: '0 10px',
            gap: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            background: isInstalled ? '#f0fdf4' : 'linear-gradient(135deg, #0d9488, #0f766e)',
            color: isInstalled ? '#15803d' : '#ffffff',
            border: isInstalled ? '1px solid #bbf7d0' : 'none',
            fontWeight: 700,
            fontSize: '12px',
          }}
        >
          <Smartphone size={15} />
          <span className="hide-on-very-small">
            {isInstalled ? 'অ্যাপ ইনস্টলড' : 'Android অ্যাপ'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="nav"
          style={{
            background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.16), rgba(13, 148, 136, 0.08))',
            border: '1px solid rgba(45, 212, 191, 0.35)',
            color: '#2dd4bf',
            fontWeight: 700,
            marginTop: '6px',
          }}
        >
          <Smartphone size={18} />
          <span>অ্যান্ড্রয়েড অ্যাপ (APK/PWA)</span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowGuideModal(false)}
          style={{ zIndex: 9999 }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px', width: '95%' }}
          >
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #091e32, #0d3251)', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(45, 212, 191, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2dd4bf',
                  }}
                >
                  <Smartphone size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', color: '#fff' }}>
                    ওয়েব থেকে Android অ্যাপ বানানোর ও ইনস্টল করার উপায়
                  </h3>
                  <small style={{ color: '#94a3b8', fontSize: '12px' }}>
                    Glowzaa Shop ইতিমধ্যে পূর্ণাঙ্গ PWA (Progressive Web App) হিসেবে কনফিগার করা হয়েছে
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowGuideModal(false)}
                style={{ color: '#fff', background: 'rgba(255,255,255,0.1)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'grid', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
              {/* Direct 1-Click PWA Install Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)',
                  border: '1px solid #5eead4',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f766e', fontWeight: 700, fontSize: '14.5px' }}>
                    <Sparkles size={18} />
                    <span>পদ্ধতি ১: সরাসরি ফোনে অ্যাপ হিসেবে ইনস্টল (সবচেয়ে সহজ)</span>
                  </div>
                  <span
                    style={{
                      background: '#0d9488',
                      color: '#fff',
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontWeight: 700,
                    }}
                  >
                    ১০০% রেডি
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '13px', color: '#134e4a', lineHeight: 1.55 }}>
                  এই ওয়েবসাইটটিতে <b>PWA (Progressive Web App)</b> প্রযুক্তি যুক্ত করা হয়েছে। কোনো কোডিং ছাড়াই আপনার Android ফোনের <b>Chrome ব্রাউজার</b> থেকে সরাসরি অ্যাপ হিসেবে হোমস্ক্রিনে ইনস্টল করতে পারবেন:
                </p>

                {deferredPrompt ? (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="primary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: '#0d9488',
                      padding: '11px 16px',
                      fontSize: '14px',
                      fontWeight: 700,
                    }}
                  >
                    <Download size={18} />
                    <span>এখনই ১-ক্লিকে অ্যাপ ইনস্টল করুন</span>
                  </button>
                ) : (
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '12.5px',
                      color: '#334155',
                      border: '1px solid #99f6e4',
                    }}
                  >
                    <div><b>মোবাইলে ইনস্টল করার ধাপ:</b></div>
                    <ol style={{ margin: '6px 0 0', paddingLeft: '18px', lineHeight: 1.6 }}>
                      <li>ফোনের <b>Google Chrome</b> ব্রাউজারে নিচের অ্যাপ লিংকটি ওপেন করুন।</li>
                      <li>উপরের ডান পাশের <b>৩-ডট (⋮) মেনুতে</b> ট্যাপ করুন।</li>
                      <li><b>"Install app"</b> অথবা <b>"Add to Home screen"</b>-এ ক্লিক করুন।</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Copy App Link Box */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  আপনার লাইভ অ্যাপ লিংক (APK বানানোর জন্য এই লিংকটি কপি করুন):
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    readOnly
                    value={appUrl}
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#0f172a',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="primary"
                    style={{
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copiedUrl ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                    <span>{copiedUrl ? 'কপি হয়েছে!' : 'লিংক কপি'}</span>
                  </button>
                </div>
              </div>

              {/* Method 2: Generate Installable APK via PWABuilder / WebIntoApp */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f2438', fontWeight: 700, fontSize: '14.5px' }}>
                  <ShieldCheck size={18} style={{ color: '#2563eb' }} />
                  <span>পদ্ধতি ২: সরাসরি Android `.apk` ফাইল তৈরি (২ মিনিটে ফ্রিতে)</span>
                </div>

                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: 1.55 }}>
                  আপনি যদি মেমোরি কার্ড বা হোয়াটসঅ্যাপে শেয়ার করার মতো <b>.apk ফাইল</b> চান, তাহলে নিচের যেকোনো একটি ফ্রি ওয়েবসাইটে গিয়ে উপরের কপি করা লিংকটি পেস্ট করলেই <b>Glowzaa Shop.apk</b> ডাউনলোড হয়ে যাবে:
                </p>

                <div style={{ display: 'grid', gap: '8px', fontSize: '12.5px' }}>
                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      borderLeft: '3px solid #2563eb',
                    }}
                  >
                    <b>১. PWABuilder.com (Microsoft-এর অফিসিয়াল টুল - সেরা):</b>
                    <ol style={{ margin: '4px 0 0', paddingLeft: '18px', color: '#334155', lineHeight: 1.55 }}>
                      <li><b>pwabuilder.com</b> ওয়েবসাইটে যান।</li>
                      <li>বক্সে আপনার অ্যাপ লিংকটি পেস্ট করে <b>Start</b> বাটনে চাপুন।</li>
                      <li><b>Package for Stores</b> → <b>Android</b> → <b>Download Package</b> ক্লিক করলে সাথে সাথে <code>.apk</code> এবং Play Store-এর <code>.aab</code> ফাইল পেয়ে যাবেন!</li>
                    </ol>
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      borderLeft: '3px solid #0d9488',
                    }}
                  >
                    <b>২. WebIntoApp.com (সরাসরি APK জেনারেটর):</b>
                    <ol style={{ margin: '4px 0 0', paddingLeft: '18px', color: '#334155', lineHeight: 1.55 }}>
                      <li><b>webintoapp.com</b>-এ গিয়ে আপনার অ্যাপ লিংক ও নাম <b>Glowzaa Shop</b> দিন।</li>
                      <li><b>Make App</b> ক্লিক করলেই রেডিমেড Android APK ফাইল ডাউনলোড হয়ে যাবে।</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowGuideModal(false)}
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default PWAInstallButton;
