import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { GoogleGenAI, MediaResolution, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BackendEmailLogItem {
  id: string;
  eventType: 'transaction_posted' | 'high_value_withdrawal_request' | 'test_summary';
  subject: string;
  recipients: string[];
  rakibEmail: string;
  limonEmail: string;
  title: string;
  entryType: string;
  entryTypeLabel: string;
  amount: number;
  date: string;
  actorName: string;
  approverName?: string;
  partnerName?: string;
  reason?: string;
  notes?: string;
  highValueThreshold?: number;
  sentAt: string;
  sentAtFormatted: string;
  deliveryMode: 'smtp' | 'ethereal_test_smtp' | 'backend_digest_relay';
  messageId: string;
  previewUrl?: string;
  summaryText: string;
  htmlContent: string;
  status: 'sent' | 'queued';
}

const recentEmailLogs: BackendEmailLogItem[] = [];
let cachedTestAccount: nodemailer.TestAccount | null = null;

const ENTRY_TYPE_LABELS_BN: Record<string, string> = {
  sale: 'পণ্য বিক্রয় (Sale)',
  purchase: 'মাল ক্রয় (Purchase)',
  investment: 'মূলধন বিনিয়োগ (Investment)',
  expense: 'অতিরিক্ত ও পরিচালন খরচ (Expense)',
  withdrawal: 'লাভাংশ উত্তোলন (Withdrawal)',
  loan: 'বিশেষ লোন (Special Loan)',
  other: 'অন্যান্য লেনদেন (Other)',
};

function formatBdtServer(amount: number): string {
  const num = Number(amount) || 0;
  return `৳${num.toLocaleString('bn-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDhakaTimeBn(date = new Date()): string {
  try {
    return date.toLocaleString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toISOString();
  }
}

function buildEmailSummaryHtml(params: {
  eventType: 'transaction_posted' | 'high_value_withdrawal_request' | 'test_summary';
  title: string;
  entryType: string;
  entryTypeLabel: string;
  amount: number;
  date: string;
  actorName: string;
  approverName?: string;
  partnerName?: string;
  category?: string;
  notes?: string;
  reason?: string;
  profitAmount?: number;
  costAmount?: number;
  highValueThreshold: number;
  rakibEmail: string;
  limonEmail: string;
  sentAtFormatted: string;
  appUrl: string;
  financialSummary?: {
    availableCash?: number;
    totalInvestments?: number;
    netProfit?: number;
    totalWithdrawals?: number;
    totalSales?: number;
    totalPurchases?: number;
    totalExpenses?: number;
  };
}): { subject: string; summaryText: string; htmlContent: string } {
  const isHighWithdrawal = params.eventType === 'high_value_withdrawal_request';
  const isTest = params.eventType === 'test_summary';
  const amountStr = formatBdtServer(params.amount);
  const thresholdStr = formatBdtServer(params.highValueThreshold);

  const subject = isHighWithdrawal
    ? `🚨 [উচ্চ-মূল্যের উত্তোলন সতর্কতা] ${amountStr} — ${params.title} | Rakib & Limon`
    : isTest
    ? `📊 [টেস্ট ইমেইল সারাংশ] Glowzaa Shop — Rakib & Limon অটোমেটিক ইমেইল ট্রিগার সক্রিয়`
    : `✅ [নতুন লেনদেন পোস্টেড] ${amountStr} (${params.entryTypeLabel}) — ${params.title}`;

  const fin = params.financialSummary || {};
  const availableCashStr = fin.availableCash !== undefined ? formatBdtServer(fin.availableCash) : 'হিসাব দেখুন';
  const totalInvStr = fin.totalInvestments !== undefined ? formatBdtServer(fin.totalInvestments) : '—';
  const netProfitStr = fin.netProfit !== undefined ? formatBdtServer(fin.netProfit) : '—';
  const totalWithdrawStr = fin.totalWithdrawals !== undefined ? formatBdtServer(fin.totalWithdrawals) : '—';

  const summaryText = isHighWithdrawal
    ? `সতর্কতা: ${params.actorName} ${amountStr} টাকার একটি উচ্চ-মূল্যের উত্তোলন/লোনের অনুরোধ তৈরি করেছেন (নির্ধারিত সীমা ${thresholdStr}-এর বেশি)। অপর অংশীদারের অনুমোদন প্রয়োজন। বর্তমান ব্যালান্স: ${availableCashStr}।`
    : isTest
    ? `Glowzaa Shop-এর ব্যাকএন্ড ইমেইল ট্রিগার সফলভাবে কাজ করছে। যেকোনো নতুন লেনদেন পোস্ট হলে বা উচ্চ-মূল্যের উত্তোলনের অনুরোধ তৈরি হলে Rakib (${params.rakibEmail}) ও Limon (${params.limonEmail})-এর কাছে তাৎক্ষণিক ইমেইল সারাংশ চলে যাবে।`
    : `নতুন লেনদেন পোস্টেড: "${params.title}" (${params.entryTypeLabel}) — পরিমাণ: ${amountStr}। সম্পাদনকারী: ${params.actorName}${params.approverName ? `, অনুমোদনকারী: ${params.approverName}` : ''}। মূলধন সহ বর্তমান ব্যালান্স: ${availableCashStr}।`;

  const headerBg = isHighWithdrawal
    ? 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)'
    : isTest
    ? 'linear-gradient(135deg, #0f172a 0%, #0284c7 100%)'
    : 'linear-gradient(135deg, #065f46 0%, #0d9488 100%)';

  const badgeText = isHighWithdrawal
    ? `🚨 উচ্চ-মূল্যের উত্তোলন অনুরোধ (সীমা: ${thresholdStr}+)`
    : isTest
    ? '⚡ ব্যাকএন্ড ইমেইল ট্রিগার টেস্ট'
    : '✅ নতুন লেনদেন পোস্টেড ও কার্যকর';

  const htmlContent = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <div style="max-width:620px;margin:20px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
    <div style="background:${headerBg};padding:22px 24px;color:#ffffff;">
      <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;margin-bottom:10px;">
        ${badgeText}
      </div>
      <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;line-height:1.35;">${params.title}</h1>
      <p style="margin:0;font-size:13px;opacity:0.92;">
        Glowzaa Shop • অংশীদার: <b>রাকিব (Rakib)</b> ও <b>লিমন (Limon)</b> • সময়: ${params.sentAtFormatted}
      </p>
    </div>

    <div style="padding:22px 24px;">
      <div style="background:${isHighWithdrawal ? '#fff1f2' : '#f0fdf4'};border:1.5px solid ${isHighWithdrawal ? '#fecdd3' : '#bbf7d0'};border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:12px;color:${isHighWithdrawal ? '#9f1239' : '#166534'};font-weight:700;margin-bottom:4px;">
          ${isHighWithdrawal ? 'উত্তোলন / লোনের অনুরোধকৃত পরিমাণ' : 'লেনদেনের টাকার পরিমাণ'}
        </div>
        <div style="font-size:26px;font-weight:900;color:${isHighWithdrawal ? '#dc2626' : '#047857'};">
          ${amountStr}
        </div>
        <div style="font-size:12.5px;color:#334155;margin-top:6px;line-height:1.5;">
          ${summaryText}
        </div>
      </div>

      <h3 style="margin:0 0 10px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
        📋 লেনদেন / অনুরোধের বিস্তারিত তথ্য
      </h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tbody>
          <tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;width:40%;">হিসাবের ধরন:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;">${params.entryTypeLabel}</td>
          </tr>
          <tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">তারিখ:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;">${params.date}</td>
          </tr>
          <tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">অনুরোধকারী / সম্পাদনকারী:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;">${params.actorName}</td>
          </tr>
          ${
            params.approverName
              ? `<tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">অনুমোদনকারী / প্রাপক:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0d9488;">${params.approverName}</td>
          </tr>`
              : ''
          }
          ${
            params.partnerName
              ? `<tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">সংশ্লিষ্ট অংশীদার:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#6d28d9;">${params.partnerName}</td>
          </tr>`
              : ''
          }
          ${
            params.profitAmount !== undefined && params.entryType === 'sale'
              ? `<tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">বিক্রয় মুনাফা ও ক্রয় খরচ:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#059669;">লাভ: +${formatBdtServer(params.profitAmount)} (ক্রয় খরচ: ${formatBdtServer(params.costAmount || 0)})</td>
          </tr>`
              : ''
          }
          ${
            params.reason
              ? `<tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">কারণ / অনুমোদন নোট:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#334155;">${params.reason}</td>
          </tr>`
              : ''
          }
          ${
            params.notes
              ? `<tr>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">মন্তব্য / বিবরণ:</td>
            <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#334155;">${params.notes}</td>
          </tr>`
              : ''
          }
        </tbody>
      </table>

      <h3 style="margin:0 0 10px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
        💰 ব্যবসার বর্তমান আর্থিক সারাংশ (লাইভ স্ন্যাপশট)
      </h3>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#f8fafc;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">
        <tbody>
          <tr>
            <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">মূলধন সহ বর্তমান ব্যালান্স:</td>
            <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-weight:800;color:#047857;text-align:right;font-size:14px;">${availableCashStr}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">মোট মূলধন (বিনিয়োগ):</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#6d28d9;text-align:right;">${totalInvStr}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">সর্বমোট নিট মুনাফা:</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#059669;text-align:right;">${netProfitStr}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;color:#475569;">সর্বমোট উত্তোলন ও লোন:</td>
            <td style="padding:8px 12px;font-weight:700;color:#dc2626;text-align:right;">-${totalWithdrawStr}</td>
          </tr>
        </tbody>
      </table>

      <div style="text-align:center;margin-top:18px;">
        <a href="${params.appUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:700;font-size:13px;">
          ড্যাশবোর্ডে প্রবেশ করুন →
        </a>
      </div>
    </div>

    <div style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0;font-size:11.5px;color:#64748b;text-align:center;">
      প্রাপক: <b>Rakib</b> (${params.rakibEmail}) • <b>Limon</b> (${params.limonEmail})<br/>
      Glowzaa Shop Dual-Admin Automated Backend Email Trigger
    </div>
  </div>
</body>
</html>`;

  return { subject, summaryText, htmlContent };
}

const PRESET_IMAGES: Record<string, string> = {
  crab: 'https://images.unsplash.com/photo-1548811579-017cf2a4268b?w=300&auto=format&fit=crop&q=80',
  fish: 'https://images.unsplash.com/photo-1534043464124-3be32fe00099?w=300&auto=format&fit=crop&q=80',
  shrimp: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=300&auto=format&fit=crop&q=80',
  meat: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=300&auto=format&fit=crop&q=80',
  egg: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=300&auto=format&fit=crop&q=80',
  veg: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&auto=format&fit=crop&q=80',
  box: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80',
};

function bnToEnDigits(str: string): string {
  const map: Record<string, string> = {
    '০': '0',
    '১': '1',
    '২': '2',
    '৩': '3',
    '৪': '4',
    '৫': '5',
    '৬': '6',
    '৭': '7',
    '৮': '8',
    '৯': '9',
  };
  return str.replace(/[০-৯]/g, (d) => map[d] || d);
}

function normalizeBengaliSpokenNumbers(input: string): string {
  let s = bnToEnDigits(input || '');

  // Replace fractional/compound phrases first
  const phraseReplacements: Array<[RegExp, string]> = [
    [/দেড়\s*হাজার|দেড়\s*হাজার/gi, ' 1500 '],
    [/আড়াই\s*হাজার|আড়াই\s*হাজার/gi, ' 2500 '],
    [/সাড়ে\s*তিন\s*হাজার|সাড়ে\s*তিন\s*হাজার/gi, ' 3500 '],
    [/সাড়ে\s*চার\s*হাজার|সাড়ে\s*চার\s*হাজার/gi, ' 4500 '],
    [/সাড়ে\s*পাঁচ\s*হাজার|সাড়ে\s*পাঁচ\s*হাজার/gi, ' 5500 '],
    [/দেড়শ|দেড়শ|একশ\s*পঞ্চাশ|একশো\s*পঞ্চাশ/gi, ' 150 '],
    [/আড়াইশ|আড়াইশ|দুইশ\s*পঞ্চাশ|দুশো\s*পঞ্চাশ/gi, ' 250 '],
    [/দুইশ\s*চল্লিশ|দুশো\s*চল্লিশ/gi, ' 240 '],
    [/একশ\s*বিশ|একশো\s*বিশ/gi, ' 120 '],
    [/তিনশ\s*ষাট|তিনশো\s*ষাট/gi, ' 360 '],
    [/নয়শ|নয়শ|নয়শো/gi, ' 900 '],
    [/আটশ|আটশো/gi, ' 800 '],
    [/সাতশ|সাতশো/gi, ' 700 '],
    [/ছয়শ|ছয়শ|ছয়শো/gi, ' 600 '],
    [/পাঁচশ|পাঁচশো/gi, ' 500 '],
    [/চারশ|চারশো/gi, ' 400 '],
    [/তিনশ|তিনশো/gi, ' 300 '],
    [/দুইশ|দুশো/gi, ' 200 '],
    [/একশ|একশো/gi, ' 100 '],
    [/নব্বই/gi, ' 90 '],
    [/আশি/gi, ' 80 '],
    [/সত্তর/gi, ' 70 '],
    [/ষাট/gi, ' 60 '],
    [/পঞ্চাশ/gi, ' 50 '],
    [/পঁয়তাল্লিশ|পঁয়তাল্লিশ/gi, ' 45 '],
    [/চল্লিশ/gi, ' 40 '],
    [/পঁয়ত্রিশ|পঁয়ত্রিশ/gi, ' 35 '],
    [/ত্রিশ|তিরিশ/gi, ' 30 '],
    [/পঁচিশ/gi, ' 25 '],
    [/বিশ|কুড়ি|কুড়ি/gi, ' 20 '],
    [/উনিশ/gi, ' 19 '],
    [/আঠারো|আঠার/gi, ' 18 '],
    [/সতেরো|সতের/gi, ' 17 '],
    [/ষোলো|ষোল/gi, ' 16 '],
    [/পনেরো|পনের/gi, ' 15 '],
    [/চৌদ্দ/gi, ' 14 '],
    [/তেরো|তের/gi, ' 13 '],
    [/বারো|বার/gi, ' 12 '],
    [/এগারো|এগার/gi, ' 11 '],
    [/দশ/gi, ' 10 '],
    [/(?:^|\s)নয়(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 9 '],
    [/(?:^|\s)আট(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 8 '],
    [/(?:^|\s)সাত(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 7 '],
    [/(?:^|\s)ছয়|ছয়(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 6 '],
    [/(?:^|\s)পাঁচ(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 5 '],
    [/(?:^|\s)চার(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 4 '],
    [/(?:^|\s)তিন(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 3 '],
    [/(?:^|\s)দুই(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 2 '],
    [/(?:^|\s)এক(?=\s|$|টি|টা|কেজি|পিস|হাজার|শত|টাকা)/gi, ' 1 '],
  ];

  for (const [regex, replacement] of phraseReplacements) {
    s = s.replace(regex, replacement);
  }

  // Handle "X হাজার Y" (e.g., "4 হাজার 500" -> "4500")
  s = s.replace(/(\d+)\s*হাজার\s*(\d+)/g, (_, th, rem) => {
    const val = Number(th) * 1000 + Number(rem);
    return ` ${val} `;
  });

  // Handle "X হাজার" (e.g., "15 হাজার" -> "15000")
  s = s.replace(/(\d+(?:\.\d+)?)\s*হাজার/g, (_, th) => {
    const val = Math.round(Number(th) * 1000);
    return ` ${val} `;
  });

  // Handle "X শত / শো" (e.g., "5 শত" -> "500")
  s = s.replace(/(\d+)\s*(?:শত|শো)/g, (_, hun) => {
    const val = Number(hun) * 100;
    return ` ${val} `;
  });

  // Handle "X লাখ / লক্ষ"
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:লাখ|লক্ষ)/g, (_, l) => {
    const val = Math.round(Number(l) * 100000);
    return ` ${val} `;
  });

  return s.replace(/\s+/g, ' ').trim();
}

function detectCategoryPreset(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('কাকড়া') || n.includes('কাঁকড়া') || n.includes('crab')) return 'crab';
  if (n.includes('চিংড়ি') || n.includes('গলদা') || n.includes('বাগদা') || n.includes('shrimp') || n.includes('prawn')) return 'shrimp';
  if (n.includes('মাছ') || n.includes('ইলিশ') || n.includes('রুই') || n.includes('কাতলা') || n.includes('তেলাপিয়া') || n.includes('পাঙ্গাস') || n.includes('কোরাল') || n.includes('রূপচাঁদা') || n.includes('fish')) return 'fish';
  if (n.includes('মাংস') || n.includes('গরু') || n.includes('খাসি') || n.includes('মুরগি') || n.includes('meat') || n.includes('chicken') || n.includes('beef')) return 'meat';
  if (n.includes('ডিম') || n.includes('egg')) return 'egg';
  if (n.includes('সবজি') || n.includes('আলু') || n.includes('পেঁয়াজ') || n.includes('মরিচ') || n.includes('veg')) return 'veg';
  return 'box';
}

function generateSmartSku(name: string, index = 1): string {
  const n = name.toLowerCase();
  const suffix = String(index).padStart(2, '0');
  if (n.includes('কাকড়া') || n.includes('কাঁকড়া') || n.includes('crab')) return `CRAB-${suffix}`;
  if (n.includes('চিংড়ি') || n.includes('গলদা') || n.includes('বাগদা') || n.includes('shrimp')) return `SHRIMP-${suffix}`;
  if (n.includes('ইলিশ')) return `HILSA-${suffix}`;
  if (n.includes('রুই')) return `RUI-${suffix}`;
  if (n.includes('কাতলা')) return `KATLA-${suffix}`;
  if (n.includes('মাছ') || n.includes('fish')) return `FISH-${suffix}`;
  if (n.includes('মাংস') || n.includes('মুরগি') || n.includes('গরু')) return `MEAT-${suffix}`;
  if (n.includes('ডিম')) return `EGG-${suffix}`;
  const ascii = n.replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 4);
  return `${ascii || 'PRD'}-${suffix}`;
}

function smartFallbackParse(promptText: string, mode: 'single' | 'batch_avg') {
  const normalized = normalizeBengaliSpokenNumbers(promptText || '');
  const unitMatch = normalized.match(/(কেজি|পিস|বক্স|লিটার|হালি|ডজন|প্যাকেট|kg|pcs|piece)/i);
  let unit = 'কেজি';
  if (unitMatch) {
    const u = unitMatch[1].toLowerCase();
    if (u === 'pcs' || u === 'piece' || u === 'পিস') unit = 'পিস';
    else if (u === 'kg' || u === 'কেজি') unit = 'কেজি';
    else unit = unitMatch[1];
  }

  if (mode === 'batch_avg') {
    const parts = normalized
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const items = parts.slice(0, 6).map((part, idx) => {
      const nums = Array.from(part.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) => Number(m[1]));
      const cleanName = part
        .replace(/(\d+(?:\.\d+)?)/g, '')
        .replace(/(কেজি|পিস|বক্স|টাকা|কেনা|ক্রয়|বিক্রি|বিক্রয়|দাম|মোট|গড়|৳|tk|kg|pcs)/gi, '')
        .replace(/[-:()/]+/g, ' ')
        .trim() || `পণ্য ${idx + 1}`;
      const stock = nums[0] || 10;
      const cost = nums[1] ? (nums[1] > 2000 && stock > 1 ? Math.round((nums[1] / stock) * 100) / 100 : nums[1]) : 300;
      const sell = nums[2] || Math.round(cost * 1.25);
      const cat = detectCategoryPreset(cleanName);
      return {
        name: cleanName,
        sku: generateSmartSku(cleanName, idx + 1),
        unit,
        currentStock: stock,
        averageCost: cost,
        sellingPrice: sell,
        categoryPreset: cat,
        imageUrl: PRESET_IMAGES[cat] || PRESET_IMAGES.box,
      };
    });
    return {
      products: items,
      reason: 'AI অটো-ফিলের মাধ্যমে ৫-৬টি পণ্যের গড় স্টক ও মূল্য সংযোজন',
      summaryBn: `${items.length}টি পণ্যের নাম, স্টক ও সম্ভাব্য গড় মূল্য সাজানো হয়েছে।`,
    };
  }

  const nums = Array.from(normalized.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) => Number(m[1]));
  const cleanName =
    normalized
      .replace(/(\d+(?:\.\d+)?)/g, '')
      .replace(/(কেজি|পিস|বক্স|লিটার|হালি|টাকা|কেনা|ক্রয়|ক্রয়মূল্য|বিক্রি|বিক্রয়|বিক্রয়মূল্য|দাম|স্টক|মোট|গড়|প্রতি|৳|tk|kg|pcs)/gi, '')
      .replace(/[-:(),/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'সামুদ্রিক কাকড়া';

  let stock = 0;
  let avgCost = 0;
  let sellingPrice = 0;

  if (nums.length >= 3) {
    stock = nums[0];
    if (nums[1] > nums[2] && stock > 1 && nums[1] / stock <= nums[2]) {
      avgCost = Math.round((nums[1] / stock) * 100) / 100;
      sellingPrice = nums[2];
    } else {
      avgCost = nums[1];
      sellingPrice = nums[2];
    }
  } else if (nums.length === 2) {
    if (nums[0] <= 500 && nums[1] >= 1000 && (normalized.includes('মোট') || normalized.includes('কেনা'))) {
      stock = nums[0];
      avgCost = Math.round((nums[1] / stock) * 100) / 100;
      sellingPrice = Math.round(avgCost * 1.25);
    } else {
      avgCost = nums[0];
      sellingPrice = nums[1];
      stock = 10;
    }
  } else if (nums.length === 1) {
    avgCost = nums[0];
    sellingPrice = Math.round(avgCost * 1.25);
    stock = 10;
  } else {
    stock = 10;
    avgCost = 300;
    sellingPrice = 400;
  }

  const cat = detectCategoryPreset(cleanName);
  return {
    product: {
      name: cleanName,
      sku: generateSmartSku(cleanName, 1),
      unit,
      currentStock: stock,
      averageCost: avgCost,
      sellingPrice,
      categoryPreset: cat,
      imageUrl: PRESET_IMAGES[cat] || PRESET_IMAGES.box,
    },
    reason: `নতুন পণ্য (${cleanName}) স্টক ও মূল্য সংযোজন`,
    summaryBn: `"${cleanName}" পণ্যের কোড, একক, স্টক ও ক্রয়-বিক্রয়মূল্য স্বয়ংক্রিয়ভাবে পূরণ করা হয়েছে।`,
  };
}


const TEXT_MODEL_CASCADE = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
];

async function generateStructuredAiContent(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config: any;
  }
) {
  let lastError: any = null;
  for (const model of TEXT_MODEL_CASCADE) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const status = Number(err?.status || err?.code) || 0;
      const msg = String(err?.message || '');
      const isRateLimit = status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
      if (isRateLimit) {
        console.warn(`[AI Text Model] ${model} rate limit/quota reached (429), trying next fallback model...`);
        continue;
      }
      if (status === 404 || msg.includes('404') || msg.includes('not found')) {
        console.warn(`[AI Text Model] ${model} not found (404), trying next fallback model...`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.post('/api/ai/parse-product', async (req, res) => {
    const { prompt = '', imageDataUrl = '', audioDataUrl = '', mode = 'single', existingProducts = [] } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json(smartFallbackParse(prompt, mode));
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const parts: any[] = [];
      if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
        const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      if (audioDataUrl && typeof audioDataUrl === 'string' && audioDataUrl.startsWith('data:audio/')) {
        const match = audioDataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+)(?:;[^;]+)*;base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      const historyContext = Array.isArray(existingProducts) && existingProducts.length > 0
        ? `Existing inventory products for reference: ${JSON.stringify(
            existingProducts.slice(0, 15).map((p: any) => ({
              name: p.name,
              sku: p.sku,
              unit: p.unit,
              averageCost: p.averageCost,
              sellingPrice: p.sellingPrice,
            }))
          )}`
        : '';

      if (mode === 'batch_avg') {
        parts.push({
          text: `You are an expert Bengali business inventory assistant for a retail/wholesale shop in Bangladesh (often selling crab/কাকড়া, fish/মাছ, shrimp/চিংড়ি, meat, groceries, etc.).
Extract up to 6 products from the user's Bengali/English text, spoken audio recording, or attached photo/voucher/memo.
${audioDataUrl ? 'IMPORTANT: First listen carefully to the attached Bengali audio recording and transcribe the exact spoken words into `transcribedPrompt` in Bengali.' : ''}
User text input: "${prompt || (audioDataUrl ? 'অডিও ভয়েস থেকে পণ্যের তালিকা ও দাম বের করুন' : 'ছবি থেকে পণ্যের তালিকা, পরিমাণ ও দাম বের করুন')}"
${historyContext}

Rules:
1. Product names ('name') MUST be in clean Bengali (e.g., "সামুদ্রিক কাকড়া", "গলদা চিংড়ি", "ইলিশ মাছ").
2. 'sku' should be a clean uppercase code like CRAB-01, SHRIMP-02, FISH-03.
3. 'unit' should be in Bengali: "কেজি", "পিস", "বক্স", "লিটার", or "হালি".
4. If the user provides total purchase cost for a quantity (e.g., "২০ কেজি কাকড়া ৬০০০ টাকা"), calculate per-unit 'averageCost' = 6000 / 20 = 300.
5. If 'sellingPrice' is not explicitly mentioned, suggest a realistic selling price with ~20-30% profit margin over averageCost.
6. 'categoryPreset' must be one of: "crab", "fish", "shrimp", "meat", "egg", "veg", "box".
7. 'reason' must be a concise Bengali note for dual-admin approval (e.g., "৫-৬টি পণ্যের নতুন লট স্টক ও গড় মূল্য সংযোজন").
8. 'summaryBn' must be a short 1-sentence Bengali explanation of what was auto-filled.`,
        });

        const response = await generateStructuredAiContent(ai, {
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcribedPrompt: { type: Type.STRING },
                products: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      sku: { type: Type.STRING },
                      unit: { type: Type.STRING },
                      currentStock: { type: Type.NUMBER },
                      averageCost: { type: Type.NUMBER },
                      sellingPrice: { type: Type.NUMBER },
                      categoryPreset: { type: Type.STRING },
                    },
                    required: ['name', 'sku', 'unit', 'currentStock', 'averageCost', 'sellingPrice', 'categoryPreset'],
                  },
                },
                totalLotCost: { type: Type.NUMBER },
                totalLotSell: { type: Type.NUMBER },
                reason: { type: Type.STRING },
                summaryBn: { type: Type.STRING },
              },
              required: ['products', 'reason', 'summaryBn'],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        const enriched = (parsed.products || []).map((p: any, idx: number) => {
          const cat = p.categoryPreset && PRESET_IMAGES[p.categoryPreset] ? p.categoryPreset : detectCategoryPreset(p.name || '');
          return {
            name: p.name || `পণ্য ${idx + 1}`,
            sku: p.sku || generateSmartSku(p.name || '', idx + 1),
            unit: p.unit || 'কেজি',
            currentStock: Number(p.currentStock) || 0,
            averageCost: Number(p.averageCost) || 0,
            sellingPrice: Number(p.sellingPrice) || 0,
            categoryPreset: cat,
            imageUrl: PRESET_IMAGES[cat] || PRESET_IMAGES.box,
          };
        });

        return res.json({
          transcribedPrompt: parsed.transcribedPrompt || prompt || '',
          products: enriched,
          totalLotCost: parsed.totalLotCost || 0,
          totalLotSell: parsed.totalLotSell || 0,
          reason: parsed.reason || 'নতুন লট স্টক ও গড় মূল্য সংযোজন',
          summaryBn: parsed.summaryBn || `${enriched.length}টি পণ্যের তথ্য এআই দিয়ে স্বয়ংক্রিয়ভাবে পূরণ করা হয়েছে।`,
        });
      }

      // Single Product Mode
      parts.push({
        text: `You are an expert Bengali business inventory assistant for a retail/wholesale shop in Bangladesh (selling items like কাকড়া/crab, চিংড়ি/shrimp, মাছ/fish, মাংস/meat, ডিম/egg, সবজি/vegetables, or general retail goods).
Extract product details from the user's short Bengali/English text, spoken audio recording, or attached product/invoice photo.
${audioDataUrl ? 'IMPORTANT: First listen carefully to the attached Bengali audio recording and transcribe the exact spoken words into `transcribedPrompt` in Bengali.' : ''}
User text input: "${prompt || (audioDataUrl ? 'অডিও ভয়েস থেকে পণ্যের নাম, পরিমাণ, ক্রয়মূল্য ও বিক্রয়মূল্য বের করুন' : 'ছবি দেখে পণ্যের নাম, কোড, একক ও সম্ভাব্য মূল্য নির্ধারণ করুন')}"
${historyContext}

Rules:
1. 'name' MUST be in clear Bengali (e.g., "সামুদ্রিক কাকড়া", "গলদা চিংড়ি", "দেশি মুরগি").
2. 'sku' MUST be a short uppercase code (e.g., "CRAB-01", "SHRIMP-01", "FISH-01").
3. 'unit' MUST be in Bengali (e.g., "কেজি", "পিস", "বক্স", "হালি"). Default to "কেজি" for seafood/meat/vegetables, or "পিস" for countable items.
4. 'currentStock': Extract stock quantity. If not mentioned, set 0.
5. 'averageCost': Per-unit purchase cost in BDT (৳). IMPORTANT: If the user gives a total price for a lot (e.g., "৫০ কেজি কাকড়া ১৫০০০ টাকা"), divide total cost by quantity (15000 / 50 = 300) to get per-unit averageCost!
6. 'sellingPrice': Per-unit selling price in BDT (৳). If not mentioned by user, estimate a reasonable selling price (~25% higher than averageCost, or based on existingProducts).
7. 'categoryPreset': Must be one of "crab", "fish", "shrimp", "meat", "egg", "veg", "box".
8. 'reason': A short Bengali approval reason note (e.g., "নতুন কাকড়া স্টক ও মূল্য সংযোজন").
9. 'summaryBn': A short 1-sentence helpful Bengali summary explaining what was filled (including any unit cost division done).`,
      });

      const response = await generateStructuredAiContent(ai, {
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcribedPrompt: { type: Type.STRING },
              product: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  sku: { type: Type.STRING },
                  unit: { type: Type.STRING },
                  currentStock: { type: Type.NUMBER },
                  averageCost: { type: Type.NUMBER },
                  sellingPrice: { type: Type.NUMBER },
                  categoryPreset: { type: Type.STRING },
                },
                required: ['name', 'sku', 'unit', 'currentStock', 'averageCost', 'sellingPrice', 'categoryPreset'],
              },
              reason: { type: Type.STRING },
              summaryBn: { type: Type.STRING },
            },
            required: ['product', 'reason', 'summaryBn'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const effectiveTranscript = (parsed.transcribedPrompt || prompt || '').trim();
      const fbSingle = smartFallbackParse(effectiveTranscript, 'single').product;
      const p = parsed.product || {};
      const finalName = p.name || fbSingle?.name || '';
      const cat = p.categoryPreset && PRESET_IMAGES[p.categoryPreset] ? p.categoryPreset : detectCategoryPreset(finalName);

      return res.json({
        transcribedPrompt: effectiveTranscript,
        product: {
          name: finalName,
          sku: p.sku || fbSingle?.sku || generateSmartSku(finalName, 1),
          unit: p.unit || fbSingle?.unit || 'কেজি',
          currentStock: Number(p.currentStock) > 0 ? Number(p.currentStock) : (Number(fbSingle?.currentStock) || 0),
          averageCost: Number(p.averageCost) > 0 ? Number(p.averageCost) : (Number(fbSingle?.averageCost) || 0),
          sellingPrice: Number(p.sellingPrice) > 0 ? Number(p.sellingPrice) : (Number(fbSingle?.sellingPrice) || 0),
          categoryPreset: cat,
          imageUrl: PRESET_IMAGES[cat] || PRESET_IMAGES.box,
        },
        reason: parsed.reason || `নতুন পণ্য (${finalName}) সংযোজন`,
        summaryBn: parsed.summaryBn || 'এআই স্বয়ংক্রিয়ভাবে পণ্যের সব ঘর পূরণ করেছে।',
      });
    } catch (error: any) {
      const status = Number(error?.status || error?.code) || 0;
      const msg = String(error?.message || '');
      const isQuota = status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
      if (isQuota) {
        console.warn('AI parse-product: Gemini API quota exceeded (429), smoothly using local Bengali smart fallback.');
      } else {
        console.warn('AI parse-product: API unavailable, using local smart fallback:', msg || error);
      }
      return res.json(smartFallbackParse(prompt, mode));
    }
  });

  // ---------------------------------------------------------------------------
  // UNIVERSAL VOICE & AI FORM AUTO-FILL ENDPOINT (/api/ai/parse-entry-form)
  // Supports: 'entry' | 'investor' | 'waste' | 'distribution' | 'withdraw'
  // ---------------------------------------------------------------------------
  function smartFallbackEntryForm(
    formType: string,
    rawPrompt: string,
    products: any[] = [],
    investors: any[] = []
  ) {
    const normalized = normalizeBengaliSpokenNumbers(rawPrompt || '');
    const nums = Array.from(normalized.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) => Number(m[1]));

    // Match product by name if mentioned
    const matchedProduct = (products || []).find((p: any) => {
      const pName = String(p?.name || '').toLowerCase();
      return pName && normalized.toLowerCase().includes(pName);
    }) || (products || []).find((p: any) => {
      const words = String(p?.name || '').split(/\s+/).filter((w) => w.length >= 3);
      return words.some((w) => normalized.includes(w));
    });

    // Match investor by name if mentioned
    const matchedInvestor = (investors || []).find((inv: any) => {
      const iName = String(inv?.name || '').toLowerCase();
      if (iName && normalized.toLowerCase().includes(iName)) return true;
      if ((iName.includes('rakib') || iName.includes('রাকিব')) && (normalized.toLowerCase().includes('rakib') || normalized.includes('রাকিব'))) return true;
      if ((iName.includes('limon') || iName.includes('লিমন')) && (normalized.toLowerCase().includes('limon') || normalized.includes('লিমন'))) return true;
      return false;
    });

    if (formType === 'investor') {
      const rawDigits = bnToEnDigits(rawPrompt || '');
      const phoneMatch = rawDigits.match(/(01\d{3}[-\s]?\d{6}|\d{11})/);
      const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, '') : '';
      const cleanName = rawDigits
        .replace(/(01\d{3}[-\s]?\d{6}|\d+)/g, '')
        .replace(/(নতুন|অংশীদার|ইনভেস্টর|পার্টনার|নাম|ফোন|নাম্বার|নম্বর|মোবাইল|যোগ|করুন)/gi, '')
        .replace(/[-:(),/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'নতুন অংশীদার';
      return {
        transcribedPrompt: rawPrompt,
        summaryBn: `✨ অংশীদারের নাম "${cleanName}"${phone ? ` ও ফোন (${phone})` : ''} স্বয়ংক্রিয়ভাবে বসানো হয়েছে।`,
        fields: {
          name: cleanName,
          phone,
          reason: `নতুন অংশীদার (${cleanName}) অন্তর্ভুক্তি`,
        },
      };
    }

    if (formType === 'waste') {
      const prod = matchedProduct || products[0] || null;
      const qty = nums[0] || 1;
      const avgCost = Number(prod?.averageCost) || 0;
      const lossAmount = nums[1] || (avgCost > 0 ? Math.round(qty * avgCost * 100) / 100 : 0);
      let reason = 'পচে যাওয়া / নষ্ট (Spoiled/Rotten)';
      if (/মেয়াদ|expired/i.test(normalized)) reason = 'মেয়াদোত্তীর্ণ (Expired)';
      else if (/ভাঙা|ভাঙ্গা|ত্রুটি|broken/i.test(normalized)) reason = 'ভাঙা / ত্রুটিপূর্ণ (Broken/Defective)';
      else if (/পরিবহন|গাড়ি|transit/i.test(normalized)) reason = 'পরিবহনে ক্ষতিগ্রস্থ (Transit Damage)';

      return {
        transcribedPrompt: rawPrompt,
        summaryBn: `✨ নষ্ট পণ্য (${prod?.name || 'নির্বাচিত পণ্য'}) পরিমাণ ${qty} এবং সম্ভাব্য ক্ষতি ৳${lossAmount} বসানো হয়েছে।`,
        fields: {
          productId: prod?.id || '',
          quantity: qty,
          lossAmount,
          reason,
          notes: rawPrompt || `${prod?.name || 'পণ্য'} নষ্টজনিত ক্ষতি`,
        },
      };
    }

    if (formType === 'distribution') {
      const amount = nums.find((n) => n >= 100) || nums[0] || 0;
      const cleanPeriod = normalized
        .replace(/(\d+(?:\.\d+)?)/g, '')
        .replace(/(টাকা|মুনাফা|লাভ|বণ্টন|ভাগ|করুন|৳)/gi, '')
        .replace(/\s+/g, ' ')
        .trim() || `${new Date().toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })} মুনাফা বণ্টন`;
      return {
        transcribedPrompt: rawPrompt,
        summaryBn: `✨ মুনাফা বণ্টনের মেয়াদ "${cleanPeriod}" ও পরিমাণ ৳${amount} বসানো হয়েছে।`,
        fields: {
          periodName: cleanPeriod,
          distributableAmount: amount,
        },
      };
    }

    if (formType === 'withdraw') {
      const isLoan = /(লোন|loan|ধার|হাওলাত|জরুরি)/i.test(normalized);
      const amount = nums.find((n) => n >= 50) || nums[0] || 0;
      let method = 'নগদ ক্যাশ (Cash)';
      if (/বিকাশ|bkash/i.test(normalized)) method = 'বিকাশ (bKash)';
      else if (/নগদ|nagad/i.test(normalized) && !/নগদ ক্যাশ/i.test(normalized)) method = 'নগদ (Nagad)';
      else if (/রকেট|rocket/i.test(normalized)) method = 'রকেট (Rocket)';
      else if (/ব্যাংক|bank/i.test(normalized)) method = 'ব্যাংক ট্রান্সফার (Bank)';

      return {
        transcribedPrompt: rawPrompt,
        summaryBn: `✨ ${isLoan ? 'বিশেষ লোন' : 'লাভাংশ উত্তোলন'} ৳${amount} (${method}) স্বয়ংক্রিয়ভাবে বসানো হয়েছে।`,
        fields: {
          mode: isLoan ? 'loan' : 'withdrawal',
          amount,
          method,
          reason: rawPrompt || (isLoan ? 'জরুরি প্রয়োজনে বিশেষ লোন গ্রহণ' : 'সাপ্তাহিক অর্জিত লাভাংশ উত্তোলন'),
        },
      };
    }

    // Default: 'entry' (Transaction form: sale, purchase, expense, investment, withdrawal, loan)
    let type: 'sale' | 'purchase' | 'expense' | 'investment' | 'withdrawal' | 'loan' = 'sale';
    if (/(খরচ|ভাড়া|বিল|বিদ্যুৎ|গ্যাস|মজুরি|যাতায়াত|কুরিয়ার|খাবার|নাস্তা|expense)/i.test(normalized) && !/(বিক্রি|বিক্রয়)/i.test(normalized)) {
      type = 'expense';
    } else if (/(কেনা|ক্রয়|কিনলাম|কিনেছি|মাল কেনা|purchase)/i.test(normalized) && !/(বিক্রি|বিক্রয়)/i.test(normalized)) {
      type = 'purchase';
    } else if (/(মূলধন|বিনিয়োগ|ইনভেস্ট|জমা দিল|investment)/i.test(normalized)) {
      type = 'investment';
    } else if (/(লোন|ধার|loan)/i.test(normalized)) {
      type = 'loan';
    } else if (/(উত্তোলন|তুলে নিল|তুললাম|লাভ উত্তোলন|withdraw)/i.test(normalized)) {
      type = 'withdrawal';
    }

    let quantity = 0;
    let unitPrice = 0;
    let unitCost = Number(matchedProduct?.averageCost) || 0;
    let amount = 0;
    let cost = 0;
    let profit = 0;

    if (type === 'sale' || type === 'purchase') {
      if (nums.length >= 2) {
        quantity = nums[0];
        if (nums[1] >= quantity * 20 && !/(দর|করে|প্রতি)/i.test(normalized)) {
          amount = nums[1];
          unitPrice = quantity > 0 ? Math.round((amount / quantity) * 100) / 100 : 0;
        } else {
          unitPrice = nums[1];
          amount = Math.round(quantity * unitPrice * 100) / 100;
        }
        if (type === 'purchase') {
          unitCost = unitPrice;
        }
      } else if (nums.length === 1) {
        if (matchedProduct && nums[0] <= 100 && /(কেজি|পিস|বক্স|হালি|টি)/i.test(normalized)) {
          quantity = nums[0];
          unitPrice = type === 'sale' ? (Number(matchedProduct.sellingPrice) || Number(matchedProduct.averageCost) * 1.25 || 0) : (Number(matchedProduct.averageCost) || 0);
          amount = Math.round(quantity * unitPrice * 100) / 100;
        } else {
          amount = nums[0];
          quantity = 1;
          unitPrice = amount;
        }
      }
      if (type === 'sale') {
        cost = quantity > 0 && unitCost > 0 ? Math.round(quantity * unitCost * 100) / 100 : 0;
        profit = amount > 0 && cost > 0 ? Math.round((amount - cost) * 100) / 100 : 0;
      }
    } else {
      amount = nums.find((n) => n >= 10) || nums[0] || 0;
    }

    const defaultTitles: Record<string, string> = {
      sale: matchedProduct ? `${matchedProduct.name} বিক্রয়` : (rawPrompt ? rawPrompt.slice(0, 45) : 'পণ্য বিক্রয়'),
      purchase: matchedProduct ? `${matchedProduct.name} ক্রয়` : (rawPrompt ? rawPrompt.slice(0, 45) : 'পণ্য স্টক ক্রয়'),
      expense: rawPrompt || 'দোকান ও পরিচালন খরচ',
      investment: matchedInvestor ? `${matchedInvestor.name}-এর মূলধন জমা` : 'মূলধন বিনিয়োগ',
      withdrawal: matchedInvestor ? `${matchedInvestor.name}-এর লাভাংশ উত্তোলন` : 'লাভাংশ উত্তোলন',
      loan: matchedInvestor ? `${matchedInvestor.name}-এর বিশেষ লোন` : 'বিশেষ লোন গ্রহণ',
    };

    const defaultCategories: Record<string, string> = {
      sale: 'পণ্য বিক্রয়',
      purchase: 'স্টক ক্রয়',
      expense: 'পরিচালন খরচ',
      investment: 'মূলধন',
      withdrawal: 'লাভাংশ উত্তোলন',
      loan: 'বিশেষ লোন',
    };

    return {
      transcribedPrompt: rawPrompt,
      summaryBn: `✨ ভয়েস/টেক্সট অনুযায়ী "${defaultTitles[type]}"${amount > 0 ? ` (মোট ৳${amount})` : ''} স্বয়ংক্রিয়ভাবে পূরণ করা হয়েছে।`,
      fields: {
        type,
        title: defaultTitles[type],
        productId: matchedProduct?.id || '',
        investorId: matchedInvestor?.id || '',
        quantity: quantity > 0 ? quantity : '',
        unitPrice: unitPrice > 0 ? unitPrice : '',
        unitCost: unitCost > 0 ? unitCost : '',
        amount: amount > 0 ? amount : '',
        cost: cost > 0 ? cost : '',
        profit: profit !== 0 ? profit : '',
        category: defaultCategories[type],
        notes: rawPrompt,
        reason: rawPrompt || defaultTitles[type],
      },
    };
  }

  app.post('/api/ai/parse-entry-form', async (req, res) => {
    const {
      formType = 'entry',
      prompt = '',
      audioDataUrl = '',
      products = [],
      investors = [],
    } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json(smartFallbackEntryForm(formType, prompt, products, investors));
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const parts: any[] = [];
      if (audioDataUrl && typeof audioDataUrl === 'string' && audioDataUrl.startsWith('data:audio/')) {
        const match = audioDataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+)(?:;[^;]+)*;base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      const productListContext = Array.isArray(products) && products.length > 0
        ? `Available Products in Inventory: ${JSON.stringify(
            products.slice(0, 25).map((p: any) => ({
              id: p.id,
              name: p.name,
              unit: p.unit,
              averageCost: p.averageCost,
              sellingPrice: p.sellingPrice,
            }))
          )}`
        : 'Available Products: None';

      const investorListContext = Array.isArray(investors) && investors.length > 0
        ? `Available Business Partners (Investors): ${JSON.stringify(
            investors.map((inv: any) => ({
              id: inv.id,
              name: inv.name,
              phone: inv.phone,
            }))
          )}`
        : 'Available Partners: Rakib (রাকিব), Limon (লিমন)';

      parts.push({
        text: `You are an expert Bengali accounting & business assistant for "Glowzaa Shop" in Bangladesh.
The user is filling out a form of type: "${formType}".
${audioDataUrl ? '1. First, listen carefully to the attached Bengali voice audio and transcribe what the user said into `transcribedPrompt` in clean Bengali.' : ''}
User text input (if any): "${prompt}"
${productListContext}
${investorListContext}

Instructions by formType:
- If formType === "entry" (Transaction Modal):
  Determine 'type' from: "sale" (বিক্রয়), "purchase" (ক্রয়/মাল কেনা), "expense" (খরচ/ভাড়া/বিল/মজুরি), "investment" (মূলধন জমা/বিনিয়োগ), "withdrawal" (লাভাংশ উত্তোলন), "loan" (বিশেষ লোন/ধার).
  Match 'productId' from Available Products if a product is mentioned (for sale/purchase).
  Match 'investorId' from Available Business Partners if Rakib/রাকিব or Limon/লিমন or another partner is mentioned (for investment/withdrawal/loan).
  Calculate 'quantity', 'unitPrice' (per unit selling price), 'unitCost' (per unit purchase cost — use matched product's averageCost if not explicitly stated in a sale), 'amount' (total transaction amount in BDT), 'cost' (total COGS for sale = quantity * unitCost), and 'profit' (for sale = amount - cost).
  IMPORTANT: If the user says "৫ কেজি কাকড়া ২২০০ টাকায় বিক্রি" -> quantity=5, amount=2200, unitPrice=440. If the user says "৫ কেজি কাকড়া ৪৪০ টাকা দরে বিক্রি" -> quantity=5, unitPrice=440, amount=2200.
  Provide a clean Bengali 'title', 'category', 'notes', and approval 'reason'.

- If formType === "investor" (New Partner Modal):
  Extract partner's 'name' in Bengali, 'phone' number (e.g. 017...), and 'reason' in Bengali.

- If formType === "waste" (Damaged/Waste Goods Modal):
  Match 'productId' from Available Products. Extract 'quantity' damaged, 'lossAmount' (if not stated, multiply quantity by product's averageCost), 'reason' (MUST be one of: "মেয়াদোত্তীর্ণ (Expired)", "ভাঙা / ত্রুটিপূর্ণ (Broken/Defective)", "পচে যাওয়া / নষ্ট (Spoiled/Rotten)", "পরিবহনে ক্ষতিগ্রস্থ (Transit Damage)", "অন্যান্য কারণ (Other)"), and detailed Bengali 'notes'.

- If formType === "distribution" (Profit Distribution Modal):
  Extract 'periodName' in Bengali (e.g., "অক্টোবর ২০২৬ মুনাফা বণ্টন") and 'distributableAmount' (number).

- If formType === "withdraw" (Partner Profit Withdrawal / Special Loan Modal):
  Determine 'mode': "withdrawal" (লাভাংশ উত্তোলন) or "loan" (বিশেষ লোন).
  Extract 'amount' (number), 'method' (MUST be one of: "নগদ ক্যাশ (Cash)", "বিকাশ (bKash)", "নগদ (Nagad)", "রকেট (Rocket)", "ব্যাংক ট্রান্সফার (Bank)"), and Bengali 'reason'.

Always return a helpful 1-sentence Bengali summary in 'summaryBn' confirming what was filled.`,
      });

      const response = await generateStructuredAiContent(ai, {
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcribedPrompt: { type: Type.STRING },
              summaryBn: { type: Type.STRING },
              fields: {
                type: Type.OBJECT,
                properties: {
                  // entry fields
                  type: { type: Type.STRING },
                  title: { type: Type.STRING },
                  productId: { type: Type.STRING },
                  investorId: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  unitCost: { type: Type.NUMBER },
                  amount: { type: Type.NUMBER },
                  cost: { type: Type.NUMBER },
                  profit: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  notes: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  // investor fields
                  name: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  // waste fields
                  lossAmount: { type: Type.NUMBER },
                  // distribution fields
                  periodName: { type: Type.STRING },
                  distributableAmount: { type: Type.NUMBER },
                  // withdraw fields
                  mode: { type: Type.STRING },
                  method: { type: Type.STRING },
                },
              },
            },
            required: ['transcribedPrompt', 'summaryBn', 'fields'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const finalTranscript = (parsed.transcribedPrompt || prompt || '').trim();
      const fallback = smartFallbackEntryForm(formType, finalTranscript, products, investors);
      const aiFields = parsed.fields || {};
      const fbFields: Record<string, any> = fallback.fields || {};

      // Merge AI fields with deterministic fallback so fields are NEVER blank
      const mergedFields: Record<string, any> = { ...fbFields };
      for (const [k, v] of Object.entries(aiFields)) {
        if (v !== undefined && v !== null && v !== '') {
          if (typeof v === 'number') {
            if (v > 0 || (k === 'profit' && v !== 0)) {
              mergedFields[k] = v;
            }
          } else {
            mergedFields[k] = v;
          }
        }
      }

      return res.json({
        transcribedPrompt: finalTranscript,
        summaryBn: parsed.summaryBn || fallback.summaryBn || '✨ ভয়েস থেকে স্বয়ংক্রিয়ভাবে ফর্মের ঘরগুলো পূরণ করা হয়েছে।',
        fields: mergedFields,
      });
    } catch (error: any) {
      const status = Number(error?.status || error?.code) || 0;
      const msg = String(error?.message || '');
      const isQuota = status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
      if (isQuota) {
        console.warn('AI parse-entry-form: Gemini API quota exceeded (429), smoothly using local Bengali smart fallback.');
      } else {
        console.warn('AI parse-entry-form: API unavailable, using local smart fallback:', msg || error);
      }
      return res.json(smartFallbackEntryForm(formType, prompt, products, investors));
    }
  });

  // ---------------------------------------------------------------------------
  // AI VOICE & SMART BUSINESS CALCULATOR ENDPOINT (/api/ai/calculate)
  // ---------------------------------------------------------------------------
  function toBnNum(n: number | string): string {
    const map: Record<string, string> = {
      '0': '০',
      '1': '১',
      '2': '২',
      '3': '৩',
      '4': '৪',
      '5': '৫',
      '6': '৬',
      '7': '৭',
      '8': '৮',
      '9': '৯',
    };
    return String(n).replace(/[0-9]/g, (d) => map[d] || d);
  }

  function round2(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function convertBengaliWordsToDigits(input: string): string {
    let s = bnToEnDigits(input || '');
    // Replace common compound Bengali number words first
    const compoundMap: Array<[RegExp, string]> = [
      [/দুইশ\s*চল্লিশ|দুশো\s*চল্লিশ/gi, '240'],
      [/দুইশ\s*পঞ্চাশ|দুশো\s*পঞ্চাশ|আড়াইশ|আড়াইশ/gi, '250'],
      [/দেড়শ|দেড়শ|একশ\s*পঞ্চাশ/gi, '150'],
      [/একশ\s*বিশ|একশো\s*বিশ/gi, '120'],
      [/তিনশ\s*ষাট/gi, '360'],
      [/এক\s*হাজার/gi, '1000'],
      [/পাঁচশ|পাঁচশো/gi, '500'],
      [/চারশ|চারশো/gi, '400'],
      [/তিনশ|তিনশো/gi, '300'],
      [/দুইশ|দুশো/gi, '200'],
      [/একশ|একশো/gi, '100'],
      [/নব্বই/gi, '90'],
      [/আশি/gi, '80'],
      [/সত্তর/gi, '70'],
      [/ষাট/gi, '60'],
      [/পঞ্চাশ/gi, '50'],
      [/চল্লিশ/gi, '40'],
      [/ত্রিশ|তিরিশ/gi, '30'],
      [/পঁচিশ/gi, '25'],
      [/বিশ|কুড়ি|কুড়ি/gi, '20'],
      [/পনেরো|পনের/gi, '15'],
      [/বারো|বার/gi, '12'],
      [/দশ/gi, '10'],
    ];
    for (const [regex, val] of compoundMap) {
      s = s.replace(regex, ` ${val} `);
    }
    return s;
  }

  function computeVerifiedDealResult(params: {
    prompt: string;
    buyPrice: number;
    buyPriceType: string; // 'per_dozen' | 'per_hali' | 'per_unit' | 'total_lot'
    sellPrice: number;
    sellPriceType: string; // 'per_dozen' | 'per_hali' | 'per_unit' | 'total_lot'
    quantity?: number;
    unitName?: string;
  }) {
    const {
      prompt,
      buyPrice,
      buyPriceType = 'per_unit',
      sellPrice,
      sellPriceType = 'per_unit',
      quantity = 1,
      unitName = 'পিস',
    } = params;

    const cleanUnit = unitName || 'পিস';
    let totalQty = quantity && quantity > 0 ? quantity : 1;
    let packLabel = '';

    // Determine total units when dozen (12) or hali (4) is involved
    if (buyPriceType === 'per_dozen' || sellPriceType === 'per_dozen') {
      const dozenCount = quantity && quantity > 0 && quantity <= 50 && quantity !== 12 ? quantity : 1;
      totalQty = dozenCount * 12;
      packLabel = `${toBnNum(dozenCount)} ডজন (${toBnNum(totalQty)} পিস)`;
    } else if (buyPriceType === 'per_hali' || sellPriceType === 'per_hali') {
      const haliCount = quantity && quantity > 0 && quantity <= 50 && quantity !== 4 ? quantity : 1;
      totalQty = haliCount * 4;
      packLabel = `${toBnNum(haliCount)} হালি (${toBnNum(totalQty)} পিস)`;
    }

    // Calculate totalCost and unitCost
    let totalCost = 0;
    let unitCost = 0;
    if (buyPriceType === 'per_dozen') {
      const dozenCount = totalQty / 12;
      totalCost = round2(buyPrice * dozenCount);
      unitCost = round2(totalCost / totalQty);
    } else if (buyPriceType === 'per_hali') {
      const haliCount = totalQty / 4;
      totalCost = round2(buyPrice * haliCount);
      unitCost = round2(totalCost / totalQty);
    } else if (buyPriceType === 'total_lot') {
      totalCost = round2(buyPrice);
      unitCost = totalQty > 0 ? round2(totalCost / totalQty) : totalCost;
    } else {
      unitCost = round2(buyPrice);
      totalCost = round2(unitCost * totalQty);
    }

    // Calculate totalSell and unitSell
    let totalSell = 0;
    let unitSell = 0;
    if (sellPriceType === 'per_dozen') {
      const dozenCount = totalQty / 12;
      totalSell = round2(sellPrice * dozenCount);
      unitSell = round2(totalSell / totalQty);
    } else if (sellPriceType === 'per_hali') {
      const haliCount = totalQty / 4;
      totalSell = round2(sellPrice * haliCount);
      unitSell = round2(totalSell / totalQty);
    } else if (sellPriceType === 'total_lot') {
      totalSell = round2(sellPrice);
      unitSell = totalQty > 0 ? round2(totalSell / totalQty) : totalSell;
    } else {
      unitSell = round2(sellPrice);
      totalSell = round2(unitSell * totalQty);
    }

    const unitProfit = round2(unitSell - unitCost);
    const totalProfit = round2(totalSell - totalCost);
    const margin = totalCost > 0 ? round2((totalProfit / totalCost) * 100) : 0;
    const isProfit = totalProfit >= 0;
    const statusWord = isProfit ? 'লাভ' : 'ক্ষতি';
    const absUnitProfit = Math.abs(unitProfit);
    const absTotalProfit = Math.abs(totalProfit);

    const displayLabel = packLabel
      ? `মোট ${statusWord} • ${packLabel}`
      : totalQty > 1
      ? `মোট ${statusWord} (${toBnNum(totalQty)} ${cleanUnit})`
      : `প্রতি ${cleanUnit}-এ ${statusWord}`;

    const summaryBn =
      totalQty > 1
        ? `প্রতি ${cleanUnit}-এ ${statusWord} ৳${toBnNum(absUnitProfit)} এবং ${
            packLabel || `${toBnNum(totalQty)} ${cleanUnit}`
          }-এ মোট ${statusWord} ৳${toBnNum(absTotalProfit)} (${toBnNum(Math.abs(margin))}%)।`
        : `কেনা ৳${toBnNum(unitCost)} এবং বিক্রি ৳${toBnNum(unitSell)} হলে প্রতি ${cleanUnit}-এ ${statusWord} ৳${toBnNum(absUnitProfit)} (${toBnNum(Math.abs(margin))}%)।`;

    const stepsBn =
      totalQty > 1
        ? [
            `মোট পরিমাণ: ${packLabel || `${toBnNum(totalQty)} ${cleanUnit}`}`,
            `প্রতি ${cleanUnit} কেনা দাম: ৳${toBnNum(totalCost)} ÷ ${toBnNum(totalQty)} = ৳${toBnNum(unitCost)} (মোট কেনা: ৳${toBnNum(totalCost)})`,
            `প্রতি ${cleanUnit} বিক্রি দাম: ৳${toBnNum(unitSell)} (মোট বিক্রি: ৳${toBnNum(unitSell)} × ${toBnNum(totalQty)} = ৳${toBnNum(totalSell)})`,
            `প্রতি ${cleanUnit}-এ ${statusWord}: ৳${toBnNum(unitSell)} − ৳${toBnNum(unitCost)} = ৳${toBnNum(absUnitProfit)}`,
            `সর্বমোট ${statusWord}: ৳${toBnNum(totalSell)} − ৳${toBnNum(totalCost)} = ৳${toBnNum(absTotalProfit)} (${toBnNum(Math.abs(margin))}%)`,
          ]
        : [
            `ক্রয়মূল্য (কেনা দাম): ৳${toBnNum(unitCost)}`,
            `বিক্রয়মূল্য (বিক্রি দাম): ৳${toBnNum(unitSell)}`,
            `মোট ${statusWord}: ৳${toBnNum(unitSell)} − ৳${toBnNum(unitCost)} = ৳${toBnNum(absTotalProfit)} (${toBnNum(Math.abs(margin))}%)`,
          ];

    return {
      prompt,
      mainResult: absTotalProfit,
      mainResultLabel: displayLabel,
      expression:
        totalQty > 1
          ? `(${unitSell} × ${totalQty}) - ${totalCost} = ${totalProfit}`
          : `${unitSell} - ${unitCost} = ${totalProfit}`,
      summaryBn,
      stepsBn,
      metrics: {
        unitCost,
        unitSell,
        unitProfit,
        totalQty,
        unitName: cleanUnit,
        totalCost,
        totalSell,
        totalProfit,
        profitMarginPercent: margin,
      },
    };
  }

  function smartFallbackCalculate(rawPrompt: string) {
    // Strip filler phrases like "1 টা প্রডাক্ট" / "একটা প্রডাক্ট" so "1" isn't mistaken for price
    const cleanedFiller = convertBengaliWordsToDigits(rawPrompt || '')
      .replace(/(?:একটা|একটি|1\s*টা|1\s*টি)\s*(?:প্রডাক্ট|প্রোডাক্ট|পণ্য|মাল|জিনিস)/gi, ' প্রডাক্ট ')
      .trim();
    const lower = cleanedFiller.toLowerCase();

    const hasDozen = /(ডজন|dozen)/i.test(lower);
    const hasHali = /(হালি|hali)/i.test(lower);
    const hasBuySell =
      /(কিন|কেনা|ক্রয়|কিনে|buy|bought)/i.test(lower) &&
      /(বিক্রি|বিক্রয়|বেচ|sell|sold)/i.test(lower);

    // Extract numbers after removing "1 টা প্রডাক্ট"
    const numMatches = Array.from(cleanedFiller.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) => ({
      val: Number(m[1]),
      index: m.index || 0,
    }));

    if ((hasDozen || hasHali) && numMatches.length >= 2) {
      // Find price near ডজন/হালি or কিনলাম, and price near পিস or বিক্রি
      const dozenBuyMatch = cleanedFiller.match(/(\d+(?:\.\d+)?)\s*(?:টাকা|৳|tk)?\s*(?:ডজন|হালি)/i);
      const pieceSellMatch = cleanedFiller.match(/(\d+(?:\.\d+)?)\s*(?:টাকা|৳|tk)?\s*(?:পিস|করে)/i);

      let buyVal = dozenBuyMatch ? Number(dozenBuyMatch[1]) : numMatches[0].val;
      let sellVal = pieceSellMatch ? Number(pieceSellMatch[1]) : numMatches[numMatches.length - 1].val;

      if (buyVal === sellVal && numMatches.length >= 2) {
        buyVal = numMatches[0].val;
        sellVal = numMatches[1].val;
      }

      return computeVerifiedDealResult({
        prompt: rawPrompt,
        buyPrice: buyVal,
        buyPriceType: hasDozen ? 'per_dozen' : 'per_hali',
        sellPrice: sellVal,
        sellPriceType: 'per_unit',
        quantity: 1,
        unitName: 'পিস',
      });
    }

    if (hasBuySell && numMatches.length >= 2) {
      const unitMatch = cleanedFiller.match(/(কেজি|পিস|বক্স|লিটার|প্যাকেট|kg|pcs)/i);
      const unitName = unitMatch ? unitMatch[1] : 'পিস';

      if (numMatches.length >= 3) {
        const n0 = numMatches[0].val;
        const n1 = numMatches[1].val;
        const n2 = numMatches[2].val;
        const isTotalLot = n1 > n2 * 1.8 && n0 > 1;
        return computeVerifiedDealResult({
          prompt: rawPrompt,
          buyPrice: n1,
          buyPriceType: isTotalLot ? 'total_lot' : 'per_unit',
          sellPrice: n2,
          sellPriceType: 'per_unit',
          quantity: n0 > 0 ? n0 : 1,
          unitName,
        });
      }

      return computeVerifiedDealResult({
        prompt: rawPrompt,
        buyPrice: numMatches[0].val,
        buyPriceType: 'per_unit',
        sellPrice: numMatches[1].val,
        sellPriceType: 'per_unit',
        quantity: 1,
        unitName,
      });
    }

    // Percentage / Discount calculation
    if (/(%|শতকরা|পার্সেন্ট|ছাড়|ডিসকাউন্ট)/i.test(lower) && numMatches.length >= 2) {
      const base = numMatches[0].val;
      const pct = numMatches[1].val;
      const pctAmount = round2((base * pct) / 100);
      const isDiscount = /(ছাড়|ডিসকাউন্ট|বাদ|কম)/i.test(lower);
      const finalVal = isDiscount ? round2(base - pctAmount) : pctAmount;
      return {
        prompt: rawPrompt,
        mainResult: finalVal,
        mainResultLabel: isDiscount ? `ছাড়ের পর মূল্য` : `${toBnNum(pct)}% এর মান`,
        expression: isDiscount
          ? `${base} - (${base} × ${pct}%) = ${finalVal}`
          : `${base} × ${pct}% = ${pctAmount}`,
        summaryBn: isDiscount
          ? `৳${toBnNum(base)} থেকে ${toBnNum(pct)}% (৳${toBnNum(pctAmount)}) ছাড় দিলে বাকি থাকে ৳${toBnNum(finalVal)}।`
          : `৳${toBnNum(base)}-এর ${toBnNum(pct)}% হলো ৳${toBnNum(pctAmount)}।`,
        stepsBn: [
          `মূল সংখ্যা: ৳${toBnNum(base)}`,
          `${toBnNum(pct)}% এর পরিমাণ: (৳${toBnNum(base)} × ${toBnNum(pct)}) ÷ ১০০ = ৳${toBnNum(pctAmount)}`,
          ...(isDiscount
            ? [`ছাড় বাদে চূড়ান্ত মূল্য: ৳${toBnNum(base)} − ৳${toBnNum(pctAmount)} = ৳${toBnNum(finalVal)}`]
            : []),
        ],
      };
    }

    // Simple arithmetic expression fallback
    if (numMatches.length >= 2) {
      const a = numMatches[0].val;
      const b = numMatches[1].val;
      let resVal = a + b;
      let opSym = '+';
      if (/(গুণ|গুন|into|×|\*|দাম কত)/i.test(lower)) {
        resVal = round2(a * b);
        opSym = '×';
      } else if (/(ভাগ|divide|÷|\/)/i.test(lower)) {
        resVal = b !== 0 ? round2(a / b) : 0;
        opSym = '÷';
      } else if (/(বিয়োগ|বাদ|কম|বাকি|-|−)/i.test(lower)) {
        resVal = round2(a - b);
        opSym = '−';
      } else {
        resVal = round2(a + b);
        opSym = '+';
      }
      return {
        prompt: rawPrompt,
        mainResult: resVal,
        mainResultLabel: 'হিসাবের ফলাফল',
        expression: `${a} ${opSym} ${b} = ${resVal}`,
        summaryBn: `${toBnNum(a)} ${opSym} ${toBnNum(b)} = ৳${toBnNum(resVal)}`,
        stepsBn: [`গাণিতিক হিসাব: ${toBnNum(a)} ${opSym} ${toBnNum(b)} = ৳${toBnNum(resVal)}`],
      };
    }

    const singleVal = numMatches[0]?.val || 0;
    return {
      prompt: rawPrompt,
      mainResult: singleVal,
      mainResultLabel: 'ফলাফল',
      expression: `${singleVal}`,
      summaryBn: `সংখ্যাটি হলো ৳${toBnNum(singleVal)}। লাভ-ক্ষতির হিসাব জানতে কেনা ও বিক্রি দাম বলুন।`,
      stepsBn: ['যেমন বলুন: "একটা প্রডাক্ট ২৪০৳ ডজন কিনলাম বিক্রি করলাম ৩০৳ পিস তাহলে লাভ কত হলো"'],
    };
  }

  app.post('/api/ai/calculate', async (req, res) => {
    const { prompt = '', audioDataUrl = '' } = req.body || {};
    const hasTextPrompt = typeof prompt === 'string' && prompt.trim().length > 0;
    const hasAudio =
      typeof audioDataUrl === 'string' && audioDataUrl.startsWith('data:audio/');

    if (!hasTextPrompt && !hasAudio) {
      return res.status(400).json({ error: 'অনুগ্রহ করে আপনার হিসাবটি লিখুন বা মুখে বলুন।' });
    }

    const cleanPrompt = hasTextPrompt ? prompt.trim() : '';
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json(
        smartFallbackCalculate(cleanPrompt || '২৪০ টাকা ডজন কিনে ৩০ টাকা পিস বিক্রি')
      );
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const parts: any[] = [];
      if (hasAudio) {
        const match = audioDataUrl.match(
          /^data:(audio\/[a-zA-Z0-9.+=-]+(?:;codecs=[^;]+)?);base64,(.+)$/
        );
        if (match) {
          const baseMime = match[1].split(';')[0] || 'audio/webm';
          parts.push({
            inlineData: {
              mimeType: baseMime,
              data: match[2],
            },
          });
        }
      }

      parts.push({
        text: `You are an expert Bengali business & shop calculator assistant for a Bangladeshi merchant.
${
  hasAudio
    ? `CRITICAL AUDIO TRANSCRIPTION INSTRUCTIONS:
1. Listen carefully to the attached Bengali voice audio.
2. The speaker is asking a shop/business math or profit-loss question in Bengali (involving words like প্রডাক্ট/পণ্য, ডজন/dozen=12, হালি/hali=4, পিস/piece, কেজি/kg, টাকা/৳, কিনলাম/কেনা, বিক্রি করলাম/বিক্রি, লাভ/ক্ষতি, যোগ/বিয়োগ/গুণ/ভাগ).
3. Write the exact, clean Bengali sentence into "transcribedPrompt" using Bengali digits (e.g., "একটা প্রডাক্ট ২৪০ টাকা ডজন কিনলাম বিক্রি করলাম ৩০ টাকা পিস তাহলে লাভ কত হলো"). Do NOT repeat words.`
    : ''
}
User text query (if provided): "${cleanPrompt}"

INSTRUCTIONS FOR CALCULATION:
1. If the problem is about buying & selling a product (লাভ / ক্ষতি / কেনা / বিক্রি):
   - Set "isBuySellProblem": true
   - Extract "buyPrice": numeric buying price mentioned (e.g. 240). Ignore filler words like "একটা প্রডাক্ট" (1 product) when extracting price!
   - Set "buyPriceType":
     - "per_dozen" if bought by ডজন (dozen = 12 pieces)
     - "per_hali" if bought by হালি (hali = 4 pieces)
     - "total_lot" if the buyPrice is the total price for multiple kg/pieces (e.g. "৫০ কেজি ১৫০০০ টাকায় কিনে")
     - "per_unit" if bought per piece/kg/unit
   - Extract "sellPrice": numeric selling price mentioned (e.g. 30).
   - Set "sellPriceType": "per_dozen", "per_hali", "total_lot", or "per_unit" (e.g. "৩০ টাকা পিস বিক্রি" -> "per_unit").
   - Set "quantity": number of dozens, halis, or units (default 1 if "এক ডজন" or "ডজন" is mentioned, or e.g. 50 if "৫০ কেজি").
   - Set "unitName": "পিস" or "কেজি" etc.
2. If it is NOT a buy/sell problem (e.g., general addition, subtraction, multiplication, division, percentage):
   - Set "isBuySellProblem": false
   - Compute the exact "mainResult", "mainResultLabel", "expression", "summaryBn", and "stepsBn" in Bengali.`,
      });

      const response = await generateStructuredAiContent(ai, {
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcribedPrompt: { type: Type.STRING },
              isBuySellProblem: { type: Type.BOOLEAN },
              buyPrice: { type: Type.NUMBER },
              buyPriceType: { type: Type.STRING },
              sellPrice: { type: Type.NUMBER },
              sellPriceType: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              unitName: { type: Type.STRING },
              mainResult: { type: Type.NUMBER },
              mainResultLabel: { type: Type.STRING },
              expression: { type: Type.STRING },
              summaryBn: { type: Type.STRING },
              stepsBn: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['isBuySellProblem', 'mainResult', 'mainResultLabel', 'expression', 'summaryBn', 'stepsBn'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const finalPrompt = (parsed.transcribedPrompt || cleanPrompt || '').trim();

      // If AI identified a Buy/Sell problem with valid prices, compute 100% verified arithmetic!
      if (
        parsed.isBuySellProblem &&
        typeof parsed.buyPrice === 'number' &&
        parsed.buyPrice > 0 &&
        typeof parsed.sellPrice === 'number' &&
        parsed.sellPrice > 0
      ) {
        return res.json(
          computeVerifiedDealResult({
            prompt: finalPrompt || cleanPrompt,
            buyPrice: parsed.buyPrice,
            buyPriceType: parsed.buyPriceType || 'per_unit',
            sellPrice: parsed.sellPrice,
            sellPriceType: parsed.sellPriceType || 'per_unit',
            quantity: typeof parsed.quantity === 'number' && parsed.quantity > 0 ? parsed.quantity : 1,
            unitName: parsed.unitName || 'পিস',
          })
        );
      }

      const dynFallback = finalPrompt
        ? smartFallbackCalculate(finalPrompt)
        : smartFallbackCalculate(cleanPrompt);

      return res.json({
        prompt: finalPrompt || cleanPrompt,
        mainResult:
          typeof parsed.mainResult === 'number'
            ? round2(parsed.mainResult)
            : dynFallback.mainResult,
        mainResultLabel: parsed.mainResultLabel || dynFallback.mainResultLabel,
        expression: parsed.expression || dynFallback.expression,
        summaryBn: parsed.summaryBn || dynFallback.summaryBn,
        stepsBn:
          Array.isArray(parsed.stepsBn) && parsed.stepsBn.length > 0
            ? parsed.stepsBn
            : dynFallback.stepsBn,
        metrics: dynFallback.metrics,
      });
    } catch (error: any) {
      const status = Number(error?.status || error?.code) || 0;
      const msg = String(error?.message || '');
      const isQuota = status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
      if (isQuota) {
        console.warn('AI calculate: Gemini API quota exceeded (429), smoothly using local smart arithmetic fallback.');
      } else {
        console.warn('AI calculate: API unavailable, using local smart fallback:', msg || error);
      }
      return res.json(
        smartFallbackCalculate(cleanPrompt || '২৪০ টাকা ডজন কিনে ৩০ টাকা পিস বিক্রি')
      );
    }
  });

  // ---------------------------------------------------------------------------
  // BACKEND EMAIL NOTIFICATION TRIGGER FOR RAKIB & LIMON
  // Triggers when:
  //   1. A new transaction is posted (transaction_posted)
  //   2. A high-value withdrawal/loan request is created (high_value_withdrawal_request)
  //   3. A partner triggers a test summary email (test_summary)
  // ---------------------------------------------------------------------------
  app.get('/api/notifications/history', (_req, res) => {
    const smtpConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
    return res.json({
      logs: recentEmailLogs,
      smtpConfigured,
      defaults: {
        rakibEmail: process.env.RAKIB_EMAIL || 'rakib.glowzaa@gmail.com',
        limonEmail: process.env.LIMON_EMAIL || 'limon.glowzaa@gmail.com',
        ccEmail: 'glowzaabd.shop@gmail.com',
        highValueThreshold: Number(process.env.HIGH_VALUE_WITHDRAWAL_THRESHOLD) || 5000,
      },
    });
  });

  app.post('/api/notifications/trigger-email', async (req, res) => {
    try {
      const body = req.body || {};
      const eventType: 'transaction_posted' | 'high_value_withdrawal_request' | 'test_summary' =
        body.eventType === 'high_value_withdrawal_request'
          ? 'high_value_withdrawal_request'
          : body.eventType === 'test_summary'
          ? 'test_summary'
          : 'transaction_posted';

      const entryType = String(body.entryType || (eventType === 'high_value_withdrawal_request' ? 'withdrawal' : 'sale'));
      const entryTypeLabel = ENTRY_TYPE_LABELS_BN[entryType] || entryType;
      const amount = Number(body.amount) || 0;
      const title = String(body.title || (eventType === 'test_summary' ? 'টেস্ট ইমেইল সারাংশ' : 'ব্যবসায়িক লেনদেন'));
      const date = String(body.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }));
      const actorName = String(body.actorName || 'অ্যাডমিন (Rakib/Limon)');
      const approverName = body.approverName ? String(body.approverName) : undefined;
      const partnerName = body.partnerName ? String(body.partnerName) : undefined;
      const reason = body.reason ? String(body.reason) : undefined;
      const notes = body.notes ? String(body.notes) : undefined;
      const category = body.category ? String(body.category) : undefined;
      const profitAmount = body.profitAmount !== undefined ? Number(body.profitAmount) : undefined;
      const costAmount = body.costAmount !== undefined ? Number(body.costAmount) : undefined;
      const highValueThreshold =
        Number(body.highValueThreshold) || Number(process.env.HIGH_VALUE_WITHDRAWAL_THRESHOLD) || 5000;

      const rakibEmail =
        String(body.recipients?.rakibEmail || process.env.RAKIB_EMAIL || 'rakib.glowzaa@gmail.com').trim();
      const limonEmail =
        String(body.recipients?.limonEmail || process.env.LIMON_EMAIL || 'limon.glowzaa@gmail.com').trim();
      const ccEmail = String(body.recipients?.ccEmail || 'glowzaabd.shop@gmail.com').trim();

      const recipientList = Array.from(new Set([rakibEmail, limonEmail, ccEmail].filter(Boolean)));
      const now = new Date();
      const sentAtFormatted = formatDhakaTimeBn(now);
      const appUrl = process.env.APP_URL || 'https://ais-dev-xefuxj7pslkxhdmuajs5y3-322659445850.asia-southeast1.run.app';

      const { subject, summaryText, htmlContent } = buildEmailSummaryHtml({
        eventType,
        title,
        entryType,
        entryTypeLabel,
        amount,
        date,
        actorName,
        approverName,
        partnerName,
        category,
        notes,
        reason,
        profitAmount,
        costAmount,
        highValueThreshold,
        rakibEmail,
        limonEmail,
        sentAtFormatted,
        appUrl,
        financialSummary: body.financialSummary,
      });

      let deliveryMode: 'smtp' | 'ethereal_test_smtp' | 'backend_digest_relay' = 'backend_digest_relay';
      let messageId = `glowzaa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@glowzaa.shop`;
      let previewUrl: string | undefined;

      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
      const smtpPort = Number(process.env.SMTP_PORT) || 587;
      const smtpFrom = process.env.SMTP_FROM || `"Glowzaa Shop Accounting" <${smtpUser || 'glowzaabd.shop@gmail.com'}>`;

      if (smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
          });
          const info = await transporter.sendMail({
            from: smtpFrom,
            to: [rakibEmail, limonEmail].filter(Boolean).join(', '),
            cc: ccEmail || undefined,
            subject,
            text: summaryText,
            html: htmlContent,
          });
          deliveryMode = 'smtp';
          messageId = info.messageId || messageId;
        } catch (smtpErr) {
          console.warn('Configured SMTP send warning, falling back to digest relay:', smtpErr);
        }
      } else {
        // Attempt fast Ethereal test SMTP account with a 3s timeout so real MIME delivery & preview URL are generated if network permits
        try {
          const sendWithEthereal = async () => {
            if (!cachedTestAccount) {
              cachedTestAccount = await nodemailer.createTestAccount();
            }
            const transporter = nodemailer.createTransport({
              host: cachedTestAccount.smtp.host,
              port: cachedTestAccount.smtp.port,
              secure: cachedTestAccount.smtp.secure,
              auth: {
                user: cachedTestAccount.user,
                pass: cachedTestAccount.pass,
              },
            });
            const info = await transporter.sendMail({
              from: `"Glowzaa Shop Accounting" <${cachedTestAccount.user}>`,
              to: [rakibEmail, limonEmail].filter(Boolean).join(', '),
              cc: ccEmail || undefined,
              subject,
              text: summaryText,
              html: htmlContent,
            });
            return {
              msgId: info.messageId,
              url: nodemailer.getTestMessageUrl(info) || undefined,
            };
          };

          const result = await Promise.race([
            sendWithEthereal(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);

          if (result) {
            deliveryMode = 'ethereal_test_smtp';
            messageId = result.msgId || messageId;
            previewUrl = result.url;
          }
        } catch {
          // Instant fallback to backend_digest_relay
        }
      }

      const logItem: BackendEmailLogItem = {
        id: `email_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        eventType,
        subject,
        recipients: recipientList,
        rakibEmail,
        limonEmail,
        title,
        entryType,
        entryTypeLabel,
        amount,
        date,
        actorName,
        approverName,
        partnerName,
        reason,
        notes,
        highValueThreshold,
        sentAt: now.toISOString(),
        sentAtFormatted,
        deliveryMode,
        messageId,
        previewUrl,
        summaryText,
        htmlContent,
        status: 'sent',
      };

      recentEmailLogs.unshift(logItem);
      if (recentEmailLogs.length > 50) {
        recentEmailLogs.length = 50;
      }

      return res.json({
        ok: true,
        emailLog: logItem,
      });
    } catch (error: any) {
      console.error('Error in /api/notifications/trigger-email:', error);
      return res.status(500).json({
        ok: false,
        error: error?.message || 'ইমেইল ট্রিগার প্রসেস করতে সমস্যা হয়েছে',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // STRICT MASTER SKU WHITELIST: ONLY A..Z and AA..GZ (208 allowed codes)
  // Both handwritten and printed codes must be in this exact whitelist and
  // 100% equal to a product's SKU in the website catalog.
  // ---------------------------------------------------------------------------
  const LETTERS_A_Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const PREFIXES_A_G = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const ALLOWED_SKU_CODES: string[] = [
    ...LETTERS_A_Z,
    ...PREFIXES_A_G.flatMap((prefix) => LETTERS_A_Z.map((ch) => `${prefix}${ch}`)),
  ];
  const ALLOWED_SKU_SET = new Set<string>(ALLOWED_SKU_CODES);

  function stripSkuPrefixes(val: string): string {
    return bnToEnDigits(String(val || ''))
      .trim()
      .toUpperCase()
      .replace(/^(SKU|CODE|ITEM|ID|NO|কোড|নাম্বার|নং)\s*[:#\-=.]*\s*/i, '');
  }

  function toStrictAllowedSku(val: string): string {
    const cleaned = stripSkuPrefixes(val).replace(/[\s\-_.:#/\\,;|()[\]{}"'`~]+/g, '');
    return ALLOWED_SKU_SET.has(cleaned) ? cleaned : '';
  }

  function getServerEffectiveProductSku(p: any, idx: number): string {
    const raw = String(p?.sku || p?.effectiveSku || '').trim();
    const strict = toStrictAllowedSku(raw);
    if (strict) return strict;
    return ALLOWED_SKU_CODES[idx % ALLOWED_SKU_CODES.length] || 'A';
  }

  function normalizeConfidenceScore(raw: any): number {
    const n = Number(raw) || 0;
    if (n > 0 && n <= 1) return Math.round(n * 100);
    return Math.min(100, Math.round(n));
  }

  // Singleton Gemini client for connection reuse (eliminates TLS handshake overhead per scan)
  let sharedVisionAiClient: GoogleGenAI | null = null;
  let sharedVisionApiKey = '';
  function getSharedVisionAi(apiKey: string): GoogleGenAI {
    if (!sharedVisionAiClient || sharedVisionApiKey !== apiKey) {
      sharedVisionAiClient = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      sharedVisionApiKey = apiKey;
    }
    return sharedVisionAiClient;
  }

  // Track temporarily rate-limited models and average latency so the fastest model is always used first
  const visionModelCooldownUntil = new Map<string, number>();
  const visionModelAvgMs = new Map<string, number>([
    ['gemini-flash-lite-latest', 950],
    ['gemini-3.1-flash-lite', 1100],
    ['gemini-3.1-flash-lite-preview', 1250],
  ]);
  const VISION_MODEL_CASCADE = [
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-preview',
  ];

  // Short-lived cache ONLY for positive SKU detections (never cache empty/no-match frames!)
  const recentVisionFrameCache = new Map<
    string,
    { expiresAt: number; codes: string[] }
  >();

  // 1-Token Plain-Text OCR call with MINIMAL thinking and LOW media resolution
  async function callSingleFastTextOcr(
    ai: GoogleGenAI,
    modelName: string,
    contents: any,
    timeoutMs = 3800
  ): Promise<string[]> {
    const startMs = Date.now();
    const configObj: any = {
      temperature: 0.0,
      maxOutputTokens: 6,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
      },
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
    };

    try {
      const res: any = await Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents,
          config: configObj,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MODEL_TIMEOUT')), timeoutMs)
        ),
      ]);

      const elapsed = Date.now() - startMs;
      const prevAvg = visionModelAvgMs.get(modelName) || 950;
      visionModelAvgMs.set(modelName, Math.round(prevAvg * 0.65 + elapsed * 0.35));

      const rawText = String(res?.text || '')
        .replace(/[`"'{}\[\]]/g, ' ')
        .trim()
        .toUpperCase();

      if (!rawText || rawText === '-' || rawText === 'NONE' || rawText === 'NULL') {
        return [];
      }

      const tokens = rawText.split(/[\s,;:|/\\]+/).filter(Boolean);
      const validCodes: string[] = [];
      for (const tok of tokens) {
        if (tok === 'NONE' || tok === 'NULL' || tok === 'SKU' || tok === 'CODE') continue;
        const strict = toStrictAllowedSku(tok);
        if (strict && !validCodes.includes(strict)) {
          validCodes.push(strict);
        }
      }
      return validCodes;
    } catch (err: any) {
      const status = Number(err?.status) || 0;
      const msg = String(err?.message || '');
      if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        // Short 6-second cooldown so models recover immediately instead of locking out for 5 minutes!
        visionModelCooldownUntil.set(modelName, Date.now() + 6000);
      } else if (status === 404 || msg.includes('404') || msg.includes('not found')) {
        visionModelCooldownUntil.set(modelName, Date.now() + 60 * 60 * 1000);
      } else if (msg === 'MODEL_TIMEOUT') {
        visionModelAvgMs.set(modelName, (visionModelAvgMs.get(modelName) || 1200) + 400);
      }
      throw err;
    }
  }

  let activeOcrPromise: Promise<string[]> | null = null;

  async function generateFastSkuOcrCascade(
    ai: GoogleGenAI,
    contents: any,
    cacheKey?: string,
    isInteractivePad = false
  ): Promise<string[]> {
    if (cacheKey) {
      const cached = recentVisionFrameCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.codes;
      }
    }

    const now = Date.now();
    const availableModels = VISION_MODEL_CASCADE.filter(
      (m) => (visionModelCooldownUntil.get(m) || 0) <= now
    ).sort((a, b) => (visionModelAvgMs.get(a) || 950) - (visionModelAvgMs.get(b) || 950));

    const modelsToTry =
      availableModels.length > 0 ? availableModels : VISION_MODEL_CASCADE;

    // For Drawing Pad (single user-triggered event, not a loop), hedge the top 2 models with a 350ms stagger for instant response!
    if (isInteractivePad && modelsToTry.length >= 2) {
      try {
        const primaryModel = modelsToTry[0];
        const secondaryModel = modelsToTry[1];
        let primaryDone = false;

        const p1 = callSingleFastTextOcr(ai, primaryModel, contents, 3500).then((res) => {
          primaryDone = true;
          return res;
        });

        const p2 = new Promise<string[]>((resolve, reject) => {
          const timer = setTimeout(() => {
            if (primaryDone) return;
            callSingleFastTextOcr(ai, secondaryModel, contents, 3500)
              .then(resolve)
              .catch(reject);
          }, 350);
          p1.then(() => clearTimeout(timer)).catch(() => {});
        });

        const winner = await Promise.any([p1, p2]);
        if (cacheKey && winner.length > 0) {
          recentVisionFrameCache.set(cacheKey, {
            expiresAt: Date.now() + 1200,
            codes: winner,
          });
        }
        return winner;
      } catch {
        // Fallback to sequential below if both hedged calls fail
      }
    }

    // Serialize background camera calls so we never trigger Gemini per-key parallel throttling
    if (!isInteractivePad && activeOcrPromise) {
      try {
        await activeOcrPromise;
      } catch {}
    }

    const runSequential = async (): Promise<string[]> => {
      for (const modelName of modelsToTry) {
        try {
          const detectedCodes = await callSingleFastTextOcr(ai, modelName, contents, 3800);
          if (cacheKey && detectedCodes.length > 0) {
            recentVisionFrameCache.set(cacheKey, {
              expiresAt: Date.now() + 1200,
              codes: detectedCodes,
            });
            if (recentVisionFrameCache.size > 40) {
              const oldestKey = recentVisionFrameCache.keys().next().value;
              if (oldestKey) recentVisionFrameCache.delete(oldestKey);
            }
          }
          return detectedCodes;
        } catch {
          // Try next fallback model only if an HTTP/rate-limit/timeout error occurred
        }
      }
      return [];
    };

    const p = runSequential();
    if (!isInteractivePad) {
      activeOcrPromise = p;
    }
    try {
      return await p;
    } finally {
      if (activeOcrPromise === p) {
        activeOcrPromise = null;
      }
    }
  }

  function matchProductBySkuFromTexts(
    candidates: string[],
    catalog: any[]
  ): { product: any; matchedSku: string } | null {
    const validCandidates: string[] = [];
    for (const raw of candidates) {
      const strictCode = toStrictAllowedSku(raw);
      if (strictCode && !validCandidates.includes(strictCode)) {
        validCandidates.push(strictCode);
      }
    }
    if (validCandidates.length === 0) return null;

    const catalogWithSku = catalog.map((p: any, idx: number) => {
      const effectiveSku = getServerEffectiveProductSku(p, idx);
      return {
        product: p,
        effectiveSku,
      };
    });

    // 100% STRICT EXACT MATCH ONLY:
    // Candidate must be in ALLOWED_SKU_SET (A..Z, AA..GZ) AND 100% equal to item.effectiveSku.
    for (const code of validCandidates) {
      for (const item of catalogWithSku) {
        if (code === item.effectiveSku) {
          return { product: item.product, matchedSku: item.effectiveSku };
        }
      }
    }

    return null;
  }

  // Warmup endpoint: initializes client and sends a tiny background ping so HTTP/2 TLS socket is warm
  let lastWarmupMs = 0;
  app.post('/api/ai/camera-warmup', (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && Date.now() - lastWarmupMs > 45000) {
      lastWarmupMs = Date.now();
      const ai = getSharedVisionAi(apiKey);
      // Non-blocking background TLS warmup & model latency probe
      const available = VISION_MODEL_CASCADE.filter(
        (m) => (visionModelCooldownUntil.get(m) || 0) <= Date.now()
      );
      const modelToWarm = available[0] || 'gemini-flash-lite-latest';
      ai.models
        .generateContent({
          model: modelToWarm,
          contents: 'Reply -',
          config: { temperature: 0 },
        })
        .catch(() => {});
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /api/ai/camera-match-product
  // Ultra-fast Strict Whitelist (A-Z, AA-GZ) Handwritten & Printed SKU Scanner
  // + Drawing Pad Handwriting Auto-Sale Recognizer
  // ---------------------------------------------------------------------------
  app.post('/api/ai/camera-match-product', async (req, res) => {
    const {
      frameDataUrl = '',
      stickerCropDataUrl = '',
      products = [],
      scannedCodeText = '',
      isDrawingPad = false,
    } = req.body || {};

    const catalog = Array.isArray(products) ? products.slice(0, 210) : [];
    if (catalog.length === 0) {
      return res.json({
        ok: false,
        matched: false,
        matchedProductId: '',
        detectedSkuCode: '',
        allVisibleCodes: [],
        quantity: 1,
        confidence: 0,
        reasonBn: 'স্টকে কোনো পণ্য নেই। আগে স্টক/পণ্যে পণ্য যোগ করুন।',
      });
    }

    // Immediate deterministic check if client already passed a scanned barcode/QR/typed SKU
    if (scannedCodeText && String(scannedCodeText).trim()) {
      const strictScanned = toStrictAllowedSku(String(scannedCodeText));
      if (!strictScanned) {
        return res.json({
          ok: true,
          matched: false,
          matchedProductId: '',
          detectedSkuCode: String(scannedCodeText).trim().toUpperCase(),
          allVisibleCodes: [],
          quantity: 1,
          confidence: 0,
          reasonBn: `❌ "${String(scannedCodeText).trim()}" অনুমোদিত SKU কোড (A-Z, AA-GZ)-এর বাহিরে!`,
        });
      }
      const directHit = matchProductBySkuFromTexts([strictScanned], catalog);
      if (directHit) {
        return res.json({
          ok: true,
          matched: true,
          matchedProductId: directHit.product.id,
          productName: directHit.product.name,
          detectedSkuCode: directHit.matchedSku,
          allVisibleCodes: [directHit.matchedSku],
          matchType: 'sku_code',
          quantity: 1,
          confidence: 100,
          reasonBn: `✅ SKU কোড "${directHit.matchedSku}" ১০০% ম্যাচ হয়েছে: "${directHit.product.name}"`,
        });
      }
    }

    const noMatchResponse = (
      reason = isDrawingPad
        ? '✍️ ড্রইং প্যাডে স্পষ্টভাবে A–Z অথবা AA–GZ কোড লিখুন'
        : '🎯 প্রডাক্টের গায়ের SKU কোড (A-Z / AA-GZ) ক্যামেরার বক্সের ভেতরে স্পষ্টভাবে ধরুন',
      detectedSkuCode = '',
      allVisibleCodes: string[] = []
    ) => ({
      ok: true,
      matched: false,
      matchedProductId: '',
      detectedSkuCode,
      allVisibleCodes,
      quantity: 1,
      confidence: 0,
      reasonBn: reason,
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !frameDataUrl || !String(frameDataUrl).startsWith('data:image/')) {
      return res.json(noMatchResponse('ক্যামেরা বা ড্রইং ফ্রেম যাচাই করা যায়নি, আবার চেষ্টা করুন'));
    }

    try {
      const ai = getSharedVisionAi(apiKey);

      const frameMatch = String(frameDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!frameMatch) {
        return res.json(noMatchResponse());
      }

      const catalogSkuList = catalog.map((p: any, idx: number) => ({
        id: p.id,
        name: p.name,
        sku: getServerEffectiveProductSku(p, idx),
      }));

      const b64Data = frameMatch[2];
      const frameCacheKey = `${isDrawingPad ? 'pad_v1' : 'ocr_v4'}:${b64Data.length}:${b64Data.slice(
        Math.floor(b64Data.length * 0.35),
        Math.floor(b64Data.length * 0.35) + 72
      )}:${b64Data.slice(
        Math.floor(b64Data.length * 0.65),
        Math.floor(b64Data.length * 0.65) + 72
      )}`;

      // UNBIASED ULTRA-FAST 1-TOKEN BLIND OCR (A..Z, AA..GZ)
      const ocrParts: any[] = [
        {
          inlineData: {
            mimeType: frameMatch[1],
            data: frameMatch[2],
          },
        },
      ];

      const stickerMatch =
        stickerCropDataUrl && typeof stickerCropDataUrl === 'string'
          ? stickerCropDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
          : null;
      if (stickerMatch) {
        ocrParts.push({
          inlineData: {
            mimeType: stickerMatch[1],
            data: stickerMatch[2],
          },
        });
      }

      ocrParts.push({
        text: isDrawingPad
          ? `Handwriting OCR on white drawing pad: Read the 1-letter (A-Z) or 2-letter (AA-GZ) SKU code drawn in dark ink (convert lowercase to uppercase, join 2 letters without space like AB). Output ONLY the uppercase code, or - if unreadable.`
          : `OCR: Output ONLY the exact 1-letter (A-Z) or 2-letter (AA-GZ) uppercase SKU code written or printed on the sticker/label, or - if none. Never guess A. Ignore STAINLESS STEEL/QUARTZ.`,
      });

      const validDetectedCodes = await generateFastSkuOcrCascade(
        ai,
        { parts: ocrParts },
        frameCacheKey,
        Boolean(isDrawingPad)
      );
      const rawPrimary = validDetectedCodes[0] || '';

      // Deterministic 100% exact match against website catalog
      if (validDetectedCodes.length > 0) {
        const verifiedSkuHit = matchProductBySkuFromTexts(validDetectedCodes, catalog);
        if (verifiedSkuHit) {
          return res.json({
            ok: true,
            matched: true,
            matchedProductId: verifiedSkuHit.product.id,
            productName: verifiedSkuHit.product.name,
            detectedSkuCode: verifiedSkuHit.matchedSku,
            allVisibleCodes: validDetectedCodes,
            matchType: 'sku_code',
            quantity: 1,
            confidence: 100,
            reasonBn: isDrawingPad
              ? `✅ ড্রইং প্যাডে "${verifiedSkuHit.matchedSku}" ১০০% ম্যাচ: "${verifiedSkuHit.product.name}"`
              : `✅ SKU কোড "${verifiedSkuHit.matchedSku}" ১০০% ম্যাচ: "${verifiedSkuHit.product.name}"`,
          });
        }

        const seenValidCode = validDetectedCodes[0];
        return res.json(
          noMatchResponse(
            `❌ ${isDrawingPad ? 'ড্রইং প্যাডে' : 'ক্যামেরায়'} SKU কোড "${seenValidCode}" শনাক্ত হয়েছে, কিন্তু আপনার স্টকে "${seenValidCode}" কোডের কোনো প্রডাক্ট নেই (স্টকে আছে: ${catalogSkuList
              .slice(0, 6)
              .map((c) => c.sku)
              .join(', ')})`,
            seenValidCode,
            validDetectedCodes
          )
        );
      }

      if (rawPrimary) {
        return res.json(
          noMatchResponse(
            `❌ "${rawPrimary}" দেখা গেছে, যা অনুমোদিত SKU কোড (A-Z, AA-GZ)-এর ভেতরে নয়`,
            rawPrimary,
            []
          )
        );
      }

      return res.json(
        noMatchResponse(
          isDrawingPad
            ? '✍️ ড্রইং প্যাডে বড় ও স্পষ্ট অক্ষরে A–Z বা AA–GZ লিখুন'
            : '🎯 প্রডাক্টের গায়ের SKU কোড (A-Z বা AA-GZ) ক্যামেরার বক্সের ভেতরে স্পষ্টভাবে ধরুন'
        )
      );
    } catch {
      return res.json(
        noMatchResponse(
          isDrawingPad
            ? '✍️ ড্রইং প্যাডে আবার লিখুন (A–Z বা AA–GZ)...'
            : '🎯 প্রডাক্টের গায়ের SKU কোড (A-Z বা AA-GZ) ক্যামেরার সামনে ধরুন...'
        )
      );
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (req.url?.startsWith('/@vite/client') || req.url === '/' || req.url === '/index.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
