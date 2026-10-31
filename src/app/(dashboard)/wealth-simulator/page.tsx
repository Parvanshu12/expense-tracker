'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Sparkles,
  Info,
  DollarSign,
  Calendar,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { simulateWealthGrowth } from '@/lib/calculations/finance';
import { formatCurrency } from '@/lib/utils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

export default function WealthSimulatorPage() {
  const [startingAmount, setStartingAmount] = useState<number>(50000);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(10000);
  const [annualReturnRate, setAnnualReturnRate] = useState<number>(12); // 12% default
  const [durationYears, setDurationYears] = useState<number>(15);
  const [inflationRate, setInflationRate] = useState<number>(6); // 6% default inflation adjustment

  // Calculate year by year simulation
  const simulationResults = useMemo(() => {
    return simulateWealthGrowth({
      startingAmount,
      monthlyContribution,
      annualReturnRate,
      durationYears,
      inflationRate,
    });
  }, [startingAmount, monthlyContribution, annualReturnRate, durationYears, inflationRate]);

  const finalYear = simulationResults[simulationResults.length - 1] || {
    totalInvested: 0,
    hypotheticalGrowth: 0,
    futureValue: 0,
    inflationAdjustedValue: 0,
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>Long-Term Wealth Projection Simulator</span>
          <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200">
            Educational Scenario Engine
          </Badge>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Simulate hypothetical compound interest trajectories based on disciplined monthly contributions.
        </p>
      </div>

      {/* Main Grid: Controls vs Chart & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Interactive Input Controls */}
        <Card className="p-5 space-y-4">
          <CardTitle className="text-base">Scenario Variables</CardTitle>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Starting Lump Sum (₹)
            </label>
            <Input
              type="number"
              step="5000"
              value={startingAmount}
              onChange={(e) => setStartingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Monthly Recurring Deposit (₹)
            </label>
            <Input
              type="number"
              step="1000"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Math.max(0, parseFloat(e.target.value) || 0))}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Assumed Annual Return
              </label>
              <span className="font-bold text-indigo-600">{annualReturnRate}%</span>
            </div>
            <input
              type="range"
              min="4"
              max="18"
              step="0.5"
              value={annualReturnRate}
              onChange={(e) => setAnnualReturnRate(parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Conservative (7%)</span>
              <span>Moderate (12%)</span>
              <span>Aggressive (15%)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Time Horizon
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[5, 10, 15, 20].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setDurationYears(yr)}
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    durationYears === yr
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600'
                  }`}
                >
                  {yr} Yrs
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Inflation Adjustment
              </label>
              <span className="font-bold text-slate-600 dark:text-slate-400">{inflationRate}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={inflationRate}
              onChange={(e) => setInflationRate(parseFloat(e.target.value))}
              className="w-full accent-slate-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">
              Adjusts future corpus to approximate today&apos;s purchasing power.
            </p>
          </div>
        </Card>

        {/* Right: Growth Chart & Final Metrics */}
        <div className="lg:col-span-2 space-y-4">
          {/* Top 3 Result Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <span className="text-[11px] font-medium text-slate-500">Total Invested</span>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {formatCurrency(finalYear.totalInvested)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Your actual deposits</div>
            </Card>

            <Card className="p-4 border-l-4 border-l-emerald-500">
              <span className="text-[11px] font-medium text-slate-500">Hypothetical Growth</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                +{formatCurrency(finalYear.hypotheticalGrowth)}
              </div>
              <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                From compounding returns
              </div>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 dark:from-indigo-950/40 dark:to-slate-900 border-indigo-200 dark:border-indigo-900">
              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                Future Projected Value
              </span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(finalYear.futureValue)}
              </div>
              {inflationRate > 0 && (
                <div className="text-[10px] text-indigo-800 dark:text-indigo-300 mt-0.5">
                  ≈ {formatCurrency(finalYear.inflationAdjustedValue || 0)} in today&apos;s value
                </div>
              )}
            </Card>
          </div>

          {/* Interactive Compound Growth Area Chart */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3">
              <CardTitle className="text-base">Compound Trajectory Over Time</CardTitle>
              <span className="text-xs text-slate-400">{durationYears} Year Horizon</span>
            </div>
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={simulationResults}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="investedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="year"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickFormatter={(yr) => `Yr ${yr}`}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatCurrency(Number(val || 0)), '']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area
                    type="monotone"
                    dataKey="futureValue"
                    name="Future Projected Value"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#growthGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="totalInvested"
                    name="Total Contributed"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#investedGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Multi-Scenario Comparative Table */}
          <Card className="p-5 space-y-3">
            <CardTitle className="text-sm">Comparative Return Scenarios ({durationYears} Year Horizon)</CardTitle>
            <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Scenario</th>
                    <th className="p-3 text-right">Assumed Rate</th>
                    <th className="p-3 text-right">Total Contributed</th>
                    <th className="p-3 text-right">Projected Corpus</th>
                    <th className="p-3 text-right">Growth Multiplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    { label: 'Conservative (Debt / Fixed Income)', rate: 8, badge: 'Low Risk' },
                    { label: 'Moderate (Broad Equity / Index)', rate: 12, badge: 'Target Baseline' },
                    { label: 'Aggressive (Growth / Dynamic Equity)', rate: 15, badge: 'High Volatility' },
                  ].map((sc) => {
                    const sim = simulateWealthGrowth({
                      startingAmount,
                      monthlyContribution,
                      annualReturnRate: sc.rate,
                      durationYears,
                      inflationRate,
                    });
                    const res = sim[sim.length - 1];
                    const mult = res.totalInvested > 0 ? (res.futureValue / res.totalInvested).toFixed(1) : '1.0';

                    return (
                      <tr key={sc.label} className={sc.rate === annualReturnRate ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''}>
                        <td className="p-3 font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <span>{sc.label}</span>
                            {sc.rate === annualReturnRate && (
                              <span className="text-[10px] text-indigo-600 bg-indigo-100 dark:bg-indigo-900 px-1.5 py-0.2 rounded-sm font-semibold">
                                Active
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-700 dark:text-slate-300">{sc.rate}%</td>
                        <td className="p-3 text-right text-slate-500">{formatCurrency(res.totalInvested)}</td>
                        <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(res.futureValue)}</td>
                        <td className="p-3 text-right font-bold text-indigo-600 dark:text-indigo-400">{mult}x</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* Mandatory Statutory & Ethical Disclosures */}
      <Card className="p-4 bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-slate-500 leading-relaxed">
            <h4 className="font-bold text-slate-800 dark:text-slate-200">
              Educational Simulator Disclosures
            </h4>
            <p>
              • Returns illustrated are hypothetical mathematical projections based on assumed compound annual growth rates. Actual market returns fluctuate and can be lower, volatile, or negative.
            </p>
            <p>
              • Realized investment growth is subject to taxes, fees, and purchasing-power inflation. Results are not guaranteed.
            </p>
            <p>
              • This simulator is designed strictly for educational illustration and does not constitute personalized financial or investment advice. SpendWise AI does not sell, recommend, or broker securities.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
