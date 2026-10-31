'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Download, Gauge, PiggyBank, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Stat } from '@/components/ui/stat';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService } from '@/lib/data-service';
import { PURCHASE_KINDS, kindForCategory, kindForTransaction } from '@/lib/categories/kinds';
import { Transaction, Budget } from '@/types/database';
import {
  calculateFinancialSummary,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
  calculatePotentialSavings,
  getBudgetStatus,
  getReportingPeriodRange,
  filterTransactionsByDateRange,
  toLocalDateString,
  type DashboardPeriod,
} from '@/lib/calculations/finance';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

type ReportType = 'weekly' | 'monthly' | 'quarterly' | 'annual';

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'weekly', label: '7 days' },
  { value: 'monthly', label: 'This month' },
  { value: 'quarterly', label: '3 months' },
  { value: 'annual', label: 'This year' },
];

const REPORT_PERIOD: Record<ReportType, DashboardPeriod> = {
  weekly: 'this_week',
  monthly: 'this_month',
  quarterly: 'last_3_months',
  annual: 'this_year',
};

const REPORT_TITLE: Record<ReportType, string> = {
  weekly: 'Weekly report',
  monthly: 'Monthly report',
  quarterly: '3-month report',
  annual: 'Yearly report',
};

const REPORT_SCOPE: Record<ReportType, string> = {
  weekly: 'Last 7 days',
  monthly: 'This month',
  quarterly: 'Last 3 months',
  annual: 'This year',
};

// Make thin bars survive printing (browsers drop backgrounds by default).
const PRINT_EXACT = '[print-color-adjust:exact] [-webkit-print-color-adjust:exact]';

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

function expenseKindColor(categoryId: string, categoryName: string): string {
  return PURCHASE_KINDS[kindForCategory({ id: categoryId, name: categoryName, category_type: 'expense' })].color;
}

function formatDay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ReportsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [today, setToday] = useState<string>('');
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
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Could not load report data');
      } finally {
        setToday(toLocalDateString());
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const range = useMemo(
    () => (today ? getReportingPeriodRange(REPORT_PERIOD[reportType], today) : null),
    [reportType, today]
  );

  // One filtered set drives every section and the CSV.
  const reportTransactions = useMemo(() => {
    if (!today) return [];
    return filterTransactionsByDateRange(transactions, range).sort((a, b) =>
      b.purchase_date.localeCompare(a.purchase_date)
    );
  }, [transactions, range, today]);

  const overallBudget = useMemo(() => {
    const b = budgets.find((x) => x.category_id === null);
    return b ? Number(b.amount) || 0 : 0;
  }, [budgets]);

  const summary = useMemo(
    () => calculateFinancialSummary(reportTransactions, overallBudget),
    [reportTransactions, overallBudget]
  );
  const categories = useMemo(() => calculateCategoryBreakdown(reportTransactions, 'expense'), [reportTransactions]);
  const essentiality = useMemo(() => calculateEssentialityBreakdown(reportTransactions), [reportTransactions]);
  const potentialSavings = useMemo(
    () => calculatePotentialSavings(essentiality.optimizable, essentiality.discretionary),
    [essentiality]
  );

  const biggestExpenses = useMemo(
    () =>
      reportTransactions
        .filter((t) => t.transaction_type === 'expense')
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .slice(0, 5),
    [reportTransactions]
  );

  const rangeLabel = range ? `${formatDay(range.startDate)} – ${formatDay(range.endDate)}` : '';

  const handleExportCSV = () => {
    try {
      const headers = [
        'Date',
        'Type',
        'Description',
        'Category',
        'Amount',
        'Currency',
        'Essentiality',
        'Merchant',
        'Payment Method',
      ];
      const rows = reportTransactions.map((t) => [
        t.purchase_date,
        t.transaction_type,
        t.description,
        t.category?.name || 'Uncategorized',
        t.amount,
        t.currency,
        t.essentiality,
        t.merchant || '',
        t.payment_method || '',
      ]);
      const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      const suffix = range ? `${range.startDate}_to_${range.endDate}` : toLocalDateString();
      link.download = `SpendWise_${reportType}_report_${suffix}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${reportTransactions.length} ${reportTransactions.length === 1 ? 'transaction' : 'transactions'}`
      );
    } catch {
      toast.error('Could not export CSV');
    }
  };

  const handlePrint = () => window.print();

  if (loading) return <ReportsSkeleton />;

  const hasData = reportTransactions.length > 0;
  const hasExpenses = summary.totalExpenses > 0;
  const savingsRate = summary.totalIncome > 0 ? (summary.actualSavings / summary.totalIncome) * 100 : null;
  const tone = budgetTone(summary.budgetUtilization);
  const essentialityRows = [
    {
      label: 'Essential',
      hint: 'Rent, bills, groceries',
      amount: essentiality.essential,
      pct: essentiality.essentialPct,
      color: 'var(--essential)',
    },
    {
      label: 'Could trim',
      hint: 'Worth a second look',
      amount: essentiality.optimizable,
      pct: essentiality.optimizablePct,
      color: 'var(--trim)',
    },
    {
      label: 'Optional',
      hint: 'Treats and nice-to-haves',
      amount: essentiality.discretionary,
      pct: essentiality.discretionaryPct,
      color: 'var(--optional)',
    },
  ];

  return (
    <div className="space-y-6 print:space-y-0">
      <PageHeader
        className="print:hidden"
        title="Reports"
        description="A summary of your money in and out that you can print or download."
        actions={
          <>
            <div className="-mx-1 max-w-full overflow-x-auto px-1 py-0.5 [&_button]:h-9 [&_button]:whitespace-nowrap">
              <Segmented value={reportType} onChange={setReportType} options={REPORT_OPTIONS} />
            </div>
            <Button variant="outline" onClick={handleExportCSV} disabled={!hasData}>
              <Download />
              Download CSV
            </Button>
            <Button variant="ghost" onClick={handlePrint}>
              <Printer />
              Print
            </Button>
          </>
        }
      />

      <article className="animate-rise rounded-xl border border-border bg-card shadow-card print:animate-none print:rounded-none print:border-0 print:shadow-none">
        {/* Document header */}
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between md:p-8 print:px-0">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">SpendWise</p>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">{REPORT_TITLE[reportType]}</h2>
            <p className="tabular text-sm text-muted-foreground">
              {REPORT_SCOPE[reportType]} · {rangeLabel}
            </p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs sm:text-right">
            <dt className="text-muted-foreground">Generated</dt>
            <dd className="tabular text-foreground">{formatDay(today)}</dd>
            <dt className="text-muted-foreground">Entries</dt>
            <dd className="tabular text-foreground">{reportTransactions.length}</dd>
            <dt className="text-muted-foreground">Currency</dt>
            <dd className="text-foreground">INR</dd>
          </dl>
        </div>

        <div className="space-y-10 p-5 md:p-8 print:space-y-8 print:px-0">
          {/* Summary */}
          <Section title="Summary">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
              <Stat
                label="Money in"
                icon={
                  <IconTile className="bg-success/12 text-success">
                    <ArrowDownLeft />
                  </IconTile>
                }
                value={formatCurrency(summary.totalIncome)}
                className="shadow-none"
              />
              <Stat
                label="Spent"
                icon={
                  <IconTile className="bg-primary/10 text-primary">
                    <ArrowUpRight />
                  </IconTile>
                }
                value={formatCurrency(summary.totalExpenses)}
                className="shadow-none"
              />
              <Stat
                label="Saved"
                icon={
                  <IconTile
                    className={
                      summary.actualSavings < 0 ? 'bg-destructive/10 text-destructive' : 'bg-info/12 text-info'
                    }
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
                    ? 'No money in recorded'
                    : summary.actualSavings < 0
                      ? 'You spent more than came in'
                      : `You kept ${savingsRate.toFixed(0)}% of what came in`
                }
                className="shadow-none"
              />
              {overallBudget > 0 ? (
                <Stat
                  label="Budget used"
                  icon={
                    <IconTile className={TONE_TILE[tone]}>
                      <Gauge />
                    </IconTile>
                  }
                  value={<span className={TONE_TEXT[tone]}>{summary.budgetUtilization.toFixed(0)}%</span>}
                  hint={<span className="tabular">of your {formatCurrency(overallBudget)} budget</span>}
                  className="shadow-none"
                >
                  <Progress value={summary.budgetUtilization} tone={tone} className={PRINT_EXACT} />
                </Stat>
              ) : (
                <Stat
                  label="Budget used"
                  icon={
                    <IconTile className="bg-muted text-muted-foreground">
                      <Gauge />
                    </IconTile>
                  }
                  value={<span className="text-muted-foreground">—</span>}
                  hint="You haven't set a budget yet"
                  className="shadow-none"
                />
              )}
            </div>
          </Section>

          {/* Categories */}
          <Section
            title="Where your money went"
            meta={hasExpenses ? `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}` : undefined}
          >
            {categories.length === 0 ? (
              <EmptyNote>No expenses in this period.</EmptyNote>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell print:table-cell">
                        Entries
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="w-[28%] px-4 py-2.5 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categories.map((c) => {
                      const color = expenseKindColor(c.categoryId, c.categoryName);
                      return (
                        <tr key={c.categoryId} className="break-inside-avoid transition-colors hover:bg-accent/50">
                          <td className="px-4 py-3 text-foreground">
                            <span className="flex items-center gap-2.5">
                              <span
                                className={cn('size-2.5 shrink-0 rounded-full', PRINT_EXACT)}
                                style={{ background: color }}
                              />
                              <span className="break-words">{c.categoryName}</span>
                            </span>
                          </td>
                          <td className="tabular hidden px-4 py-3 text-right text-muted-foreground sm:table-cell print:table-cell">
                            {c.transactionCount}
                          </td>
                          <td className="tabular whitespace-nowrap px-4 py-3 text-right font-medium">
                            {formatCurrency(c.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-3">
                              <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block print:block">
                                <div
                                  className={cn('h-full rounded-full', PRINT_EXACT)}
                                  style={{ width: `${Math.max(2, Math.min(100, c.percentage))}%`, background: color }}
                                />
                              </div>
                              <span className="tabular w-12 text-right text-xs text-muted-foreground">
                                {c.percentage.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border text-sm">
                      <td className="px-4 py-3 font-medium">Total</td>
                      <td className="tabular hidden px-4 py-3 text-right text-muted-foreground sm:table-cell print:table-cell">
                        {categories.reduce((n, c) => n + c.transactionCount, 0)}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">
                        {formatCurrency(summary.totalExpenses)}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-xs text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          <div className="grid gap-10 md:grid-cols-2 print:grid-cols-2 print:gap-8">
            {/* Essentiality */}
            <Section title="Type of spending">
              {!hasExpenses ? (
                <EmptyNote>No spending to sort yet.</EmptyNote>
              ) : (
                <div className="space-y-4">
                  <div
                    className={cn('flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full', PRINT_EXACT)}
                    role="img"
                    aria-label={essentialityRows.map((r) => `${r.label} ${r.pct.toFixed(0)}%`).join(', ')}
                  >
                    {essentialityRows
                      .filter((r) => r.pct > 0)
                      .map((r) => (
                        <div key={r.label} className={PRINT_EXACT} style={{ width: `${r.pct}%`, background: r.color }} />
                      ))}
                  </div>
                  <ul className="divide-y divide-border">
                    {essentialityRows.map((r) => (
                      <li key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn('size-2.5 shrink-0 rounded-full', PRINT_EXACT)}
                            style={{ background: r.color }}
                          />
                          <span className="min-w-0">
                            <span className="block text-foreground">{r.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.hint}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="tabular font-medium">{formatCurrency(r.amount)}</span>
                          <span className="tabular w-9 text-right text-xs text-muted-foreground">
                            {r.pct.toFixed(0)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* Biggest expenses */}
            <Section title="Biggest expenses">
              {biggestExpenses.length === 0 ? (
                <EmptyNote>No expenses in this period.</EmptyNote>
              ) : (
                <ol className="divide-y divide-border">
                  {biggestExpenses.map((tx, i) => (
                    <li key={tx.id} className="flex items-center justify-between gap-4 py-2.5 break-inside-avoid">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'tabular flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
                            PRINT_EXACT
                          )}
                          style={{
                            background: `${PURCHASE_KINDS[kindForTransaction(tx)].color}1f`,
                            color: PURCHASE_KINDS[kindForTransaction(tx)].color,
                          }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm text-foreground">{tx.description}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {tx.category?.name || 'Uncategorized'} · <span className="tabular">{formatDay(tx.purchase_date)}</span>
                          </div>
                        </div>
                      </div>
                      <span className="tabular shrink-0 text-sm font-medium">{formatCurrency(Number(tx.amount))}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>

          {/* Potential savings */}
          <Section title="Ways to save">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground break-inside-avoid">
              {!hasExpenses ? (
                <p>Nothing to look at yet. Add some expenses in this period to see where you could save.</p>
              ) : (
                <div className="space-y-2">
                  <p>
                    {summary.actualSavings >= 0 ? (
                      <>
                        You saved{' '}
                        <span className="tabular font-medium text-success">
                          {formatCurrency(summary.actualSavings)}
                        </span>{' '}
                        in this period.
                      </>
                    ) : (
                      <>
                        You spent{' '}
                        <span className="tabular font-medium text-destructive">
                          {formatCurrency(-summary.actualSavings)}
                        </span>{' '}
                        more than came in during this period.
                      </>
                    )}
                    {categories[0] && (
                      <>
                        {' '}
                        Your biggest category was{' '}
                        <span className="font-medium text-foreground">{categories[0].categoryName}</span>, at{' '}
                        <span className="tabular">{categories[0].percentage.toFixed(0)}%</span> of your spending.
                      </>
                    )}
                  </p>
                  <p>
                    Cutting <span className="font-medium text-trim">could trim</span> spending by{' '}
                    {potentialSavings.optimizableReductionPct}% and{' '}
                    <span className="font-medium text-optional">optional</span> spending by{' '}
                    {potentialSavings.discretionaryReductionPct}% would have saved{' '}
                    <span className="tabular font-medium text-success">
                      {formatCurrency(potentialSavings.monthlyPotentialSavings)}
                    </span>{' '}
                    over this period
                    {reportType === 'monthly' && (
                      <>
                        {' '}
                        — about{' '}
                        <span className="tabular font-medium text-success">
                          {formatCurrency(potentialSavings.annualPotentialSavings)}
                        </span>{' '}
                        a year
                      </>
                    )}
                    .
                  </p>
                </div>
              )}
            </div>
          </Section>
        </div>
      </article>
    </div>
  );
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 break-inside-avoid-page">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function IconTile({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('flex size-8 items-center justify-center rounded-lg', PRINT_EXACT, className)}>{children}</span>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-[30rem] max-w-full" />
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-2 border-b border-border p-5 md:p-8">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-10 p-5 md:p-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
          <div className="grid gap-10 md:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
