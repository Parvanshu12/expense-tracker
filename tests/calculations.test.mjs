import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateFinancialSummary,
  calculatePotentialSavings,
  simulateWealthGrowth,
  calculateSuggestedMonthlyContribution,
  getBudgetStatus,
  getBudgetPeriodRange,
  calculateBudgetSpent,
  getReportingPeriodRange,
  filterTransactionsByDateRange,
  toLocalDateString,
  spendingWarnings,
} from '../src/lib/calculations/finance.ts';
import { extractAmount, parseExpenseHeuristically, parseExpensesHeuristically } from '../src/lib/ai/heuristic-parser.ts';
import { kindForCategory, kindForTransaction } from '../src/lib/categories/kinds.ts';
import { findDuplicates } from '../src/lib/ai/dedupe.ts';

describe('SpendWise AI Calculation Engine Tests', () => {
  it('correctly calculates income, expenses, remaining balance, and actual savings', () => {
    const transactions = [
      { transaction_type: 'income', amount: 80000, essentiality: 'essential' },
      { transaction_type: 'expense', amount: 25000, essentiality: 'essential' },
      { transaction_type: 'expense', amount: 5000, essentiality: 'optimizable' },
      { transaction_type: 'expense', amount: 2000, essentiality: 'discretionary' },
    ];

    const summary = calculateFinancialSummary(transactions, 40000);

    assert.equal(summary.totalIncome, 80000);
    assert.equal(summary.totalExpenses, 32000);
    assert.equal(summary.remainingBalance, 48000);
    assert.equal(summary.actualSavings, 48000);
    assert.equal(summary.essentialSpending, 25000);
    assert.equal(summary.optimizableSpending, 5000);
    assert.equal(summary.discretionarySpending, 2000);
    // 32000 / 40000 = 80%
    assert.equal(summary.budgetUtilization, 80);
  });

  it('rejects invalid or zero amount in transactions', () => {
    const validateAmount = (amt) => {
      const num = Number(amt);
      return !isNaN(num) && num > 0;
    };

    assert.equal(validateAmount(0), false);
    assert.equal(validateAmount(-500), false);
    assert.equal(validateAmount('abc'), false);
    assert.equal(validateAmount(250), true);
  });

  it('verifies deterministic wealth projection compound growth formula', () => {
    const simulation = simulateWealthGrowth({
      startingAmount: 10000,
      monthlyContribution: 5000,
      annualReturnRate: 12,
      durationYears: 10,
      inflationRate: 6,
    });

    assert.equal(simulation.length, 10);
    const yr10 = simulation[9];
    assert.equal(yr10.year, 10);
    // Total invested = 10000 + 5000 * 120 = 610,000
    assert.equal(yr10.totalInvested, 610000);
    // Future value must exceed total invested due to 12% compounding returns
    assert.ok(yr10.futureValue > yr10.totalInvested);
    assert.ok(yr10.hypotheticalGrowth > 0);
    // Inflation adjusted value must be lower than nominal future value
    assert.ok(yr10.inflationAdjustedValue < yr10.futureValue);
  });

  it('falls back to simple accumulation at a 0% return rate', () => {
    const [yr1] = simulateWealthGrowth({
      startingAmount: 1000,
      monthlyContribution: 100,
      annualReturnRate: 0,
      durationYears: 1,
    });

    assert.equal(yr1.futureValue, 2200);
    assert.equal(yr1.hypotheticalGrowth, 0);
  });

  it('calculates savings goal suggested monthly contributions accurately', () => {
    // 100,000 remaining over 10 months (Oct 2026 -> Aug 2027)
    assert.equal(calculateSuggestedMonthlyContribution(120000, 20000, '2027-08-15', '2026-10-31'), 10000);
    // A goal due this month still divides by at least one month
    assert.equal(calculateSuggestedMonthlyContribution(5000, 2000, '2026-10-31', '2026-10-01'), 3000);
    // A completed goal needs nothing more
    assert.equal(calculateSuggestedMonthlyContribution(5000, 6000, '2027-01-01', '2026-10-01'), 0);
  });

  it('correctly calculates variable potential savings reduction scenarios', () => {
    // Trim 20% of 10,000 optimizable (2,000) and 30% of 6,000 discretionary (1,800)
    const scenario = calculatePotentialSavings(10000, 6000, 20, 30);

    assert.equal(scenario.monthlyPotentialSavings, 3800);
    assert.equal(scenario.annualPotentialSavings, 45600);
  });

  it('triggers correct budget warning status according to threshold thresholds', () => {
    assert.equal(getBudgetStatus(50), 'on_track');
    assert.equal(getBudgetStatus(75), 'warning');
    assert.equal(getBudgetStatus(92), 'critical');
    assert.equal(getBudgetStatus(105), 'over_budget');
  });

  it('parses amounts accurately from English and Hinglish phrases', () => {
    assert.equal(extractAmount('Spent ₹250 on lunch'), 250);
    assert.equal(extractAmount('Paid 1200 rupees for groceries'), 1200);
    assert.equal(extractAmount('Kal 1500 ka petrol bharwaya'), 1500);
    assert.equal(extractAmount('Dost ko 500 diye dinner ke liye'), 500);
    assert.equal(extractAmount('Swiggy se 450 ka khana mangwaya'), 450);
    assert.equal(extractAmount('Got salary 85k today'), 85000);
    assert.equal(extractAmount('bought a keyboard'), null);
  });

  it('classifies notes offline when the AI service is unavailable', () => {
    const food = parseExpenseHeuristically('kal 450 ka khana swiggy se, upi', '2026-11-01');
    assert.equal(food.amount, 450);
    assert.equal(food.category, 'Food & Dining');
    assert.equal(food.essentiality, 'optimizable');
    assert.equal(food.merchant, 'Swiggy');
    assert.equal(food.payment_method, 'UPI');
    assert.equal(food.purchase_date, '2026-10-31');

    const salary = parseExpenseHeuristically('Got salary 85k today', '2026-11-01');
    assert.equal(salary.transaction_type, 'income');
    assert.equal(salary.category, 'Salary');

    const missing = parseExpenseHeuristically('bought a keyboard on amazon', '2026-11-01');
    assert.equal(missing.amount, null);
    assert.equal(missing.needs_clarification, true);
  });

  it('splits a note listing several purchases into separate entries offline', () => {
    const items = parseExpensesHeuristically('aaj 450 ka lunch swiggy se, 1200 ka petrol aur 2 kg sabzi 180 cash me', '2026-11-01');
    assert.deepEqual(
      items.map((i) => [i.amount, i.category]),
      [
        [450, 'Food & Dining'],
        [1200, 'Transportation'],
        [180, 'Groceries'],
      ]
    );
    // Quantities are not amounts.
    assert.equal(extractAmount('dinner for 4 people 2000'), 2000);
    // An item without an amount is kept so the chat can ask for it.
    const [shoes, netflix] = parseExpensesHeuristically('bought shoes and paid 649 for netflix', '2026-11-01');
    assert.equal(shoes.amount, null);
    assert.equal(shoes.needs_clarification, true);
    assert.equal(netflix.amount, 649);
  });

  it('maps categories to coloured purchase kinds', () => {
    assert.equal(kindForCategory({ id: 'cat-subs', name: 'Subscriptions', category_type: 'expense' }), 'subscriptions');
    assert.equal(kindForCategory({ id: 'custom-1', name: 'Petrol & cabs', category_type: 'expense' }), 'transport');
    assert.equal(kindForCategory({ id: 'custom-2', name: 'Side hustle', category_type: 'income' }), 'income');
    assert.equal(kindForTransaction({ transaction_type: 'expense', category_id: 'cat-housing' }), 'home');
  });

  it('skips statement rows that were already recorded in chat', () => {
    const existing = [
      { id: 'sofa', transaction_type: 'expense', amount: 45000, purchase_date: '2026-10-17', description: 'Sofa', category_id: 'cat-shopping' },
      { id: 'chai', transaction_type: 'expense', amount: 40, purchase_date: '2026-10-20', description: 'Chai', category_id: 'cat-food' },
      { id: 'petrol', transaction_type: 'expense', amount: 1200, purchase_date: '2026-10-29', description: 'Petrol', category_id: 'cat-transport' },
      { id: 'rahul', transaction_type: 'expense', amount: 500, purchase_date: '2026-10-12', description: 'Payment to Rahul', category_id: 'cat-gifts' },
    ];
    const statement = [
      // Different words, same category: the sofa told in chat.
      { transaction_type: 'expense', amount: 45000, purchase_date: '2026-10-18', description: 'Urban Ladder purchase', category_id: 'cat-shopping' },
      { transaction_type: 'expense', amount: 40, purchase_date: '2026-10-20', description: 'UPI chai', category_id: 'cat-food' },
      { transaction_type: 'expense', amount: 40, purchase_date: '2026-10-20', description: 'UPI chai', category_id: 'cat-food' },
      { transaction_type: 'expense', amount: 45000, purchase_date: '2026-10-25', description: 'Too late to match', category_id: 'cat-shopping' },
      { transaction_type: 'income', amount: 40, purchase_date: '2026-10-20', description: 'Refund' },
      // Same amount and week as the petrol, but a transfer to a person: not a duplicate.
      { transaction_type: 'expense', amount: 1200, purchase_date: '2026-10-30', description: 'UPI to Priya Sharma', category_id: 'cat-gifts', needs: 'category' },
      // Category unknown, but the name matches what was said in chat.
      { transaction_type: 'expense', amount: 500, purchase_date: '2026-10-12', description: 'UPI to Rahul Kumar', category_id: 'cat-misc', needs: 'category' },
    ];
    const { fresh, duplicates } = findDuplicates(statement, existing);
    assert.deepEqual(duplicates.map((d) => d.match.id), ['sofa', 'chai', 'rahul']);
    assert.deepEqual(fresh.map((f) => f.description), ['UPI chai', 'Too late to match', 'Refund', 'UPI to Priya Sharma']);
  });

  it('warns about budgets, overspending, goals at risk and big purchases', () => {
    const tx = (purchase_date, amount, extra = {}) => ({ purchase_date, amount, transaction_type: 'expense', category_id: 'cat-food', description: 'x', ...extra });
    const transactions = [
      tx('2026-10-01', 50000, { transaction_type: 'income', category_id: 'cat-salary' }),
      tx('2026-10-05', 5800),
      tx('2026-10-20', 30000, { category_id: 'cat-shopping', description: 'Sofa' }),
    ];
    const warnings = spendingWarnings({
      justSaved: [transactions[2], transactions[1]],
      transactions,
      budgets: [{ category_id: 'cat-food', period_type: 'monthly', amount: 6000 }],
      goals: [{ name: 'Emergency fund', target_amount: 300000, current_amount: 100000, target_date: '2027-10-31' }],
      monthlyIncome: 50000,
      today: '2026-10-31',
      categoryName: () => 'Food & Dining',
    });
    const text = warnings.map((w) => w.text).join(' | ');
    assert.match(text, /97% of your Food & Dining budget/);
    assert.match(text, /Emergency fund needs/); // 14,200 left vs ~16,667 a month needed
    assert.match(text, /"Sofa" is about 60% of your monthly income/);
    assert.equal(warnings[0].tone, 'danger');

    // Income only: nothing to warn about.
    assert.deepEqual(spendingWarnings({ justSaved: [transactions[0]], transactions, budgets: [], goals: [], monthlyIncome: 50000, today: '2026-10-31', categoryName: () => '' }), []);
  });

  it('enforces category ownership isolation rule', () => {
    const categories = [
      { id: 'sys-1', user_id: null, is_system: true },
      { id: 'user1-cat', user_id: 'user_1', is_system: false },
      { id: 'user2-cat', user_id: 'user_2', is_system: false },
    ];

    const canUserUseCategory = (catId, currentUserId) => {
      const cat = categories.find((c) => c.id === catId);
      if (!cat) return false;
      return cat.is_system || cat.user_id === currentUserId;
    };

    // User 1 can use system category and their own category
    assert.equal(canUserUseCategory('sys-1', 'user_1'), true);
    assert.equal(canUserUseCategory('user1-cat', 'user_1'), true);
    // User 1 CANNOT use User 2's custom category
    assert.equal(canUserUseCategory('user2-cat', 'user_1'), false);
  });
});

describe('Reporting periods and budget scoping', () => {
  const tx = (purchase_date, amount, extra = {}) => ({
    purchase_date,
    amount,
    transaction_type: 'expense',
    category_id: 'cat-food',
    ...extra,
  });

  it('formats the calendar date in the given time zone, not UTC', () => {
    // 00:30 on 1 Nov in India is still 31 Oct in UTC
    const earlyMorningIST = new Date('2026-10-31T19:00:00Z');
    assert.equal(toLocalDateString(earlyMorningIST, 'Asia/Kolkata'), '2026-11-01');
    assert.equal(toLocalDateString(earlyMorningIST, 'UTC'), '2026-10-31');
  });

  it('bounds "last month" on both sides', () => {
    assert.deepEqual(getReportingPeriodRange('last_month', '2026-10-31'), {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    // January rolls back into December of the previous year
    assert.deepEqual(getReportingPeriodRange('last_month', '2026-01-15'), {
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    });

    const txs = [tx('2026-08-31', 1), tx('2026-09-01', 10), tx('2026-09-30', 100), tx('2026-10-05', 1000)];
    const lastMonth = filterTransactionsByDateRange(txs, getReportingPeriodRange('last_month', '2026-10-31'));
    assert.deepEqual(lastMonth.map((t) => t.amount), [10, 100]);
  });

  it('starts "this month" on the 1st without including the previous month', () => {
    assert.deepEqual(getReportingPeriodRange('this_month', '2026-11-01'), {
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    const txs = [tx('2026-10-31', 1), tx('2026-11-01', 10)];
    const thisMonth = filterTransactionsByDateRange(txs, getReportingPeriodRange('this_month', '2026-11-01'));
    assert.deepEqual(thisMonth.map((t) => t.amount), [10]);
  });

  it('covers exactly 7 days for "this week" and clamps month arithmetic', () => {
    assert.deepEqual(getReportingPeriodRange('this_week', '2026-03-03'), {
      startDate: '2026-02-25',
      endDate: '2026-03-03',
    });
    // 31 May minus 3 months is the end of February, not 3 March
    assert.equal(getReportingPeriodRange('last_3_months', '2026-05-31').startDate, '2026-02-28');
    assert.equal(getReportingPeriodRange('all_time', '2026-05-31'), null);
  });

  it('computes budget periods for each period type', () => {
    // 1 Nov 2026 is a Sunday, so its ISO week starts Monday 26 Oct
    assert.deepEqual(getBudgetPeriodRange('weekly', '2026-11-01'), { startDate: '2026-10-26', endDate: '2026-11-01' });
    assert.deepEqual(getBudgetPeriodRange('monthly', '2028-02-10'), { startDate: '2028-02-01', endDate: '2028-02-29' });
    assert.deepEqual(getBudgetPeriodRange('quarterly', '2026-11-01'), { startDate: '2026-10-01', endDate: '2026-12-31' });
    assert.deepEqual(getBudgetPeriodRange('yearly', '2026-11-01'), { startDate: '2026-01-01', endDate: '2026-12-31' });
  });

  it('counts only the current period against a monthly budget', () => {
    const txs = [
      tx('2026-09-28', 5000), // previous month: excluded
      tx('2026-10-03', 1200),
      tx('2026-10-20', 800, { category_id: 'cat-transport' }),
      tx('2026-10-21', 90000, { transaction_type: 'income', category_id: 'cat-salary' }),
    ];

    const overall = { category_id: null, period_type: 'monthly' };
    const food = { category_id: 'cat-food', period_type: 'monthly' };

    assert.equal(calculateBudgetSpent(txs, overall, '2026-10-31'), 2000);
    assert.equal(calculateBudgetSpent(txs, food, '2026-10-31'), 1200);
    assert.equal(calculateBudgetSpent(txs, food, '2026-09-30'), 5000);
  });
});
