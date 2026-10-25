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

// Match an entry to an investor by exact ID, case-insensitive ID, or Rakib/Limon/partner name
export function matchInvestorIdForEntry(e: Entry, investors: Investor[]): string | null {
  if (!investors.length) return e.investorId || null;

  if (e.investorId) {
    const exact = investors.find((i) => i.id === e.investorId);
    if (exact) return exact.id;

    const lowerId = e.investorId.toLowerCase().trim();
    const caseInsensitive = investors.find((i) => i.id.toLowerCase().trim() === lowerId);
    if (caseInsensitive) return caseInsensitive.id;

    if (lowerId.includes('rakib') || lowerId.includes('রাকিব')) {
      const rakibInv = investors.find(
        (i) => i.name.toLowerCase().includes('rakib') || i.name.includes('রাকিব')
      );
      if (rakibInv) return rakibInv.id;
    }
    if (lowerId.includes('limon') || lowerId.includes('লিমন')) {
      const limonInv = investors.find(
        (i) => i.name.toLowerCase().includes('limon') || i.name.includes('লিমন')
      );
      if (limonInv) return limonInv.id;
    }
  }

  // Fallback for partner entries (investment / withdrawal / loan) where investorId wasn't linked
  if (e.type === 'investment' || e.type === 'withdrawal' || e.type === 'loan') {
    const combined = `${e.title || ''} ${e.notes || ''}`.toLowerCase();
    if (combined.includes('rakib') || combined.includes('রাকিব')) {
      const rakibInv = investors.find(
        (i) => i.name.toLowerCase().includes('rakib') || i.name.includes('রাকিব')
      );
      if (rakibInv) return rakibInv.id;
    }
    if (combined.includes('limon') || combined.includes('লিমন')) {
      const limonInv = investors.find(
        (i) => i.name.toLowerCase().includes('limon') || i.name.includes('লিমন')
      );
      if (limonInv) return limonInv.id;
    }
    for (const inv of investors) {
      if (inv.name && combined.includes(inv.name.toLowerCase())) {
        return inv.id;
      }
    }
  }

  return e.investorId || null;
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
    const matchedInvId = matchInvestorIdForEntry(e, investors);
    if (!matchedInvId || !capitalMap.has(matchedInvId)) continue;
    const paisa = toPaisa(e.amount);

    if (e.type === 'investment') {
      const cur = capitalMap.get(matchedInvId) || 0;
      capitalMap.set(matchedInvId, cur + paisa);
    } else if (e.type === 'withdrawal') {
      const cur = withdrawalMap.get(matchedInvId) || 0;
      withdrawalMap.set(matchedInvId, cur + paisa);
    } else if (e.type === 'loan') {
      const cur = loanMap.get(matchedInvId) || 0;
      loanMap.set(matchedInvId, cur + paisa);
    }
  }

  const totalCapitalPaisa = [...capitalMap.values()].reduce((sum, v) => sum + v, 0);
  const activeInvestors = investors.filter((inv) => inv.active !== false);
  const equalFallbackShare = activeInvestors.length > 0 ? 100 / activeInvestors.length : 0;

  return investors.map((inv) => {
    const capPaisa = capitalMap.get(inv.id) || 0;
    const withPaisa = withdrawalMap.get(inv.id) || 0;
    const loanPaisa = loanMap.get(inv.id) || 0;
    const share =
      totalCapitalPaisa > 0
        ? (capPaisa / totalCapitalPaisa) * 100
        : inv.active !== false
        ? (inv as any).equityShare ?? equalFallbackShare
        : 0;

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

// Compute weighted average inventory costing and stock balances from base product list + entries
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

// Compute total purchase cost without double-counting products that have both a 'purchase' entry and a 'sale' COGS entry
export function calculateTotalPurchaseCost(entries: Entry[], products: Product[] = []): number {
  const posted = entries.filter((e) => e.status === 'posted');
  const prodCostMap = new Map<string, number>();
  for (const p of products) {
    prodCostMap.set(p.id, p.averageCost || 0);
  }

  const purchasedProductIds = new Set<string>();
  let totalPurchasePaisa = 0;

  for (const e of posted) {
    if (e.type === 'purchase') {
      totalPurchasePaisa += toPaisa(e.amount);
      if (e.productId) {
        purchasedProductIds.add(e.productId);
      }
    }
  }

  // Include direct sale COGS only for sales that are NOT already covered by a product purchase entry
  for (const s of posted) {
    if (s.type !== 'sale') continue;
    if (s.productId && purchasedProductIds.has(s.productId)) {
      continue;
    }

    let saleCogsPaisa = 0;
    if (s.grossProfit !== undefined && !isNaN(Number(s.grossProfit))) {
      saleCogsPaisa = Math.max(0, toPaisa(s.amount) - toPaisa(s.grossProfit));
    } else if (s.cogsAmount !== undefined && !isNaN(Number(s.cogsAmount))) {
      saleCogsPaisa = toPaisa(s.cogsAmount);
    } else if (s.productId && s.quantity && prodCostMap.has(s.productId)) {
      saleCogsPaisa = toPaisa(s.quantity * (prodCostMap.get(s.productId) || 0));
    }

    // Only add standalone sale COGS if there are no unlinked general purchase entries, or if this sale has explicit cost
    if (saleCogsPaisa > 0) {
      totalPurchasePaisa += saleCogsPaisa;
    }
  }

  return fromPaisa(totalPurchasePaisa);
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
      const cogs = Math.max(0, toPaisa(s.amount) - gp);
      calculatedCogsPaisa += cogs;
      if (cogs > 0 || purchasesPaisa === 0) {
        hasItemizedSales = true;
      }
    } else if (s.cogsAmount !== undefined && !isNaN(Number(s.cogsAmount))) {
      const cogs = toPaisa(s.cogsAmount);
      calculatedCogsPaisa += cogs;
      if (cogs > 0 || purchasesPaisa === 0) {
        hasItemizedSales = true;
      }
    } else if (s.productId && s.quantity && prodCostMap.has(s.productId)) {
      const avgCost = prodCostMap.get(s.productId) || 0;
      const cogs = toPaisa(s.quantity * avgCost);
      calculatedCogsPaisa += cogs;
      if (cogs > 0 || purchasesPaisa === 0) {
        hasItemizedSales = true;
      }
    }
  }

  // If items weren't tracked with explicit cost and purchase entries exist, fall back to purchasesPaisa
  const finalCogsPaisa = hasItemizedSales ? calculatedCogsPaisa : purchasesPaisa;
  const grossProfitPaisa = salesPaisa - finalCogsPaisa;
  const netProfitPaisa = grossProfitPaisa - expensesPaisa;
  const roughNetProfitPaisa = salesPaisa - purchasesPaisa - expensesPaisa;

  // Live inventory value directly from current product stocks (since addEntry/removeEntry/voidPostedEntry already maintain p.currentStock)
  const liveInventoryValuePaisa = products.reduce(
    (acc, p) => acc + toPaisa((p.currentStock || 0) * (p.averageCost || 0)),
    0
  );

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
    inventoryValuation: fromPaisa(liveInventoryValuePaisa),
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
// (New Balance = Capital + Profit - Withdrawals - Loans)
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

  // First pass to know total purchasesPaisa
  for (const e of posted) {
    if (e.type === 'purchase') {
      purchasesPaisa += toPaisa(e.amount);
    }
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
          const cogs = Math.max(0, p - gp);
          itemizedCogsPaisa += cogs;
          if (cogs > 0 || purchasesPaisa === 0) {
            hasItemizedSales = true;
          }
        } else if (e.cogsAmount !== undefined && !isNaN(Number(e.cogsAmount))) {
          const cogs = toPaisa(e.cogsAmount);
          itemizedCogsPaisa += cogs;
          if (cogs > 0 || purchasesPaisa === 0) {
            hasItemizedSales = true;
          }
        } else if (e.productId && e.quantity && prodCostMap.has(e.productId)) {
          const cost = toPaisa(e.quantity * (prodCostMap.get(e.productId) || 0));
          itemizedCogsPaisa += cost;
          if (cost > 0 || purchasesPaisa === 0) {
            hasItemizedSales = true;
          }
        }
        break;
      case 'purchase':
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
// STRICT BUSINESS RULE: Invested capital (মূলধন / বিনিয়োগ) CANNOT be withdrawn. Only earned profit (লাভ) minus withdrawals/loans can be withdrawn.
export function calculatePartnerAccountBalances(
  investors: Investor[],
  entries: Entry[],
  products: Product[] = []
): PartnerAccountBalance[] {
  const ledgers = shares(investors, entries);
  const finSummary = summary(entries, entries.length ? products : []);
  const netProfitPaisa = toPaisa(finSummary.netProfit);
  const cashSummary = calculateCashBalance(entries, products);
  const availableCashPaisa = Math.max(0, toPaisa(cashSummary.availableCash));

  return ledgers.map((inv) => {
    const capPaisa = toPaisa(inv.capital);
    const withPaisa = toPaisa(inv.withdrawals);
    const loanPaisa = toPaisa(inv.loans);

    // Allocated profit according to ownership share percentage
    const allocatedProfitPaisa = Math.round((netProfitPaisa * inv.share) / 100);
    // Remaining profit = Allocated Profit - Partner Withdrawals - Partner Loans (Loans auto-deducted from profit; Capital is locked)
    const remainingProfitPaisa = allocatedProfitPaisa - withPaisa - loanPaisa;
    // Total Equity Account Balance = Locked Capital + Remaining Profit
    const accountBalancePaisa = capPaisa + remainingProfitPaisa;
    // Withdrawable limit is strictly limited to positive remaining profit (NEVER includes capital), capped by available business cash
    const withdrawableProfitOnlyPaisa = Math.max(0, remainingProfitPaisa);
    const withdrawableLimitPaisa = Math.max(0, Math.min(withdrawableProfitOnlyPaisa, availableCashPaisa));

    return {
      ...inv,
      allocatedProfit: fromPaisa(allocatedProfitPaisa),
      remainingProfit: fromPaisa(remainingProfitPaisa),
      accountBalance: fromPaisa(accountBalancePaisa),
      withdrawableLimit: fromPaisa(withdrawableLimitPaisa),
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
    let hasItemizedDaySales = false;
    let expensesPaisa = 0;
    let purchasesPaisa = 0;
    let investmentsPaisa = 0;
    let withdrawalsPaisa = 0;

    for (const e of dayEntries) {
      if (e.type === 'purchase') {
        purchasesPaisa += toPaisa(e.amount);
      }
    }

    for (const e of dayEntries) {
      const amtPaisa = toPaisa(e.amount);
      if (e.type === 'sale') {
        salesPaisa += amtPaisa;
        salesCount += 1;
        if (e.grossProfit !== undefined && !isNaN(Number(e.grossProfit))) {
          const gp = toPaisa(e.grossProfit);
          const cogs = Math.max(0, amtPaisa - gp);
          cogsPaisa += cogs;
          if (cogs > 0 || purchasesPaisa === 0) hasItemizedDaySales = true;
        } else if (e.cogsAmount !== undefined && !isNaN(Number(e.cogsAmount))) {
          const cogs = toPaisa(e.cogsAmount);
          cogsPaisa += cogs;
          if (cogs > 0 || purchasesPaisa === 0) hasItemizedDaySales = true;
        } else if (e.productId && e.quantity && prodCostMap.has(e.productId)) {
          const cogs = toPaisa(e.quantity * (prodCostMap.get(e.productId) || 0));
          cogsPaisa += cogs;
          if (cogs > 0 || purchasesPaisa === 0) hasItemizedDaySales = true;
        }
      } else if (e.type === 'expense') {
        expensesPaisa += amtPaisa;
      } else if (e.type === 'investment') {
        investmentsPaisa += amtPaisa;
      } else if (e.type === 'withdrawal' || e.type === 'loan') {
        withdrawalsPaisa += amtPaisa;
      }
    }

    const finalDayCogsPaisa = hasItemizedDaySales ? cogsPaisa : purchasesPaisa;
    const grossProfitPaisa = salesPaisa - finalDayCogsPaisa;
    const netProfitPaisa = grossProfitPaisa - expensesPaisa;

    return {
      date,
      isToday: date === todayStr,
      isYesterday: date === yesterdayStr,
      sales: fromPaisa(salesPaisa),
      salesCount,
      cogs: fromPaisa(finalDayCogsPaisa),
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

export type ProductPerformanceStatus =
  | 'high_margin'
  | 'steady'
  | 'stagnating'
  | 'low_margin'
  | 'out_of_stock';

export interface ProductProfitabilityItem {
  product: Product;
  salesCount: number;
  unitsSold: number;
  unitsPurchased: number;
  salesRevenue: number;
  cogs: number;
  grossProfit: number;
  realizedMarginPercent: number;
  unitMarginAmount: number;
  catalogMarginPercent: number;
  effectiveMarginPercent: number;
  currentStock: number;
  stockCostValue: number;
  potentialRevenueValue: number;
  potentialStockProfit: number;
  sellThroughRate: number;
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  status: ProductPerformanceStatus;
  statusLabelBn: string;
  stagnationReasonBn: string | null;
  recommendationBn: string;
  isStagnating: boolean;
  isTopMargin: boolean;
}

export interface ProductProfitabilitySummary {
  items: ProductProfitabilityItem[];
  highMarginItems: ProductProfitabilityItem[];
  stagnatingItems: ProductProfitabilityItem[];
  totalProductSalesRevenue: number;
  totalProductCogs: number;
  totalProductGrossProfit: number;
  overallProductMarginPercent: number;
  totalStagnantStockValue: number;
  totalActiveStockValue: number;
  unlinkedSalesRevenue: number;
  unlinkedSalesCogs: number;
  unlinkedSalesProfit: number;
  unlinkedSalesCount: number;
}

export function calculateProductProfitabilityReport(
  products: Product[],
  entries: Entry[],
  referenceDateStr?: string
): ProductProfitabilitySummary {
  const posted = entries.filter((e) => e.status === 'posted');
  const postedSales = posted.filter((e) => e.type === 'sale');
  const postedPurchases = posted.filter((e) => e.type === 'purchase');

  const refDate = referenceDateStr
    ? new Date(`${referenceDateStr}T12:00:00`)
    : new Date();
  const refTime = isNaN(refDate.getTime()) ? Date.now() : refDate.getTime();

  const matchedSaleIds = new Set<string>();

  // Helper to check if an entry belongs to a product
  const matchesProduct = (e: Entry, p: Product): boolean => {
    if (e.productId && e.productId === p.id) return true;
    if (!e.productId && p.name) {
      const titleLower = (e.title || '').toLowerCase();
      const nameLower = p.name.trim().toLowerCase();
      if (nameLower.length >= 2 && titleLower.includes(nameLower)) {
        return true;
      }
      if (p.sku && p.sku.trim().length >= 2 && titleLower.includes(p.sku.trim().toLowerCase())) {
        return true;
      }
    }
    return false;
  };

  let totalRevPaisa = 0;
  let totalCogsPaisa = 0;
  let totalStagnantStockPaisa = 0;
  let totalActiveStockPaisa = 0;

  const rawItems: ProductProfitabilityItem[] = products.map((product) => {
    const prodSales = postedSales.filter((e) => {
      const m = matchesProduct(e, product);
      if (m) matchedSaleIds.add(e.id);
      return m;
    });

    const prodPurchases = postedPurchases.filter((e) => matchesProduct(e, product));

    let salesRevPaisa = 0;
    let cogsPaisa = 0;
    let unitsSold = 0;
    let lastSaleDate: string | null = null;

    for (const s of prodSales) {
      const amtPaisa = toPaisa(s.amount);
      salesRevPaisa += amtPaisa;

      const qty =
        s.quantity !== undefined && Number(s.quantity) > 0
          ? Number(s.quantity)
          : product.sellingPrice > 0
          ? Math.max(1, Math.round(s.amount / product.sellingPrice))
          : 1;
      unitsSold += qty;

      let entryCogsPaisa = 0;
      if (s.grossProfit !== undefined && !isNaN(Number(s.grossProfit))) {
        entryCogsPaisa = Math.max(0, amtPaisa - toPaisa(s.grossProfit));
      } else if (s.cogsAmount !== undefined && !isNaN(Number(s.cogsAmount))) {
        entryCogsPaisa = toPaisa(s.cogsAmount);
      } else if (s.unitCost !== undefined && !isNaN(Number(s.unitCost))) {
        entryCogsPaisa = toPaisa(qty * Number(s.unitCost));
      } else {
        entryCogsPaisa = toPaisa(qty * (product.averageCost || 0));
      }
      cogsPaisa += entryCogsPaisa;

      if (s.date && (!lastSaleDate || s.date > lastSaleDate)) {
        lastSaleDate = s.date;
      }
    }

    let unitsPurchased = 0;
    for (const pur of prodPurchases) {
      const q =
        pur.quantity !== undefined && Number(pur.quantity) > 0
          ? Number(pur.quantity)
          : product.averageCost > 0
          ? Math.max(1, Math.round(pur.amount / product.averageCost))
          : 0;
      unitsPurchased += q;
    }

    const grossProfitPaisa = salesRevPaisa - cogsPaisa;
    const salesRevenue = fromPaisa(salesRevPaisa);
    const cogs = fromPaisa(cogsPaisa);
    const grossProfit = fromPaisa(grossProfitPaisa);

    const realizedMarginPercent =
      salesRevPaisa > 0 ? Number(((grossProfitPaisa / salesRevPaisa) * 100).toFixed(1)) : 0;

    const avgCost = product.averageCost || 0;
    const sellPrice = product.sellingPrice || 0;
    const unitMarginAmount = fromPaisa(toPaisa(sellPrice) - toPaisa(avgCost));
    const catalogMarginPercent =
      sellPrice > 0
        ? Number((((sellPrice - avgCost) / sellPrice) * 100).toFixed(1))
        : 0;

    const effectiveMarginPercent =
      prodSales.length > 0 ? realizedMarginPercent : catalogMarginPercent;

    const currentStock = Math.max(0, Number(product.currentStock) || 0);
    const stockCostPaisa = toPaisa(currentStock * avgCost);
    const stockCostValue = fromPaisa(stockCostPaisa);
    const potentialRevenueValue = fromPaisa(toPaisa(currentStock * sellPrice));
    const potentialStockProfit = fromPaisa(toPaisa(currentStock * Math.max(0, sellPrice - avgCost)));

    const totalHandledUnits = unitsSold + currentStock;
    const sellThroughRate =
      totalHandledUnits > 0
        ? Number(((unitsSold / totalHandledUnits) * 100).toFixed(1))
        : 0;

    let daysSinceLastSale: number | null = null;
    if (lastSaleDate) {
      const lastDateObj = new Date(`${lastSaleDate}T12:00:00`);
      if (!isNaN(lastDateObj.getTime())) {
        const diffDays = Math.floor((refTime - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));
        daysSinceLastSale = Math.max(0, diffDays);
      }
    }

    // Stagnation detection rules
    let isStagnating = false;
    let stagnationReasonBn: string | null = null;

    if (currentStock > 0) {
      if (prodSales.length === 0) {
        isStagnating = true;
        stagnationReasonBn = 'স্টকে মজুদ আছে কিন্তু এখনো কোনো বিক্রয় হয়নি (Zero Sales)';
      } else if (daysSinceLastSale !== null && daysSinceLastSale >= 14) {
        isStagnating = true;
        stagnationReasonBn = `গত ${toBengaliNumerals(daysSinceLastSale)} দিন ধরে কোনো বিক্রয় নেই`;
      } else if (sellThroughRate < 20 && currentStock >= 5) {
        isStagnating = true;
        stagnationReasonBn = `ধীরগতির বিক্রয় — মাত্র ${toBengaliNumerals(sellThroughRate)}% স্টক বিক্রি হয়েছে`;
      }
    }

    let status: ProductPerformanceStatus = 'steady';
    let statusLabelBn = 'স্বাভাবিক প্রবাহ';
    let recommendationBn = 'নিয়মিত স্টক ও বিক্রয় প্রবাহ বজায় রাখুন';

    if (currentStock <= 0) {
      status = 'out_of_stock';
      statusLabelBn = 'স্টক শেষ (Out of Stock)';
      recommendationBn =
        prodSales.length > 0 && effectiveMarginPercent >= 15
          ? 'চাহিদাসম্পন্ন লাভজনক পণ্য — দ্রুত পুনরায় স্টক (Restock) করুন'
          : 'প্রয়োজন অনুযায়ী স্টক пополন বিবেচনা করুন';
    } else if (isStagnating) {
      status = 'stagnating';
      statusLabelBn = 'অচল / ধীরগতি (Stagnating)';
      recommendationBn =
        stockCostValue >= 2000
          ? `৳${toBengaliNumerals(Math.round(stockCostValue))} মূলধন আটকে আছে — বিশেষ ছাড় বা বান্ডেল অফার দিয়ে স্টক ক্লিয়ার করুন`
          : 'প্রচারণা বাড়ান অথবা প্রাইসিং পুনর্বিবেচনা করুন';
    } else if (effectiveMarginPercent < 12 || grossProfit < 0) {
      status = 'low_margin';
      statusLabelBn = 'স্বল্প মার্জিন (Low Margin)';
      recommendationBn = 'বিক্রয়মূল্য সমন্বয় করুন অথবা কম ক্রয়মূল্যে সাপ্লায়ার খুঁজুন';
    } else if (effectiveMarginPercent >= 25 && (prodSales.length > 0 || catalogMarginPercent >= 25)) {
      status = 'high_margin';
      statusLabelBn = 'উচ্চ মুনাফা (High Margin)';
      recommendationBn = 'সর্বোচ্চ মুনাফাদায়ক পণ্য — স্টক পর্যাপ্ত রাখুন ও বিক্রয়ে অগ্রাধিকার দিন';
    }

    totalRevPaisa += salesRevPaisa;
    totalCogsPaisa += cogsPaisa;
    totalActiveStockPaisa += stockCostPaisa;
    if (isStagnating) {
      totalStagnantStockPaisa += stockCostPaisa;
    }

    return {
      product,
      salesCount: prodSales.length,
      unitsSold,
      unitsPurchased,
      salesRevenue,
      cogs,
      grossProfit,
      realizedMarginPercent,
      unitMarginAmount,
      catalogMarginPercent,
      effectiveMarginPercent,
      currentStock,
      stockCostValue,
      potentialRevenueValue,
      potentialStockProfit,
      sellThroughRate,
      lastSaleDate,
      daysSinceLastSale,
      status,
      statusLabelBn,
      stagnationReasonBn,
      recommendationBn,
      isStagnating,
      isTopMargin: false,
    };
  });

  // Mark top margin items (either status === 'high_margin' or top performers with positive margin)
  const sortedByMargin = [...rawItems]
    .filter((i) => i.effectiveMarginPercent > 0 && (i.salesCount > 0 || i.catalogMarginPercent >= 20))
    .sort((a, b) => {
      if (b.effectiveMarginPercent !== a.effectiveMarginPercent) {
        return b.effectiveMarginPercent - a.effectiveMarginPercent;
      }
      return b.grossProfit - a.grossProfit;
    });

  const topMarginIds = new Set(
    sortedByMargin
      .filter((i) => i.effectiveMarginPercent >= 20 || sortedByMargin.indexOf(i) < 3)
      .slice(0, 5)
      .map((i) => i.product.id)
  );

  const items = rawItems.map((item) => ({
    ...item,
    isTopMargin: topMarginIds.has(item.product.id),
  }));

  const highMarginItems = items
    .filter((i) => i.isTopMargin || i.status === 'high_margin')
    .sort((a, b) => b.effectiveMarginPercent - a.effectiveMarginPercent || b.grossProfit - a.grossProfit);

  const stagnatingItems = items
    .filter((i) => i.isStagnating)
    .sort((a, b) => b.stockCostValue - a.stockCostValue || a.sellThroughRate - b.sellThroughRate);

  // Calculate unlinked general sales (sales that were recorded without selecting a specific product)
  let unlinkedRevPaisa = 0;
  let unlinkedCogsPaisa = 0;
  let unlinkedCount = 0;

  for (const s of postedSales) {
    if (matchedSaleIds.has(s.id)) continue;
    unlinkedCount += 1;
    const amt = toPaisa(s.amount);
    unlinkedRevPaisa += amt;
    if (s.grossProfit !== undefined && !isNaN(Number(s.grossProfit))) {
      unlinkedCogsPaisa += Math.max(0, amt - toPaisa(s.grossProfit));
    } else if (s.cogsAmount !== undefined && !isNaN(Number(s.cogsAmount))) {
      unlinkedCogsPaisa += toPaisa(s.cogsAmount);
    }
  }

  const totalGrossProfitPaisa = totalRevPaisa - totalCogsPaisa;
  const overallProductMarginPercent =
    totalRevPaisa > 0 ? Number(((totalGrossProfitPaisa / totalRevPaisa) * 100).toFixed(1)) : 0;

  return {
    items,
    highMarginItems,
    stagnatingItems,
    totalProductSalesRevenue: fromPaisa(totalRevPaisa),
    totalProductCogs: fromPaisa(totalCogsPaisa),
    totalProductGrossProfit: fromPaisa(totalGrossProfitPaisa),
    overallProductMarginPercent,
    totalStagnantStockValue: fromPaisa(totalStagnantStockPaisa),
    totalActiveStockValue: fromPaisa(totalActiveStockPaisa),
    unlinkedSalesRevenue: fromPaisa(unlinkedRevPaisa),
    unlinkedSalesCogs: fromPaisa(unlinkedCogsPaisa),
    unlinkedSalesProfit: fromPaisa(unlinkedRevPaisa - unlinkedCogsPaisa),
    unlinkedSalesCount: unlinkedCount,
  };
}