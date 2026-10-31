// Loose matching of a payee name the user typed ("price kumar", "blinkit wale")
// against names from statements ("Prince Kumar", "Blinkit Commerce Pvt Ltd").
// Pure, for unit tests.

const FILLER = new Set([
  'all', 'the', 'every', 'my', 'to', 'from', 'of', 'for', 'payment', 'payments', 'paid', 'transactions',
  'entries', 'ones', 'mr', 'mrs', 'ms', 'sab', 'saare', 'sare', 'wale', 'wala', 'wali', 'ke', 'ko', 'ki', 'se',
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !FILLER.has(t));
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Same word, allowing one typo in words of 4+ letters (two in long words). */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return editDistance(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1);
}

/** True when every word the user typed matches a word of the candidate name. */
export function namesMatch(typed: string, candidate: string): boolean {
  const want = tokens(typed);
  const have = tokens(candidate);
  return want.length > 0 && have.length > 0 && want.every((w) => have.some((h) => close(w, h)));
}
