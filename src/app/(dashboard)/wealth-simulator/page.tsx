'use client';

import { useMemo, useState } from 'react';
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
import { Lightbulb, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Stat } from '@/components/ui/stat';
import { useSession } from '@/components/layout/session-provider';
import { simulateWealthGrowth } from '@/lib/calculations/finance';
import { formatCurrency } from '@/lib/utils';
import type { WealthSimulationYearResult } from '@/types/finance';

type ScenarioKey = 'conservative' | 'moderate' | 'aggressive';

interface Scenario {
  key: ScenarioKey;
  label: string;
  description: string;
  rate: number;
  color: string;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'conservative',
    label: 'Low risk',
    description: 'Like fixed deposits or bonds. Slower, steadier growth.',
    rate: 7,
    color: 'var(--info)',
  },
  {
    key: 'moderate',
    label: 'Medium risk',
    description: 'Like an index fund that follows the whole market.',
    rate: 10,
    color: 'var(--primary)',
  },
  {
    key: 'aggressive',
    label: 'Higher risk',
    description: 'Mostly shares. Can grow more, with bigger ups and downs.',
    rate: 12,
    color: 'var(--success)',
  },
];

interface ChartPoint {
  year: number;
  invested: number;
  conservative: number;
  moderate: number;
  aggressive: number;
  moderateReal: number;
}

const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--foreground)',
  boxShadow: 'var(--shadow-pop)',
};

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 11 };

function parseAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function RangeField({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="tabular text-[13px] font-medium text-foreground">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer"
        style={{ accentColor: 'var(--primary)' }}
      />
      <div className="tabular flex justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function WealthSimulatorPage() {
  const { user } = useSession();
  const currency = user?.currency || 'INR';

  const [startingRaw, setStartingRaw] = useState('50000');
  const [monthlyRaw, setMonthlyRaw] = useState('10000');
  const [durationYears, setDurationYears] = useState(20);
  const [inflationRate, setInflationRate] = useState(6);

  const startingAmount = parseAmount(startingRaw);
  const monthlyContribution = parseAmount(monthlyRaw);

  const results = useMemo(() => {
    const byScenario = {} as Record<ScenarioKey, WealthSimulationYearResult[]>;
    for (const sc of SCENARIOS) {
      byScenario[sc.key] = simulateWealthGrowth({
        startingAmount,
        monthlyContribution,
        annualReturnRate: sc.rate,
        durationYears,
        inflationRate,
      });
    }
    return byScenario;
  }, [startingAmount, monthlyContribution, durationYears, inflationRate]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const start: ChartPoint = {
      year: 0,
      invested: startingAmount,
      conservative: startingAmount,
      moderate: startingAmount,
      aggressive: startingAmount,
      moderateReal: startingAmount,
    };
    const rows = results.moderate.map((m, i) => ({
      year: m.year,
      invested: m.totalInvested,
      conservative: results.conservative[i].futureValue,
      moderate: m.futureValue,
      aggressive: results.aggressive[i].futureValue,
      moderateReal: m.inflationAdjustedValue ?? m.futureValue,
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
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      });
    } catch {
      return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
    }
  }, [currency]);

  const seriesName: Record<string, string> = {
    invested: 'You put in',
    conservative: 'Low risk, 7%',
    moderate: 'Medium risk, 10%',
    aggressive: 'Higher risk, 12%',
    moderateReal: "Medium risk, in today's money",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Future planner"
        description="See how putting a little aside every month could grow over the years."
      />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-card animate-rise">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info/12 text-info [&_svg]:size-4">
          <Lightbulb aria-hidden />
        </div>
        <div className="space-y-0.5 text-sm">
          <p className="font-medium text-foreground">How money grows over time</p>
          <p className="text-muted-foreground">
            When your savings earn a return, that return starts earning too. This is called compounding, and it
            is why money left alone for longer grows faster. These are examples for learning, not promises.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Inputs */}
        <Card className="h-fit animate-rise">
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
            <CardDescription>Change these to see what happens.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Money you have now" htmlFor="starting-amount">
              <Input
                id="starting-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step={5000}
                value={startingRaw}
                onChange={(e) => setStartingRaw(e.target.value)}
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
                onChange={(e) => setMonthlyRaw(e.target.value)}
                className="tabular"
              />
            </Field>
            <RangeField
              id="duration-years"
              label="For how many years"
              value={durationYears}
              display={`${durationYears} ${durationYears === 1 ? 'year' : 'years'}`}
              min={1}
              max={40}
              step={1}
              onChange={setDurationYears}
            />
            <RangeField
              id="inflation-rate"
              label="Prices rise each year by"
              value={inflationRate}
              display={`${inflationRate}%`}
              min={0}
              max={10}
              step={0.5}
              onChange={setInflationRate}
              hint="Things cost more over time (inflation). We use this to show what the future amount would buy today."
            />
          </CardContent>
          <CardFooter className="flex-col items-start gap-0.5">
            <span className="text-xs text-muted-foreground">Total you put in</span>
            <span className="tabular text-sm font-medium text-foreground">{money(totalInvested)}</span>
          </CardFooter>
        </Card>

        {/* Results */}
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {SCENARIOS.map((sc) => {
              const last = results[sc.key][results[sc.key].length - 1];
              const value = last?.futureValue ?? startingAmount;
              const real = last?.inflationAdjustedValue ?? value;
              const multiple = totalInvested > 0 ? value / totalInvested : 1;
              return (
                <Stat
                  key={sc.key}
                  className="animate-rise"
                  label={`${sc.label} · ${sc.rate}% a year`}
                  icon={
                    <span
                      aria-hidden
                      className="flex size-7 items-center justify-center rounded-md"
                      style={{
                        background: `color-mix(in srgb, ${sc.color} 14%, transparent)`,
                        color: sc.color,
                      }}
                    >
                      <TrendingUp />
                    </span>
                  }
                  value={money(value)}
                  hint={
                    <span className="tabular">
                      {multiple.toFixed(1)}× what you put in
                      {showReal && <> · worth {money(real)} today</>}
                    </span>
                  }
                >
                  <p className="text-xs text-muted-foreground">{sc.description}</p>
                </Stat>
              );
            })}
          </div>

          <Card className="animate-rise" style={{ animationDelay: '60ms' }}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>How it could grow</CardTitle>
                <CardDescription className="tabular">
                  Over {durationYears} {durationYears === 1 ? 'year' : 'years'}, if the yearly return stayed the same
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {[...SCENARIOS].reverse().map((sc) => (
                  <span key={sc.key} className="inline-flex items-center gap-1.5">
                    <span className="h-1 w-3 rounded-full" style={{ background: sc.color }} />
                    {sc.label}
                  </span>
                ))}
                {showReal && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 border-t-2 border-dashed" style={{ borderColor: 'var(--primary)' }} />
                    Medium, in today&apos;s money
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: 'var(--chart-4)' }} />
                  You put in
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                      fillOpacity={0.5}
                      isAnimationActive={false}
                    />
                    {SCENARIOS.map((sc) => (
                      <Line
                        key={sc.key}
                        type="monotone"
                        dataKey={sc.key}
                        stroke={sc.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, strokeWidth: 0, fill: sc.color }}
                        isAnimationActive={false}
                      />
                    ))}
                    {showReal && (
                      <Line
                        type="monotone"
                        dataKey="moderateReal"
                        stroke="var(--primary)"
                        strokeOpacity={0.6}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        activeDot={{ r: 3, strokeWidth: 0, fill: 'var(--primary)' }}
                        isAnimationActive={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-rise" style={{ animationDelay: '120ms' }}>
            <CardHeader>
              <CardTitle>Year by year</CardTitle>
              <CardDescription>What it could be worth every five years.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="h-10 px-5 text-left font-medium">Year</th>
                    <th className="h-10 px-3 text-right font-medium">You put in</th>
                    {SCENARIOS.map((sc) => (
                      <th key={sc.key} className="h-10 px-3 text-right font-medium last:pr-5">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className="size-2 rounded-full" style={{ background: sc.color }} />
                          {sc.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tableRows.map((row) => (
                    <tr key={row.year} className="h-12 transition-colors hover:bg-accent/50">
                      <td className="tabular px-5 text-foreground">{row.year}</td>
                      <td className="tabular px-3 text-right text-muted-foreground">{money(row.invested)}</td>
                      {SCENARIOS.map((sc) => (
                        <td
                          key={sc.key}
                          className="tabular px-3 text-right text-foreground last:pr-5"
                        >
                          {money(row[sc.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        <p>
          These numbers are examples that assume the same return every year, added monthly. Real markets go up and
          down, and returns can be lower or even negative. Taxes, fees and inflation reduce real growth. Nothing here
          is guaranteed.
        </p>
        <p>
          This planner is for learning only and is not personalised financial or investment advice. SpendWise
          does not sell, recommend or broker any investment.
        </p>
      </div>
    </div>
  );
}
