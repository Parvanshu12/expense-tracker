'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileBarChart,
  Download,
  Printer,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  Info,
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
  calculatePotentialSavings,
} from '@/lib/calculations/finance';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

export default function ReportsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [reportType, setReportType] = useState<'monthly' | 'weekly' | 'quarterly' | 'annual'>('monthly');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCurrentDateStr(formatDate(new Date()));
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const txs = await DataService.getTransactions();
        const bgts = await DataService.getBudgets();
        setTransactions(txs);
        setBudgets(bgts);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const summary = useMemo(() => calculateFinancialSummary(transactions, 50000), [transactions]);
  const categories = useMemo(() => calculateCategoryBreakdown(transactions, 'expense'), [transactions]);
  const essentiality = useMemo(() => calculateEssentialityBreakdown(transactions), [transactions]);
  const potentialSavings = useMemo(
    () => calculatePotentialSavings(essentiality.optimizable, essentiality.discretionary),
    [essentiality]
  );

  const biggestExpenses = useMemo(() => {
    return transactions
      .filter((t) => t.transaction_type === 'expense')
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5);
  }, [transactions]);

  // Export CSV
  const handleExportCSV = () => {
    try {
      const headers = ['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Essentiality', 'Merchant', 'Payment Method'];
      const rows = transactions.map((t) => [
        t.purchase_date,
        t.transaction_type,
        `"${t.description.replace(/"/g, '""')}"`,
        `"${t.category?.name || 'Uncategorized'}"`,
        t.amount,
        t.currency,
        t.essentiality,
        `"${t.merchant || ''}"`,
        `"${t.payment_method || ''}"`,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `SpendWise_Financial_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Report CSV exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Report Controls & Export Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        {/* Report frequency selector */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          {[
            { id: 'weekly', label: 'Weekly' },
            { id: 'monthly', label: 'Monthly' },
            { id: 'quarterly', label: 'Quarterly' },
            { id: 'annual', label: 'Annual' },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setReportType(r.id as any)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                reportType === r.id
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" />
            Print Report
          </Button>
          <Button variant="ai" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Official Report Document Container */}
      <div className="p-6 md:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-8">
        {/* Report Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
              <Sparkles className="h-5 w-5" />
              <span>SpendWise AI Financial Statement</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Deterministic period statement audited by AI intelligence engine
            </p>
          </div>
          <div className="text-left md:text-right text-xs text-slate-500 space-y-0.5">
            <div><strong>Report Frequency:</strong> {reportType.toUpperCase()}</div>
            <div><strong>Generated At:</strong> {currentDateStr || 'Today'}</div>
            <div><strong>Base Currency:</strong> INR (₹)</div>
          </div>
        </div>

        {/* 10 Required Report Sections */}
        {/* 1. Core Financial Highlights */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            1. Income, Expense & Actual Savings Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Total Income</span>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                {formatCurrency(summary.totalIncome)}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Total Expenses</span>
              <div className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-1">
                {formatCurrency(summary.totalExpenses)}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
              <span className="text-[11px] text-slate-500">Remaining Balance</span>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
                {formatCurrency(summary.remainingBalance)}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">
                Actual Savings
              </span>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(summary.actualSavings)}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Category Spending Breakdown */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            2. Category Distribution
          </h3>
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-center">Transactions</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Share (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {categories.map((c) => (
                  <tr key={c.categoryId}>
                    <td className="p-3 font-medium text-slate-900 dark:text-white">
                      {c.categoryName}
                    </td>
                    <td className="p-3 text-center text-slate-500">{c.transactionCount}</td>
                    <td className="p-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                      {formatCurrency(c.amount)}
                    </td>
                    <td className="p-3 text-right text-slate-500">{c.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Essentiality Breakdown & Biggest Expenses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              3. Essentiality Audit
            </h3>
            <div className="space-y-3 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Essential Needs:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatCurrency(essentiality.essential)} ({essentiality.essentialPct.toFixed(0)}%)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Optimizable Spending:</span>
                <span className="font-bold text-amber-600">
                  {formatCurrency(essentiality.optimizable)} ({essentiality.optimizablePct.toFixed(0)}%)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Discretionary Leisure:</span>
                <span className="font-bold text-purple-600">
                  {formatCurrency(essentiality.discretionary)} ({essentiality.discretionaryPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              4. Largest Single Expenses
            </h3>
            <div className="space-y-2 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
              {biggestExpenses.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center py-1">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">
                      {tx.description}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatDate(tx.purchase_date)} • {tx.category?.name}
                    </div>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatCurrency(Number(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. AI Observations & Potential Savings Opportunities */}
        <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60 space-y-2">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>AI Executive Observations & Potential Savings Roadmap</span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            Your net retained cashflow for this statement stands at {formatCurrency(summary.actualSavings)}. Your largest spending category was {categories[0]?.categoryName || 'General'} which commanded {categories[0]?.percentage.toFixed(0)}% of expenses.
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            By optimizing {formatCurrency(essentiality.optimizable)} of identified optimizable expenses by 20%, you have a potential incremental monthly savings opportunity of <strong className="text-emerald-700 dark:text-emerald-400">{formatCurrency(potentialSavings.monthlyPotentialSavings)}</strong> ({formatCurrency(potentialSavings.annualPotentialSavings)} per year).
          </p>
        </div>
      </div>
    </div>
  );
}
