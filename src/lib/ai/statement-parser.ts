// Reads statement rows straight from text when the layout is regular enough
// (UPI apps like Navi, PhonePe, Paytm, GPay: one date, one ₹ amount and a
// "Paid to / Received from" line per transaction). Amounts and direction then
// come from the file itself, not from a model. Returns null when the layout
// isn't recognised, so the caller can fall back to AI reading.
// Pure, so it runs in the AI worker and in unit tests.

export interface ParsedStatementRow {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, 24h
  transaction_type: 'expense' | 'income';
  amount: number;
  /** Row text as printed, e.g. "Paid to Zomato Media Private Limited". */
  description: string;
  /** Who the money went to or came from, tidied: "Zomato Media Private Limited", "Neetu Singh". */
  payee: string;
  /** The user's or app's note on the payment, when it says something useful. */
  note: string | null;
  payment_method: string | null;
  /** Card bills and wallet top-ups: moving your own money, not spending. */
  internal: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// "31 Oct 2026", "5-Oct-2026", "05/10/2026". PDF text often runs words together
// ("Amount31 Oct 20268:42 AM"), so no word boundaries.
const DATE_RE =
  /(?<!\d)(\d{1,2})[ -](jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[ ,-]+(\d{4})|(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})/gi;
const AMOUNT_RE = /(?:₹|rs\.?|inr)\s?(\d[\d,]*(?:\.\d{1,2})?)/gi;
const TIME_RE = /^\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i;

const EXPENSE_START = /^(paid to|sent to|payment to|paid at|recharge of|bill payment|bill paid|purchase|money sent|transfer to|debited|upi lite top.?up|add(?:ed)? money|wallet top.?up)/i;
const INCOME_START = /^(received from|money received|refund|cashback|reversal|credited|transfer from)/i;
const DETAIL_END = /(?:upi (?:txn|transaction|ref)[^:]*:|txn id|transaction id|ref(?:erence)? no|order id|note:|₹|\brs\.|\binr\b)/i;
const INTERNAL = /bill payment of .*credit ?card|credit ?card (?:bill|payment)|\bupi lite (?:top.?up|load|add)|add(?:ed)? money to|self transfer|to own a\/?c/i;
const NOISE_NOTE = /navi|paid (?:super )?fast|paid via|^upi$|^pay to bharatpe/i;

function isoDate(m: RegExpExecArray): string | null {
  const [day, month, year] = m[2]
    ? [Number(m[1]), MONTHS[m[2].toLowerCase()], Number(m[3])]
    : [Number(m[4]), Number(m[5]), Number(m[6])];
  if (!month || day < 1 || day > 31 || month > 12 || year < 2000) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function titleCase(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s;
}

/** "NEETU SINGH WO BANKEY BIHARI" -> "Neetu Singh"; "Ms RITIKA" -> "Ritika". */
export function tidyPayee(raw: string): string {
  const cleaned = raw
    .replace(EXPENSE_START, '')
    .replace(INCOME_START, '')
    .trim()
    .replace(/^(of|to|from)\s+/i, '')
    .replace(/\s+(?:[sdw]\/?o|c\/o)\s+.*$/i, '') // son/daughter/wife of ...
    .replace(/^(mr|mrs|ms|miss|shri|smt)\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return titleCase(cleaned) || raw.trim();
}

export function parseStatementText(text: string): ParsedStatementRow[] | null {
  const dates: { index: number; end: number; date: string }[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const date = isoDate(m as RegExpExecArray);
    if (date) dates.push({ index: m.index!, end: m.index! + m[0].length, date });
  }
  if (dates.length < 3) return null;

  const rows: ParsedStatementRow[] = [];
  let candidates = 0;
  for (let i = 0; i < dates.length; i++) {
    const segment = text.slice(dates[i].end, dates[i + 1]?.index ?? text.length);
    const amounts = [...segment.matchAll(AMOUNT_RE)];
    if (amounts.length === 0) continue; // headers like "from 30 Apr 2026 to 31 Oct 2026"
    candidates++;
    if (amounts.length !== 1) continue; // debit/credit/balance columns: too ambiguous to read by rule

    let rest = segment;
    let time: string | null = null;
    const t = TIME_RE.exec(rest);
    if (t) {
      let hour = Number(t[1]) % 12;
      if (t[3]?.toLowerCase() === 'pm') hour += 12;
      if (!t[3]) hour = Number(t[1]);
      time = `${String(hour).padStart(2, '0')}:${t[2]}`;
      rest = rest.slice(t[0].length);
    }
    rest = rest.replace(/^[\s|,-]+/, '');

    const description = rest.split(DETAIL_END)[0].replace(/\s+/g, ' ').trim();
    const type = EXPENSE_START.test(description) ? 'expense' : INCOME_START.test(description) ? 'income' : null;
    if (!type || !description) continue;

    const amount = Number(amounts[0][1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const noteMatch = /note:\s*([\s\S]*?)(?=₹|rs\.|inr|$)/i.exec(rest);
    const note =
      noteMatch?.[1]
        .replace(/(?:[A-Z][A-Za-z]*\s)*Bank\s*-\s*\d{3,4}\s*$|UPI Lite\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim() || null;

    rows.push({
      date: dates[i].date,
      time,
      transaction_type: type,
      amount,
      description,
      payee: tidyPayee(description),
      note: note && !NOISE_NOTE.test(note) ? note.slice(0, 120) : null,
      payment_method: /upi/i.test(segment) ? 'UPI' : /neft|imps|rtgs/i.test(segment) ? 'Net Banking' : null,
      internal: INTERNAL.test(`${description} ${note ?? ''}`),
    });
  }

  // Trust the rule-based read only if it understood nearly every row with an amount.
  if (rows.length < 3 || rows.length < candidates * 0.9) return null;
  return rows;
}
