'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Gauge, PiggyBank, Plus, ReceiptIndianRupee } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Stat } from '@/components/ui/stat';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DataService } from '@/lib/data-service';
import { Transaction, Budget, PeriodType } from '@/types/database';
import {
  calculateFinancialSummary,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
  calculateBudgetSpent,
  getReportingPeriodRange,
  filterTransactionsByDateRange,
  toLocalDateString,
  type DashboardPeriod,
} from '@/lib/calculations/finance';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'this_week', label: '7 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: '3 months' },
  { value: 'this_year', label: 'YTD' },
  { value: 'all_time', label: 'All time' },
];

const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  this_week: 'the last 7 days',
  this_month: 'this month',
  last_month: 'last month',
  last_3_months: 'the last 3 months',
  last_6_months: 'the last 6 months',
  this_year: 'this year',
  all_time: 'all time',
};

const BUDGET_PERIOD_LABEL: Record<PeriodType, string> = {
  weekly: 'this week',
  monthly: 'this month',
  quarterly: 'this quarter',
  yearly: 'this year',
};

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--foreground)',
  boxShadow: 'var(--shadow-pop)',
};

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };

// ---- Date helpers (UTC on YYYY-MM-DD strings, so the time zone never shifts a day) ----

function parseDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dayString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDay(dateStr: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(parseDay(dateStr));
}

function compactCurrency(value: number): string {
  if (value === 0) return '0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

type Granularity = 'day' | 'week' | 'month';

/** Bucket key for a date: the day itself, the Monday of its week, or the 1st of its month. */
function bucketKey(dateStr: string, granularity: Granularity): string {
  if (granularity === 'day') return dateStr;
  const d = parseDay(dateStr);
  if (granularity === 'month') return `${dateStr.slice(0, 7)}-01`;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dayString(d);
}

function nextBucket(key: string, granularity: Granularity): string {
  const d = parseDay(key);
  if (granularity === 'day') d.setUTCDate(d.getUTCDate() + 1);
  else if (granularity === 'week') d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return dayString(d);
}

function granularityFor(period: DashboardPeriod): Granularity {
  if (period === 'this_week' || period === 'this_month' || period === 'last_month') return 'day';
  if (period === 'last_3_months' || period === 'last_6_months') return 'week';
  return 'month';
}

// ---- Page ----

export default function DashboardOverviewPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>('this_month');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const txs = await DataService.getTransactions();
        const bgts = await DataService.getBudgets();
        setTransactions(txs);
        setBudgets(bgts);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
        toast.error(err instanceof Error ? err.message : 'Could not load dashboard data');
      } finally {
        setCurrentDateStr(toLocalDateString());
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Overall budget = the budget with no category. No fallback amount: without one we say so.
  const overallBudget = useMemo(() => budgets.find((b) => b.category_id === null) ?? null, [budgets]);

  const periodRange = useMemo(
    () => (currentDateStr ? getReportingPeriodRange(selectedPeriod, currentDateStr) : null),
    [selectedPeriod, currentDateStr]
  );

  const periodTransactions = useMemo(() => {
    if (!currentDateStr) return transactions;
    return filterTransactionsByDateRange(transactions, periodRange);
  }, [transactions, periodRange, currentDateStr]);

  const summary = useMemo(() => calculateFinancialSummary(periodTransactions), [periodTransactions]);

  const categoryBreakdown = useMemo(
    () => calculateCategoryBreakdown(periodTransactions, 'expense'),
    [periodTransactions]
  );

  const essentiality = useMemo(() => calculateEssentialityBreakdown(periodTransactions), [periodTransactions]);

  // Budget use is measured over the budget's own period (e.g. this month), not the selected view.
  const budgetUsage = useMemo(() => {
    if (!overallBudget || !currentDateStr) return null;
    const amount = Number(overallBudget.amount);
    if (!(amount > 0)) return null;
    const spent = calculateBudgetSpent(transactions, overallBudget, currentDateStr);
    return {
      amount,
      spent,
      pct: (spent / amount) * 100,
      periodLabel: BUDGET_PERIOD_LABEL[overallBudget.period_type] ?? 'this period',
    };
  }, [overallBudget, transactions, currentDateStr]);

  const recentTransactions = useMemo(
    () =>
      [...periodTransactions]
        .sort(
          (a, b) =>
            b.purchase_date.localeCompare(a.purchase_date) || (b.occurred_at ?? '').localeCompare(a.occurred_at ?? '')
        )
        .slice(0, 6),
    [periodTransactions]
  );

  const granularity = granularityFor(selectedPeriod);

  const cashFlow = useMemo(() => {
    if (periodTransactions.length === 0) return [];
    const dates = periodTransactions.map((t) => t.purchase_date).sort();
    const lastTx = dates[dates.length - 1];
    let start = periodRange?.startDate ?? dates[0];
    let end = periodRange?.endDate ?? lastTx;
    // Don't draw empty future days for periods that run past today.
    if (currentDateStr) {
      const cap = lastTx > currentDateStr ? lastTx : currentDateStr;
      if (end > cap) end = cap;
    }
    if (start > end) start = end;

    const buckets = new Map<string, { key: string; income: number; expenses: number }>();
    const last = bucketKey(end, granularity);
    for (let key = bucketKey(start, granularity); key <= last; key = nextBucket(key, granularity)) {
      buckets.set(key, { key, income: 0, expenses: 0 });
      if (buckets.size > 400) break;
    }
    for (const t of periodTransactions) {
      const entry = buckets.get(bucketKey(t.purchase_date, granularity));
      if (!entry) continue;
      if (t.transaction_type === 'income') entry.income += Number(t.amount);
      else if (t.transaction_type === 'expense') entry.expenses += Number(t.amount);
    }

    const spansYears = start.slice(0, 4) !== end.slice(0, 4);
    return Array.from(buckets.values()).map((b) => ({
      ...b,
      label:
        granularity === 'month'
          ? formatDay(b.key, spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' })
          : formatDay(b.key),
    }));
  }, [periodTransactions, periodRange, currentDateStr, granularity]);

  if (loading) return <DashboardSkeleton />;

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" description="Income, spending and budget at a glance." />
        <EmptyState
          className="py-20"
          icon={<ReceiptIndianRupee />}
          title="No transactions yet"
          description="Add your first expense by typing, speaking or filling in a form. Your overview fills in from there."
          action={
            <Link href="/add-expense" className={buttonVariants()}>
                <Plus />
                New expense
              </Link>
          }
        />
      </div>
    );
  }

  const savingsRate = summary.totalIncome > 0 ? (summary.actualSavings / summary.totalIncome) * 100 : null;
  const expenseCount = periodTransactions.filter((t) => t.transaction_type === 'expense').length;
  const incomeCount = periodTransactions.length - expenseCount;
  const periodLabel = PERIOD_LABEL[selectedPeriod];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Income, spending and budget at a glance."
        actions={
          <div className="-mx-1 max-w-full overflow-x-auto px-1 py-0.5 [&_button]:whitespace-nowrap">
            <Segmented value={selectedPeriod} onChange={setSelectedPeriod} options={PERIOD_OPTIONS} size="sm" />
          </div>
        }
      />

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-rise">
        <Stat
          label="Income"
          icon={<ArrowDownLeft />}
          value={formatCurrency(summary.totalIncome)}
          hint={`${incomeCount} ${incomeCount === 1 ? 'credit' : 'credits'} in ${periodLabel}`}
        />
        <Stat
          label="Spent"
          icon={<ArrowUpRight />}
          value={formatCurrency(summary.totalExpenses)}
          hint={`${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'} in ${periodLabel}`}
        />
        <Stat
          label="Net savings"
          icon={<PiggyBank />}
          value={formatCurrency(summary.actualSavings)}
          hint={
            savingsRate === null
              ? 'No income recorded'
              : summary.actualSavings < 0
                ? 'Spent more than you earned'
                : `${savingsRate.toFixed(0)}% of income kept`
          }
        />
        {budgetUsage ? (
          <Stat
            label="Budget used"
            icon={<Gauge />}
            value={
              <span className={cn(budgetUsage.pct >= 100 && 'text-destructive')}>{budgetUsage.pct.toFixed(0)}%</span>
            }
            hint={
              <span className="tabular">
                {formatCurrency(budgetUsage.spent)} of {formatCurrency(budgetUsage.amount)} {budgetUsage.periodLabel}
              </span>
            }
          >
            <Progress value={budgetUsage.pct} tone={budgetUsage.pct >= 100 ? 'danger' : 'default'} />
          </Stat>
        ) : (
          <Stat
            label="Budget used"
            icon={<Gauge />}
            value={<span className="text-muted-foreground">No budget</span>}
            hint="Set an overall budget to track how much you have left."
          >
            <Link href="/budgets" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start' })}>
                Set budget
                <ChevronRight />
              </Link>
          </Stat>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3 animate-rise" style={{ animationDelay: '60ms' }}>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Cash flow</CardTitle>
              <CardDescription>
                Income and expenses per {granularity} for {periodLabel}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <LegendDot color="var(--chart-3)" label="Income" />
              <LegendDot color="var(--chart-1)" label="Expenses" />
            </div>
          </CardHeader>
          <CardContent>
            {cashFlow.length === 0 ? (
              <ChartEmpty label={`No activity in ${periodLabel}`} />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashFlow} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barGap={2}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={12}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(v) => compactCurrency(Number(v))}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--accent)' }}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: 'var(--muted-foreground)', marginBottom: 4 }}
                      itemStyle={{ color: 'var(--foreground)', padding: 0 }}
                      formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name]}
                    />
                    <Bar dataKey="income" name="Income" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar
                      dataKey="expenses"
                      name="Expenses"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending mix</CardTitle>
            <CardDescription>By essentiality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="tabular text-2xl font-semibold tracking-[-0.02em]">
                {formatCurrency(summary.totalExpenses)}
              </div>
              <div className="text-xs text-muted-foreground">Total spent in {periodLabel}</div>
            </div>
            <EssentialityBar
              segments={[
                { label: 'Essential', pct: essentiality.essentialPct, color: 'var(--chart-1)' },
                { label: 'Optimizable', pct: essentiality.optimizablePct, color: 'var(--chart-2)' },
                { label: 'Discretionary', pct: essentiality.discretionaryPct, color: 'var(--chart-4)' },
              ]}
            />
            <ul className="divide-y divide-border">
              {[
                {
                  label: 'Essential',
                  amount: essentiality.essential,
                  pct: essentiality.essentialPct,
                  color: 'var(--chart-1)',
                },
                {
                  label: 'Optimizable',
                  amount: essentiality.optimizable,
                  pct: essentiality.optimizablePct,
                  color: 'var(--chart-2)',
                },
                {
                  label: 'Discretionary',
                  amount: essentiality.discretionary,
                  pct: essentiality.discretionaryPct,
                  color: 'var(--chart-4)',
                },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <LegendDot color={row.color} label={row.label} className="text-sm text-foreground" />
                  <span className="flex items-baseline gap-2">
                    <span className="tabular font-medium">{formatCurrency(row.amount)}</span>
                    <span className="tabular w-9 text-right text-xs text-muted-foreground">
                      {row.pct.toFixed(0)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-3 animate-rise" style={{ animationDelay: '120ms' }}>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>Latest activity in {periodLabel}</CardDescription>
            </div>
            <Link href="/transactions" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                View all
                <ChevronRight />
              </Link>
          </CardHeader>
          {recentTransactions.length === 0 ? (
            <CardContent>
              <ChartEmpty label={`No transactions in ${periodLabel}`} className="h-32" />
            </CardContent>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {recentTransactions.map((tx) => {
                const isIncome = tx.transaction_type === 'income';
                const meta = [tx.category?.name || 'Uncategorized', tx.merchant].filter(Boolean).join(' · ');
                return (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{tx.description}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {meta}
                        <span className="text-subtle"> · </span>
                        <span className="tabular">{formatDay(tx.purchase_date)}</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'tabular shrink-0 text-right text-sm font-medium',
                        isIncome ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {isIncome ? '+' : '-'}
                      {formatCurrency(Number(tx.amount))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
            <CardDescription>Where your money went</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <ChartEmpty label="No spending yet" className="h-32" />
            ) : (
              <ul className="space-y-4">
                {categoryBreakdown.slice(0, 5).map((cat) => (
                  <li key={cat.categoryId} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-foreground">{cat.categoryName}</span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="tabular font-medium">{formatCurrency(cat.amount)}</span>
                        <span className="tabular w-9 text-right text-xs text-muted-foreground">
                          {cat.percentage.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/80"
                        style={{ width: `${Math.max(2, Math.min(100, cat.percentage))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Small pieces ----

function LegendDot({ color, label, className }: { color: string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="size-2 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function EssentialityBar({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  const visible = segments.filter((s) => s.pct > 0);
  if (visible.length === 0) return <div className="h-2 w-full rounded-full bg-muted" />;
  return (
    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Spending by essentiality">
      {visible.map((s) => (
        <div key={s.label} title={`${s.label} ${s.pct.toFixed(0)}%`} style={{ width: `${s.pct}%`, background: s.color }} />
      ))}
    </div>
  );
}

function ChartEmpty({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'bg-grid flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground',
        className
      )}
    >
      {label}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
