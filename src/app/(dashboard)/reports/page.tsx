'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Money } from '@/components/ui/money';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { Section } from '@/components/ui/section';
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
import { cn } from '@/lib/utils';
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
    <div className="space-y-10 print:space-y-6">
      <PageHeader
        className="animate-rise"
        eyebrow={<span className="hidden print:inline">SpendWise</span>}
        title="Reports"
        description={<span className="print:hidden">A summary of your money in and out that you can print or download.</span>}
        actions={
          <div className="no-print flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleExportCSV} disabled={!hasData}>
              <Download />
              Download CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={handlePrint}>
              <Printer />
              Print
            </Button>
          </div>
        }
      />

      <div className="space-y-5 animate-rise print:animate-none" style={{ animationDelay: '40ms' }}>
        <div className="no-print -mx-1 overflow-x-auto px-1">
          <Segmented variant="underline" value={reportType} onChange={setReportType} options={REPORT_OPTIONS} />
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2 className="text-[15px] font-medium tracking-[-0.01em] text-foreground">{REPORT_TITLE[reportType]}</h2>
            <p className="tabular text-[13px] text-muted-foreground">
              {REPORT_SCOPE[reportType]} · {rangeLabel}
            </p>
          </div>
          <p className="tabular text-xs text-muted-foreground">
            Generated {formatDay(today)} · {reportTransactions.length}{' '}
            {reportTransactions.length === 1 ? 'entry' : 'entries'} · INR
          </p>
        </div>

        {/* Figures between hairlines */}
        <div className="border-y border-border py-5 break-inside-avoid">
          <MetricStrip>
            <Metric label="Money in" value={<Money amount={summary.totalIncome} size="lg" tone="success" />} />
            <Metric label="Spent" value={<Money amount={summary.totalExpenses} size="lg" />} />
            <Metric
              label="Saved"
              value={
                <Money amount={summary.actualSavings} size="lg" tone={summary.actualSavings < 0 ? 'danger' : 'default'} />
              }
              hint={
                savingsRate === null
                  ? 'No money in recorded'
                  : summary.actualSavings < 0
                    ? 'You spent more than came in'
                    : `You kept ${savingsRate.toFixed(0)}% of what came in`
              }
            />
            {overallBudget > 0 ? (
              <Metric
                label="Budget used"
                value={<span className={cn('tabular text-xl', TONE_TEXT[tone])}>{summary.budgetUtilization.toFixed(0)}%</span>}
                hint={
                  <div className="space-y-2">
                    <Progress value={summary.budgetUtilization} tone={tone} className={cn('h-1', PRINT_EXACT)} />
                    <span className="block">
                      of your <Money amount={overallBudget} size="sm" tone="muted" decimals={false} className="text-xs" /> budget
                    </span>
                  </div>
                }
              />
            ) : (
              <Metric
                label="Budget used"
                value={<span className="text-xl text-subtle">—</span>}
                hint="You haven't set a budget yet"
              />
            )}
          </MetricStrip>
        </div>
      </div>

      {/* Categories */}
      <Section
        title="Where your money went"
        description={
          hasExpenses ? `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}` : undefined
        }
        className="break-inside-avoid-page"
      >
        {categories.length === 0 ? (
          <EmptyNote>No expenses in this period.</EmptyNote>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-normal">Category</th>
                <th className="hidden w-[34%] py-2 pr-4 font-normal sm:table-cell print:table-cell">Share</th>
                <th className="hidden py-2 pr-4 text-right font-normal sm:table-cell print:table-cell">Entries</th>
                <th className="py-2 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {categories.map((c) => {
                const color = expenseKindColor(c.categoryId, c.categoryName);
                return (
                  <tr key={c.categoryId} className="break-inside-avoid transition-colors hover:bg-foreground/[0.025]">
                    <td className="py-3 pr-4 text-foreground">
                      <span className="flex items-center gap-2.5">
                        <span className={cn('size-2 shrink-0 rounded-full', PRINT_EXACT)} style={{ background: color }} />
                        <span className="break-words">{c.categoryName}</span>
                        <span className="tabular text-xs text-subtle sm:hidden print:hidden">
                          {c.percentage.toFixed(0)}%
                        </span>
                      </span>
                    </td>
                    <td className="hidden py-3 pr-4 sm:table-cell print:table-cell">
                      <div className="flex items-center gap-3">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.05]">
                          <div
                            className={cn('h-full rounded-full', PRINT_EXACT)}
                            style={{ width: `${Math.max(2, Math.min(100, c.percentage))}%`, background: color }}
                          />
                        </div>
                        <span className="tabular w-11 text-right text-xs text-muted-foreground">
                          {c.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="tabular hidden py-3 pr-4 text-right text-muted-foreground sm:table-cell print:table-cell">
                      {c.transactionCount}
                    </td>
                    <td className="py-3 text-right">
                      <Money amount={c.amount} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="py-3 pr-4 font-medium">Total</td>
                <td className="tabular hidden py-3 pr-4 text-xs text-muted-foreground sm:table-cell print:table-cell">
                  100%
                </td>
                <td className="tabular hidden py-3 pr-4 text-right text-muted-foreground sm:table-cell print:table-cell">
                  {categories.reduce((n, c) => n + c.transactionCount, 0)}
                </td>
                <td className="py-3 text-right">
                  <Money amount={summary.totalExpenses} size="sm" className="font-medium" />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Section>

      <div className="grid gap-12 md:grid-cols-2 print:grid-cols-2 print:gap-8">
        {/* Essentiality */}
        <Section title="Type of spending" description="What you needed vs. what you chose" className="break-inside-avoid-page">
          {!hasExpenses ? (
            <EmptyNote>No spending to sort yet.</EmptyNote>
          ) : (
            <>
              <div
                className={cn('flex h-2 w-full gap-px overflow-hidden rounded-full bg-foreground/[0.05]', PRINT_EXACT)}
                role="img"
                aria-label={essentialityRows.map((r) => `${r.label} ${r.pct.toFixed(0)}%`).join(', ')}
              >
                {essentialityRows
                  .filter((r) => r.pct > 0)
                  .map((r) => (
                    <div key={r.label} className={PRINT_EXACT} style={{ width: `${r.pct}%`, background: r.color }} />
                  ))}
              </div>
              <ul className="divide-y divide-border/70">
                {essentialityRows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 py-3">
                    <span className="flex min-w-0 items-start gap-2.5">
                      <span
                        className={cn('mt-1.5 size-2 shrink-0 rounded-full', PRINT_EXACT)}
                        style={{ background: r.color }}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-foreground">{r.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.hint}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Money amount={r.amount} size="sm" />
                      <span className="tabular block text-xs text-subtle">{r.pct.toFixed(0)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {/* Biggest expenses */}
        <Section title="Biggest expenses" description="The five largest in this period" className="break-inside-avoid-page">
          {biggestExpenses.length === 0 ? (
            <EmptyNote>No expenses in this period.</EmptyNote>
          ) : (
            <ol className="divide-y divide-border/70">
              {biggestExpenses.map((tx, i) => (
                <li key={tx.id} className="flex items-center gap-3 py-3 break-inside-avoid">
                  <span className="tabular w-4 shrink-0 text-[13px] text-subtle">{i + 1}</span>
                  <span
                    aria-hidden
                    className={cn('size-2 shrink-0 rounded-full', PRINT_EXACT)}
                    style={{ background: PURCHASE_KINDS[kindForTransaction(tx)].color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">{tx.description}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {tx.category?.name || 'Uncategorized'} · <span className="tabular">{formatDay(tx.purchase_date)}</span>
                    </div>
                  </div>
                  <Money amount={Number(tx.amount)} size="sm" className="shrink-0" />
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      {/* Potential savings: plain prose */}
      <Section title="Ways to save" divided className="break-inside-avoid">
        {!hasExpenses ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Nothing to look at yet. Add some expenses in this period to see where you could save.
          </p>
        ) : (
          <div className="max-w-2xl space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              {summary.actualSavings >= 0 ? (
                <>
                  You saved <Money amount={summary.actualSavings} size="md" className="font-medium" /> in this period.
                </>
              ) : (
                <>
                  You spent <Money amount={-summary.actualSavings} size="md" tone="danger" className="font-medium" /> more
                  than came in during this period.
                </>
              )}
              {categories[0] && (
                <>
                  {' '}
                  Your biggest category was <span className="text-foreground">{categories[0].categoryName}</span>, at{' '}
                  <span className="tabular">{categories[0].percentage.toFixed(0)}%</span> of your spending.
                </>
              )}
            </p>
            <p>
              Cutting <span className="text-trim">could trim</span> spending by{' '}
              {potentialSavings.optimizableReductionPct}% and <span className="text-optional">optional</span> spending by{' '}
              {potentialSavings.discretionaryReductionPct}% would have saved{' '}
              <Money amount={potentialSavings.monthlyPotentialSavings} size="md" tone="brand" className="font-medium" /> over
              this period
              {reportType === 'monthly' && (
                <>
                  {' '}
                  — about{' '}
                  <Money amount={potentialSavings.annualPotentialSavings} size="md" tone="brand" className="font-medium" /> a
                  year
                </>
              )}
              .
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-[13px] text-muted-foreground">{children}</p>;
}

function ReportsSkeleton() {
  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-9 w-80 max-w-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <div className="grid grid-cols-2 gap-5 border-y border-border py-5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <div className="grid gap-12 md:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
