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
import { cn } from '@/lib/utils';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Mic,
    title: 'Note an expense in one sentence',
    body: 'Type or say "paid 850 for groceries at DMart". Amount, merchant and category are filled in for you. Hinglish works too.',
  },
  {
    icon: Scale,
    title: 'Essential vs optional',
    body: 'Every expense is marked essential, optimizable or discretionary, so you can see which spending you could actually change.',
  },
  {
    icon: Bell,
    title: 'Budgets that warn you early',
    body: 'Set a monthly or per-category budget. You get a heads-up at 75%, 90% and 100%, before the month gets away from you.',
  },
  {
    icon: MessageSquare,
    title: 'A money coach that knows your numbers',
    body: 'Ask where your money went or how to save more. Answers come from your own transactions, powered by Cloudflare Workers AI.',
  },
  {
    icon: Target,
    title: 'Savings goals',
    body: 'Pick a target and a date. See how much to set aside each month and how far along you are.',
  },
  {
    icon: TrendingUp,
    title: 'Wealth simulator',
    body: 'See what the money you stop spending on optional things could grow into over 5, 10 or 20 years.',
  },
];

const STEPS = [
  {
    title: 'Add expenses as they happen',
    body: 'One line of text or a quick voice note. It takes a few seconds.',
  },
  {
    title: 'Review your month',
    body: 'See totals by category, essential vs optional, and how each budget is tracking.',
  },
  {
    title: 'Adjust and save',
    body: 'Trim what you do not need, set a goal, and watch the savings add up.',
  },
];

// Daily spend for the preview chart: [essential, optional] as % of the tallest day.
const BARS: [number, number][] = [
  [38, 12], [30, 22], [52, 8], [24, 30], [44, 16], [62, 20], [28, 10],
  [40, 26], [34, 14], [56, 18], [26, 34], [48, 12], [36, 22], [58, 28],
];

const TRANSACTIONS: { name: string; meta: string; amount: string; kind: 'essential' | 'optimizable' | 'discretionary' }[] = [
  { name: 'Groceries', meta: 'DMart · Today', amount: '₹1,240', kind: 'essential' },
  { name: 'Dinner order', meta: 'Swiggy · Yesterday', amount: '₹480', kind: 'discretionary' },
  { name: 'Metro card', meta: 'Transport · Oct 28', amount: '₹500', kind: 'essential' },
  { name: 'Mobile plan', meta: 'Jio · Oct 27', amount: '₹749', kind: 'optimizable' },
];

const KIND_LABEL = { essential: 'Essential', optimizable: 'Optimizable', discretionary: 'Optional' } as const;

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
              className="hidden rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Features
            </a>
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: 'sm' }), 'ml-1')}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-24 sm:pb-16">
          <div className="animate-rise mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">
            <span className="size-1.5 rounded-full bg-foreground" />
            Personal finance, without the spreadsheet
          </div>
          <h1
            className="animate-rise mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tighter text-balance sm:text-5xl lg:text-6xl"
            style={{ animationDelay: '60ms' }}
          >
            Know where your money goes every month.
          </h1>
          <p
            className="animate-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            SpendWise turns everyday expenses into a clear picture of what was essential, what was optional, and what
            you could save.
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
          <p className="mt-4 text-xs text-subtle">The demo runs in your browser with sample data. No sign-up needed.</p>
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
              <p className="text-[13px] font-medium text-muted-foreground">Features</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Everything you need to understand your spending.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Quick to log, easy to read, and honest about where the money went.
              </p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-card p-6 transition-colors hover:bg-accent/40 sm:p-7">
                  <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                    <Icon className="size-4" />
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
              <p className="text-[13px] font-medium text-muted-foreground">How it works</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Three steps, a few minutes a week.
              </h2>
            </div>
            <ol className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="border-t border-border pt-5">
                  <span className="font-mono text-xs text-subtle tabular">0{i + 1}</span>
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
                  Add a few expenses and see where your money goes. It is free to use.
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
            <span className="text-[13px] text-subtle">· Personal finance, made clear</span>
          </div>
          <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <a href="#features" className="rounded-md px-2 py-1 transition-colors hover:text-foreground">
              Features
            </a>
            <Link href="/login" className="rounded-md px-2 py-1 transition-colors hover:text-foreground">
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
          { label: 'Spent this month', value: '₹42,380', hint: '−8% vs September' },
          { label: 'Budget left', value: '₹7,620', hint: '85% used' },
          { label: 'Optional spend', value: '₹9,140', hint: '22% of total' },
          { label: 'Saved', value: '18%', hint: 'of income' },
        ].map((k, i) => (
          <div
            key={k.label}
            className={cn('p-4 sm:p-5', i < 2 && 'border-b border-border sm:border-b-0', i % 2 === 0 && 'border-r border-border sm:border-r-0')}
          >
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight tabular sm:text-2xl">{k.value}</p>
            <p className="mt-1 text-xs text-subtle tabular">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-5">
        {/* Chart */}
        <div className="border-b border-border p-4 sm:p-5 md:col-span-3 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Daily spending</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-chart-1" />
                Essential
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-chart-3" />
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
              {BARS.map(([ess, opt], i) => (
                <div key={i} className="flex h-full flex-1 flex-col justify-end">
                  <div className="rounded-t-[3px] bg-chart-3" style={{ height: `${opt}%` }} />
                  <div className="bg-chart-1" style={{ height: `${ess}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-subtle tabular">
            <span>Oct 18</span>
            <span>Oct 31</span>
          </div>
        </div>

        {/* Transactions */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
            <p className="text-sm font-medium">Recent</p>
            <span className="text-xs text-muted-foreground">View all</span>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {TRANSACTIONS.map((t) => (
              <li key={t.name} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.meta}</p>
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
