import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { money, dateLabel, calculateCashBalance, calculatePartnerAccountBalances, type AccountingSummary, type InvestorLedgerItem } from './accounting';
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

  const typeLabels: Record<string, string> = {
    investment: 'বিনিয়োগ',
    sale: 'বিক্রয়',
    purchase: 'ক্রয়',
    expense: 'খরচ',
    withdrawal: 'উত্তোলন',
    loan: 'লোন',
    other: 'অন্যান্য',
  };

  const currentDateBn = new Date().toLocaleDateString('bn-BD', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const cashSum = calculateCashBalance(data.entries, data.products);
  const partnerAccs = calculatePartnerAccountBalances(data.investors, data.entries, data.products);
  const recentEntries = data.entries.slice(0, 15);

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
