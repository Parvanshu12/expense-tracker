// Offline expense parser, used when the Workers AI service is unavailable.
// Pure and dependency-free so the unit tests can import it directly.

export type ParsedExpense = {
  transaction_type: 'expense' | 'income';
  amount: number | null;
  currency: string;
  description: string;
  merchant: string | null;
  category: string;
  purchase_date: string;
  purchase_time: string | null;
  payment_method: string | null;
  essentiality: 'essential' | 'optimizable' | 'discretionary';
  confidence: number;
  reasoning: string;
  needs_clarification: boolean;
  clarification_question: string | null;
};

const AMOUNT_PATTERN =
  /(?:(?:₹|rs\.?|inr|rupees|rupay)\s*([\d,]+(?:\.\d+)?)\s*(k)?)|([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:₹|rs\.?|rupees|rupay|ka|ki|ke|bheje|diye|aaye)|(?:spent|paid|for|cost|deeye|bhara|liya)\s*([\d,]+(?:\.\d+)?)\s*(k)?/i;

/** First money amount in a note ("₹250", "1200 rupees", "450 ka", "2.5k"), or null. */
export function extractAmount(input: string): number | null {
  const match = input.match(AMOUNT_PATTERN);
  let raw: string | undefined;
  let thousands = false;
  if (match) {
    raw = match[1] ?? match[3] ?? match[5];
    thousands = Boolean(match[2] ?? match[4] ?? match[6]);
  } else {
    const general = input.match(/\b(\d+(?:\.\d{1,2})?)\s*(k)?\b/i);
    raw = general?.[1];
    thousands = Boolean(general?.[2]);
  }
  if (!raw) return null;
  const value = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(value) ? (thousands ? value * 1000 : value) : null;
}

function previousDay(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const MERCHANTS: [RegExp, string][] = [
  [/swiggy/, 'Swiggy'],
  [/zomato/, 'Zomato'],
  [/\buber\b/, 'Uber'],
  [/\bola\b/, 'Ola'],
  [/amazon/, 'Amazon'],
  [/flipkart/, 'Flipkart'],
  [/blinkit/, 'Blinkit'],
  [/zepto/, 'Zepto'],
  [/netflix/, 'Netflix'],
  [/starbucks/, 'Starbucks'],
  [/\bpvr\b/, 'PVR Inox'],
];

/** Rule-based extraction for English and Hinglish notes. `today` is YYYY-MM-DD. */
export function parseExpenseHeuristically(input: string, today: string, currency = 'INR'): ParsedExpense {
  const text = input.trim();
  const lower = text.toLowerCase();
  const amount = extractAmount(text);

  const isIncome = /(salary|received|credited|earned|allowance|freelance|dividend|aayi|aaye|mile|kamaye)/i.test(lower);

  let category = isIncome ? 'Other Income' : 'Miscellaneous';
  let essentiality: ParsedExpense['essentiality'] = 'essential';

  if (isIncome) {
    if (/salary/.test(lower)) category = 'Salary';
    else if (/freelance/.test(lower)) category = 'Freelance Income';
    else if (/allowance/.test(lower)) category = 'Allowance';
  } else if (/(grocery|groceries|supermarket|vegetables|milk|fruits|nature basket|blinkit|zepto|bigbasket|doodh|dahi|sabzi|ration|kirana)/.test(lower)) {
    category = 'Groceries';
  } else if (/(swiggy|zomato|pizza|burger|lunch|dinner|breakfast|restaurant|cafe|coffee|starbucks|food|khana|chai|samosa|biryani|nashta)/.test(lower)) {
    category = 'Food & Dining';
    essentiality = /(coffee|pizza|swiggy|zomato|chai|cafe|restaurant)/.test(lower) ? 'optimizable' : 'essential';
  } else if (/(\buber\b|\bola\b|\bcab\b|\bauto\b|metro|fuel|petrol|diesel|flight|train|\bbus\b|rickshaw|gaadi)/.test(lower)) {
    category = 'Transportation';
    essentiality = /(\bcab\b|\buber\b|\bola\b)/.test(lower) ? 'optimizable' : 'essential';
  } else if (/(\brent\b|maintenance|housing|\bflat\b|kamra)/.test(lower)) {
    category = 'Housing & Rent';
  } else if (/(electricity|water bill|wifi|broadband|gas bill|phone bill|bijli|bijlee|recharge)/.test(lower)) {
    category = 'Utilities';
  } else if (/(medicine|doctor|pharmacy|hospital|health|dawa|davai|dawai|clinic)/.test(lower)) {
    category = 'Healthcare';
  } else if (/(netflix|spotify|prime|hotstar|subscription)/.test(lower)) {
    category = 'Subscriptions';
    essentiality = 'optimizable';
  } else if (/(movie|cinema|\bpvr\b|game|concert|film|theatre)/.test(lower)) {
    category = 'Entertainment';
    essentiality = 'discretionary';
  } else if (/(shopping|amazon|myntra|flipkart|clothes|shoes|laptop|kapde|kharida|khareeda)/.test(lower)) {
    category = 'Shopping';
    essentiality = 'discretionary';
  } else if (/(\bfee\b|fees|tuition|course|books|school|college|padhai)/.test(lower)) {
    category = 'Education';
  } else if (/(\bgym\b|salon|\bspa\b|haircut|parlour|skincare)/.test(lower)) {
    category = 'Personal Care';
    essentiality = 'optimizable';
  } else if (/(gift|donation|daan)/.test(lower)) {
    category = 'Gifts & Donations';
    essentiality = 'optimizable';
  }

  const merchant = MERCHANTS.find(([re]) => re.test(lower))?.[1] ?? null;

  let payment_method: string | null = null;
  if (/(upi|gpay|phonepe|paytm)/.test(lower)) payment_method = 'UPI';
  else if (/credit card/.test(lower)) payment_method = 'Credit Card';
  else if (/debit card/.test(lower)) payment_method = 'Debit Card';
  else if (/(cash|nakad)/.test(lower)) payment_method = 'Cash';

  const purchase_date = /(yesterday|\bkal\b)/.test(lower) ? previousDay(today) : today;

  return {
    transaction_type: isIncome ? 'income' : 'expense',
    amount,
    currency,
    description: text,
    merchant,
    category,
    purchase_date,
    purchase_time: null,
    payment_method,
    essentiality: isIncome ? 'essential' : essentiality,
    confidence: amount ? 0.6 : 0.3,
    reasoning: `Matched keywords for ${category}.`,
    needs_clarification: amount === null,
    clarification_question: amount === null ? 'How much was it?' : null,
  };
}
