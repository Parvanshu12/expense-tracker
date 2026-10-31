'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, FilterX, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Segmented } from '@/components/ui/segmented';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import {
  toLocalDateString,
  getReportingPeriodRange,
  filterTransactionsByDateRange,
} from '@/lib/calculations/finance';
import { KIND_ORDER, PURCHASE_KINDS, kindForTransaction, type PurchaseKind } from '@/lib/categories/kinds';
import { cn, formatCurrency } from '@/lib/utils';
import type { Category, Transaction } from '@/types/database';
import { toast } from 'sonner';

type TimelinePeriod = 'this_month' | 'last_3_months' | 'all_time';

const PERIOD_OPTIONS: { value: TimelinePeriod; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'all_time', label: 'All time' },
];

interface Row {
  tx: Transaction;
  kind: PurchaseKind;
  categoryName: string | null;
}

interface DayGroup {
  date: string;
  rows: Row[];
  spent: number;
  income: number;
}

interface MonthGroup {
  key: string; // YYYY-MM
  days: DayGroup[];
  spent: number;
  income: number;
  byKind: Map<PurchaseKind, number>;
}

/** Shifts a YYYY-MM-DD string by whole days (UTC arithmetic, no time zone drift). */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatDayHeading(dateStr: string, today: string): string {
  if (today) {
    if (dateStr === today) return 'Today';
    if (dateStr === shiftDate(today, -1)) return 'Yesterday';
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const sameYear = today ? today.slice(0, 4) === dateStr.slice(0, 4) : false;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatMonthHeading(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

/** Newest first: by date, then time of day, then creation time. */
function compareNewestFirst(a: Transaction, b: Transaction): number {
  if (a.purchase_date !== b.purchase_date) return a.purchase_date < b.purchase_date ? 1 : -1;
  const at = a.purchase_time ?? '';
  const bt = b.purchase_time ?? '';
  if (at !== bt) return at < bt ? 1 : -1;
  const ao = a.occurred_at || a.created_at || '';
  const bo = b.occurred_at || b.created_at || '';
  return ao < bo ? 1 : ao > bo ? -1 : 0;
}

function percent(part: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (part / total) * 100;
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** Horizontal stacked bar of expense amounts by kind. */
function KindBar({
  byKind,
  hidden,
  className,
}: {
  byKind: Map<PurchaseKind, number>;
  hidden?: Set<PurchaseKind>;
  className?: string;
}) {
  const segments = KIND_ORDER.filter((k) => k !== 'income' && (byKind.get(k) ?? 0) > 0).map((k) => ({
    kind: k,
    amount: byKind.get(k) ?? 0,
  }));
  const total = segments.reduce((s, x) => s + x.amount, 0);
  const label = segments
    .map((s) => `${PURCHASE_KINDS[s.kind].label} ${percent(s.amount, total)}`)
    .join(', ');

  return (
    <div
      role="img"
      aria-label={total > 0 ? `Spending by kind: ${label}` : 'No spending'}
      className={cn('flex gap-px overflow-hidden rounded-full bg-foreground/[0.05]', className)}
    >
      {segments.map((s) => (
        <div
          key={s.kind}
          title={`${PURCHASE_KINDS[s.kind].label} · ${formatCurrency(s.amount)} (${percent(s.amount, total)})`}
          className="h-full min-w-[2px] transition-opacity"
          style={{
            width: `${(s.amount / total) * 100}%`,
            background: PURCHASE_KINDS[s.kind].color,
            opacity: hidden?.has(s.kind) ? 0.2 : 1,
          }}
        />
      ))}
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-36" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="flex flex-wrap gap-1.5">
          {['w-24', 'w-20', 'w-28', 'w-16', 'w-24'].map((w, i) => (
            <Skeleton key={i} className={cn('h-8 rounded-full', w)} />
          ))}
        </div>
      </div>
      <div className="space-y-6 border-t border-border pt-8">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        {[0, 1].map((g) => (
          <div key={g} className="space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-14" />
            </div>
            <div className="ml-1 space-y-4 border-l border-border pl-5">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-40 max-w-[50vw]" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_SYSTEM_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState('');
  const [period, setPeriod] = useState<TimelinePeriod>('this_month');
  const [hidden, setHidden] = useState<Set<PurchaseKind>>(() => new Set());

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const [txs, cats] = await Promise.all([DataService.getTransactions(), DataService.getCategories()]);
        setToday(toLocalDateString());
        setTransactions(txs);
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load timeline:', err);
        toast.error(err instanceof Error ? err.message : 'Could not load transactions');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Every transaction in the selected period, newest first, with its kind resolved.
  const periodRows = useMemo<Row[]>(() => {
    if (!today) return [];
    const range = getReportingPeriodRange(period, today);
    return filterTransactionsByDateRange(transactions, range)
      .slice()
      .sort(compareNewestFirst)
      .map((tx) => {
        const category = tx.category ?? categoryById.get(tx.category_id);
        return {
          tx,
          kind: kindForTransaction({ ...tx, category }),
          categoryName: category?.name ?? null,
        };
      });
  }, [transactions, categoryById, period, today]);

  // Totals per kind for the whole period (legend + composition bar ignore the filter).
  const periodByKind = useMemo(() => {
    const map = new Map<PurchaseKind, number>();
    for (const r of periodRows) map.set(r.kind, (map.get(r.kind) ?? 0) + r.tx.amount);
    return map;
  }, [periodRows]);

  const presentKinds = useMemo(() => KIND_ORDER.filter((k) => periodByKind.has(k)), [periodByKind]);
  const periodSpent = useMemo(
    () => periodRows.reduce((s, r) => (r.tx.transaction_type === 'expense' ? s + r.tx.amount : s), 0),
    [periodRows]
  );
  const expenseCount = useMemo(
    () => periodRows.filter((r) => r.tx.transaction_type === 'expense').length,
    [periodRows]
  );

  const visibleRows = useMemo(() => periodRows.filter((r) => !hidden.has(r.kind)), [periodRows, hidden]);
  const activeFilter = presentKinds.some((k) => hidden.has(k));

  const months = useMemo<MonthGroup[]>(() => {
    const result: MonthGroup[] = [];
    for (const row of visibleRows) {
      const monthKey = row.tx.purchase_date.slice(0, 7);
      let month = result[result.length - 1];
      if (!month || month.key !== monthKey) {
        month = { key: monthKey, days: [], spent: 0, income: 0, byKind: new Map() };
        result.push(month);
      }
      let day = month.days[month.days.length - 1];
      if (!day || day.date !== row.tx.purchase_date) {
        day = { date: row.tx.purchase_date, rows: [], spent: 0, income: 0 };
        month.days.push(day);
      }
      day.rows.push(row);
      if (row.tx.transaction_type === 'income') {
        day.income += row.tx.amount;
        month.income += row.tx.amount;
      } else {
        day.spent += row.tx.amount;
        month.spent += row.tx.amount;
        month.byKind.set(row.kind, (month.byKind.get(row.kind) ?? 0) + row.tx.amount);
      }
    }
    return result;
  }, [visibleRows]);

  const toggleKind = (kind: PurchaseKind) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };
  const showAll = () => setHidden(new Set());

  const header = (
    <PageHeader
      title="Timeline"
      description="Everything you spent, day by day. The colours show what kind of purchase it was."
      actions={<Segmented value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}
      className="animate-rise"
    />
  );

  if (loading) {
    return (
      <div className="space-y-10">
        {header}
        <TimelineSkeleton />
      </div>
    );
  }

  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label.toLowerCase() ?? '';

  return (
    <div className="space-y-10">
      {header}

      {periodRows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Nothing here yet"
          description={
            period === 'all_time'
              ? 'Add your first expense and it will show up here.'
              : `Nothing was added ${periodLabel === 'this month' ? 'this month' : `in the ${periodLabel}`}. Try a longer period, or add an expense.`
          }
          action={
            <Link href="/add-expense" className={buttonVariants()}>
              <Plus />
              Add spending
            </Link>
          }
        />
      ) : (
        <>
          {/* Summary: total, one thin composition bar, legend chips. No box. */}
          <section className="space-y-4 animate-rise" style={{ animationDelay: '40ms' }} aria-label="Spending by kind">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
              <div className="space-y-2">
                <p className="text-[13px] text-muted-foreground">{period === 'this_month' ? 'Spent this month' : period === 'last_3_months' ? 'Spent in the last 3 months' : 'Spent, all time'}</p>
                <Money amount={periodSpent} size="xl" />
              </div>
              <p className="text-[13px] text-muted-foreground">
                {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
              </p>
            </div>

            {periodSpent > 0 && <KindBar byKind={periodByKind} hidden={hidden} className="h-1.5" />}

            <div className="-mx-2.5 flex flex-wrap items-center gap-0.5" role="group" aria-label="Filter by kind">
              {presentKinds.map((kind) => {
                const info = PURCHASE_KINDS[kind];
                const on = !hidden.has(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleKind(kind)}
                    title={on ? `Hide ${info.label}` : `Show ${info.label}`}
                    className={cn(
                      'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors',
                      'hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'text-foreground' : 'text-subtle'
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full border-[1.5px]"
                      style={{ borderColor: info.color, background: on ? info.color : 'transparent' }}
                    />
                    <span className={cn('truncate', !on && 'line-through decoration-from-font')}>{info.label}</span>
                    <Money
                      amount={periodByKind.get(kind) ?? 0}
                      size="sm"
                      decimals={false}
                      className="text-[13px]"
                      sign={kind === 'income' ? 'plus' : 'none'}
                      tone={on && kind === 'income' ? 'success' : 'muted'}
                    />
                  </button>
                );
              })}
              {activeFilter && (
                <button
                  type="button"
                  onClick={showAll}
                  className="ml-1 h-8 rounded-sm px-2 text-[13px] font-medium text-foreground underline-offset-4 transition-colors hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Show all
                </button>
              )}
            </div>
            <p className="text-xs text-subtle">Tap a colour to hide or show that kind of spending.</p>
          </section>

          {/* Timeline */}
          {visibleRows.length === 0 ? (
            <EmptyState
              icon={<FilterX />}
              title="Everything is hidden"
              description="Tap a colour above to show it again, or show everything."
              action={
                <Button variant="outline" onClick={showAll}>
                  Show all
                </Button>
              }
            />
          ) : (
            <div className="space-y-12">
              {months.map((month, mi) => (
                <section
                  key={month.key}
                  aria-labelledby={`month-${month.key}`}
                  className="space-y-6 border-t border-border pt-8 animate-rise"
                  style={{ animationDelay: `${Math.min(mi, 4) * 60 + 80}ms` }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2
                      id={`month-${month.key}`}
                      className="truncate font-display text-[26px] leading-tight tracking-[-0.01em] text-foreground sm:text-[28px]"
                    >
                      {formatMonthHeading(month.key)}
                    </h2>
                    {month.spent > 0 || month.income === 0 ? (
                      <Money amount={month.spent} size="md" className="shrink-0" />
                    ) : (
                      <Money amount={month.income} size="md" sign="plus" tone="success" className="shrink-0" />
                    )}
                  </div>

                  <div className="space-y-6">
                    {month.days.map((day) => (
                      <div key={day.date}>
                        <div className="flex items-baseline justify-between gap-3 pb-2">
                          <h3 className="text-[13px] text-muted-foreground">{formatDayHeading(day.date, today)}</h3>
                          {day.spent > 0 || day.income === 0 ? (
                            <Money amount={day.spent} size="sm" tone="muted" className="text-xs" />
                          ) : (
                            <Money amount={day.income} size="sm" sign="plus" tone="success" className="text-xs" />
                          )}
                        </div>

                        <ol className="ml-1 border-l border-border">
                          {day.rows.map(({ tx, kind, categoryName }) => {
                            const isIncome = tx.transaction_type === 'income';
                            const info = PURCHASE_KINDS[isIncome ? 'income' : kind];
                            const meta = [tx.merchant, categoryName, tx.payment_method].filter(Boolean).join(' · ');
                            return (
                              <li
                                key={tx.id}
                                className="relative flex items-center gap-3 rounded-r-lg py-2.5 pl-5 pr-2 transition-colors hover:bg-foreground/[0.025]"
                              >
                                <span
                                  aria-hidden
                                  title={info.label}
                                  className="absolute -left-[4.5px] top-1/2 size-2 -translate-y-1/2 rounded-full ring-[3px] ring-card"
                                  style={{ background: info.color }}
                                />
                                <span className="sr-only">{info.label}: </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-foreground">{tx.description || 'No description'}</p>
                                  {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
                                </div>
                                <Money
                                  amount={tx.amount}
                                  size="sm"
                                  className="shrink-0"
                                  sign={isIncome ? 'plus' : 'none'}
                                  tone={isIncome ? 'success' : 'default'}
                                />
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
