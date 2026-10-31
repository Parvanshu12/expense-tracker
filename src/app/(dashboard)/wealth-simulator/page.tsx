'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Section } from '@/components/ui/section';
import { Money } from '@/components/ui/money';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/layout/session-provider';
import { DataService } from '@/lib/data-service';
import { PURCHASE_KINDS, kindForTransaction } from '@/lib/categories/kinds';
import { toLocalDateString } from '@/lib/calculations/finance';
import {
  DEFAULT_RATES,
  biggestOptionalPurchases,
  futureValueLumpSum,
  futureValueSip,
  inflationAdjusted,
  moneySnapshot,
  monthlyInterest,
  roundAbout,
  setAsideEstimate,
  type InvestOptionKey,
  type MoneySnapshot,
} from '@/lib/calculations/invest';
import { formatCurrency } from '@/lib/utils';
import type { Transaction } from '@/types/database';
import { AdvancedCalculator, type CalculatorInputs } from './advanced-calculator';
import { DEFAULT_RATES_INPUT, OPTIONS, parseRates, ratesAreDefault } from './options';
import { RangeField } from './range-field';

type View = 'simple' | 'advanced';
type Horizon = '1' | '5' | '10';

const VIEW_KEY = 'spendwise_planner_view';
const SIP_YEARS = [5, 10, 20];
const DEFAULT_STARTING = 50000;
const DEFAULT_MONTHLY = 10000;

const SHORT_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function parseDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Models sometimes emit markdown emphasis; this UI renders plain text. */
function cleanReply(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');
}

function readStoredView(): View | null {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === 'simple' || v === 'advanced' ? v : null;
  } catch {
    return null;
  }
}

function storeView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

/** AI explanations already fetched in this tab, by request body, so revisiting the page doesn't ask again. */
const aiCache = new Map<string, string>();

const AI_QUESTION =
  'Explain my Future planner numbers in 2 to 4 short, friendly sentences: what I typically earn and spend, ' +
  'how much I could set aside each month, and what my biggest recent optional purchase or that monthly saving ' +
  'could grow into. Quote figures exactly as given in the JSON and do not work out any new numbers. ' +
  'Say that growth is an example, not a promise. No lists, no headings.';

function monthsLabel(s: MoneySnapshot): string {
  if (s.months >= 2.95) return 'Average a month, last 3 months';
  if (s.months <= 1) return 'Less than a month of records';
  return 'Average a month since you started';
}

export default function WealthSimulatorPage() {
  const { user } = useSession();
  const currency = user?.currency || 'INR';
  const profileIncome = user?.monthly_income ?? null;
  const language = user?.language === 'hinglish' ? 'hinglish' : 'en';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('simple');

  // Simple view controls.
  const [trimPct, setTrimPct] = useState(50);
  const [horizon, setHorizon] = useState<Horizon>('10');
  const [sipOption, setSipOption] = useState<InvestOptionKey>('index');

  // Calculator inputs, shared by both views. null amounts mean "use the figure from your data".
  const [startingRaw, setStartingRaw] = useState<string | null>(null);
  const [monthlyRaw, setMonthlyRaw] = useState<string | null>(null);
  const [durationYears, setDurationYears] = useState(20);
  const [inflationRate, setInflationRate] = useState(6);
  const [ratesRaw, setRatesRaw] = useState(DEFAULT_RATES_INPUT);
  const rates = useMemo(() => parseRates(ratesRaw), [ratesRaw]);

  const [aiText, setAiText] = useState('');
  const [aiStatus, setAiStatus] = useState<'loading' | 'done' | 'failed'>('loading');

  useEffect(() => {
    async function load() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const txs = await DataService.getTransactions();
        setToday(toLocalDateString(new Date()));
        setTransactions(txs);
        const stored = readStoredView();
        if (stored) setView(stored);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load your data');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const hasData = transactions.length > 0;
  const snapshot = useMemo(
    () => (today ? moneySnapshot(transactions, profileIncome, today) : null),
    [transactions, profileIncome, today]
  );
  const purchases = useMemo(() => (today ? biggestOptionalPurchases(transactions, today, 60, 4) : []), [transactions, today]);
  const setAside = useMemo(() => (snapshot ? setAsideEstimate(snapshot, trimPct / 100) : null), [snapshot, trimPct]);
  const nonEssential = snapshot ? snapshot.monthlyTrim + snapshot.monthlyOptional : 0;

  // Advanced prefill: money saved so far, and what you could set aside each month.
  const suggestedStarting = hasData && snapshot ? roundAbout(snapshot.savedSoFar) : DEFAULT_STARTING;
  const suggestedMonthly = hasData && setAside && setAside.total > 0 ? roundAbout(setAside.total) : DEFAULT_MONTHLY;
  const calcInputs: CalculatorInputs = {
    startingRaw: startingRaw ?? String(suggestedStarting),
    monthlyRaw: monthlyRaw ?? String(suggestedMonthly),
    durationYears,
    inflationRate,
    ratesRaw,
  };
  const onCalcChange = (patch: Partial<CalculatorInputs>) => {
    if (patch.startingRaw !== undefined) setStartingRaw(patch.startingRaw);
    if (patch.monthlyRaw !== undefined) setMonthlyRaw(patch.monthlyRaw);
    if (patch.durationYears !== undefined) setDurationYears(patch.durationYears);
    if (patch.inflationRate !== undefined) setInflationRate(patch.inflationRate);
    if (patch.ratesRaw !== undefined) setRatesRaw(patch.ratesRaw);
  };

  /**
   * Figures the AI may read back. All computed here at the example rates and
   * a 50% cut; the model only rephrases them.
   */
  const aiContext = useMemo(() => {
    if (!snapshot || !hasData) return null;
    const half = setAsideEstimate(snapshot, 0.5);
    const top = purchases[0];
    const topAmount = top ? Number(top.amount) : 0;
    return {
      currency,
      about:
        "Future planner. Monthly averages from the user's own records, and example growth at fixed yearly rates (not promises).",
      userType: user?.user_type ?? null,
      monthsAveraged: Math.round(snapshot.months * 10) / 10,
      typicalMonthlyIncome: snapshot.monthlyIncome > 0 ? roundAbout(snapshot.monthlyIncome) : null,
      incomeFrom: snapshot.incomeFrom,
      averageMonthlySpending: roundAbout(snapshot.monthlySpend),
      leftOverEachMonth: snapshot.monthlyLeft === null ? null : roundAbout(snapshot.monthlyLeft),
      couldTrimSpendingPerMonth: roundAbout(snapshot.monthlyTrim),
      optionalSpendingPerMonth: roundAbout(snapshot.monthlyOptional),
      ifCutByHalf: {
        freedUpPerMonth: roundAbout(half.fromTrim),
        couldSetAsidePerMonth: roundAbout(half.total),
      },
      exampleYearlyReturnsPct: {
        fixedDeposit: DEFAULT_RATES.fd,
        debtOrHybridFund: DEFAULT_RATES.debt,
        indexFund: DEFAULT_RATES.index,
        stocks: DEFAULT_RATES.stocks,
      },
      freedUpAmountAsMonthlySip: {
        perMonth: roundAbout(half.fromTrim),
        inIndexFundAfter10Years: roundAbout(futureValueSip(half.fromTrim, DEFAULT_RATES.index, 10)),
        inFdAfter10Years: roundAbout(futureValueSip(half.fromTrim, DEFAULT_RATES.fd, 10)),
      },
      biggestRecentOptionalPurchase: top
        ? {
            what: top.description || top.merchant || 'A purchase',
            date: top.purchase_date,
            amount: roundAbout(topAmount),
            inIndexFundAfter10Years: roundAbout(futureValueLumpSum(topAmount, DEFAULT_RATES.index, 10)),
            inFdInterestPerMonth: roundAbout(monthlyInterest(topAmount, DEFAULT_RATES.fd)),
          }
        : null,
    };
  }, [snapshot, hasData, purchases, currency, user?.user_type]);

  /** Plain sentence used when the AI can't be reached. Same figures as the AI gets. */
  const fallbackText = useMemo(() => {
    if (!aiContext) return '';
    const f = (n: number) => formatCurrency(n, currency).replace(/\.00$/, '');
    const parts = [
      aiContext.typicalMonthlyIncome
        ? `You typically bring in about ${f(aiContext.typicalMonthlyIncome)} a month and spend about ${f(aiContext.averageMonthlySpending)}.`
        : `You spend about ${f(aiContext.averageMonthlySpending)} a month.`,
    ];
    if (aiContext.ifCutByHalf.freedUpPerMonth > 0) {
      parts.push(
        `Cutting half of your could-trim and optional spending would free up about ${f(aiContext.ifCutByHalf.freedUpPerMonth)} a month. ` +
          `Put into an index fund every month, that could grow to about ${f(aiContext.freedUpAmountAsMonthlySip.inIndexFundAfter10Years)} in 10 years, if returns averaged ${DEFAULT_RATES.index}% a year (not guaranteed).`
      );
    }
    return parts.join(' ');
  }, [aiContext, currency]);

  useEffect(() => {
    if (!aiContext) return;
    const ctrl = new AbortController();
    const body = JSON.stringify({ question: AI_QUESTION, language, context: aiContext });
    void (async () => {
      try {
        let text = aiCache.get(body);
        if (text === undefined) {
          const res = await fetch('/api/ai/coach', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            signal: ctrl.signal,
          });
          if (!res.ok || !res.body) throw new Error('The AI is unavailable right now.');
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let acc = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            setAiText(cleanReply(acc));
          }
          text = cleanReply(acc).trim();
          if (!text) throw new Error('Empty reply');
          aiCache.set(body, text);
        }
        setAiText(text);
        setAiStatus('done');
      } catch {
        if (ctrl.signal.aborted) return;
        setAiStatus('failed');
      }
    })();
    return () => ctrl.abort();
  }, [aiContext, language]);

  const changeView = (v: View) => {
    setView(v);
    storeView(v);
  };

  if (loading || !snapshot || !setAside) {
    return (
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Skeleton className="h-36" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-16" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const calculator = (
    <AdvancedCalculator
      currency={currency}
      inputs={calcInputs}
      rates={rates}
      onChange={onCalcChange}
      onResetRates={() => setRatesRaw(DEFAULT_RATES_INPUT)}
      prefillNote={
        hasData && (startingRaw === null || monthlyRaw === null)
          ? 'Filled in from your records: what you have saved so far (money in minus money out), and what you could set aside each month.'
          : undefined
      }
    />
  );

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <PageHeader
          title="Future planner"
          description="What your own spending and saving could grow into, in plain numbers."
        />
        <Segmented
          variant="underline"
          value={view}
          onChange={changeView}
          options={[
            { value: 'simple', label: 'Simple' },
            { value: 'advanced', label: 'Advanced' },
          ]}
        />
      </div>

      {view === 'advanced' ? (
        calculator
      ) : !hasData ? (
        <>
          <EmptyState
            title="Nothing to plan with yet"
            description="Add a few expenses, and your monthly income in Settings. This page will then show what your own spending could grow into. Until then, try the calculator below."
            action={
              <Link href="/add-expense" className={buttonVariants()}>
                <Plus /> Add spending
              </Link>
            }
          />
          {calculator}
        </>
      ) : (
        <SimpleView
          currency={currency}
          snapshot={snapshot}
          setAside={setAside}
          nonEssential={nonEssential}
          trimPct={trimPct}
          onTrimPct={setTrimPct}
          purchases={purchases}
          horizon={horizon}
          onHorizon={setHorizon}
          sipOption={sipOption}
          onSipOption={setSipOption}
          rates={rates}
          inflationRate={inflationRate}
          ai={{ status: aiStatus, text: aiText, fallback: fallbackText }}
          onAdvanced={() => changeView('advanced')}
        />
      )}

      <div className="space-y-1.5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
        <p>
          These numbers are examples that assume the same return every year. Real markets go up and down, and returns
          can be lower or even negative. Taxes, fees and inflation reduce real growth. Nothing here is guaranteed.
        </p>
        <p>
          This planner is for learning only and is not personalised financial or investment advice. SpendWise does not
          sell, recommend or broker any investment.
        </p>
      </div>
    </div>
  );
}

/** An inline whole-rupee amount inside a sentence or hint. */
function Amt({
  amount,
  currency,
  tone = 'default',
  className,
}: {
  amount: number;
  currency: string;
  tone?: 'default' | 'muted' | 'brand' | 'danger';
  className?: string;
}) {
  return <Money amount={amount} currency={currency} size="sm" decimals={false} tone={tone} className={className} />;
}

function SimpleView({
  currency,
  snapshot: s,
  setAside,
  nonEssential,
  trimPct,
  onTrimPct,
  purchases,
  horizon,
  onHorizon,
  sipOption,
  onSipOption,
  rates,
  inflationRate,
  ai,
  onAdvanced,
}: {
  currency: string;
  snapshot: MoneySnapshot;
  setAside: ReturnType<typeof setAsideEstimate>;
  nonEssential: number;
  trimPct: number;
  onTrimPct: (v: number) => void;
  purchases: Transaction[];
  horizon: Horizon;
  onHorizon: (h: Horizon) => void;
  sipOption: InvestOptionKey;
  onSipOption: (k: InvestOptionKey) => void;
  rates: Record<InvestOptionKey, number>;
  inflationRate: number;
  ai: { status: 'loading' | 'done' | 'failed'; text: string; fallback: string };
  onAdvanced: () => void;
}) {
  const cutLabel = trimPct === 50 ? 'by half' : trimPct === 100 ? 'completely' : `by ${trimPct}%`;
  const years = Number(horizon);
  const purchasesTotal = purchases.reduce((sum, t) => sum + Number(t.amount), 0);
  const sip = OPTIONS.find((o) => o.key === sipOption) ?? OPTIONS[2];
  const leftPct = s.monthlyLeft !== null && s.monthlyIncome > 0 ? Math.round((s.monthlyLeft / s.monthlyIncome) * 100) : null;

  return (
    <>
      {/* Summary */}
      <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] animate-rise">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">You could set aside about</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money amount={roundAbout(setAside.total)} currency={currency} size="hero" decimals={false} tone="default" />
            <span className="text-sm text-muted-foreground">a month</span>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {s.monthlyLeft === null ? (
              <>
                That&apos;s what you&apos;d free up by cutting your could-trim and optional spending {cutLabel}.{' '}
                <Link href="/settings" className="text-foreground underline underline-offset-4 hover:text-brand">
                  Add your monthly income
                </Link>{' '}
                to include what&apos;s left after spending.
              </>
            ) : s.monthlyLeft >= 0 ? (
              <>
                That&apos;s <Amt currency={currency} amount={roundAbout(setAside.fromLeftover)} tone="muted" /> left after spending each month, plus{' '}
                <Amt currency={currency} amount={roundAbout(setAside.fromTrim)} tone="brand" /> if you cut your could-trim and optional spending {cutLabel}.
              </>
            ) : setAside.total > 0 ? (
              <>
                Right now you spend about <Amt currency={currency} amount={roundAbout(-s.monthlyLeft)} tone="danger" /> more than comes in. Cutting your
                could-trim and optional spending {cutLabel} would cover that and leave the amount above.
              </>
            ) : (
              <>
                Right now you spend about <Amt currency={currency} amount={roundAbout(-s.monthlyLeft)} tone="danger" /> more than comes in. Even
                cutting your could-trim and optional spending {cutLabel} would leave you about{' '}
                <Amt currency={currency} amount={roundAbout(-(setAside.fromLeftover + setAside.fromTrim))} tone="muted" /> short, so it&apos;s worth
                looking at the bigger bills too.
              </>
            )}
          </p>
        </div>

        {/* AI read-back */}
        <div className="space-y-2 lg:border-l lg:border-border lg:pl-10">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Sparkles className="size-3.5 text-brand" aria-hidden />
            In plain words
          </div>
          {ai.status === 'failed' ? (
            <p className="text-sm leading-[1.7] text-foreground">{ai.fallback}</p>
          ) : ai.text ? (
            <p className="whitespace-pre-wrap text-sm leading-[1.7] text-foreground">
              {ai.text}
              {ai.status === 'loading' && (
                <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-brand/70" />
              )}
            </p>
          ) : (
            <div className="space-y-2 pt-1" aria-label="Writing a short explanation">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          )}
          {ai.status === 'done' && (
            <p className="text-xs text-subtle">Written by AI from the figures on this page, at the example rates and a 50% cut.</p>
          )}
        </div>
      </section>

      <div className="border-y border-border py-5 animate-rise" style={{ animationDelay: '40ms' }}>
        <MetricStrip>
          <Metric
            label="Money in"
            value={
              s.monthlyIncome > 0 ? (
                <Money amount={s.monthlyIncome} currency={currency} size="lg" decimals={false} tone="success" />
              ) : (
                <span className="text-xl text-subtle">Not set</span>
              )
            }
            hint={
              s.incomeFrom === 'profile' ? (
                'A month, from your profile'
              ) : s.incomeFrom === 'transactions' ? (
                'A month, from income you recorded'
              ) : (
                <Link href="/settings" className="underline underline-offset-4 hover:text-brand">
                  Add it in Settings
                </Link>
              )
            }
          />
          <Metric
            label="Spent"
            value={<Money amount={s.monthlySpend} currency={currency} size="lg" decimals={false} />}
            hint={monthsLabel(s)}
          />
          <Metric
            label="Left over"
            value={
              s.monthlyLeft === null ? (
                <span className="text-xl text-subtle">—</span>
              ) : (
                <Money
                  amount={s.monthlyLeft}
                  currency={currency}
                  size="lg"
                  decimals={false}
                  tone={s.monthlyLeft < 0 ? 'danger' : 'default'}
                />
              )
            }
            hint={
              leftPct === null
                ? 'Needs your income'
                : leftPct < 0
                  ? 'You spend more than comes in'
                  : `${leftPct}% of what comes in`
            }
          />
          <Metric
            label="Could trim + optional"
            value={<Money amount={nonEssential} currency={currency} size="lg" decimals={false} tone={nonEssential > 0 ? 'warning' : 'default'} />}
            hint={
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'var(--trim)' }} />
                  <Amt currency={currency} amount={s.monthlyTrim} tone="muted" className="text-xs" /> trim
                </span>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'var(--optional)' }} />
                  <Amt currency={currency} amount={s.monthlyOptional} tone="muted" className="text-xs" /> optional
                </span>
              </span>
            }
          />
        </MetricStrip>
      </div>

      <p className="-mt-6 text-xs leading-relaxed text-muted-foreground">
        Example yearly returns:{' '}
        {OPTIONS.map((o, i) => (
          <span key={o.key}>
            {i > 0 && ', '}
            {o.short} {rates[o.key]}%
          </span>
        ))}
        {ratesAreDefault(rates) ? '' : ' (your rates)'}. For learning, not financial advice; returns aren&apos;t guaranteed and
        shares can fall.{' '}
        <button type="button" onClick={onAdvanced} className="text-foreground underline underline-offset-4 hover:text-brand">
          Change them
        </button>
      </p>

      {/* Instead of buying it */}
      <Section
        title="Instead of buying it"
        description="Your biggest optional buys from the last 60 days, and what that money could have become."
        action={
          purchases.length > 0 ? (
            <Segmented
              size="sm"
              value={horizon}
              onChange={onHorizon}
              options={[
                { value: '1', label: '1 year' },
                { value: '5', label: '5 years' },
                { value: '10', label: '10 years' },
              ]}
            />
          ) : undefined
        }
        className="animate-rise"
      >
        {purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No could-trim or optional purchases in the last 60 days. When you add some, they&apos;ll show up here.
          </p>
        ) : (
          <>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Together these came to <Amt currency={currency} amount={purchasesTotal} />. Put in an index fund instead, that could be about{' '}
              <Amt currency={currency} amount={roundAbout(futureValueLumpSum(purchasesTotal, rates.index, years))} tone="brand" /> after {years}{' '}
              {years === 1 ? 'year' : 'years'}, or pay about{' '}
              <Amt currency={currency} amount={roundAbout(monthlyInterest(purchasesTotal, rates.fd))} /> a month as FD interest.
            </p>
            <div className="-mx-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-[13px] text-muted-foreground">
                    <th className="h-9 px-3 text-left font-normal">You bought</th>
                    {OPTIONS.map((o) => (
                      <th key={o.key} className="h-9 px-3 text-right font-normal">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className="size-2 rounded-full" style={{ background: o.color }} />
                          {o.short}
                          <span className="text-xs text-subtle">{rates[o.key]}%</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {purchases.map((t) => {
                    const amount = Number(t.amount);
                    const color = PURCHASE_KINDS[kindForTransaction(t)].color;
                    const name = t.description || t.merchant || 'Purchase';
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-foreground/[0.025]">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                              style={{ background: `${color}1f`, color }}
                            >
                              {name.slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <div className="max-w-[200px] truncate">{name}</div>
                              <div className="text-xs text-muted-foreground">
                                <Amt currency={currency} amount={amount} tone="muted" className="text-xs" /> · {SHORT_DATE.format(parseDate(t.purchase_date))}
                                {t.essentiality === 'optimizable' ? ' · could trim' : ' · optional'}
                              </div>
                            </div>
                          </div>
                        </td>
                        {OPTIONS.map((o) => (
                          <td key={o.key} className="px-3 py-3 text-right align-middle">
                            <Amt currency={currency} amount={futureValueLumpSum(amount, rates[o.key], years)} className={o.key === 'index' ? 'font-medium' : undefined} />
                            <div className="text-xs text-subtle">
                              <Amt currency={currency} amount={monthlyInterest(amount, rates[o.key])} tone="muted" className="text-xs" /> a month
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              &ldquo;A month&rdquo; is roughly what the money would earn each month in the first year. For an FD, that&apos;s the
              interest the bank would pay you every month.
            </p>
          </>
        )}
      </Section>

      {/* If you trimmed a little */}
      <Section
        title="If you trimmed a little"
        description="Put part of your could-trim and optional spending into a SIP: a fixed amount invested every month."
        className="animate-rise"
      >
        {nonEssential <= 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t recorded any could-trim or optional spending lately, so there&apos;s nothing to trim here. Try the
            Advanced view to plan with any amount.
          </p>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[13px] font-medium">Invest it in</p>
                <Segmented
                  size="sm"
                  value={sipOption}
                  onChange={onSipOption}
                  options={OPTIONS.map((o) => ({ value: o.key, label: o.short }))}
                />
              </div>
              <RangeField
                id="trim-share"
                label="Cut it by"
                value={trimPct}
                display={`${trimPct}%`}
                min={10}
                max={100}
                step={10}
                onChange={onTrimPct}
                minLabel="10%"
                maxLabel="100%"
              />
              <div className="space-y-1 border-t border-border pt-4">
                <p className="text-[13px] text-muted-foreground">You&apos;d invest each month</p>
                <Money amount={roundAbout(setAside.fromTrim)} currency={currency} size="xl" decimals={false} tone="brand" />
                <p className="text-xs text-muted-foreground">
                  {trimPct}% of <Amt currency={currency} amount={nonEssential} tone="muted" className="text-xs" /> a month
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-foreground">{sip.label}.</span> {sip.note}
              </p>
            </div>

            <ul className="-mx-3 divide-y divide-border/70">
              {SIP_YEARS.map((y) => {
                const worth = futureValueSip(setAside.fromTrim, rates[sip.key], y);
                const putIn = setAside.fromTrim * 12 * y;
                const real = inflationAdjusted(worth, inflationRate, y);
                return (
                  <li key={y} className="flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-foreground/[0.025]">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-sm">In {y} years</div>
                      <div className="text-xs text-muted-foreground">
                        You&apos;d have put in <Amt currency={currency} amount={roundAbout(putIn)} tone="muted" className="text-xs" />
                        {inflationRate > 0 && (
                          <>
                            {' '}
                            · worth <Amt currency={currency} amount={roundAbout(real)} tone="muted" className="text-xs" /> in today&apos;s money
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Money amount={roundAbout(worth)} currency={currency} size="lg" decimals={false} tone={sip.tone === 'warning' ? 'warning' : 'brand'} />
                      <div className="text-xs text-muted-foreground">
                        then pays <Amt currency={currency} amount={roundAbout(monthlyInterest(worth, rates.fd))} tone="muted" className="text-xs" /> a month as FD
                        interest
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>
    </>
  );
}
