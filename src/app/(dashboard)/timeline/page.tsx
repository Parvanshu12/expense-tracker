'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, FilterX, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
      className={cn('flex gap-px overflow-hidden rounded-full bg-muted', className)}
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
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex flex-wrap gap-2">
          {['w-24', 'w-20', 'w-28', 'w-16', 'w-24'].map((w, i) => (
            <Skeleton key={i} className={cn('h-9 rounded-full', w)} />
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        {[0, 1].map((g) => (
          <div key={g} className="mb-5 space-y-3 last:mb-0">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-14" />
            </div>
            <div className="space-y-3 border-l border-border pl-4">
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
      </Card>
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
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <TimelineSkeleton />
      </div>
    );
  }

  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label.toLowerCase() ?? '';

  return (
    <div className="space-y-6">
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
              New expense
            </Link>
          }
        />
      ) : (
        <>
          {/* Summary: composition bar + legend */}
          <Card className="animate-rise space-y-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Spent</p>
                <p className="text-xs text-muted-foreground">
                  {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
                </p>
              </div>
              <p className="tabular text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {formatCurrency(periodSpent)}
              </p>
            </div>

            {periodSpent > 0 && <KindBar byKind={periodByKind} hidden={hidden} className="h-2" />}

            <p className="text-[13px] text-muted-foreground">Tap a colour to hide or show that kind of spending.</p>

            <div className="-mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by kind">
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
                      'inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      on
                        ? 'border-border bg-card text-foreground hover:bg-accent'
                        : 'border-dashed border-border bg-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full border-[1.5px]"
                      style={{ borderColor: info.color, background: on ? info.color : 'transparent' }}
                    />
                    <span className={cn('truncate', !on && 'line-through decoration-from-font')}>{info.label}</span>
                    <span
                      className={cn(
                        'tabular',
                        !on ? 'text-muted-foreground' : kind === 'income' ? 'text-success' : 'text-muted-foreground'
                      )}
                    >
                      {kind === 'income' ? '+' : ''}
                      {formatCurrency(periodByKind.get(kind) ?? 0)}
                    </span>
                  </button>
                );
              })}
              {activeFilter && (
                <button
                  type="button"
                  onClick={showAll}
                  className="ml-1 h-9 rounded-sm px-2 text-[13px] font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Show all
                </button>
              )}
            </div>
          </Card>

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
            <div className="space-y-6">
              {months.map((month, mi) => (
                <section
                  key={month.key}
                  aria-labelledby={`month-${month.key}`}
                  className="animate-rise"
                  style={{ animationDelay: `${Math.min(mi, 4) * 60 + 60}ms` }}
                >
                  <Card className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                      <h2 id={`month-${month.key}`} className="truncate text-sm font-medium text-foreground">
                        {formatMonthHeading(month.key)}
                      </h2>
                      <div className="flex shrink-0 items-center gap-3">
                        {month.spent > 0 && <KindBar byKind={month.byKind} className="hidden h-1 w-16 sm:flex sm:w-24" />}
                        {month.spent > 0 || month.income === 0 ? (
                          <span className="tabular text-sm font-medium text-foreground">
                            {formatCurrency(month.spent)}
                          </span>
                        ) : (
                          <span className="tabular text-sm font-medium text-success">
                            +{formatCurrency(month.income)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-5 px-2 py-4 sm:px-3">
                      {month.days.map((day) => (
                        <div key={day.date}>
                          <div className="flex items-baseline justify-between gap-3 px-2 pb-1.5">
                            <h3 className="text-[13px] font-medium text-foreground">
                              {formatDayHeading(day.date, today)}
                            </h3>
                            {day.spent > 0 || day.income === 0 ? (
                              <span className="tabular text-xs text-muted-foreground">{formatCurrency(day.spent)}</span>
                            ) : (
                              <span className="tabular text-xs text-success">+{formatCurrency(day.income)}</span>
                            )}
                          </div>

                          <ol className="ml-3 border-l border-border">
                            {day.rows.map(({ tx, kind, categoryName }) => {
                              const isIncome = tx.transaction_type === 'income';
                              const info = PURCHASE_KINDS[isIncome ? 'income' : kind];
                              const meta = [tx.merchant, categoryName, tx.payment_method].filter(Boolean).join(' · ');
                              return (
                                <li
                                  key={tx.id}
                                  className="relative flex items-center gap-3 rounded-r-md py-2 pl-4 pr-2 transition-colors hover:bg-accent/50"
                                >
                                  <span
                                    aria-hidden
                                    title={info.label}
                                    className="absolute -left-[4.5px] top-1/2 size-2 -translate-y-1/2 rounded-full ring-2 ring-card"
                                    style={{ background: info.color }}
                                  />
                                  <span className="sr-only">{info.label}: </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-foreground">{tx.description || 'No description'}</p>
                                    {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
                                  </div>
                                  <span
                                    className={cn(
                                      'tabular shrink-0 text-sm',
                                      isIncome ? 'font-medium text-success' : 'text-foreground'
                                    )}
                                  >
                                    {isIncome ? '+' : ''}
                                    {formatCurrency(tx.amount)}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      ))}
                    </div>
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
