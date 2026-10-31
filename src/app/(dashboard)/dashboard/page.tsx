'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  Building2,
  Car,
  ChevronRight,
  Coins,
  Ellipsis,
  Film,
  Gauge,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PiggyBank,
  Plane,
  Plus,
  ReceiptIndianRupee,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Stat } from '@/components/ui/stat';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/layout/session-provider';
import { DataService } from '@/lib/data-service';
import { PURCHASE_KINDS, kindForCategory, kindForTransaction } from '@/lib/categories/kinds';
import { Transaction, Budget, PeriodType } from '@/types/database';
import {
  calculateFinancialSummary,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
  calculateBudgetSpent,
  getBudgetStatus,
  getReportingPeriodRange,
  filterTransactionsByDateRange,
  toLocalDateString,
  type DashboardPeriod,
} from '@/lib/calculations/finance';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'this_week', label: 'Last 7 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
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

/** How the period reads at the end of a sentence: "You've spent ₹500 ___." */
const PERIOD_PHRASE: Record<DashboardPeriod, string> = {
  this_week: 'in the last 7 days',
  this_month: 'this month',
  last_month: 'last month',
  last_3_months: 'in the last 3 months',
  last_6_months: 'in the last 6 months',
  this_year: 'this year',
  all_time: 'in total',
};

const BUDGET_PERIOD_LABEL: Record<PeriodType, string> = {
  weekly: 'this week',
  monthly: 'this month',
  quarterly: 'this quarter',
  yearly: 'this year',
};

const BUDGET_PERIOD_POSSESSIVE: Record<PeriodType, string> = {
  weekly: "this week's",
  monthly: "this month's",
  quarterly: "this quarter's",
  yearly: "this year's",
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  Car,
  Home: House,
  House,
  Zap,
  HeartPulse,
  ShoppingBag,
  Film,
  GraduationCap,
  Plane,
  Sparkles,
  Repeat,
  Landmark,
  Gift,
  MoreHorizontal: Ellipsis,
  Ellipsis,
  Briefcase,
  Laptop,
  Building2,
  Coins,
  Wallet,
};

const SPENDING_TYPES = [
  { key: 'essential', label: 'Essential', hint: 'Rent, bills, groceries', color: 'var(--essential)' },
  { key: 'optimizable', label: 'Could trim', hint: 'Worth a second look', color: 'var(--trim)' },
  { key: 'discretionary', label: 'Optional', hint: 'Treats and nice-to-haves', color: 'var(--optional)' },
] as const;

type Tone = 'success' | 'warning' | 'danger';

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

const TONE_TILE: Record<Tone, string> = {
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/14 text-warning',
  danger: 'bg-destructive/10 text-destructive',
};

function budgetTone(pct: number): Tone {
  const status = getBudgetStatus(pct);
  if (status === 'on_track') return 'success';
  if (status === 'warning') return 'warning';
  return 'danger';
}

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Hello';
}

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
  const { user } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>('this_month');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  const [greeting, setGreeting] = useState<string>('');
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
        // Clock-dependent values are set after mount so server and client render the same markup.
        setCurrentDateStr(toLocalDateString());
        setGreeting(greetingFor(new Date().getHours()));
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const firstName = user?.display_name?.trim().split(/\s+/)[0] ?? '';

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
    const pct = (spent / amount) * 100;
    return {
      amount,
      spent,
      left: amount - spent,
      pct,
      tone: budgetTone(pct),
      periodLabel: BUDGET_PERIOD_LABEL[overallBudget.period_type] ?? 'this period',
      periodPossessive: BUDGET_PERIOD_POSSESSIVE[overallBudget.period_type] ?? "this period's",
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

  const title = `${greeting || 'Hello'}${firstName ? `, ${firstName}` : ''}`;

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} description="Welcome to SpendWise. Let's start with your first expense." />
        <EmptyState
          className="py-20"
          icon={<ReceiptIndianRupee />}
          title="Nothing here yet"
          description="Add your first expense by typing it, saying it out loud, or filling in a short form. This page fills in from there."
          action={
            <Link href="/add-expense" className={buttonVariants()}>
              <Plus />
              Add an expense
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
  const periodPhrase = PERIOD_PHRASE[selectedPeriod];

  const summarySentence = (
    <>
      {summary.totalExpenses > 0 ? (
        <>
          You&apos;ve spent{' '}
          <span className="tabular font-semibold text-foreground">{formatCurrency(summary.totalExpenses)}</span>{' '}
          {periodPhrase}.
        </>
      ) : (
        <>No spending recorded {periodPhrase}.</>
      )}{' '}
      {budgetUsage ? (
        budgetUsage.left >= 0 ? (
          <>
            <span className={cn('tabular font-semibold', TONE_TEXT[budgetUsage.tone])}>
              {formatCurrency(budgetUsage.left)}
            </span>{' '}
            is left in {budgetUsage.periodPossessive} budget.
          </>
        ) : (
          <>
            You&apos;re{' '}
            <span className="tabular font-semibold text-destructive">{formatCurrency(-budgetUsage.left)}</span> over{' '}
            {budgetUsage.periodPossessive} budget.
          </>
        )
      ) : (
        <>
          You haven&apos;t set a budget yet.{' '}
          <Link href="/budgets" className="font-medium text-primary underline-offset-4 hover:underline">
            Set one up
          </Link>
        </>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-rise">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">{summarySentence}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="home-period" className="text-[13px] text-muted-foreground">
            Showing
          </label>
          <Select
            id="home-period"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as DashboardPeriod)}
            className="w-40"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-rise" style={{ animationDelay: '40ms' }}>
        <Stat
          label="Money in"
          icon={
            <IconTile className="bg-success/12 text-success">
              <ArrowDownLeft />
            </IconTile>
          }
          value={formatCurrency(summary.totalIncome)}
          hint={`${incomeCount} ${incomeCount === 1 ? 'payment' : 'payments'} received ${periodPhrase}`}
        />
        <Stat
          label="Spent"
          icon={
            <IconTile className="bg-primary/10 text-primary">
              <ArrowUpRight />
            </IconTile>
          }
          value={formatCurrency(summary.totalExpenses)}
          hint={`${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'} ${periodPhrase}`}
        />
        <Stat
          label="Saved"
          icon={
            <IconTile
              className={summary.actualSavings < 0 ? 'bg-destructive/10 text-destructive' : 'bg-info/12 text-info'}
            >
              <PiggyBank />
            </IconTile>
          }
          value={
            <span className={cn(summary.actualSavings < 0 && 'text-destructive')}>
              {formatCurrency(summary.actualSavings)}
            </span>
          }
          hint={
            savingsRate === null
              ? 'No money in recorded yet'
              : summary.actualSavings < 0
                ? 'You spent more than came in'
                : `You kept ${savingsRate.toFixed(0)}% of what came in`
          }
        />
        {budgetUsage ? (
          <Stat
            label="Budget left"
            icon={
              <IconTile className={TONE_TILE[budgetUsage.tone]}>
                <Gauge />
              </IconTile>
            }
            value={
              budgetUsage.left >= 0 ? (
                formatCurrency(budgetUsage.left)
              ) : (
                <span className="text-destructive">{formatCurrency(-budgetUsage.left)} over</span>
              )
            }
            hint={
              <span className="tabular">
                {formatCurrency(budgetUsage.spent)} of {formatCurrency(budgetUsage.amount)} used{' '}
                {budgetUsage.periodLabel}
              </span>
            }
          >
            <Progress value={budgetUsage.pct} tone={budgetUsage.tone} />
          </Stat>
        ) : (
          <Stat
            label="Budget left"
            icon={
              <IconTile className="bg-muted text-muted-foreground">
                <Gauge />
              </IconTile>
            }
            value={<span className="text-muted-foreground">No budget</span>}
            hint="Set a monthly budget to see how much you have left."
          >
            <Link href="/budgets" className={buttonVariants({ variant: 'outline', className: 'self-start' })}>
              Set a budget
              <ChevronRight />
            </Link>
          </Stat>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3 animate-rise" style={{ animationDelay: '80ms' }}>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="space-y-1">
              <CardTitle>Money in and out</CardTitle>
              <CardDescription>
                Each bar is one {granularity}, {periodLabel}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <LegendDot color="var(--success)" label="Money in" />
              <LegendDot color="var(--primary)" label="Spent" />
            </div>
          </CardHeader>
          <CardContent>
            {cashFlow.length === 0 ? (
              <ChartEmpty label={`Nothing recorded ${periodPhrase}`} />
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
                    <Bar dataKey="income" name="Money in" fill="var(--success)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="expenses" name="Spent" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending mix</CardTitle>
            <CardDescription>What kind of spending it was</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="tabular text-2xl font-semibold tracking-[-0.02em]">
                {formatCurrency(summary.totalExpenses)}
              </div>
              <div className="text-xs text-muted-foreground">Spent {periodPhrase}</div>
            </div>
            <SpendingTypeBar
              segments={SPENDING_TYPES.map((t) => ({
                label: t.label,
                color: t.color,
                pct: essentiality[`${t.key}Pct`],
              }))}
            />
            <ul className="divide-y divide-border">
              {SPENDING_TYPES.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">{t.label}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.hint}</div>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="tabular text-sm font-medium">{formatCurrency(essentiality[t.key])}</span>
                    <span className="tabular w-9 text-right text-xs text-muted-foreground">
                      {essentiality[`${t.key}Pct`].toFixed(0)}%
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
              <CardTitle>Latest activity</CardTitle>
              <CardDescription>Your most recent entries {periodPhrase}</CardDescription>
            </div>
            <Link href="/transactions" className={buttonVariants({ variant: 'ghost' })}>
              See all
              <ChevronRight />
            </Link>
          </CardHeader>
          {recentTransactions.length === 0 ? (
            <CardContent>
              <ChartEmpty label={`Nothing recorded ${periodPhrase}`} className="h-32" />
            </CardContent>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {recentTransactions.map((tx) => {
                const isIncome = tx.transaction_type === 'income';
                const kind = PURCHASE_KINDS[kindForTransaction(tx)];
                const Icon =
                  (tx.category?.icon && CATEGORY_ICONS[tx.category.icon]) ||
                  (isIncome ? ArrowDownLeft : ReceiptIndianRupee);
                const meta = [tx.category?.name || 'Uncategorized', tx.merchant].filter(Boolean).join(' · ');
                return (
                  <li
                    key={tx.id}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/50"
                  >
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${kind.color}1f`, color: kind.color }}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{tx.description}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {meta} · <span className="tabular">{formatDay(tx.purchase_date)}</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'tabular shrink-0 text-right text-sm font-medium',
                        isIncome ? 'text-success' : 'text-foreground'
                      )}
                    >
                      {isIncome && '+'}
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
            <CardDescription>Where most of your money went</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <ChartEmpty label="No spending yet" className="h-32" />
            ) : (
              <ul className="space-y-4">
                {categoryBreakdown.slice(0, 5).map((cat) => {
                  const color =
                    PURCHASE_KINDS[
                      kindForCategory({ id: cat.categoryId, name: cat.categoryName, category_type: 'expense' })
                    ].color;
                  return (
                    <li key={cat.categoryId} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                          <span className="truncate text-foreground">{cat.categoryName}</span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="tabular font-medium">{formatCurrency(cat.amount)}</span>
                          <span className="tabular w-9 text-right text-xs text-muted-foreground">
                            {cat.percentage.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(2, Math.min(100, cat.percentage))}%`, background: color }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Small pieces ----

function IconTile({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('flex size-8 items-center justify-center rounded-lg', className)}>{children}</span>;
}

function LegendDot({ color, label, className }: { color: string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function SpendingTypeBar({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  const visible = segments.filter((s) => s.pct > 0);
  if (visible.length === 0) return <div className="h-2.5 w-full rounded-full bg-muted" />;
  return (
    <div
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
      role="img"
      aria-label={visible.map((s) => `${s.label} ${s.pct.toFixed(0)}%`).join(', ')}
    >
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
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-52" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
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
          <Skeleton className="h-2.5 w-full" />
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
