// Type-only imports keep this module runnable directly by Node's TypeScript
// type stripping, which the unit tests in tests/ rely on.
import type { Transaction, Budget, PeriodType, SavingsGoal } from '@/types/database';
import type {
  FinancialSummary,
  CategorySpending,
  EssentialityBreakdown,
  WealthSimulationInput,
  WealthSimulationYearResult,
  PotentialSavingsScenario,
  ReportingPeriod,
  DateRange,
} from '@/types/finance';

/**
 * Formats a Date as a YYYY-MM-DD calendar date. Uses the runtime's local time
 * zone unless an IANA `timeZone` is given. Never use `toISOString()` for this:
 * it converts to UTC first, which lands on the previous day before 05:30 IST.
 */
export function toLocalDateString(date: Date = new Date(), timeZone?: string): string {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Calendar arithmetic on YYYY-MM-DD strings, done in UTC so DST and the
// runtime's time zone can never shift a date.
function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = parseDateString(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateString(d);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Moves by whole months, clamping the day (e.g. 31 May - 3 months = 28/29 Feb). */
function addMonths(dateStr: string, months: number): string {
  const d = parseDateString(dateStr);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const day = Math.min(d.getUTCDate(), daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  target.setUTCDate(day);
  return formatDateString(target);
}

function monthRange(year: number, monthIndex: number): DateRange {
  return {
    startDate: formatDateString(new Date(Date.UTC(year, monthIndex, 1))),
    endDate: formatDateString(new Date(Date.UTC(year, monthIndex, daysInMonth(year, monthIndex)))),
  };
}

export type DashboardPeriod = Exclude<ReportingPeriod, 'custom'> | 'all_time';

/**
 * Inclusive date range for a dashboard reporting period, relative to `today`
 * (YYYY-MM-DD). Returns null for 'all_time'. Calendar periods (this/last month,
 * this year) cover the whole period; rolling windows end today.
 */
export function getReportingPeriodRange(period: DashboardPeriod, today: string): DateRange | null {
  const d = parseDateString(today);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  switch (period) {
    case 'this_week':
      return { startDate: addDays(today, -6), endDate: today };
    case 'this_month':
      return monthRange(year, month);
    case 'last_month':
      return monthRange(month === 0 ? year - 1 : year, (month + 11) % 12);
    case 'last_3_months':
      return { startDate: addMonths(today, -3), endDate: today };
    case 'last_6_months':
      return { startDate: addMonths(today, -6), endDate: today };
    case 'this_year':
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
    case 'all_time':
      return null;
  }
}

export function filterTransactionsByDateRange(
  transactions: Transaction[],
  range: DateRange | null
): Transaction[] {
  if (!range) return transactions;
  return transactions.filter(
    (t) => t.purchase_date >= range.startDate && t.purchase_date <= range.endDate
  );
}

/**
 * The budget period that contains `today`: the ISO week (Monday–Sunday),
 * calendar month, calendar quarter, or calendar year.
 */
export function getBudgetPeriodRange(periodType: PeriodType, today: string): DateRange {
  const d = parseDateString(today);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  switch (periodType) {
    case 'weekly': {
      const daysSinceMonday = (d.getUTCDay() + 6) % 7;
      const startDate = addDays(today, -daysSinceMonday);
      return { startDate, endDate: addDays(startDate, 6) };
    }
    case 'monthly':
      return monthRange(year, month);
    case 'quarterly': {
      const firstMonth = Math.floor(month / 3) * 3;
      return {
        startDate: monthRange(year, firstMonth).startDate,
        endDate: monthRange(year, firstMonth + 2).endDate,
      };
    }
    case 'yearly':
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
}

/**
 * Expenses counted against a budget in its current period. An overall budget
 * (category_id null) counts every expense category.
 */
export function calculateBudgetSpent(
  transactions: Transaction[],
  budget: Pick<Budget, 'category_id' | 'period_type'>,
  today: string
): number {
  const range = getBudgetPeriodRange(budget.period_type, today);
  return filterTransactionsByDateRange(transactions, range)
    .filter(
      (t) =>
        t.transaction_type === 'expense' &&
        (budget.category_id === null || t.category_id === budget.category_id)
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

export type BudgetStatus = 'on_track' | 'warning' | 'critical' | 'over_budget';

/** Alert level for a budget utilization percentage (75% / 90% / 100% thresholds). */
export function getBudgetStatus(utilizationPct: number): BudgetStatus {
  if (utilizationPct >= 100) return 'over_budget';
  if (utilizationPct >= 90) return 'critical';
  if (utilizationPct >= 75) return 'warning';
  return 'on_track';
}

/**
 * Suggested monthly saving to reach a goal by its target date:
 * remaining amount / whole months left (at least 1).
 */
export function calculateSuggestedMonthlyContribution(
  targetAmount: number,
  currentAmount: number,
  targetDate: string,
  today: string
): number {
  const remaining = Math.max(0, targetAmount - currentAmount);
  if (remaining === 0) return 0;
  const target = parseDateString(targetDate);
  const now = parseDateString(today);
  const monthsLeft = Math.max(
    1,
    (target.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      (target.getUTCMonth() - now.getUTCMonth())
  );
  return Math.round(remaining / monthsLeft);
}

export function calculateFinancialSummary(
  transactions: Transaction[],
  monthlyBudget: number = 0,
  currency: string = 'INR',
  periodLabel: string = 'This Month'
): FinancialSummary {
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
  const actualSavings = remainingBalance; // Recorded income minus recorded expenses

  const budgetUtilization =
    monthlyBudget > 0 ? (totalExpenses / monthlyBudget) * 100 : 0;

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

export function calculateCategoryBreakdown(
  transactions: Transaction[],
  type: 'expense' | 'income' = 'expense'
): CategorySpending[] {
  const filtered = transactions.filter((t) => t.transaction_type === type);
  const total = filtered.reduce((acc, t) => acc + Number(t.amount), 0);

  const categoryMap = new Map<
    string,
    { name: string; icon?: string | null; amount: number; count: number }
  >();

  for (const tx of filtered) {
    const catId = tx.category_id || 'unknown';
    const catName = tx.category?.name || 'Uncategorized';
    const catIcon = tx.category?.icon || null;

    const existing = categoryMap.get(catId);
    if (existing) {
      existing.amount += Number(tx.amount);
      existing.count += 1;
    } else {
      categoryMap.set(catId, {
        name: catName,
        icon: catIcon,
        amount: Number(tx.amount),
        count: 1,
      });
    }
  }

  const result: CategorySpending[] = [];
  categoryMap.forEach((val, key) => {
    result.push({
      categoryId: key,
      categoryName: val.name,
      categoryType: type,
      icon: val.icon,
      amount: val.amount,
      percentage: total > 0 ? (val.amount / total) * 100 : 0,
      transactionCount: val.count,
    });
  });

  return result.sort((a, b) => b.amount - a.amount);
}

export function calculateEssentialityBreakdown(
  transactions: Transaction[]
): EssentialityBreakdown {
  const expenses = transactions.filter((t) => t.transaction_type === 'expense');
  let essential = 0;
  let optimizable = 0;
  let discretionary = 0;

  for (const tx of expenses) {
    const amt = Number(tx.amount);
    if (tx.essentiality === 'essential') essential += amt;
    else if (tx.essentiality === 'optimizable') optimizable += amt;
    else if (tx.essentiality === 'discretionary') discretionary += amt;
  }

  const total = essential + optimizable + discretionary;

  return {
    essential,
    optimizable,
    discretionary,
    essentialPct: total > 0 ? (essential / total) * 100 : 0,
    optimizablePct: total > 0 ? (optimizable / total) * 100 : 0,
    discretionaryPct: total > 0 ? (discretionary / total) * 100 : 0,
  };
}

export function calculatePotentialSavings(
  optimizableTotal: number,
  discretionaryTotal: number,
  optimizableReductionPct: number = 20,
  discretionaryReductionPct: number = 30
): PotentialSavingsScenario {
  const optimizableSaved = (optimizableTotal * optimizableReductionPct) / 100;
  const discretionarySaved = (discretionaryTotal * discretionaryReductionPct) / 100;
  const monthlyPotentialSavings = optimizableSaved + discretionarySaved;
  const annualPotentialSavings = monthlyPotentialSavings * 12;

  return {
    optimizableTotal,
    discretionaryTotal,
    optimizableReductionPct,
    discretionaryReductionPct,
    monthlyPotentialSavings,
    annualPotentialSavings,
  };
}

/**
 * Deterministic Compound Growth Simulation for Wealth Simulator
 * Compound interest formula with regular monthly deposits:
 * FV = P*(1 + r/n)^(n*t) + PMT * [((1 + r/n)^(n*t) - 1) / (r/n)]
 */
export function simulateWealthGrowth(
  input: WealthSimulationInput
): WealthSimulationYearResult[] {
  const { startingAmount, monthlyContribution, annualReturnRate, durationYears, inflationRate = 0 } = input;
  const r = annualReturnRate / 100;
  const n = 12; // Monthly compounding
  const results: WealthSimulationYearResult[] = [];

  for (let year = 1; year <= durationYears; year++) {
    const months = year * n;
    const monthlyRate = r / n;

    // Growth of lump-sum principal
    const principalGrowth = startingAmount * Math.pow(1 + monthlyRate, months);

    // Growth of future regular monthly deposits
    let annuityGrowth = 0;
    if (monthlyRate > 0) {
      annuityGrowth = monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    } else {
      annuityGrowth = monthlyContribution * months;
    }

    const futureValue = principalGrowth + annuityGrowth;
    const totalInvested = startingAmount + monthlyContribution * months;
    const hypotheticalGrowth = futureValue - totalInvested;

    // Inflation adjustment if provided
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

export interface SpendingWarning {
  text: string;
  tone: 'success' | 'warning' | 'danger';
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

/**
 * Plain-language warnings to show right after something is saved: budgets
 * crossing 75/90/100%, spending more than earned this month, goals that this
 * month's leftover money can't keep up with, and unusually big purchases.
 * Dangers come first. When nothing needs attention, returns one reassuring
 * budget line (or nothing).
 */
export function spendingWarnings(input: {
  justSaved: Pick<Transaction, 'transaction_type' | 'category_id' | 'amount' | 'description'>[];
  transactions: Transaction[];
  budgets: Pick<Budget, 'category_id' | 'period_type' | 'amount'>[];
  goals: Pick<SavingsGoal, 'name' | 'target_amount' | 'current_amount' | 'target_date'>[];
  monthlyIncome: number | null | undefined;
  today: string;
  categoryName: (categoryId: string | null) => string;
}): SpendingWarning[] {
  const { justSaved, transactions, budgets, goals, today, categoryName } = input;
  const expensesSaved = justSaved.filter((t) => t.transaction_type === 'expense');
  if (expensesSaved.length === 0) return [];
  const warnings: SpendingWarning[] = [];

  // Budgets touched by what was just saved.
  const affected = budgets
    .filter((b) => expensesSaved.some((t) => b.category_id === null || b.category_id === t.category_id))
    .map((b) => {
      const spent = calculateBudgetSpent(transactions, b, today);
      return { b, spent, pct: (spent / Number(b.amount)) * 100 };
    })
    .sort((x, y) => y.pct - x.pct);
  for (const { b, spent, pct } of affected) {
    const name = b.category_id === null ? 'your overall budget' : `your ${categoryName(b.category_id)} budget`;
    const status = getBudgetStatus(pct);
    if (status === 'over_budget') {
      warnings.push({ tone: 'danger', text: `You've gone over ${name} by ${formatINR(spent - Number(b.amount))}.` });
    } else if (status === 'critical' || status === 'warning') {
      warnings.push({
        tone: status === 'critical' ? 'danger' : 'warning',
        // Never show 100% while money is still left.
        text: `You've used ${Math.min(99, Math.round(pct))}% of ${name}. Only ${formatINR(Number(b.amount) - spent)} is left.`,
      });
    }
  }

  // This month's money in vs out.
  const month = today.slice(0, 7);
  let earned = 0;
  let spentThisMonth = 0;
  for (const t of transactions) {
    if (!t.purchase_date.startsWith(month)) continue;
    if (t.transaction_type === 'income') earned += Number(t.amount);
    else spentThisMonth += Number(t.amount);
  }
  const income = Math.max(earned, Number(input.monthlyIncome) || 0);
  if (income > 0 && spentThisMonth > income) {
    warnings.push({
      tone: 'danger',
      text: `You've spent ${formatINR(spentThisMonth - income)} more than you've earned this month.`,
    });
  } else if (income > 0) {
    // Goals that this month's leftover can't keep up with.
    const open = goals
      .filter((g) => Number(g.current_amount) < Number(g.target_amount))
      .map((g) => ({
        name: g.name,
        monthly: calculateSuggestedMonthlyContribution(Number(g.target_amount), Number(g.current_amount), g.target_date, today),
      }))
      .filter((g) => g.monthly > 0);
    const needed = open.reduce((sum, g) => sum + g.monthly, 0);
    const left = income - spentThisMonth;
    if (needed > 0 && left < needed) {
      const names = open.map((g) => g.name).slice(0, 2).join(' and ');
      warnings.push({
        tone: left < needed / 2 ? 'danger' : 'warning',
        text: `At this pace you'll have about ${formatINR(left)} left this month, but ${names} need${open.length === 1 ? 's' : ''} about ${formatINR(needed)} a month.`,
      });
    }
  }

  // A single purchase that's a big share of monthly income.
  if (income > 0) {
    const big = expensesSaved.find((t) => Number(t.amount) >= income * 0.25);
    if (big) {
      warnings.push({
        tone: 'warning',
        text: `"${big.description}" is about ${Math.round((Number(big.amount) / income) * 100)}% of your monthly income. Worth a second look if it wasn't planned.`,
      });
    }
  }

  if (warnings.length === 0 && affected[0]) {
    const { b, spent } = affected[0];
    const name = b.category_id === null ? 'Monthly budget' : `${categoryName(b.category_id)} budget`;
    return [{ tone: 'success', text: `${name}: ${formatINR(Number(b.amount) - spent)} left. You're on track.` }];
  }
  const order = { danger: 0, warning: 1, success: 2 };
  return warnings.sort((a, b) => order[a.tone] - order[b.tone]);
}
