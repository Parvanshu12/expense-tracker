'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Stat } from '@/components/ui/stat';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService } from '@/lib/data-service';
import { Transaction, Budget } from '@/types/database';
import {
  calculateFinancialSummary,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
  calculatePotentialSavings,
  getReportingPeriodRange,
  filterTransactionsByDateRange,
  toLocalDateString,
  type DashboardPeriod,
} from '@/lib/calculations/finance';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

type ReportType = 'weekly' | 'monthly' | 'quarterly' | 'annual';

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
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
  quarterly: 'Quarterly report',
  annual: 'Annual report',
};

const REPORT_SCOPE: Record<ReportType, string> = {
  weekly: 'Last 7 days',
  monthly: 'This month',
  quarterly: 'Last 3 months',
  annual: 'This year',
};

// Make thin bars survive printing (browsers drop backgrounds by default).
const PRINT_EXACT = '[print-color-adjust:exact] [-webkit-print-color-adjust:exact]';

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
  const essentialityRows = [
    { label: 'Essential', amount: essentiality.essential, pct: essentiality.essentialPct, color: 'var(--chart-1)' },
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
  ];

  return (
    <div className="space-y-6 print:space-y-0">
      <PageHeader
        className="print:hidden"
        title="Reports"
        description="A printable statement of your income and spending."
        actions={
          <>
            <Segmented value={reportType} onChange={setReportType} options={REPORT_OPTIONS} size="sm" />
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!hasData}>
              <Download />
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={handlePrint}>
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
            <dt className="text-muted-foreground">Transactions</dt>
            <dd className="tabular text-foreground">{reportTransactions.length}</dd>
            <dt className="text-muted-foreground">Currency</dt>
            <dd className="text-foreground">INR</dd>
          </dl>
        </div>

        <div className="space-y-10 p-5 md:p-8 print:space-y-8 print:px-0">
          {/* Summary */}
          <Section title="Summary">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
              <Stat label="Income" value={formatCurrency(summary.totalIncome)} className="shadow-none" />
              <Stat label="Expenses" value={formatCurrency(summary.totalExpenses)} className="shadow-none" />
              <Stat
                label="Net savings"
                value={formatCurrency(summary.actualSavings)}
                hint={
                  savingsRate === null
                    ? 'No income recorded'
                    : summary.actualSavings < 0
                      ? 'Spent more than earned'
                      : `${savingsRate.toFixed(0)}% of income kept`
                }
                className="shadow-none"
              />
              {overallBudget > 0 ? (
                <Stat
                  label="Budget used"
                  value={
                    <span className={cn(summary.budgetUtilization >= 100 && 'text-destructive')}>
                      {summary.budgetUtilization.toFixed(0)}%
                    </span>
                  }
                  hint={<span className="tabular">of {formatCurrency(overallBudget)} overall budget</span>}
                  className="shadow-none"
                >
                  <Progress
                    value={summary.budgetUtilization}
                    tone={summary.budgetUtilization >= 100 ? 'danger' : 'default'}
                    className={PRINT_EXACT}
                  />
                </Stat>
              ) : (
                <Stat
                  label="Budget used"
                  value={<span className="text-muted-foreground">—</span>}
                  hint="No overall budget set"
                  className="shadow-none"
                />
              )}
            </div>
          </Section>

          {/* Categories */}
          <Section title="Spending by category" meta={hasExpenses ? `${categories.length} categories` : undefined}>
            {categories.length === 0 ? (
              <EmptyNote>No expenses in this period.</EmptyNote>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell print:table-cell">
                        Count
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="w-[28%] px-4 py-2.5 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categories.map((c) => (
                      <tr key={c.categoryId} className="break-inside-avoid transition-colors hover:bg-accent/50">
                        <td className="break-words px-4 py-3 text-foreground">{c.categoryName}</td>
                        <td className="tabular hidden px-4 py-3 text-right text-muted-foreground sm:table-cell print:table-cell">
                          {c.transactionCount}
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-3 text-right font-medium">
                          {formatCurrency(c.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-3">
                            <div className="hidden h-1 flex-1 overflow-hidden rounded-full bg-muted sm:block print:block">
                              <div
                                className={cn('h-full rounded-full bg-foreground/80', PRINT_EXACT)}
                                style={{ width: `${Math.max(2, Math.min(100, c.percentage))}%` }}
                              />
                            </div>
                            <span className="tabular w-12 text-right text-xs text-muted-foreground">
                              {c.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
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
            <Section title="Essentiality">
              {!hasExpenses ? (
                <EmptyNote>No expenses to classify.</EmptyNote>
              ) : (
                <div className="space-y-4">
                  <div
                    className={cn('flex h-2 w-full gap-0.5 overflow-hidden rounded-full', PRINT_EXACT)}
                    role="img"
                    aria-label="Spending by essentiality"
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
                        <span className="inline-flex items-center gap-2 text-foreground">
                          <span
                            className={cn('size-2 rounded-[3px]', PRINT_EXACT)}
                            style={{ background: r.color }}
                          />
                          {r.label}
                        </span>
                        <span className="flex items-baseline gap-2">
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
            <Section title="Largest expenses">
              {biggestExpenses.length === 0 ? (
                <EmptyNote>No expenses in this period.</EmptyNote>
              ) : (
                <ol className="divide-y divide-border">
                  {biggestExpenses.map((tx, i) => (
                    <li key={tx.id} className="flex items-center justify-between gap-4 py-2.5 break-inside-avoid">
                      <div className="flex min-w-0 items-baseline gap-3">
                        <span className="tabular w-4 shrink-0 text-xs text-subtle">{i + 1}</span>
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
          <Section title="Potential savings">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground break-inside-avoid">
              {!hasExpenses ? (
                <p>Nothing to optimise yet. Add expenses in this period to see where you could save.</p>
              ) : (
                <div className="space-y-2">
                  <p>
                    Net savings for this period are{' '}
                    <span className="tabular font-medium text-foreground">{formatCurrency(summary.actualSavings)}</span>.
                    {categories[0] && (
                      <>
                        {' '}
                        The largest category was <span className="text-foreground">{categories[0].categoryName}</span> at{' '}
                        <span className="tabular">{categories[0].percentage.toFixed(0)}%</span> of spending.
                      </>
                    )}
                  </p>
                  <p>
                    Trimming optimizable spending by {potentialSavings.optimizableReductionPct}% and discretionary
                    spending by {potentialSavings.discretionaryReductionPct}% would have saved{' '}
                    <span className="tabular font-medium text-foreground">
                      {formatCurrency(potentialSavings.monthlyPotentialSavings)}
                    </span>{' '}
                    over this period
                    {reportType === 'monthly' && (
                      <>
                        {' '}
                        — about{' '}
                        <span className="tabular font-medium text-foreground">
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
        <Skeleton className="h-8 w-96 max-w-full" />
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
