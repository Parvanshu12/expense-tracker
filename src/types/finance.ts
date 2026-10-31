import { Essentiality, TransactionType } from './database';

export type ReportingPeriod =
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  remainingBalance: number;
  actualSavings: number;
  budgetUtilization: number;
  totalBudget: number;
  currency: string;
  periodLabel: string;
  essentialSpending: number;
  optimizableSpending: number;
  discretionarySpending: number;
}

export interface CategorySpending {
  categoryId: string;
  categoryName: string;
  categoryType: TransactionType;
  icon?: string | null;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface EssentialityBreakdown {
  essential: number;
  optimizable: number;
  discretionary: number;
  essentialPct: number;
  optimizablePct: number;
  discretionaryPct: number;
}

export interface SpendingTrendPoint {
  date: string;
  income: number;
  expenses: number;
  savings: number;
}

export interface WealthSimulationInput {
  startingAmount: number;
  monthlyContribution: number;
  annualReturnRate: number; // in percentage, e.g. 12 for 12%
  durationYears: number;
  inflationRate?: number; // optional inflation adjustment
}

export interface WealthSimulationYearResult {
  year: number;
  totalInvested: number;
  hypotheticalGrowth: number;
  futureValue: number;
  inflationAdjustedValue?: number;
}

export interface PotentialSavingsScenario {
  optimizableTotal: number;
  discretionaryTotal: number;
  optimizableReductionPct: number;
  discretionaryReductionPct: number;
  monthlyPotentialSavings: number;
  annualPotentialSavings: number;
}
