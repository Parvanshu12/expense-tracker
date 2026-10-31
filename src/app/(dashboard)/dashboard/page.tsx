'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Area, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buttonVariants } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { Section } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/layout/session-provider';
import { DataService } from '@/lib/data-service';
import { PURCHASE_KINDS, kindForCategory, kindForTransaction } from '@/lib/categories/kinds';
import {
  calculateBudgetSpent,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
  calculateFinancialSummary,
  filterTransactionsByDateRange,
  getBudgetPeriodRange,
  getBudgetStatus,
  toLocalDateString,
} from '@/lib/calculations/finance';
import { cn, formatCurrency } from '@/lib/utils';
import type { Budget, Category, Transaction } from '@/types/database';

const MONTH_FMT = new Intl.DateTimeFormat('en-IN', { month: 'long' });
const DAY_FMT = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

function parseDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function relativeDay(date: string, today: string): string {
  if (date === today) return 'Today';
  const t = parseDate(today);
  t.setDate(t.getDate() - 1);
  if (date === toLocalDateString(t)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(parseDate(date));
}

/** Thin progress ring for a budget (Copilot-style), coloured by status. */
function Ring({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${(shown / 100) * c} ${c}`}
        className="transition-[stroke-dasharray] duration-700 ease-out"
      />
    </svg>
  );
}

function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
      {children} <ArrowRight className="size-3.5" />
    </Link>
  );
}

export default function HomePage() {
  const { user } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [today, setToday] = useState('');
  const [greeting, setGreeting] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const [txs, bgts, cats] = await Promise.all([
          DataService.getTransactions(),
          DataService.getBudgets(),
          DataService.getCategories(),
        ]);
        const now = new Date();
        const hour = now.getHours();
        setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
        setToday(toLocalDateString(now));
        setTransactions(txs);
        setBudgets(bgts);
        setCategories(cats);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load your data');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const month = useMemo(() => (today ? getBudgetPeriodRange('monthly', today) : null), [today]);
  const monthTx = useMemo(() => (month ? filterTransactionsByDateRange(transactions, month) : []), [transactions, month]);
  const summary = useMemo(() => calculateFinancialSummary(monthTx), [monthTx]);
  const byCategory = useMemo(() => calculateCategoryBreakdown(monthTx, 'expense'), [monthTx]);
  const types = useMemo(() => calculateEssentialityBreakdown(monthTx), [monthTx]);
  const overall = budgets.find((b) => b.category_id === null && b.period_type === 'monthly') ?? null;

  const calendar = useMemo(() => {
    if (!today || !month) return null;
    const day = parseDate(today).getDate();
    const daysInMonth = parseDate(month.endDate).getDate();
    return { day, daysInMonth, daysLeft: daysInMonth - day + 1, monthName: MONTH_FMT.format(parseDate(today)) };
  }, [today, month]);

  // Cumulative spending through the month vs. an even pace to the budget.
  const pace = useMemo(() => {
    if (!calendar) return [];
    const perDay = new Array(calendar.daysInMonth + 1).fill(0);
    for (const t of monthTx) {
      if (t.transaction_type === 'expense') perDay[parseDate(t.purchase_date).getDate()] += Number(t.amount);
    }
    let running = 0;
    return Array.from({ length: calendar.daysInMonth }, (_, i) => {
      const d = i + 1;
      running += perDay[d];
      return {
        day: d,
        spent: d <= calendar.day ? running : null,
        pace: overall ? (Number(overall.amount) * d) / calendar.daysInMonth : null,
      };
    });
  }, [calendar, monthTx, overall]);

  const left = overall ? Number(overall.amount) - summary.totalExpenses : null;
  const perDayAllowance = left !== null && calendar && left > 0 ? left / calendar.daysLeft : null;
  const status = overall ? getBudgetStatus((summary.totalExpenses / Number(overall.amount)) * 100) : null;

  const budgetRings = useMemo(
    () =>
      budgets
        .filter((b) => b.category_id !== null)
        .map((b) => {
          const spent = today ? calculateBudgetSpent(transactions, b, today) : 0;
          const category = categories.find((c) => c.id === b.category_id);
          return { b, spent, pct: (spent / Number(b.amount)) * 100, name: category?.name ?? 'Category' };
        })
        .sort((a, b) => b.pct - a.pct),
    [budgets, transactions, categories, today]
  );

  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.created_at.localeCompare(a.created_at))
        .slice(0, 7),
    [transactions]
  );

  if (loading || !calendar) {
    return (
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-72" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Skeleton className="h-36" />
          <Skeleton className="h-44" />
        </div>
        <Skeleton className="h-16" />
      </div>
    );
  }

  const firstName = user?.display_name?.split(' ')[0];

  return (
    <div className="space-y-12">
      {/* Greeting */}
      <header className="space-y-1.5 animate-rise">
        <p className="text-[13px] text-muted-foreground">{DAY_FMT.format(parseDate(today))}</p>
        <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.01em] sm:text-[40px]">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </h1>
      </header>

      {transactions.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Tell SpendWise about your first expense: type it, say it, or snap the bill."
          action={
            <Link href="/add-expense" className={buttonVariants()}>
              <Plus /> Add spending
            </Link>
          }
        />
      ) : (
        <>
          {/* Hero: what's left + pace */}
          <section
            className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] animate-rise"
            style={{ animationDelay: '40ms' }}
          >
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {overall
                  ? left !== null && left >= 0
                    ? `Left to spend in ${calendar.monthName}`
                    : `Over budget in ${calendar.monthName}`
                  : `Spent in ${calendar.monthName}`}
              </p>
              <Money
                amount={overall && left !== null ? Math.abs(left) : summary.totalExpenses}
                size="hero"
                tone={status === 'over_budget' ? 'danger' : 'default'}
              />
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                {overall ? (
                  <>
                    <Money amount={summary.totalExpenses} size="sm" decimals={false} tone="muted" /> spent of{' '}
                    <Money amount={Number(overall.amount)} size="sm" decimals={false} tone="muted" /> · {calendar.daysLeft}{' '}
                    {calendar.daysLeft === 1 ? 'day' : 'days'} to go
                    {perDayAllowance !== null && (
                      <>
                        {' '}
                        · about <Money amount={perDayAllowance} size="sm" decimals={false} tone="brand" /> a day
                      </>
                    )}
                  </>
                ) : (
                  <>
                    You haven&apos;t set a monthly budget.{' '}
                    <Link href="/budgets" className="text-foreground underline underline-offset-4 hover:text-brand">
                      Set one
                    </Link>{' '}
                    to see what&apos;s left each day.
                  </>
                )}
              </p>
            </div>

            <div className="h-44 w-full" aria-label="Spending so far this month against an even pace to your budget">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pace} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
                  <defs>
                    <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    ticks={[1, Math.ceil(calendar.daysInMonth / 2), calendar.daysInMonth]}
                    tick={{ fill: 'var(--subtle)', fontSize: 11 }}
                    tickFormatter={(d) => `${d} ${calendar.monthName.slice(0, 3)}`}
                  />
                  <YAxis hide domain={[0, (max: number) => max * 1.08]} />
                  <Tooltip
                    cursor={{ stroke: 'var(--border)' }}
                    contentStyle={{
                      background: 'var(--popover)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 12,
                      color: 'var(--foreground)',
                      boxShadow: 'var(--shadow-pop)',
                    }}
                    labelFormatter={(d) => `${d} ${calendar.monthName}`}
                    formatter={(value, name) => [formatCurrency(Number(value)), name === 'spent' ? 'Spent so far' : 'Even pace']}
                  />
                  {overall && (
                    <Line
                      dataKey="pace"
                      stroke="var(--chart-3)"
                      strokeWidth={1.25}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  )}
                  <Area dataKey="spent" stroke="var(--brand)" strokeWidth={2} fill="url(#spentFill)" dot={false} />
                  <ReferenceDot
                    x={calendar.day}
                    y={pace[calendar.day - 1]?.spent ?? 0}
                    r={4}
                    fill="var(--brand)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Figures */}
          <div className="border-y border-border py-5 animate-rise" style={{ animationDelay: '80ms' }}>
            <MetricStrip>
              <Metric label="Money in" value={<Money amount={summary.totalIncome} size="lg" tone="success" />} />
              <Metric label="Spent" value={<Money amount={summary.totalExpenses} size="lg" />} />
              <Metric
                label="Saved"
                value={<Money amount={summary.actualSavings} size="lg" tone={summary.actualSavings < 0 ? 'danger' : 'default'} />}
                hint={
                  summary.totalIncome > 0
                    ? `${Math.round((summary.actualSavings / summary.totalIncome) * 100)}% of what came in`
                    : undefined
                }
              />
              <Metric
                label="Daily average"
                value={<Money amount={summary.totalExpenses / calendar.day} size="lg" decimals={false} />}
                hint={`over ${calendar.day} ${calendar.day === 1 ? 'day' : 'days'}`}
              />
            </MetricStrip>
          </div>

          {/* Where it went + types */}
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Section
              title="Where it went"
              description={`${calendar.monthName}, by category`}
              action={<SeeAll href="/reports">Reports</SeeAll>}
            >
              <ul className="space-y-3.5">
                {byCategory.slice(0, 6).map((c) => {
                  const color = PURCHASE_KINDS[kindForCategory(categories.find((x) => x.id === c.categoryId))].color;
                  return (
                    <li key={c.categoryId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
                      <span className="flex min-w-0 items-center gap-2.5 text-sm">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate">{c.categoryName}</span>
                        <span className="text-xs text-subtle">{Math.round(c.percentage)}%</span>
                      </span>
                      <Money amount={c.amount} size="sm" decimals={false} />
                      <span className="col-span-2 h-1 overflow-hidden rounded-full bg-foreground/[0.05]">
                        <span
                          className="block h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${Math.max(2, c.percentage)}%`, background: color }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section title="Type of spending" description="What you needed vs. what you chose">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-foreground/[0.05]">
                <span style={{ width: `${types.essentialPct}%`, background: 'var(--essential)' }} />
                <span style={{ width: `${types.optimizablePct}%`, background: 'var(--trim)' }} />
                <span style={{ width: `${types.discretionaryPct}%`, background: 'var(--optional)' }} />
              </div>
              <dl className="divide-y divide-border">
                {[
                  { label: 'Essential', hint: 'Rent, groceries, bills', value: types.essential, pct: types.essentialPct, color: 'var(--essential)' },
                  { label: 'Could trim', hint: 'Delivery, cabs, subscriptions', value: types.optimizable, pct: types.optimizablePct, color: 'var(--trim)' },
                  { label: 'Optional', hint: 'Fun, shopping, treats', value: types.discretionary, pct: types.discretionaryPct, color: 'var(--optional)' },
                ].map((t) => (
                  <div key={t.label} className="flex items-center justify-between gap-3 py-3">
                    <dt className="flex items-start gap-2.5">
                      <span className="mt-1.5 size-2 rounded-full" style={{ background: t.color }} />
                      <span>
                        <span className="block text-sm">{t.label}</span>
                        <span className="block text-xs text-muted-foreground">{t.hint}</span>
                      </span>
                    </dt>
                    <dd className="text-right">
                      <Money amount={t.value} size="sm" decimals={false} />
                      <span className="block text-xs text-subtle">{Math.round(t.pct)}%</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          </div>

          {/* Budget rings */}
          {budgetRings.length > 0 && (
            <Section title="Budgets" description="This month, by category" action={<SeeAll href="/budgets">Manage</SeeAll>}>
              <div className="-mx-1 flex gap-8 overflow-x-auto px-1 pb-1">
                {budgetRings.map(({ b, spent, pct, name }) => {
                  const st = getBudgetStatus(pct);
                  const color =
                    st === 'over_budget' || st === 'critical' ? 'var(--destructive)' : st === 'warning' ? 'var(--warning)' : 'var(--brand)';
                  const remaining = Number(b.amount) - spent;
                  return (
                    <div key={b.id} className="flex shrink-0 items-center gap-3">
                      <div className="relative">
                        <Ring pct={pct} color={color} />
                        <span className="tabular absolute inset-0 flex items-center justify-center text-[11px] font-medium">
                          {Math.min(999, Math.round(pct))}%
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-sm">{name}</div>
                        <div className={cn('text-xs', remaining < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {remaining < 0 ? `${formatCurrency(-remaining)} over` : `${formatCurrency(remaining)} left`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Recent */}
          <Section title="Recent" action={<SeeAll href="/transactions">All spending</SeeAll>}>
            <ul className="-mx-3 divide-y divide-border/70">
              {recent.map((t) => {
                const color = PURCHASE_KINDS[kindForTransaction(t)].color;
                const income = t.transaction_type === 'income';
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-foreground/[0.025]">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                      style={{ background: `${color}1f`, color }}
                    >
                      {(t.merchant || t.description).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{t.description}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[t.category?.name, relativeDay(t.purchase_date, today)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <Money amount={Number(t.amount)} size="sm" sign={income ? 'plus' : 'none'} tone={income ? 'success' : 'default'} />
                  </li>
                );
              })}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
