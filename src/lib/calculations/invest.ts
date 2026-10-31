// Pure maths for the Future planner. Type-only imports keep this module
// runnable directly by Node's TypeScript type stripping (see tests/).
//
// Growth uses the same convention as simulateWealthGrowth() in finance.ts:
// the yearly rate is split into twelve monthly rates (r / 12), compounded
// monthly, and monthly deposits are made at the end of each month. That keeps
// the Simple and Advanced views of the planner in agreement.
import type { Essentiality, TransactionType } from '@/types/database';

export type InvestOptionKey = 'fd' | 'debt' | 'index' | 'stocks';

/** Example yearly returns (%) used for learning. Not promises. */
export const DEFAULT_RATES: Record<InvestOptionKey, number> = {
  fd: 7,
  debt: 8,
  index: 12,
  stocks: 14,
};

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function months(years: number): number {
  return Math.max(0, Math.round(finite(years) * 12));
}

/** What a one-time amount grows to after `years` at `annualRatePct` a year. */
export function futureValueLumpSum(principal: number, annualRatePct: number, years: number): number {
  const p = Math.max(0, finite(principal));
  const i = finite(annualRatePct) / 100 / 12;
  return p * Math.pow(1 + i, months(years));
}

/** What a monthly deposit (SIP) of `monthly` grows to after `years`. */
export function futureValueSip(monthly: number, annualRatePct: number, years: number): number {
  const pmt = Math.max(0, finite(monthly));
  const n = months(years);
  const i = finite(annualRatePct) / 100 / 12;
  if (i === 0) return pmt * n;
  return pmt * ((Math.pow(1 + i, n) - 1) / i);
}

/** Interest a deposit pays each month if the interest is paid out (FD monthly payout). */
export function monthlyInterest(principal: number, annualRatePct: number): number {
  return (Math.max(0, finite(principal)) * finite(annualRatePct)) / 100 / 12;
}

/** A future amount in today's money, after `years` of prices rising by `inflationPct` a year. */
export function inflationAdjusted(amount: number, inflationPct: number, years: number): number {
  const inf = finite(inflationPct);
  if (inf <= 0) return finite(amount);
  return finite(amount) / Math.pow(1 + inf / 100, Math.max(0, finite(years)));
}

/** Rounds to a friendly "about" figure: nearest ₹10 below ₹1,000, ₹100 below ₹1 lakh, else ₹1,000. */
export function roundAbout(amount: number): number {
  const n = finite(amount);
  const abs = Math.abs(n);
  const step = abs < 1000 ? 10 : abs < 100000 ? 100 : 1000;
  return Math.sign(n) * Math.round(abs / step) * step || 0;
}

// ---------------------------------------------------------------------------
// The user's own numbers

type TxLike = {
  transaction_type: TransactionType;
  amount: number | string;
  essentiality: Essentiality;
  purchase_date: string;
};

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86400000).toISOString().slice(0, 10);
}

const DAYS_PER_MONTH = 365.25 / 12;

export interface MoneySnapshot {
  /** Months of history behind the averages (at least 1). */
  months: number;
  /** Typical monthly income: the higher of the profile figure and recorded income. 0 if unknown. */
  monthlyIncome: number;
  incomeFrom: 'profile' | 'transactions' | 'none';
  monthlySpend: number;
  monthlyEssential: number;
  /** "Could trim" spending (essentiality: optimizable). */
  monthlyTrim: number;
  /** Optional spending (essentiality: discretionary). */
  monthlyOptional: number;
  /** Income minus spending each month; null when income is unknown. */
  monthlyLeft: number | null;
  /** All recorded income minus all recorded spending, never below 0. */
  savedSoFar: number;
}

/**
 * Monthly averages over the last `windowDays` days up to `today` (YYYY-MM-DD).
 * When the user's history is shorter than the window, averages cover only the
 * days since their first entry (but never less than one month, so a few days
 * of data aren't stretched into a big monthly figure).
 */
export function moneySnapshot(
  transactions: TxLike[],
  profileIncome: number | null | undefined,
  today: string,
  windowDays: number = 90
): MoneySnapshot {
  const past = transactions.filter((t) => t.purchase_date <= today);
  const start = addDays(today, -(windowDays - 1));
  const earliest = past.reduce<string | null>((min, t) => (min === null || t.purchase_date < min ? t.purchase_date : min), null);
  const spanDays = earliest === null ? windowDays : Math.min(windowDays, dayNumber(today) - dayNumber(earliest) + 1);
  const monthsCovered = Math.max(1, spanDays / DAYS_PER_MONTH);

  let income = 0;
  let spend = 0;
  let essential = 0;
  let trim = 0;
  let optional = 0;
  let allIncome = 0;
  let allSpend = 0;
  for (const t of past) {
    const amt = finite(Number(t.amount));
    const inWindow = t.purchase_date >= start;
    if (t.transaction_type === 'income') {
      allIncome += amt;
      if (inWindow) income += amt;
    } else if (t.transaction_type === 'expense') {
      allSpend += amt;
      if (!inWindow) continue;
      spend += amt;
      if (t.essentiality === 'essential') essential += amt;
      else if (t.essentiality === 'optimizable') trim += amt;
      else if (t.essentiality === 'discretionary') optional += amt;
    }
  }

  const fromTx = income / monthsCovered;
  const fromProfile = Math.max(0, finite(Number(profileIncome)));
  const monthlyIncome = Math.max(fromTx, fromProfile);
  const incomeFrom = monthlyIncome <= 0 ? 'none' : fromProfile >= fromTx ? 'profile' : 'transactions';
  const monthlySpend = spend / monthsCovered;

  return {
    months: monthsCovered,
    monthlyIncome,
    incomeFrom,
    monthlySpend,
    monthlyEssential: essential / monthsCovered,
    monthlyTrim: trim / monthsCovered,
    monthlyOptional: optional / monthsCovered,
    monthlyLeft: monthlyIncome > 0 ? monthlyIncome - monthlySpend : null,
    savedSoFar: Math.max(0, allIncome - allSpend),
  };
}

export interface SetAside {
  /** Left over after spending (negative when spending is more than income; 0 when income is unknown). */
  fromLeftover: number;
  /** The share of could-trim + optional spending that's cut. */
  fromTrim: number;
  /** What could go into savings each month, never below 0. */
  total: number;
}

/** How much could be set aside each month if `trimShare` (0–1) of non-essential spending were cut. */
export function setAsideEstimate(
  snapshot: Pick<MoneySnapshot, 'monthlyLeft' | 'monthlyTrim' | 'monthlyOptional'>,
  trimShare: number
): SetAside {
  const share = Math.min(1, Math.max(0, finite(trimShare)));
  const fromLeftover = snapshot.monthlyLeft ?? 0;
  const fromTrim = (snapshot.monthlyTrim + snapshot.monthlyOptional) * share;
  return { fromLeftover, fromTrim, total: Math.max(0, fromLeftover + fromTrim) };
}

/**
 * The biggest could-trim and optional expenses from the last `days` days up to
 * `today`, largest first.
 */
export function biggestOptionalPurchases<T extends TxLike>(
  transactions: T[],
  today: string,
  days: number = 60,
  limit: number = 4
): T[] {
  const start = addDays(today, -(days - 1));
  return transactions
    .filter(
      (t) =>
        t.transaction_type === 'expense' &&
        (t.essentiality === 'optimizable' || t.essentiality === 'discretionary') &&
        t.purchase_date >= start &&
        t.purchase_date <= today &&
        Number(t.amount) > 0
    )
    .sort((a, b) => Number(b.amount) - Number(a.amount) || b.purchase_date.localeCompare(a.purchase_date))
    .slice(0, limit);
}
