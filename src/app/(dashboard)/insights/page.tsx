'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Sparkles, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { Section } from '@/components/ui/section';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/layout/session-provider';
import { DataService } from '@/lib/data-service';
import { chatKey, clearChat, loadChat, saveChat } from '@/lib/chat-memory';
import { mainGoalLabels } from '@/lib/main-goals';
import { userTypeLabel } from '@/lib/user-types';
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
import { formatCurrency } from '@/lib/utils';
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
  const memoryKey = chatKey('coach', user?.id);
  const [restored, setRestored] = useState(false);

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
        // Earlier conversation with the coach, if any.
        setMessages((loadChat<Message[]>(memoryKey) ?? []).filter((m) => !m.pending));
        setRestored(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load your spending data');
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [memoryKey]);

  useEffect(() => {
    if (restored) saveChat(memoryKey, messages.filter((m) => !m.pending).slice(-60));
  }, [messages, restored, memoryKey]);

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
      userType: user?.user_type ?? null,
      userTypeDescription: userTypeLabel(user?.user_type),
      userGoals: mainGoalLabels(user?.main_goals),
      monthlyIncome: user?.monthly_income ?? null,
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
  }, [scoped, scope, summary, essentiality, categories, budgets, categoryList, transactions, today, optTrimPct, discTrimPct, potential, user]);

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
          history: history.slice(-12),
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
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <Skeleton className="h-[600px] rounded-2xl" />
          <div className="space-y-6">
            <Skeleton className="h-28" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  const types = [
    { label: 'Essential', pct: essentiality.essentialPct, value: essentiality.essential, color: 'var(--essential)' },
    { label: 'Could trim', pct: essentiality.optimizablePct, value: essentiality.optimizable, color: 'var(--trim)' },
    { label: 'Optional', pct: essentiality.discretionaryPct, value: essentiality.discretionary, color: 'var(--optional)' },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Ask for advice"
        description="Ask anything about your money in your own words. Answers use only your own numbers."
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
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          {/* Chat */}
          <Card className="flex h-[620px] flex-col overflow-hidden animate-rise">
            <div className="flex h-12 items-center justify-between border-b border-border pl-5 pr-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="size-1.5 rounded-full bg-brand" />
                Money coach
                <span className="text-xs font-normal text-subtle">{SCOPE_LABEL[scope]}</span>
              </div>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearChat(memoryKey);
                    setMessages([]);
                  }}
                  disabled={streaming}
                >
                  <RotateCcw /> New chat
                </Button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-6">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col justify-end gap-6">
                  <div className="space-y-1.5">
                    <p className="font-display text-[28px] leading-[1.05] tracking-[-0.01em]">What do you want to know?</p>
                    <p className="text-[13px] text-muted-foreground">
                      {SCOPE_LABEL[scope]} · {scoped.length} {scoped.length === 1 ? 'transaction' : 'transactions'} ·{' '}
                      <Money amount={summary.totalExpenses} size="sm" decimals={false} tone="muted" className="text-[13px]" /> spent
                    </p>
                  </div>
                  <ul className="-mx-2 divide-y divide-border/70 border-t border-border/70">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => void ask(s)}
                          className="group flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.025] hover:text-foreground"
                        >
                          {s}
                          <ArrowUp className="size-3.5 shrink-0 rotate-45 text-subtle transition-colors group-hover:text-brand" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-end animate-rise">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-3 animate-rise">
                      <Sparkles className="mt-[3px] size-3.5 shrink-0 text-brand" aria-hidden />
                      <div className="min-w-0 max-w-[92%] whitespace-pre-wrap text-sm leading-[1.7] text-foreground">
                        {m.content}
                        {m.pending && (
                          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-brand/70" />
                        )}
                      </div>
                    </div>
                  )
                )
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
              className="p-3"
            >
              <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3 py-1.5 shadow-card transition-[border-color,box-shadow] focus-within:border-foreground/30 focus-within:ring-4 focus-within:ring-foreground/[0.05]">
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

          {/* Side */}
          <div className="space-y-10">
            <div className="animate-rise" style={{ animationDelay: '60ms' }}>
              <Section title={`${SCOPE_LABEL[scope]} at a glance`}>
                <div className="border-y border-border py-4">
                  <MetricStrip className="sm:grid-cols-2">
                    <Metric label="Spent" value={<Money amount={summary.totalExpenses} size="lg" decimals={false} />} />
                    <Metric
                      label="Kept"
                      value={
                        <Money
                          amount={summary.actualSavings}
                          size="lg"
                          decimals={false}
                          tone={summary.actualSavings < 0 ? 'danger' : 'default'}
                        />
                      }
                      hint={
                        summary.totalIncome > 0
                          ? `${Math.round((summary.actualSavings / summary.totalIncome) * 100)}% of what came in`
                          : undefined
                      }
                    />
                  </MetricStrip>
                </div>
                <div className="space-y-3">
                  <div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.05]">
                    {types.map((t) => (
                      <span key={t.label} style={{ width: `${t.pct}%`, background: t.color }} />
                    ))}
                  </div>
                  <dl className="space-y-2">
                    {types.map((t) => (
                      <div key={t.label} className="flex items-center justify-between gap-3 text-[13px]">
                        <dt className="flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ background: t.color }} />
                          {t.label}
                          <span className="text-xs text-subtle">{Math.round(t.pct)}%</span>
                        </dt>
                        <dd>
                          <Money amount={t.value} size="sm" decimals={false} className="text-[13px]" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {categories[0] && (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Biggest category: <span className="text-foreground">{categories[0].categoryName}</span>,{' '}
                    <Money amount={categories[0].amount} size="sm" decimals={false} className="text-[13px]" /> (
                    {categories[0].percentage.toFixed(0)}%).
                  </p>
                )}
              </Section>
            </div>

            <div className="animate-rise" style={{ animationDelay: '120ms' }}>
              <Section divided title="What if you trimmed?" description="Move the sliders to see what you’d keep.">
                <div className="space-y-5">
                  {[
                    { label: 'Could-trim spending', base: essentiality.optimizable, value: optTrimPct, set: setOptTrimPct },
                    { label: 'Optional spending', base: essentiality.discretionary, value: discTrimPct, set: setDiscTrimPct },
                  ].map((sl) => (
                    <div key={sl.label} className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span>{sl.label}</span>
                        <span className="tabular text-muted-foreground">
                          −{sl.value}% of <Money amount={sl.base} size="sm" decimals={false} tone="muted" className="text-[13px]" />
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={sl.value}
                        onChange={(e) => sl.set(Number(e.target.value))}
                        className="w-full"
                        style={{ accentColor: 'var(--brand)' }}
                        aria-label={`${sl.label} reduction`}
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 border-t border-border pt-4">
                  <div className="text-[13px] text-muted-foreground">You&apos;d keep</div>
                  <Money amount={potential.monthlyPotentialSavings} size="xl" tone="brand" />
                  {scope === 'this_month' && (
                    <div className="text-xs text-muted-foreground">
                      about <Money amount={potential.annualPotentialSavings} size="sm" decimals={false} tone="muted" className="text-xs" /> a year
                    </div>
                  )}
                </div>
              </Section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
