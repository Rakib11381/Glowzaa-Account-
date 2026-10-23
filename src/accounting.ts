import type { Entry, Investor, Product, PartnerShare } from './types';

// Integer paisa conversions to eliminate floating point rounding errors
export const toPaisa = (n: number): number => Math.round((Number(n) || 0) * 100);
export const fromPaisa = (paisa: number): number => Math.round(paisa) / 100;

// Convert English numbers to Bengali Unicode digits
export function toBengaliNumerals(val: string | number): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(val).replace(/[0-9]/g, (d) => bnDigits[Number(d)]);
}

// Format currency in standard Bangladeshi Taka (BDT)
export const money = (n: number, useBengaliDigits: boolean = false): string => {
  const rounded = fromPaisa(toPaisa(n));
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);

  const clean = formatted.replace('BDT', '৳').replace('Tk', '৳').trim();
  const withSymbol = clean.startsWith('৳') ? clean : `৳${clean}`;
  return useBengaliDigits ? toBengaliNumerals(withSymbol) : withSymbol;
};

export const moneyBn = (n: number): string => money(n, true);

// Format date into Bengali localized format
export const dateLabel = (d: string): string => {
  if (!d) return '—';
  try {
    const dateObj = new Date(`${d}T12:00:00`);
    if (isNaN(dateObj.getTime())) return d;
    return dateObj.toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d;
  }
};

// Format exact date & time into Bengali format: e.g. "২২/১০/২০২৬, ৯:৫৭:০৩ PM"
export function formatBengaliDateTime(dateInput?: Date | string | number | null): string {
  if (!dateInput) return '—';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours);

  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const toBn = (str: string) => str.replace(/[0-9]/g, (match) => bnDigits[Number(match)]);

  return `${toBn(day)}/${toBn(month)}/${toBn(String(year))}, ${toBn(hoursStr)}:${toBn(minutes)}:${toBn(seconds)} ${ampm}`;
}

export interface InvestorLedgerItem extends Investor {
  capital: number; // Total posted equity investment
  withdrawals: number; // Total posted withdrawals
  loans: number; // Partner loans given
  netCapital: number; // Capital - withdrawals
  share: number; // Equity share percentage (0-100)
}

// Calculate exact partner equity shares and ledgers
export function shares(investors: Investor[], entries: Entry[]): InvestorLedgerItem[] {
  const posted = entries.filter((e) => e.status === 'posted');
  const capitalMap = new Map<string, number>();
  const withdrawalMap = new Map<string, number>();
  const loanMap = new Map<string, number>();

  for (const inv of investors) {
    capitalMap.set(inv.id, 0);
    withdrawalMap.set(inv.id, 0);
    loanMap.set(inv.id, 0);
  }

  for (const e of posted) {
    if (!e.investorId) continue;
    const paisa = toPaisa(e.amount);

    if (e.type === 'investment') {
      const cur = capitalMap.get(e.investorId) || 0;
      capitalMap.set(e.investorId, cur + paisa);
    } else if (e.type === 'withdrawal') {
      const cur = withdrawalMap.get(e.investorId) || 0;
      withdrawalMap.set(e.investorId, cur + paisa);
    } else if (e.type === 'loan') {
      const cur = loanMap.get(e.investorId) || 0;
      loanMap.set(e.investorId, cur + paisa);
    }
  }

  const totalCapitalPaisa = [...capitalMap.values()].reduce((sum, v) => sum + v, 0);

  return investors.map((inv) => {
    const capPaisa = capitalMap.get(inv.id) || 0;
    const withPaisa = withdrawalMap.get(inv.id) || 0;
    const loanPaisa = loanMap.get(inv.id) || 0;
    const share = totalCapitalPaisa > 0 ? (capPaisa / totalCapitalPaisa) * 100 : 0;

    return {
      ...inv,
      capital: fromPaisa(capPaisa),
      withdrawals: fromPaisa(withPaisa),
      loans: fromPaisa(loanPaisa),
      netCapital: fromPaisa(capPaisa - withPaisa),
      share: Number(share.toFixed(4)),
    };
  });
}

export interface InventoryValuationResult {
  updatedProducts: Product[];
  totalInventoryValue: number;
}

// Compute weighted average inventory costing and stock balances
export function calculateInventoryCosting(products: Product[], entries: Entry[]): InventoryValuationResult {
  const postedPurchases = entries.filter((e) => e.status === 'posted' && e.type === 'purchase');
  const postedSales = entries.filter((e) => e.status === 'posted' && e.type === 'sale');

  // Clone products
  const productMap = new Map<string, { currentStock: number; averageCost: number; totalCostPaisa: number }>();
  for (const p of products) {
    productMap.set(p.id, {
      currentStock: p.currentStock || 0,
      averageCost: p.averageCost || 0,
      totalCostPaisa: toPaisa((p.currentStock || 0) * (p.averageCost || 0)),
    });
  }

  // Process purchases to update weighted average cost
  for (const p of postedPurchases) {
    if (!p.productId || !p.quantity || p.quantity <= 0) continue;
    const existing = productMap.get(p.productId);
    if (!existing) continue;

    const purchaseQty = p.quantity;
    const purchaseCostPaisa = toPaisa(p.amount);
    const newQty = existing.currentStock + purchaseQty;
    const newTotalCostPaisa = existing.totalCostPaisa + purchaseCostPaisa;
    const newAvgCost = newQty > 0 ? fromPaisa(Math.round(newTotalCostPaisa / newQty)) : existing.averageCost;

    productMap.set(p.productId, {
      currentStock: newQty,
      averageCost: newAvgCost,
      totalCostPaisa: newTotalCostPaisa,
    });
  }

  // Deduct sales from stock
  for (const s of postedSales) {
    if (!s.productId || !s.quantity || s.quantity <= 0) continue;
    const existing = productMap.get(s.productId);
    if (!existing) continue;

    const remainingQty = Math.max(0, existing.currentStock - s.quantity);
    const cogsPaisa = toPaisa(s.quantity * existing.averageCost);
    const remainingCostPaisa = Math.max(0, existing.totalCostPaisa - cogsPaisa);

    productMap.set(s.productId, {
      currentStock: remainingQty,
      averageCost: existing.averageCost,
      totalCostPaisa: remainingCostPaisa,
    });
  }

  let totalInventoryValuePaisa = 0;
  const updatedProducts = products.map((prod) => {
    const updated = productMap.get(prod.id);
    if (updated) {
      totalInventoryValuePaisa += toPaisa(updated.currentStock * updated.averageCost);
      return {
        ...prod,
        currentStock: updated.currentStock,
        averageCost: updated.averageCost,
      };
    }
    return prod;
  });

  return {
    updatedProducts,
    totalInventoryValue: fromPaisa(totalInventoryValuePaisa),
  };
}

export interface AccountingSummary {
  sales: number;
  purchases: number;
  expenses: number;
  investments: number;
  withdrawals: number;
  loans: number;
  cogs: number; // Cost of Goods Sold
  grossProfit: number; // Sales - COGS
  netProfit: number; // Gross Profit - Expenses
  roughNetProfit: number; // Simple cashflow (Sales - Purchases - Expenses)
  inventoryValuation: number;
  postedCount: number;
  draftCount: number;
  voidCount: number;
}

// Compute comprehensive financial report summary
export function summary(entries: Entry[], products: Product[] = []): AccountingSummary {
  const posted = entries.filter((e) => e.status === 'posted');
  const drafts = entries.filter((e) => e.status === 'draft');
  const voids = entries.filter((e) => e.status === 'void');

  const sumPaisa = (type: Entry['type']) =>
    posted.filter((e) => e.type === type).reduce((s, e) => s + toPaisa(e.amount), 0);

  const salesPaisa = sumPaisa('sale');
  const purchasesPaisa = sumPaisa('purchase');
  const expensesPaisa = sumPaisa('expense');
  const investmentsPaisa = sumPaisa('investment');
  const withdrawalsPaisa = sumPaisa('withdrawal');
  const loansPaisa = sumPaisa('loan');

  // Calculate COGS
  // If an entry has cogsAmount, use it; otherwise, if product linked, calculate from product avg cost;
  // If no product tracking exists for an entry, calculate based on overall purchases or logged cogs.
  let calculatedCogsPaisa = 0;
  const prodCostMap = new Map<string, number>();
  for (const p of products) {
    prodCostMap.set(p.id, p.averageCost || 0);
  }

  const salesEntries = posted.filter((e) => e.type === 'sale');
  let hasItemizedSales = false;

  for (const s of salesEntries) {
    if (s.grossProfit !== undefined && !isNaN(Number(s.grossProfit))) {
      const gp = toPaisa(s.grossProfit);
      calculatedCogsPaisa += Math.max(0, toPaisa(s.amount) - gp);
      hasItemizedSales = true;
    } else if (s.cogsAmount !== undefined && !isNaN(Number(s.cogsAmount))) {
      calculatedCogsPaisa += toPaisa(s.cogsAmount);
      hasItemizedSales = true;
    } else if (s.productId && s.quantity && prodCostMap.has(s.productId)) {
      const avgCost = prodCostMap.get(s.productId) || 0;
      calculatedCogsPaisa += toPaisa(s.quantity * avgCost);
      hasItemizedSales = true;
    }
  }

  // If items weren't tracked individually, direct COGS defaults to purchases for simplified cash accounting
  const finalCogsPaisa = hasItemizedSales ? calculatedCogsPaisa : purchasesPaisa;
  const grossProfitPaisa = salesPaisa - finalCogsPaisa;
  const netProfitPaisa = grossProfitPaisa - expensesPaisa;
  const roughNetProfitPaisa = salesPaisa - purchasesPaisa - expensesPaisa;

  // Inventory value
  const invVal = calculateInventoryCosting(products, entries);

  return {
    sales: fromPaisa(salesPaisa),
    purchases: fromPaisa(purchasesPaisa),
    expenses: fromPaisa(expensesPaisa),
    investments: fromPaisa(investmentsPaisa),
    withdrawals: fromPaisa(withdrawalsPaisa),
    loans: fromPaisa(loansPaisa),
    cogs: fromPaisa(finalCogsPaisa),
    grossProfit: fromPaisa(grossProfitPaisa),
    netProfit: fromPaisa(netProfitPaisa),
    roughNetProfit: fromPaisa(roughNetProfitPaisa),
    inventoryValuation: invVal.totalInventoryValue,
    postedCount: posted.length,
    draftCount: drafts.length,
    voidCount: voids.length,
  };
}

// Calculate profit distribution per partner based on equity share %
export function distributeProfit(
  distributableAmount: number,
  investorLedgers: InvestorLedgerItem[]
): PartnerShare[] {
  const activeInvestors = investorLedgers.filter((i) => i.active && i.share > 0);
  const totalShare = activeInvestors.reduce((acc, i) => acc + i.share, 0);
  if (totalShare <= 0 || distributableAmount <= 0) return [];

  const totalDistPaisa = toPaisa(distributableAmount);
  let distributedPaisaSum = 0;

  const results: PartnerShare[] = activeInvestors.map((inv) => {
    // Normalise share in case sum is not exactly 100
    const normalizedShare = inv.share / totalShare;
    const allocatedPaisa = Math.round(totalDistPaisa * normalizedShare);
    distributedPaisaSum += allocatedPaisa;

    return {
      investorId: inv.id,
      investorName: inv.name,
      sharePercent: Number(inv.share.toFixed(4)),
      allocatedAmount: fromPaisa(allocatedPaisa),
      withdrawnAmount: inv.withdrawals,
    };
  });

  // Reconcile 1-paisa rounding difference to the investor with highest share
  const diff = totalDistPaisa - distributedPaisaSum;
  if (diff !== 0 && results.length > 0) {
    results[0].allocatedAmount = fromPaisa(toPaisa(results[0].allocatedAmount) + diff);
  }

  return results;
}

export function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return `"${s.replaceAll('"', '""')}"`;
}

export interface CashBalanceSummary {
  totalInvestments: number; // মোট মূলধন
  totalSales: number; // মোট বিক্রয় রাজস্ব
  totalPurchases: number; // মোট ক্রয়
  totalExpenses: number; // পরিচালন খরচ
  totalWithdrawals: number; // মোট উত্তোলন
  totalLoans: number; // লোন
  totalSalesProfit: number; // বিক্রয় থেকে মোট লাভ
  totalCogs: number; // পণ্যের ক্রয় খরচ
  netProfit: number; // প্রকৃত নিট মুনাফা (বিক্রয়ের লাভ − খরচ)
  otherInflow: number;
  otherOutflow: number;
  availableCash: number; // নতুন ব্যালেন্স = মূলধন + নিট লাভ − উত্তোলন
}

// Calculate exact available balance following user's rule:
// "মুলধনের সাথে শুধু মাত্র লাভ টা যোগ হয়ে নতুন ব্যালেন্স হিসাব হবে।"
// (New Balance = Capital + Profit - Withdrawals)
export function calculateCashBalance(entries: Entry[], products: Product[] = []): CashBalanceSummary {
  const posted = entries.filter((e) => e.status === 'posted');
  let investmentsPaisa = 0;
  let salesPaisa = 0;
  let itemizedCogsPaisa = 0;
  let hasItemizedSales = false;
  let purchasesPaisa = 0;
  let expensesPaisa = 0;
  let withdrawalsPaisa = 0;
  let loansPaisa = 0;
  let otherInflowPaisa = 0;
  let otherOutflowPaisa = 0;

  const prodCostMap = new Map<string, number>();
  for (const p of products) {
    prodCostMap.set(p.id, p.averageCost || 0);
  }

  for (const e of posted) {
    const p = toPaisa(e.amount);
    switch (e.type) {
      case 'investment':
        investmentsPaisa += p;
        break;
      case 'sale':
        salesPaisa += p;
        if (e.grossProfit !== undefined && !isNaN(Number(e.grossProfit))) {
          const gp = toPaisa(e.grossProfit);
          itemizedCogsPaisa += Math.max(0, p - gp);
          hasItemizedSales = true;
        } else if (e.cogsAmount !== undefined && !isNaN(Number(e.cogsAmount))) {
          itemizedCogsPaisa += toPaisa(e.cogsAmount);
          hasItemizedSales = true;
        } else if (e.productId && e.quantity && prodCostMap.has(e.productId)) {
          const cost = toPaisa(e.quantity * (prodCostMap.get(e.productId) || 0));
          itemizedCogsPaisa += cost;
          hasItemizedSales = true;
        }
        break;
      case 'purchase':
        purchasesPaisa += p;
        break;
      case 'expense':
        expensesPaisa += p;
        break;
      case 'withdrawal':
        withdrawalsPaisa += p;
        break;
      case 'loan':
        loansPaisa += p;
        break;
      case 'other':
        if (e.amount >= 0) otherInflowPaisa += p;
        else otherOutflowPaisa += Math.abs(p);
        break;
    }
  }

  // Cost of goods sold & Gross Profit
  const finalCogsPaisa = hasItemizedSales ? itemizedCogsPaisa : purchasesPaisa;
  const grossProfitPaisa = salesPaisa - finalCogsPaisa;
  // Net Profit = Gross Profit - Operating Expenses
  const netProfitPaisa = grossProfitPaisa - expensesPaisa;

  // New Balance = Capital (Investments) + Net Profit - Withdrawals - Loans + Other net
  const availableCashPaisa =
    investmentsPaisa + netProfitPaisa - withdrawalsPaisa - Math.abs(loansPaisa) + (otherInflowPaisa - otherOutflowPaisa);

  return {
    totalInvestments: fromPaisa(investmentsPaisa),
    totalSales: fromPaisa(salesPaisa),
    totalPurchases: fromPaisa(purchasesPaisa),
    totalExpenses: fromPaisa(expensesPaisa),
    totalWithdrawals: fromPaisa(withdrawalsPaisa),
    totalLoans: fromPaisa(loansPaisa),
    totalSalesProfit: fromPaisa(grossProfitPaisa),
    totalCogs: fromPaisa(finalCogsPaisa),
    netProfit: fromPaisa(netProfitPaisa),
    otherInflow: fromPaisa(otherInflowPaisa),
    otherOutflow: fromPaisa(otherOutflowPaisa),
    availableCash: fromPaisa(availableCashPaisa),
  };
}

export interface PartnerAccountBalance extends InvestorLedgerItem {
  allocatedProfit: number;
  remainingProfit: number;
  accountBalance: number;
  withdrawableLimit: number;
}

// Calculate partner-by-partner account balances including allocated profits and withdrawable profit limit
// STRICT BUSINESS RULE: Invested capital (মূলধন / বিনিয়োগ) CANNOT be withdrawn. Only earned profit (লাভ) minus withdrawals can be withdrawn.
export function calculatePartnerAccountBalances(
  investors: Investor[],
  entries: Entry[],
  products: Product[] = []
): PartnerAccountBalance[] {
  const ledgers = shares(investors, entries);
  const finSummary = summary(entries, entries.length ? products : []);
  const netProfit = finSummary.netProfit;
  const cashSummary = calculateCashBalance(entries, products);

  return ledgers.map((inv) => {
    // Allocated profit according to ownership share percentage
    const allocatedProfit = Math.round(((netProfit * inv.share) / 100) * 100) / 100;
    // Remaining profit = Allocated Profit - Partner Withdrawals - Partner Loans (Loans auto-deducted from profit; Capital is locked)
    const remainingProfit = Math.round((allocatedProfit - inv.withdrawals - inv.loans) * 100) / 100;
    // Total Equity Account Balance = Locked Capital + Remaining Profit
    const accountBalance = Math.round((inv.capital + allocatedProfit - inv.withdrawals - inv.loans) * 100) / 100;
    // Withdrawable limit is strictly limited to positive remaining profit (NEVER includes capital), capped by available business cash
    const withdrawableProfitOnly = Math.max(0, remainingProfit);
    const withdrawableLimit = Math.max(0, Math.min(withdrawableProfitOnly, Math.max(0, cashSummary.availableCash)));

    return {
      ...inv,
      allocatedProfit,
      remainingProfit,
      accountBalance,
      withdrawableLimit,
    };
  });
}

export interface DailyFinancialBreakdown {
  date: string;
  isToday: boolean;
  isYesterday: boolean;
  sales: number;
  salesCount: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  purchases: number;
  investments: number;
  withdrawals: number;
  netProfit: number;
  totalEntriesCount: number;
  entries: Entry[];
}

export function calculateDailyBreakdowns(
  entries: Entry[],
  products: Product[] = [],
  todayStr: string,
  yesterdayStr: string
): DailyFinancialBreakdown[] {
  const posted = entries.filter((e) => e.status === 'posted');
  const prodCostMap = new Map<string, number>();
  for (const p of products) {
    prodCostMap.set(p.id, p.averageCost || 0);
  }

  const dateGroups = new Map<string, Entry[]>();
  // Always ensure Today is included in the breakdown list
  dateGroups.set(todayStr, []);

  for (const e of posted) {
    const d = e.date || todayStr;
    const list = dateGroups.get(d) || [];
    list.push(e);
    dateGroups.set(d, list);
  }

  const sortedDates = [...dateGroups.keys()].sort((a, b) => b.localeCompare(a));

  return sortedDates.map((date) => {
    const dayEntries = dateGroups.get(date) || [];
    let salesPaisa = 0;
    let salesCount = 0;
    let cogsPaisa = 0;
    let expensesPaisa = 0;
    let purchasesPaisa = 0;
    let investmentsPaisa = 0;
    let withdrawalsPaisa = 0;

    for (const e of dayEntries) {
      const amtPaisa = toPaisa(e.amount);
      if (e.type === 'sale') {
        salesPaisa += amtPaisa;
        salesCount += 1;
        if (e.grossProfit !== undefined && !isNaN(Number(e.grossProfit))) {
          const gp = toPaisa(e.grossProfit);
          cogsPaisa += Math.max(0, amtPaisa - gp);
        } else if (e.cogsAmount !== undefined && !isNaN(Number(e.cogsAmount))) {
          cogsPaisa += toPaisa(e.cogsAmount);
        } else if (e.productId && e.quantity && prodCostMap.has(e.productId)) {
          cogsPaisa += toPaisa(e.quantity * (prodCostMap.get(e.productId) || 0));
        }
      } else if (e.type === 'expense') {
        expensesPaisa += amtPaisa;
      } else if (e.type === 'purchase') {
        purchasesPaisa += amtPaisa;
      } else if (e.type === 'investment') {
        investmentsPaisa += amtPaisa;
      } else if (e.type === 'withdrawal') {
        withdrawalsPaisa += amtPaisa;
      }
    }

    const grossProfitPaisa = salesPaisa - cogsPaisa;
    const netProfitPaisa = grossProfitPaisa - expensesPaisa;

    return {
      date,
      isToday: date === todayStr,
      isYesterday: date === yesterdayStr,
      sales: fromPaisa(salesPaisa),
      salesCount,
      cogs: fromPaisa(cogsPaisa),
      grossProfit: fromPaisa(grossProfitPaisa),
      expenses: fromPaisa(expensesPaisa),
      purchases: fromPaisa(purchasesPaisa),
      investments: fromPaisa(investmentsPaisa),
      withdrawals: fromPaisa(withdrawalsPaisa),
      netProfit: fromPaisa(netProfitPaisa),
      totalEntriesCount: dayEntries.length,
      entries: dayEntries,
    };
  });
}