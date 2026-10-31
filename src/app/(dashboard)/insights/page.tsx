'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  TrendingDown,
  TrendingUp,
  BrainCircuit,
  MessageSquare,
  Send,
  Zap,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataService } from '@/lib/data-service';
import { Transaction } from '@/types/database';
import {
  calculateFinancialSummary,
  calculateCategoryBreakdown,
  calculateEssentialityBreakdown,
  calculatePotentialSavings,
} from '@/lib/calculations/finance';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export default function InsightsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your SpendWise AI Money Coach. I have analyzed your transactions. You can ask me questions like: "Where did most of my money go?", "How much did I spend on food?", or "Where can I save this month?"',
      timestamp: 'Today',
    },
  ]);
  const [userInput, setUserInput] = useState('');
  const [coachThinking, setCoachThinking] = useState(false);
  const [optTrimPct, setOptTrimPct] = useState<number>(20);
  const [discTrimPct, setDiscTrimPct] = useState<number>(30);

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const txs = await DataService.getTransactions();
        setTransactions(txs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const summary = useMemo(() => calculateFinancialSummary(transactions), [transactions]);
  const categories = useMemo(() => calculateCategoryBreakdown(transactions, 'expense'), [transactions]);
  const essentiality = useMemo(() => calculateEssentialityBreakdown(transactions), [transactions]);
  const potentialSavings = useMemo(
    () => calculatePotentialSavings(essentiality.optimizable, essentiality.discretionary, optTrimPct, discTrimPct),
    [essentiality, optTrimPct, discTrimPct]
  );

  // Generate deterministic insights cards
  const observationCards = useMemo(() => {
    const list = [];
    if (categories.length > 0) {
      const topCat = categories[0];
      list.push({
        title: `Dominant Spending: ${topCat.categoryName}`,
        description: `${topCat.categoryName} represents ${topCat.percentage.toFixed(0)}% of your recorded expenses (${formatCurrency(topCat.amount)} across ${topCat.transactionCount} transactions).`,
        type: 'primary',
      });
    }

    if (essentiality.optimizable > 0) {
      list.push({
        title: 'Optimizable Expenses Identified',
        description: `You have ${formatCurrency(essentiality.optimizable)} (${essentiality.optimizablePct.toFixed(0)}%) in optimizable expenses (e.g. food delivery, frequent rides). A 20% trim could save ${formatCurrency((essentiality.optimizable * 0.2))} monthly.`,
        type: 'opportunity',
      });
    }

    if (essentiality.discretionary > 0) {
      list.push({
        title: 'Discretionary Leisure Cushion',
        description: `${formatCurrency(essentiality.discretionary)} was allocated to discretionary leisure activities this period.`,
        type: 'neutral',
      });
    }

    if (summary.actualSavings > 0) {
      list.push({
        title: 'Positive Cashflow Retained',
        description: `You maintained a positive savings margin of ${formatCurrency(summary.actualSavings)} after all recorded expenses.`,
        type: 'success',
      });
    }

    return list;
  }, [categories, essentiality, summary]);

  // Answer conversational questions deterministically based on real financial data
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const query = userInput.trim();
    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setUserInput('');
    setCoachThinking(true);

    setTimeout(() => {
      let reply = '';
      const q = query.toLowerCase();

      if (q.includes('where') && (q.includes('money go') || q.includes('spending'))) {
        const top3 = categories.slice(0, 3).map((c) => `${c.categoryName} (${formatCurrency(c.amount)}, ${c.percentage.toFixed(0)}%)`).join(', ');
        reply = `Based on your recorded ledger, your total expenses are ${formatCurrency(summary.totalExpenses)}. Your top expense categories are: ${top3}. Essential spending takes up ${essentiality.essentialPct.toFixed(0)}% of your expenses.`;
      } else if (q.includes('food') || q.includes('dining')) {
        const foodCat = categories.find((c) => c.categoryName.toLowerCase().includes('food'));
        const amt = foodCat ? formatCurrency(foodCat.amount) : '₹0';
        reply = `You spent ${amt} on Food & Dining across your recorded transactions. If you trim food delivery orders by 20%, you could retain approximately ${formatCurrency((foodCat?.amount || 0) * 0.2)} per month.`;
      } else if (q.includes('save') || q.includes('potential')) {
        reply = `Your current actual savings are ${formatCurrency(summary.actualSavings)}. In potential savings, if you reduce optimizable expenses by 20% and discretionary spending by 30%, you could potentially save an extra ${formatCurrency(potentialSavings.monthlyPotentialSavings)} monthly, which equals ${formatCurrency(potentialSavings.annualPotentialSavings)} annually!`;
      } else if (q.includes('income') || q.includes('salary')) {
        reply = `Your total recorded income is ${formatCurrency(summary.totalIncome)}. After your recorded expenses of ${formatCurrency(summary.totalExpenses)}, your remaining net cashflow is ${formatCurrency(summary.remainingBalance)}.`;
      } else {
        reply = `Here is your current financial snapshot: Total Income: ${formatCurrency(summary.totalIncome)}, Total Expenses: ${formatCurrency(summary.totalExpenses)}, Net Savings: ${formatCurrency(summary.actualSavings)}. Your largest spending category is ${categories[0]?.categoryName || 'None'}. How else can I assist your financial planning?`;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: 'assistant-' + Date.now(),
          sender: 'assistant',
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setCoachThinking(false);
    }, 600);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Observation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {observationCards.map((obs, idx) => (
          <Card key={idx} className="p-4 space-y-2 border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {obs.title}
                </h4>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {obs.description}
              </p>
            </div>
            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider pt-2">
              Audited by AI Engine
            </div>
          </Card>
        ))}
      </div>

      {/* Main Row: Conversational AI Coach + Potential Savings Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat / AI Coach Interface */}
        <Card className="lg:col-span-2 flex flex-col h-[520px]">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Conversational Money Coach</CardTitle>
                  <CardDescription className="text-xs">
                    Ask natural questions grounded in your authorized ledger
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs gap-1 text-emerald-600 border-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                Strict User Isolation
              </Badge>
            </div>
          </CardHeader>

          {/* Messages Scroll Area */}
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs leading-relaxed ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'assistant' && (
                  <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={`p-3.5 rounded-2xl max-w-md ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-xs'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 rounded-bl-xs'
                  }`}
                >
                  <p>{msg.text}</p>
                  <span
                    className={`block text-[10px] mt-1 text-right ${
                      msg.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}
            {coachThinking && (
              <div className="flex gap-2 items-center text-xs text-slate-400 italic">
                <Sparkles className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                <span>SpendWise AI is calculating answers...</span>
              </div>
            )}
          </CardContent>

          {/* Chat Input & Clickable Quick Queries */}
          <CardFooter className="border-t border-slate-100 dark:border-slate-800 p-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5 w-full">
              {[
                'Where did most of my money go?',
                'How much did I spend on food?',
                'How much could I save this month?',
                'Show my net cashflow balance',
              ].map((query) => (
                <button
                  key={query}
                  type="button"
                  onClick={() => {
                    setUserInput(query);
                  }}
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-[11px] transition-colors"
                >
                  {query}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2 w-full">
              <Input
                type="text"
                placeholder="Ask e.g. 'Where did most of my money go?' or 'How much was spent on food?'"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="text-xs"
              />
              <Button type="submit" variant="ai" size="sm" className="px-4 gap-1.5 shrink-0">
                <Send className="h-3.5 w-3.5" />
                <span>Ask</span>
              </Button>
            </form>
          </CardFooter>
        </Card>

        {/* Potential Savings Calculator */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-base">Potential Savings Scenario</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Hypothetical projection based on reducing optional spending
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200">
                <div className="font-semibold mb-1">Actual vs. Potential Savings</div>
                <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                  Actual savings is money already retained ({formatCurrency(summary.actualSavings)}). Below is a hypothetical roadmap if you reduce optimizable costs.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Monthly Potential Savings:</span>
                  <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(potentialSavings.monthlyPotentialSavings)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Annual Potential Growth:</span>
                  <span className="font-bold text-base text-indigo-600 dark:text-indigo-400">
                    +{formatCurrency(potentialSavings.annualPotentialSavings)}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Trim Optimizable Spending:</span>
                    <span className="font-bold text-amber-600">{optTrimPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={optTrimPct}
                    onChange={(e) => setOptTrimPct(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-1.5"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Pool: {formatCurrency(essentiality.optimizable)}</span>
                    <span>Saves {formatCurrency((essentiality.optimizable * optTrimPct) / 100)}/mo</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Trim Discretionary Leisure:</span>
                    <span className="font-bold text-purple-600">{discTrimPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={discTrimPct}
                    onChange={(e) => setDiscTrimPct(parseInt(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer h-1.5"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Pool: {formatCurrency(essentiality.discretionary)}</span>
                    <span>Saves {formatCurrency((essentiality.discretionary * discTrimPct) / 100)}/mo</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </div>

          <CardFooter className="pt-0">
            <Link href="/wealth-simulator" className="w-full">
              <Button variant="outline" className="w-full gap-2 text-xs font-semibold">
                <span>Simulate in Wealth Projector</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
