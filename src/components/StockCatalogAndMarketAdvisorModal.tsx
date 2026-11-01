import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Flame,
  Image as ImageIcon,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import type { BusinessSettings, Entry, Product } from '../types';
import { money, toBengaliNumerals } from '../accounting';

export type TrendingSuggestionCategory =
  | 'hair_fashion'
  | 'jewelry'
  | 'cosmetics'
  | 'bags_accessories'
  | 'gift_combo';

export interface NewTrendingProductSuggestion {
  id: string;
  name: string;
  searchQueryEn?: string;
  category: TrendingSuggestionCategory;
  categoryLabelBn: string;
  wholesalePriceRangeBn: string;
  estimatedUnitCost: number;
  suggestedRetailPriceBn: string;
  estimatedSellingPrice: number;
  expectedMarginPercent: number;
  starterQtyBn: string;
  recommendedQty: number;
  unit: string;
  demandLevelBn: string;
  whyTrendingBn: string;
  marketTipBn: string;
  imageUrl: string;
  fallbackSvgUrl?: string;
  isCustom?: boolean;
  isAutoUpdated?: boolean;
  updatedAtIso?: string;
  googleImageIndex?: number;
}

const CUSTOM_TRENDING_PHOTOS_KEY = 'glowzaa_trending_custom_photos_v1';
const GOOGLE_VERIFIED_PHOTOS_KEY = 'glowzaa_google_verified_photos_v3';
const CUSTOM_TRENDING_ITEMS_KEY = 'glowzaa_custom_trending_suggestions_v1';
const AUTO_LIVE_TRENDING_ITEMS_KEY = 'glowzaa_auto_live_trending_items_v3';

// Generates a rich, high-contrast SVG product illustration data URL so every recommendation always has a crisp visual fallback while Google photo loads
export function createProductIllustrationDataUrl(
  titleEn: string,
  subtitleBn: string,
  bgStart: string,
  bgEnd: string,
  accentColor: string,
  iconType: 'claw' | 'scrunchie' | 'bow' | 'ring' | 'earring' | 'necklace' | 'mirror' | 'nails' | 'lip' | 'gift' | 'bag' | 'watch' | 'headband' | 'bangle' | 'perfume' | 'brush'
): string {
  let artSvg = '';
  switch (iconType) {
    case 'claw':
      artSvg = `
        <rect x="44" y="54" width="112" height="58" rx="26" fill="${accentColor}" opacity="0.92"/>
        <path d="M54 54 V38 M72 54 V34 M90 54 V32 M108 54 V32 M126 54 V34 M144 54 V38" stroke="${accentColor}" stroke-width="7" stroke-linecap="round"/>
        <path d="M54 112 V128 M72 112 V132 M90 112 V134 M108 112 V134 M126 112 V132 M144 112 V128" stroke="${accentColor}" stroke-width="7" stroke-linecap="round"/>
        <circle cx="68" cy="83" r="9" fill="#ffffff" opacity="0.95"/>
        <circle cx="100" cy="83" r="11" fill="#ffffff" opacity="0.95"/>
        <circle cx="132" cy="83" r="9" fill="#ffffff" opacity="0.95"/>
      `;
      break;
    case 'scrunchie':
      artSvg = `
        <circle cx="100" cy="84" r="46" fill="${accentColor}" opacity="0.88"/>
        <circle cx="100" cy="84" r="34" fill="none" stroke="#ffffff" stroke-width="6" stroke-dasharray="10 8" opacity="0.75"/>
        <circle cx="100" cy="84" r="18" fill="${bgStart}"/>
        <circle cx="100" cy="84" r="18" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.9"/>
      `;
      break;
    case 'bow':
      artSvg = `
        <path d="M100 82 L45 48 C35 68 35 96 45 114 Z" fill="${accentColor}"/>
        <path d="M100 82 L155 48 C165 68 165 96 155 114 Z" fill="${accentColor}"/>
        <path d="M92 88 L68 142 L88 136 L100 94" fill="${accentColor}" opacity="0.82"/>
        <path d="M108 88 L132 142 L112 136 L100 94" fill="${accentColor}" opacity="0.82"/>
        <circle cx="100" cy="82" r="13" fill="#ffffff"/>
        <circle cx="100" cy="82" r="9" fill="${accentColor}"/>
      `;
      break;
    case 'ring':
      artSvg = `
        <circle cx="100" cy="94" r="34" fill="none" stroke="${accentColor}" stroke-width="11"/>
        <circle cx="100" cy="94" r="29" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
        <polygon points="100,34 116,48 100,62 84,48" fill="#ffffff" stroke="${accentColor}" stroke-width="4"/>
      `;
      break;
    case 'earring':
      artSvg = `
        <circle cx="72" cy="52" r="10" fill="${accentColor}"/>
        <path d="M72 62 L52 98 C52 112 92 112 92 98 Z" fill="${accentColor}"/>
        <circle cx="58" cy="112" r="4" fill="#ffffff"/><circle cx="72" cy="116" r="4" fill="#ffffff"/><circle cx="86" cy="112" r="4" fill="#ffffff"/>
        <circle cx="128" cy="52" r="10" fill="${accentColor}"/>
        <path d="M128 62 L108 98 C108 112 148 112 148 98 Z" fill="${accentColor}"/>
        <circle cx="114" cy="112" r="4" fill="#ffffff"/><circle cx="128" cy="116" r="4" fill="#ffffff"/><circle cx="142" cy="112" r="4" fill="#ffffff"/>
      `;
      break;
    case 'necklace':
      artSvg = `
        <path d="M46 42 C46 95 154 95 154 42" fill="none" stroke="${accentColor}" stroke-width="5" stroke-dasharray="6 4"/>
        <path d="M36 42 C36 122 164 122 164 42" fill="none" stroke="${accentColor}" stroke-width="7"/>
        <circle cx="100" cy="112" r="14" fill="#ffffff" stroke="${accentColor}" stroke-width="5"/>
        <circle cx="100" cy="80" r="8" fill="${accentColor}"/>
      `;
      break;
    case 'mirror':
      artSvg = `
        <ellipse cx="82" cy="74" rx="34" ry="38" fill="#ffffff" stroke="${accentColor}" stroke-width="8"/>
        <path d="M68 54 L94 88 M76 50 L98 78" stroke="#bae6fd" stroke-width="4" stroke-linecap="round"/>
        <rect x="75" y="112" width="14" height="28" rx="7" fill="${accentColor}"/>
        <rect x="128" y="48" width="24" height="86" rx="8" fill="${accentColor}"/>
        <path d="M128 58 H142 M128 68 H142 M128 78 H142 M128 88 H142 M128 98 H142 M128 108 H142 M128 118 H142" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      `;
      break;
    case 'nails':
      artSvg = `
        <rect x="38" y="52" width="22" height="58" rx="11" fill="${accentColor}"/>
        <path d="M38 64 Q49 54 60 64" fill="#ffffff" opacity="0.85"/>
        <rect x="66" y="44" width="22" height="66" rx="11" fill="${accentColor}" opacity="0.9"/>
        <path d="M66 56 Q77 46 88 56" fill="#ffffff" opacity="0.85"/>
        <rect x="94" y="40" width="22" height="70" rx="11" fill="${accentColor}"/>
        <path d="M94 52 Q105 42 116 52" fill="#ffffff" opacity="0.85"/>
        <rect x="122" y="46" width="22" height="64" rx="11" fill="${accentColor}" opacity="0.9"/>
        <path d="M122 58 Q133 48 144 58" fill="#ffffff" opacity="0.85"/>
      `;
      break;
    case 'lip':
      artSvg = `
        <rect x="64" y="78" width="32" height="56" rx="8" fill="${accentColor}"/>
        <rect x="68" y="56" width="24" height="24" rx="4" fill="#ffffff" stroke="${accentColor}" stroke-width="3"/>
        <path d="M70 56 L70 38 Q80 28 90 38 L90 56 Z" fill="#e11d48"/>
        <rect x="110" y="48" width="28" height="86" rx="10" fill="#fb7185" stroke="#ffffff" stroke-width="3"/>
        <circle cx="124" cy="90" r="8" fill="#ffffff" opacity="0.7"/>
      `;
      break;
    case 'gift':
      artSvg = `
        <rect x="48" y="68" width="104" height="68" rx="10" fill="${accentColor}"/>
        <rect x="42" y="52" width="116" height="20" rx="6" fill="${accentColor}" stroke="#ffffff" stroke-width="2"/>
        <rect x="92" y="52" width="16" height="84" fill="#ffffff" opacity="0.9"/>
        <rect x="48" y="94" width="104" height="14" fill="#ffffff" opacity="0.9"/>
        <path d="M100 52 C75 28 62 48 96 52 C138 48 125 28 100 52 Z" fill="#ffffff" stroke="${accentColor}" stroke-width="4"/>
      `;
      break;
    case 'bag':
      artSvg = `
        <path d="M72 64 C72 34 128 34 128 64" fill="none" stroke="${accentColor}" stroke-width="8" stroke-linecap="round"/>
        <rect x="46" y="62" width="108" height="72" rx="16" fill="${accentColor}"/>
        <path d="M46 84 Q100 106 154 84" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.85"/>
        <circle cx="100" cy="94" r="9" fill="#ffffff"/>
      `;
      break;
    case 'watch':
      artSvg = `
        <rect x="82" y="28" width="36" height="114" rx="8" fill="${accentColor}" opacity="0.85"/>
        <circle cx="100" cy="85" r="32" fill="#ffffff" stroke="${accentColor}" stroke-width="8"/>
        <path d="M100 66 V85 L114 94" fill="none" stroke="${accentColor}" stroke-width="5" stroke-linecap="round"/>
      `;
      break;
    case 'headband':
      artSvg = `
        <path d="M48 124 C42 46 158 46 152 124" fill="none" stroke="${accentColor}" stroke-width="16" stroke-linecap="round"/>
        <circle cx="56" cy="86" r="7" fill="#ffffff"/><circle cx="74" cy="64" r="8" fill="#ffffff"/><circle cx="100" cy="56" r="9" fill="#ffffff"/><circle cx="126" cy="64" r="8" fill="#ffffff"/><circle cx="144" cy="86" r="7" fill="#ffffff"/>
      `;
      break;
    case 'bangle':
      artSvg = `
        <circle cx="84" cy="86" r="34" fill="none" stroke="${accentColor}" stroke-width="9"/>
        <circle cx="116" cy="86" r="34" fill="none" stroke="#d97706" stroke-width="9"/>
        <circle cx="84" cy="52" r="4" fill="#ffffff"/><circle cx="116" cy="52" r="4" fill="#ffffff"/>
      `;
      break;
    case 'perfume':
      artSvg = `
        <rect x="64" y="64" width="72" height="68" rx="14" fill="${accentColor}"/>
        <rect x="84" y="44" width="32" height="20" rx="4" fill="#ffffff" stroke="${accentColor}" stroke-width="4"/>
        <rect x="76" y="82" width="48" height="32" rx="6" fill="#ffffff" opacity="0.9"/>
        <circle cx="146" cy="52" r="10" fill="#ffffff" stroke="${accentColor}" stroke-width="4"/>
      `;
      break;
    case 'brush':
      artSvg = `
        <rect x="64" y="84" width="22" height="52" rx="6" fill="${accentColor}"/>
        <path d="M56 84 C56 50 94 50 94 84 Z" fill="#f472b6"/>
        <ellipse cx="132" cy="92" rx="24" ry="32" fill="#ec4899"/>
      `;
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgStart}"/>
        <stop offset="100%" stop-color="${bgEnd}"/>
      </linearGradient>
    </defs>
    <rect width="200" height="200" rx="24" fill="url(#g)"/>
    <circle cx="100" cy="84" r="62" fill="#ffffff" opacity="0.55"/>
    ${artSvg}
    <rect x="12" y="152" width="176" height="36" rx="10" fill="#ffffff" opacity="0.92"/>
    <text x="100" y="168" font-family="sans-serif" font-size="11" font-weight="800" fill="#0f172a" text-anchor="middle">${titleEn}</text>
    <text x="100" y="182" font-family="sans-serif" font-size="10" font-weight="700" fill="${accentColor}" text-anchor="middle">${subtitleBn}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SVG_CLAW = createProductIllustrationDataUrl('Korean Claw Clip', 'ম্যাট ও পার্ল কাকড়া', '#f3e8ff', '#fae8ff', '#7c3aed', 'claw');
const SVG_SCRUNCHIE = createProductIllustrationDataUrl('Silk Scrunchies', 'সিল্ক ও ভেলভেট স্ক্রাঞ্চি', '#ffe4e6', '#fce7f3', '#e11d48', 'scrunchie');
const SVG_BOW = createProductIllustrationDataUrl('Bow & Butterfly Clip', 'বাটারফ্লাই ও বো ক্লিপ', '#fce7f3', '#ede9fe', '#db2777', 'bow');
const SVG_METAL_CLAW = createProductIllustrationDataUrl('Golden Metal Claw', 'মেটাল ও ফ্লোরাল কাকড়া', '#fef3c7', '#ffedd5', '#d97706', 'claw');
const SVG_HEADBAND = createProductIllustrationDataUrl('Pearl Hair Band', 'পার্ল ও ক্রিস্টাল ব্যান্ড', '#e0e7ff', '#f3e8ff', '#4f46e5', 'headband');
const SVG_ELASTIC_JAR = createProductIllustrationDataUrl('100pc Elastic Jar', '১০০ পিস রাবার জার', '#ccfbf1', '#e0f2fe', '#0d9488', 'scrunchie');
const SVG_PEARL_CLIPS = createProductIllustrationDataUrl('Pearl Side Clips', '৬-পিস পার্ল ক্লিপ কার্ড', '#fef9c3', '#fce7f3', '#ca8a04', 'bow');
const SVG_BUN_MAKER = createProductIllustrationDataUrl('Magic Bun Maker', 'ম্যাজিক খোঁপা বান মেকার', '#ede9fe', '#e0e7ff', '#6d28d9', 'scrunchie');
const SVG_RING = createProductIllustrationDataUrl('Anti-Tarnish Ring', 'অ্যান্টি-টার্নিশ রিং ও ব্রেসলেট', '#fef3c7', '#fde68a', '#b45309', 'ring');
const SVG_EARRING = createProductIllustrationDataUrl('Korean Earrings', 'কোরিয়ান স্টাড ও ঝুমকা', '#fce7f3', '#fef3c7', '#be185d', 'earring');
const SVG_JHUMKA = createProductIllustrationDataUrl('Meenakari Jhumka', 'অক্সিডাইজড ও মীনাকারি ঝুমকা', '#e2e8f0', '#f1f5f9', '#334155', 'earring');
const SVG_NECKLACE = createProductIllustrationDataUrl('Layered Necklace', 'লেয়ার্ড পার্ল ও লকেট চেইন', '#fef3c7', '#fffbeb', '#d97706', 'necklace');
const SVG_BANGLE = createProductIllustrationDataUrl('Velvet Bangle Set', 'রেশমি ও ভেলভেট চুড়ি সেট', '#ffe4e6', '#fef3c7', '#be123c', 'bangle');
const SVG_BRACELET = createProductIllustrationDataUrl('Charm Bracelet', 'ক্রিস্টাল ও চার্ম ব্রেসলেট', '#f3e8ff', '#e0e7ff', '#7c3aed', 'ring');
const SVG_NOSEPIN = createProductIllustrationDataUrl('Stone Nose Pin', 'ক্লিপ-অন নোজ পিন বক্স', '#ecfdf5', '#ccfbf1', '#059669', 'ring');
const SVG_ANKLET = createProductIllustrationDataUrl('Stylish Anklets', 'ঘুঙুর পায়েল ও অ্যাঙ্কলেট', '#f0f9ff', '#e0f2fe', '#0284c7', 'necklace');
const SVG_MIRROR = createProductIllustrationDataUrl('Pocket Mirror & Comb', 'মিনি মিরর ও চিরুনি সেট', '#e0f2fe', '#fce7f3', '#0284c7', 'mirror');
const SVG_NAILS = createProductIllustrationDataUrl('Press-On Nails', 'প্রেস-অন নেইলস ও লিপ বাম', '#ffe4e6', '#f3e8ff', '#e11d48', 'nails');
const SVG_LIPTINT = createProductIllustrationDataUrl('Velvet Lip Tint', 'লিপ টিন্ট ও গ্লস', '#ffe4e6', '#fecdd3', '#be123c', 'lip');
const SVG_BRUSH = createProductIllustrationDataUrl('Beauty Blender & Brush', 'বিউটি ব্লেন্ডার ও ব্রাশ', '#fce7f3', '#fae8ff', '#db2777', 'brush');
const SVG_NAILPOLISH = createProductIllustrationDataUrl('Peel-Off Nail Polish', 'পিল-অফ নেইল পলিশ', '#fae8ff', '#ffe4e6', '#a21caf', 'nails');
const SVG_PERFUME = createProductIllustrationDataUrl('Pocket Perfume Spray', 'মিনি পকেট পারফিউম', '#e0e7ff', '#ede9fe', '#4338ca', 'perfume');
const SVG_EYELINER = createProductIllustrationDataUrl('Waterproof Eyeliner', 'ওয়াটারপ্রুফ কাজল ও আইলাইনার', '#f1f5f9', '#e2e8f0', '#0f172a', 'lip');
const SVG_PURSE = createProductIllustrationDataUrl('Mini Coin Purse', 'মিনি কয়েন ও কার্ড পার্স', '#fce7f3', '#ffe4e6', '#db2777', 'bag');
const SVG_KEYCHAIN = createProductIllustrationDataUrl('Cute Bag Charm', 'ডল কি-রিং ও ব্যাগ চার্ম', '#fef3c7', '#ffedd5', '#ea580c', 'bag');
const SVG_WATCH = createProductIllustrationDataUrl('Ladies Magnet Watch', 'লেডিস ব্রেসলেট ঘড়ি', '#ffedd5', '#fce7f3', '#c2410c', 'watch');
const SVG_POUCH = createProductIllustrationDataUrl('Cosmetic Pouch', 'মেকআপ অর্গানাইজার পাউচ', '#ccfbf1', '#f0fdf4', '#0f766e', 'bag');
const SVG_GIFT1 = createProductIllustrationDataUrl('Combo Gift Box', 'কাকড়া + স্ক্রাঞ্চি + ইয়াররিং বক্স', '#f3e8ff', '#fce7f3', '#7c3aed', 'gift');
const SVG_GIFT2 = createProductIllustrationDataUrl('Birthday Gift Hamper', 'প্রিমিয়াম গিফট হ্যাম্পার বক্স', '#ffe4e6', '#fef3c7', '#e11d48', 'gift');
const SVG_GIFT3 = createProductIllustrationDataUrl('Haldi & Bridal Combo', 'হলুদ ও ওয়েডিং গহনা কম্বো', '#fef9c3', '#ffedd5', '#ca8a04', 'gift');
const SVG_GIFT4 = createProductIllustrationDataUrl('99 Tk Student Combo', '৳৯৯ স্টুডেন্ট কম্বো প্যাক', '#e0f2fe', '#ede9fe', '#2563eb', 'gift');

export const NEW_TRENDING_SUGGESTIONS: NewTrendingProductSuggestion[] = [
  // ===================== ১. হেয়ার ও ফ্যাশন এক্সেসরিজ (HAIR & CLIPS) =====================
  {
    id: 'trend-1',
    name: 'কোরিয়ান ম্যাট ও পার্ল ক্ল-ক্লিপ (Korean Matte & Pearl Claw Clips)',
    searchQueryEn: 'Korean matte hair claw clip',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳১৮ – ৳৩৫ / পিস',
    estimatedUnitCost: 25,
    suggestedRetailPriceBn: '৳৫০ – ৳৯০ / পিস',
    estimatedSellingPrice: 65,
    expectedMarginPercent: 160,
    starterQtyBn: '২–৩ ডজন (২৪–৩৬ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 সর্বোচ্চ চাহিদা (Top Viral)',
    whyTrendingBn:
      'আপনার দোকানে রাবার ও কাকড়ার গ্রাহক বেশি। স্কুল-কলেজ ও অফিসগামী মেয়েদের কাছে কোরিয়ান প্যাস্টেল ম্যাট ও পার্ল কাকড়া এখন সবচেয়ে বেশি বিক্রি হয়।',
    marketTipBn: 'একই রঙের না নিয়ে ৬–৮টি প্যাস্টেল কালার মিক্সড ডজন নিলে দ্রুত শেষ হবে।',
    imageUrl: SVG_CLAW,
    fallbackSvgUrl: SVG_CLAW,
  },
  {
    id: 'trend-2',
    name: 'সিল্ক ও ভেলভেট স্ক্রাঞ্চি সেট (Silk & Velvet Hair Scrunchies)',
    searchQueryEn: 'silk hair scrunchies set',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳৮ – ৳১৫ / পিস',
    estimatedUnitCost: 12,
    suggestedRetailPriceBn: '৳২৫ – ৳৪০ / পিস',
    estimatedSellingPrice: 30,
    expectedMarginPercent: 150,
    starterQtyBn: '৩–৪ ডজন (৩৬–৪৮ পিস)',
    recommendedQty: 36,
    unit: 'পিস',
    demandLevelBn: '🔥 সারা বছর চলমান ট্রেন্ড',
    whyTrendingBn:
      'সাধারণ কালো রাবারের পাশাপাশি চুল না ছেঁড়ার জন্য মেয়েরা সিল্ক ও ভেলভেট স্ক্রাঞ্চি ৩–৪ পিস একসাথে কেনে। এতে একক বিক্রয়ে বেশি লাভ থাকে।',
    marketTipBn: '৩ পিসের কম্বো প্যাক বানিয়ে ৳৮০–৳১০০ টাকায় বিক্রি করলে সেল দ্বিগুণ হয়।',
    imageUrl: SVG_SCRUNCHIE,
    fallbackSvgUrl: SVG_SCRUNCHIE,
  },
  {
    id: 'trend-3',
    name: 'বাটারফ্লাই ও বো-রিবন হেয়ার ক্লিপ (Butterfly & Bow Ribbon Clips)',
    searchQueryEn: 'butterfly bow hair clip',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳১২ – ৳২২ / জোড়া',
    estimatedUnitCost: 15,
    suggestedRetailPriceBn: '৳৩৫ – ৳৬০ / জোড়া',
    estimatedSellingPrice: 40,
    expectedMarginPercent: 166,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '⚡ উচ্চ মুনাফা ও গিফট আইটেম',
    whyTrendingBn:
      'বাচ্চা ও টিনএজারদের মধ্যে লং রিবন বো-ক্লিপ এবং মুভিং বাটারফ্লাই ক্লিপ এখন সোশ্যাল মিডিয়ায় ট্রেন্ডিং। কম দামে কিনে দ্বিগুণের বেশি দামে বিক্রি করা যায়।',
    marketTipBn: 'সাদা, কালো, মেরুন ও পিঙ্ক কালার বেশি রাখবেন।',
    imageUrl: SVG_BOW,
    fallbackSvgUrl: SVG_BOW,
  },
  {
    id: 'trend-9',
    name: 'গোল্ডেন মেটাল ও ফ্লোরাল ক্ল-ক্লিপ (Golden Metal & Daisy Claw Clips)',
    searchQueryEn: 'gold metal hair claw clip',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳২৮ – ৳৪৫ / পিস',
    estimatedUnitCost: 35,
    suggestedRetailPriceBn: '৳৭০ – ৳১২০ / পিস',
    estimatedSellingPrice: 85,
    expectedMarginPercent: 143,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '✨ পার্টি ও প্রিমিয়াম হিট',
    whyTrendingBn:
      'প্লাস্টিক কাকড়ার চেয়ে গোল্ডেন মেটাল কাকড়া ভাঙে না এবং শাড়ি বা সালোয়ার-কামিজের সাথে দারুণ মানায়। মেয়েরা প্রিমিয়াম লুকের জন্য এটি বেশি দামে কেনে।',
    marketTipBn: 'বাটারফ্লাই, হার্ট ও ডেইজি ফুলের শেপের মেটাল ক্লিপ বেশি চলে।',
    imageUrl: SVG_METAL_CLAW,
    fallbackSvgUrl: SVG_METAL_CLAW,
  },
  {
    id: 'trend-10',
    name: 'পার্ল ও ক্রিস্টাল ব্রাইডাল হেয়ার ব্যান্ড (Pearl & Crystal Hair Bands)',
    searchQueryEn: 'pearl crystal headband',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳২২ – ৳৪০ / পিস',
    estimatedUnitCost: 30,
    suggestedRetailPriceBn: '৳৬০ – ৳১১০ / পিস',
    estimatedSellingPrice: 75,
    expectedMarginPercent: 150,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 18,
    unit: 'পিস',
    demandLevelBn: '🔥 স্কুল ও পার্টি ডিমান্ড',
    whyTrendingBn:
      'মুক্তা ও পাথর বসানো চিকন ও স্পঞ্জ প্যাডেড হেয়ার ব্যান্ড ছোট বাচ্চা থেকে শুরু করে কলেজ ছাত্রীদের কাছে খুবই জনপ্রিয়।',
    marketTipBn: 'কানে ব্যথা হয় না এমন সফট এন্ড-ক্যাপ যুক্ত হেয়ার ব্যান্ড আনবেন।',
    imageUrl: SVG_HEADBAND,
    fallbackSvgUrl: SVG_HEADBAND,
  },
  {
    id: 'trend-11',
    name: '১০০ পিস নাইলন সিমলেস মিনি রাবার জার (Seamless Baby & Daily Hair Ties Jar)',
    searchQueryEn: 'nylon elastic hair ties jar',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳৩৫ – ৳৫৫ / জার বা পাউচ',
    estimatedUnitCost: 42,
    suggestedRetailPriceBn: '৳৮০ – ৳১৩০ / জার',
    estimatedSellingPrice: 95,
    expectedMarginPercent: 126,
    starterQtyBn: '২ ডজন জার (২৪টি)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '📈 প্রতিদিন বিক্রির পণ্য',
    whyTrendingBn:
      'ছোট প্লাস্টিক জার বা জিপ-লক পাউচে ৫০-১০০ পিস রঙিন ও কালো রাবার সেট অভিভাবকরা বাচ্চাদের জন্য একসাথে পুরো জার কিনে নেন।',
    marketTipBn: 'প্যাস্টেল মাল্টিকালার এবং পিওর ব্ল্যাক—উভয় ধরনের পাউচ রাখুন।',
    imageUrl: SVG_ELASTIC_JAR,
    fallbackSvgUrl: SVG_ELASTIC_JAR,
  },
  {
    id: 'trend-12',
    name: 'কোরিয়ান ৬-পিস পার্ল ও স্টোন টিকটিকি/সাইড ক্লিপ কার্ড (6-Pc Pearl Snap Clips Card)',
    searchQueryEn: 'pearl snap hair clips card',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳২৫ – ৳৪২ / কার্ড',
    estimatedUnitCost: 32,
    suggestedRetailPriceBn: '৳৬৫ – ৳১০০ / কার্ড',
    estimatedSellingPrice: 75,
    expectedMarginPercent: 134,
    starterQtyBn: '২ ডজন কার্ড (২৪টি)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 হাই-ভলিউম সেল',
    whyTrendingBn:
      'এক কার্ডে ৪–৬টি ভিন্ন ডিজাইনের মুক্তা ও গোল্ডেন সাইড ক্লিপ থাকে। কাস্টমাররা আলাদা ক্লিপ না কিনে পুরো কার্ডটিই একসাথে কেনে।',
    marketTipBn: 'ডিসপ্লে স্ট্যান্ডে ঝুলিয়ে রাখলে কাস্টমারদের চোখে দ্রুত পড়ে।',
    imageUrl: SVG_PEARL_CLIPS,
    fallbackSvgUrl: SVG_PEARL_CLIPS,
  },
  {
    id: 'trend-13',
    name: 'মেজিক ডোনাট বান মেকার ও ফ্রেঞ্চ টুইস্ট স্টিক (Magic Hair Bun Maker & U-Pin)',
    searchQueryEn: 'hair bun maker tool',
    category: 'hair_fashion',
    categoryLabelBn: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳১৫ – ৳২৮ / পিস',
    estimatedUnitCost: 20,
    suggestedRetailPriceBn: '৳৪৫ – ৳৭৫ / পিস',
    estimatedSellingPrice: 55,
    expectedMarginPercent: 175,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '⚡ ১৭৫% মুনাফা আইটেম',
    whyTrendingBn:
      'মাত্র ১০ সেকেন্ডে খোঁপা বাঁধার জন্য পার্ল ডেভেলপড ম্যাজিক বান মেকার ও ইউ-পিন এখন প্রচুর চলছে।',
    marketTipBn: 'কাস্টমারকে কীভাবে খোঁপা বাঁধতে হয় ১ বার দেখিয়ে দিলেই সাথে সাথে কিনে নেয়।',
    imageUrl: SVG_BUN_MAKER,
    fallbackSvgUrl: SVG_BUN_MAKER,
  },

  // ===================== ২. জুয়েলারি ও রিং (JEWELRY & RINGS) =====================
  {
    id: 'trend-4',
    name: 'অ্যান্টি-টার্নিশ স্টেইনলেস স্টিল রিং ও ব্রেসলেট (Anti-Tarnish Rings & Bracelets)',
    searchQueryEn: 'gold plated adjustable rings women',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳৪৫ – ৳৮৫ / পিস',
    estimatedUnitCost: 60,
    suggestedRetailPriceBn: '৳১২০ – ৳২২০ / পিস',
    estimatedSellingPrice: 150,
    expectedMarginPercent: 150,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 12,
    unit: 'পিস',
    demandLevelBn: '💎 প্রিমিয়াম প্রফিট ট্রেন্ড',
    whyTrendingBn:
      'রঙ নষ্ট হয় না এমন ওয়াটারপ্রুফ মিনিমালিস্ট রিং, পেনডেন্ট চেইন ও ব্রেসলেটের চাহিদা এখন সবচেয়ে বেশি। প্রতিটি বিক্রয়ে ৳৬০–৳১০০ সরাসরি লাভ থাকে।',
    marketTipBn: 'অ্যাডজাস্টেবল সাইজের রিং নিলে সাইজ নিয়ে কোনো ঝামেলা থাকে না।',
    imageUrl: SVG_RING,
    fallbackSvgUrl: SVG_RING,
  },
  {
    id: 'trend-5',
    name: 'কোরিয়ান স্টাড ও ঝুমকা ইয়াররিংস কার্ড (Korean Stud & Jhumka Earrings)',
    searchQueryEn: 'Korean pearl stud earrings card',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳২০ – ৳৪৫ / জোড়া',
    estimatedUnitCost: 30,
    suggestedRetailPriceBn: '৳৬০ – ৳১২০ / জোড়া',
    estimatedSellingPrice: 75,
    expectedMarginPercent: 150,
    starterQtyBn: '২ ডজন (২৪ জোড়া)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 ডেইলি ফাস্ট-সেলিং',
    whyTrendingBn:
      'হেয়ার ক্লিপ কিনতে আসা কাস্টমাররা কাউন্টারে সুন্দর ইয়াররিংস দেখলে সাথে সাথেই ১–২ জোড়া কিনে নেয় (Impulse Buy)।',
    marketTipBn: '৬ জোড়ার স্টাড কার্ড ও ছোট অক্সিডাইজড ঝুমকা একসাথে রাখুন।',
    imageUrl: SVG_EARRING,
    fallbackSvgUrl: SVG_EARRING,
  },
  {
    id: 'trend-14',
    name: 'ইন্ডিয়ান অক্সিডাইজড ও মীনাকারি ঝুমকা (Oxidised & Meenakari Jhumka)',
    searchQueryEn: 'oxidised silver jhumka earrings',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳২৫ – ৳৫৫ / জোড়া',
    estimatedUnitCost: 35,
    suggestedRetailPriceBn: '৳৭০ – ৳১৫০ / জোড়া',
    estimatedSellingPrice: 90,
    expectedMarginPercent: 157,
    starterQtyBn: '২–৩ ডজন (২৪–৩৬ জোড়া)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 দেশীয় ও উৎসব হিট',
    whyTrendingBn:
      'কুর্তি, কামিজ ও শাড়ির সাথে সিলভার অক্সিডাইজড এবং রঙিন মীনাকারি ঝুমকা সবসময়ই মেয়েদের প্রথম পছন্দ।',
    marketTipBn: 'ছোট ও মাঝারি সাইজের ঝুমকা সবচেয়ে দ্রুত বিক্রি হয়।',
    imageUrl: SVG_JHUMKA,
    fallbackSvgUrl: SVG_JHUMKA,
  },
  {
    id: 'trend-15',
    name: 'মাল্টি-লেয়ার বাটারফ্লাই ও পার্ল চোকার নেকলেস (Layered Pearl & Pendant Necklace)',
    searchQueryEn: 'layered butterfly pearl necklace',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳৩৫ – ৳৬৫ / পিস',
    estimatedUnitCost: 45,
    suggestedRetailPriceBn: '৳৯০ – ৳১৮০ / পিস',
    estimatedSellingPrice: 120,
    expectedMarginPercent: 166,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 18,
    unit: 'পিস',
    demandLevelBn: '💎 হাই-মার্জিন অর্নামেন্ট',
    whyTrendingBn:
      'ডাবল লেয়ারের গোল্ডেন চেইন ও ছোট মুক্তার লকেট এখন তরুণীদের মধ্যে ভাইরাল। দেখতে দামি মনে হওয়ায় ভালো দামে বিক্রি হয়।',
    marketTipBn: 'কালো ভেলভেট নেক-স্ট্যান্ডে ২টি চেইন সাজিয়ে রাখলে সহজেই বিক্রি হয়।',
    imageUrl: SVG_NECKLACE,
    fallbackSvgUrl: SVG_NECKLACE,
  },
  {
    id: 'trend-16',
    name: 'কাঁচের রেশমি চুড়ি ও ভেলভেট মেটাল চুড়ি সেট (Velvet & Kundan Bangle Set)',
    searchQueryEn: 'red velvet glass bangles set',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳৪০ – ৳৭৫ / বক্স সেট',
    estimatedUnitCost: 55,
    suggestedRetailPriceBn: '৳১০০ – ৳১৮০ / বক্স সেট',
    estimatedSellingPrice: 130,
    expectedMarginPercent: 136,
    starterQtyBn: '২ ডজন বক্স (২৪টি)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 মেলা ও উৎসবের সেরা আইটেম',
    whyTrendingBn:
      'লাল, মেরুন, সবুজ, হলুদ ও গোল্ডেন রেশমি এবং মেটাল চুড়ি ছাড়া মেয়েদের কেনাকাটা অসম্পূর্ণ থাকে।',
    marketTipBn: '২.৪, ২.৬ এবং ২.৮—এই ৩টি সাইজ মিলিয়ে স্টক রাখবেন।',
    imageUrl: SVG_BANGLE,
    fallbackSvgUrl: SVG_BANGLE,
  },
  {
    id: 'trend-17',
    name: 'ম্যাগনেটিক কাপল ও ফ্রেন্ডশিপ চার্ম ব্রেসলেট (Charm & Beaded Bracelets)',
    searchQueryEn: 'crystal beaded charm bracelet',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳১৮ – ৳৩৫ / পিস',
    estimatedUnitCost: 24,
    suggestedRetailPriceBn: '৳৫০ – ৳৯০ / পিস',
    estimatedSellingPrice: 60,
    expectedMarginPercent: 150,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '⚡ স্কুল-কলেজ ক্রেজ',
    whyTrendingBn:
      'ক্রিস্টাল বিডস ও গ্লো-ইন-দ্য-ডার্ক ফ্রেন্ডশিপ ব্রেসলেট বান্ধবীরা একসাথে ২–৪টি করে কেনে।',
    marketTipBn: 'জোড়া হিসেবে স্পেশাল প্রাইস দিলে কাস্টমার ১টির বদলে ২টি নেয়।',
    imageUrl: SVG_BRACELET,
    fallbackSvgUrl: SVG_BRACELET,
  },
  {
    id: 'trend-18',
    name: 'নো-পিয়ার্সিং ক্লিপ-অন নোজ পিন ও স্টোন নথ (Clip-on Nose Pin & Stud Box)',
    searchQueryEn: 'gold stone nose pin stud',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳৮ – ৳১৮ / পিস (বক্স হিসেবে)',
    estimatedUnitCost: 12,
    suggestedRetailPriceBn: '৳২৫ – ৳৫০ / পিস',
    estimatedSellingPrice: 35,
    expectedMarginPercent: 191,
    starterQtyBn: '১ বক্স (২৪–৩৬ পিস)',
    recommendedQty: 36,
    unit: 'পিস',
    demandLevelBn: '💎 প্রায় ২০০% লাভ',
    whyTrendingBn:
      'নাক না ফুঁড়িয়েই পরা যায় এমন অক্সিডাইজড ও ডায়মন্ড-কাট স্টোন নোজ-পিন খুব কম জায়গায় থাকে কিন্তু বিক্রি হয় প্রচুর।',
    marketTipBn: 'ছোট ডিসপ্লে বক্সসহ কিনলে কাউন্টারের এক কোণায় খুব সুন্দর দেখায়।',
    imageUrl: SVG_NOSEPIN,
    fallbackSvgUrl: SVG_NOSEPIN,
  },
  {
    id: 'trend-19',
    name: 'ফ্যাশনেবল ঘুঙুর পায়েল ও অ্যাঙ্কলেট (Silver Plated & Beaded Anklets)',
    searchQueryEn: 'silver ghungroo payal anklet',
    category: 'jewelry',
    categoryLabelBn: 'জুয়েলারি ও অর্নামেন্টস',
    wholesalePriceRangeBn: '৳৩০ – ৳৬০ / জোড়া',
    estimatedUnitCost: 42,
    suggestedRetailPriceBn: '৳৮০ – ৳১৫০ / জোড়া',
    estimatedSellingPrice: 100,
    expectedMarginPercent: 138,
    starterQtyBn: '১–২ ডজন (১২–২৪ জোড়া)',
    recommendedQty: 18,
    unit: 'পিস',
    demandLevelBn: '📈 সারা বছর চাহিদা',
    whyTrendingBn:
      'সিলভার প্লেটেড চিকন পায়েল এবং কালো সুতার নজর-বাট্টু অ্যাঙ্কলেট মেয়েদের ও বাচ্চাদের জন্য নিয়মিত বিক্রি হয়।',
    marketTipBn: 'রঙ কালো হয় না এমন অ্যালয় পলিশ পায়েল বেছে আনবেন।',
    imageUrl: SVG_ANKLET,
    fallbackSvgUrl: SVG_ANKLET,
  },

  // ===================== ৩. কসমেটিকস ও মিরর (COSMETICS & MIRRORS) =====================
  {
    id: 'trend-6',
    name: 'মিনি পকেট মিরর ও ফোল্ডিং চিরুনি সেট (Cute Pocket Mirror & Comb)',
    searchQueryEn: 'cute folding pocket mirror comb',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳২২ – ৳৪০ / পিস',
    estimatedUnitCost: 28,
    suggestedRetailPriceBn: '৳৫৫ – ৳৯০ / পিস',
    estimatedSellingPrice: 65,
    expectedMarginPercent: 132,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 18,
    unit: 'পিস',
    demandLevelBn: '📈 নিয়মিত চাহিদা',
    whyTrendingBn:
      'ব্যাগে রাখার মতো কার্টুন/ফ্লোরাল পকেট মিরর ও এয়ার-কুশন মিনি চিরুনি সব বয়সের কাস্টমার পছন্দ করে এবং কখনো নষ্ট বা মেয়াদোত্তীর্ণ হয় না।',
    marketTipBn: 'কাউন্টারের সামনে ডিসপ্লে করে রাখলে কাস্টমার নিজেই পছন্দ করে নেয়।',
    imageUrl: SVG_MIRROR,
    fallbackSvgUrl: SVG_MIRROR,
  },
  {
    id: 'trend-7',
    name: 'প্রেস-অন নেইলস ও টিন্টেড লিপ বাম (Press-On Nails & Lip Gloss)',
    searchQueryEn: 'glossy press on nails kit',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳৩০ – ৳৫৫ / প্যাক',
    estimatedUnitCost: 40,
    suggestedRetailPriceBn: '৳৮০ – ৳১৪০ / প্যাক',
    estimatedSellingPrice: 100,
    expectedMarginPercent: 150,
    starterQtyBn: '১২–১৮ পিস',
    recommendedQty: 12,
    unit: 'পিস',
    demandLevelBn: '✨ উৎসব ও পার্টি ট্রেন্ড',
    whyTrendingBn:
      'বিয়ে বা যেকোনো অনুষ্ঠানে ইনস্ট্যান্ট ব্যবহারের জন্য গ্লু-সহ প্রেস-অন নেইল সেট এবং ফ্রুট লিপ অয়েল/বাম এখন তরুণীদের প্রথম পছন্দ।',
    marketTipBn: 'ন্যাচারাল ন্যুড ও ফ্রেঞ্চ টিপ ডিজাইনের নেইল সেট সবচেয়ে বেশি চলে।',
    imageUrl: SVG_NAILS,
    fallbackSvgUrl: SVG_NAILS,
  },
  {
    id: 'trend-20',
    name: 'কোরিয়ান ওয়াটারপ্রুফ ভেলভেট ম্যাট লিপ টিন্ট ও গ্লস (Velvet Lip Tint & Plumping Gloss)',
    searchQueryEn: 'velvet lip tint gloss',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳৩৫ – ৳৬৫ / পিস',
    estimatedUnitCost: 45,
    suggestedRetailPriceBn: '৳৯০ – ৳১৬০ / পিস',
    estimatedSellingPrice: 110,
    expectedMarginPercent: 144,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 বেস্ট-সেলিং কসমেটিকস',
    whyTrendingBn:
      'আইসক্রিম, বিয়ার ও ফ্রুট শেপের কিউট কন্টেইনারে থাকা লিপ টিন্ট ও গ্লস স্কুল-কলেজের মেয়েদের কাছে সবচেয়ে আকর্ষণীয় আইটেম।',
    marketTipBn: 'পিচ, বেরি পিঙ্ক, চেরি রেড এবং টেরাকোটা ন্যুড শেড বেশি আনবেন।',
    imageUrl: SVG_LIPTINT,
    fallbackSvgUrl: SVG_LIPTINT,
  },
  {
    id: 'trend-21',
    name: 'পিউমিস পাউচ বিউটি ব্লেন্ডার ও মেকআপ ব্রাশ সেট (Beauty Blender Jar & Mini Brush Set)',
    searchQueryEn: 'makeup sponge beauty blender',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳১৫ – ৳৩৫ / পিস বা সেট',
    estimatedUnitCost: 22,
    suggestedRetailPriceBn: '৳৪৫ – ৳৯০ / পিস বা সেট',
    estimatedSellingPrice: 55,
    expectedMarginPercent: 150,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '⚡ নন-এক্সপায়ারি হাই প্রফিট',
    whyTrendingBn:
      'মেকআপ স্পঞ্জ (বিউটি ব্লেন্ডার) ও ট্রাভেল সাইজ ব্রাশ সেটের কোনো এক্সপায়ারি ডেট নেই, তাই স্টকে নষ্ট হওয়ার ভয় ছাড়াই প্রচুর লাভ করা যায়।',
    marketTipBn: 'সিঙ্গেল কেসসহ বিউটি ব্লেন্ডার রাখলে ধুলোবালি লাগে না এবং বেশি দামে বিক্রি হয়।',
    imageUrl: SVG_BRUSH,
    fallbackSvgUrl: SVG_BRUSH,
  },
  {
    id: 'trend-22',
    name: 'পিল-অফ ও গ্লিটার নেইল পলিশ কম্বো (Peel-Off & Pastel Nail Polish)',
    searchQueryEn: 'peel off nail polish bottle',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳১৮ – ৳৩২ / পিস',
    estimatedUnitCost: 24,
    suggestedRetailPriceBn: '৳৫০ – ৳৮০ / পিস',
    estimatedSellingPrice: 60,
    expectedMarginPercent: 150,
    starterQtyBn: '২–৩ ডজন (২৪–৩৬ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 ওজু-বান্ধব জনপ্রিয় পণ্য',
    whyTrendingBn:
      'সহজেই উঠিয়ে ফেলা যায় এমন হালাল/পিল-অফ নেইল পলিশ বাংলাদেশে মেয়েদের কাছে প্রচণ্ড জনপ্রিয়।',
    marketTipBn: '২-ইন-১ ডাবল সাইডেড নেইল পলিশ বোতল নিলে কাস্টমার দ্রুত আকৃষ্ট হয়।',
    imageUrl: SVG_NAILPOLISH,
    fallbackSvgUrl: SVG_NAILPOLISH,
  },
  {
    id: 'trend-23',
    name: 'পকেট পারফিউম ও রোল-অন বডি মিস্ট (Mini Pocket Perfume & Attar Roll-On)',
    searchQueryEn: 'mini pocket perfume spray',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳৩৫ – ৳৬০ / পিস',
    estimatedUnitCost: 45,
    suggestedRetailPriceBn: '৳৮০ – ৳১৫০ / পিস',
    estimatedSellingPrice: 105,
    expectedMarginPercent: 133,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 18,
    unit: 'পিস',
    demandLevelBn: '✨ ছেলে-মেয়ে সবার চাহিদা',
    whyTrendingBn:
      '১০–২০ মিলি পকেট পারফিউম স্প্রে ও ফ্লোরাল/ভ্যানিলা রোল-অন পারফিউম কম দামে কিনে দুর্দান্ত লাভে বিক্রি করা যায়।',
    marketTipBn: 'টেস্টার হিসেবে ১টি বোতল খুলে রাখলে ঘ্রাণ শুঁকেই কাস্টমার কিনে ফেলে।',
    imageUrl: SVG_PERFUME,
    fallbackSvgUrl: SVG_PERFUME,
  },
  {
    id: 'trend-24',
    name: '৩৬-ঘণ্টা ওয়াটারপ্রুফ কাজল, আইলাইনার ও মাসকারা (Waterproof Eyeliner & Kajal)',
    searchQueryEn: 'waterproof liquid eyeliner pen',
    category: 'cosmetics',
    categoryLabelBn: 'কসমেটিকস ও ডেইলি ইউজ',
    wholesalePriceRangeBn: '৳২৫ – ৳৫০ / পিস',
    estimatedUnitCost: 35,
    suggestedRetailPriceBn: '৳৭০ – ৳১৩০ / পিস',
    estimatedSellingPrice: 85,
    expectedMarginPercent: 142,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '🔥 প্রতিদিনের আবশ্যক পণ্য',
    whyTrendingBn:
      'স্মাজ-প্রুফ স্কেচ পেন আইলাইনার এবং ডিপ ব্ল্যাক কাজল মেয়েদের সারা বছরের নিত্যপ্রয়োজনীয় প্রসাধনী।',
    marketTipBn: 'গোল্ডেন বা রোজ-গোল্ড বডির ওয়াটারপ্রুফ স্কেচ আইলাইনার সবচেয়ে বেশি চলে।',
    imageUrl: SVG_EYELINER,
    fallbackSvgUrl: SVG_EYELINER,
  },

  // ===================== ৪. ব্যাগ, ঘড়ি ও ফ্যাশন এক্সেসরিজ (BAGS & ACCESSORIES) =====================
  {
    id: 'trend-25',
    name: 'কোরিয়ান মিনি কয়েন পাউচ ও কার্ড হোল্ডার পার্স (Mini Coin Purse & Ladies Wallet)',
    searchQueryEn: 'mini quilted coin purse women',
    category: 'bags_accessories',
    categoryLabelBn: 'ব্যাগ ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳৪৫ – ৳৮৫ / পিস',
    estimatedUnitCost: 60,
    suggestedRetailPriceBn: '৳১১০ – ৳২০০ / পিস',
    estimatedSellingPrice: 140,
    expectedMarginPercent: 133,
    starterQtyBn: '১–২ ডজন (১২–২৪ পিস)',
    recommendedQty: 12,
    unit: 'পিস',
    demandLevelBn: '🔥 অত্যন্ত জনপ্রিয় গিফট',
    whyTrendingBn:
      'কুইল্টেড লেদার ও প্যাস্টেল রঙের ছোট জিপার কয়েন পার্স ও মানিব্যাগ মেয়েরা রাবার-ক্লিপ কেনার সময় সাথে কিনে নেয়।',
    marketTipBn: 'পিঙ্ক, ল্যাভেন্ডার, মিন্ট গ্রিন ও ব্ল্যাক কালার রাখলে দ্রুত শেষ হয়।',
    imageUrl: SVG_PURSE,
    fallbackSvgUrl: SVG_PURSE,
  },
  {
    id: 'trend-26',
    name: 'সিলিকন ও ফ্লাফি ডল কি-রিং এবং ব্যাগ চার্ম (Cute Bag Charms & Keychains)',
    searchQueryEn: 'cute cartoon keychain bag charm',
    category: 'bags_accessories',
    categoryLabelBn: 'ব্যাগ ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳২২ – ৳৪৫ / পিস',
    estimatedUnitCost: 30,
    suggestedRetailPriceBn: '৳৬০ – ৳১২০ / পিস',
    estimatedSellingPrice: 75,
    expectedMarginPercent: 150,
    starterQtyBn: '২ ডজন (২৪ পিস)',
    recommendedQty: 24,
    unit: 'পিস',
    demandLevelBn: '⚡ ১৫০% লাভ ও ফাস্ট-মুভিং',
    whyTrendingBn:
      'স্কুল ব্যাগ, ভ্যানিটি ব্যাগ ও চাবির রিংয়ে ঝোলানোর জন্য কার্টুন, টেডি ও পম-পম বল কি-রিং প্রচুর বিক্রি হয়।',
    marketTipBn: 'দোকানের সামনের হুকে ঝুলিয়ে রাখলে বাচ্চা ও তরুণীরা দেখলেই কেনে।',
    imageUrl: SVG_KEYCHAIN,
    fallbackSvgUrl: SVG_KEYCHAIN,
  },
  {
    id: 'trend-27',
    name: 'ম্যাগনেটিক চেইন ও ব্রেসলেট লেডিস ঘড়ি (Ladies Bracelet & Magnet Watch)',
    searchQueryEn: 'rose gold ladies magnetic watch',
    category: 'bags_accessories',
    categoryLabelBn: 'ব্যাগ ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳৮৫ – ৳১৪০ / পিস',
    estimatedUnitCost: 110,
    suggestedRetailPriceBn: '৳২২০ – ৳৩৫০ / পিস',
    estimatedSellingPrice: 260,
    expectedMarginPercent: 136,
    starterQtyBn: '৬–১২ পিস',
    recommendedQty: 12,
    unit: 'পিস',
    demandLevelBn: '💎 প্রতি পিসে ৳১৫০+ লাভ',
    whyTrendingBn:
      'রোজ-গোল্ড ম্যাগনেট বেল্ট এবং স্টোন ব্রেসলেট ঘড়ি গিফট দেওয়ার জন্য কাস্টমারদের কাছে দারুণ চাহিদাসম্পন্ন।',
    marketTipBn: 'ঘড়ির সাথে ছোট গিফট বক্স (৳১০) রাখলে কাস্টমার আনন্দের সাথে ৳২৮০–৳৩০০ দেয়।',
    imageUrl: SVG_WATCH,
    fallbackSvgUrl: SVG_WATCH,
  },
  {
    id: 'trend-28',
    name: 'ট্রান্সপারেন্ট ওয়াটারপ্রুফ কসমেটিক অর্গানাইজার পাউচ (Travel Makeup Pouch)',
    searchQueryEn: 'transparent travel makeup pouch',
    category: 'bags_accessories',
    categoryLabelBn: 'ব্যাগ ও ফ্যাশন এক্সেসরিজ',
    wholesalePriceRangeBn: '৳৩৮ – ৳৭০ / পিস',
    estimatedUnitCost: 50,
    suggestedRetailPriceBn: '৳৯০ – ৳১৬০ / পিস',
    estimatedSellingPrice: 120,
    expectedMarginPercent: 140,
    starterQtyBn: '১ ডজন (১২ পিস)',
    recommendedQty: 12,
    unit: 'পিস',
    demandLevelBn: '📈 ট্রাভেল ও ডেইলি হিট',
    whyTrendingBn:
      'ক্লিপ, রাবার, লিপস্টিক ও কাজল গুছিয়ে রাখার জন্য ওয়াটারপ্রুফ জিপার মেকআপ পাউচ মেয়েরা খুব পছন্দ করে।',
    marketTipBn: 'পাউচের ভেতর ২–৩টি পণ্য সাজিয়ে ডিসপ্লে করলে পাউচ ও পণ্য দুটোই বিক্রি হয়!',
    imageUrl: SVG_POUCH,
    fallbackSvgUrl: SVG_POUCH,
  },

  // ===================== ৫. গিফট কম্বো ও বান্ডেল (GIFT COMBOS) =====================
  {
    id: 'trend-8',
    name: 'কম্বো গিফট বক্স (কাকড়া + স্ক্রাঞ্চি + ইয়াররিংস কম্বো প্যাক)',
    searchQueryEn: 'hair accessories gift box hamper',
    category: 'gift_combo',
    categoryLabelBn: 'কম্বো ও গিফট আইটেম',
    wholesalePriceRangeBn: '৳৬৫ – ৳৯০ / বক্স প্রস্তুত খরচ',
    estimatedUnitCost: 75,
    suggestedRetailPriceBn: '৳১৫০ – ৳২২০ / বক্স',
    estimatedSellingPrice: 170,
    expectedMarginPercent: 126,
    starterQtyBn: '১০–১৫টি রেডি বক্স',
    recommendedQty: 10,
    unit: 'পিস',
    demandLevelBn: '🎁 গিফট ও বান্ডেল হিট',
    whyTrendingBn:
      'আপনার দোকানের বিদ্যমান রাবার, কাকড়া ও ক্লিপগুলো ছোট ট্রান্সপারেন্ট বক্সে বা অর্গানজা ব্যাগে সাজিয়ে গিফট কম্বো বানালে এক বক্সেই ৪–৫টি পণ্য একসাথে বিক্রি হয়ে যায়!',
    marketTipBn:
      'বাজার থেকে শুধু ছোট গিফট পাউচ বা ক্রাফট বক্স (৳৫–৳৮ পিস) কিনে আনলেই নিজের দোকানেই কম্বো তৈরি করতে পারবেন।',
    imageUrl: SVG_GIFT1,
    fallbackSvgUrl: SVG_GIFT1,
  },
  {
    id: 'trend-29',
    name: 'বার্থডে ও অ্যানিভার্সারি বাজেট গিফট হ্যাম্পার (ঘড়ি + ব্রেসলেট + চকলেট/রোজ বক্স)',
    searchQueryEn: 'ladies watch bracelet gift box',
    category: 'gift_combo',
    categoryLabelBn: 'কম্বো ও গিফট আইটেম',
    wholesalePriceRangeBn: '৳১৩০ – ৳১৮০ / বক্স প্রস্তুত খরচ',
    estimatedUnitCost: 150,
    suggestedRetailPriceBn: '৳৩০০ – ৳৪৫০ / বক্স',
    estimatedSellingPrice: 350,
    expectedMarginPercent: 133,
    starterQtyBn: '৬–১০টি রেডি হ্যাম্পার',
    recommendedQty: 8,
    unit: 'পিস',
    demandLevelBn: '💎 এক সেলেই ৳২০০ লাভ',
    whyTrendingBn:
      'জন্মদিন বা বিশেষ দিনে উপহার দেওয়ার জন্য রেডিমেড সাজানো গিফট বক্স কাস্টমাররা দরদাম ছাড়াই কিনে নেয়।',
    marketTipBn: 'বক্সের ভেতর একটু রঙিন পেপার কুচি ও ফিতা বাঁধলে প্রিমিয়াম শোরুমের লুক আসে।',
    imageUrl: SVG_GIFT2,
    fallbackSvgUrl: SVG_GIFT2,
  },
  {
    id: 'trend-30',
    name: 'গায়ে হলুদ ও ওয়েডিং কম্বো প্যাক (ফুলের গহনা + চুড়ি + টিপ + আলতা সেট)',
    searchQueryEn: 'yellow floral haldi jewelry set',
    category: 'gift_combo',
    categoryLabelBn: 'কম্বো ও গিফট আইটেম',
    wholesalePriceRangeBn: '৳৮০ – ৳১২০ / সেট',
    estimatedUnitCost: 95,
    suggestedRetailPriceBn: '৳২০০ – ৳৩০০ / সেট',
    estimatedSellingPrice: 240,
    expectedMarginPercent: 152,
    starterQtyBn: '৮–১২ সেট',
    recommendedQty: 10,
    unit: 'পিস',
    demandLevelBn: '✨ বিয়ের মৌসুমে সুপারহিট',
    whyTrendingBn:
      'গায়ে হলুদ ও বিয়ের অনুষ্ঠানে আর্টিফিশিয়াল ফুলের কানের দুল, টিকলি ও চুড়ির ম্যাচিং সেট মেয়েরা দলবেঁধে কেনে।',
    marketTipBn: 'হলুদ, লাল ও মেজেন্টা রঙের ফ্লোরাল সেট সবসময় ২–৩ জোড়া রেডি রাখবেন।',
    imageUrl: SVG_GIFT3,
    fallbackSvgUrl: SVG_GIFT3,
  },
  {
    id: 'trend-31',
    name: 'স্কুল ও কলেজ গার্লস ডেইলি কম্বো প্যাক (২টি বো-ক্লিপ + ৬টি রাবার + ১টি পকেট মিরর)',
    searchQueryEn: 'pink hair claw clip scrunchies gift set',
    category: 'gift_combo',
    categoryLabelBn: 'কম্বো ও গিফট আইটেম',
    wholesalePriceRangeBn: '৳৪০ – ৳৫৫ / প্যাক',
    estimatedUnitCost: 45,
    suggestedRetailPriceBn: '৳৯৯ – ৳১৩০ / প্যাক',
    estimatedSellingPrice: 99,
    expectedMarginPercent: 120,
    starterQtyBn: '১৫–২০টি প্যাক',
    recommendedQty: 15,
    unit: 'পিস',
    demandLevelBn: '🔥 ৳৯৯ ম্যাজিক প্রাইস প্যাক',
    whyTrendingBn:
      '“মাত্র ৯৯ টাকায় কম্বো প্যাক” লিখে ডিসপ্লে করলে স্কুল-কলেজের ছাত্রী ও অভিভাবকদের কাছে দারুণ সাড়া পাওয়া যায়।',
    marketTipBn: 'সাদা ও কালো রঙের স্কুল অনুমোদিত রাবার ও রিবন দিয়েও আলাদা স্টুডেন্ট প্যাক করতে পারেন।',
    imageUrl: SVG_GIFT4,
    fallbackSvgUrl: SVG_GIFT4,
  },
];

export function loadCustomTrendingPhotos(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CUSTOM_TRENDING_PHOTOS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadGoogleVerifiedPhotos(): Record<string, string> {
  try {
    const raw = localStorage.getItem(GOOGLE_VERIFIED_PHOTOS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadCustomTrendingSuggestions(): NewTrendingProductSuggestion[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TRENDING_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadAutoLiveTrendingSuggestions(): NewTrendingProductSuggestion[] {
  try {
    const raw = localStorage.getItem(AUTO_LIVE_TRENDING_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compressUploadedSuggestionImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 420;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// Safely convert an image URL to a base64 Data URL for html2canvas so external CORS images never break PDF generation
async function resolveSafeImageDataUrl(url?: string, fallbackUrl?: string): Promise<string | null> {
  const tryConvert = (targetUrl?: string): Promise<string | null> => {
    if (!targetUrl || !targetUrl.trim()) return Promise.resolve(null);
    const trimmed = targetUrl.trim();
    if (trimmed.startsWith('data:image/')) {
      return Promise.resolve(trimmed);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = window.setTimeout(() => {
        resolve(null);
      }, 2500);

      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const size = 140;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
          const scale = Math.max(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
          const w = (img.naturalWidth || size) * scale;
          const h = (img.naturalHeight || size) * scale;
          const x = (size - w) / 2;
          const y = (size - h) / 2;
          ctx.drawImage(img, x, y, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };

      img.src = trimmed;
    });
  };

  const primary = await tryConvert(url);
  if (primary) return primary;
  if (fallbackUrl) return tryConvert(fallbackUrl);
  return null;
}

export interface ProductMarketMetrics {
  product: Product;
  numericSku: number;
  currentStock: number;
  reorderPoint: number;
  averageCost: number;
  sellingPrice: number;
  unitProfit: number;
  marginPercent: number;
  stockCostValue: number;
  stockRetailValue: number;
  totalSoldUnits: number;
  totalSalesCount: number;
  totalRevenue: number;
  totalProfitEarned: number;
  stockStatus: 'out' | 'low' | 'ok';
  isTrending: boolean;
  needsPurchase: boolean;
  recommendedBuyQty: number;
  estimatedPurchaseCost: number;
  urgencyReasonBn: string;
  trendingReasonBn: string;
}

export function analyzeProductsForMarket(
  products: Product[],
  entries: Entry[],
  defaultReorderPoint: number = 5
): ProductMarketMetrics[] {
  const postedSales = entries.filter((e) => e.status === 'posted' && e.type === 'sale');

  const salesMap = new Map<
    string,
    { units: number; count: number; revenue: number; profit: number }
  >();

  for (const sale of postedSales) {
    if (!sale.productId) continue;
    const prev = salesMap.get(sale.productId) || { units: 0, count: 0, revenue: 0, profit: 0 };
    const qty = Number(sale.quantity) > 0 ? Number(sale.quantity) : 1;
    const rev = Number(sale.amount) || 0;
    const prof =
      sale.grossProfit !== undefined
        ? Number(sale.grossProfit)
        : sale.profit !== undefined
        ? Number(sale.profit)
        : Math.max(0, rev - (Number(sale.cogsAmount) || 0));
    salesMap.set(sale.productId, {
      units: prev.units + qty,
      count: prev.count + 1,
      revenue: prev.revenue + rev,
      profit: prev.profit + prof,
    });
  }

  return products.map((product, idx) => {
    const currentStock = Number(product.currentStock) || 0;
    const reorderPoint =
      product.reorderPoint !== undefined && product.reorderPoint !== null
        ? Number(product.reorderPoint)
        : defaultReorderPoint;
    const averageCost = Number(product.averageCost) || 0;
    const sellingPrice = Number(product.sellingPrice) || 0;
    const unitProfit = sellingPrice - averageCost;
    const marginPercent =
      averageCost > 0
        ? Math.round(((sellingPrice - averageCost) / averageCost) * 100)
        : sellingPrice > 0
        ? 100
        : 0;

    const saleStats = salesMap.get(product.id) || { units: 0, count: 0, revenue: 0, profit: 0 };

    const stockStatus: 'out' | 'low' | 'ok' =
      currentStock <= 0 ? 'out' : currentStock <= reorderPoint ? 'low' : 'ok';

    const isHighVelocity = saleStats.units >= 5 || saleStats.count >= 2;
    const isHighMargin = marginPercent >= 40 && unitProfit > 0;
    const isTrending = saleStats.units > 0 || (isHighMargin && currentStock > 0);

    const fastSellingRunningLow =
      saleStats.units >= 5 && currentStock <= Math.max(reorderPoint * 2, 12);
    const needsPurchase = stockStatus === 'out' || stockStatus === 'low' || fastSellingRunningLow;

    let recommendedBuyQty = 0;
    if (needsPurchase) {
      const targetStock = Math.max(
        reorderPoint > 0 ? reorderPoint * 3 : 12,
        saleStats.units > 0 ? Math.ceil(saleStats.units * 1.5) : 12,
        12
      );
      recommendedBuyQty = Math.max(6, targetStock - Math.max(0, currentStock));
    } else if (isHighVelocity) {
      recommendedBuyQty = 12;
    }

    let urgencyReasonBn = 'পর্যাপ্ত স্টক আছে';
    if (stockStatus === 'out') {
      urgencyReasonBn =
        saleStats.units > 0
          ? `🚨 স্টক একদম শেষ! (পূর্বে ${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} বিক্রি হয়েছে — দ্রুত কিনুন)`
          : '🚨 স্টক একদম শেষ (০ পিস) — বাজারে অবশ্যই কিনতে হবে';
    } else if (stockStatus === 'low') {
      urgencyReasonBn = `⚠️ স্টক কম! মাত্র ${toBengaliNumerals(currentStock)} ${product.unit || 'পিস'} বাকি (সতর্কতা সীমা: ${toBengaliNumerals(reorderPoint)})`;
    } else if (fastSellingRunningLow) {
      urgencyReasonBn = `⚡ দ্রুত বিক্রি হচ্ছে (${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} বিক্রি) — স্টক শেষ হওয়ার আগেই আনুন`;
    }

    let trendingReasonBn = '';
    if (saleStats.units >= 10) {
      trendingReasonBn = `🔥 বেস্ট-সেলার পণ্য: এখন পর্যন্ত ${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} বিক্রি ও ${money(saleStats.profit)} লাভ`;
    } else if (saleStats.units > 0) {
      trendingReasonBn = `📈 নিয়মিত চাহিদা: ${toBengaliNumerals(saleStats.count)} বার বিক্রয়ে মোট ${toBengaliNumerals(saleStats.units)} ${product.unit || 'পিস'} সেল`;
    } else if (marginPercent >= 50) {
      trendingReasonBn = `💎 উচ্চ মুনাফা পণ্য: প্রতি ${product.unit || 'পিস'} বিক্রয়ে +${money(unitProfit)} (${toBengaliNumerals(marginPercent)}% লাভ)`;
    } else {
      trendingReasonBn = `📦 নিয়মিত স্টক পণ্য (একক লাভ: ${money(unitProfit)})`;
    }

    const parsedSku = parseInt(String(product.sku || '').trim(), 10);
    const numericSku = !isNaN(parsedSku) ? parsedSku : idx + 1;

    return {
      product,
      numericSku,
      currentStock,
      reorderPoint,
      averageCost,
      sellingPrice,
      unitProfit,
      marginPercent,
      stockCostValue: currentStock * averageCost,
      stockRetailValue: currentStock * sellingPrice,
      totalSoldUnits: saleStats.units,
      totalSalesCount: saleStats.count,
      totalRevenue: saleStats.revenue,
      totalProfitEarned: saleStats.profit,
      stockStatus,
      isTrending,
      needsPurchase,
      recommendedBuyQty,
      estimatedPurchaseCost: recommendedBuyQty * averageCost,
      urgencyReasonBn,
      trendingReasonBn,
    };
  });
}

// Standalone 1-Click Direct PDF Generator for All Stock Products & Trending Recommendations with Photos
export async function downloadFullStockCatalogWithPhotosPdf(params: {
  products: Product[];
  entries: Entry[];
  settings: BusinessSettings;
  defaultReorderPoint?: number;
  mode?: 'full_catalog' | 'market_restock_and_advisor';
  customBuyQtyMap?: Record<string, number>;
  selectedNewSuggestionIds?: string[];
  allSuggestions?: NewTrendingProductSuggestion[];
  customPhotoMap?: Record<string, string>;
  googlePhotoMap?: Record<string, string>;
}): Promise<void> {
  const {
    products,
    entries,
    settings,
    defaultReorderPoint = 5,
    mode = 'full_catalog',
    customBuyQtyMap = {},
    selectedNewSuggestionIds = ['trend-1', 'trend-2', 'trend-4', 'trend-5', 'trend-8', 'trend-20'],
    allSuggestions,
    customPhotoMap,
    googlePhotoMap,
  } = params;

  const effectiveSuggestions =
    allSuggestions || [
      ...loadCustomTrendingSuggestions(),
      ...loadAutoLiveTrendingSuggestions(),
      ...NEW_TRENDING_SUGGESTIONS,
    ];
  const effectiveCustomPhotos = customPhotoMap || loadCustomTrendingPhotos();
  const effectiveGooglePhotos = { ...loadGoogleVerifiedPhotos(), ...(googlePhotoMap || {}) };

  const analyzed = analyzeProductsForMarket(products, entries, defaultReorderPoint).sort(
    (a, b) => a.numericSku - b.numericSku
  );

  const urgentRestock = analyzed.filter((i) => i.needsPurchase);

  const itemsToExport =
    mode === 'full_catalog'
      ? analyzed
      : urgentRestock.length > 0
      ? urgentRestock
      : analyzed;

  const getPlannedQty = (item: ProductMarketMetrics) => {
    if (customBuyQtyMap[item.product.id] !== undefined) {
      return customBuyQtyMap[item.product.id];
    }
    return item.needsPurchase ? item.recommendedBuyQty : 0;
  };

  // Preload safe base64 images for all products
  const imageMap: Record<string, string | null> = {};
  await Promise.all(
    analyzed.map(async (item) => {
      imageMap[item.product.id] = await resolveSafeImageDataUrl(item.product.imageUrl);
    })
  );

  const selectedNewSuggestions =
    mode === 'market_restock_and_advisor'
      ? effectiveSuggestions.filter((s) => selectedNewSuggestionIds.includes(s.id))
      : [];

  const suggestionsForPdf =
    selectedNewSuggestions.length > 0
      ? selectedNewSuggestions
      : effectiveSuggestions.slice(0, 12);

  // If any suggestion for PDF is missing a Google photo, resolve it on the fly from the backend
  if (mode === 'market_restock_and_advisor') {
    const missingForPdf = suggestionsForPdf.filter(
      (s) =>
        !effectiveCustomPhotos[s.id] &&
        !effectiveGooglePhotos[s.id] &&
        (!s.imageUrl || s.imageUrl.startsWith('data:image/svg+xml'))
    );
    if (missingForPdf.length > 0) {
      try {
        const resp = await fetch('/api/market-advisor/resolve-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: missingForPdf.map((s) => ({
              id: s.id,
              query: s.searchQueryEn || s.name,
              index: 0,
            })),
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.images && typeof data.images === 'object') {
            for (const [id, info] of Object.entries<any>(data.images)) {
              if (info?.dataUrl) {
                effectiveGooglePhotos[id] = info.dataUrl;
              }
            }
          }
        }
      } catch {
        // fallback to SVG illustration if offline
      }
    }
  }

  // Preload safe base64 images for trending suggestions
  const suggestionImageMap: Record<string, string | null> = {};
  if (mode === 'market_restock_and_advisor') {
    await Promise.all(
      suggestionsForPdf.map(async (s) => {
        const chosenUrl =
          effectiveCustomPhotos[s.id] ||
          effectiveGooglePhotos[s.id] ||
          s.imageUrl;
        suggestionImageMap[s.id] = await resolveSafeImageDataUrl(chosenUrl, s.fallbackSvgUrl);
      })
    );
  }

  const currentDateBn = new Date().toLocaleDateString('bn-BD', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalUnits = analyzed.reduce((sum, i) => sum + Math.max(0, i.currentStock), 0);
  const totalStockCost = analyzed.reduce((sum, i) => sum + Math.max(0, i.stockCostValue), 0);
  const totalStockRetail = analyzed.reduce((sum, i) => sum + Math.max(0, i.stockRetailValue), 0);
  const totalPotentialProfit = Math.max(0, totalStockRetail - totalStockCost);
  const plannedRestockBudget = analyzed.reduce(
    (sum, i) => sum + getPlannedQty(i) * i.averageCost,
    0
  );

  const FIRST_PAGE_ROWS = 11;
  const NEXT_PAGE_ROWS = 14;
  const pages: ProductMarketMetrics[][] = [];

  if (itemsToExport.length <= FIRST_PAGE_ROWS) {
    pages.push(itemsToExport);
  } else {
    pages.push(itemsToExport.slice(0, FIRST_PAGE_ROWS));
    let offset = FIRST_PAGE_ROWS;
    while (offset < itemsToExport.length) {
      pages.push(itemsToExport.slice(offset, offset + NEXT_PAGE_ROWS));
      offset += NEXT_PAGE_ROWS;
    }
  }

  const storeTrendingItems = [...analyzed]
    .sort(
      (a, b) =>
        b.totalSoldUnits - a.totalSoldUnits ||
        b.totalProfitEarned - a.totalProfitEarned ||
        b.marginPercent - a.marginPercent
    )
    .slice(0, 8);

  const SUGGESTIONS_FIRST_ADVISOR_PAGE = 6;
  const SUGGESTIONS_NEXT_ADVISOR_PAGE = 10;
  const suggestionChunks: NewTrendingProductSuggestion[][] = [];
  if (mode === 'market_restock_and_advisor' && suggestionsForPdf.length > 0) {
    suggestionChunks.push(suggestionsForPdf.slice(0, SUGGESTIONS_FIRST_ADVISOR_PAGE));
    let sOffset = SUGGESTIONS_FIRST_ADVISOR_PAGE;
    while (sOffset < suggestionsForPdf.length) {
      suggestionChunks.push(suggestionsForPdf.slice(sOffset, sOffset + SUGGESTIONS_NEXT_ADVISOR_PAGE));
      sOffset += SUGGESTIONS_NEXT_ADVISOR_PAGE;
    }
  }

  const advisorPageCount =
    mode === 'market_restock_and_advisor' ? Math.max(1, suggestionChunks.length) : 0;
  const totalPageCount = Math.max(1, pages.length + advisorPageCount);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageItems = pages[pageIdx];
    const isFirstPage = pageIdx === 0;
    const pageNumber = pageIdx + 1;

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px';
    container.style.minHeight = '1120px';
    container.style.padding = '28px 34px';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#0f172a';
    container.style.fontFamily = "'Hind Siliguri', 'Inter', system-ui, sans-serif";
    container.style.boxSizing = 'border-box';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.justifyContent = 'space-between';

    const reportBadgeTitle =
      mode === 'full_catalog'
        ? '📸 ছবিসহ সম্পূর্ণ স্টক ও বাজার কেনাকাটার তালিকা'
        : '🛒 আগামী বাজারের কেনাকাটা ও রি-স্টক তালিকা (ছবিসহ)';

    container.innerHTML = `
      <div>
        <!-- Page Header -->
        <div style="border-bottom: 2.5px solid #0d9488; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0 0 4px 0; font-size: 24px; color: #0f172a; font-weight: 800;">
              ${settings.name || 'Glowzaa Shop'}
            </h1>
            <p style="margin: 0; font-size: 12px; color: #475569;">
              ${settings.type || 'স্টক ইনভেন্টরি ও পাইকারি বাজার ক্রয় তালিকা'} • ${settings.address || 'বাংলাদেশ'}
            </p>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; background: #0f766e; color: #ffffff; padding: 5px 12px; border-radius: 6px; font-weight: 700; font-size: 13px; margin-bottom: 4px;">
              ${reportBadgeTitle}
            </div>
            <p style="margin: 0; font-size: 11.5px; color: #64748b;">
              তারিখ: ${currentDateBn} • পৃষ্ঠা: ${toBengaliNumerals(pageNumber)} / ${toBengaliNumerals(totalPageCount)}
            </p>
          </div>
        </div>

        ${
          isFirstPage
            ? `
          <!-- Summary Cards on Page 1 -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px;">
            <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #0f766e; font-weight: 700; display: block;">মোট তালিকাভুক্ত পণ্য</span>
              <b style="font-size: 17px; color: #115e59; display: block; margin-top: 2px;">
                ${toBengaliNumerals(itemsToExport.length)}টি পণ্য
              </b>
              <span style="font-size: 10.5px; color: #0d9488;">মোট মজুদ: ${toBengaliNumerals(totalUnits)} পিস</span>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #334155; font-weight: 700; display: block;">বর্তমান স্টকের ক্রয়মূল্য</span>
              <b style="font-size: 17px; color: #0f172a; display: block; margin-top: 2px;">
                ${money(totalStockCost)}
              </b>
              <span style="font-size: 10.5px; color: #64748b;">গড় ক্রয়মূল্য অনুযায়ী</span>
            </div>
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #047857; font-weight: 700; display: block;">সম্ভাব্য বিক্রয়মূল্য ও লাভ</span>
              <b style="font-size: 17px; color: #059669; display: block; margin-top: 2px;">
                ${money(totalStockRetail)}
              </b>
              <span style="font-size: 10.5px; color: #047857;">সম্ভাব্য লাভ: +${money(totalPotentialProfit)}</span>
            </div>
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px;">
              <span style="font-size: 11px; color: #b45309; font-weight: 700; display: block;">বাজারে জরুরি কিনতে হবে</span>
              <b style="font-size: 17px; color: #d97706; display: block; margin-top: 2px;">
                ${toBengaliNumerals(urgentRestock.length)}টি পণ্য
              </b>
              <span style="font-size: 10.5px; color: #92400e;">আনুমানিক বাজেট: ${money(plannedRestockBudget)}</span>
            </div>
          </div>
        `
            : ''
        }

        <!-- Products Table with Photos -->
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
          <thead>
            <tr style="background: #0f172a; color: #ffffff; text-align: left;">
              <th style="padding: 8px 8px; width: 44px; text-align: center;">SKU</th>
              <th style="padding: 8px 8px; width: 58px; text-align: center;">ছবি</th>
              <th style="padding: 8px 10px;">পণ্যের নাম ও অবস্থা</th>
              <th style="padding: 8px 8px; text-align: right;">ক্রয়মূল্য</th>
              <th style="padding: 8px 8px; text-align: right;">বিক্রয়মূল্য</th>
              <th style="padding: 8px 8px; text-align: right;">একক লাভ</th>
              <th style="padding: 8px 8px; text-align: center;">বর্তমান স্টক</th>
              <th style="padding: 8px 10px; text-align: center; width: 128px; background: #115e59;">বাজারে কেনার পরিমাণ / টিক</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems
              .map((item, idx) => {
                const safeImg = imageMap[item.product.id];
                const plannedQty = getPlannedQty(item);
                const rowBg =
                  item.stockStatus === 'out'
                    ? '#fff1f2'
                    : item.stockStatus === 'low'
                    ? '#fffbeb'
                    : idx % 2 === 0
                    ? '#ffffff'
                    : '#f8fafc';

                const statusBadge =
                  item.stockStatus === 'out'
                    ? `<span style="display:inline-block; padding: 1px 6px; border-radius: 4px; background: #ffe4e6; color: #be123c; font-size: 10px; font-weight: 700;">স্টক শেষ (০)</span>`
                    : item.stockStatus === 'low'
                    ? `<span style="display:inline-block; padding: 1px 6px; border-radius: 4px; background: #fef3c7; color: #b45309; font-size: 10px; font-weight: 700;">কম স্টক</span>`
                    : `<span style="display:inline-block; padding: 1px 6px; border-radius: 4px; background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 700;">স্টকে আছে</span>`;

                return `
                  <tr style="border-bottom: 1px solid #cbd5e1; background: ${rowBg};">
                    <td style="padding: 6px; text-align: center; font-weight: 800; color: #0f766e; font-size: 13px;">
                      #${item.product.sku || item.numericSku}
                    </td>
                    <td style="padding: 5px; text-align: center;">
                      ${
                        safeImg
                          ? `<img src="${safeImg}" style="width: 46px; height: 46px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; display: block; margin: 0 auto;" />`
                          : `<div style="width: 46px; height: 46px; border-radius: 6px; background: #e2e8f0; color: #475569; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin: 0 auto; border: 1px dashed #94a3b8;">ছবি নেই</div>`
                      }
                    </td>
                    <td style="padding: 6px 10px;">
                      <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 2px;">
                        ${item.product.name}
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        ${statusBadge}
                        ${
                          item.totalSoldUnits > 0
                            ? `<span style="font-size: 10px; color: #0369a1; font-weight: 600;">বিক্রি: ${toBengaliNumerals(item.totalSoldUnits)} ${item.product.unit || 'পিস'}</span>`
                            : ''
                        }
                      </div>
                    </td>
                    <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #b45309; font-size: 12.5px;">
                      ${money(item.averageCost)}
                    </td>
                    <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #0f766e; font-size: 12.5px;">
                      ${money(item.sellingPrice)}
                    </td>
                    <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: ${
                      item.unitProfit >= 0 ? '#059669' : '#dc2626'
                    }; font-size: 12px;">
                      ${item.unitProfit >= 0 ? '+' : ''}${money(item.unitProfit)}
                      <div style="font-size: 9.5px; color: #64748b; font-weight: 500;">(${toBengaliNumerals(item.marginPercent)}%)</div>
                    </td>
                    <td style="padding: 6px 8px; text-align: center;">
                      <span style="font-size: 14px; font-weight: 800; color: ${
                        item.stockStatus === 'out'
                          ? '#be123c'
                          : item.stockStatus === 'low'
                          ? '#b45309'
                          : '#0f172a'
                      };">
                        ${toBengaliNumerals(item.currentStock)}
                      </span>
                      <span style="font-size: 11px; color: #475569; display: block;">${item.product.unit || 'পিস'}</span>
                    </td>
                    <td style="padding: 6px 8px; text-align: center; border-left: 1px dashed #94a3b8; background: rgba(240, 253, 250, 0.55);">
                      ${
                        plannedQty > 0
                          ? `<div style="font-weight: 800; color: #0f766e; font-size: 12.5px;">☐ ${toBengaliNumerals(plannedQty)} ${item.product.unit || 'পিস'} কিনুন</div>
                             <div style="font-size: 10px; color: #475569;">আনুমানিক: ${money(plannedQty * item.averageCost)}</div>`
                          : `<div style="color: #64748b; font-size: 11px;">☐ ______ ${item.product.unit || 'পিস'}</div>`
                      }
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Page Footer -->
      <div style="margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10.5px; color: #64748b;">
        <span>${settings.name || 'Glowzaa Shop'} • ছবিসহ সম্পূর্ণ স্টক ও বাজার কেনাকাটার গাইড</span>
        <span>পৃষ্ঠা ${toBengaliNumerals(pageNumber)} / ${toBengaliNumerals(totalPageCount)}</span>
      </div>
    `;

    document.body.appendChild(container);
    try {
      if (document.fonts) {
        await document.fonts.ready;
      }
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      if (pageIdx > 0) {
        pdf.addPage();
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    } finally {
      document.body.removeChild(container);
    }
  }

  if (mode === 'market_restock_and_advisor') {
    for (let advIdx = 0; advIdx < Math.max(1, suggestionChunks.length); advIdx++) {
      const advisorPageNum = pages.length + advIdx + 1;
      const chunkItems = suggestionChunks[advIdx] || [];
      const isFirstAdvisorPage = advIdx === 0;

      const advContainer = document.createElement('div');
      advContainer.style.position = 'fixed';
      advContainer.style.left = '-9999px';
      advContainer.style.top = '0';
      advContainer.style.width = '794px';
      advContainer.style.minHeight = '1120px';
      advContainer.style.padding = '28px 34px';
      advContainer.style.backgroundColor = '#ffffff';
      advContainer.style.color = '#0f172a';
      advContainer.style.fontFamily = "'Hind Siliguri', 'Inter', system-ui, sans-serif";
      advContainer.style.boxSizing = 'border-box';
      advContainer.style.display = 'flex';
      advContainer.style.flexDirection = 'column';
      advContainer.style.justifyContent = 'space-between';

      advContainer.innerHTML = `
        <div>
          <div style="border-bottom: 2.5px solid #7c3aed; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h1 style="margin: 0 0 4px 0; font-size: 22px; color: #0f172a; font-weight: 800;">
                🔥 আগামী কেনাকাটা ও ছবিসহ নতুন ট্রেন্ডিং পণ্যের পরামর্শ
              </h1>
              <p style="margin: 0; font-size: 12px; color: #475569;">
                ${settings.name || 'Glowzaa Shop'} • গুগল ভেরিফাইড আসল পণ্যের ছবিসহ বাজার গাইড
              </p>
            </div>
            <div style="text-align: right;">
              <div style="display: inline-block; background: #7c3aed; color: #ffffff; padding: 5px 12px; border-radius: 6px; font-weight: 700; font-size: 12.5px; margin-bottom: 4px;">
                ছবিসহ বাজার কেনাকাটা গাইড
              </div>
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                তারিখ: ${currentDateBn} • পৃষ্ঠা: ${toBengaliNumerals(advisorPageNum)} / ${toBengaliNumerals(totalPageCount)}
              </p>
            </div>
          </div>

          ${
            isFirstAdvisorPage
              ? `
            <div style="margin-bottom: 16px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14.5px; color: #0f172a; border-left: 4px solid #0d9488; padding-left: 8px;">
                ১. আপনার দোকানের বর্তমান সবচেয়ে চলমান ও লাভজনক পণ্য (Top Trending in Shop)
              </h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; border: 1px solid #cbd5e1;">
                <thead>
                  <tr style="background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1; color: #334155; text-align: left;">
                    <th style="padding: 6px 8px; width: 48px; text-align: center;">ছবি</th>
                    <th style="padding: 6px 8px;">SKU ও পণ্যের নাম</th>
                    <th style="padding: 6px 8px; text-align: center;">মোট বিক্রি</th>
                    <th style="padding: 6px 8px; text-align: right;">একক লাভ (%)</th>
                    <th style="padding: 6px 8px; text-align: center;">বর্তমান স্টক</th>
                    <th style="padding: 6px 8px;">পরামর্শ</th>
                  </tr>
                </thead>
                <tbody>
                  ${storeTrendingItems
                    .slice(0, 6)
                    .map((item) => {
                      const prodImg = imageMap[item.product.id];
                      return `
                      <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 4px 6px; text-align: center;">
                          ${
                            prodImg
                              ? `<img src="${prodImg}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; display: block; margin: 0 auto;" />`
                              : `<div style="width: 36px; height: 36px; border-radius: 6px; background: #f1f5f9; color: #64748b; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; margin: 0 auto;">SKU#${item.numericSku}</div>`
                          }
                        </td>
                        <td style="padding: 5px 8px; font-weight: 700;">#${item.product.sku || item.numericSku} — ${item.product.name}</td>
                        <td style="padding: 5px 8px; text-align: center; font-weight: 700; color: #0369a1;">
                          ${toBengaliNumerals(item.totalSoldUnits)} ${item.product.unit || 'পিস'}
                        </td>
                        <td style="padding: 5px 8px; text-align: right; color: #059669; font-weight: 700;">
                          +${money(item.unitProfit)} (${toBengaliNumerals(item.marginPercent)}%)
                        </td>
                        <td style="padding: 5px 8px; text-align: center; font-weight: 700;">
                          ${toBengaliNumerals(item.currentStock)} ${item.product.unit || 'পিস'}
                        </td>
                        <td style="padding: 5px 8px; font-size: 10.5px; color: #334155;">
                          ${item.trendingReasonBn}
                        </td>
                      </tr>
                    `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `
              : ''
          }

          <div>
            <h3 style="margin: 0 0 8px 0; font-size: 14.5px; color: #0f172a; border-left: 4px solid #7c3aed; padding-left: 8px;">
              ${
                isFirstAdvisorPage
                  ? `২. আগামী বাজারে দোকানে নতুন যে ট্রেন্ডিং মালগুলো তুলতে পারেন — ছবিসহ (${toBengaliNumerals(suggestionsForPdf.length)}টি নির্বাচিত)`
                  : `২. নতুন ট্রেন্ডিং পণ্যের ছবিসহ তালিকা (পরবর্তী অংশ)`
              }
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background: #f5f3ff; border-bottom: 1.5px solid #ddd6fe; color: #4c1d95; text-align: left;">
                  <th style="padding: 6px 6px; width: 56px; text-align: center;">পণ্যের ছবি</th>
                  <th style="padding: 6px 8px;">নতুন ট্রেন্ডিং পণ্যের নাম ও ধরন</th>
                  <th style="padding: 6px 8px;">পাইকারি ক্রয়মূল্য</th>
                  <th style="padding: 6px 8px;">খুচরা বিক্রয়মূল্য</th>
                  <th style="padding: 6px 8px;">প্রস্তাবিত পরিমাণ</th>
                  <th style="padding: 6px 8px;">কেন কিনবেন ও বাজার টিপস</th>
                </tr>
              </thead>
              <tbody>
                ${chunkItems
                  .map((s) => {
                    const sImg = suggestionImageMap[s.id] || s.fallbackSvgUrl || '';
                    return `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 5px; text-align: center;">
                        ${
                          sImg
                            ? `<img src="${sImg}" style="width: 46px; height: 46px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd6fe; display: block; margin: 0 auto;" />`
                            : `<div style="width: 46px; height: 46px; border-radius: 8px; background: #f3e8ff; color: #6d28d9; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; margin: 0 auto;">ছবি</div>`
                        }
                      </td>
                      <td style="padding: 6px 8px;">
                        <div style="font-weight: 700; color: #0f172a; font-size: 11.5px;">☐ ${s.name}</div>
                        <div style="font-size: 9.5px; color: #6d28d9; font-weight: 700; margin-top: 2px;">${s.categoryLabelBn} • ${s.demandLevelBn}</div>
                      </td>
                      <td style="padding: 6px 8px; font-weight: 700; color: #b45309;">${s.wholesalePriceRangeBn}</td>
                      <td style="padding: 6px 8px; font-weight: 700; color: #059669;">
                        ${s.suggestedRetailPriceBn}
                        <div style="font-size: 9px; color: #64748b;">(~${toBengaliNumerals(s.expectedMarginPercent)}% লাভ)</div>
                      </td>
                      <td style="padding: 6px 8px; font-weight: 700; color: #0f766e;">${s.starterQtyBn}</td>
                      <td style="padding: 6px 8px; font-size: 10px; color: #334155;">
                        <div>${s.whyTrendingBn}</div>
                        <div style="color: #0f766e; font-weight: 700; margin-top: 2px;">💡 টিপস: ${s.marketTipBn}</div>
                      </td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10.5px; color: #64748b;">
          <span>${settings.name || 'Glowzaa Shop'} • ছবিসহ আগামী কেনাকাটা ও ট্রেন্ডিং পণ্যের পরামর্শ</span>
          <span>পৃষ্ঠা ${toBengaliNumerals(advisorPageNum)} / ${toBengaliNumerals(totalPageCount)}</span>
        </div>
      `;

      document.body.appendChild(advContainer);
      try {
        if (document.fonts) {
          await document.fonts.ready;
        }
        const canvas = await html2canvas(advContainer, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.94);
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      } finally {
        document.body.removeChild(advContainer);
      }
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const fileName =
    mode === 'full_catalog'
      ? `Glowzaa-Full-Stock-Catalog-With-Photos-${todayIso}.pdf`
      : `Glowzaa-Next-Market-Shopping-And-Trending-Guide-${todayIso}.pdf`;

  pdf.save(fileName);
}

interface StockCatalogAndMarketAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  entries: Entry[];
  settings: BusinessSettings;
  defaultReorderPoint?: number;
  onQuickAddSuggestedProduct?: (suggestion: NewTrendingProductSuggestion) => void;
}

export default function StockCatalogAndMarketAdvisorModal({
  isOpen,
  onClose,
  products,
  entries,
  settings,
  defaultReorderPoint = 5,
  onQuickAddSuggestedProduct,
}: StockCatalogAndMarketAdvisorModalProps) {
  const [customBuyQtyMap, setCustomBuyQtyMap] = useState<Record<string, number>>({});
  const [selectedNewSuggestionIds, setSelectedNewSuggestionIds] = useState<string[]>([
    'trend-1',
    'trend-2',
    'trend-3',
    'trend-4',
    'trend-5',
    'trend-8',
    'trend-20',
  ]);
  const [newCategoryFilter, setNewCategoryFilter] = useState<
    'all' | TrendingSuggestionCategory
  >('all');
  const [suggestionSearch, setSuggestionSearch] = useState<string>('');
  const [suggestionDisplayLimit, setSuggestionDisplayLimit] = useState<number>(36);
  const [storeTrendingLimit, setStoreTrendingLimit] = useState<number>(12);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // User-customizable reference photos, verified Google photos, and live auto-updating suggestions
  const [customPhotoMap, setCustomPhotoMap] = useState<Record<string, string>>(() =>
    loadCustomTrendingPhotos()
  );
  const [googlePhotoMap, setGooglePhotoMap] = useState<Record<string, string>>(() =>
    loadGoogleVerifiedPhotos()
  );
  const [googleIndexMap, setGoogleIndexMap] = useState<Record<string, number>>({});
  const [loadingPhotoIds, setLoadingPhotoIds] = useState<Record<string, boolean>>({});
  const [isBatchResolvingPhotos, setIsBatchResolvingPhotos] = useState<boolean>(false);

  const [customSuggestions, setCustomSuggestions] = useState<NewTrendingProductSuggestion[]>(() =>
    loadCustomTrendingSuggestions()
  );
  const [autoLiveSuggestions, setAutoLiveSuggestions] = useState<NewTrendingProductSuggestion[]>(
    () => loadAutoLiveTrendingSuggestions()
  );
  const [isAutoUpdatingTrends, setIsAutoUpdatingTrends] = useState<boolean>(false);
  const [autoUpdateCycleCount, setAutoUpdateCycleCount] = useState<number>(0);
  const [lastAutoUpdateTimeBn, setLastAutoUpdateTimeBn] = useState<string>('');
  const hasAutoUpdatedOnOpenRef = useRef<boolean>(false);

  const [previewSuggestion, setPreviewSuggestion] = useState<NewTrendingProductSuggestion | null>(
    null
  );
  const [showAddCustomModal, setShowAddCustomModal] = useState<boolean>(false);
  const [isSearchingCustomGooglePhoto, setIsSearchingCustomGooglePhoto] = useState<boolean>(false);
  const [customGooglePhotoIndex, setCustomGooglePhotoIndex] = useState<number>(0);
  const [newCustomForm, setNewCustomForm] = useState({
    name: '',
    category: 'hair_fashion' as TrendingSuggestionCategory,
    estimatedUnitCost: '',
    estimatedSellingPrice: '',
    recommendedQty: '24',
    unit: 'পিস',
    whyTrendingBn: '',
    marketTipBn: '',
    imageUrl: '',
  });

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_TRENDING_PHOTOS_KEY, JSON.stringify(customPhotoMap));
    } catch {
      // ignore storage quota errors
    }
  }, [customPhotoMap]);

  useEffect(() => {
    try {
      localStorage.setItem(GOOGLE_VERIFIED_PHOTOS_KEY, JSON.stringify(googlePhotoMap));
    } catch {
      // ignore storage quota errors
    }
  }, [googlePhotoMap]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_TRENDING_ITEMS_KEY, JSON.stringify(customSuggestions));
    } catch {
      // ignore storage quota errors
    }
  }, [customSuggestions]);

  useEffect(() => {
    try {
      localStorage.setItem(
        AUTO_LIVE_TRENDING_ITEMS_KEY,
        JSON.stringify(autoLiveSuggestions.slice(0, 18))
      );
    } catch {
      // ignore storage quota errors
    }
  }, [autoLiveSuggestions]);

  const allSuggestions = useMemo(() => {
    return [...customSuggestions, ...autoLiveSuggestions, ...NEW_TRENDING_SUGGESTIONS];
  }, [customSuggestions, autoLiveSuggestions]);

  const getSuggestionPhoto = (s: NewTrendingProductSuggestion): string => {
    if (customPhotoMap[s.id]) return customPhotoMap[s.id];
    if (googlePhotoMap[s.id]) return googlePhotoMap[s.id];
    if (s.imageUrl && !s.imageUrl.startsWith('data:image/svg+xml')) return s.imageUrl;
    return s.fallbackSvgUrl || s.imageUrl || '';
  };

  const isVerifiedGooglePhoto = (s: NewTrendingProductSuggestion): boolean => {
    return (
      !customPhotoMap[s.id] &&
      (Boolean(googlePhotoMap[s.id]) ||
        Boolean(s.imageUrl && s.imageUrl.startsWith('data:image/jpeg')) ||
        Boolean(s.imageUrl && s.imageUrl.startsWith('data:image/png')) ||
        Boolean(s.imageUrl && s.imageUrl.startsWith('data:image/webp')))
    );
  };

  // Fetch accurate Google/Web product photo for a single suggestion (or cycle to the next photo result)
  const handleFetchNextGooglePhoto = useCallback(
    async (s: NewTrendingProductSuggestion, explicitNextIndex?: number) => {
      const nextIdx =
        explicitNextIndex !== undefined
          ? explicitNextIndex
          : (googleIndexMap[s.id] ?? s.googleImageIndex ?? 0) + 1;
      const query = s.searchQueryEn || s.name;

      setLoadingPhotoIds((prev) => ({ ...prev, [s.id]: true }));
      try {
        const resp = await fetch(
          `/api/market-advisor/search-image?q=${encodeURIComponent(query)}&index=${nextIdx}`
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data?.ok && data?.dataUrl) {
            // Clear custom photo override if user explicitly asks for Google photo
            setCustomPhotoMap((prev) => {
              if (!prev[s.id]) return prev;
              const copy = { ...prev };
              delete copy[s.id];
              return copy;
            });
            setGooglePhotoMap((prev) => ({
              ...prev,
              [s.id]: data.dataUrl,
            }));
            setGoogleIndexMap((prev) => ({
              ...prev,
              [s.id]: typeof data.usedIndex === 'number' ? data.usedIndex : nextIdx,
            }));
          }
        }
      } catch {
        // ignore network error
      } finally {
        setLoadingPhotoIds((prev) => ({ ...prev, [s.id]: false }));
      }
    },
    [googleIndexMap]
  );

  // Batch resolve accurate Google photos for all items that don't yet have a verified photo
  const resolveMissingGooglePhotosInBatch = useCallback(
    async (itemsToResolve: NewTrendingProductSuggestion[]) => {
      const missing = itemsToResolve.filter(
        (s) =>
          !customPhotoMap[s.id] &&
          !googlePhotoMap[s.id] &&
          (!s.imageUrl || s.imageUrl.startsWith('data:image/svg+xml'))
      );
      if (missing.length === 0) return;

      setIsBatchResolvingPhotos(true);
      try {
        // Resolve in two waves (first 12 immediately so top cards appear right away, then remaining)
        const waves = [missing.slice(0, 12), missing.slice(12, 36)].filter((w) => w.length > 0);
        for (const wave of waves) {
          const resp = await fetch('/api/market-advisor/resolve-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: wave.map((s) => ({
                id: s.id,
                query: s.searchQueryEn || s.name,
                index: googleIndexMap[s.id] ?? 0,
              })),
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.ok && data?.images && typeof data.images === 'object') {
              const newPhotos: Record<string, string> = {};
              const newIndices: Record<string, number> = {};
              for (const [id, info] of Object.entries<any>(data.images)) {
                if (info?.dataUrl) {
                  newPhotos[id] = info.dataUrl;
                  newIndices[id] = info.usedIndex || 0;
                }
              }
              if (Object.keys(newPhotos).length > 0) {
                setGooglePhotoMap((prev) => ({ ...prev, ...newPhotos }));
                setGoogleIndexMap((prev) => ({ ...prev, ...newIndices }));
              }
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setIsBatchResolvingPhotos(false);
      }
    },
    [customPhotoMap, googlePhotoMap, googleIndexMap]
  );

  // Live Auto-Update Engine: Fetches fresh new trending products + their real Google photos
  const handleAutoUpdateLiveTrending = useCallback(
    async (isSilentAutoOpen: boolean = false) => {
      if (isAutoUpdatingTrends) return;
      setIsAutoUpdatingTrends(true);
      try {
        const nextSeed = Date.now() + autoUpdateCycleCount * 7;
        const existingNames = isSilentAutoOpen
          ? [
              ...products.map((p) => p.name),
              ...NEW_TRENDING_SUGGESTIONS.slice(0, 10).map((s) => s.name),
            ]
          : [
              ...products.map((p) => p.name),
              ...autoLiveSuggestions.slice(0, 6).map((s) => s.name),
            ];

        const resp = await fetch('/api/market-advisor/auto-trending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            existingNames,
            topStoreCategories: products.slice(0, 8).map((p) => p.name),
            count: 6,
            cycleSeed: nextSeed,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data?.ok && Array.isArray(data.items) && data.items.length > 0) {
            const formattedItems: NewTrendingProductSuggestion[] = data.items.map(
              (raw: any, i: number) => {
                const cat: TrendingSuggestionCategory = [
                  'hair_fashion',
                  'jewelry',
                  'cosmetics',
                  'bags_accessories',
                  'gift_combo',
                ].includes(raw.category)
                  ? raw.category
                  : 'hair_fashion';

                const fallbackSvg =
                  cat === 'jewelry'
                    ? SVG_EARRING
                    : cat === 'cosmetics'
                    ? SVG_LIPTINT
                    : cat === 'bags_accessories'
                    ? SVG_PURSE
                    : cat === 'gift_combo'
                    ? SVG_GIFT1
                    : SVG_CLAW;

                return {
                  id: raw.id || `auto-live-${Date.now()}-${i}`,
                  name: raw.name,
                  searchQueryEn: raw.searchQueryEn || raw.name,
                  category: cat,
                  categoryLabelBn: raw.categoryLabelBn || 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
                  wholesalePriceRangeBn: raw.wholesalePriceRangeBn,
                  estimatedUnitCost: Number(raw.estimatedUnitCost) || 30,
                  suggestedRetailPriceBn: raw.suggestedRetailPriceBn,
                  estimatedSellingPrice: Number(raw.estimatedSellingPrice) || 70,
                  expectedMarginPercent: Number(raw.expectedMarginPercent) || 140,
                  starterQtyBn: raw.starterQtyBn || '২ ডজন (২৪ পিস)',
                  recommendedQty: Number(raw.recommendedQty) || 24,
                  unit: raw.unit || 'পিস',
                  demandLevelBn: raw.demandLevelBn || '🔥 নতুন অটো-আপডেট ট্রেন্ড',
                  whyTrendingBn: raw.whyTrendingBn,
                  marketTipBn: raw.marketTipBn,
                  imageUrl: raw.imageUrl || fallbackSvg,
                  fallbackSvgUrl: fallbackSvg,
                  isAutoUpdated: true,
                  updatedAtIso: raw.updatedAtIso || new Date().toISOString(),
                  googleImageIndex: Number(raw.googleImageIndex) || 0,
                };
              }
            );

            // Cache any resolved Google photos from the new live items
            const newGooglePhotos: Record<string, string> = {};
            for (const item of formattedItems) {
              if (item.imageUrl && !item.imageUrl.startsWith('data:image/svg+xml')) {
                newGooglePhotos[item.id] = item.imageUrl;
              }
            }
            if (Object.keys(newGooglePhotos).length > 0) {
              setGooglePhotoMap((prev) => ({ ...prev, ...newGooglePhotos }));
            }

            setAutoLiveSuggestions((prev) => {
              const DeduplicatedPrev = prev.filter(
                (oldItem) =>
                  !formattedItems.some(
                    (newItem) =>
                      newItem.name.slice(0, 15).toLowerCase() ===
                      oldItem.name.slice(0, 15).toLowerCase()
                  )
              );
              return [...formattedItems, ...DeduplicatedPrev].slice(0, 18);
            });

            // Auto-select top 2 new trending items if user explicitly clicked update
            if (!isSilentAutoOpen && formattedItems.length > 0) {
              setSelectedNewSuggestionIds((prev) =>
                Array.from(new Set([formattedItems[0].id, formattedItems[1]?.id, ...prev].filter(Boolean)))
              );
            }

            setAutoUpdateCycleCount((c) => c + 1);
            setLastAutoUpdateTimeBn(
              new Date().toLocaleTimeString('bn-BD', {
                hour: '2-digit',
                minute: '2-digit',
              })
            );
          }
        }
      } catch {
        // ignore
      } finally {
        setIsAutoUpdatingTrends(false);
      }
    },
    [isAutoUpdatingTrends, autoUpdateCycleCount, products, autoLiveSuggestions]
  );

  // Trigger Google photo batch resolution and initial live auto-update when modal opens
  useEffect(() => {
    if (!isOpen) {
      hasAutoUpdatedOnOpenRef.current = false;
      return;
    }
    resolveMissingGooglePhotosInBatch(allSuggestions);

    if (!hasAutoUpdatedOnOpenRef.current) {
      hasAutoUpdatedOnOpenRef.current = true;
      handleAutoUpdateLiveTrending(true);
    }
  }, [isOpen]);

  const handleUploadSuggestionPhoto = async (suggestionId: string, file?: File | null) => {
    if (!file) return;
    try {
      const compressed = await compressUploadedSuggestionImage(file);
      setCustomPhotoMap((prev) => ({
        ...prev,
        [suggestionId]: compressed,
      }));
    } catch {
      // ignore
    }
  };

  const handleResetSuggestionPhoto = (suggestionId: string) => {
    setCustomPhotoMap((prev) => {
      const next = { ...prev };
      delete next[suggestionId];
      return next;
    });
  };

  const handleFetchGooglePhotoForCustomForm = async (nextIdx: number = 0) => {
    const q = newCustomForm.name.trim();
    if (!q) return;
    setIsSearchingCustomGooglePhoto(true);
    try {
      const resp = await fetch(
        `/api/market-advisor/search-image?q=${encodeURIComponent(q)}&index=${nextIdx}`
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data?.ok && data?.dataUrl) {
          setNewCustomForm((p) => ({ ...p, imageUrl: data.dataUrl }));
          setCustomGooglePhotoIndex(typeof data.usedIndex === 'number' ? data.usedIndex : nextIdx);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsSearchingCustomGooglePhoto(false);
    }
  };

  const handleAddCustomSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCustomForm.name.trim();
    if (!cleanName) return;
    const cost = Math.max(1, Number(newCustomForm.estimatedUnitCost) || 25);
    const sell = Math.max(cost, Number(newCustomForm.estimatedSellingPrice) || Math.round(cost * 2.2));
    const qty = Math.max(1, Number(newCustomForm.recommendedQty) || 12);
    const margin = Math.round(((sell - cost) / cost) * 100);

    const catLabels: Record<TrendingSuggestionCategory, string> = {
      hair_fashion: 'হেয়ার ও ফ্যাশন এক্সেসরিজ',
      jewelry: 'জুয়েলারি ও অর্নামেন্টস',
      cosmetics: 'কসমেটিকস ও ডেইলি ইউজ',
      bags_accessories: 'ব্যাগ ও ফ্যাশন এক্সেসরিজ',
      gift_combo: 'কম্বো ও গিফট আইটেম',
    };

    const defaultFallback = createProductIllustrationDataUrl(
      cleanName.slice(0, 18),
      catLabels[newCustomForm.category],
      '#f3e8ff',
      '#e0f2fe',
      '#6d28d9',
      newCustomForm.category === 'jewelry'
        ? 'ring'
        : newCustomForm.category === 'cosmetics'
        ? 'mirror'
        : newCustomForm.category === 'bags_accessories'
        ? 'bag'
        : newCustomForm.category === 'gift_combo'
        ? 'gift'
        : 'claw'
    );

    const newId = `custom-trend-${Date.now()}`;
    const created: NewTrendingProductSuggestion = {
      id: newId,
      name: cleanName,
      searchQueryEn: cleanName,
      category: newCustomForm.category,
      categoryLabelBn: catLabels[newCustomForm.category],
      wholesalePriceRangeBn: `৳${toBengaliNumerals(cost)} / ${newCustomForm.unit || 'পিস'}`,
      estimatedUnitCost: cost,
      suggestedRetailPriceBn: `৳${toBengaliNumerals(sell)} / ${newCustomForm.unit || 'পিস'}`,
      estimatedSellingPrice: sell,
      expectedMarginPercent: margin,
      starterQtyBn: `${toBengaliNumerals(qty)} ${newCustomForm.unit || 'পিস'}`,
      recommendedQty: qty,
      unit: newCustomForm.unit || 'পিস',
      demandLevelBn: '⭐ আপনার কাস্টম বাজার নোট',
      whyTrendingBn:
        newCustomForm.whyTrendingBn.trim() ||
        'দোকানের কাস্টমারদের বিশেষ চাহিদা অনুযায়ী আগামী বাজারে এই পণ্যটি যাচাই ও ক্রয় করার জন্য যুক্ত করা হয়েছে।',
      marketTipBn:
        newCustomForm.marketTipBn.trim() ||
        'পাইকারি বাজারে ২-৩টি দোকান যাচাই করে সেরা মানের মাল কিনুন।',
      imageUrl: newCustomForm.imageUrl || defaultFallback,
      fallbackSvgUrl: defaultFallback,
      isCustom: true,
    };

    setCustomSuggestions((prev) => [created, ...prev]);
    setSelectedNewSuggestionIds((prev) => [created.id, ...prev]);
    setNewCustomForm({
      name: '',
      category: 'hair_fashion',
      estimatedUnitCost: '',
      estimatedSellingPrice: '',
      recommendedQty: '24',
      unit: 'পিস',
      whyTrendingBn: '',
      marketTipBn: '',
      imageUrl: '',
    });
    setShowAddCustomModal(false);

    // If user didn't upload or fetch an image yet, automatically fetch it from Google in background
    if (!newCustomForm.imageUrl) {
      handleFetchNextGooglePhoto(created, 0);
    }
  };

  const handleDeleteCustomSuggestion = (id: string) => {
    setCustomSuggestions((prev) => prev.filter((item) => item.id !== id));
    setAutoLiveSuggestions((prev) => prev.filter((item) => item.id !== id));
    setSelectedNewSuggestionIds((prev) => prev.filter((item) => item !== id));
  };

  const analyzedProducts = useMemo(
    () => analyzeProductsForMarket(products, entries, defaultReorderPoint),
    [products, entries, defaultReorderPoint]
  );

  const getPlannedBuyQty = (item: ProductMarketMetrics): number => {
    if (customBuyQtyMap[item.product.id] !== undefined) {
      return customBuyQtyMap[item.product.id];
    }
    return item.needsPurchase ? item.recommendedBuyQty : 0;
  };

  const urgentRestockItems = useMemo(() => {
    return [...analyzedProducts]
      .filter((i) => i.needsPurchase)
      .sort((a, b) => {
        if (a.stockStatus === 'out' && b.stockStatus !== 'out') return -1;
        if (a.stockStatus !== 'out' && b.stockStatus === 'out') return 1;
        return a.currentStock - b.currentStock || b.totalSoldUnits - a.totalSoldUnits;
      });
  }, [analyzedProducts]);

  const storeTrendingItems = useMemo(() => {
    return [...analyzedProducts].sort(
      (a, b) =>
        b.totalSoldUnits - a.totalSoldUnits ||
        b.totalProfitEarned - a.totalProfitEarned ||
        b.marginPercent - a.marginPercent
    );
  }, [analyzedProducts]);

  const filteredNewSuggestions = useMemo(() => {
    const q = suggestionSearch.trim().toLowerCase();
    return allSuggestions.filter((s) => {
      if (newCategoryFilter !== 'all' && s.category !== newCategoryFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.categoryLabelBn.toLowerCase().includes(q) ||
        s.whyTrendingBn.toLowerCase().includes(q) ||
        s.marketTipBn.toLowerCase().includes(q)
      );
    });
  }, [allSuggestions, newCategoryFilter, suggestionSearch]);

  const visibleNewSuggestions = useMemo(() => {
    return filteredNewSuggestions.slice(0, suggestionDisplayLimit);
  }, [filteredNewSuggestions, suggestionDisplayLimit]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allSuggestions.length,
      hair_fashion: 0,
      jewelry: 0,
      cosmetics: 0,
      bags_accessories: 0,
      gift_combo: 0,
    };
    for (const s of allSuggestions) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [allSuggestions]);

  const summaryStats = useMemo(() => {
    const restockCount = urgentRestockItems.length;
    const plannedRestockBudget = analyzedProducts.reduce((sum, i) => {
      const qty = getPlannedBuyQty(i);
      return sum + qty * i.averageCost;
    }, 0);

    const selectedNewItems = allSuggestions.filter((s) =>
      selectedNewSuggestionIds.includes(s.id)
    );
    const newItemsBudget = selectedNewItems.reduce(
      (sum, s) => sum + s.recommendedQty * s.estimatedUnitCost,
      0
    );

    return {
      restockCount,
      plannedRestockBudget,
      newItemsBudget,
      grandMarketBudget: plannedRestockBudget + newItemsBudget,
      selectedNewCount: selectedNewItems.length,
    };
  }, [analyzedProducts, urgentRestockItems, customBuyQtyMap, selectedNewSuggestionIds, allSuggestions]);

  const toggleNewSuggestion = (id: string) => {
    setSelectedNewSuggestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDownloadAdvisorPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await downloadFullStockCatalogWithPhotosPdf({
        products,
        entries,
        settings,
        defaultReorderPoint,
        mode: 'market_restock_and_advisor',
        customBuyQtyMap,
        selectedNewSuggestionIds,
        allSuggestions,
        customPhotoMap,
        googlePhotoMap,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isGeneratingPdf) onClose();
      }}
    >
      <div
        className="modal profit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-advisor-modal-title"
      >
        {/* Native Header Matching ProductProfitabilityModal */}
        <div className="profit-modal-head">
          <div className="profit-modal-title-group">
            <span
              className="profit-modal-icon"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#ffffff',
              }}
            >
              <Flame size={17} />
            </span>
            <div className="profit-modal-title-text">
              <h2 id="market-advisor-modal-title">
                আগামী কেনাকাটা ও ট্রেন্ডিং পণ্যের বিস্তারিত পরামর্শ
              </h2>
              <p>
                গুগল থেকে সঠিক পণ্যের আসল ছবিসহ বাজার পরামর্শ এবং লাইভ অটো-আপডেট নতুন ট্রেন্ডিং প্রডাক্ট
              </p>
            </div>
          </div>

          <div className="profit-modal-head-actions">
            <button
              type="button"
              className="profit-head-action-btn active"
              onClick={handleDownloadAdvisorPdf}
              disabled={isGeneratingPdf}
              style={{
                background: 'linear-gradient(135deg, #0f766e, #059669)',
                borderColor: '#0f766e',
                color: '#ffffff',
                fontWeight: 700,
              }}
            >
              <Download size={14} />
              <span>{isGeneratingPdf ? 'প্রস্তুত হচ্ছে…' : 'পরামর্শসহ PDF'}</span>
            </button>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="বন্ধ করুন"
              style={{ width: '32px', height: '32px' }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="profit-modal-body" style={{ padding: '14px 16px 22px' }}>
          {/* Top 3 KPI Summary Cards */}
          <div className="profit-kpi-grid" style={{ marginBottom: '16px' }}>
            <div className="profit-kpi-card tone-amber">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">জরুরি রি-স্টক পণ্য</span>
                <span className="profit-kpi-tag tag-amber">স্টক কম / শেষ</span>
              </div>
              <strong className="profit-kpi-val">
                {toBengaliNumerals(summaryStats.restockCount)}টি পণ্য
              </strong>
              <span className="profit-kpi-sub">
                রি-স্টক বাজেট: <b>{money(summaryStats.plannedRestockBudget)}</b>
              </span>
            </div>

            <div className="profit-kpi-card tone-emerald">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">গুগল ছবিসহ ট্রেন্ডিং পরামর্শ</span>
                <span className="profit-kpi-tag tag-emerald">অটো-আপডেট</span>
              </div>
              <strong className="profit-kpi-val">
                {toBengaliNumerals(allSuggestions.length)}টি নতুন আইটেম
              </strong>
              <span className="profit-kpi-sub">
                নির্বাচিত ({toBengaliNumerals(summaryStats.selectedNewCount)}টি) বাজেট:{' '}
                <b>{money(summaryStats.newItemsBudget)}</b>
              </span>
            </div>

            <div className="profit-kpi-card">
              <div className="profit-kpi-top">
                <span className="profit-kpi-label">আগামী বাজারের মোট সম্ভাব্য বাজেট</span>
              </div>
              <strong className="profit-kpi-val" style={{ color: '#0f766e' }}>
                {money(summaryStats.grandMarketBudget)}
              </strong>
              <span className="profit-kpi-sub">
                রি-স্টক + নতুন ট্রেন্ডিং পণ্যসহ মোট হিসাব
              </span>
            </div>
          </div>

          {/* SECTION 1: URGENT RESTOCK FROM CURRENT INVENTORY */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #fde68a',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '10px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#fef3c7',
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    ১. আগামী বাজারে দোকানে যে মালগুলো জরুরি কিনতে হবে (রি-স্টক তালিকা)
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    স্টক শেষ হওয়া ও কম স্টকের পণ্যের তালিকা এবং প্রস্তাবিত কেনার পরিমাণ
                  </p>
                </div>
              </div>
              <span
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  color: '#92400e',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                রি-স্টক বাজেট: {money(summaryStats.plannedRestockBudget)}
              </span>
            </div>

            {urgentRestockItems.length === 0 ? (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#065f46',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={18} />
                <span>
                  আপনার দোকানের বর্তমান সব পণ্যের পর্যাপ্ত স্টক রয়েছে! নিচে গুগল ছবিসহ নতুন ট্রেন্ডিং পণ্যের পরামর্শ দেখুন।
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '10px',
                }}
              >
                {urgentRestockItems.map((item) => {
                  const plannedQty = getPlannedBuyQty(item);
                  const isOut = item.stockStatus === 'out';
                  return (
                    <div
                      key={item.product.id}
                      style={{
                        border: isOut ? '1.5px solid #fecdd3' : '1.5px solid #fde68a',
                        background: isOut ? '#fff1f2' : '#fffbeb',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                      }}
                    >
                      {item.product.imageUrl ? (
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '10px',
                            objectFit: 'cover',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            border: '1px dashed #cbd5e1',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Package size={20} />
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '6px',
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                background: '#0f172a',
                                color: '#ffffff',
                                padding: '1px 6px',
                                borderRadius: '5px',
                                fontSize: '10.5px',
                                marginRight: '5px',
                              }}
                            >
                              SKU #{item.product.sku || item.numericSku}
                            </span>
                            {item.product.name}
                          </div>
                          <span
                            style={{
                              background: isOut ? '#e11d48' : '#d97706',
                              color: '#ffffff',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            স্টক: {toBengaliNumerals(item.currentStock)} {item.product.unit || 'পিস'}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: isOut ? '#be123c' : '#b45309',
                            marginTop: '4px',
                          }}
                        >
                          {item.urgencyReasonBn}
                        </div>

                        <div
                          style={{
                            marginTop: '8px',
                            paddingTop: '6px',
                            borderTop: '1px dashed rgba(148, 163, 184, 0.4)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '6px',
                            fontSize: '11.5px',
                          }}
                        >
                          <span style={{ color: '#334155' }}>
                            ক্রয়: <b>{money(item.averageCost)}</b> • বিক্রয়:{' '}
                            <b style={{ color: '#0f766e' }}>{money(item.sellingPrice)}</b>
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 800, color: '#0f766e' }}>কিনবেন:</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={plannedQty}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value || '0', 10) || 0);
                                setCustomBuyQtyMap((prev) => ({
                                  ...prev,
                                  [item.product.id]: val,
                                }));
                              }}
                              style={{
                                width: '54px',
                                padding: '2px 6px',
                                borderRadius: '6px',
                                border: '1.5px solid #0d9488',
                                background: '#ffffff',
                                textAlign: 'center',
                                fontWeight: 800,
                                fontSize: '12px',
                                color: '#0f172a',
                              }}
                            />
                            <span style={{ fontWeight: 700, color: '#92400e' }}>
                              ({money(plannedQty * item.averageCost)})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: CURRENT STORE TRENDING & HIGH PROFIT PRODUCTS */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #99f6e4',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '10px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#ccfbf1',
                    color: '#0f766e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    ২. আপনার দোকানের বর্তমান ট্রেন্ডিং ও সবচেয়ে লাভজনক পণ্য
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    দোকানের বিক্রয় রেকর্ড ও লাভের হার (Margin %) অনুযায়ী সেরা পারফর্মিং পণ্য
                  </p>
                </div>
              </div>

              {storeTrendingItems.length > 6 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f766e' }}>দেখানোর সীমা:</span>
                  {[6, 12, 24, storeTrendingItems.length].map((lim, i) => {
                    const active = storeTrendingLimit === lim;
                    const label =
                      i === 3 ? `সব (${toBengaliNumerals(lim)}টি)` : `${toBengaliNumerals(lim)}টি`;
                    return (
                      <button
                        key={lim + '-' + i}
                        type="button"
                        onClick={() => setStoreTrendingLimit(lim)}
                        style={{
                          padding: '3px 9px',
                          minHeight: '26px',
                          borderRadius: '7px',
                          fontSize: '11px',
                          fontWeight: 700,
                          border: active ? '1px solid #0f766e' : '1px solid #cbd5e1',
                          background: active ? '#0f766e' : '#f8fafc',
                          color: active ? '#ffffff' : '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '10px',
              }}
            >
              {storeTrendingItems.slice(0, storeTrendingLimit).map((item, idx) => (
                <div
                  key={item.product.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    padding: '11px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <span
                        style={{
                          background: '#0f766e',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                        }}
                      >
                        🔥 টপ #{toBengaliNumerals(idx + 1)} • SKU #{item.product.sku || item.numericSku}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>
                        +{money(item.unitProfit)} / {item.product.unit || 'পিস'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {item.product.imageUrl ? (
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '10px',
                            objectFit: 'cover',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            border: '1px dashed #cbd5e1',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <ImageIcon size={18} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>
                          {item.product.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                          ক্রয়: {money(item.averageCost)} → বিক্রয়: {money(item.sellingPrice)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: '8px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '6px 8px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: '#334155',
                      }}
                    >
                      {item.trendingReasonBn}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: '#475569' }}>
                      বর্তমান স্টক: <b style={{ color: '#0f172a' }}>{toBengaliNumerals(item.currentStock)} {item.product.unit || 'পিস'}</b>
                    </span>
                    <span style={{ color: '#0f766e' }}>
                      লাভের হার: {toBengaliNumerals(item.marginPercent)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 3: NEW TRENDING PRODUCTS TO ADD IN NEXT MARKET TRIP (WITH GOOGLE PHOTOS & LIVE AUTO-UPDATE) */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #ddd6fe',
              borderRadius: '14px',
              padding: '14px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#ede9fe',
                    color: '#6d28d9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={19} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0f172a' }}>
                      ৩. আগামী কেনাকাটায় দোকানে নতুন কী কী ট্রেন্ডিং মাল তুলতে পারেন (গুগল ছবিসহ)
                    </h3>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        background: '#dcfce7',
                        color: '#15803d',
                        border: '1px solid #86efac',
                      }}
                    >
                      ✓ গুগল ছবি ও লাইভ অটো-আপডেট সক্রিয়
                      {lastAutoUpdateTimeBn ? ` (${lastAutoUpdateTimeBn})` : ''}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    প্রতিটি পণ্যের সাথে গুগল থেকে আসল ছবি স্বয়ংক্রিয়ভাবে যুক্ত হয়। যেকোনো ছবির নিচে{' '}
                    <b>“🔄 গুগল ছবি”</b> বাটনে চাপ দিয়ে গুগলের অন্য ছবি দেখতে পারবেন।
                    {isBatchResolvingPhotos ? ' (গুগল থেকে আসল ছবি লোড হচ্ছে...)' : ''}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* LIVE AUTO-UPDATE NEW TRENDING PRODUCTS BUTTON */}
                <button
                  type="button"
                  onClick={() => handleAutoUpdateLiveTrending(false)}
                  disabled={isAutoUpdatingTrends}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    minHeight: '32px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    border: 'none',
                    background: 'linear-gradient(135deg, #7c3aed, #db2777)',
                    color: '#ffffff',
                    cursor: isAutoUpdatingTrends ? 'wait' : 'pointer',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
                  }}
                >
                  <RefreshCw size={13} className={isAutoUpdatingTrends ? 'animate-spin' : ''} />
                  <span>
                    {isAutoUpdatingTrends
                      ? 'নতুন ট্রেন্ডিং প্রডাক্ট ও গুগল ছবি আসছে…'
                      : '✨ নতুন ট্রেন্ডিং প্রডাক্ট অটো-আপডেট'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddCustomModal((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 11px',
                    minHeight: '32px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    border: '1px solid #0d9488',
                    background: showAddCustomModal ? '#0f766e' : '#f0fdfa',
                    color: showAddCustomModal ? '#ffffff' : '#0f766e',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  <span>নিজের প্রডাক্ট যোগ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const visibleIds = filteredNewSuggestions.map((s) => s.id);
                    const allSelected = visibleIds.every((id) =>
                      selectedNewSuggestionIds.includes(id)
                    );
                    if (allSelected) {
                      setSelectedNewSuggestionIds((prev) =>
                        prev.filter((id) => !visibleIds.includes(id))
                      );
                    } else {
                      setSelectedNewSuggestionIds((prev) =>
                        Array.from(new Set([...prev, ...visibleIds]))
                      );
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    minHeight: '32px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    border: '1px solid #c4b5fd',
                    background: '#f5f3ff',
                    color: '#5b21b6',
                    cursor: 'pointer',
                  }}
                >
                  <Check size={13} />
                  <span>সব সিলেক্ট / আনসিলেক্ট</span>
                </button>
              </div>
            </div>

            {/* ADD CUSTOM SUGGESTION WITH GOOGLE AUTO-PHOTO & UPLOAD FORM */}
            {showAddCustomModal && (
              <form
                onSubmit={handleAddCustomSuggestionSubmit}
                style={{
                  background: 'linear-gradient(135deg, #f5f3ff 0%, #f0fdfa 100%)',
                  border: '1.5px solid #c4b5fd',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13.5px', color: '#4c1d95' }}>
                    📸 গুগল ছবিসহ আপনার নিজের বাজারের নতুন পণ্যের পরামর্শ যুক্ত করুন
                  </strong>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomModal(false)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      minHeight: '26px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    বন্ধ করুন
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '8px',
                  }}
                >
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', margin: 0 }}>
                    নতুন পণ্যের নাম *
                    <input
                      required
                      placeholder="যেমন: Korean Pearl Hair Clip / ঝুমকা..."
                      value={newCustomForm.name}
                      onChange={(e) => setNewCustomForm((p) => ({ ...p, name: e.target.value }))}
                      style={{ marginTop: '3px', padding: '6px 9px', fontSize: '12.5px', background: '#ffffff' }}
                    />
                  </label>

                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', margin: 0 }}>
                    ক্যাটাগরি
                    <select
                      value={newCustomForm.category}
                      onChange={(e) =>
                        setNewCustomForm((p) => ({
                          ...p,
                          category: e.target.value as TrendingSuggestionCategory,
                        }))
                      }
                      style={{ marginTop: '3px', padding: '6px 9px', fontSize: '12.5px', background: '#ffffff' }}
                    >
                      <option value="hair_fashion">হেয়ার ও ক্লিপ</option>
                      <option value="jewelry">জুয়েলারি ও রিং</option>
                      <option value="cosmetics">কসমেটিকস ও মিরর</option>
                      <option value="bags_accessories">ব্যাগ ও এক্সেসরিজ</option>
                      <option value="gift_combo">গিফট কম্বো</option>
                    </select>
                  </label>

                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#b45309', margin: 0 }}>
                    পাইকারি ক্রয়মূল্য (৳)
                    <input
                      type="number"
                      placeholder="যেমন: 25"
                      value={newCustomForm.estimatedUnitCost}
                      onChange={(e) =>
                        setNewCustomForm((p) => ({ ...p, estimatedUnitCost: e.target.value }))
                      }
                      style={{ marginTop: '3px', padding: '6px 9px', fontSize: '12.5px', background: '#ffffff' }}
                    />
                  </label>

                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#059669', margin: 0 }}>
                    খুচরা বিক্রয়মূল্য (৳)
                    <input
                      type="number"
                      placeholder="যেমন: 60"
                      value={newCustomForm.estimatedSellingPrice}
                      onChange={(e) =>
                        setNewCustomForm((p) => ({ ...p, estimatedSellingPrice: e.target.value }))
                      }
                      style={{ marginTop: '3px', padding: '6px 9px', fontSize: '12.5px', background: '#ffffff' }}
                    />
                  </label>

                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#6d28d9', margin: 0 }}>
                    প্রস্তাবিত পরিমাণ (পিস)
                    <input
                      type="number"
                      placeholder="24"
                      value={newCustomForm.recommendedQty}
                      onChange={(e) =>
                        setNewCustomForm((p) => ({ ...p, recommendedQty: e.target.value }))
                      }
                      style={{ marginTop: '3px', padding: '6px 9px', fontSize: '12.5px', background: '#ffffff' }}
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '8px',
                  }}
                >
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', margin: 0 }}>
                    কেন তুলবেন / বিবরণ
                    <input
                      placeholder="যেমন: স্কুল ও কলেজের মেয়েদের কাছে প্রচুর চাহিদা..."
                      value={newCustomForm.whyTrendingBn}
                      onChange={(e) =>
                        setNewCustomForm((p) => ({ ...p, whyTrendingBn: e.target.value }))
                      }
                      style={{ marginTop: '3px', padding: '6px 9px', fontSize: '12.5px', background: '#ffffff' }}
                    />
                  </label>

                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f766e', margin: 0 }}>
                    💡 বাজার টিপস
                    <input
                      placeholder="যেমন: মিক্সড কালার ডজন নিলে দ্রুত শেষ হবে..."
                      value={newCustomForm.marketTipBn}
                      onChange={(e) =>
                        setNewCustomForm((p) => ({ ...p, marketTipBn: e.target.value }))
                      }
                      style={{ marginTop: '3px', padding: '6px 9px', fontSize: '12.5px', background: '#ffffff' }}
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {newCustomForm.imageUrl && (
                      <img
                        src={newCustomForm.imageUrl}
                        alt="Preview"
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          border: '1.5px solid #7c3aed',
                        }}
                      />
                    )}

                    <button
                      type="button"
                      disabled={!newCustomForm.name.trim() || isSearchingCustomGooglePhoto}
                      onClick={() =>
                        handleFetchGooglePhotoForCustomForm(
                          newCustomForm.imageUrl ? customGooglePhotoIndex + 1 : 0
                        )
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 11px',
                        minHeight: '32px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        border: '1.5px solid #3b82f6',
                        color: '#1d4ed8',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={13} />
                      <span>
                        {isSearchingCustomGooglePhoto
                          ? 'গুগল থেকে ছবি খোঁজা হচ্ছে…'
                          : newCustomForm.imageUrl
                          ? '🔄 গুগল থেকে অন্য ছবি আনুন'
                          : '🔍 গুগল থেকে সঠিক ছবি আনুন'}
                      </span>
                    </button>

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: '#ffffff',
                        border: '1.5px dashed #7c3aed',
                        color: '#6d28d9',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        margin: 0,
                      }}
                    >
                      <Camera size={14} />
                      <span>নিজের ছবি আপলোড</span>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const dataUrl = await compressUploadedSuggestionImage(file);
                            setNewCustomForm((p) => ({ ...p, imageUrl: dataUrl }));
                          }
                        }}
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    style={{
                      padding: '7px 16px',
                      minHeight: '34px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    + ছবিসহ পরামর্শ তালিকায় সেভ করুন
                  </button>
                </div>
              </form>
            )}

            {/* Category Filter Buttons + Search + Limit Controls */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { id: 'all', label: `সব নতুন ট্রেন্ডিং (${toBengaliNumerals(categoryCounts.all)})` },
                  { id: 'hair_fashion', label: `হেয়ার ও ক্লিপ (${toBengaliNumerals(categoryCounts.hair_fashion)})` },
                  { id: 'jewelry', label: `জুয়েলারি ও রিং (${toBengaliNumerals(categoryCounts.jewelry)})` },
                  { id: 'cosmetics', label: `কসমেটিকস ও মিরর (${toBengaliNumerals(categoryCounts.cosmetics)})` },
                  { id: 'bags_accessories', label: `ব্যাগ ও ঘড়ি (${toBengaliNumerals(categoryCounts.bags_accessories)})` },
                  { id: 'gift_combo', label: `গিফট কম্বো (${toBengaliNumerals(categoryCounts.gift_combo)})` },
                ].map((cat) => {
                  const active = newCategoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setNewCategoryFilter(cat.id as any)}
                      style={{
                        padding: '5px 10px',
                        minHeight: '30px',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        border: active ? '1px solid #6d28d9' : '1px solid #ddd6fe',
                        background: active ? '#6d28d9' : '#f5f3ff',
                        color: active ? '#ffffff' : '#5b21b6',
                        cursor: 'pointer',
                      }}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '7px 10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flex: '1 1 200px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '4px 9px',
                  }}
                >
                  <Search size={14} color="#64748b" />
                  <input
                    type="text"
                    placeholder="ট্রেন্ডিং পণ্য খুঁজুন (যেমন: ক্লিপ, ঝুমকা, চুড়ি, লিপ গ্লস, ঘড়ি)..."
                    value={suggestionSearch}
                    onChange={(e) => setSuggestionSearch(e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '12px',
                      width: '100%',
                      padding: '2px 0',
                    }}
                  />
                  {suggestionSearch && (
                    <button
                      type="button"
                      onClick={() => setSuggestionSearch('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        minHeight: 'auto',
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#4c1d95' }}>
                    পরামর্শ লিমিট:
                  </span>
                  {[
                    { val: 12, label: '১২টি' },
                    { val: 24, label: '২৪টি' },
                    { val: 50, label: '৫০টি' },
                    { val: 999, label: `সব (${toBengaliNumerals(filteredNewSuggestions.length)}টি)` },
                  ].map((opt) => {
                    const isActive =
                      suggestionDisplayLimit === opt.val ||
                      (opt.val === 999 && suggestionDisplayLimit >= filteredNewSuggestions.length);
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setSuggestionDisplayLimit(opt.val)}
                        style={{
                          padding: '3px 8px',
                          minHeight: '26px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          border: isActive ? '1px solid #6d28d9' : '1px solid #cbd5e1',
                          background: isActive ? '#6d28d9' : '#ffffff',
                          color: isActive ? '#ffffff' : '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SUGGESTION CARDS GRID WITH ACCURATE GOOGLE PHOTOS */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(305px, 1fr))',
                gap: '12px',
              }}
            >
              {visibleNewSuggestions.map((s, idx) => {
                const isSelected = selectedNewSuggestionIds.includes(s.id);
                const resolvedPhoto = getSuggestionPhoto(s);
                const hasCustomPhoto = Boolean(customPhotoMap[s.id]);
                const hasGooglePhoto = isVerifiedGooglePhoto(s);
                const isLoadingThisPhoto = Boolean(loadingPhotoIds[s.id]);

                return (
                  <div
                    key={s.id}
                    style={{
                      border: isSelected
                        ? '2px solid #7c3aed'
                        : s.isAutoUpdated
                        ? '1.5px solid #a7f3d0'
                        : '1px solid #e2e8f0',
                      background: isSelected
                        ? '#faf5ff'
                        : s.isAutoUpdated
                        ? 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 42%)'
                        : '#ffffff',
                      borderRadius: '14px',
                      padding: '12px 13px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isSelected
                        ? '0 4px 14px rgba(124, 58, 237, 0.12)'
                        : '0 1px 4px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    <div>
                      {/* Category & Demand Badges */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '6px',
                          flexWrap: 'wrap',
                          marginBottom: '9px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              background: '#ede9fe',
                              color: '#5b21b6',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                            }}
                          >
                            #{toBengaliNumerals(idx + 1)} • {s.categoryLabelBn}
                          </span>
                          {s.isAutoUpdated && (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #86efac',
                                padding: '1px 6px',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: 800,
                              }}
                            >
                              ✨ নতুন অটো-আপডেট
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                          }}
                        >
                          {s.demandLevelBn}
                        </span>
                      </div>

                      {/* Photo + Product Title Header Row */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '11px',
                          alignItems: 'flex-start',
                          marginBottom: '9px',
                        }}
                      >
                        {/* Product Photo Thumbnail with Google Photo Switcher & Upload Controls */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0,
                          }}
                        >
                          <div
                            onClick={() => setPreviewSuggestion(s)}
                            title="ছবি বড় করে দেখতে ক্লিক করুন"
                            style={{
                              position: 'relative',
                              width: '88px',
                              height: '88px',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              border: isSelected ? '2px solid #7c3aed' : '1.5px solid #cbd5e1',
                              background: '#ffffff',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)',
                            }}
                          >
                            <img
                              src={resolvedPhoto}
                              alt={s.name}
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (s.fallbackSvgUrl && target.src !== s.fallbackSvgUrl) {
                                  target.src = s.fallbackSvgUrl;
                                }
                              }}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                                opacity: isLoadingThisPhoto ? 0.45 : 1,
                              }}
                            />

                            {/* Google Verified Photo Badge */}
                            {hasGooglePhoto && (
                              <span
                                style={{
                                  position: 'absolute',
                                  left: '4px',
                                  top: '4px',
                                  background: 'rgba(29, 78, 216, 0.88)',
                                  color: '#ffffff',
                                  borderRadius: '4px',
                                  padding: '1px 4px',
                                  fontSize: '8.5px',
                                  fontWeight: 800,
                                }}
                              >
                                G গুগল
                              </span>
                            )}

                            <span
                              style={{
                                position: 'absolute',
                                right: '4px',
                                bottom: '4px',
                                background: 'rgba(15, 23, 42, 0.72)',
                                color: '#ffffff',
                                borderRadius: '5px',
                                padding: '2px 4px',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                              }}
                            >
                              <Eye size={10} /> জুম
                            </span>
                          </div>

                          {/* 1-Click Switch Google Photo + Upload Custom Photo Mini Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <button
                              type="button"
                              disabled={isLoadingThisPhoto}
                              title="গুগল থেকে এই পণ্যের অন্য সঠিক ছবি আনুন"
                              onClick={() => handleFetchNextGooglePhoto(s)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                padding: '2px 5px',
                                minHeight: '21px',
                                borderRadius: '5px',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1d4ed8',
                                fontSize: '9.5px',
                                fontWeight: 800,
                                cursor: isLoadingThisPhoto ? 'wait' : 'pointer',
                              }}
                            >
                              <RefreshCw size={9} />
                              <span>{isLoadingThisPhoto ? 'আসছে..' : 'গুগল ছবি'}</span>
                            </button>

                            <label
                              title="নিজের তোলা বাজারের ছবি সেট করুন"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                padding: '2px 5px',
                                minHeight: '21px',
                                borderRadius: '5px',
                                background: '#f5f3ff',
                                border: '1px solid #ddd6fe',
                                color: '#6d28d9',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                margin: 0,
                              }}
                            >
                              <Camera size={9} />
                              <span>{hasCustomPhoto ? 'বদলান' : 'আপলোড'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) =>
                                  handleUploadSuggestionPhoto(s.id, e.target.files?.[0])
                                }
                              />
                            </label>

                            {hasCustomPhoto && (
                              <button
                                type="button"
                                title="গুগলের ছবিতে ফিরে যান"
                                onClick={() => handleResetSuggestionPhoto(s.id)}
                                style={{
                                  padding: '2px 4px',
                                  minHeight: '20px',
                                  borderRadius: '5px',
                                  background: '#fee2e2',
                                  border: '1px solid #fecaca',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                              >
                                <RotateCcw size={9} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4
                            style={{
                              margin: '0 0 5px',
                              fontSize: '14px',
                              fontWeight: 800,
                              color: '#0f172a',
                              lineHeight: 1.35,
                            }}
                          >
                            {s.name}
                          </h4>

                          <p
                            style={{
                              margin: 0,
                              fontSize: '11.8px',
                              lineHeight: 1.48,
                              color: '#334155',
                            }}
                          >
                            {s.whyTrendingBn}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          background: '#f0fdfa',
                          border: '1px solid #99f6e4',
                          borderRadius: '8px',
                          padding: '6px 9px',
                          fontSize: '11.5px',
                          color: '#115e59',
                          marginBottom: '9px',
                        }}
                      >
                        💡 <b>বাজার টিপস:</b> {s.marketTipBn}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '6px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '7px 6px',
                          textAlign: 'center',
                          fontSize: '11px',
                        }}
                      >
                        <div>
                          <span style={{ display: 'block', color: '#64748b' }}>পাইকারি ক্রয়মূল্য</span>
                          <strong style={{ color: '#b45309' }}>{s.wholesalePriceRangeBn}</strong>
                        </div>
                        <div>
                          <span style={{ display: 'block', color: '#64748b' }}>খুচরা বিক্রয়মূল্য</span>
                          <strong style={{ color: '#059669' }}>{s.suggestedRetailPriceBn}</strong>
                        </div>
                        <div>
                          <span style={{ display: 'block', color: '#64748b' }}>প্রস্তাবিত শুরু</span>
                          <strong style={{ color: '#6d28d9' }}>{s.starterQtyBn}</strong>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '6px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleNewSuggestion(s.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 10px',
                          minHeight: '32px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          border: isSelected ? '1px solid #6d28d9' : '1px solid #cbd5e1',
                          background: isSelected ? '#6d28d9' : '#f1f5f9',
                          color: isSelected ? '#ffffff' : '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? <Check size={14} /> : <Plus size={14} />}
                        <span>{isSelected ? 'বাজার তালিকায় যুক্ত' : 'বাজার তালিকায় নিন'}</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {(s.isCustom || s.isAutoUpdated) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomSuggestion(s.id)}
                            title="তালিকা থেকে সরান"
                            style={{
                              padding: '6px 8px',
                              minHeight: '32px',
                              borderRadius: '8px',
                              border: '1px solid #fecaca',
                              background: '#fff1f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}

                        {onQuickAddSuggestedProduct && (
                          <button
                            type="button"
                            onClick={() =>
                              onQuickAddSuggestedProduct({
                                ...s,
                                imageUrl: resolvedPhoto,
                              })
                            }
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 10px',
                              minHeight: '32px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              border: '1px solid #99f6e4',
                              background: '#f0fdfa',
                              color: '#0f766e',
                              cursor: 'pointer',
                            }}
                          >
                            <ArrowUpRight size={14} />
                            <span>ছবিসহ স্টকে যোগ</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show More Button if filtered list exceeds current limit */}
            {filteredNewSuggestions.length > visibleNewSuggestions.length && (
              <div style={{ textAlign: 'center', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setSuggestionDisplayLimit(filteredNewSuggestions.length + 20)}
                  style={{
                    padding: '8px 18px',
                    minHeight: '36px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #6d28d9, #4f46e5)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  আরও {toBengaliNumerals(filteredNewSuggestions.length - visibleNewSuggestions.length)}টি ছবিসহ পরামর্শ দেখুন (সবগুলো)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PHOTO LIGHTBOX / ZOOM PREVIEW MODAL FOR MARKET SHOPPING */}
      {previewSuggestion && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1300 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewSuggestion(null);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '430px',
              width: '92%',
              padding: '16px',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.35)',
              border: '1.5px solid #ddd6fe',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '10px',
              }}
            >
              <div>
                <span
                  style={{
                    background: '#ede9fe',
                    color: '#5b21b6',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  {previewSuggestion.categoryLabelBn}
                </span>
                <h3 style={{ margin: '6px 0 0', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {previewSuggestion.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSuggestion(null)}
                style={{
                  width: '30px',
                  height: '30px',
                  minHeight: '30px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                width: '100%',
                height: '260px',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                marginBottom: '12px',
              }}
            >
              <img
                src={getSuggestionPhoto(previewSuggestion)}
                alt={previewSuggestion.name}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (
                    previewSuggestion.fallbackSvgUrl &&
                    target.src !== previewSuggestion.fallbackSvgUrl
                  ) {
                    target.src = previewSuggestion.fallbackSvgUrl;
                  }
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: '#ffffff',
                }}
              />
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '9px 10px',
                fontSize: '12px',
                marginBottom: '12px',
                display: 'grid',
                gap: '4px',
              }}
            >
              <div>
                <b>পাইকারি দর:</b>{' '}
                <span style={{ color: '#b45309', fontWeight: 800 }}>
                  {previewSuggestion.wholesalePriceRangeBn}
                </span>{' '}
                • <b>খুচরা বিক্রয়:</b>{' '}
                <span style={{ color: '#059669', fontWeight: 800 }}>
                  {previewSuggestion.suggestedRetailPriceBn}
                </span>
              </div>
              <div style={{ color: '#0f766e', fontWeight: 700 }}>
                💡 টিপস: {previewSuggestion.marketTipBn}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px' }}>
              <button
                type="button"
                disabled={Boolean(loadingPhotoIds[previewSuggestion.id])}
                onClick={() => handleFetchNextGooglePhoto(previewSuggestion)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  padding: '8px 10px',
                  minHeight: '36px',
                  borderRadius: '9px',
                  background: '#eff6ff',
                  border: '1px solid #93c5fd',
                  color: '#1d4ed8',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                <span>
                  {loadingPhotoIds[previewSuggestion.id]
                    ? 'গুগল থেকে ছবি আসছে…'
                    : 'গুগল থেকে অন্য ছবি আনুন'}
                </span>
              </button>

              <label
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  padding: '8px 10px',
                  borderRadius: '9px',
                  background: '#f5f3ff',
                  border: '1px solid #c4b5fd',
                  color: '#5b21b6',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  margin: 0,
                }}
              >
                <Camera size={13} />
                <span>নিজের ছবি দিন</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) =>
                    handleUploadSuggestionPhoto(previewSuggestion.id, e.target.files?.[0])
                  }
                />
              </label>

              <button
                type="button"
                onClick={() => setPreviewSuggestion(null)}
                style={{
                  padding: '8px 14px',
                  minHeight: '36px',
                  borderRadius: '9px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
