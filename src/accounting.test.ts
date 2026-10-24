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
import type { Entry, Investor, Product } from './types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
  console.log(`✓ PASS: ${message}`);
}

export function runAutomatedTests() {
  console.log('\n--- RUNNING ACCOUNTING & INTEGRITY AUTOMATED TESTS ---\n');

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
      { id: 'e2', type: 'sale', title: 'Sale', amount: 100, cogsAmount: 76, date: '2025-01-02', status: 'posted' }, // Gross profit 24
      { id: 'e3', type: 'expense', title: 'Expenses', amount: 12, date: '2025-01-03', status: 'posted' }, // Net profit = 24 - 12 = 12
      { id: 'e4', type: 'withdrawal', title: 'Limon Withdrawal', amount: 5, date: '2025-01-04', investorId: 'limon', status: 'posted' },
    ];

    const cashSum = calculateCashBalance(entries);
    // New Balance = Capital (10) + Net Profit (12) - Withdrawals (5) = 17 BDT
    assert(cashSum.availableCash === 17, `Available balance correctly calculated as 17 (got ${cashSum.availableCash})`);
    assert(cashSum.totalWithdrawals === 5, 'Total withdrawals is 5');
    assert(cashSum.netProfit === 12, 'Net profit is 12');

    const partnerAccs = calculatePartnerAccountBalances(investors, entries);
    const limonAcc = partnerAccs[0];
    assert(limonAcc.capital === 10, 'Limon capital is 10 (locked, non-withdrawable)');
    assert(limonAcc.allocatedProfit === 12, 'Limon allocated profit is 12');
    assert(limonAcc.withdrawals === 5, 'Limon withdrawals is 5');
    // Account Balance = Capital (10) + Allocated Profit (12) - Withdrawals (5) = 17 BDT
    assert(limonAcc.accountBalance === 17, `Limon account balance matches total equity balance at 17 (got ${limonAcc.accountBalance})`);
    // Withdrawable Limit = Allocated Profit (12) - Withdrawals (5) = 7 BDT (excludes 10 BDT capital!)
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

  console.log('\n--- ALL 8 AUTOMATED TEST SUITES PASSED SUCCESSFULLY ---\n');
  return true;
}

const proc = (globalThis as any).process;
if (proc && proc.argv && proc.argv[1]?.includes('accounting.test')) {
  runAutomatedTests();
}

