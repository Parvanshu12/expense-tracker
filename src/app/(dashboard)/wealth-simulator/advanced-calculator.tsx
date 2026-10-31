'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Section } from '@/components/ui/section';
import { Money } from '@/components/ui/money';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { simulateWealthGrowth } from '@/lib/calculations/finance';
import type { InvestOptionKey } from '@/lib/calculations/invest';
import { formatCurrency } from '@/lib/utils';
import type { WealthSimulationYearResult } from '@/types/finance';
import { OPTIONS, parseAmount, ratesAreDefault, type Rates, type RatesInput } from './options';
import { RangeField } from './range-field';

type ChartPoint = { year: number; invested: number; indexReal: number } & Record<InvestOptionKey, number>;

const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--foreground)',
  boxShadow: 'var(--shadow-pop)',
};

const axisTick = { fill: 'var(--subtle)', fontSize: 11 };

export interface CalculatorInputs {
  startingRaw: string;
  monthlyRaw: string;
  durationYears: number;
  inflationRate: number;
  ratesRaw: RatesInput;
}

/**
 * The full compound-growth calculator: your numbers on the left; what each way
 * of investing could grow to, a chart and a year-by-year table on the right.
 */
export function AdvancedCalculator({
  currency,
  inputs,
  rates,
  onChange,
  onResetRates,
  prefillNote,
}: {
  currency: string;
  inputs: CalculatorInputs;
  rates: Rates;
  onChange: (patch: Partial<CalculatorInputs>) => void;
  onResetRates: () => void;
  /** Explains where the prefilled amounts came from. */
  prefillNote?: React.ReactNode;
}) {
  const { startingRaw, monthlyRaw, durationYears, inflationRate, ratesRaw } = inputs;
  const startingAmount = parseAmount(startingRaw);
  const monthlyContribution = parseAmount(monthlyRaw);

  const results = useMemo(() => {
    const byOption = {} as Record<InvestOptionKey, WealthSimulationYearResult[]>;
    for (const opt of OPTIONS) {
      byOption[opt.key] = simulateWealthGrowth({
        startingAmount,
        monthlyContribution,
        annualReturnRate: rates[opt.key],
        durationYears,
        inflationRate,
      });
    }
    return byOption;
  }, [startingAmount, monthlyContribution, durationYears, inflationRate, rates]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const start: ChartPoint = {
      year: 0,
      invested: startingAmount,
      fd: startingAmount,
      debt: startingAmount,
      index: startingAmount,
      stocks: startingAmount,
      indexReal: startingAmount,
    };
    const rows = results.index.map((m, i) => ({
      year: m.year,
      invested: m.totalInvested,
      fd: results.fd[i].futureValue,
      debt: results.debt[i].futureValue,
      index: m.futureValue,
      stocks: results.stocks[i].futureValue,
      indexReal: m.inflationAdjustedValue ?? m.futureValue,
    }));
    return [start, ...rows];
  }, [results, startingAmount]);

  const tableRows = useMemo(
    () => chartData.filter((p) => p.year > 0 && (p.year % 5 === 0 || p.year === durationYears)),
    [chartData, durationYears]
  );

  const totalInvested = startingAmount + monthlyContribution * 12 * durationYears;
  const showReal = inflationRate > 0;

  const money = (v: number) => formatCurrency(v, currency);
  const compact = useMemo(() => {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    } catch {
      return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
    }
  }, [currency]);

  const seriesName: Record<string, string> = {
    invested: 'You put in',
    indexReal: "Index fund, in today's money",
  };
  for (const opt of OPTIONS) seriesName[opt.key] = `${opt.short}, ${rates[opt.key]}%`;

  const years = `${durationYears} ${durationYears === 1 ? 'year' : 'years'}`;

  return (
    <div className="grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Inputs: a quiet column, no box */}
      <Section title="Your numbers" description="Change these to see what happens." className="h-fit animate-rise">
        <div className="space-y-6 pt-1">
          <Field label="Money you have now" htmlFor="starting-amount">
            <Input
              id="starting-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step={5000}
              value={startingRaw}
              onChange={(e) => onChange({ startingRaw: e.target.value })}
              className="tabular"
            />
          </Field>
          <Field label="Amount you add each month" htmlFor="monthly-contribution">
            <Input
              id="monthly-contribution"
              type="number"
              inputMode="decimal"
              min={0}
              step={1000}
              value={monthlyRaw}
              onChange={(e) => onChange({ monthlyRaw: e.target.value })}
              className="tabular"
            />
          </Field>
          {prefillNote && <p className="-mt-3 text-xs leading-relaxed text-muted-foreground">{prefillNote}</p>}
          <RangeField
            id="duration-years"
            label="For how many years"
            value={durationYears}
            display={years}
            min={1}
            max={40}
            step={1}
            onChange={(v) => onChange({ durationYears: v })}
          />
          <RangeField
            id="inflation-rate"
            label="Prices rise each year by"
            value={inflationRate}
            display={`${inflationRate}%`}
            min={0}
            max={10}
            step={0.5}
            onChange={(v) => onChange({ inflationRate: v })}
            hint="Things cost more over time (inflation). We use this to show what the future amount would buy today."
          />
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium">Expected return a year</p>
            {!ratesAreDefault(rates) && (
              <button
                type="button"
                onClick={onResetRates}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-brand hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {OPTIONS.map((opt) => (
              <label key={opt.key} htmlFor={`rate-${opt.key}`} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: opt.color }} />
                  {opt.short}
                </span>
                <span className="relative">
                  <Input
                    id={`rate-${opt.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={50}
                    step={0.5}
                    value={ratesRaw[opt.key]}
                    onChange={(e) => onChange({ ratesRaw: { ...ratesRaw, [opt.key]: e.target.value } })}
                    className="tabular pr-7"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">%</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Guesses, not promises. Shares (index funds and stocks) can fall for years at a time.
          </p>
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          <p className="text-[13px] text-muted-foreground">Total you put in</p>
          <Money amount={totalInvested} currency={currency} size="lg" decimals={false} />
        </div>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">How money grows.</span> When your savings earn a return, that return
          starts earning too. This is called compounding, and it is why money left alone for longer grows faster.
        </p>
      </Section>

      {/* Results */}
      <div className="min-w-0 space-y-12">
        <div className="border-y border-border py-5 animate-rise" style={{ animationDelay: '40ms' }}>
          <MetricStrip className="sm:grid-cols-2 sm:gap-x-5 sm:divide-x-0 lg:grid-cols-4 lg:gap-x-0 lg:divide-x">
            {OPTIONS.map((opt) => {
              const last = results[opt.key][results[opt.key].length - 1];
              const value = last?.futureValue ?? startingAmount;
              const real = last?.inflationAdjustedValue ?? value;
              const multiple = totalInvested > 0 ? value / totalInvested : 1;
              return (
                <Metric
                  key={opt.key}
                  className="sm:px-0 lg:px-4 lg:first:pl-0"
                  label={
                    <>
                      <span aria-hidden className="size-2 rounded-full" style={{ background: opt.color }} />
                      {opt.short} · {rates[opt.key]}%
                    </>
                  }
                  value={<Money amount={value} currency={currency} size="lg" decimals={false} tone={opt.tone} />}
                  hint={
                    <span className="block space-y-0.5 pt-1">
                      <span className="tabular block">
                        {multiple.toFixed(1)}× what you put in
                        {showReal && (
                          <>
                            {' '}
                            · <Money amount={real} currency={currency} size="sm" decimals={false} tone="muted" className="text-xs" /> today
                          </>
                        )}
                      </span>
                      <span className="block text-subtle">{opt.risk}</span>
                    </span>
                  }
                />
              );
            })}
          </MetricStrip>
        </div>

        <Section
          title="How it could grow"
          description={`Over ${years}, if the yearly return stayed the same`}
          className="animate-rise"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {[...OPTIONS].reverse().map((opt) => (
              <span key={opt.key} className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-3 rounded-full" style={{ background: opt.color }} />
                {opt.short}
              </span>
            ))}
            {showReal && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t-[1.5px] border-dashed" style={{ borderColor: 'var(--chart-3)' }} />
                Index fund, in today&apos;s money
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: 'var(--chart-4)' }} />
              You put in
            </span>
          </div>
          <div className="h-72 w-full" aria-label="How your money could grow in each kind of investment">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="indexFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(y: number) => `${y}y`}
                  minTickGap={16}
                />
                <YAxis
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickFormatter={(v: number) => compact.format(v)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: 'var(--muted-foreground)', marginBottom: 4 }}
                  itemStyle={{ color: 'var(--foreground)', padding: 0 }}
                  cursor={{ stroke: 'var(--border)' }}
                  labelFormatter={(label) => `Year ${String(label)}`}
                  formatter={(value, name) => [money(Number(value ?? 0)), seriesName[String(name)] ?? String(name)]}
                />
                <Area
                  type="monotone"
                  dataKey="invested"
                  stroke="var(--chart-3)"
                  strokeWidth={1}
                  fill="var(--chart-4)"
                  fillOpacity={0.45}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="index"
                  stroke="none"
                  fill="url(#indexFill)"
                  legendType="none"
                  tooltipType="none"
                  activeDot={false}
                  isAnimationActive={false}
                />
                {OPTIONS.map((opt) => (
                  <Line
                    key={opt.key}
                    type="monotone"
                    dataKey={opt.key}
                    stroke={opt.color}
                    strokeWidth={opt.key === 'index' ? 2.25 : 1.75}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: opt.color }}
                    isAnimationActive={false}
                  />
                ))}
                {showReal && (
                  <Line
                    type="monotone"
                    dataKey="indexReal"
                    stroke="var(--chart-3)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: 'var(--chart-3)' }}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Year by year" description="What it could be worth every five years." className="animate-rise">
          <div className="-mx-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-[13px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-normal">Year</th>
                  <th className="h-9 px-3 text-right font-normal">You put in</th>
                  {OPTIONS.map((opt) => (
                    <th key={opt.key} className="h-9 px-3 text-right font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: opt.color }} />
                        {opt.short}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {tableRows.map((row) => (
                  <tr key={row.year} className="h-11 transition-colors hover:bg-foreground/[0.025]">
                    <td className="tabular px-3 text-muted-foreground">{row.year}</td>
                    <td className="px-3 text-right">
                      <Money amount={row.invested} currency={currency} size="sm" decimals={false} tone="muted" />
                    </td>
                    {OPTIONS.map((opt) => (
                      <td key={opt.key} className="px-3 text-right">
                        <Money
                          amount={row[opt.key]}
                          currency={currency}
                          size="sm"
                          decimals={false}
                          className={opt.key === 'index' ? 'font-medium' : undefined}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="What these are" className="animate-rise">
          <dl className="divide-y divide-border">
            {OPTIONS.map((opt) => (
              <div key={opt.key} className="flex items-start gap-3 py-3">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: opt.color }} />
                <div className="min-w-0 flex-1">
                  <dt className="text-sm">
                    {opt.label} <span className="text-xs text-subtle">· {opt.risk}</span>
                  </dt>
                  <dd className="text-[13px] text-muted-foreground">{opt.note}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </div>
  );
}
