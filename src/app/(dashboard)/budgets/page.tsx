'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Wallet,
  Utensils,
  ShoppingBasket,
  Car,
  House,
  HeartPulse,
  ShoppingBag,
  Ticket,
  Repeat,
  GraduationCap,
  Landmark,
  Tag,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/ui/page-header';
import { Section } from '@/components/ui/section';
import { Money } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import { Budget, Transaction, Category, PeriodType } from '@/types/database';
import { cn } from '@/lib/utils';
import {
  calculateBudgetSpent,
  getBudgetPeriodRange,
  getBudgetStatus,
  toLocalDateString,
  type BudgetStatus,
} from '@/lib/calculations/finance';
import { PURCHASE_KINDS, kindForCategory, type PurchaseKind } from '@/lib/categories/kinds';
import { toast } from 'sonner';

type StatusTone = 'default' | 'warning' | 'danger';

/** Progress colour per status: brand while on track, warning when close, destructive near/over the limit. */
const STATUS: Record<BudgetStatus, { text: string; tone: StatusTone }> = {
  on_track: { text: 'On track', tone: 'default' },
  warning: { text: 'Getting close', tone: 'warning' },
  critical: { text: 'Almost at limit', tone: 'danger' },
  over_budget: { text: 'Over budget', tone: 'danger' },
};

const KIND_ICONS: Record<PurchaseKind, LucideIcon> = {
  food: Utensils,
  groceries: ShoppingBasket,
  transport: Car,
  home: House,
  health: HeartPulse,
  shopping: ShoppingBag,
  fun: Ticket,
  subscriptions: Repeat,
  learning: GraduationCap,
  money: Landmark,
  other: Tag,
  income: Banknote,
};

/** Round 32px tile tinted with the kind colour (neutral for an all-spending budget). */
function BudgetIcon({ kind }: { kind: PurchaseKind | null }) {
  if (!kind) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground [&_svg]:size-4">
        <Wallet aria-hidden />
      </span>
    );
  }
  const { color } = PURCHASE_KINDS[kind];
  const Icon = KIND_ICONS[kind];
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4"
      style={{ background: color + '1f', color }}
    >
      <Icon aria-hidden />
    </span>
  );
}

const PERIOD_LABELS: Record<PeriodType, string> = {
  weekly: 'This week',
  monthly: 'This month',
  quarterly: 'This quarter',
  yearly: 'This year',
};

/** Whole days from `from` to `to` (both YYYY-MM-DD), counting both ends. */
function daysInclusive(from: string, to: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;
}

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

      const status = STATUS[getBudgetStatus(utilization)];
      const daysLeft = today ? daysInclusive(today, getBudgetPeriodRange(b.period_type, today).endDate) : null;

      const category = b.category_id === null ? undefined : categories.find((c) => c.id === b.category_id);
      const categoryName =
        b.category_id === null ? 'All spending' : category?.name || 'Category budget';
      const kind: PurchaseKind | null =
        b.category_id === null
          ? null
          : kindForCategory(category ?? { id: b.category_id, name: '', category_type: 'expense' });

      return {
        ...b,
        spent,
        total,
        remaining,
        utilization,
        isOver,
        status,
        daysLeft,
        categoryName,
        kind,
      };
    });
  }, [budgets, transactions, categories, today]);

  // The overall monthly budget is the hero; everything else is a row.
  const overall = useMemo(
    () =>
      budgetAnalytics.find((b) => b.category_id === null && b.period_type === 'monthly') ??
      budgetAnalytics.find((b) => b.category_id === null) ??
      null,
    [budgetAnalytics]
  );
  const rows = useMemo(
    () => budgetAnalytics.filter((b) => b.id !== overall?.id).sort((a, b) => b.utilization - a.utilization),
    [budgetAnalytics, overall]
  );

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(budgetAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter an amount above zero.');
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
      toast.success('Budget added');
      setIsModalOpen(false);
      setBudgetAmount('');
      setSelectedCategory('overall');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the budget');
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
      toast.error(err instanceof Error ? err.message : 'Could not remove the budget');
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  };

  const openCreate = (category: string = 'overall') => {
    setSelectedCategory(category);
    setIsModalOpen(true);
  };

  const newBudgetButton = (
    <Button onClick={() => openCreate()}>
      <Plus />
      New budget
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-12">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="space-y-1">
          <Skeleton className="mb-4 h-4 w-24" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-1 w-full max-w-sm rounded-full" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const deletingBudget = deletingId ? budgetAnalytics.find((b) => b.id === deletingId) : undefined;

  return (
    <div className="space-y-12">
      <PageHeader
        title="Budgets"
        description="Set a limit for the month and see how much you have left."
        actions={newBudgetButton}
      />

      {budgetAnalytics.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="No budgets yet"
          description="A budget is a spending limit for the month. Start with one for all your spending, or pick a category like food."
          action={newBudgetButton}
        />
      ) : (
        <>
          {/* Overall budget: what's left */}
          {overall ? (
            <section className="group space-y-4 animate-rise">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {overall.isOver ? 'Over budget' : 'Left to spend'} {PERIOD_LABELS[overall.period_type].toLowerCase()}
                  </p>
                  <Money
                    amount={overall.isOver ? overall.spent - overall.total : overall.remaining}
                    size="xl"
                    tone={overall.isOver ? 'danger' : 'default'}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'tabular text-[13px]',
                      overall.status.tone === 'default'
                        ? 'text-muted-foreground'
                        : overall.status.tone === 'warning'
                          ? 'text-warning'
                          : 'text-destructive'
                    )}
                  >
                    {overall.utilization.toFixed(0)}% used
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeletingId(overall.id)}
                    aria-label="Remove the all-spending budget"
                    title="Remove budget"
                    className="hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <Progress value={overall.utilization} tone={overall.status.tone} className="h-2" />
              <p className="text-[13px] text-muted-foreground">
                <Money amount={overall.spent} size="sm" decimals={false} tone="muted" /> spent of{' '}
                <Money amount={overall.total} size="sm" decimals={false} tone="muted" />
                {overall.daysLeft !== null && (
                  <>
                    {' '}
                    · {overall.daysLeft} {overall.daysLeft === 1 ? 'day' : 'days'} left
                  </>
                )}
              </p>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              You don&apos;t have a limit for all your spending yet.{' '}
              <button
                type="button"
                onClick={() => openCreate('overall')}
                className="text-foreground underline underline-offset-4 transition-colors hover:text-brand"
              >
                Set a monthly limit
              </button>{' '}
              to see what&apos;s left each day.
            </p>
          )}

          {/* Category budgets */}
          <Section
            title="By category"
            description={rows.length > 0 ? 'Fullest first' : undefined}
          >
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a limit for a category, like food or cabs, to keep a closer eye on it.{' '}
                <button
                  type="button"
                  onClick={() => {
                    const first = categories.find((c) => c.category_type === 'expense');
                    openCreate(first?.id ?? 'overall');
                  }}
                  className="text-foreground underline underline-offset-4 transition-colors hover:text-brand"
                >
                  Add one
                </button>
              </p>
            ) : (
              <ul className="-mx-3 divide-y divide-border/70">
                {rows.map((item, i) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-foreground/[0.025] animate-rise"
                    style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                  >
                    <BudgetIcon kind={item.kind} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm">{item.categoryName}</span>
                        {item.period_type !== 'monthly' && (
                          <span className="shrink-0 text-xs text-subtle">{PERIOD_LABELS[item.period_type]}</span>
                        )}
                      </div>
                      <Progress value={item.utilization} tone={item.status.tone} className="h-1 max-w-md" />
                    </div>
                    <div className="shrink-0 space-y-0.5 text-right">
                      <div className="text-sm">
                        {item.isOver ? (
                          <span className="text-destructive">
                            <Money amount={item.spent - item.total} size="sm" decimals={false} tone="danger" /> over
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            <Money
                              amount={item.remaining}
                              size="sm"
                              decimals={false}
                              tone={item.status.tone === 'default' ? 'brand' : item.status.tone}
                            />{' '}
                            left
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <Money amount={item.spent} size="sm" decimals={false} tone="muted" className="text-xs" /> of{' '}
                        <Money amount={item.total} size="sm" decimals={false} tone="muted" className="text-xs" />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeletingId(item.id)}
                      aria-label={`Remove ${item.categoryName} budget`}
                      title="Remove budget"
                      className="-mr-1 shrink-0 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* Create dialog */}
      <Dialog
        open={isModalOpen}
        onClose={closeCreate}
        title="New budget"
        description="Pick what the limit is for and how much you want to spend in a month. We'll let you know when you're getting close."
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" form="create-budget-form" loading={saving}>
              Add budget
            </Button>
          </>
        }
      >
        <form id="create-budget-form" onSubmit={handleCreateBudget} className="space-y-4">
          <Field label="What is it for?" htmlFor="budget-category">
            <Select
              id="budget-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="overall">All spending</option>
              {categories
                .filter((c) => c.category_type === 'expense')
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Limit per month (₹)" htmlFor="budget-amount">
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
        title="Remove this budget?"
        description={
          deletingBudget
            ? `The ${deletingBudget.categoryName.toLowerCase()} budget will be removed. Your saved expenses stay as they are.`
            : 'This budget will be removed. Your saved expenses stay as they are.'
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
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
