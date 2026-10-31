import { DEFAULT_RATES, type InvestOptionKey } from '@/lib/calculations/invest';

export type Rates = Record<InvestOptionKey, number>;
export type RatesInput = Record<InvestOptionKey, string>;

export interface InvestOption {
  key: InvestOptionKey;
  /** Full name with a short plain explanation alongside. */
  label: string;
  /** Column / legend label. */
  short: string;
  risk: string;
  note: string;
  color: string;
  tone: 'default' | 'brand' | 'warning';
}

/** The ways to put money to work, safest first. Generic kinds only, never products or brands. */
export const OPTIONS: InvestOption[] = [
  {
    key: 'fd',
    label: 'Fixed deposit (FD)',
    short: 'FD',
    risk: 'Low risk',
    note: 'Money kept with a bank for a fixed time, at a fixed interest rate.',
    color: 'var(--info)',
    tone: 'default',
  },
  {
    key: 'debt',
    label: 'Debt or hybrid mutual fund',
    short: 'Debt fund',
    risk: 'Low to medium risk',
    note: 'A mutual fund that mostly lends to the government and companies, sometimes with a few shares. Small ups and downs.',
    color: 'color-mix(in oklab, var(--info) 50%, var(--brand))',
    tone: 'default',
  },
  {
    key: 'index',
    label: 'Index mutual fund',
    short: 'Index fund',
    risk: 'Medium to high risk',
    note: 'A mutual fund that buys the biggest companies on the share market. Falls in bad years, tends to grow over long periods.',
    color: 'var(--brand)',
    tone: 'brand',
  },
  {
    key: 'stocks',
    label: 'Stocks',
    short: 'Stocks',
    risk: 'High risk',
    note: 'Shares of single companies. Can grow more, and can also fall a lot.',
    color: 'var(--trim)',
    tone: 'warning',
  },
];

export const DEFAULT_RATES_INPUT: RatesInput = {
  fd: String(DEFAULT_RATES.fd),
  debt: String(DEFAULT_RATES.debt),
  index: String(DEFAULT_RATES.index),
  stocks: String(DEFAULT_RATES.stocks),
};

/** Parses the editable rates; anything blank or out of range falls back to the example rate. */
export function parseRates(input: RatesInput): Rates {
  const out = { ...DEFAULT_RATES };
  for (const key of Object.keys(out) as InvestOptionKey[]) {
    const raw = input[key]?.trim() ?? '';
    const n = Number(raw);
    if (raw !== '' && Number.isFinite(n) && n >= 0 && n <= 50) out[key] = n;
  }
  return out;
}

export function ratesAreDefault(rates: Rates): boolean {
  return (Object.keys(DEFAULT_RATES) as InvestOptionKey[]).every((k) => rates[k] === DEFAULT_RATES[k]);
}

export function parseAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
