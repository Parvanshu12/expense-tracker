import { Transaction } from '@/types/database';
import {
  FinancialSummary,
  CategorySpending,
  EssentialityBreakdown,
  SpendingTrendPoint,
  WealthSimulationInput,
  WealthSimulationYearResult,
  PotentialSavingsScenario,
} from '@/types/finance';

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
