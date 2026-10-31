'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  Mic,
  MessageSquare,
  Scale,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { enterSandbox } from '@/lib/auth-client';
import { PURCHASE_KINDS, type PurchaseKind } from '@/lib/categories/kinds';
import { cn } from '@/lib/utils';

// Each feature gets a small tinted icon tile; the colour hints at what it is about.
const FEATURES: { icon: LucideIcon; title: string; body: string; tone: string }[] = [
  {
    icon: Mic,
    title: 'Add an expense in a few words',
    body: 'Type or say "850 for groceries at DMart". We fill in the amount, shop and category for you. Hinglish works too.',
    tone: 'bg-primary/10 text-primary',
  },
  {
    icon: Scale,
    title: 'See what you really needed',
    body: 'Each expense is sorted as essential, could trim or optional, so you can spot where there is room to save.',
    tone: 'bg-essential/12 text-essential',
  },
  {
    icon: Bell,
    title: 'A friendly nudge before you overspend',
    body: 'Set a limit for the month, or for one thing like eating out. We let you know when you are getting close.',
    tone: 'bg-warning/14 text-warning',
  },
  {
    icon: MessageSquare,
    title: 'Ask questions in plain words',
    body: 'Ask "where did my money go?" or "how can I save more?" and get answers based on your own spending.',
    tone: 'bg-info/12 text-info',
  },
  {
    icon: Target,
    title: 'Save for the things you want',
    body: 'Pick something to save for and a date. We show how much to put aside each month and how close you are.',
    tone: 'bg-success/12 text-success',
  },
  {
    icon: TrendingUp,
    title: 'Plan for later',
    body: 'See how a small amount saved every month could grow over 5, 10 or 20 years.',
    tone: 'bg-primary/10 text-primary',
  },
];

const STEPS = [
  {
    title: 'Add what you spend',
    body: 'Type a short line or say it out loud. It takes a few seconds.',
  },
  {
    title: 'Look at your month',
    body: 'See where your money went, what you needed, and how your budgets are doing.',
  },
  {
    title: 'Make small changes',
    body: 'Cut back where it is easy, set a goal, and watch your savings grow.',
  },
];

// Daily spend for the preview chart: [essential, could trim, optional] as % of the tallest day.
const BARS: [number, number, number][] = [
  [38, 8, 12], [30, 6, 22], [52, 10, 8], [24, 12, 30], [44, 4, 16], [62, 8, 20], [28, 14, 10],
  [40, 6, 26], [34, 10, 14], [56, 4, 18], [26, 8, 34], [48, 12, 12], [36, 6, 22], [58, 10, 28],
];

const TRANSACTIONS: {
  name: string;
  meta: string;
  amount: string;
  kind: 'essential' | 'optimizable' | 'discretionary';
  purchase: PurchaseKind;
}[] = [
  { name: 'Groceries', meta: 'DMart · Today', amount: '₹1,240', kind: 'essential', purchase: 'groceries' },
  { name: 'Dinner order', meta: 'Swiggy · Yesterday', amount: '₹480', kind: 'discretionary', purchase: 'food' },
  { name: 'Metro card', meta: 'Transport · Oct 28', amount: '₹500', kind: 'essential', purchase: 'transport' },
  { name: 'Mobile plan', meta: 'Jio · Oct 27', amount: '₹749', kind: 'optimizable', purchase: 'subscriptions' },
];

const KIND_LABEL = { essential: 'Essential', optimizable: 'Could trim', discretionary: 'Optional' } as const;

function tryDemo() {
  enterSandbox();
  // Full page load so the session provider re-reads the sandbox cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/dashboard';
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">SpendWise</span>
          </Link>
          <nav className="flex items-center gap-1">
            <a
              href="#features"
              className="hidden h-9 items-center rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Features
            </a>
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link href="/login" className={cn(buttonVariants(), 'ml-1')}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-24 sm:pb-16">
          <div className="animate-rise mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">
            <span className="size-1.5 rounded-full bg-primary" />
            Simple money tracking for everyday life
          </div>
          <h1
            className="animate-rise mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tighter text-balance sm:text-5xl lg:text-6xl"
            style={{ animationDelay: '60ms' }}
          >
            Know where your money goes each month.
          </h1>
          <p
            className="animate-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            Write down what you spend in a few words. SpendWise sorts it for you and shows what you needed, what you
            could cut back on, and how much you are saving.
          </p>
          <div
            className="animate-rise mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
            style={{ animationDelay: '180ms' }}
          >
            <Link href="/login" className={buttonVariants({ size: 'lg' })}>
              Get started
              <ArrowRight />
            </Link>
            <button type="button" onClick={tryDemo} className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Try the demo
            </button>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            The demo uses sample data and stays in your browser. No sign-up needed.
          </p>
        </section>

        {/* Product preview */}
        <section className="relative px-4 pb-20 sm:px-6 sm:pb-28">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-x-0 -top-8 bottom-0 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]"
          />
          <div
            className="animate-rise relative mx-auto max-w-5xl overflow-hidden rounded-xl border border-border bg-card shadow-pop"
            style={{ animationDelay: '240ms' }}
          >
            <ProductPreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-[13px] font-medium text-primary">What you get</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Simple tools to help you spend wisely.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                No spreadsheets and no money jargon. Just a clear picture of your month.
              </p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body, tone }) => (
                <div key={title} className="bg-card p-6 transition-colors hover:bg-accent/40 sm:p-7">
                  <div className={cn('flex size-9 items-center justify-center rounded-lg', tone)}>
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-[15px] font-medium tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-[13px] font-medium text-primary">How it works</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Three easy steps, a few minutes a week.
              </h2>
            </div>
            <ol className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="border-t border-border pt-5">
                  <span className="tabular flex size-7 items-center justify-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-[15px] font-medium tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-card sm:px-12">
              <div
                aria-hidden
                className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
              />
              <div className="relative">
                <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  Start with this month.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
                  Add a few expenses and see where your money goes. It is free.
                </p>
                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <Link href="/login" className={buttonVariants({ size: 'lg' })}>
                    Get started
                    <ArrowRight />
                  </Link>
                  <button type="button" onClick={tryDemo} className={buttonVariants({ size: 'lg', variant: 'outline' })}>
                    Try the demo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="size-5 rounded-md" />
            <span className="text-[13px] font-medium">SpendWise</span>
            <span className="text-[13px] text-muted-foreground">· Money tracking, made simple</span>
          </div>
          <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <a href="#features" className="inline-flex h-9 items-center rounded-md px-2 transition-colors hover:text-foreground">
              Features
            </a>
            <Link href="/login" className="inline-flex h-9 items-center rounded-md px-2 transition-colors hover:text-foreground">
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Static mock of the dashboard, built from plain divs. */
function ProductPreview() {
  return (
    <div aria-hidden className="select-none text-left">
      {/* Window bar */}
      <div className="flex h-10 items-center gap-3 border-b border-border px-4">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-chart-4" />
          <span className="size-2.5 rounded-full bg-chart-4" />
          <span className="size-2.5 rounded-full bg-chart-4" />
        </div>
        <span className="text-xs text-muted-foreground">Overview · October</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 divide-border border-b border-border sm:grid-cols-4 sm:divide-x">
        {[
          { label: 'Spent this month', value: '₹42,380', hint: '8% less than September', tone: 'text-success' },
          { label: 'Left this month', value: '₹7,620', hint: '85% of budget used', tone: 'text-warning' },
          { label: 'Optional', value: '₹9,140', hint: '22% of spending', tone: 'text-muted-foreground' },
          { label: 'Saved', value: '18%', hint: 'of money in', tone: 'text-muted-foreground' },
        ].map((k, i) => (
          <div
            key={k.label}
            className={cn('p-4 sm:p-5', i < 2 && 'border-b border-border sm:border-b-0', i % 2 === 0 && 'border-r border-border sm:border-r-0')}
          >
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight tabular sm:text-2xl">{k.value}</p>
            <p className={cn('mt-1 text-xs tabular', k.tone)}>{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-5">
        {/* Chart */}
        <div className="border-b border-border p-4 sm:p-5 md:col-span-3 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Spending each day</p>
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-essential" />
                Essential
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-trim" />
                Could trim
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-optional" />
                Optional
              </span>
            </div>
          </div>
          <div className="relative mt-6 h-40">
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-dashed border-border" />
              ))}
            </div>
            <div className="relative flex h-full items-end gap-1.5 sm:gap-2">
              {BARS.map(([ess, trim, opt], i) => (
                <div key={i} className="flex h-full flex-1 flex-col justify-end gap-px">
                  <div className="rounded-t-[3px] bg-optional" style={{ height: `${opt}%` }} />
                  <div className="bg-trim" style={{ height: `${trim}%` }} />
                  <div className="bg-essential" style={{ height: `${ess}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground tabular">
            <span>Oct 18</span>
            <span>Oct 31</span>
          </div>
        </div>

        {/* Transactions */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
            <p className="text-sm font-medium">Latest</p>
            <span className="text-xs font-medium text-primary">See all</span>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {TRANSACTIONS.map((t) => (
              <li key={t.name} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: PURCHASE_KINDS[t.purchase].color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.meta}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[13px] font-medium tabular">{t.amount}</span>
                  <Badge variant={t.kind}>{KIND_LABEL[t.kind]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
