import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RATES,
  futureValueLumpSum,
  futureValueSip,
  monthlyInterest,
  inflationAdjusted,
  roundAbout,
  moneySnapshot,
  setAsideEstimate,
  biggestOptionalPurchases,
} from '../src/lib/calculations/invest.ts';
import { simulateWealthGrowth } from '../src/lib/calculations/finance.ts';

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);

describe('Future planner maths', () => {
  it('grows a one-time amount with monthly compounding', () => {
    // 10,000 at 12% a year = 1% a month for 120 months.
    close(futureValueLumpSum(10000, 12, 10), 10000 * Math.pow(1.01, 120));
    close(futureValueLumpSum(10000, 12, 10), 33003.87);
    assert.equal(futureValueLumpSum(10000, 0, 10), 10000);
    assert.equal(futureValueLumpSum(10000, 12, 0), 10000);
    assert.equal(futureValueLumpSum(-500, 12, 5), 0);
  });

  it('grows a monthly SIP with end-of-month deposits', () => {
    close(futureValueSip(1000, 12, 10), 230038.69);
    assert.equal(futureValueSip(1000, 0, 2), 24000);
    assert.equal(futureValueSip(1000, 12, 0), 0);
    assert.equal(futureValueSip(Number.NaN, 12, 5), 0);
  });

  it('matches simulateWealthGrowth so the Simple and Advanced views agree', () => {
    const rows = simulateWealthGrowth({
      startingAmount: 50000,
      monthlyContribution: 5000,
      annualReturnRate: 12,
      durationYears: 20,
      inflationRate: 6,
    });
    for (const year of [1, 5, 10, 20]) {
      const row = rows[year - 1];
      const fv = futureValueLumpSum(50000, 12, year) + futureValueSip(5000, 12, year);
      close(fv, row.futureValue, 1);
      close(inflationAdjusted(fv, 6, year), row.inflationAdjustedValue, 1);
    }
  });

  it('works out monthly FD interest', () => {
    close(monthlyInterest(100000, 7), 583.33);
    assert.equal(monthlyInterest(0, 7), 0);
    assert.equal(monthlyInterest(100000, 0), 0);
  });

  it("shows a future amount in today's money", () => {
    close(inflationAdjusted(106000, 6, 1), 100000);
    assert.equal(inflationAdjusted(5000, 0, 10), 5000);
    close(inflationAdjusted(179084.77, 6, 10), 100000, 0.5);
  });

  it('rounds to friendly figures', () => {
    assert.equal(roundAbout(436), 440);
    assert.equal(roundAbout(8249), 8200);
    assert.equal(roundAbout(254600), 255000);
    assert.equal(roundAbout(-1250), -1300);
    assert.equal(roundAbout(Number.NaN), 0);
  });

  it('uses the example rates from the brief', () => {
    assert.deepEqual(DEFAULT_RATES, { fd: 7, debt: 8, index: 12, stocks: 14 });
  });
});

const tx = (purchase_date, transaction_type, amount, essentiality = 'essential', extra = {}) => ({
  purchase_date,
  transaction_type,
  amount,
  essentiality,
  ...extra,
});

describe('moneySnapshot', () => {
  const today = '2026-10-31';

  it('averages the last 90 days when there is enough history', () => {
    const txs = [
      tx('2026-06-01', 'income', 999999), // outside the window: only counts towards saved so far
      tx('2026-08-05', 'income', 60000),
      tx('2026-09-05', 'income', 60000),
      tx('2026-10-05', 'income', 60000),
      tx('2026-08-10', 'expense', 30000, 'essential'),
      tx('2026-09-10', 'expense', 9000, 'optimizable'),
      tx('2026-10-10', 'expense', 6000, 'discretionary'),
      tx('2026-11-02', 'expense', 50000, 'discretionary'), // future-dated: ignored
    ];
    const s = moneySnapshot(txs, null, today);
    const months = 90 / (365.25 / 12);
    close(s.months, months, 1e-9);
    close(s.monthlyIncome, 180000 / months);
    assert.equal(s.incomeFrom, 'transactions');
    close(s.monthlySpend, 45000 / months);
    close(s.monthlyEssential, 30000 / months);
    close(s.monthlyTrim, 9000 / months);
    close(s.monthlyOptional, 6000 / months);
    close(s.monthlyLeft, (180000 - 45000) / months);
    assert.equal(s.savedSoFar, 999999 + 180000 - 45000);
  });

  it('prefers the profile income when it is higher, and never stretches a few days into a month', () => {
    const txs = [tx('2026-10-25', 'expense', 2000, 'discretionary'), tx('2026-10-30', 'expense', 3000, 'essential')];
    const s = moneySnapshot(txs, 40000, today);
    assert.equal(s.months, 1);
    assert.equal(s.monthlyIncome, 40000);
    assert.equal(s.incomeFrom, 'profile');
    assert.equal(s.monthlySpend, 5000);
    assert.equal(s.monthlyOptional, 2000);
    assert.equal(s.monthlyLeft, 35000);
    assert.equal(s.savedSoFar, 0);
  });

  it('reports unknown income as null left-over', () => {
    const s = moneySnapshot([tx('2026-10-20', 'expense', 1000, 'optimizable')], null, today);
    assert.equal(s.monthlyIncome, 0);
    assert.equal(s.incomeFrom, 'none');
    assert.equal(s.monthlyLeft, null);
  });

  it('handles no data at all', () => {
    const s = moneySnapshot([], undefined, today);
    assert.equal(s.monthlySpend, 0);
    assert.equal(s.monthlyLeft, null);
    assert.equal(s.savedSoFar, 0);
  });
});

describe('setAsideEstimate', () => {
  it('adds what is left over to the trimmed share of non-essential spending', () => {
    const r = setAsideEstimate({ monthlyLeft: 10000, monthlyTrim: 4000, monthlyOptional: 6000 }, 0.5);
    assert.deepEqual(r, { fromLeftover: 10000, fromTrim: 5000, total: 15000 });
  });

  it('uses trimming to cover overspending first and never goes below zero', () => {
    assert.equal(setAsideEstimate({ monthlyLeft: -3000, monthlyTrim: 4000, monthlyOptional: 4000 }, 0.5).total, 1000);
    assert.equal(setAsideEstimate({ monthlyLeft: -9000, monthlyTrim: 4000, monthlyOptional: 4000 }, 0.5).total, 0);
  });

  it('works without income and clamps the share', () => {
    assert.equal(setAsideEstimate({ monthlyLeft: null, monthlyTrim: 1000, monthlyOptional: 1000 }, 2).total, 2000);
    assert.equal(setAsideEstimate({ monthlyLeft: null, monthlyTrim: 1000, monthlyOptional: 1000 }, -1).total, 0);
  });
});

describe('biggestOptionalPurchases', () => {
  it('picks the largest could-trim and optional expenses from the last 60 days', () => {
    const txs = [
      tx('2026-10-12', 'expense', 8000, 'discretionary', { description: 'Office chair' }),
      tx('2026-10-20', 'expense', 12000, 'essential', { description: 'Rent' }),
      tx('2026-09-15', 'expense', 2500, 'optimizable', { description: 'Food delivery' }),
      tx('2026-08-01', 'expense', 50000, 'discretionary', { description: 'Phone' }), // older than 60 days
      tx('2026-10-01', 'income', 60000, 'essential', { description: 'Salary' }),
      tx('2026-10-28', 'expense', 2500, 'discretionary', { description: 'Concert' }),
      tx('2026-10-29', 'expense', 900, 'optimizable', { description: 'Cab' }),
      tx('2026-11-05', 'expense', 9000, 'discretionary', { description: 'Future' }),
    ];
    const picked = biggestOptionalPurchases(txs, '2026-10-31', 60, 3).map((t) => t.description);
    assert.deepEqual(picked, ['Office chair', 'Concert', 'Food delivery']);
  });

  it('returns nothing when there is nothing optional', () => {
    assert.deepEqual(biggestOptionalPurchases([tx('2026-10-20', 'expense', 500, 'essential')], '2026-10-31'), []);
  });
});
