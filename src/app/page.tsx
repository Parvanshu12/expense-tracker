import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  TrendingUp,
  BrainCircuit,
  Wallet,
  Receipt,
  PieChart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">
            SpendWise <span className="text-indigo-600 text-xs px-1.5 py-0.5 rounded-sm bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800">AI</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-xs font-semibold">
              Sign In
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="ai" size="sm" className="text-xs font-semibold gap-1.5">
              <span>Open Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 md:py-24 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI-Powered Personal Finance & Expense Intelligence</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-white max-w-3xl mx-auto leading-tight">
          Understand Your Spending.{' '}
          <span className="text-indigo-600 bg-clip-text">Make Smarter Money Decisions.</span>
        </h1>

        <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Go beyond ordinary expense tracking. Capture expenses naturally with voice or text, separate essential from optimizable leaks, get personalized AI financial coaching, and simulate 20-year wealth growth.
        </p>

        {/* Hero CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button variant="ai" size="lg" className="w-full sm:w-auto gap-2 font-semibold shadow-md">
              <span>Launch Financial Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/signup" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto text-xs font-semibold">
              Create Free Account
            </Button>
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 text-left">
          <Card className="p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Smart Natural & Voice Entry
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Say &ldquo;Paid 850 for groceries&rdquo; or write naturally. AI extracts vendor, amount, category, and essentiality with zero manual friction.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Conversational Money Coach
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ask direct questions like &ldquo;Where did most of my money go?&rdquo; and receive deterministic, respectful spending audits grounded in your actual data.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-950 text-violet-600 flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              20-Year Wealth Simulator
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Transform identified discretionary savings into educational long-term compound wealth trajectories with inflation adjustments.
            </p>
          </Card>
        </div>

        {/* Trust & Row Level Security Banner */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 text-left">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                Strict Row Level Security (RLS)
              </div>
              <div className="text-slate-500 text-xs">
                Your financial records are strictly isolated. Nobody else can see or query your transactions.
              </div>
            </div>
          </div>
          <div className="text-slate-400 font-medium">
            Supabase PostgreSQL • Next.js App Router • INR Default
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-400">
        <p>© 2026 SpendWise AI. Understand Your Spending. Make Smarter Money Decisions.</p>
      </footer>
    </div>
  );
}
