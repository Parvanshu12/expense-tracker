// Matches incoming entries (e.g. bank statement rows) against what's already
// recorded, so the same purchase isn't saved twice. Pure, for unit tests.

export interface Comparable {
  transaction_type: 'expense' | 'income';
  amount: number | null;
  purchase_date: string; // YYYY-MM-DD
  description?: string;
  merchant?: string | null;
  category_id?: string;
  /** Set on incoming items whose category is still a guess. */
  needs?: 'amount' | 'category' | null;
}

const STOP_WORDS = new Set(['upi', 'pos', 'neft', 'imps', 'payment', 'paid', 'purchase', 'order', 'from', 'with', 'the', 'for', 'and', 'bill', 'transfer', 'india', 'pvt', 'ltd']);

function words(item: Comparable): Set<string> {
  return new Set(
    `${item.description ?? ''} ${item.merchant ?? ''}`
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
  );
}

/**
 * Same amount and date is necessary but not enough (₹1,200 petrol vs ₹1,200 to a friend).
 * Also require shared words, or the same category when we're confident about it.
 */
export function looksLikeSamePurchase(a: Comparable, b: Comparable): boolean {
  const wa = words(a);
  for (const w of words(b)) if (wa.has(w)) return true;
  const confident = a.needs !== 'category' && b.needs !== 'category';
  return confident && Boolean(a.category_id) && a.category_id === b.category_id;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * One-to-one matching on type, amount (within ₹1), date (within `windowDays`) and
 * a loose description/category check, closest date first. Two ₹40 rows on a statement match at most two existing ₹40
 * entries, never one entry twice.
 */
export function findDuplicates<T extends Comparable, E extends Comparable>(
  incoming: T[],
  existing: E[],
  windowDays = 3
): { fresh: T[]; duplicates: { item: T; match: E }[] } {
  const pairs: { i: number; e: number; gap: number }[] = [];
  incoming.forEach((item, i) => {
    if (item.amount === null) return;
    existing.forEach((ex, e) => {
      if (ex.amount === null || ex.transaction_type !== item.transaction_type) return;
      if (Math.abs(ex.amount - item.amount!) > 1) return;
      if (!looksLikeSamePurchase(item, ex)) return;
      const gap = Math.abs(dayNumber(ex.purchase_date) - dayNumber(item.purchase_date));
      if (gap <= windowDays) pairs.push({ i, e, gap });
    });
  });
  pairs.sort((a, b) => a.gap - b.gap);

  const usedIncoming = new Map<number, number>();
  const usedExisting = new Set<number>();
  for (const p of pairs) {
    if (usedIncoming.has(p.i) || usedExisting.has(p.e)) continue;
    usedIncoming.set(p.i, p.e);
    usedExisting.add(p.e);
  }

  const fresh: T[] = [];
  const duplicates: { item: T; match: E }[] = [];
  incoming.forEach((item, i) => {
    const e = usedIncoming.get(i);
    if (e === undefined) fresh.push(item);
    else duplicates.push({ item, match: existing[e] });
  });
  return { fresh, duplicates };
}
