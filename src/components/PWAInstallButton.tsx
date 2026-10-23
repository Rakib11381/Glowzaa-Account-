import React, { useState, useEffect } from 'react';
import { Download, Smartphone, CheckCircle2, Copy, X, Sparkles, ShieldCheck, Github, AlertCircle } from 'lucide-react';

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
            style={{ maxWidth: '620px', width: '95%' }}
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
                    ১০০% ফ্রি-তে Android অ্যাপ ও APK ডাউনলোড গাইড
                  </h3>
                  <small style={{ color: '#94a3b8', fontSize: '12px' }}>
                    কোনো পেইড ওয়েবসাইট ছাড়াই সরাসরি ফোনে ইনস্টল অথবা GitHub থেকে ফ্রি APK ডাউনলোড করুন
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
              {/* Method 1: Direct 1-Click Chrome Install (No third party website needed) */}
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
                    <span>পদ্ধতি ১: কোনো ওয়েবসাইট ছাড়াই ফোনে সরাসরি ইনস্টল (১০০% ফ্রি)</span>
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
                    ০ টাকা / ১ মিনিট
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '13px', color: '#134e4a', lineHeight: 1.55 }}>
                  কোনো থার্ড-পার্টি ওয়েবসাইটে যাওয়ার প্রয়োজন নেই! আপনার ফোনের <b>Google Chrome</b> ব্রাউজার নিজেই এটিকে আসল Android অ্যাপ হিসেবে ইনস্টল করে দেবে:
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
                    <span>এখনই ১-ক্লিকে ফোনে অ্যাপ ইনস্টল করুন</span>
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
                    <div><b>মোবাইলে সরাসরি ইনস্টল করার ধাপ:</b></div>
                    <ol style={{ margin: '6px 0 0', paddingLeft: '18px', lineHeight: 1.6 }}>
                      <li>ফোনের <b>Google Chrome</b> ব্রাউজারে আপনার অ্যাপের লিংকটি ওপেন করুন।</li>
                      <li>উপরের ডান কোণায় <b>৩-ডট (⋮) মেনুতে</b> ট্যাপ করুন।</li>
                      <li><b>"Install app"</b> অথবা <b>"Add to Home screen"</b>-এ চাপ দিন—সাথে সাথে ফোনে <b>Glowzaa Shop</b> অ্যাপ ইনস্টল হয়ে যাবে!</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Method 2: Built-in GitHub Actions Free APK Generator */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f2438', fontWeight: 700, fontSize: '14.5px' }}>
                    <Github size={18} style={{ color: '#0f172a' }} />
                    <span>পদ্ধতি ২: GitHub থেকে অটোমেটিক `.apk` ফাইল ডাউনলোড (১০০% ফ্রি)</span>
                  </div>
                  <span
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontWeight: 700,
                    }}
                  >
                    প্রজেক্টে সেটআপ করা আছে
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '12.5px', color: '#334155', lineHeight: 1.55 }}>
                  থার্ড-পার্টি সাইটগুলো (যেমন WebIntoApp) এখন টাকা চায়। তাই আপনার এই প্রজেক্টের ভেতরেই আমরা একটি স্বয়ংক্রিয় <b>Android APK Builder</b> (<code>.github/workflows/build-apk.yml</code>) যুক্ত করে দিয়েছি!
                </p>

                <div
                  style={{
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    borderLeft: '3px solid #2563eb',
                    fontSize: '12.5px',
                  }}
                >
                  <b>ফ্রি-তে `.apk` ফাইল পাওয়ার ৪টি সহজ ধাপ:</b>
                  <ol style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#334155', lineHeight: 1.65 }}>
                    <li>উপরের ডান দিক থেকে প্রজেক্টটি আপনার <b>GitHub</b> অ্যাকাউন্টে এক্সপোর্ট/আপলোড করুন (Repository-টি <b>Public</b> রাখলে আজীবন সম্পূর্ণ ফ্রি)।</li>
                    <li>আপনার GitHub Repository-তে গিয়ে উপরের <b>"Actions"</b> ট্যাবে ক্লিক করুন।</li>
                    <li>সেখানে <b>"Build Android APK (Glowzaa Shop)"</b> অটোমেটিক চালু হবে (২-৩ মিনিট সময় নেবে)।</li>
                    <li>সবুজ টিক চিহ্ন আসলে নিচে স্ক্রল করে <b>Artifacts</b> সেকশন থেকে <b><code>Glowzaa-Shop-Android-APK</code></b> ক্লিক করলেই আসল <code>.apk</code> ফাইল ডাউনলোড হয়ে যাবে!</li>
                  </ol>
                </div>
              </div>

              {/* Note on why third-party sites failed */}
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  fontSize: '12px',
                  color: '#92400e',
                  lineHeight: 1.55,
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#d97706' }} />
                <div>
                  <b>কেন অন্য ওয়েবসাইটগুলো কাজ করেনি?</b>
                  <div>
                    ১. <b>WebIntoApp</b>-এর মতো সাইটগুলো এখন ফ্রি-তে APK ডাউনলোড বন্ধ করে পেইড করে ফেলেছে।<br />
                    ২. <b>PWABuilder.com</b> ১০০% ফ্রি (মাইক্রোসফটের), কিন্তু এটি AI Studio-এর টেম্পোরারি প্রিভিউ লিংকে কাজ করে না—আগে GitHub থেকে <b>Vercel.com</b> বা <b>Netlify.com</b>-এ ফ্রি হোস্ট করে সেই লিংকটি দিলে কাজ করে।
                  </div>
                </div>
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
                  আপনার বর্তমান অ্যাপ লিংক (মোবাইল Chrome-এ ওপেন করার জন্য):
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
