# Business Partner Accounting (ব্যবসার হিসাব)

বাংলা-ভিত্তিক ব্যবসায়িক অংশীদার হিসাবরক্ষণ ও ইনভেন্টরি কস্টিং ওয়েবসাইট (React + TypeScript + Firebase Firestore + Auth)।

---

## বৈশিষ্ট্যসমূহ (Key Features)

1. **অংশীদারদের মূলধন ও ইকুইটি লেজার (Partner Equity Ledger):**
   - প্রতিটি অংশীদারের পোস্টকৃত মূলধন বিনিয়োগের ভিত্তিতে আনুপাতিক মালিকানা শতাংশ (`Share % = Capital / Total Capital * 100`) স্বয়ংক্রিয় গণনা।
   - পার্টনারদের উত্তোলন (Withdrawal) এবং লোন (Loan) পৃথক লেজারে ট্র্যাকিং।
   - উত্তোলনের পর নিট মূলধন ব্যালেন্সের নিখুঁত হিসাব।

2. **ইনভেন্টরি পণ্য ও বিক্রীত পণ্যের খরচ (Inventory Costing & COGS):**
   - পণ্যের বর্তমান মজুদ স্টক ট্র্যাকিং।
   - নতুন পণ্য ক্রয়ের সাথে সাথে স্বয়ংক্রিয় ভারিত গড় ক্রয়মূল্য (Weighted Average Cost) পুনঃগণনা।
   - বিক্রয়ের সময় বিক্রয় রাজস্ব ও বিক্রীত পণ্যের ব্যয় (COGS) গণনা।

3. **আর্থিক লাভ-ক্ষতি বিবরণী (Accurate Financial Statements):**
   - **মোট লাভ (Gross Profit)** = মোট বিক্রয় − বিক্রীত পণ্যের খরচ (COGS)।
   - **প্রকৃত নিট মুনাফা (Net Operating Profit)** = মোট লাভ − সাধারণ ও পরিচালন ব্যয় (ভাড়া, বেতন, ইউটিলিটি)।
   - পয়সা নির্ভুলতা নিশ্চিত করতে ফ্লোটিং পয়েন্ট সমস্যার সমাধানে ইন্টিজার-পয়সা আর্কিটেকচার।

4. **মুনাফা বণ্টন মডিউল (Periodic Profit Distribution):**
   - নির্ধারিত মেয়াদের নিট মুনাফা থেকে অংশীদারদের ইকুইটি শেয়ার অনুপাতে সঠিক টাকা বণ্টন।
   - সংরক্ষিত তহবিল (Retained Reserve) আলাদা রাখার সুবিধা।

5. **ড্রাফট মোছা ও অডিট-নিরাপদ রিভার্সাল (Audit Safety & Voiding):**
   - শুধুমাত্র অপোস্টেড ড্রাফট (Draft) হিসাব স্থায়ীভাবে মোছা যায়।
   - পোস্টেড আর্থিক লেনদেন সরাসরি মুছে ফেলা যায় না; কারণ উল্লেখ করে বাতিল (Void) করতে হয় এবং তা অপরিবর্তনীয় `auditLogs` সংগ্রহে সংরক্ষিত থাকে।

6. **নিরাপদ ডেমো ডেটা ব্যবস্থাপনা (Demo Cleanup with Live Preview):**
   - ডেটাবেসে থাকা সকল `demo: true` চিহ্নিত রেকর্ড (লেনদেন, ডেমো পার্টনার, ডেমো পণ্য) মোছার আগে প্রিভিউ তালিকা ও মোট টাকার পরিমাণ দেখা যায়।
   - এক ক্লিকে নিরাপদ ব্যাচ ডিলিট।

7. **বাংলা ইউনিকোড PDF রিপোর্ট জেনারেশন:**
   - ব্রাউজারের নেটিভ টেক্সট শেপিং এবং রেন্ডারিং ব্যবহার করে কোনো যুক্তবর্ণ বা কার-চিহ্ন না ভেঙে ১০০% নিখুঁত বাংলা PDF রিপোর্ট জেনারেশন।

---

## ফায়ারবেস কনফিগারেশন (Firebase Configuration)

এই ওয়েবসাইটটির জন্য ক্লাউড ফায়ারবেস ডেটাবেস ও অথেন্টিকেশন ইতিমধ্যে সফলভাবে প্রভিশন করা হয়েছে:
- **Project ID:** `gen-lang-client-0077663373`
- **Firestore Database ID:** `ai-studio-527d46c4-a59a-4a15-9b56-96bf63d0079c`
- **Auth Provider:** Google Sign-In ও Email/Password
- **Super Admin Email:** `glowzaabd.shop@gmail.com`

কনফিগারেশন ফাইল `firebase-applet-config.json` সরাসরি প্রোজেক্টের রুট ডিরেক্টরিতে সংযুক্ত আছে। বিকল্পভাবে `.env.local` ফাইলে এনভায়রনমেন্ট ভেরিয়েবলও ব্যবহার করা যায়:

```env
VITE_FIREBASE_API_KEY="AIzaSyBHDIVwa8b-67N34UEYnDBmJhDRlTR3Izc"
VITE_FIREBASE_AUTH_DOMAIN="gen-lang-client-0077663373.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="gen-lang-client-0077663373"
VITE_FIREBASE_STORAGE_BUCKET="gen-lang-client-0077663373.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="636259784075"
VITE_FIREBASE_APP_ID="1:636259784075:web:5e32fdcf205db5a3ee8b8e"
```

---

## লোকাল ডেভেলপমেন্ট (Local Setup)

1. ডিপেন্ডেন্সি ইনস্টল করুন:
```bash
npm install
```

2. ডেভেলপমেন্ট সার্ভার চালু করুন:
```bash
npm run dev
```

3. স্বয়ংক্রিয় ফাইন্যান্সিয়াল ও ইন্টিগ্রিটি টেস্ট চালান:
```bash
npm test
```

---

## প্রোডাকশন বিল্ড ও ডিপ্লয়মেন্ট গাইড (Deployment Instructions)

### ধাপ ১: প্রোডাকশন বিল্ড তৈরি
```bash
npm run build
```
এটি `dist` ফোল্ডারে অপ্টিমাইজড HTML, CSS ও জাভাস্ক্রিপ্ট বান্ডেল তৈরি করবে।

### ধাপ ২: Firebase Hosting-এ ডিপ্লয়মেন্ট
1. Firebase CLI ইনস্টল করুন (যদি না থাকে):
```bash
npm install -g firebase-tools
firebase login
```

2. প্রোজেক্ট ইনিশিয়ালাইজ করুন:
```bash
firebase init hosting
```
- Public directory: `dist`
- Configure as a single-page app: `Yes`
- Set up automatic builds: `No`

3. ডিপ্লয় করুন:
```bash
firebase deploy --only hosting,firestore:rules
```

### বিকল্প হোস্টিং (Vercel / Netlify / Cloud Run):
- **Vercel / Netlify:** Build Command হিসেবে `npm run build` এবং Output Directory হিসেবে `dist` সিলেক্ট করুন।
- SPA rewrite রুল যুক্ত করুন: `/* -> /index.html`।
