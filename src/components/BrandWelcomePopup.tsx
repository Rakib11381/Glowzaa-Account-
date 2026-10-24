import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Sparkles, ShieldCheck, X } from 'lucide-react';

interface BrandWelcomePopupProps {
  open: boolean;
  brandText?: string;
  shopName?: string;
  onClose: () => void;
}

export default function BrandWelcomePopup({
  open,
  brandText = 'Glowzaa এটা ব্রান্ড',
  shopName = 'Glowzaa Shop',
  onClose,
}: BrandWelcomePopupProps) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsClosing(false);
      return;
    }

    // Auto close smoothly after 4.2 seconds so it feels effortless on website entry
    const timer = setTimeout(() => {
      handleTriggerClose();
    }, 4200);

    return () => clearTimeout(timer);
  }, [open]);

  function handleTriggerClose() {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 320);
  }

  if (!open) return null;

  return (
    <div
      className={`brand-popup-backdrop ${isClosing ? 'closing' : ''}`}
      onClick={handleTriggerClose}
      role="dialog"
      aria-modal="true"
      aria-label={brandText}
    >
      <div
        className={`brand-popup-card ${isClosing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Decorative Glow Orbs */}
        <div className="brand-popup-orb orb-1" aria-hidden="true" />
        <div className="brand-popup-orb orb-2" aria-hidden="true" />
        <div className="brand-popup-shimmer-line" aria-hidden="true" />

        {/* Close Button */}
        <button
          type="button"
          className="brand-popup-close"
          onClick={handleTriggerClose}
          aria-label="বন্ধ করুন"
          title="বন্ধ করুন"
        >
          <X size={18} />
        </button>

        {/* Animated Emblem / Crest */}
        <div className="brand-popup-crest-wrap">
          <div className="brand-popup-crest-ring ring-outer" />
          <div className="brand-popup-crest-ring ring-inner" />
          <div className="brand-popup-crest-icon">
            <Award size={36} className="brand-crest-main-svg" />
            <Sparkles size={16} className="brand-crest-sparkle-svg" />
          </div>
        </div>

        {/* Official Brand Kicker */}
        <div className="brand-popup-kicker">
          <ShieldCheck size={14} />
          <span>OFFICIAL VERIFIED BRAND</span>
        </div>

        {/* Main Animated Brand Statement: "Glowzaa এটা ব্রান্ড" */}
        <h2 className="brand-popup-headline">
          {brandText || 'Glowzaa এটা ব্রান্ড'}
        </h2>

        <p className="brand-popup-subtitle">
          আস্থা, সততা ও প্রিমিয়াম কোয়ালিটির এক অনন্য নাম — <b>{shopName}</b>
        </p>

        {/* 3 Feature Trust Pillars */}
        <div className="brand-popup-pillars">
          <div className="brand-pillar-item">
            <CheckCircle2 size={14} />
            <span>১০০% অরিজিনাল</span>
          </div>
          <div className="brand-pillar-item">
            <CheckCircle2 size={14} />
            <span>প্রিমিয়াম কোয়ালিটি</span>
          </div>
          <div className="brand-pillar-item">
            <CheckCircle2 size={14} />
            <span>বিশ্বস্ত ব্র্যান্ড</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          className="brand-popup-enter-btn"
          onClick={handleTriggerClose}
        >
          <Sparkles size={16} />
          <span>ওয়েবসাইটে প্রবেশ করুন</span>
        </button>

        {/* Auto-dismiss Progress Bar */}
        <div className="brand-popup-timer-track" aria-hidden="true">
          <div className="brand-popup-timer-fill" />
        </div>
      </div>
    </div>
  );
}
