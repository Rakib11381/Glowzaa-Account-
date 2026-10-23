import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { money, dateLabel, shares, calculateCashBalance, calculatePartnerAccountBalances, type AccountingSummary, type InvestorLedgerItem } from './accounting';
import type { Entry, Product, BusinessSettings, Investor } from './types';

export interface ReportData {
  settings: BusinessSettings;
  stats: AccountingSummary;
  investors: Investor[];
  products: Product[];
  entries: Entry[];
  startDate?: string;
  endDate?: string;
}

export interface MonthlyReportData {
  settings: BusinessSettings;
  yearMonth: string; // YYYY-MM
  stats: AccountingSummary;
  investors: Investor[];
  products: Product[];
  monthEntries: Entry[];
  allEntries: Entry[];
}

const BENGALI_MONTHS: Record<string, string> = {
  '01': 'জানুয়ারি',
  '02': 'ফেব্রুয়ারি',
  '03': 'মার্চ',
  '04': 'এপ্রিল',
  '05': 'মে',
  '06': 'জুন',
  '07': 'জুলাই',
  '08': 'আগস্ট',
  '09': 'সেপ্টেম্বর',
  '10': 'অক্টোবর',
  '11': 'নভেম্বর',
  '12': 'ডিসেম্বর',
};

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBnDigits = (val: string | number): string =>
  String(val).replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]);

export function formatMonthLabelBn(yearMonth: string): string {
  if (!yearMonth || !yearMonth.includes('-')) return yearMonth || 'নির্বাচিত মাস';
  const [year, month] = yearMonth.split('-');
  const monthName = BENGALI_MONTHS[month] || month;
  return `${monthName} ${toBnDigits(year)}`;
}

// Generate high-resolution, perfectly shaped Bengali PDF report including cash balance and partner accounts
export async function generateBengaliPdf(data: ReportData, fileName?: string): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // Standard A4 width at 96 DPI
  container.style.padding = '36px 42px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#102a43';
  container.style.fontFamily = "'Hind Siliguri', 'Inter', system-ui, sans-serif";
  container.style.boxSizing = 'border-box';

  const currentDateBn = new Date().toLocaleDateString('bn-BD', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const cashSum = calculateCashBalance(data.entries, data.products);
  const partnerAccs = calculatePartnerAccountBalances(data.investors, data.entries, data.products);

  container.innerHTML = `
    <div style="border-bottom: 2px solid #087f70; padding-bottom: 16px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0 0 6px 0; font-size: 26px; color: #102a43; font-weight: 700;">${data.settings.name || 'Glowzaa Shop'}</h1>
          <p style="margin: 0; font-size: 13px; color: #627d98;">${data.settings.type || 'ব্যবসার হিসাব ও আর্থিক ব্যবস্থাপনা'} | ${data.settings.address || 'বাংলাদেশ'}</p>
          <p style="margin: 3px 0 0 0; font-size: 13px; color: #627d98;">ফোন: ${data.settings.phone || '—'}</p>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #e6f6f4; color: #087f70; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-bottom: 6px;">
            আর্থিক প্রতিবেদন ও পার্টনার ব্যালেন্স
          </div>
          <p style="margin: 0; font-size: 12px; color: #8293a7;">তারিখ: ${currentDateBn}</p>
        </div>
      </div>
    </div>

    <!-- Available Balance & Capital Summary -->
    <div style="margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px;">
      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #102a43; border-left: 4px solid #087f70; padding-left: 8px;">
        বর্তমান মোট ব্যালেন্স ও মূলধন হিসাব (Total Balance: Capital + Net Profit - Withdrawals)
      </h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; font-size: 13px;">
        <div>
          <span style="color: #64748b; display: block; font-size: 11px;">বর্তমান মোট ব্যালেন্স:</span>
          <b style="color: #087f70; font-size: 16px;">${money(cashSum.availableCash)}</b>
        </div>
        <div>
          <span style="color: #64748b; display: block; font-size: 11px;">মোট মূলধন:</span>
          <b style="font-size: 15px; color: #7e22ce;">${money(cashSum.totalInvestments)}</b>
        </div>
        <div>
          <span style="color: #64748b; display: block; font-size: 11px;">অর্জিত নিট লাভ:</span>
          <b style="color: #059669; font-size: 15px;">+${money(cashSum.netProfit)}</b>
        </div>
        <div>
          <span style="color: #64748b; display: block; font-size: 11px;">মোট উত্তোলন:</span>
          <b style="color: #b42318; font-size: 15px;">-${money(cashSum.totalWithdrawals)}</b>
        </div>
      </div>
    </div>

    <!-- Executive Financial Summary -->
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #243b53; border-left: 4px solid #087f70; padding-left: 8px;">
        আর্থিক সারাংশ ও লাভ-ক্ষতি বিবরণী (Income Statement)
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px;">
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
            <td style="padding: 9px 12px; font-weight: 600;">মোট বিক্রয় রাজস্ব (Total Sales Revenue)</td>
            <td style="padding: 9px 12px; text-align: right; font-weight: 700; color: #087f70;">${money(data.stats.sales)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 9px 12px;">বাদ: বিক্রীত পণ্যের ব্যয় / স্টক খরচ (COGS)</td>
            <td style="padding: 9px 12px; text-align: right; color: #b42318;">- ${money(data.stats.cogs)}</td>
          </tr>
          <tr style="border-bottom: 2px solid #cbd5e1; background: #f1f5f9;">
            <td style="padding: 10px 12px; font-weight: 700;">মোট লাভ (Gross Profit)</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; font-size: 14px;">${money(data.stats.grossProfit)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 9px 12px;">বাদ: সাধারণ ও পরিচালন ব্যয় (Operating Expenses)</td>
            <td style="padding: 9px 12px; text-align: right; color: #b42318;">- ${money(data.stats.expenses)}</td>
          </tr>
          <tr style="background: #e6f6f4; border-top: 2px solid #087f70; border-bottom: 2px solid #087f70;">
            <td style="padding: 12px; font-weight: 700; font-size: 15px; color: #087f70;">প্রকৃত নিট মুনাফা (Net Operating Profit)</td>
            <td style="padding: 12px; text-align: right; font-weight: 700; font-size: 16px; color: #087f70;">${money(data.stats.netProfit)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Partner Account Balances -->
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #243b53; border-left: 4px solid #7b43c3; padding-left: 8px;">
        পার্টনারদের বর্তমান হিসাব ও অ্যাকাউন্ট ব্যালেন্স (Partner Account Balances)
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #475569; text-align: left;">
            <th style="padding: 8px 10px;">নাম</th>
            <th style="padding: 8px 10px; text-align: right;">মূলধন</th>
            <th style="padding: 8px 10px; text-align: right;">শেয়ার %</th>
            <th style="padding: 8px 10px; text-align: right;">বরাদ্দকৃত লাভ</th>
            <th style="padding: 8px 10px; text-align: right;">মোট উত্তোলন</th>
            <th style="padding: 8px 10px; text-align: right;">অ্যাকাউন্ট ব্যালেন্স</th>
          </tr>
        </thead>
        <tbody>
          ${partnerAccs
            .map(
              (p) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 10px; font-weight: 600;">${p.name}</td>
              <td style="padding: 8px 10px; text-align: right;">${money(p.capital)}</td>
              <td style="padding: 8px 10px; text-align: right; color: #087f70;">${p.share.toFixed(2)}%</td>
              <td style="padding: 8px 10px; text-align: right;">${money(p.allocatedProfit)}</td>
              <td style="padding: 8px 10px; text-align: right; color: #b42318;">${money(p.withdrawals)}</td>
              <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #102a43;">${money(p.accountBalance)}</td>
            </tr>
          `
            )
            .join('')}
          ${!partnerAccs.length ? `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #94a3b8;">কোনো অংশীদার পাওয়া যায়নি</td></tr>` : ''}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="margin-top: 32px; border-top: 1px dashed #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
      <span>সিস্টেম জেনারেটেড ডিজিটাল অডিট রিপোর্ট • Business Partner Accounting</span>
      <span>পৃষ্ঠা ১ / ১</span>
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
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    const outName = fileName || `business-report-${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(outName);
  } finally {
    document.body.removeChild(container);
  }
}

// Generate dedicated Monthly PDF Report summarizing total sales, expenses, and net profits for a selected calendar month
export async function generateMonthlyBengaliPdf(data: MonthlyReportData, fileName?: string): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // Standard A4 width at 96 DPI
  container.style.padding = '34px 40px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#102a43';
  container.style.fontFamily = "'Hind Siliguri', 'Inter', system-ui, sans-serif";
  container.style.boxSizing = 'border-box';

  const typeLabels: Record<string, string> = {
    investment: 'বিনিয়োগ',
    sale: 'বিক্রয়',
    purchase: 'মাল ক্রয়',
    expense: 'পরিচালন খরচ',
    withdrawal: 'উত্তোলন',
    loan: 'লোন',
    other: 'অন্যান্য',
  };

  const monthLabelBn = formatMonthLabelBn(data.yearMonth);
  const currentDateBn = new Date().toLocaleDateString('bn-BD', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const postedMonthEntries = data.monthEntries
    .filter((e) => e.status === 'posted')
    .sort((a, b) => a.date.localeCompare(b.date));

  const salesCount = postedMonthEntries.filter((e) => e.type === 'sale').length;
  const expenseCount = postedMonthEntries.filter((e) => e.type === 'expense').length;
  const totalMonthlyExpenses = data.stats.cogs + data.stats.expenses;
  const netProfitColor = data.stats.netProfit >= 0 ? '#059669' : '#dc2626';
  const netProfitBg = data.stats.netProfit >= 0 ? '#ecfdf5' : '#fef2f2';
  const netProfitBorder = data.stats.netProfit >= 0 ? '#059669' : '#dc2626';

  // Partner shares for monthly profit allocation preview
  const partnerLedgers = shares(data.investors, data.allEntries);
  const displayEntries = postedMonthEntries.slice(0, 22);

  container.innerHTML = `
    <!-- Header -->
    <div style="border-bottom: 2px solid #0f766e; padding-bottom: 14px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0 0 5px 0; font-size: 25px; color: #0f172a; font-weight: 700;">${data.settings.name || 'Glowzaa Shop'}</h1>
          <p style="margin: 0; font-size: 12.5px; color: #475569;">${data.settings.type || 'ব্যবসার হিসাব ও আর্থিক ব্যবস্থাপনা'} | ${data.settings.address || 'বাংলাদেশ'}</p>
          <p style="margin: 2px 0 0 0; font-size: 12.5px; color: #475569;">ফোন: ${data.settings.phone || '—'}</p>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #0f766e; color: #ffffff; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-bottom: 5px;">
            মাসিক আর্থিক প্রতিবেদন • ${monthLabelBn}
          </div>
          <p style="margin: 0; font-size: 11.5px; color: #64748b;">হিসাবের মাস: ${data.yearMonth} | প্রস্তুতের তারিখ: ${currentDateBn}</p>
        </div>
      </div>
    </div>

    <!-- Top 4 Monthly KPI Summary Cards -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px;">
        <span style="font-size: 11px; color: #166534; font-weight: 600; display: block;">মাসিক মোট বিক্রয় (Total Sales)</span>
        <b style="font-size: 17px; color: #15803d; display: block; margin-top: 4px;">${money(data.stats.sales)}</b>
        <span style="font-size: 10.5px; color: #166534;">মোট বিক্রয়: ${toBnDigits(salesCount)}টি লেনদেন</span>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px;">
        <span style="font-size: 11px; color: #92400e; font-weight: 600; display: block;">মাসিক মোট খরচ (Total Expenses)</span>
        <b style="font-size: 17px; color: #b45309; display: block; margin-top: 4px;">${money(totalMonthlyExpenses)}</b>
        <span style="font-size: 10.5px; color: #92400e;">COGS: ${money(data.stats.cogs)} + ব্যয়: ${money(data.stats.expenses)}</span>
      </div>

      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px;">
        <span style="font-size: 11px; color: #334155; font-weight: 600; display: block;">মাসিক গ্রস লাভ (Gross Profit)</span>
        <b style="font-size: 17px; color: #0f766e; display: block; margin-top: 4px;">${money(data.stats.grossProfit)}</b>
        <span style="font-size: 10.5px; color: #475569;">বিক্রয় রাজস্ব − পণ্যের ক্রয় খরচ</span>
      </div>

      <div style="background: ${netProfitBg}; border: 1.5px solid ${netProfitBorder}; border-radius: 8px; padding: 12px;">
        <span style="font-size: 11px; color: ${netProfitColor}; font-weight: 700; display: block;">মাসিক নিট লাভ / ক্ষতি (Net Profit)</span>
        <b style="font-size: 17px; color: ${netProfitColor}; display: block; margin-top: 4px;">
          ${data.stats.netProfit >= 0 ? '+' : ''}${money(data.stats.netProfit)}
        </b>
        <span style="font-size: 10.5px; color: ${netProfitColor};">গ্রস লাভ − পরিচালন ব্যয় (${toBnDigits(expenseCount)}টি)</span>
      </div>
    </div>

    <!-- Monthly Income & Expense Statement Table -->
    <div style="margin-bottom: 20px;">
      <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #0f172a; border-left: 4px solid #0f766e; padding-left: 8px;">
        ${monthLabelBn} মাসের আয়-ব্যয় ও লাভ-ক্ষতি বিবরণী (Monthly Profit & Loss Statement)
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #334155; text-align: left;">
            <th style="padding: 8px 10px;">আর্থিক খাত / বিবরণ</th>
            <th style="padding: 8px 10px;">হিসাবের ধরন</th>
            <th style="padding: 8px 10px; text-align: right;">টাকার পরিমাণ (৳)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
            <td style="padding: 8px 10px; font-weight: 600;">১. মোট বিক্রয় রাজস্ব (Total Monthly Sales)</td>
            <td style="padding: 8px 10px; color: #059669;">আয় (Revenue)</td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #059669;">${money(data.stats.sales)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 10px;">২. বাদ: বিক্রিত পণ্যের ক্রয় খরচ (Cost of Goods Sold - COGS)</td>
            <td style="padding: 8px 10px; color: #b45309;">প্রত্যক্ষ পণ্য খরচ</td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: #b45309;">- ${money(data.stats.cogs)}</td>
          </tr>
          <tr style="border-bottom: 1.5px solid #cbd5e1; background: #f1f5f9;">
            <td style="padding: 9px 10px; font-weight: 700;">৩. মাসিক মোট বিক্রয় লাভ (Gross Profit)</td>
            <td style="padding: 9px 10px; color: #0f766e; font-weight: 600;">বিক্রয় − COGS</td>
            <td style="padding: 9px 10px; text-align: right; font-weight: 700; color: #0f766e;">${money(data.stats.grossProfit)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 10px;">৪. বাদ: মাসিক পরিচালন ও অন্যান্য খরচ (Operating Expenses)</td>
            <td style="padding: 8px 10px; color: #dc2626;">পরিচালন ব্যয়</td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 600; color: #dc2626;">- ${money(data.stats.expenses)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0; background: #fffbeb;">
            <td style="padding: 8px 10px; font-weight: 600;">৫. মাসের সর্বমোট ব্যয় (COGS + পরিচালন খরচ)</td>
            <td style="padding: 8px 10px; color: #92400e;">মোট ব্যয়</td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #b45309;">${money(totalMonthlyExpenses)}</td>
          </tr>
          <tr style="background: ${netProfitBg}; border-top: 2px solid ${netProfitBorder}; border-bottom: 2px solid ${netProfitBorder};">
            <td style="padding: 10px; font-weight: 700; font-size: 14px; color: ${netProfitColor};">৬. মাসিক প্রকৃত নিট মুনাফা / ক্ষতি (Monthly Net Profit / Loss)</td>
            <td style="padding: 10px; font-weight: 700; color: ${netProfitColor};">চূড়ান্ত ফলাফল</td>
            <td style="padding: 10px; text-align: right; font-weight: 800; font-size: 15px; color: ${netProfitColor};">
              ${data.stats.netProfit >= 0 ? '+' : ''}${money(data.stats.netProfit)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Partner Share Allocation for this Month -->
    <div style="margin-bottom: 20px;">
      <h3 style="margin: 0 0 8px 0; font-size: 14.5px; color: #0f172a; border-left: 4px solid #7c3aed; padding-left: 8px;">
        অংশীদারদের মাসিক লভ্যাংশের অনুপাত (${monthLabelBn})
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1; color: #475569; text-align: left;">
            <th style="padding: 7px 10px;">অংশীদারের নাম</th>
            <th style="padding: 7px 10px; text-align: right;">মালিকানা শেয়ার %</th>
            <th style="padding: 7px 10px; text-align: right;">এই মাসের অর্জিত লভ্যাংশ</th>
          </tr>
        </thead>
        <tbody>
          ${partnerLedgers
            .map((p) => {
              const monthlyShareAmt = Math.round(((data.stats.netProfit * p.share) / 100) * 100) / 100;
              return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 7px 10px; font-weight: 600;">${p.name}</td>
                  <td style="padding: 7px 10px; text-align: right; color: #0f766e; font-weight: 600;">${p.share.toFixed(2)}%</td>
                  <td style="padding: 7px 10px; text-align: right; font-weight: 700; color: ${monthlyShareAmt >= 0 ? '#059669' : '#dc2626'};">
                    ${monthlyShareAmt >= 0 ? '+' : ''}${money(monthlyShareAmt)}
                  </td>
                </tr>
              `;
            })
            .join('')}
          ${!partnerLedgers.length ? `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #94a3b8;">কোনো অংশীদার পাওয়া যায়নি</td></tr>` : ''}
        </tbody>
      </table>
    </div>

    <!-- Monthly Transactions List -->
    <div>
      <h3 style="margin: 0 0 8px 0; font-size: 14.5px; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 8px;">
        ${monthLabelBn} মাসের লেনদেন বিবরণী (মোট ${toBnDigits(postedMonthEntries.length)}টি পোস্টকৃত রেকর্ড)
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1; color: #475569; text-align: left;">
            <th style="padding: 6px 8px;">তারিখ</th>
            <th style="padding: 6px 8px;">বিবরণ</th>
            <th style="padding: 6px 8px;">ধরন</th>
            <th style="padding: 6px 8px; text-align: right;">পরিমাণ (৳)</th>
          </tr>
        </thead>
        <tbody>
          ${displayEntries
            .map(
              (e) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; color: #475569;">${dateLabel(e.date)}</td>
                <td style="padding: 6px 8px; font-weight: 600; color: #0f172a;">${e.title}</td>
                <td style="padding: 6px 8px; color: #334155;">${typeLabels[e.type] || e.type}</td>
                <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: ${
                  e.type === 'sale' || e.type === 'investment' ? '#059669' : '#b45309'
                };">${money(e.amount)}</td>
              </tr>
            `
            )
            .join('')}
          ${
            !postedMonthEntries.length
              ? `<tr><td colspan="4" style="padding: 14px; text-align: center; color: #94a3b8;">নির্বাচিত মাসে কোনো লেনদেন পাওয়া যায়নি</td></tr>`
              : ''
          }
          ${
            postedMonthEntries.length > displayEntries.length
              ? `<tr><td colspan="4" style="padding: 6px 8px; text-align: center; color: #64748b; font-style: italic;">+ আরও ${toBnDigits(
                  postedMonthEntries.length - displayEntries.length
                )}টি লেনদেন মাসিক মোট হিসাবে অন্তর্ভুক্ত রয়েছে</td></tr>`
              : ''
          }
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
      <span>মাসিক অডিট স্টেটমেন্ট (${monthLabelBn}) • ${data.settings.name || 'Glowzaa Shop'}</span>
      <span>পৃষ্ঠা ১ / ১</span>
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
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    const outName = fileName || `monthly-report-${data.yearMonth}.pdf`;
    pdf.save(outName);
  } finally {
    document.body.removeChild(container);
  }
}

