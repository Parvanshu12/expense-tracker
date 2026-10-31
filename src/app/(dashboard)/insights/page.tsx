'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Sparkles, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/layout/session-provider';
import { DataService } from '@/lib/data-service';
import {
  calculateBudgetSpent,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
  calculateFinancialSummary,
  calculatePotentialSavings,
  filterTransactionsByDateRange,
  getReportingPeriodRange,
  toLocalDateString,
  type DashboardPeriod,
} from '@/lib/calculations/finance';
import { cn, formatCurrency } from '@/lib/utils';
import type { Budget, Category, Transaction } from '@/types/database';

type Scope = Extract<DashboardPeriod, 'this_month' | 'last_3_months' | 'all_time'>;
const SCOPE_LABEL: Record<Scope, string> = {
  this_month: 'This month',
  last_3_months: 'Last 3 months',
  all_time: 'All time',
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  'Where did most of my money go?',
  'What can I cut back on without much pain?',
  'Am I on track with my budgets?',
  'How much did I spend on food?',
];

/** Models sometimes emit markdown emphasis; this UI renders plain text. */
function cleanReply(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');
}

export default function InsightsPage() {
  const { user } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>('this_month');

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [optTrimPct, setOptTrimPct] = useState(20);
  const [discTrimPct, setDiscTrimPct] = useState(30);

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const [txs, bgts, cats] = await Promise.all([
          DataService.getTransactions(),
          DataService.getBudgets(),
          DataService.getCategories(),
        ]);
        setToday(toLocalDateString());
        setTransactions(txs);
        setBudgets(bgts);
        setCategoryList(cats);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load your spending data');
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const scoped = useMemo(
    () => (today ? filterTransactionsByDateRange(transactions, getReportingPeriodRange(scope, today)) : transactions),
    [transactions, scope, today]
  );
  const summary = useMemo(() => calculateFinancialSummary(scoped), [scoped]);
  const categories = useMemo(() => calculateCategoryBreakdown(scoped, 'expense'), [scoped]);
  const essentiality = useMemo(() => calculateEssentialityBreakdown(scoped), [scoped]);
  const potential = useMemo(
    () => calculatePotentialSavings(essentiality.optimizable, essentiality.discretionary, optTrimPct, discTrimPct),
    [essentiality, optTrimPct, discTrimPct]
  );

  /** Everything the coach may quote. All figures are computed here, never by the model. */
  const coachContext = useMemo(() => {
    const merchants = new Map<string, number>();
    for (const t of scoped) {
      if (t.transaction_type === 'expense' && t.merchant) {
        merchants.set(t.merchant, (merchants.get(t.merchant) ?? 0) + Number(t.amount));
      }
    }
    return {
      period: SCOPE_LABEL[scope],
      currency: 'INR',
      transactionCount: scoped.length,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      netSavings: summary.actualSavings,
      savingsRatePct: summary.totalIncome > 0 ? Math.round((summary.actualSavings / summary.totalIncome) * 1000) / 10 : null,
      essentiality: {
        essential: essentiality.essential,
        optimizable: essentiality.optimizable,
        discretionary: essentiality.discretionary,
        essentialPct: Math.round(essentiality.essentialPct),
        optimizablePct: Math.round(essentiality.optimizablePct),
        discretionaryPct: Math.round(essentiality.discretionaryPct),
      },
      topCategories: categories.slice(0, 8).map((c) => ({
        name: c.categoryName,
        amount: c.amount,
        pct: Math.round(c.percentage * 10) / 10,
        transactions: c.transactionCount,
      })),
      topMerchants: [...merchants.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, amount]) => ({ name, amount })),
      budgetsThisPeriod: today
        ? budgets.map((b) => {
            const spent = calculateBudgetSpent(transactions, b, today);
            return {
              name: b.category_id ? categoryList.find((c) => c.id === b.category_id)?.name ?? 'Category' : 'Overall',
              period: b.period_type,
              limit: Number(b.amount),
              spent,
              usedPct: Math.round((spent / Number(b.amount)) * 100),
            };
          })
        : [],
      ifYouTrim: {
        optimizablePct: optTrimPct,
        discretionaryPct: discTrimPct,
        saving: potential.monthlyPotentialSavings,
      },
    };
  }, [scoped, scope, summary, essentiality, categories, budgets, categoryList, transactions, today, optTrimPct, discTrimPct, potential]);

  /** Grounded fallback when the AI service can't be reached. */
  const fallbackAnswer = (q: string): string => {
    const lower = q.toLowerCase();
    if (lower.includes('food') || lower.includes('dining')) {
      const food = categories.find((c) => c.categoryName.toLowerCase().includes('food'));
      return `Food & dining: ${formatCurrency(food?.amount ?? 0)} (${SCOPE_LABEL[scope].toLowerCase()}).`;
    }
    const top = categories.slice(0, 3).map((c) => `${c.categoryName} ${formatCurrency(c.amount)}`).join(', ');
    return `${SCOPE_LABEL[scope]}: you spent ${formatCurrency(summary.totalExpenses)} and kept ${formatCurrency(
      summary.actualSavings
    )}. Biggest categories: ${top || 'none yet'}. Trimming the sliders' amounts would free up ${formatCurrency(
      potential.monthlyPotentialSavings
    )}.`;
  };

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || streaming) return;
    const history = messages.filter((m) => !m.pending).map(({ role, content }) => ({ role, content }));
    const replyId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: q },
      { id: replyId, role: 'assistant', content: '', pending: true },
    ]);
    setQuestion('');
    setStreaming(true);

    const update = (content: string, pending = true) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content, pending } : m)));

    try {
      const res = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history: history.slice(-8),
          language: user?.language === 'hinglish' ? 'hinglish' : 'en',
          context: coachContext,
        }),
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || 'The coach is unavailable right now.');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        update(cleanReply(text));
      }
      update(cleanReply(text).trim() || "I couldn't come up with an answer. Try asking another way.", false);
    } catch (err) {
      update(fallbackAnswer(q), false);
      toast.message('Showing a basic answer', {
        description: err instanceof Error ? err.message : 'The AI coach is unavailable right now.',
      });
    } finally {
      setStreaming(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[560px] lg:col-span-2" />
          <Skeleton className="h-[560px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI coach"
        description="Ask about your spending. Answers only use your own numbers, worked out by the app."
        actions={
          <Segmented
            size="sm"
            value={scope}
            onChange={setScope}
            options={(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
          />
        }
      />

      {transactions.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="Nothing to coach on yet"
          description="Add a few expenses and the coach will have something to work with."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Chat */}
          <Card className="flex h-[600px] flex-col overflow-hidden lg:col-span-2 animate-rise">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4" /> Money coach
                <span className="text-xs font-normal text-muted-foreground">· Workers AI</span>
              </div>
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={streaming}>
                  <RotateCcw /> New chat
                </Button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">What do you want to know?</p>
                    <p className="text-[13px] text-muted-foreground">
                      {SCOPE_LABEL[scope]} · {scoped.length} transactions · {formatCurrency(summary.totalExpenses)} spent
                    </p>
                  </div>
                  <div className="flex max-w-md flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void ask(s)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={cn('flex animate-rise', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                        m.role === 'user'
                          ? 'rounded-br-md bg-foreground text-background'
                          : 'rounded-bl-md border border-border bg-muted/50 text-foreground'
                      )}
                    >
                      {m.content}
                      {m.pending && (
                        <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-foreground/60" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
              className="border-t border-border p-3"
            >
              <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3 py-1.5 focus-within:border-foreground/30 focus-within:ring-4 focus-within:ring-foreground/[0.05]">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about your spending…"
                  maxLength={500}
                  className="h-8 flex-1 bg-transparent text-sm placeholder:text-subtle focus:outline-none"
                  aria-label="Ask the coach"
                />
                <Button type="submit" size="icon-sm" disabled={!question.trim() || streaming} aria-label="Send">
                  <ArrowUp />
                </Button>
              </div>
            </form>
          </Card>

          {/* Side panel */}
          <div className="space-y-4">
            <Card className="animate-rise" style={{ animationDelay: '60ms' }}>
              <CardHeader>
                <CardTitle>{SCOPE_LABEL[scope]} at a glance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Spent</dt>
                    <dd className="tabular text-lg font-semibold tracking-tight">{formatCurrency(summary.totalExpenses)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Kept</dt>
                    <dd className={cn('tabular text-lg font-semibold tracking-tight', summary.actualSavings < 0 && 'text-destructive')}>
                      {formatCurrency(summary.actualSavings)}
                    </dd>
                  </div>
                </dl>
                <div className="space-y-2">
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    <div style={{ width: `${essentiality.essentialPct}%`, background: 'var(--chart-1)' }} />
                    <div style={{ width: `${essentiality.optimizablePct}%`, background: 'var(--chart-2)' }} />
                    <div style={{ width: `${essentiality.discretionaryPct}%`, background: 'var(--chart-4)' }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Essential {Math.round(essentiality.essentialPct)}%</span>
                    <span>Trim {Math.round(essentiality.optimizablePct)}%</span>
                    <span>Optional {Math.round(essentiality.discretionaryPct)}%</span>
                  </div>
                </div>
                {categories[0] && (
                  <p className="text-[13px] text-muted-foreground">
                    Biggest category: <span className="text-foreground">{categories[0].categoryName}</span>,{' '}
                    <span className="tabular">{formatCurrency(categories[0].amount)}</span> ({categories[0].percentage.toFixed(0)}%).
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="animate-rise" style={{ animationDelay: '120ms' }}>
              <CardHeader>
                <CardTitle>What if you trimmed?</CardTitle>
                <CardDescription>Move the sliders to see what you&apos;d keep.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  { label: 'Could-trim spending', base: essentiality.optimizable, value: optTrimPct, set: setOptTrimPct },
                  { label: 'Optional spending', base: essentiality.discretionary, value: discTrimPct, set: setDiscTrimPct },
                ].map((s) => (
                  <div key={s.label} className="space-y-2">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span>{s.label}</span>
                      <span className="tabular text-muted-foreground">
                        −{s.value}% of {formatCurrency(s.base)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={s.value}
                      onChange={(e) => s.set(Number(e.target.value))}
                      className="w-full"
                      style={{ accentColor: 'var(--foreground)' }}
                      aria-label={`${s.label} reduction`}
                    />
                  </div>
                ))}
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">You&apos;d keep</div>
                  <div className="tabular text-2xl font-semibold tracking-tight">
                    {formatCurrency(potential.monthlyPotentialSavings)}
                  </div>
                  {scope === 'this_month' && (
                    <div className="text-xs text-muted-foreground">
                      ≈ <span className="tabular">{formatCurrency(potential.annualPotentialSavings)}</span> a year
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
