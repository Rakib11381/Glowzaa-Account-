import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Product, Investor } from '../types';

export type VoiceFormType = 'entry' | 'investor' | 'waste' | 'distribution' | 'withdraw';

interface VoiceFormAssistantProps {
  formType: VoiceFormType;
  title?: string;
  placeholder?: string;
  chips?: { label: string; text: string }[];
  products?: Product[];
  investors?: Investor[];
  onApplyFields: (fields: any, summaryBn: string, transcribedPrompt: string) => void;
}

function toBnDigits(val: number | string): string {
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
  return String(val).replace(/[0-9]/g, (d) => map[d] || d);
}

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
  return String(str || '').replace(/[০-৯]/g, (d) => map[d] || d);
}

export function normalizeBengaliSpokenNumbersClient(input: string): string {
  let s = bnToEnDigits(input || '');

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

  s = s.replace(/(\d+)\s*হাজার\s*(\d+)/g, (_, th, rem) => {
    const val = Number(th) * 1000 + Number(rem);
    return ` ${val} `;
  });

  s = s.replace(/(\d+(?:\.\d+)?)\s*হাজার/g, (_, th) => {
    const val = Math.round(Number(th) * 1000);
    return ` ${val} `;
  });

  s = s.replace(/(\d+)\s*(?:শত|শো)/g, (_, hun) => {
    const val = Number(hun) * 100;
    return ` ${val} `;
  });

  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:লাখ|লক্ষ)/g, (_, l) => {
    const val = Math.round(Number(l) * 100000);
    return ` ${val} `;
  });

  return s.replace(/\s+/g, ' ').trim();
}

function clientFallbackEntryForm(
  formType: VoiceFormType,
  rawPrompt: string,
  products: Product[] = [],
  investors: Investor[] = []
) {
  const normalized = normalizeBengaliSpokenNumbersClient(rawPrompt || '');
  const nums = Array.from(normalized.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) => Number(m[1]));

  const matchedProduct =
    (products || []).find((p) => {
      const pName = String(p?.name || '').toLowerCase();
      return pName && normalized.toLowerCase().includes(pName);
    }) ||
    (products || []).find((p) => {
      const words = String(p?.name || '')
        .split(/\s+/)
        .filter((w) => w.length >= 2);
      return words.some((w) => normalized.includes(w));
    });

  const matchedInvestor = (investors || []).find((inv) => {
    const iName = String(inv?.name || '').toLowerCase();
    if (iName && normalized.toLowerCase().includes(iName)) return true;
    if (
      (iName.includes('rakib') || iName.includes('রাকিব')) &&
      (normalized.toLowerCase().includes('rakib') || normalized.includes('রাকিব'))
    )
      return true;
    if (
      (iName.includes('limon') || iName.includes('লিমন')) &&
      (normalized.toLowerCase().includes('limon') || normalized.includes('লিমন'))
    )
      return true;
    return false;
  });

  if (formType === 'investor') {
    const rawDigits = bnToEnDigits(rawPrompt || '');
    const phoneMatch = rawDigits.match(/(01\d{3}[-\s]?\d{6}|\d{11})/);
    const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, '') : '';
    const cleanName =
      rawDigits
        .replace(/(01\d{3}[-\s]?\d{6}|\d+)/g, '')
        .replace(/(নতুন|অংশীদার|ইনভেস্টর|পার্টনার|নাম|ফোন|নাম্বার|নম্বর|মোবাইল|যোগ|করুন)/gi, '')
        .replace(/[-:(),/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'নতুন অংশীদার';
    return {
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
      summaryBn: `✨ নষ্ট পণ্য (${prod?.name || 'নির্বাচিত পণ্য'}) পরিমাণ ${toBnDigits(qty)} এবং ক্ষতি ৳${toBnDigits(lossAmount)} বসানো হয়েছে।`,
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
    const cleanPeriod =
      normalized
        .replace(/(\d+(?:\.\d+)?)/g, '')
        .replace(/(টাকা|মুনাফা|লাভ|বণ্টন|ভাগ|করুন|৳)/gi, '')
        .replace(/\s+/g, ' ')
        .trim() ||
      `${new Date().toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })} মুনাফা বণ্টন`;
    return {
      summaryBn: `✨ মুনাফা বণ্টনের মেয়াদ "${cleanPeriod}" ও পরিমাণ ৳${toBnDigits(amount)} বসানো হয়েছে।`,
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
      summaryBn: `✨ ${isLoan ? 'বিশেষ লোন' : 'লাভাংশ উত্তোলন'} ৳${toBnDigits(amount)} (${method}) স্বয়ংক্রিয়ভাবে বসানো হয়েছে।`,
      fields: {
        mode: isLoan ? 'loan' : 'withdrawal',
        amount,
        method,
        reason: rawPrompt || (isLoan ? 'জরুরি প্রয়োজনে বিশেষ লোন গ্রহণ' : 'সাপ্তাহিক অর্জিত লাভাংশ উত্তোলন'),
      },
    };
  }

  let type: 'sale' | 'purchase' | 'expense' | 'investment' | 'withdrawal' | 'loan' = 'sale';
  if (
    /(খরচ|ভাড়া|বিল|বিদ্যুৎ|গ্যাস|মজুরি|যাতায়াত|কুরিয়ার|খাবার|নাস্তা|expense)/i.test(normalized) &&
    !/(বিক্রি|বিক্রয়)/i.test(normalized)
  ) {
    type = 'expense';
  } else if (
    /(কেনা|ক্রয়|কিনলাম|কিনেছি|মাল কেনা|purchase)/i.test(normalized) &&
    !/(বিক্রি|বিক্রয়)/i.test(normalized)
  ) {
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
        unitPrice =
          type === 'sale'
            ? Number(matchedProduct.sellingPrice) || Number(matchedProduct.averageCost) * 1.25 || 0
            : Number(matchedProduct.averageCost) || 0;
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
    sale: matchedProduct ? `${matchedProduct.name} বিক্রয়` : rawPrompt ? rawPrompt.slice(0, 45) : 'পণ্য বিক্রয়',
    purchase: matchedProduct ? `${matchedProduct.name} ক্রয়` : rawPrompt ? rawPrompt.slice(0, 45) : 'পণ্য স্টক ক্রয়',
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

  const detectedSeller =
    normalized.includes('লিমন') || normalized.toLowerCase().includes('limon')
      ? 'Limon'
      : normalized.includes('রাকিব') || normalized.toLowerCase().includes('rakib')
      ? 'Rakib'
      : undefined;

  return {
      summaryBn: `✨ ভয়েস অনুযায়ী "${defaultTitles[type]}"${amount > 0 ? ` (মোট ৳${toBnDigits(amount)})` : ''}${detectedSeller ? ` [বিক্রেতা: ${detectedSeller === 'Limon' ? 'লিমন' : 'রাকিব'}]` : ''} ফর্মের ঘরে বসানো হয়েছে!`,
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
        seller: detectedSeller,
        notes: rawPrompt,
        reason: rawPrompt || defaultTitles[type],
      },
    };
}

export default function VoiceFormAssistant({
  formType,
  title = '✨ AI ভয়েস ও স্মার্ট অটো-ফিল (মুখে বলুন বা ১ লাইনে লিখুন)',
  placeholder = 'মুখে বলুন অথবা সংক্ষেপে লিখুন...',
  chips = [],
  products = [],
  investors = [],
  onApplyFields,
}: VoiceFormAssistantProps) {
  const [promptText, setPromptText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [summaryNote, setSummaryNote] = useState('');
  const [errorNote, setErrorNote] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  function cleanupAudio() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (silenceRafRef.current) {
      cancelAnimationFrame(silenceRafRef.current);
      silenceRafRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  async function handleRunAiParse(overrideText?: string, audioDataUrl?: string) {
    const textToUse = (overrideText !== undefined ? overrideText : promptText).trim();
    if (!textToUse && !audioDataUrl) {
      setErrorNote('অনুগ্রহ করে "মুখে বলুন" বাটনে চাপ দিয়ে কথা বলুন অথবা বক্সে লিখুন।');
      return;
    }

    setErrorNote('');
    setSummaryNote('');
    setIsParsing(true);

    try {
      const response = await fetch('/api/ai/parse-entry-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType,
          prompt: textToUse,
          audioDataUrl: audioDataUrl || '',
          products: products.slice(0, 25),
          investors,
        }),
      });

      let data: any = null;
      if (response.ok) {
        data = await response.json();
      }

      const finalPrompt = (data?.transcribedPrompt || textToUse || '').trim();
      if (finalPrompt) {
        setPromptText(finalPrompt);
      }

      const clientFallback = clientFallbackEntryForm(formType, finalPrompt, products, investors);
      const serverFields = data?.fields || {};
      const mergedFields: Record<string, any> = { ...clientFallback.fields };

      for (const [k, v] of Object.entries(serverFields)) {
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

      const msg =
        data?.summaryBn ||
        clientFallback.summaryBn ||
        '✨ ভয়েস অনুযায়ী ফর্মের সব ঘর স্বয়ংক্রিয়ভাবে পূরণ করা হয়েছে!';
      setSummaryNote(msg);
      onApplyFields(mergedFields, msg, finalPrompt);
    } catch {
      if (textToUse) {
        const clientFallback = clientFallbackEntryForm(formType, textToUse, products, investors);
        setSummaryNote(clientFallback.summaryBn);
        onApplyFields(clientFallback.fields, clientFallback.summaryBn, textToUse);
      } else {
        setErrorNote('ভয়েস অটো-ফিল করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
      }
    } finally {
      setIsParsing(false);
    }
  }

  async function handleToggleVoice() {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      } else {
        const captured = liveTranscriptRef.current.trim();
        cleanupAudio();
        setIsListening(false);
        if (captured) {
          handleRunAiParse(captured);
        }
      }
      return;
    }

    setErrorNote('');
    setSummaryNote('');
    liveTranscriptRef.current = '';

    // Start parallel browser SpeechRecognition (if available) to show live words & ensure transcript is never empty
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'bn-BD';
        recognition.continuous = true;
        recognition.interimResults = true;

        let finalSegments = '';
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const seg = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              finalSegments += ' ' + seg;
            } else {
              interim += seg;
            }
          }
          const combined = (finalSegments + ' ' + interim).replace(/\s+/g, ' ').trim();
          if (combined) {
            liveTranscriptRef.current = combined;
            setPromptText(combined);
          }
        };
        recognition.onerror = () => {};
        recognition.start();
      } catch {
        // Ignore SpeechRecognition error if MediaRecorder is handling audio
      }
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];

        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        let selectedMime = '';
        for (const mt of mimeTypes) {
          if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mt)) {
            selectedMime = mt;
            break;
          }
        }

        const recorder = selectedMime
          ? new MediaRecorder(stream, { mimeType: selectedMime })
          : new MediaRecorder(stream);

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (silenceRafRef.current) {
            cancelAnimationFrame(silenceRafRef.current);
            silenceRafRef.current = null;
          }
          if (audioContextRef.current) {
            try {
              audioContextRef.current.close();
            } catch {}
            audioContextRef.current = null;
          }
          if (recognitionRef.current) {
            try {
              recognitionRef.current.onend = null;
              recognitionRef.current.stop();
            } catch {}
            recognitionRef.current = null;
          }
          setIsListening(false);

          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
          }

          const capturedText = liveTranscriptRef.current.trim();
          const chunks = audioChunksRef.current;
          if ((!chunks || chunks.length === 0) && !capturedText) {
            setErrorNote('কোনো শব্দ রেকর্ড হয়নি। আবার চেষ্টা করুন।');
            return;
          }

          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size < 300 && !capturedText) {
            setErrorNote('কথা খুব ছোট হয়েছে। অনুগ্রহ করে স্পষ্টভাবে বলুন।');
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = typeof reader.result === 'string' ? reader.result : '';
            handleRunAiParse(capturedText, base64Audio);
          };
          reader.readAsDataURL(blob);
        };

        recorder.start(250);
        setIsListening(true);
        setRecordingSec(0);

        // Set up Web Audio API silence detector so speaking automatically stops ~2.2s after user finishes talking
        try {
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const audioCtx: AudioContext = new AudioCtx();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.fftSize);
            let hasSpoken = false;
            let lastSoundTime = Date.now();
            const startTime = Date.now();

            const checkSilence = () => {
              if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
              analyser.getByteTimeDomainData(dataArray);
              let sumSquares = 0;
              for (let i = 0; i < dataArray.length; i++) {
                const norm = (dataArray[i] - 128) / 128;
                sumSquares += norm * norm;
              }
              const rms = Math.sqrt(sumSquares / dataArray.length);
              const now = Date.now();

              if (rms > 0.02 || liveTranscriptRef.current.trim().length > 2) {
                if (rms > 0.02) {
                  hasSpoken = true;
                  lastSoundTime = now;
                }
              }

              // Auto-stop if user has spoken and then remained silent for 2.2 seconds (after at least 2.2s of recording)
              if (
                (hasSpoken || liveTranscriptRef.current.trim().length > 3) &&
                now - startTime > 2200 &&
                now - lastSoundTime > 2200
              ) {
                try {
                  mediaRecorderRef.current.stop();
                } catch {}
                return;
              }

              silenceRafRef.current = requestAnimationFrame(checkSilence);
            };
            silenceRafRef.current = requestAnimationFrame(checkSilence);
          }
        } catch {
          // Ignore Web Audio analyser errors
        }

        timerRef.current = setInterval(() => {
          setRecordingSec((prev) => {
            if (prev >= 45) {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try {
                  mediaRecorderRef.current.stop();
                } catch {}
              }
              return prev;
            }
            return prev + 1;
          });
        }, 1000);
        return;
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          cleanupAudio();
          setIsListening(false);
          setErrorNote('মাইক্রোফোন অনুমতি দেওয়া হয়নি। ব্রাউজারে Microphone Allow করুন।');
          return;
        }
      }
    }

    // Pure SpeechRecognition fallback if MediaRecorder is unavailable
    if (!SpeechRecognition) {
      setErrorNote('আপনার ব্রাউজারে ভয়েস সাপোর্ট নেই। অনুগ্রহ করে নিচে লিখে AI অটো-ফিল চাপুন।');
      return;
    }

    setIsListening(true);
    if (recognitionRef.current) {
      recognitionRef.current.onend = () => {
        setIsListening(false);
        const text = liveTranscriptRef.current.trim();
        if (text) {
          handleRunAiParse(text);
        }
      };
    }
  }

  return (
    <div
      className="full"
      style={{
        background: 'linear-gradient(135deg, #f0fdfa 0%, #eff6ff 100%)',
        border: isListening ? '1.5px solid #ef4444' : '1.5px solid #5eead4',
        borderRadius: '12px',
        padding: '11px 13px',
        marginBottom: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: isListening
          ? '0 0 0 3px rgba(239, 68, 68, 0.14)'
          : '0 2px 8px rgba(13, 148, 136, 0.08)',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Sparkles size={15} color="#0d9488" />
          {title}
        </span>
        <span
          style={{
            fontSize: '10.5px',
            fontWeight: 700,
            background: isListening ? '#fee2e2' : '#ccfbf1',
            color: isListening ? '#b91c1c' : '#115e59',
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          {isListening
            ? `🔴 রেকর্ড হচ্ছে (${toBnDigits(recordingSec)} সে.) — কথা শেষ হলে চাপুন`
            : '🎙️ ভয়েস ইনপুট চালু'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleRunAiParse();
            }
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: '170px',
            background: '#ffffff',
            border: '1px solid #99f6e4',
            borderRadius: '8px',
            padding: '8px 11px',
            fontSize: '12.5px',
            color: '#0f172a',
          }}
        />

        <button
          type="button"
          onClick={handleToggleVoice}
          disabled={isParsing}
          title={isListening ? 'কথা শেষ হলে থামাতে চাপুন' : 'মাইক্রোফোনে মুখে বলে ফর্ম পূরণ করুন'}
          style={{
            background: isListening ? '#dc2626' : '#ffffff',
            color: isListening ? '#ffffff' : '#0f766e',
            border: isListening ? '1.5px solid #dc2626' : '1.5px solid #0d9488',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: isListening ? '0 2px 8px rgba(220, 38, 38, 0.3)' : 'none',
          }}
        >
          {isListening ? <MicOff size={14} /> : <Mic size={14} />}
          <span>{isListening ? `থামান (${toBnDigits(recordingSec)}s)` : 'মুখে বলুন'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleRunAiParse()}
          disabled={isParsing || isListening}
          style={{
            background: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 13px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Sparkles size={14} />
          <span>{isParsing ? 'AI বসাচ্ছে…' : 'AI অটো-ফিল'}</span>
        </button>
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', fontSize: '11px', color: '#475569' }}>
          <span style={{ fontWeight: 700 }}>⚡ উদাহরণ:</span>
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                setPromptText(chip.text);
                handleRunAiParse(chip.text);
              }}
              style={{
                background: '#ffffff',
                border: '1px solid #99f6e4',
                color: '#0f766e',
                borderRadius: '6px',
                padding: '2px 7px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {summaryNote && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #86efac',
            borderRadius: '7px',
            padding: '6px 10px',
            fontSize: '12px',
            color: '#15803d',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
          <span>{summaryNote}</span>
        </div>
      )}

      {errorNote && (
        <div
          style={{
            background: '#fff1f2',
            border: '1px solid #fecaca',
            borderRadius: '7px',
            padding: '6px 10px',
            fontSize: '12px',
            color: '#be123c',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{errorNote}</span>
        </div>
      )}
    </div>
  );
}
