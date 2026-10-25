import React from 'react';
import {
  ShieldCheck,
  FileCheck2,
  Lock,
  TrendingUp,
  Banknote,
  CalendarClock,
  Users,
  CheckCircle2,
  Edit3,
  AlertCircle,
} from 'lucide-react';

interface TermsConditionsCardProps {
  compact?: boolean;
  currentAdminName?: string;
  partnerName?: string;
}

export interface TermRuleItem {
  id: number;
  title: string;
  exactText: string;
  tag: string;
  tagColor: 'teal' | 'amber' | 'red' | 'blue' | 'purple' | 'emerald';
  icon: React.ReactNode;
}

export const PARTNERSHIP_TERMS_LIST: TermRuleItem[] = [
  {
    id: 1,
    title: 'ডেটা এন্ট্রিতে অনুমোদন ও স্বচ্ছতা',
    exactText: 'এপসে যে কোনো ডেটা এন্ট্রির ক্ষেত্রে স্বচ্ছতা ও অংশীদারী অনুমোদন নীতিমালা অনুসরণ করা হবে।',
    tag: 'স্বচ্ছ হিসাবরক্ষণ',
    tagColor: 'teal',
    icon: <FileCheck2 size={18} />,
  },
  {
    id: 2,
    title: 'ভুল ডেটা ডিলিট বা এডিট নীতি',
    exactText: 'কোনো ডেটা ভুল হলে তা ডিলিট বা ইডিট করার ক্ষেত্রে নির্ধারিত নিরাপত্তা ও অনুমোদন প্রক্রিয়া প্রযোজ্য হবে।',
    tag: 'সংশোধন ও ডিলিট সুরক্ষা',
    tagColor: 'amber',
    icon: <Edit3 size={18} />,
  },
  {
    id: 3,
    title: 'স্থির মূলধন ও বিনিয়োগ সুরক্ষা',
    exactText: 'বিনিয়োগের টাকা উত্তলন যোগ্য নয়।',
    tag: 'মূলধন লককৃত',
    tagColor: 'red',
    icon: <Lock size={18} />,
  },
  {
    id: 4,
    title: 'শুধুমাত্র অর্জিত লাভাংশ উত্তোলন',
    exactText: 'শুধু মাত্র লাভাংশ উত্তলন করতে পারবেন।',
    tag: 'মুনাফা উত্তোলন নীতি',
    tagColor: 'emerald',
    icon: <TrendingUp size={18} />,
  },
  {
    id: 5,
    title: 'বিশেষ লোন ও অটোমেটিক সমন্বয়',
    exactText: 'বিশেষ প্রয়োজনে লোন নিতে পারবেন আর এই লোন পরবর্তী লাভাংশ থেকে অটোমেটিক কেটে নেওয়া হবে।',
    tag: 'লভ্যাংশ থেকে অটো-কর্তন',
    tagColor: 'purple',
    icon: <Banknote size={18} />,
  },
  {
    id: 6,
    title: 'সাপ্তাহিক লাভাংশ উত্তোলনের সময়সূচী',
    exactText: 'লাভাংশ প্রতি শুক্রবার রাতে উত্তলন হবে।',
    tag: 'প্রতি শুক্রবার রাত',
    tagColor: 'blue',
    icon: <CalendarClock size={18} />,
  },
  {
    id: 7,
    title: 'অ্যাডমিন নিয়ন্ত্রণ ও প্রোফাইল অনুমোদন',
    exactText:
      'সিস্টেমে তথ্য আপডেট, যুক্ত, ডিলিট, উত্তোলন ও লোন সংক্রান্ত কার্যক্রম অ্যাডমিন প্রোফাইলের অনুমোদন কেন্দ্রের মাধ্যমে নিরাপদে পরিচালিত হবে।',
    tag: 'নিরাপদ ব্যবস্থাপনা',
    tagColor: 'teal',
    icon: <Users size={18} />,
  },
];

export default function TermsConditionsCard({
  compact = false,
  currentAdminName,
  partnerName,
}: TermsConditionsCardProps) {
  return (
    <section className={`terms-card-shell ${compact ? 'terms-compact' : ''}`} aria-label="শর্তাবলী ও নীতিমালা">
      {/* Header Banner */}
      <div className="terms-card-header">
        <div className="terms-header-left">
          <div className="terms-header-icon">
            <ShieldCheck size={24} />
          </div>
          <div>
            <div className="terms-title-row">
              <h3>Terms &amp; Conditions (শর্তাবলী ও নীতিমালা)</h3>
              <span className="terms-active-pill">
                <CheckCircle2 size={13} /> সক্রিয় চুক্তি
              </span>
            </div>
            <p className="terms-subtitle">
              Glowzaa Shop-এর দুই প্রধান অংশীদার ও সুপার অ্যাডমিন (<b>রাকিব</b> ও <b>লিমন</b>)-এর মধ্যকার অফিশিয়াল ব্যবসায়িক সংবিধান ও পরিচালনা শর্তাবলী
            </p>
          </div>
        </div>

        <div className="terms-header-badges">
          <span className="terms-Schedule-badge">
            <CalendarClock size={14} />
            <span>লাভাংশ উত্তোলন: <b>প্রতি শুক্রবার রাতে</b></span>
          </span>
        </div>
      </div>

      {/* 7 Official Rules Grid */}
      <div className="terms-rules-list">
        {PARTNERSHIP_TERMS_LIST.map((rule) => (
          <div
            key={rule.id}
            className={`terms-rule-item ${rule.id === 7 ? 'terms-rule-highlight' : ''}`}
          >
            <div className={`terms-rule-icon-box tone-${rule.tagColor}`}>
              {rule.icon}
            </div>

            <div className="terms-rule-content">
              <div className="terms-rule-top">
                <span className="terms-rule-number">শর্ত ০{rule.id.toLocaleString('bn-BD')}</span>
                <h4 className="terms-rule-heading">{rule.title}</h4>
                <span className={`terms-rule-tag tone-${rule.tagColor}`}>{rule.tag}</span>
              </div>

              <p className="terms-rule-exact">
                <span className="terms-bullet-dot" aria-hidden="true">⏺️</span>{' '}
                {rule.exactText}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Official Dual-Partner Verification Footer */}
      <div className="terms-card-footer">
        <div className="terms-footer-note">
          <AlertCircle size={16} style={{ color: '#0d9488', flexShrink: 0, marginTop: '2px' }} />
          <span>
            {currentAdminName && partnerName ? (
              <>
                সিস্টেমে এন্ট্রি, আপডেট, ডিলিট, লাভাংশ উত্তোলন এবং বিশেষ লোনসহ সকল কার্যক্রম{' '}
                <b>{currentAdminName}</b> এবং <b>{partnerName}</b>-এর ব্যক্তিগত প্রোফাইলের{' '}
                <b>“অনুমোদন কেন্দ্র”</b> দ্বারা স্বয়ংক্রিয়ভাবে নিয়ন্ত্রিত।
              </>
            ) : (
              <>
                সিস্টেমে এন্ট্রি, আপডেট, ডিলিট, লাভাংশ উত্তোলন এবং বিশেষ লোনসহ সকল কার্যক্রম উভয় অ্যাডমিনের ব্যক্তিগত প্রোফাইলের <b>“অনুমোদন কেন্দ্র”</b> দ্বারা স্বয়ংক্রিয়ভাবে নিয়ন্ত্রিত।
              </>
            )}
          </span>
        </div>

        <div className="terms-signatories">
          <div className="terms-sign-chip">
            <span className="sign-dot" />
            <div>
              <small>অ্যাডমিন ও অংশীদার ০১</small>
              <strong>রাকিব (Rakib)</strong>
            </div>
          </div>
          <div className="terms-sign-chip">
            <span className="sign-dot" />
            <div>
              <small>অ্যাডমিন ও অংশীদার ০২</small>
              <strong>লিমন (Limon)</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
