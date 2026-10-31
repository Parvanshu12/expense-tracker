'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { enterSandbox } from '@/lib/auth-client';
import { PURCHASE_KINDS, type PurchaseKind } from '@/lib/categories/kinds';
import { cn } from '@/lib/utils';

const FEATURES: { title: string; body: string; example?: string }[] = [
  {
    title: 'Tell it like you would tell a friend',
    body: 'Type or say what you spent, in English or Hinglish. The amount, shop, category and day are filled in for you to check.',
    example: '“kal auto mein 120 diye”',
  },
  {
    title: 'Take a photo of the bill',
    body: 'Snap a receipt or a printed bill. SpendWise reads the total and the shop, and you save it in one tap.',
  },
  {
    title: 'Bring in your bank statement',
    body: 'Upload a statement and each line comes in sorted. Anything you already added is skipped, so nothing is counted twice.',
  },
  {
    title: 'A heads-up before you overspend',
    body: 'Set a limit for the month, or for one thing like eating out. You hear about it at 75%, at 90% and if you go over.',
  },
  {
    title: 'A coach that knows your situation',
    body: 'Student, salaried, freelancer or retired: advice fits your life, and every figure it quotes comes from your own spending.',
    example: '“Where did most of my money go?”',
  },
  {
    title: 'Your month, day by day',
    body: 'A timeline of every day: what you spent, where, and how it adds up across the weeks.',
  },
];

const STEPS = [
  { title: 'Add what you spend', body: 'A short line, a photo, or a statement. It takes a few seconds.' },
  { title: 'See what is left', body: 'Home shows what you can still spend this month, and about how much a day.' },
  { title: 'Adjust as you go', body: 'Trim where it is easy, set a goal, and ask the coach when something looks off.' },
];

/* ---------- Static data for the product shot ---------- */

const BUDGET = 42000;
const SPENT = 40335;
const DAYS_IN_MONTH = 31;
const TODAY = 29;
// Spending per day for the first 29 days of the month (shape only; scaled to SPENT below).
const DAILY = [
  820, 1450, 640, 2100, 980, 1310, 760, 1890, 1120, 540, 2380, 1260, 900, 1670, 1040, 720, 1980, 1150, 830, 1560, 1240,
  690, 2210, 1380, 1010, 1720, 880, 1490, 1555,
];

const W = 320;
const H = 120;
const sx = (day: number) => 2 + ((day - 1) / (DAYS_IN_MONTH - 1)) * (W - 4);
const sy = (v: number) => 6 + (1 - v / (BUDGET * 1.06)) * (H - 10);

const SPENT_POINTS: [number, number][] = (() => {
  const total = DAILY.reduce((a, b) => a + b, 0);
  let running = 0;
  return DAILY.map((d, i) => {
    running += (d / total) * SPENT;
    return [sx(i + 1), sy(running)];
  });
})();
const SPENT_LINE = SPENT_POINTS.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
const SPENT_AREA = `${SPENT_LINE} L${sx(TODAY).toFixed(1)} ${H - 4} L${sx(1).toFixed(1)} ${H - 4} Z`;
const LAST_POINT = SPENT_POINTS[SPENT_POINTS.length - 1];

const ROWS: { name: string; meta: string; amount: number; kind: PurchaseKind; income?: boolean }[] = [
  { name: 'Groceries', meta: 'DMart · Today', amount: 1240, kind: 'groceries' },
  { name: 'Dinner order', meta: 'Swiggy · Yesterday', amount: 480, kind: 'food' },
  { name: 'Salary', meta: 'Acme Labs · 27 Oct', amount: 68500, kind: 'income', income: true },
  { name: 'Metro card top-up', meta: 'Transport · 26 Oct', amount: 500, kind: 'transport' },
];

const NAV = ['Home', 'My spending', 'Timeline', 'Budgets', 'Savings goals', 'Ask for advice'];

function tryDemo() {
  enterSandbox();
  // Full page load so the session provider re-reads the sandbox cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/dashboard';
}

const container = 'mx-auto w-full max-w-[1120px] px-4 sm:px-8';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md">
        <div className={cn(container, 'flex h-16 items-center justify-between')}>
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">SpendWise</span>
          </Link>
          <nav className="flex items-center gap-1">
            <a
              href="#features"
              className="hidden h-9 items-center px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Features
            </a>
            <a
              href="#how"
              className="hidden h-9 items-center px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              How it works
            </a>
            <Link
              href="/login"
              className="inline-flex h-9 items-center px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
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
        <section className={cn(container, 'pt-14 pb-14 sm:pt-24 sm:pb-20')}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
            <h1 className="animate-rise font-display text-[46px] leading-[0.98] tracking-[-0.02em] text-balance sm:text-[60px] lg:text-[72px]">
              Know what&apos;s left to spend, every day of the month.
            </h1>
            <div className="animate-rise space-y-7 lg:pb-2" style={{ animationDelay: '80ms' }}>
              <p className="max-w-md text-[17px] leading-relaxed text-muted-foreground text-pretty">
                Tell SpendWise what you spent in a line, a photo or a bank statement. It keeps your month in order and
                tells you plainly how you are doing.
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href="/login" className={buttonVariants({ size: 'lg' })}>
                  Get started
                </Link>
                <button
                  type="button"
                  onClick={tryDemo}
                  className="group inline-flex h-11 items-center gap-1.5 text-[15px] font-medium text-foreground transition-colors hover:text-brand"
                >
                  Try the demo
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
              <p className="text-[13px] text-subtle">The demo uses sample data and stays in your browser. No sign-up.</p>
            </div>
          </div>
        </section>

        {/* Product shot */}
        <section className={cn(container, 'pb-20 sm:pb-28')}>
          <figure className="animate-rise" style={{ animationDelay: '160ms' }}>
            <div className="rounded-[20px] bg-foreground/[0.035] p-1.5 ring-1 ring-border sm:p-2">
              <ProductShot />
            </div>
            <figcaption className="mt-4 text-[13px] text-muted-foreground">
              Home on 29 October. The green line is what you have spent so far; the dashed line is an even pace to your
              budget.
            </figcaption>
          </figure>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16">
          <div className={cn(container, 'py-20 sm:py-28')}>
            <div className="grid gap-10 border-t border-foreground/80 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">What it does</p>
                <h2 className="font-display text-[36px] leading-[1.02] tracking-[-0.01em] text-balance sm:text-[44px]">
                  Less typing, fewer surprises.
                </h2>
              </div>
              <dl className="grid gap-x-12 sm:grid-cols-2">
                {FEATURES.map((f, i) => (
                  <div
                    key={f.title}
                    className={cn('border-t border-border py-7', i === 0 && 'border-t-0 pt-0 sm:pt-0', i === 1 && 'sm:border-t-0 sm:pt-0')}
                  >
                    <dt className="text-[15px] font-medium tracking-[-0.01em]">{f.title}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
                    {f.example && (
                      <dd className="mt-4 font-display text-[20px] italic leading-snug text-foreground/80">{f.example}</dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16">
          <div className={cn(container, 'pb-20 sm:pb-28')}>
            <div className="grid gap-10 border-t border-foreground/80 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">How it works</p>
                <h2 className="font-display text-[36px] leading-[1.02] tracking-[-0.01em] text-balance sm:text-[44px]">
                  A few minutes a week.
                </h2>
              </div>
              <ol className="grid gap-8 sm:grid-cols-3 sm:gap-8">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="space-y-2">
                    <span className="tabular block font-display text-[40px] leading-none text-brand">{i + 1}</span>
                    <h3 className="pt-2 text-[15px] font-medium tracking-[-0.01em]">{s.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t border-border">
          <div className={cn(container, 'flex flex-col gap-8 py-20 sm:py-24 lg:flex-row lg:items-end lg:justify-between')}>
            <h2 className="max-w-2xl font-display text-[40px] leading-[1.02] tracking-[-0.01em] text-balance sm:text-[52px]">
              Start with this month. It&apos;s free.
            </h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/login" className={buttonVariants({ size: 'lg' })}>
                Get started
              </Link>
              <button
                type="button"
                onClick={tryDemo}
                className="group inline-flex h-11 items-center gap-1.5 text-[15px] font-medium text-foreground transition-colors hover:text-brand"
              >
                Try the demo
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className={cn(container, 'flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between')}>
          <div className="flex items-center gap-2 text-[13px]">
            <Logo className="size-5 rounded-md" />
            <span className="font-medium">SpendWise</span>
            <span className="text-muted-foreground">Personal money, kept simple</span>
          </div>
          <div className="-ml-2 flex items-center gap-1 text-[13px] text-muted-foreground sm:ml-0">
            <a href="#features" className="inline-flex h-9 items-center px-2 transition-colors hover:text-foreground">
              Features
            </a>
            <Link href="/login" className="inline-flex h-9 items-center px-2 transition-colors hover:text-foreground">
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Static, scaled-down copy of the Home screen: sidebar on canvas, content on a sheet. */
function ProductShot() {
  return (
    <div aria-hidden className="pointer-events-none flex select-none overflow-hidden rounded-[14px] bg-canvas text-left">
      {/* Sidebar */}
      <div className="hidden w-[176px] shrink-0 flex-col gap-0.5 px-3 py-4 md:flex">
        <div className="mb-4 flex items-center gap-2 px-1.5">
          <Logo className="size-5 rounded-md" />
          <span className="text-[13px] font-semibold">SpendWise</span>
        </div>
        {NAV.map((n, i) => (
          <div
            key={n}
            className={cn(
              'flex h-7 items-center gap-2 rounded-md px-2 text-[12px]',
              i === 0
                ? 'bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--border)]'
                : 'text-muted-foreground'
            )}
          >
            <span className={cn('size-1.5 rounded-full', i === 0 ? 'bg-brand' : 'bg-subtle/60')} />
            {n}
          </div>
        ))}
      </div>

      {/* Sheet */}
      <div className="m-0 min-w-0 flex-1 rounded-[12px] bg-card shadow-sheet md:my-2 md:mr-2">
        <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
          <div className="space-y-1">
            <p className="text-[12px] text-muted-foreground">Thursday, 29 October</p>
            <p className="font-display text-[26px] leading-[1.05] sm:text-[30px]">Good evening, Priya</p>
          </div>

          <div className="grid items-end gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] sm:gap-8">
            <div className="space-y-3">
              <p className="text-[13px] text-muted-foreground">Left to spend in October</p>
              <Money amount={1665} size="hero" className="text-[48px] sm:text-[56px]" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                <Money amount={SPENT} size="sm" decimals={false} tone="muted" className="text-[13px]" /> spent of{' '}
                <Money amount={BUDGET} size="sm" decimals={false} tone="muted" className="text-[13px]" /> · 3 days to go · about{' '}
                <Money amount={555} size="sm" decimals={false} tone="brand" className="text-[13px]" /> a day
              </p>
            </div>
            <div>
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible">
                <path d={SPENT_AREA} fill="var(--brand)" fillOpacity={0.07} />
                <line
                  x1={sx(1)}
                  y1={sy(BUDGET / DAYS_IN_MONTH)}
                  x2={sx(DAYS_IN_MONTH)}
                  y2={sy(BUDGET)}
                  stroke="var(--chart-3)"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                />
                <path d={SPENT_LINE} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={LAST_POINT[0]} cy={LAST_POINT[1]} r={4} fill="var(--brand)" stroke="var(--card)" strokeWidth={2} />
              </svg>
              <div className="tabular mt-1.5 flex justify-between text-[11px] text-subtle">
                <span>1 Oct</span>
                <span>16 Oct</span>
                <span>31 Oct</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-4 border-y border-border py-4 sm:grid-cols-4 sm:divide-x sm:divide-border">
            {[
              { label: 'Money in', value: <Money amount={68500} size="md" tone="success" /> },
              { label: 'Spent', value: <Money amount={SPENT} size="md" /> },
              { label: 'Saved', value: <Money amount={68500 - SPENT} size="md" />, hint: '41% of what came in' },
              { label: 'Daily average', value: <Money amount={1391} size="md" decimals={false} />, hint: 'over 29 days' },
            ].map((m) => (
              <div key={m.label} className="space-y-1 sm:px-4 sm:first:pl-0">
                <div className="text-[12px] text-muted-foreground">{m.label}</div>
                <div className="text-[17px] font-medium leading-none tracking-[-0.02em]">{m.value}</div>
                {m.hint && <div className="text-[11px] text-muted-foreground">{m.hint}</div>}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-[13px] font-medium">Recent</p>
            <ul className="-mx-2 divide-y divide-border/70">
              {ROWS.map((r) => {
                const color = PURCHASE_KINDS[r.kind].color;
                return (
                  <li key={r.name} className="flex items-center gap-3 px-2 py-2.5">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{ background: `${color}1f`, color }}
                    >
                      {r.meta.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{r.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{r.meta}</div>
                    </div>
                    <Money
                      amount={r.amount}
                      size="sm"
                      className="text-[13px]"
                      sign={r.income ? 'plus' : 'none'}
                      tone={r.income ? 'success' : 'default'}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
