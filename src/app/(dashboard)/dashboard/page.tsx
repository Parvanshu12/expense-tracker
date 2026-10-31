'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  PieChart as PieIcon,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Sparkles,
  Info,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataService } from '@/lib/data-service';
import { Transaction, Budget } from '@/types/database';
import {
  calculateFinancialSummary,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
} from '@/lib/calculations/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6', '#14b8a6', '#64748b'];
const ESSENTIALITY_COLORS = {
  essential: '#3b82f6',
  optimizable: '#f59e0b',
  discretionary: '#a855f7',
};

export default function DashboardOverviewPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('this_month');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCurrentDateStr(new Date().toISOString().split('T')[0]);
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const txs = await DataService.getTransactions();
        const bgts = await DataService.getBudgets();
        setTransactions(txs);
        setBudgets(bgts);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const overallBudget = budgets.find((b) => b.category_id === null)?.amount || 50000;

  // Filter transactions based on selected reporting period
  const periodTransactions = useMemo(() => {
    if (selectedPeriod === 'all_time' || !currentDateStr) return transactions;

    const [year, month, day] = currentDateStr.split('-').map(Number);
    const start = new Date(year, month - 1, day);

    if (selectedPeriod === 'this_week') {
      start.setDate(start.getDate() - 7);
    } else if (selectedPeriod === 'this_month') {
      start.setDate(1); // 1st of current month
    } else if (selectedPeriod === 'last_month') {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
    } else if (selectedPeriod === 'last_3_months') {
      start.setMonth(start.getMonth() - 3);
    } else if (selectedPeriod === 'last_6_months') {
      start.setMonth(start.getMonth() - 6);
    } else if (selectedPeriod === 'this_year') {
      start.setMonth(0);
      start.setDate(1);
    }

    const startStr = start.toISOString().split('T')[0];
    return transactions.filter((t) => t.purchase_date >= startStr);
  }, [transactions, selectedPeriod, currentDateStr]);

  const summary = useMemo(() => {
    return calculateFinancialSummary(periodTransactions, overallBudget);
  }, [periodTransactions, overallBudget]);

  const categoryBreakdown = useMemo(() => {
    return calculateCategoryBreakdown(periodTransactions, 'expense');
  }, [periodTransactions]);

  const essentialityBreakdown = useMemo(() => {
    return calculateEssentialityBreakdown(periodTransactions);
  }, [periodTransactions]);

  const recentTransactions = useMemo(() => {
    return periodTransactions.slice(0, 5);
  }, [periodTransactions]);

  // Spending trend data for chart
  const trendData = useMemo(() => {
    const map = new Map<string, { date: string; income: number; expenses: number }>();
    const sorted = [...periodTransactions].sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));

    for (const t of sorted) {
      const key = t.purchase_date;
      if (!map.has(key)) {
        map.set(key, { date: formatDate(key, 'dd MMM'), income: 0, expenses: 0 });
      }
      const entry = map.get(key)!;
      if (t.transaction_type === 'income') entry.income += Number(t.amount);
      if (t.transaction_type === 'expense') entry.expenses += Number(t.amount);
    }
    return Array.from(map.values()).slice(-7);
  }, [transactions]);

  const pieData = useMemo(() => {
    return categoryBreakdown.slice(0, 5).map((c) => ({
      name: c.categoryName,
      value: c.amount,
    }));
  }, [categoryBreakdown]);

  const essentialityPieData = useMemo(() => {
    return [
      { name: 'Essential', value: essentialityBreakdown.essential, color: ESSENTIALITY_COLORS.essential },
      { name: 'Optimizable', value: essentialityBreakdown.optimizable, color: ESSENTIALITY_COLORS.optimizable },
      { name: 'Discretionary', value: essentialityBreakdown.discretionary, color: ESSENTIALITY_COLORS.discretionary },
    ].filter((item) => item.value > 0);
  }, [essentialityBreakdown]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-xs text-slate-500">Loading your financial records...</p>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white/50 dark:bg-slate-900/40">
        <div className="h-16 w-16 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Welcome to SpendWise AI!
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-1 mb-6">
          You don&apos;t have any transactions recorded yet. Start by capturing your first expense using natural language, voice input, or manual entry.
        </p>
        <Link href="/add-expense">
          <Button variant="ai" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Your First Expense
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selection Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Financial Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time cash flow, category distribution, and essentiality audit
          </p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          {[
            { id: 'this_week', label: '7 Days' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'last_3_months', label: '3 Months' },
            { id: 'this_year', label: 'YTD' },
            { id: 'all_time', label: 'All Time' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPeriod(p.id)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                selectedPeriod === p.id
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top 5 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Income */}
        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Total Income</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(summary.totalIncome)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Recorded period income</div>
          </div>
        </Card>

        {/* Total Expenses */}
        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Total Expenses</span>
            <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600">
              <ArrowDownRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(summary.totalExpenses)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Across all categories</div>
          </div>
        </Card>

        {/* Remaining Balance */}
        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Remaining Balance</span>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(summary.remainingBalance)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Income minus expenses</div>
          </div>
        </Card>

        {/* Actual Savings */}
        <Card className="p-4 flex flex-col justify-between border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium flex items-center gap-1">
              Actual Savings
              <span title="Calculated as recorded income minus recorded expenses for this period">
                <Info className="h-3 w-3 text-slate-400 cursor-help" />
              </span>
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600">
              <PiggyBank className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.actualSavings)}
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
              Net retained cashflow
            </div>
          </div>
        </Card>

        {/* Monthly Budget Utilization */}
        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Budget Utilization</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600">
              <PieIcon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{summary.budgetUtilization.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  summary.budgetUtilization > 90
                    ? 'bg-rose-500'
                    : summary.budgetUtilization > 75
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
                }`}
                style={{ width: `${Math.min(summary.budgetUtilization, 100)}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expenses Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Cash Flow Trend</CardTitle>
              <CardDescription className="text-xs">
                Comparison of daily income credits vs expenses
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              Recent Activity
            </Badge>
          </CardHeader>
          <CardContent className="h-72 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(Number(value || 0)), '']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Essentiality Breakdown Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Essentiality Audit</CardTitle>
            <CardDescription className="text-xs">
              Essential vs Optimizable vs Discretionary
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-2">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={essentialityPieData}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {essentialityPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [formatCurrency(Number(value || 0)), '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-1.5 pt-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Essential ({essentialityBreakdown.essentialPct.toFixed(0)}%)
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatCurrency(essentialityBreakdown.essential)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Optimizable ({essentialityBreakdown.optimizablePct.toFixed(0)}%)
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatCurrency(essentialityBreakdown.optimizable)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  Discretionary ({essentialityBreakdown.discretionaryPct.toFixed(0)}%)
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatCurrency(essentialityBreakdown.discretionary)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid: Recent Transactions and Top Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions List */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <CardDescription className="text-xs">
                Latest financial events recorded into your ledger
              </CardDescription>
            </div>
            <Link href="/transactions">
              <Button variant="ghost" size="sm" className="text-xs text-indigo-600 dark:text-indigo-400">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {recentTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.transaction_type === 'income'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'
                        : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600'
                    }`}
                  >
                    {tx.transaction_type === 'income' ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{tx.description}</span>
                      <Badge
                        variant={tx.essentiality as any}
                        className="text-[9px] px-1.5 py-0 h-4 font-normal"
                      >
                        {tx.essentiality}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{tx.category?.name || 'Uncategorized'}</span>
                      <span>•</span>
                      <span>{formatDate(tx.purchase_date)}</span>
                      {tx.merchant && (
                        <>
                          <span>•</span>
                          <span>{tx.merchant}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${
                      tx.transaction_type === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {tx.transaction_type === 'income' ? '+' : '-'}
                    {formatCurrency(Number(tx.amount))}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase">
                    {tx.payment_method || 'Standard'}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Spending Categories */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Spending Categories</CardTitle>
            <CardDescription className="text-xs">
              Where your money is allocated this period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {categoryBreakdown.slice(0, 5).map((cat, idx) => (
              <div key={cat.categoryId} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    {cat.categoryName}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(cat.amount)} ({cat.percentage.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: COLORS[idx % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
