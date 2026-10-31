'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart as PieIcon,
  Plus,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Layers,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import { Budget, Transaction, Category } from '@/types/database';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_SYSTEM_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Modal create state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('overall'); // 'overall' or category id
  const [budgetAmount, setBudgetAmount] = useState<string>('');

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const bgts = await DataService.getBudgets();
        const txs = await DataService.getTransactions();
        const cats = await DataService.getCategories();
        setBudgets(bgts);
        setTransactions(txs);
        setCategories(cats);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute spent amount for each budget based on real transactions
  const budgetAnalytics = useMemo(() => {
    return budgets.map((b) => {
      let spent = 0;
      if (b.category_id === null) {
        // Overall budget: sum of all expense transactions
        spent = transactions
          .filter((t) => t.transaction_type === 'expense')
          .reduce((sum, t) => sum + Number(t.amount), 0);
      } else {
        spent = transactions
          .filter((t) => t.transaction_type === 'expense' && t.category_id === b.category_id)
          .reduce((sum, t) => sum + Number(t.amount), 0);
      }

      const total = Number(b.amount);
      const remaining = Math.max(0, total - spent);
      const utilization = total > 0 ? (spent / total) * 100 : 0;
      const isOver = spent > total;

      let statusBadge: { text: string; variant: 'success' | 'warning' | 'destructive' } = {
        text: 'On Track',
        variant: 'success',
      };

      if (utilization >= 100) {
        statusBadge = { text: 'Over Budget', variant: 'destructive' };
      } else if (utilization >= 90) {
        statusBadge = { text: 'Critical (>90%)', variant: 'destructive' };
      } else if (utilization >= 75) {
        statusBadge = { text: 'Approaching Limit (>75%)', variant: 'warning' };
      }

      const categoryName = b.category_id === null
        ? 'Overall Monthly Spending'
        : categories.find((c) => c.id === b.category_id)?.name || 'Category Budget';

      return {
        ...b,
        spent,
        total,
        remaining,
        utilization,
        isOver,
        statusBadge,
        categoryName,
      };
    });
  }, [budgets, transactions, categories]);

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(budgetAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid positive budget amount.');
      return;
    }

    try {
      const catId = selectedCategory === 'overall' ? null : selectedCategory;
      const created = await DataService.saveBudget({
        user_id: 'current-user',
        category_id: catId,
        amount: amt,
        period_type: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
        alert_thresholds: [75, 90, 100],
      });

      setBudgets((prev) => [created, ...prev]);
      toast.success('Budget created successfully!');
      setIsModalOpen(false);
      setBudgetAmount('');
    } catch {
      toast.error('Failed to create budget');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    try {
      await DataService.deleteBudget(id);
      setBudgets((prev) => prev.filter((b) => b.id !== id));
      toast.success('Budget removed.');
    } catch {
      toast.error('Failed to delete budget');
    }
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
      {/* Top Banner / Add Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Active Budgets</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Automated tracking with early warning thresholds (75%, 90%, 100%)
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-indigo-600 text-xs">
          <Plus className="h-4 w-4" />
          Create New Budget
        </Button>
      </div>

      {/* Budget Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {budgetAnalytics.map((item) => (
          <Card key={item.id} className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {item.categoryName}
                </h3>
                <span className="text-[11px] text-slate-400 uppercase font-medium">
                  {item.period_type} period
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={item.statusBadge.variant} className="text-[10px]">
                  {item.statusBadge.text}
                </Badge>
                <button
                  onClick={() => handleDeleteBudget(item.id)}
                  className="text-slate-400 hover:text-rose-500 transition-colors p-0.5"
                  title="Remove budget"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Spent vs Budget */}
            <div className="space-y-1">
              <div className="flex justify-between items-baseline text-xs">
                <span className="text-slate-500">Spent: <strong className="text-slate-900 dark:text-white">{formatCurrency(item.spent)}</strong></span>
                <span className="text-slate-400">Limit: {formatCurrency(item.total)}</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    item.utilization > 100
                      ? 'bg-rose-600'
                      : item.utilization > 90
                      ? 'bg-rose-500'
                      : item.utilization > 75
                      ? 'bg-amber-500'
                      : 'bg-indigo-600'
                  }`}
                  style={{ width: `${Math.min(item.utilization, 100)}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-400 pt-0.5">
                <span>{item.utilization.toFixed(1)}% utilized</span>
                <span>
                  {item.isOver
                    ? `${formatCurrency(item.spent - item.total)} over limit`
                    : `${formatCurrency(item.remaining)} remaining`}
                </span>
              </div>
            </div>

            {/* Alert notification if near limit */}
            {item.utilization >= 75 && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  item.utilization >= 100
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                }`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-[11px] leading-tight">
                  {item.utilization >= 100
                    ? 'Warning: Budget ceiling exceeded. Review optional purchases.'
                    : 'Caution: Approaching monthly budget threshold.'}
                </span>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Modal to create new budget */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Set Budget Limit
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBudget} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Budget Target
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="overall">Overall Monthly Budget (All categories)</option>
                  {categories
                    .filter((c) => c.category_type === 'expense')
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Monthly Limit (₹ INR)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 15000"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  required
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-500">
                You will automatically receive early notifications when spending crosses 75%, 90%, and 100% of this limit.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="ai">
                  Save Budget
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
