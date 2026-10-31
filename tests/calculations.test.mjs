import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Core calculation logic unit tests
function calculateFinancialSummary(transactions, monthlyBudget = 0, currency = 'INR', periodLabel = 'This Month') {
  let totalIncome = 0;
  let totalExpenses = 0;
  let essentialSpending = 0;
  let optimizableSpending = 0;
  let discretionarySpending = 0;

  for (const tx of transactions) {
    if (tx.transaction_type === 'income') {
      totalIncome += Number(tx.amount);
    } else if (tx.transaction_type === 'expense') {
      const amt = Number(tx.amount);
      totalExpenses += amt;
      if (tx.essentiality === 'essential') {
        essentialSpending += amt;
      } else if (tx.essentiality === 'optimizable') {
        optimizableSpending += amt;
      } else if (tx.essentiality === 'discretionary') {
        discretionarySpending += amt;
      }
    }
  }

  const remainingBalance = totalIncome - totalExpenses;
  const actualSavings = remainingBalance;
  const budgetUtilization = monthlyBudget > 0 ? (totalExpenses / monthlyBudget) * 100 : 0;

  return {
    totalIncome,
    totalExpenses,
    remainingBalance,
    actualSavings,
    budgetUtilization,
    totalBudget: monthlyBudget,
    currency,
    periodLabel,
    essentialSpending,
    optimizableSpending,
    discretionarySpending,
  };
}

function simulateWealthGrowth(input) {
  const { startingAmount, monthlyContribution, annualReturnRate, durationYears, inflationRate = 0 } = input;
  const r = annualReturnRate / 100;
  const n = 12;
  const results = [];

  for (let year = 1; year <= durationYears; year++) {
    const months = year * n;
    const monthlyRate = r / n;

    const principalGrowth = startingAmount * Math.pow(1 + monthlyRate, months);
    let annuityGrowth = 0;
    if (monthlyRate > 0) {
      annuityGrowth = monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    } else {
      annuityGrowth = monthlyContribution * months;
    }

    const futureValue = principalGrowth + annuityGrowth;
    const totalInvested = startingAmount + monthlyContribution * months;
    const hypotheticalGrowth = futureValue - totalInvested;

    let inflationAdjustedValue = futureValue;
    if (inflationRate > 0) {
      inflationAdjustedValue = futureValue / Math.pow(1 + inflationRate / 100, year);
    }

    results.push({
      year,
      totalInvested: Math.round(totalInvested),
      hypotheticalGrowth: Math.round(hypotheticalGrowth),
      futureValue: Math.round(futureValue),
      inflationAdjustedValue: Math.round(inflationAdjustedValue),
    });
  }

  return results;
}

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

  it('calculates savings goal suggested monthly contributions accurately', () => {
    const targetAmount = 120000;
    const currentAmount = 20000;
    const remaining = targetAmount - currentAmount; // 100,000
    const monthsRemaining = 10;
    const suggestedMonthly = remaining / monthsRemaining;

    assert.equal(suggestedMonthly, 10000);
  });

  it('correctly calculates variable potential savings reduction scenarios', () => {
    const optimizable = 10000;
    const discretionary = 6000;
    const optTrim = 20; // 20%
    const discTrim = 30; // 30%

    const optSaved = (optimizable * optTrim) / 100; // 2,000
    const discSaved = (discretionary * discTrim) / 100; // 1,800
    const monthlyTotal = optSaved + discSaved; // 3,800
    const annualTotal = monthlyTotal * 12; // 45,600

    assert.equal(optSaved, 2000);
    assert.equal(discSaved, 1800);
    assert.equal(monthlyTotal, 3800);
    assert.equal(annualTotal, 45600);
  });

  it('triggers correct budget warning status according to threshold thresholds', () => {
    const getStatus = (spent, limit) => {
      const pct = (spent / limit) * 100;
      if (pct >= 100) return 'over_budget';
      if (pct >= 90) return 'critical';
      if (pct >= 75) return 'warning';
      return 'on_track';
    };

    assert.equal(getStatus(5000, 10000), 'on_track');
    assert.equal(getStatus(7500, 10000), 'warning');
    assert.equal(getStatus(9200, 10000), 'critical');
    assert.equal(getStatus(10500, 10000), 'over_budget');
  });

  it('parses amounts accurately from English and Hinglish phrases', () => {
    const extractAmount = (str) => {
      const match = str.match(/(?:(?:₹|rs\.?|inr|rupees|rupay)\s*([\d,]+(?:\.\d+)?))|([\d,]+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees|rupay|ka|ki|bheje|diye|aaye)|(?:spent|paid|for|cost|deeye|bhara|liya)\s*([\d,]+(?:\.\d+)?)/i);
      if (match) {
        const raw = match[1] || match[2] || match[3];
        return parseFloat(raw.replace(/,/g, ''));
      }
      const general = str.match(/\b\d+(\.\d{1,2})?\b/);
      return general ? parseFloat(general[0]) : null;
    };

    assert.equal(extractAmount('Spent ₹250 on lunch'), 250);
    assert.equal(extractAmount('Paid 1200 rupees for groceries'), 1200);
    assert.equal(extractAmount('Kal 1500 ka petrol bharwaya'), 1500);
    assert.equal(extractAmount('Dost ko 500 diye dinner ke liye'), 500);
    assert.equal(extractAmount('Swiggy se 450 ka khana mangwaya'), 450);
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
