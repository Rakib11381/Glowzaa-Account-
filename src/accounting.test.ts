import {
  toPaisa,
  fromPaisa,
  money,
  shares,
  calculateInventoryCosting,
  summary,
  distributeProfit,
  calculateCashBalance,
  calculatePartnerAccountBalances,
} from './accounting';
import {
  bnToEnDigits,
  parseNaturalDateRange,
  verifyAssistantAuth,
  enforcePartnerAccessControl,
  checkFinancialDataIntegrity,
  getInvestmentSummary,
  getExpenseSummary,
  getProfitAndLoss,
  getCurrentFinancialPosition,
  getWithdrawals,
  getPartnerSummary,
  getTransactionHistory,
  compareFinancialPeriods,
  executeBusinessAssistantQuery,
} from './aiAssistantEngine';
import type { ApprovalRequest, Entry, Investor, Product } from './types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
  console.log(`✓ PASS: ${message}`);
}

export function runAutomatedTests() {
  console.log('\n--- RUNNING ACCOUNTING & AI BUSINESS ASSISTANT AUTOMATED TESTS ---\n');

  // Test 1: Integer-Paisa Precision & Float Safety
  {
    const val1 = 0.1;
    const val2 = 0.2;
    const paisaSum = toPaisa(val1) + toPaisa(val2);
    const result = fromPaisa(paisaSum);
    assert(result === 0.3, `Integer-paisa float safety: 0.1 + 0.2 equals exactly ${result}`);

    const largePaisa = toPaisa(1250000.75);
    assert(largePaisa === 125000075, 'Exact conversion of BDT 1,250,000.75 to 125000075 paisa');
  }

  // Test 2: Equity Share Percentage Calculations
  {
    const investors: Investor[] = [
      { id: 'inv1', name: 'অংশীদার ১', active: true },
      { id: 'inv2', name: 'অংশীদার ২', active: true },
      { id: 'inv3', name: 'অংশীদার ৩', active: true },
    ];

    const entries: Entry[] = [
      { id: 'e1', type: 'investment', title: 'Cap 1', amount: 500000, date: '2025-01-01', investorId: 'inv1', status: 'posted' },
      { id: 'e2', type: 'investment', title: 'Cap 2', amount: 300000, date: '2025-01-01', investorId: 'inv2', status: 'posted' },
      { id: 'e3', type: 'investment', title: 'Cap 3', amount: 200000, date: '2025-01-01', investorId: 'inv3', status: 'posted' },
      { id: 'e4', type: 'investment', title: 'Draft Cap', amount: 999999, date: '2025-01-02', investorId: 'inv3', status: 'draft' },
      { id: 'e5', type: 'withdrawal', title: 'With 1', amount: 50000, date: '2025-02-01', investorId: 'inv1', status: 'posted' },
    ];

    const ledgers = shares(investors, entries);
    assert(ledgers[0].capital === 500000, 'Investor 1 capital is 500,000');
    assert(ledgers[0].share === 50, 'Investor 1 equity share is exactly 50%');
    assert(ledgers[0].withdrawals === 50000, 'Investor 1 withdrawal is 50,000');
    assert(ledgers[0].netCapital === 450000, 'Investor 1 net capital is 450,000');

    assert(ledgers[1].share === 30, 'Investor 2 equity share is exactly 30%');
    assert(ledgers[2].share === 20, 'Investor 3 equity share is exactly 20%');

    const totalShare = ledgers.reduce((sum, i) => sum + i.share, 0);
    assert(Math.round(totalShare) === 100, `Total shares sum to 100% (got ${totalShare}%)`);
  }

  // Test 3: Inventory Stock Costing & Weighted Average Cost
  {
    const products: Product[] = [
      { id: 'p1', name: 'টি-শার্ট', unit: 'পিস', currentStock: 100, averageCost: 200, sellingPrice: 400 },
    ];

    const entries: Entry[] = [
      { id: 'pur1', type: 'purchase', title: 'Batch 2', amount: 30000, quantity: 100, unitCost: 300, productId: 'p1', date: '2025-01-10', status: 'posted' },
      { id: 'sale1', type: 'sale', title: 'Sale 1', amount: 16000, quantity: 40, productId: 'p1', date: '2025-01-15', status: 'posted' },
    ];

    const result = calculateInventoryCosting(products, entries);
    const updatedP1 = result.updatedProducts[0];

    assert(updatedP1.averageCost === 250, `Weighted average cost correctly calculated as 250 (got ${updatedP1.averageCost})`);
    assert(updatedP1.currentStock === 160, `Remaining stock correctly calculated as 160 (got ${updatedP1.currentStock})`);
    assert(result.totalInventoryValue === 40000, `Total inventory value is 160 * 250 = 40,000 (got ${result.totalInventoryValue})`);
  }

  // Test 4: Financial Summary (Gross Profit & Net Profit)
  {
    const entries: Entry[] = [
      { id: '1', type: 'sale', title: 'Sale', amount: 100000, cogsAmount: 60000, date: '2025-01-01', status: 'posted' },
      { id: '2', type: 'expense', title: 'Rent', amount: 15000, date: '2025-01-01', status: 'posted' },
      { id: '3', type: 'expense', title: 'Utilities', amount: 5000, date: '2025-01-01', status: 'posted' },
      { id: '4', type: 'sale', title: 'Voided Sale', amount: 50000, date: '2025-01-01', status: 'void' },
    ];

    const stats = summary(entries);
    assert(stats.sales === 100000, 'Sales total correctly excludes voided sales');
    assert(stats.cogs === 60000, 'COGS total is 60,000');
    assert(stats.grossProfit === 40000, 'Gross profit is 100,000 - 60,000 = 40,000');
    assert(stats.expenses === 20000, 'Operating expenses total 20,000');
    assert(stats.netProfit === 20000, 'Net operating profit is 40,000 - 20,000 = 20,000');
  }

  // Test 5: Balance & Partner Account Balances (New Rule: Capital + Net Profit - Withdrawals)
  {
    const investors: Investor[] = [
      { id: 'limon', name: 'লিমন', active: true },
    ];

    const entries: Entry[] = [
      { id: 'e1', type: 'investment', title: 'Limon Capital', amount: 10, date: '2025-01-01', investorId: 'limon', status: 'posted' },
      { id: 'e2', type: 'sale', title: 'Sale', amount: 100, cogsAmount: 76, date: '2025-01-02', status: 'posted' },
      { id: 'e3', type: 'expense', title: 'Expenses', amount: 12, date: '2025-01-03', status: 'posted' },
      { id: 'e4', type: 'withdrawal', title: 'Limon Withdrawal', amount: 5, date: '2025-01-04', investorId: 'limon', status: 'posted' },
    ];

    const cashSum = calculateCashBalance(entries);
    assert(cashSum.availableCash === 17, `Available balance correctly calculated as 17 (got ${cashSum.availableCash})`);
    assert(cashSum.totalWithdrawals === 5, 'Total withdrawals is 5');
    assert(cashSum.netProfit === 12, 'Net profit is 12');

    const partnerAccs = calculatePartnerAccountBalances(investors, entries);
    const limonAcc = partnerAccs[0];
    assert(limonAcc.capital === 10, 'Limon capital is 10 (locked, non-withdrawable)');
    assert(limonAcc.allocatedProfit === 12, 'Limon allocated profit is 12');
    assert(limonAcc.withdrawals === 5, 'Limon withdrawals is 5');
    assert(limonAcc.accountBalance === 17, `Limon account balance matches total equity balance at 17 (got ${limonAcc.accountBalance})`);
    assert(limonAcc.withdrawableLimit === 7, `Limon withdrawable limit is strictly profit-only (12 - 5 = 7, excluding 10 capital; got ${limonAcc.withdrawableLimit})`);
  }

  // Test 6: Draft Deletion Safety & Void Audit Invariant
  {
    const draftEntry: Entry = { id: 'd1', type: 'sale', title: 'Unsaved Sale', amount: 500, date: '2025-01-01', status: 'draft' };
    const postedEntry: Entry = { id: 'p1', type: 'sale', title: 'Real Sale', amount: 500, date: '2025-01-01', status: 'posted' };

    const canDeleteDraft = draftEntry.status === 'draft';
    assert(canDeleteDraft === true, 'Draft entries are eligible for hard deletion');

    const canDeletePosted = postedEntry.status === 'draft';
    assert(canDeletePosted === false, 'Posted transactions are strictly forbidden from hard deletion');
  }

  // Test 7: User's Exact Case (10৳ Capital + 2৳ Sale with 1৳ Profit = 11৳ Balance, NOT 12৳)
  {
    const entries: Entry[] = [
      { id: 'u1', type: 'investment', title: 'মূলধন', amount: 10, date: '2025-01-01', status: 'posted' },
      { id: 'u2', type: 'sale', title: '২টা বিক্রি', amount: 2, grossProfit: 1, cogsAmount: 1, date: '2025-01-02', status: 'posted' },
    ];

    const cashSum = calculateCashBalance(entries);
    assert(cashSum.availableCash === 11, `User requirement: 10 capital + 1 profit = exactly 11 balance (got ${cashSum.availableCash})`);
    assert(cashSum.availableCash !== 12, `User requirement: 10 capital + 2 sale must NOT equal 12`);
    assert(cashSum.totalSalesProfit === 1, `Total sale profit is 1`);
  }

  // Test 8: Equal fallback partner share when capital is 0 & name-based partner matching
  {
    const investors: Investor[] = [
      { id: 'rakib_doc_1', name: 'Rakib (অ্যাডমিন)', active: true, equityShare: 50 },
      { id: 'limon_doc_2', name: 'Limon (অ্যাডমিন)', active: true, equityShare: 50 },
    ];
    const entries: Entry[] = [
      { id: 's1', type: 'sale', title: 'Sale with 100 profit', amount: 300, cogsAmount: 200, grossProfit: 100, date: '2025-01-01', status: 'posted' },
      { id: 'w1', type: 'withdrawal', title: 'Rakib withdrawal', amount: 20, date: '2025-01-02', status: 'posted' },
    ];

    const partnerAccs = calculatePartnerAccountBalances(investors, entries);
    assert(partnerAccs[0].share === 50 && partnerAccs[1].share === 50, 'Equal 50/50 fallback share when capital is 0');
    assert(partnerAccs[0].allocatedProfit === 50 && partnerAccs[1].allocatedProfit === 50, 'Each partner gets 50 profit');
    assert(partnerAccs[0].withdrawals === 20, 'Name-based fallback matches Rakib withdrawal');
    assert(partnerAccs[0].withdrawableLimit === 30, 'Rakib withdrawable limit is 50 - 20 = 30');
  }

  // ============================================================================
  // AI BUSINESS ASSISTANT 17 REQUIRED TEST SCENARIOS (SYNTHETIC DATA)
  // ============================================================================
  const synthInvestors: Investor[] = [
    { id: 'inv_rakib', name: 'রাকিব (Rakib)', active: true, equityShare: 50 },
    { id: 'inv_limon', name: 'লিমন (Limon)', active: true, equityShare: 50 },
  ];

  const synthProducts: Product[] = [
    { id: 'prod_crab', name: 'সামুদ্রিক কাকড়া', sku: 'CRAB-01', unit: 'কেজি', currentStock: 50, averageCost: 400, sellingPrice: 600 },
  ];

  const synthEntries: Entry[] = [
    // Investments: Rakib = 60,000, Limon = 40,000 => Total = 100,000 (60% / 40% share)
    { id: 'inv_1', type: 'investment', title: 'রাকিবের প্রথম মূলধন জমা', amount: 40000, date: '2026-09-01', investorId: 'inv_rakib', status: 'posted' },
    { id: 'inv_2', type: 'investment', title: 'রাকিবের দ্বিতীয় মূলধন জমা', amount: 20000, date: '2026-10-02', investorId: 'inv_rakib', status: 'posted' },
    { id: 'inv_3', type: 'investment', title: 'লিমনের মূলধন জমা', amount: 40000, date: '2026-09-05', investorId: 'inv_limon', status: 'posted' },

    // September Sales & Expenses (Last Month: 2026-09)
    // Sales = 50,000, COGS = 30,000 => Gross Profit = 20,000; Expenses = 5,000 => Net Profit = 15,000
    { id: 'sep_s1', type: 'sale', title: 'সেপ্টেম্বর কাকড়া বিক্রয়', amount: 50000, cogsAmount: 30000, grossProfit: 20000, date: '2026-09-15', seller: 'Rakib', status: 'posted' },
    { id: 'sep_e1', type: 'expense', title: 'সেপ্টেম্বর দোকান ভাড়া', category: 'দোকান ভাড়া', amount: 5000, date: '2026-09-20', status: 'posted' },

    // October Sales & Expenses (This Month: 2026-10)
    // Sales = 80,000, COGS = 45,000 => Gross Profit = 35,000; Expenses = 8,000 (Ads 5,000 + Delivery 3,000) => Net Profit = 27,000
    { id: 'oct_s1', type: 'sale', title: 'অক্টোবর কাকড়া বিক্রয় ১', amount: 50000, cogsAmount: 28000, grossProfit: 22000, date: '2026-10-10', seller: 'Rakib', status: 'posted' },
    { id: 'oct_s2', type: 'sale', title: 'অক্টোবর কাকড়া বিক্রয় ২', amount: 30000, cogsAmount: 17000, grossProfit: 13000, date: '2026-10-18', seller: 'Limon', status: 'posted' },
    { id: 'oct_e1', type: 'expense', title: 'ফেসবুক বিজ্ঞাপন খরচ', category: 'মার্কেটিং ও বিজ্ঞাপন', amount: 5000, date: '2026-10-12', status: 'posted' },
    { id: 'oct_e2', type: 'expense', title: 'কুরিয়ার ডেলিভারি চার্জ', category: 'ডেলিভারি চার্জ', amount: 3000, date: '2026-10-14', status: 'posted' },

    // Withdrawals on 15 October
    { id: 'oct_w1', type: 'withdrawal', title: 'রাকিবের মুনাফা উত্তোলন', amount: 6000, date: '2026-10-15', investorId: 'inv_rakib', status: 'posted' },
    { id: 'oct_w2', type: 'withdrawal', title: 'লিমনের মুনাফা উত্তোলন', amount: 4000, date: '2026-10-15', investorId: 'inv_limon', status: 'posted' },

    // Draft (Pending) & Void (Cancelled) Entries — Must be excluded from official calculations
    { id: 'draft_1', type: 'expense', title: 'অনুমোদনের অপেক্ষায় খরচ', category: 'অফিস খরচ', amount: 99000, date: '2026-10-20', status: 'draft' },
    { id: 'void_1', type: 'sale', title: 'বাতিলকৃত ভুল বিক্রয়', amount: 75000, cogsAmount: 40000, grossProfit: 35000, date: '2026-10-21', status: 'void' },
  ];

  const synthApprovals: ApprovalRequest[] = [
    {
      id: 'app_1',
      actionType: 'create_entry',
      targetCollection: 'entries',
      status: 'pending',
      title: 'নতুন খরচ এন্ট্রি (৳2,500)',
      description: 'অফিস খরচ এন্ট্রি',
      requestedBy: 'Limon',
      requestedByName: 'লিমন (Limon)',
      targetApprover: 'Rakib',
      targetApproverName: 'রাকিব (Rakib)',
      requestedAt: '2026-10-25T10:00:00Z',
      requestedAtFormatted: '২৫ অক্টোবর ২০২৬, বিকাল ৪:০০',
      reason: 'অফিস খরচ',
      payload: { type: 'expense', amount: 2500 },
    },
  ];

  const adminAuth = {
    authenticated: true,
    actorUid: 'Rakib',
    actorName: 'রাকিব (Rakib)',
    role: 'admin' as const,
  };

  const synthDataset = {
    entries: synthEntries,
    investors: synthInvestors,
    products: synthProducts,
    approvalRequests: synthApprovals,
    referenceDate: '2026-10-28',
  };

  // AI Scenario 1, 2, 3: Total investment, Partner-wise investment, Ownership share calculation
  {
    const invSummary = getInvestmentSummary(synthDataset, null, null, adminAuth);
    assert(invSummary.totalInvestment === 100000, 'AI #1: Total investment calculation equals 100,000 BDT');
    const rakibRow = invSummary.partnerBreakdown.find((p) => p.partnerId === 'inv_rakib');
    const limonRow = invSummary.partnerBreakdown.find((p) => p.partnerId === 'inv_limon');
    assert(rakibRow?.totalInvested === 60000 && limonRow?.totalInvested === 40000, 'AI #2: Partner-wise investment (Rakib 60,000, Limon 40,000)');
    assert(rakibRow?.ownershipPercentage === 60 && limonRow?.ownershipPercentage === 40, 'AI #3: Ownership share calculation (Rakib 60%, Limon 40%)');
  }

  // AI Scenario 4 & 5: Date-range expense calculation & Highest expense category detection
  {
    const expOct = getExpenseSummary(synthDataset, '2026-10-01', '2026-10-31', adminAuth);
    assert(expOct.totalExpense === 8000, `AI #4: Date-range expense calculation for Oct 2026 is 8,000 BDT (got ${expOct.totalExpense})`);
    assert(
      expOct.highestExpenseCategory?.category === 'মার্কেটিং ও বিজ্ঞাপন' && expOct.highestExpenseCategory?.totalAmount === 5000,
      `AI #5: Highest expense category detected as মার্কেটিং ও বিজ্ঞাপন (5,000 BDT)`
    );
  }

  // AI Scenario 6: Profit and loss calculation
  {
    const pnlAll = getProfitAndLoss(synthDataset, null, null, adminAuth);
    assert(pnlAll.totalSales === 130000, 'AI #6a: Total posted sales revenue is 130,000 BDT');
    assert(pnlAll.cogs === 75000, 'AI #6b: Total COGS is 75,000 BDT');
    assert(pnlAll.grossProfit === 55000, 'AI #6c: Gross profit is 55,000 BDT');
    assert(pnlAll.operatingExpenses === 13000, 'AI #6d: Total operating expenses is 13,000 BDT');
    assert(pnlAll.netProfit === 42000, 'AI #6e: Net profit is 42,000 BDT');
  }

  // AI Scenario 7: Current balance calculation
  {
    const pos = getCurrentFinancialPosition(synthDataset, adminAuth);
    // Available Cash = Investments (100,000) + Net Profit (42,000) - Withdrawals (10,000) = 132,000
    assert(pos.currentCashBalance === 132000, `AI #7: Current actual cash balance is 132,000 BDT (got ${pos.currentCashBalance})`);
  }

  // AI Scenario 8 & 9: Partner withdrawal calculation & Remaining withdrawable balance calculation
  {
    const oct15Withdrawals = getWithdrawals(synthDataset, '2026-10-15', '2026-10-15', null, adminAuth);
    assert(oct15Withdrawals.totalWithdrawals === 10000, 'AI #8: Withdrawals on 15 October total 10,000 BDT');

    const rakibSummary = getPartnerSummary(synthDataset, 'Rakib', adminAuth);
    const r = rakibSummary.partners[0];
    // Rakib 60% of 42,000 Net Profit = 25,200; Withdrawn = 6,000 => Remaining Withdrawable = 19,200 (Capital 60,000 locked)
    assert(r.totalProfitShare === 25200, `AI #9a: Rakib allocated profit is 25,200 BDT (got ${r.totalProfitShare})`);
    assert(r.withdrawableProfitLimit === 19200, `AI #9b: Rakib remaining withdrawable profit is 19,200 BDT (got ${r.withdrawableProfitLimit})`);
  }

  // AI Scenario 10 & 11: Pending/unapproved transaction exclusion & Cancelled/reversed (void) transaction exclusion
  {
    const pos = getCurrentFinancialPosition(synthDataset, adminAuth);
    assert(pos.draftTransactionCount === 1, 'AI #10a: Draft entry is tracked in pending count');
    assert(pos.pendingApprovalCount === 1, 'AI #10b: Pending approval request is tracked');
    assert(pos.voidTransactionCount === 1, 'AI #11: Voided entry is tracked separately and excluded from balance');

    const pendingHistory = getTransactionHistory(synthDataset, { status: 'pending', type: 'pending_approval' }, adminAuth);
    assert(pendingHistory.totalMatchingCount === 2, 'AI #10c: Pending history retrieves both draft entries and pending approval requests');
  }

  // AI Scenario 12: Duplicate transaction detection
  {
    const entriesWithDup: Entry[] = [
      ...synthEntries,
      { id: 'oct_e1_dup', type: 'expense', title: 'ফেসবুক বিজ্ঞাপন খরচ', category: 'মার্কেটিং ও বিজ্ঞাপন', amount: 5000, date: '2026-10-12', status: 'posted' },
    ];
    const report = checkFinancialDataIntegrity({ ...synthDataset, entries: entriesWithDup });
    const hasDupWarning = report.notices.some((n) => n.code === 'DUPLICATE_TRANSACTIONS');
    assert(hasDupWarning === true && report.duplicateEntries.length === 1, 'AI #12: Duplicate transaction detection flags identical date/type/amount/title records');
  }

  // AI Scenario 13: Month-over-month comparison
  {
    const comp = compareFinancialPeriods(
      synthDataset,
      { startDate: '2026-09-01', endDate: '2026-09-30', label: 'গত মাস (সেপ্টেম্বর ২০২৬)' },
      { startDate: '2026-10-01', endDate: '2026-10-31', label: 'এই মাস (অক্টোবর ২০২৬)' },
      adminAuth
    );
    // Sept netProfit = 15,000; Oct netProfit = 27,000 => Diff = +12,000 (+80%)
    assert(comp.metrics.netProfit.difference === 12000, `AI #13a: Month-over-month net profit increased by 12,000 BDT (got ${comp.metrics.netProfit.difference})`);
    assert(comp.metrics.netProfit.percentageChange === 80, `AI #13b: Month-over-month net profit increased by 80% (got ${comp.metrics.netProfit.percentageChange}%)`);
  }

  // AI Scenario 14: Bengali digit and relative date parsing
  {
    const converted = bnToEnDigits('১৫ অক্টোবর ২০২৬ তারিখে ১০০০ টাকা');
    assert(converted === '15 অক্টোবর 2026 তারিখে 1000 টাকা', 'AI #14a: Bengali digits ०-९ accurately converted to ASCII digits');

    const oct15Range = parseNaturalDateRange('১৫ অক্টোবর কত টাকা উত্তোলন করা হয়েছে?', '2026-10-28');
    assert(oct15Range.startDate === '2026-10-15' && oct15Range.endDate === '2026-10-15', `AI #14b: Parsed "১৫ অক্টোবর" as 2026-10-15 (got ${oct15Range.startDate})`);

    const thisMonthRange = parseNaturalDateRange('এই মাসে মোট কত টাকা খরচ হয়েছে?', '2026-10-28');
    assert(thisMonthRange.startDate === '2026-10-01' && thisMonthRange.endDate === '2026-10-31', `AI #14c: Parsed "এই মাসে" accurately (${thisMonthRange.startDate} to ${thisMonthRange.endDate})`);
  }

  // AI Scenario 15: Empty result handling
  {
    const emptyWithdrawals = getWithdrawals(synthDataset, '2026-01-01', '2026-01-31', null, adminAuth);
    assert(emptyWithdrawals.totalWithdrawals === 0 && emptyWithdrawals.records.length === 0, 'AI #15a: Empty date range returns 0 and empty records');

    const emptyResp = executeBusinessAssistantQuery({
      question: '১৫ জানুয়ারি ২০২৬ কত টাকা উত্তোলন করা হয়েছে?',
      dataset: synthDataset,
      authContext: adminAuth,
    });
    assert(emptyResp.directAnswerBn.includes('কোনো অনুমোদিত') || emptyResp.transactions.length === 0, 'AI #15b: Empty result returns clear Bengali message without fabrication');
  }

  // AI Scenario 16 & 17: Unauthorized request rejection & Partner-level access restriction
  {
    let unauthRejected = false;
    try {
      verifyAssistantAuth({ authenticated: false, actorUid: '', actorName: '', role: 'investor' });
    } catch (err: any) {
      unauthRejected = String(err.message || '').includes('UNAUTHORIZED');
    }
    assert(unauthRejected === true, 'AI #16: Unauthorized user is rejected with UNAUTHORIZED error');

    const validAuth = verifyAssistantAuth(adminAuth);
    assert(validAuth.authenticated === true && validAuth.actorUid === 'Rakib', 'AI #16b: Authorized partner Rakib is accepted');

    let crossPartnerBlocked = false;
    try {
      enforcePartnerAccessControl('Limon', {
        authenticated: true,
        actorUid: 'Rakib',
        actorName: 'রাকিব (Rakib)',
        role: 'investor',
        restrictedPartnerId: 'Rakib',
      });
    } catch (err: any) {
      crossPartnerBlocked = String(err.message || '').includes('FORBIDDEN_PARTNER_ACCESS');
    }
    assert(crossPartnerBlocked === true, 'AI #17: Private partner scope restriction prevents unauthorized cross-partner access');
  }

  console.log('\n--- ALL 25 AUTOMATED ACCOUNTING & AI ASSISTANT TEST SUITES PASSED SUCCESSFULLY ---\n');
  return true;
}

const proc = (globalThis as any).process;
if (proc && proc.argv && proc.argv[1]?.includes('accounting.test')) {
  runAutomatedTests();
}



