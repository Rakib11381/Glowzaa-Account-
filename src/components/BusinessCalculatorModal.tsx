import React, { useEffect, useRef, useState } from 'react';
import {
  Calculator,
  Check,
  Copy,
  Delete,
  History,
  Loader2,
  Mic,
  MicOff,
  Minimize2,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toBengaliNumerals } from '../accounting';

export interface CalcHistoryItem {
  id: string;
  expression: string;
  result: string;
  time: string;
}

export interface AiCalcMetrics {
  unitCost?: number;
  unitSell?: number;
  unitProfit?: number;
  totalQty?: number;
  unitName?: string;
  totalCost?: number;
  totalSell?: number;
  totalProfit?: number;
  profitMarginPercent?: number;
}

export interface AiCalcResult {
  prompt: string;
  mainResult: number;
  mainResultLabel: string;
  expression: string;
  summaryBn: string;
  stepsBn: string[];
  metrics?: AiCalcMetrics;
}

export interface PersistedCalcState {
  display: string;
  expression: string;
  prevValue: number | null;
  operator: string | null;
  waitingForOperand: boolean;
  memory: number;
  note: string;
  history: CalcHistoryItem[];
  aiPrompt?: string;
  aiResult?: AiCalcResult | null;
}

const STORAGE_KEY = 'glowzaa_business_calculator_state_v1';

const DEFAULT_CALC_STATE: PersistedCalcState = {
  display: '0',
  expression: '',
  prevValue: null,
  operator: null,
  waitingForOperand: false,
  memory: 0,
  note: '',
  history: [],
  aiPrompt: '',
  aiResult: null,
};

export function loadPersistedCalcState(): PersistedCalcState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CALC_STATE;
    const parsed = JSON.parse(raw);
    return {
      display: typeof parsed.display === 'string' ? parsed.display : '0',
      expression: typeof parsed.expression === 'string' ? parsed.expression : '',
      prevValue: typeof parsed.prevValue === 'number' ? parsed.prevValue : null,
      operator: typeof parsed.operator === 'string' ? parsed.operator : null,
      waitingForOperand: Boolean(parsed.waitingForOperand),
      memory: typeof parsed.memory === 'number' ? parsed.memory : 0,
      note: typeof parsed.note === 'string' ? parsed.note : '',
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 25) : [],
      aiPrompt: typeof parsed.aiPrompt === 'string' ? parsed.aiPrompt : '',
      aiResult: parsed.aiResult && typeof parsed.aiResult === 'object' ? parsed.aiResult : null,
    };
  } catch {
    return DEFAULT_CALC_STATE;
  }
}

interface BusinessCalculatorModalProps {
  isOpen: boolean;
  onMinimize: () => void;
  calcState: PersistedCalcState;
  setCalcState: React.Dispatch<React.SetStateAction<PersistedCalcState>>;
  enableVoiceInput?: boolean;
}

function formatNumberWithCommas(val: string): string {
  if (!val || val === 'Error') return val;
  const isNeg = val.startsWith('-');
  const clean = isNeg ? val.slice(1) : val;
  const parts = clean.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  return isNeg ? `-${formatted}` : formatted;
}

function formatResultNumber(num: number): string {
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num * 10000) / 10000;
  return String(rounded);
}

function bnToEnDigitsClient(str: string): string {
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

function convertBengaliWordsToDigitsClient(input: string): string {
  let s = bnToEnDigitsClient(input || '');
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

function localClientFallbackCalculate(rawPrompt: string): AiCalcResult {
  const cleanedFiller = convertBengaliWordsToDigitsClient(rawPrompt || '')
    .replace(/(?:একটা|একটি|1\s*টা|1\s*টি)\s*(?:প্রডাক্ট|প্রোডাক্ট|পণ্য|মাল|জিনিস)/gi, ' প্রডাক্ট ')
    .trim();
  const lower = cleanedFiller.toLowerCase();
  const nums = Array.from(cleanedFiller.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) => Number(m[1]));

  const hasDozen = /(ডজন|dozen)/i.test(lower);
  const hasHali = /(হালি|hali)/i.test(lower);
  const hasBuySell =
    /(কিন|কেনা|ক্রয়|কিনে|buy|bought)/i.test(lower) &&
    /(বিক্রি|বিক্রয়|বেচ|sell|sold)/i.test(lower);

  if ((hasDozen || hasHali) && nums.length >= 2) {
    const packSize = hasDozen ? 12 : 4;
    const packName = hasDozen ? 'ডজন' : 'হালি';
    const dozenBuyMatch = cleanedFiller.match(/(\d+(?:\.\d+)?)\s*(?:টাকা|৳|tk)?\s*(?:ডজন|হালি)/i);
    const pieceSellMatch = cleanedFiller.match(/(\d+(?:\.\d+)?)\s*(?:টাকা|৳|tk)?\s*(?:পিস|করে)/i);

    const packCount = 1;
    let buyRaw = dozenBuyMatch ? Number(dozenBuyMatch[1]) : nums[0];
    let sellRaw = pieceSellMatch ? Number(pieceSellMatch[1]) : nums[nums.length - 1];
    if (buyRaw === sellRaw && nums.length >= 2) {
      buyRaw = nums[0];
      sellRaw = nums[1];
    }

    const totalQty = packCount * packSize;
    const totalCost = buyRaw * packCount;
    const unitCost = Math.round((totalCost / totalQty) * 100) / 100;
    const unitSell = Math.round(sellRaw * 100) / 100;
    const totalSell = Math.round(unitSell * totalQty * 100) / 100;
    const unitProfit = Math.round((unitSell - unitCost) * 100) / 100;
    const totalProfit = Math.round((totalSell - totalCost) * 100) / 100;
    const margin = totalCost > 0 ? Math.round((totalProfit / totalCost) * 10000) / 100 : 0;
    const statusWord = totalProfit >= 0 ? 'লাভ' : 'ক্ষতি';

    return {
      prompt: rawPrompt,
      mainResult: Math.abs(totalProfit),
      mainResultLabel: `মোট ${statusWord} (${toBengaliNumerals(packCount)} ${packName} / ${toBengaliNumerals(totalQty)} পিস)`,
      expression: `(${unitSell} × ${totalQty}) - ${totalCost} = ${totalProfit}`,
      summaryBn: `প্রতি পিসে ${statusWord} ৳${toBengaliNumerals(Math.abs(unitProfit))} এবং ${toBengaliNumerals(packCount)} ${packName} (${toBengaliNumerals(totalQty)} পিস)-এ মোট ${statusWord} ৳${toBengaliNumerals(Math.abs(totalProfit))} (${toBengaliNumerals(Math.abs(margin))}%)।`,
      stepsBn: [
        `${toBengaliNumerals(packCount)} ${packName} = ${toBengaliNumerals(totalQty)} পিস মোট ক্রয়মূল্য: ৳${toBengaliNumerals(totalCost)}`,
        `প্রতি পিস কেনা দাম: ৳${toBengaliNumerals(totalCost)} ÷ ${toBengaliNumerals(totalQty)} = ৳${toBengaliNumerals(unitCost)}`,
        `প্রতি পিস বিক্রি দাম: ৳${toBengaliNumerals(unitSell)} (মোট বিক্রি: ৳${toBengaliNumerals(unitSell)} × ${toBengaliNumerals(totalQty)} = ৳${toBengaliNumerals(totalSell)})`,
        `প্রতি পিসে ${statusWord}: ৳${toBengaliNumerals(unitSell)} − ৳${toBengaliNumerals(unitCost)} = ৳${toBengaliNumerals(Math.abs(unitProfit))}`,
        `পুরো ${toBengaliNumerals(packCount)} ${packName} (${toBengaliNumerals(totalQty)} পিস)-এ মোট ${statusWord}: ৳${toBengaliNumerals(totalSell)} − ৳${toBengaliNumerals(totalCost)} = ৳${toBengaliNumerals(Math.abs(totalProfit))}`,
      ],
      metrics: {
        unitCost,
        unitSell,
        unitProfit,
        totalQty,
        unitName: 'পিস',
        totalCost,
        totalSell,
        totalProfit,
        profitMarginPercent: margin,
      },
    };
  }

  if (hasBuySell && nums.length >= 2) {
    const unitCost = nums[0];
    const unitSell = nums[1];
    const profit = Math.round((unitSell - unitCost) * 100) / 100;
    const statusWord = profit >= 0 ? 'লাভ' : 'ক্ষতি';
    return {
      prompt: rawPrompt,
      mainResult: Math.abs(profit),
      mainResultLabel: `মোট ${statusWord}`,
      expression: `${unitSell} - ${unitCost} = ${profit}`,
      summaryBn: `কেনা ৳${toBengaliNumerals(unitCost)} এবং বিক্রি ৳${toBengaliNumerals(unitSell)} হলে ${statusWord} ৳${toBengaliNumerals(Math.abs(profit))}।`,
      stepsBn: [
        `কেনা দাম: ৳${toBengaliNumerals(unitCost)}`,
        `বিক্রি দাম: ৳${toBengaliNumerals(unitSell)}`,
        `${statusWord}: ৳${toBengaliNumerals(Math.abs(profit))}`,
      ],
      metrics: {
        unitCost,
        unitSell,
        unitProfit: profit,
        totalQty: 1,
        unitName: 'পিস',
        totalCost: unitCost,
        totalSell: unitSell,
        totalProfit: profit,
      },
    };
  }

  const fallbackVal = nums[0] || 0;
  return {
    prompt: rawPrompt,
    mainResult: fallbackVal,
    mainResultLabel: 'ফলাফল',
    expression: `${fallbackVal}`,
    summaryBn: `ফলাফল: ৳${toBengaliNumerals(fallbackVal)}`,
    stepsBn: [`প্রদত্ত হিসাব: ${rawPrompt}`],
  };
}

export default function BusinessCalculatorModal({
  isOpen,
  onMinimize,
  calcState,
  setCalcState,
  enableVoiceInput = true,
}: BusinessCalculatorModalProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const liveVoiceTranscriptRef = useRef<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Persist to localStorage on every state update so data is never lost
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(calcState));
    } catch {
      // ignore storage quota errors
    }
  }, [calcState]);

  const clearTimers = () => {
    if (recordIntervalRef.current) {
      window.clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  };

  const cleanupVoiceResources = () => {
    clearTimers();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  // Stop recorder if modal is minimized/unmounted
  useEffect(() => {
    if (!isOpen) {
      cleanupVoiceResources();
      setIsListening(false);
      setRecordSeconds(0);
    }
  }, [isOpen]);

  const applyAiResultData = (data: AiCalcResult, fallbackPrompt: string) => {
    const finalPrompt = (data.prompt || fallbackPrompt).trim();
    const resultStr = formatResultNumber(data.mainResult);
    const timeStr = new Date().toLocaleTimeString('bn-BD', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const newHistoryItem: CalcHistoryItem = {
      id: `ai-calc-${Date.now()}`,
      expression: `AI: ${data.expression || finalPrompt.slice(0, 28)}`,
      result: resultStr,
      time: timeStr,
    };

    setCalcState((prev) => ({
      ...prev,
      display: resultStr,
      expression: data.expression || finalPrompt,
      prevValue: null,
      operator: null,
      waitingForOperand: true,
      aiPrompt: finalPrompt,
      aiResult: data,
      history: [newHistoryItem, ...prev.history].slice(0, 25),
    }));
  };

  const runAiCalculation = async (promptText: string, audioDataUrl?: string) => {
    const cleanPrompt = promptText.trim();
    if (!cleanPrompt && !audioDataUrl) return;

    setAiLoading(true);
    setVoiceStatus(
      audioDataUrl && !cleanPrompt
        ? '⏳ আপনার ভয়েস শুনে AI নির্ভুলভাবে হিসাব করছে...'
        : '⏳ AI হিসাব করছে...'
    );

    try {
      const response = await fetch('/api/ai/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanPrompt,
          audioDataUrl: audioDataUrl || '',
        }),
      });

      let data: AiCalcResult;
      if (response.ok) {
        data = await response.json();
      } else {
        data = localClientFallbackCalculate(cleanPrompt);
      }

      setVoiceStatus('');
      applyAiResultData(data, cleanPrompt);
    } catch {
      setVoiceStatus('');
      if (cleanPrompt) {
        const fallback = localClientFallbackCalculate(cleanPrompt);
        applyAiResultData(fallback, cleanPrompt);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const stopRecordingAndCalculate = () => {
    clearTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
        return;
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    setRecordSeconds(0);
  };

  const handleToggleVoice = async () => {
    // If currently recording, tapping "থামুন" stops recording and immediately sends audio to Gemini AI!
    if (isListening) {
      stopRecordingAndCalculate();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsListening(false);
      setVoiceStatus(
        'আপনার ব্রাউজারে মাইক্রোফোন সাপোর্ট নেই। নিচের বক্সে কীবোর্ডের মাইক 🎙️ দিয়ে বলুন বা লিখুন।'
      );
      inputRef.current?.focus();
      return;
    }

    try {
      setVoiceStatus('🎙️ মাইক্রোফোন চালু হচ্ছে...');
      liveVoiceTranscriptRef.current = '';

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognitionRef.current = recognition;
          recognition.lang = 'bn-BD';
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalSegs = '';
          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const seg = event.results[i][0]?.transcript || '';
              if (event.results[i].isFinal) {
                finalSegs += ' ' + seg;
              } else {
                interim += seg;
              }
            }
            const combined = (finalSegs + ' ' + interim).replace(/\s+/g, ' ').trim();
            if (combined) {
              liveVoiceTranscriptRef.current = combined;
              setCalcState((prev) => ({ ...prev, aiPrompt: combined }));
            }
          };
          recognition.onerror = () => {};
          recognition.start();
        } catch {}
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearTimers();
        if (recognitionRef.current) {
          try {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
          } catch {}
          recognitionRef.current = null;
        }
        const chunks = audioChunksRef.current;
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        setIsListening(false);
        setRecordSeconds(0);

        const capturedText = liveVoiceTranscriptRef.current.trim();
        if (chunks.length === 0 && !capturedText) {
          setVoiceStatus('কোনো কথা শোনা যায়নি। আবার 🎙️ বলুন বাটনে চাপ দিন।');
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 400 && !capturedText) {
          setVoiceStatus('অডিও খুব ছোট হয়েছে। আবার 🎙️ বলুন বাটনে চাপ দিয়ে পুরো হিসাবটি বলুন।');
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = typeof reader.result === 'string' ? reader.result : '';
          runAiCalculation(capturedText, base64Audio);
        };
        reader.readAsDataURL(blob);
      };

      // Collect audio chunks every 250ms so nothing is ever lost
      recorder.start(250);
      setIsListening(true);
      setRecordSeconds(0);
      setVoiceStatus('🔴 ভয়েস রেকর্ড হচ্ছে (০ সেকেন্ড)... পুরো কথা বলা শেষ হলে "থামুন" চাপুন');

      recordIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          setVoiceStatus(
            `🔴 ভয়েস রেকর্ড হচ্ছে (${toBengaliNumerals(next)} সেকেন্ড)... পুরো কথা শেষ হলে "থামুন" চাপুন`
          );
          return next;
        });
      }, 1000);

      // Allow up to 60 seconds of continuous speaking
      autoStopTimerRef.current = window.setTimeout(() => {
        stopRecordingAndCalculate();
      }, 60000);
    } catch {
      setIsListening(false);
      setRecordSeconds(0);
      setVoiceStatus(
        'মাইক্রোফোন পারমিশন ব্লক করা আছে। ব্রাউজারের অ্যাড্রেস বার থেকে Microphone Allow করুন অথবা কীবোর্ডের 🎙️ মাইক ব্যবহার করুন।'
      );
      inputRef.current?.focus();
    }
  };

  const performCalculation = (first: number, second: number, op: string): number => {
    switch (op) {
      case '+':
        return first + second;
      case '−':
      case '-':
        return first - second;
      case '×':
      case '*':
        return first * second;
      case '÷':
      case '/':
        return second === 0 ? 0 : first / second;
      default:
        return second;
    }
  };

  const inputDigit = (digit: string) => {
    setCalcState((prev) => {
      if (prev.waitingForOperand) {
        return {
          ...prev,
          display: digit === '00' ? '0' : digit,
          waitingForOperand: false,
        };
      }
      const current = prev.display === '0' ? '' : prev.display;
      if (current.replace(/[-.]/g, '').length >= 13) return prev;
      const nextDisplay = current === '' && digit === '00' ? '0' : current + digit;
      return {
        ...prev,
        display: nextDisplay || '0',
      };
    });
  };

  const inputDecimal = () => {
    setCalcState((prev) => {
      if (prev.waitingForOperand) {
        return {
          ...prev,
          display: '0.',
          waitingForOperand: false,
        };
      }
      if (prev.display.includes('.')) return prev;
      return {
        ...prev,
        display: `${prev.display}.`,
      };
    });
  };

  const handleBackspace = () => {
    setCalcState((prev) => {
      if (prev.waitingForOperand) return prev;
      if (prev.display.length <= 1 || (prev.display.length === 2 && prev.display.startsWith('-'))) {
        return { ...prev, display: '0' };
      }
      return {
        ...prev,
        display: prev.display.slice(0, -1),
      };
    });
  };

  const handleClearEntry = () => {
    setCalcState((prev) => ({
      ...prev,
      display: '0',
      expression: '',
      prevValue: null,
      operator: null,
      waitingForOperand: false,
    }));
  };

  const handleOperator = (nextOp: string) => {
    setCalcState((prev) => {
      const inputValue = parseFloat(prev.display) || 0;

      if (prev.prevValue === null) {
        return {
          ...prev,
          prevValue: inputValue,
          operator: nextOp,
          waitingForOperand: true,
          expression: `${formatResultNumber(inputValue)} ${nextOp}`,
        };
      }

      if (prev.operator && !prev.waitingForOperand) {
        const computed = performCalculation(prev.prevValue, inputValue, prev.operator);
        const formatted = formatResultNumber(computed);
        return {
          ...prev,
          display: formatted,
          prevValue: computed,
          operator: nextOp,
          waitingForOperand: true,
          expression: `${formatted} ${nextOp}`,
        };
      }

      return {
        ...prev,
        operator: nextOp,
        waitingForOperand: true,
        expression: `${formatResultNumber(prev.prevValue)} ${nextOp}`,
      };
    });
  };

  const handlePercent = () => {
    setCalcState((prev) => {
      const currentValue = parseFloat(prev.display) || 0;
      if (currentValue === 0) return prev;
      if (prev.prevValue !== null && (prev.operator === '+' || prev.operator === '−')) {
        const percentOfBase = (prev.prevValue * currentValue) / 100;
        const formatted = formatResultNumber(percentOfBase);
        return {
          ...prev,
          display: formatted,
          waitingForOperand: false,
        };
      }
      const simplePercent = currentValue / 100;
      return {
        ...prev,
        display: formatResultNumber(simplePercent),
        waitingForOperand: false,
      };
    });
  };

  const handleEquals = () => {
    setCalcState((prev) => {
      if (prev.operator === null || prev.prevValue === null) return prev;
      const inputValue = parseFloat(prev.display) || 0;
      const computed = performCalculation(prev.prevValue, inputValue, prev.operator);
      const resultStr = formatResultNumber(computed);
      const fullExpr = `${formatResultNumber(prev.prevValue)} ${prev.operator} ${formatResultNumber(inputValue)}`;
      const timeStr = new Date().toLocaleTimeString('bn-BD', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const newHistoryItem: CalcHistoryItem = {
        id: `calc-${Date.now()}`,
        expression: fullExpr,
        result: resultStr,
        time: timeStr,
      };

      return {
        ...prev,
        display: resultStr,
        expression: `${fullExpr} =`,
        prevValue: null,
        operator: null,
        waitingForOperand: true,
        history: [newHistoryItem, ...prev.history].slice(0, 25),
      };
    });
  };

  const handleMemory = (action: 'MC' | 'MR' | 'M+' | 'M-') => {
    setCalcState((prev) => {
      const currentVal = parseFloat(prev.display) || 0;
      if (action === 'MC') {
        return { ...prev, memory: 0 };
      }
      if (action === 'MR') {
        return {
          ...prev,
          display: formatResultNumber(prev.memory),
          waitingForOperand: false,
        };
      }
      if (action === 'M+') {
        return {
          ...prev,
          memory: Math.round((prev.memory + currentVal) * 10000) / 10000,
          waitingForOperand: true,
        };
      }
      if (action === 'M-') {
        return {
          ...prev,
          memory: Math.round((prev.memory - currentVal) * 10000) / 10000,
          waitingForOperand: true,
        };
      }
      return prev;
    });
  };

  const handleCopyResult = async () => {
    try {
      await navigator.clipboard.writeText(calcState.display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  // Keyboard support when calculator is open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        inputDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        inputDecimal();
      } else if (e.key === '+') {
        e.preventDefault();
        handleOperator('+');
      } else if (e.key === '-') {
        e.preventDefault();
        handleOperator('−');
      } else if (e.key === '*') {
        e.preventDefault();
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === '%') {
        e.preventDefault();
        handlePercent();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onMinimize();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!isOpen) return null;

  const formattedDisplay = formatNumberWithCommas(calcState.display);
  const bengaliPreview = toBengaliNumerals(formattedDisplay);
  const aiResult = calcState.aiResult;

  return (
    <div
      className="calc-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onMinimize();
      }}
    >
      <div
        className="calc-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="AI ব্যবসার ক্যালকুলেটর"
      >
        {/* Header Bar */}
        <div className="calc-modal-head">
          <div className="calc-modal-title">
            <span className="calc-modal-title-icon">
              <Calculator size={16} />
            </span>
            <div>
              <h3>AI ব্যবসার ক্যালকুলেটর</h3>
              <span>মুখে বলুন বা বাটন চাপুন • মিনিমাইজে ডেটা সংরক্ষিত</span>
            </div>
          </div>

          <div className="calc-modal-head-actions">
            <button
              type="button"
              className={`calc-head-btn ${showHistory ? 'active' : ''}`}
              onClick={() => setShowHistory((v) => !v)}
              title="হিসাবের ইতিহাস দেখুন"
            >
              <History size={15} />
              {calcState.history.length > 0 && (
                <span className="calc-history-count">
                  {toBengaliNumerals(calcState.history.length)}
                </span>
              )}
            </button>
            <button
              type="button"
              className="calc-head-btn minimize-btn"
              onClick={onMinimize}
              title="মিনিমাইজ করে রাখুন (ডেটা মুছবে না)"
            >
              <Minimize2 size={15} />
              <span>মিনিমাইজ</span>
            </button>
            <button
              type="button"
              className="calc-head-btn close-btn"
              onClick={onMinimize}
              aria-label="মিনিমাইজ করুন"
              title="মিনিমাইজ করুন"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* AI Voice & Natural Language Smart Business Math Section */}
        <div className="calc-ai-voice-box">
          <div className="calc-ai-voice-top">
            <span className="calc-ai-badge">
              <Sparkles size={12} /> {enableVoiceInput !== false ? 'AI ভয়েস হিসাব' : 'AI স্মার্ট হিসাব'}
            </span>
            <button
              type="button"
              className="calc-ai-example-chip"
              onClick={() => {
                const sample =
                  'একটা প্রডাক্ট ২৪০৳ ডজন কিনলাম বিক্রি করলাম ৩০৳ পিস তাহলে লাভ কত হলো';
                setCalcState((prev) => ({ ...prev, aiPrompt: sample }));
                runAiCalculation(sample);
              }}
              title="উদাহরণ হিসাবটি চালিয়ে দেখুন"
            >
              উদাহরণ: ২৪০৳ ডজন কিনে ৩০৳ পিস বিক্রি
            </button>
          </div>

          <div className="calc-ai-input-row">
            {enableVoiceInput !== false && (
              <button
                type="button"
                className={`calc-mic-btn ${isListening ? 'listening' : ''}`}
                onClick={handleToggleVoice}
                disabled={aiLoading}
                title={isListening ? 'কথা শেষ হলে চাপুন' : 'মাইক্রোফোনে চাপ দিয়ে মুখে হিসাব বলুন'}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                <span>
                  {isListening
                    ? `থামুন (${toBengaliNumerals(recordSeconds)}s)`
                    : 'বলুন'}
                </span>
              </button>
            )}

            <input
              ref={inputRef}
              type="text"
              className="calc-ai-text-input"
              value={calcState.aiPrompt || ''}
              onChange={(e) =>
                setCalcState((prev) => ({ ...prev, aiPrompt: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (isListening) {
                    stopRecordingAndCalculate();
                  } else {
                    runAiCalculation(calcState.aiPrompt || '');
                  }
                }
              }}
              placeholder={
                enableVoiceInput !== false
                  ? 'মুখে বলুন বা লিখুন: ২৪০৳ ডজন কিনে ৩০৳ পিস বিক্রি...'
                  : 'লিখুন: ২৪০৳ ডজন কিনে ৩০৳ পিস বিক্রি...'
              }
            />

            <button
              type="button"
              className="calc-ai-submit-btn"
              disabled={aiLoading || (!isListening && !(calcState.aiPrompt || '').trim())}
              onClick={() => {
                if (isListening) {
                  stopRecordingAndCalculate();
                } else {
                  runAiCalculation(calcState.aiPrompt || '');
                }
              }}
            >
              {aiLoading ? <Loader2 size={14} className="spin-icon" /> : 'হিসাব'}
            </button>
          </div>

          {voiceStatus && <div className="calc-voice-status">{voiceStatus}</div>}

          {/* AI Result Breakdown Card */}
          {aiResult && (
            <div className="calc-ai-result-card">
              <div className="calc-ai-result-head">
                <div>
                  <span className="calc-ai-res-label">{aiResult.mainResultLabel}</span>
                  <strong className="calc-ai-res-value">
                    ৳{toBengaliNumerals(formatNumberWithCommas(String(aiResult.mainResult)))}
                  </strong>
                </div>
                <button
                  type="button"
                  className="calc-ai-clear-btn"
                  onClick={() =>
                    setCalcState((prev) => ({ ...prev, aiResult: null }))
                  }
                  title="AI ফলাফল কার্ড বন্ধ করুন"
                >
                  <X size={13} />
                </button>
              </div>

              <p className="calc-ai-summary-text">{aiResult.summaryBn}</p>

              {aiResult.metrics &&
                (aiResult.metrics.unitCost !== undefined ||
                  aiResult.metrics.unitProfit !== undefined) && (
                  <div className="calc-ai-metrics-grid">
                    {aiResult.metrics.unitCost !== undefined && (
                      <button
                        type="button"
                        className="calc-ai-metric-chip"
                        onClick={() =>
                          setCalcState((prev) => ({
                            ...prev,
                            display: formatResultNumber(aiResult.metrics!.unitCost!),
                            waitingForOperand: false,
                          }))
                        }
                        title="ক্যালকুলেটরে বসাতে চাপ দিন"
                      >
                        <span>প্রতি {aiResult.metrics.unitName || 'পিস'} কেনা</span>
                        <strong>৳{toBengaliNumerals(aiResult.metrics.unitCost)}</strong>
                      </button>
                    )}
                    {aiResult.metrics.unitSell !== undefined && (
                      <button
                        type="button"
                        className="calc-ai-metric-chip"
                        onClick={() =>
                          setCalcState((prev) => ({
                            ...prev,
                            display: formatResultNumber(aiResult.metrics!.unitSell!),
                            waitingForOperand: false,
                          }))
                        }
                        title="ক্যালকুলেটরে বসাতে চাপ দিন"
                      >
                        <span>প্রতি {aiResult.metrics.unitName || 'পিস'} বিক্রি</span>
                        <strong>৳{toBengaliNumerals(aiResult.metrics.unitSell)}</strong>
                      </button>
                    )}
                    {aiResult.metrics.unitProfit !== undefined && (
                      <button
                        type="button"
                        className="calc-ai-metric-chip highlight"
                        onClick={() =>
                          setCalcState((prev) => ({
                            ...prev,
                            display: formatResultNumber(Math.abs(aiResult.metrics!.unitProfit!)),
                            waitingForOperand: false,
                          }))
                        }
                        title="ক্যালকুলেটরে বসাতে চাপ দিন"
                      >
                        <span>
                          প্রতি {aiResult.metrics.unitName || 'পিস'}{' '}
                          {aiResult.metrics.unitProfit >= 0 ? 'লাভ' : 'ক্ষতি'}
                        </span>
                        <strong>
                          ৳{toBengaliNumerals(Math.abs(aiResult.metrics.unitProfit))}
                        </strong>
                      </button>
                    )}
                    {aiResult.metrics.totalProfit !== undefined &&
                      (aiResult.metrics.totalQty || 1) > 1 && (
                        <button
                          type="button"
                          className="calc-ai-metric-chip highlight-total"
                          onClick={() =>
                            setCalcState((prev) => ({
                              ...prev,
                              display: formatResultNumber(
                                Math.abs(aiResult.metrics!.totalProfit!)
                              ),
                              waitingForOperand: false,
                            }))
                          }
                          title="ক্যালকুলেটরে বসাতে চাপ দিন"
                        >
                          <span>
                            মোট ({toBengaliNumerals(aiResult.metrics.totalQty || 12)}{' '}
                            {aiResult.metrics.unitName || 'পিস'}){' '}
                            {aiResult.metrics.totalProfit >= 0 ? 'লাভ' : 'ক্ষতি'}
                          </span>
                          <strong>
                            ৳{toBengaliNumerals(Math.abs(aiResult.metrics.totalProfit))}
                          </strong>
                        </button>
                      )}
                  </div>
                )}

              {Array.isArray(aiResult.stepsBn) && aiResult.stepsBn.length > 0 && (
                <ul className="calc-ai-steps-list">
                  {aiResult.stepsBn.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Display Screen */}
        <div className="calc-screen">
          <div className="calc-screen-top">
            <span className="calc-expression">
              {calcState.expression || 'হিসাব শুরু করুন…'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {calcState.memory !== 0 && (
                <span className="calc-memory-badge">
                  M: ৳{toBengaliNumerals(formatNumberWithCommas(String(calcState.memory)))}
                </span>
              )}
              <button
                type="button"
                className="calc-copy-btn"
                onClick={handleCopyResult}
                title="ফলাফল কপি করুন"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? 'কপি হয়েছে' : 'কপি'}</span>
              </button>
            </div>
          </div>

          <div className="calc-main-display" title={formattedDisplay}>
            {formattedDisplay}
          </div>

          <div className="calc-bn-preview">
            <span>বাংলায়: ৳ {bengaliPreview}</span>
            <input
              type="text"
              className="calc-quick-note-input"
              value={calcState.note}
              onChange={(e) =>
                setCalcState((prev) => ({ ...prev, note: e.target.value }))
              }
              placeholder="খসড়া নোট লিখুন (যেমন: মালের হিসাব)…"
            />
          </div>
        </div>

        {/* Collapsible Calculation Tape / History */}
        {showHistory && (
          <div className="calc-history-panel">
            <div className="calc-history-head">
              <strong>সাম্প্রতিক হিসাব ({toBengaliNumerals(calcState.history.length)}টি)</strong>
              {calcState.history.length > 0 && (
                <button
                  type="button"
                  className="calc-history-clear-btn"
                  onClick={() =>
                    setCalcState((prev) => ({
                      ...prev,
                      history: [],
                    }))
                  }
                >
                  <Trash2 size={12} /> ইতিহাস মুছুন
                </button>
              )}
            </div>
            {calcState.history.length === 0 ? (
              <p className="calc-history-empty">এখনো কোনো হিসাব সম্পন্ন হয়নি।</p>
            ) : (
              <div className="calc-history-list">
                {calcState.history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="calc-history-item"
                    onClick={() =>
                      setCalcState((prev) => ({
                        ...prev,
                        display: item.result,
                        waitingForOperand: false,
                      }))
                    }
                    title="এই সংখ্যাটি ক্যালকুলেটরে বসাতে চাপ দিন"
                  >
                    <div className="calc-history-expr">
                      <span>{item.expression} =</span>
                      <small>{item.time}</small>
                    </div>
                    <strong className="calc-history-res">
                      ৳{formatNumberWithCommas(item.result)}
                    </strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Memory Row */}
        <div className="calc-memory-row">
          <button
            type="button"
            className="calc-mem-btn"
            onClick={() => handleMemory('MC')}
            disabled={calcState.memory === 0}
          >
            MC
          </button>
          <button
            type="button"
            className="calc-mem-btn"
            onClick={() => handleMemory('MR')}
            disabled={calcState.memory === 0}
          >
            MR
          </button>
          <button
            type="button"
            className="calc-mem-btn"
            onClick={() => handleMemory('M+')}
          >
            M+
          </button>
          <button
            type="button"
            className="calc-mem-btn"
            onClick={() => handleMemory('M-')}
          >
            M-
          </button>
        </div>

        {/* Main Keypad Grid */}
        <div className="calc-keypad">
          <button
            type="button"
            className="calc-key key-clear"
            onClick={handleClearEntry}
            title="চলমান হিসাব পরিষ্কার করুন"
          >
            <RotateCcw size={14} style={{ marginRight: '3px' }} /> AC
          </button>
          <button
            type="button"
            className="calc-key key-fn"
            onClick={handlePercent}
            title="শতকরা (%) হিসাব"
          >
            %
          </button>
          <button
            type="button"
            className="calc-key key-fn"
            onClick={handleBackspace}
            title="এক ঘর মুছুন"
          >
            <Delete size={18} />
          </button>
          <button
            type="button"
            className={`calc-key key-op ${calcState.operator === '÷' ? 'active-op' : ''}`}
            onClick={() => handleOperator('÷')}
          >
            ÷
          </button>

          <button type="button" className="calc-key" onClick={() => inputDigit('7')}>
            7 <small>৭</small>
          </button>
          <button type="button" className="calc-key" onClick={() => inputDigit('8')}>
            8 <small>৮</small>
          </button>
          <button type="button" className="calc-key" onClick={() => inputDigit('9')}>
            9 <small>৯</small>
          </button>
          <button
            type="button"
            className={`calc-key key-op ${calcState.operator === '×' ? 'active-op' : ''}`}
            onClick={() => handleOperator('×')}
          >
            ×
          </button>

          <button type="button" className="calc-key" onClick={() => inputDigit('4')}>
            4 <small>৪</small>
          </button>
          <button type="button" className="calc-key" onClick={() => inputDigit('5')}>
            5 <small>৫</small>
          </button>
          <button type="button" className="calc-key" onClick={() => inputDigit('6')}>
            6 <small>৬</small>
          </button>
          <button
            type="button"
            className={`calc-key key-op ${calcState.operator === '−' ? 'active-op' : ''}`}
            onClick={() => handleOperator('−')}
          >
            −
          </button>

          <button type="button" className="calc-key" onClick={() => inputDigit('1')}>
            1 <small>১</small>
          </button>
          <button type="button" className="calc-key" onClick={() => inputDigit('2')}>
            2 <small>২</small>
          </button>
          <button type="button" className="calc-key" onClick={() => inputDigit('3')}>
            3 <small>৩</small>
          </button>
          <button
            type="button"
            className={`calc-key key-op ${calcState.operator === '+' ? 'active-op' : ''}`}
            onClick={() => handleOperator('+')}
          >
            +
          </button>

          <button type="button" className="calc-key" onClick={() => inputDigit('0')}>
            0 <small>০</small>
          </button>
          <button type="button" className="calc-key" onClick={() => inputDigit('00')}>
            00 <small>০০</small>
          </button>
          <button type="button" className="calc-key" onClick={inputDecimal}>
            .
          </button>
          <button
            type="button"
            className="calc-key key-equals"
            onClick={handleEquals}
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
}
