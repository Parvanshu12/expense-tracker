'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import { Budget, Transaction, Category, PeriodType } from '@/types/database';
import { formatCurrency } from '@/lib/utils';
import {
  calculateBudgetSpent,
  getBudgetStatus,
  toLocalDateString,
  type BudgetStatus,
} from '@/lib/calculations/finance';
import { toast } from 'sonner';

const STATUS_BADGES: Record<BudgetStatus, { text: string; variant: 'outline' | 'warning' | 'destructive' }> = {
  on_track: { text: 'On track', variant: 'outline' },
  warning: { text: 'Approaching limit', variant: 'warning' },
  critical: { text: 'Critical', variant: 'destructive' },
  over_budget: { text: 'Over budget', variant: 'destructive' },
};

const PERIOD_LABELS: Record<PeriodType, string> = {
  weekly: 'This week',
  monthly: 'This month',
  quarterly: 'This quarter',
  yearly: 'This year',
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_SYSTEM_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<string>('');

  // Create dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('overall'); // 'overall' or category id
  const [budgetAmount, setBudgetAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Stable callbacks: Dialog re-focuses its first control whenever onClose changes.
  const closeCreate = useCallback(() => setIsModalOpen(false), []);
  const closeDelete = useCallback(() => setDeletingId(null), []);

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const bgts = await DataService.getBudgets();
        const txs = await DataService.getTransactions();
        const cats = await DataService.getCategories();
        setToday(toLocalDateString());
        setBudgets(bgts);
        setTransactions(txs);
        setCategories(cats);
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Could not load budgets');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute spent amount for each budget based on real transactions
  const budgetAnalytics = useMemo(() => {
    return budgets.map((b) => {
      // `today` is only set after mount, to avoid a hydration mismatch
      const spent = today ? calculateBudgetSpent(transactions, b, today) : 0;
      const total = Number(b.amount);
      const remaining = Math.max(0, total - spent);
      const utilization = total > 0 ? (spent / total) * 100 : 0;
      const isOver = spent > total;

      const statusBadge = STATUS_BADGES[getBudgetStatus(utilization)];

      const categoryName =
        b.category_id === null
          ? 'Overall spending'
          : categories.find((c) => c.id === b.category_id)?.name || 'Category budget';

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
  }, [budgets, transactions, categories, today]);

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(budgetAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid positive budget amount.');
      return;
    }

    setSaving(true);
    try {
      const catId = selectedCategory === 'overall' ? null : selectedCategory;
      const created = await DataService.saveBudget({
        user_id: 'current-user',
        category_id: catId,
        amount: amt,
        period_type: 'monthly',
        start_date: toLocalDateString(),
        end_date: null,
        alert_thresholds: [75, 90, 100],
      });

      setBudgets((prev) => [created, ...prev]);
      toast.success('Budget created');
      setIsModalOpen(false);
      setBudgetAmount('');
      setSelectedCategory('overall');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create budget');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async (id: string) => {
    setDeleting(true);
    try {
      await DataService.deleteBudget(id);
      setBudgets((prev) => prev.filter((b) => b.id !== id));
      toast.success('Budget removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete budget');
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  };

  const newBudgetButton = (
    <Button onClick={() => setIsModalOpen(true)}>
      <Plus />
      New budget
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-4 p-5">
              <div className="flex justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-1.5 w-full rounded-full" />
              <Skeleton className="h-3 w-full" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const deletingBudget = deletingId ? budgetAnalytics.find((b) => b.id === deletingId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Spending limits with alerts at 75%, 90% and 100%."
        actions={newBudgetButton}
      />

      {budgetAnalytics.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="No budgets yet"
          description="Set a monthly limit for one category or for all of your spending."
          action={newBudgetButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgetAnalytics.map((item, i) => (
            <Card
              key={item.id}
              className="flex flex-col animate-rise"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <CardHeader className="flex-row items-start justify-between gap-3 pb-4">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate">{item.categoryName}</CardTitle>
                  <CardDescription>{PERIOD_LABELS[item.period_type] ?? item.period_type}</CardDescription>
                </div>
                <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1">
                  <Badge variant={item.statusBadge.variant}>{item.statusBadge.text}</Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeletingId(item.id)}
                    aria-label={`Delete ${item.categoryName} budget`}
                    title="Delete budget"
                    className="hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="mt-auto space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="tabular text-2xl font-semibold tracking-[-0.02em] text-foreground">
                    {formatCurrency(item.spent)}
                  </span>
                  <span className="tabular text-sm text-muted-foreground">of {formatCurrency(item.total)}</span>
                </div>

                <Progress value={item.utilization} tone={item.isOver ? 'danger' : 'default'} />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular">{item.utilization.toFixed(0)}% used</span>
                  {item.isOver ? (
                    <span className="tabular font-medium text-destructive">
                      {formatCurrency(item.spent - item.total)} over
                    </span>
                  ) : (
                    <span className="tabular">{formatCurrency(item.remaining)} left</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={isModalOpen}
        onClose={closeCreate}
        title="New budget"
        description="You'll get alerts as spending crosses 75%, 90% and 100% of the limit."
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" form="create-budget-form" loading={saving}>
              Create budget
            </Button>
          </>
        }
      >
        <form id="create-budget-form" onSubmit={handleCreateBudget} className="space-y-4">
          <Field label="Category" htmlFor="budget-category">
            <Select
              id="budget-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="overall">Overall (all categories)</option>
              {categories
                .filter((c) => c.category_type === 'expense')
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Monthly limit (₹)" htmlFor="budget-amount">
            <Input
              id="budget-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="15000"
              className="tabular"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              required
            />
          </Field>
        </form>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deletingId}
        onClose={closeDelete}
        title="Delete budget?"
        description={
          deletingBudget
            ? `The ${deletingBudget.categoryName.toLowerCase()} budget will be removed. Your transactions are not affected.`
            : 'This budget will be removed. Your transactions are not affected.'
        }
        footer={
          <>
            <Button variant="outline" onClick={closeDelete}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleting}
              onClick={() => deletingId && handleDeleteBudget(deletingId)}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
