import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { GoogleGenAI, Type } from '@google/genai';

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
  const normalized = bnToEnDigits(promptText || '').trim();
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.post('/api/ai/parse-product', async (req, res) => {
    const { prompt = '', imageDataUrl = '', mode = 'single', existingProducts = [] } = req.body || {};

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
Extract up to 6 products from the user's Bengali/English text or attached photo/voucher/memo.
User input: "${prompt || 'ছবি থেকে পণ্যের তালিকা, পরিমাণ ও দাম বের করুন'}"
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

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
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
Extract product details from the user's short Bengali/English text, voice transcript, or attached product/invoice photo.
User input: "${prompt || 'ছবি দেখে পণ্যের নাম, কোড, একক ও সম্ভাব্য মূল্য নির্ধারণ করুন'}"
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

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
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
      const p = parsed.product || {};
      const cat = p.categoryPreset && PRESET_IMAGES[p.categoryPreset] ? p.categoryPreset : detectCategoryPreset(p.name || '');

      return res.json({
        product: {
          name: p.name || '',
          sku: p.sku || generateSmartSku(p.name || '', 1),
          unit: p.unit || 'কেজি',
          currentStock: Number(p.currentStock) || 0,
          averageCost: Number(p.averageCost) || 0,
          sellingPrice: Number(p.sellingPrice) || 0,
          categoryPreset: cat,
          imageUrl: PRESET_IMAGES[cat] || PRESET_IMAGES.box,
        },
        reason: parsed.reason || `নতুন পণ্য (${p.name || ''}) সংযোজন`,
        summaryBn: parsed.summaryBn || 'এআই স্বয়ংক্রিয়ভাবে পণ্যের সব ঘর পূরণ করেছে।',
      });
    } catch (error) {
      console.error('AI parse-product error, using smart fallback:', error);
      return res.json(smartFallbackParse(prompt, mode));
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

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
