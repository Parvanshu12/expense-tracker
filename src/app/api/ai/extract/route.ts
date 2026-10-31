import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { toLocalDateString } from '@/lib/calculations/finance';

const aiExpenseSchema = z.object({
  transaction_type: z.enum(['expense', 'income']).default('expense'),
  amount: z.number().nullable(),
  currency: z.string().default('INR'),
  description: z.string(),
  merchant: z.string().nullable(),
  category: z.string().default('Miscellaneous'),
  purchase_date: z.string().nullable(),
  purchase_time: z.string().nullable(),
  payment_method: z.string().nullable(),
  essentiality: z.enum(['essential', 'optimizable', 'discretionary']).default('essential'),
  confidence: z.number().min(0).max(1).default(0.85),
  reasoning: z.string().optional(),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().nullable().default(null),
});

export async function POST(req: NextRequest) {
  try {
    const { input, currency = 'INR' } = await req.json();

    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Text input is required' }, { status: 400 });
    }

    const trimmedInput = input.trim();
    const apiKey = process.env.OPENAI_API_KEY;

    // If OpenAI API key is available, use GPT-4o-mini structured output
    if (apiKey && apiKey.startsWith('sk-')) {
      try {
        const openai = new OpenAI({ apiKey });
        const systemPrompt = `You are SpendWise AI, an expert financial expense intelligence parser.
Extract structured transaction details from the user's natural language input.
Current local timezone: Asia/Kolkata. Default currency: ${currency}.
Essentiality Guidelines:
- essential: Core necessities (groceries, rent, medical, core utilities, education).
- optimizable: Necessary or routine spending that could be reduced (food delivery, daily cab rides, subscriptions).
- discretionary: Optional leisure (movies, luxury shopping, gaming, party).
CRITICAL RULES:
- Never fabricate missing merchants or dates.
- If amount is missing, set amount to null, set needs_clarification to true, and formulate a clarification_question.
- Valid transaction_type is 'expense' or 'income'.
Output valid JSON matching the schema.`;

        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmedInput },
          ],
          temperature: 0.1,
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          const validated = aiExpenseSchema.parse(parsed);
          return NextResponse.json({ data: validated, source: 'openai' });
        }
      } catch (openAiErr) {
        console.warn('OpenAI extraction error, falling back to heuristic parser:', openAiErr);
      }
    }

    // High-precision deterministic heuristic parser fallback (ensures offline/demo reliability)
    const lower = trimmedInput.toLowerCase();

    // 1. Extract amount (supports ₹, Rs, Rupees, Rupay, Ka, K, etc.)
    const amountMatch = trimmedInput.match(/(?:(?:₹|rs\.?|inr|rupees|rupay)\s*([\d,]+(?:\.\d+)?))|([\d,]+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees|rupay|ka|ki|bheje|diye|aaye)|(?:spent|paid|for|cost|deeye|bhara|liya)\s*([\d,]+(?:\.\d+)?)/i);
    let amount: number | null = null;
    if (amountMatch) {
      const rawNum = amountMatch[1] || amountMatch[2] || amountMatch[3];
      if (rawNum) {
        amount = parseFloat(rawNum.replace(/,/g, ''));
      }
    } else {
      // General number regex
      const generalNum = trimmedInput.match(/\b\d+(\.\d{1,2})?\b/);
      if (generalNum) {
        amount = parseFloat(generalNum[0]);
      }
    }

    // 2. Transaction type (English & Hinglish)
    const isIncome = /(salary|received|credited|earned|allowance|freelance|dividend|aayi|aaye|mile|kamaye|bheje)/i.test(lower);
    const transaction_type = isIncome ? 'income' : 'expense';

    // 3. Category & Essentiality heuristics (English & Hinglish)
    let category = 'Miscellaneous';
    let essentiality: 'essential' | 'optimizable' | 'discretionary' = 'essential';
    let merchant: string | null = null;

    if (/(grocery|groceries|supermarket|vegetables|milk|fruits|nature basket|blinkit|zepto|bigbasket|doodh|dahi|sabzi|ration|kirana)/i.test(lower)) {
      category = 'Groceries';
      essentiality = 'essential';
    } else if (/(swiggy|zomato|pizza|burger|lunch|dinner|breakfast|restaurant|cafe|coffee|starbucks|food|khana|chai|samosa|biryani|nashta)/i.test(lower)) {
      category = 'Food & Dining';
      essentiality = lower.includes('coffee') || lower.includes('pizza') || lower.includes('swiggy') || lower.includes('zomato') || lower.includes('chai') ? 'optimizable' : 'essential';
    } else if (/(uber|ola|cab|auto|metro|fuel|petrol|diesel|flight|train|bus|rickshaw|gaadi)/i.test(lower)) {
      category = 'Transportation';
      essentiality = lower.includes('cab') || lower.includes('uber') || lower.includes('ola') ? 'optimizable' : 'essential';
    } else if (/(rent|maintenance|housing|flat|ghar ka rent|kamra)/i.test(lower)) {
      category = 'Housing & Rent';
      essentiality = 'essential';
    } else if (/(electricity|water bill|wifi|broadband|gas bill|phone bill|bijli|bijlee|recharge)/i.test(lower)) {
      category = 'Utilities';
      essentiality = 'essential';
    } else if (/(medicine|doctor|pharmacy|hospital|health|dawa|davai|dawai|clinic)/i.test(lower)) {
      category = 'Healthcare';
      essentiality = 'essential';
    } else if (/(movie|cinema|netflix|spotify|pvr|game|concert|film|theatre)/i.test(lower)) {
      category = 'Entertainment';
      essentiality = 'discretionary';
    } else if (/(shopping|amazon|myntra|clothes|shoes|laptop|notebook|kapde|shoes|kharida|khareeda)/i.test(lower)) {
      category = 'Shopping';
      essentiality = 'discretionary';
    } else if (/(fee|tuition|course|books|school|college|padhai)/i.test(lower)) {
      category = 'Education';
      essentiality = 'essential';
    } else if (/(gym|salon|spa|haircut|parlour|skincare)/i.test(lower)) {
      category = 'Personal Care';
      essentiality = 'optimizable';
    } else if (/(dost|friend|gift|donation|bhai|daan)/i.test(lower) && !isIncome) {
      category = 'Gifts & Donations';
      essentiality = 'optimizable';
    }

    // 4. Merchant extraction
    if (lower.includes('swiggy')) merchant = 'Swiggy';
    else if (lower.includes('zomato')) merchant = 'Zomato';
    else if (lower.includes('uber')) merchant = 'Uber';
    else if (lower.includes('ola')) merchant = 'Ola';
    else if (lower.includes('amazon')) merchant = 'Amazon';
    else if (lower.includes('flipkart')) merchant = 'Flipkart';
    else if (lower.includes('blinkit')) merchant = 'Blinkit';
    else if (lower.includes('zepto')) merchant = 'Zepto';
    else if (lower.includes('netflix')) merchant = 'Netflix';
    else if (lower.includes('starbucks')) merchant = 'Starbucks';
    else if (lower.includes('pvr')) merchant = 'PVR Inox';

    // 5. Payment method
    let payment_method: string | null = null;
    if (/(upi|gpay|phonepe|paytm)/i.test(lower)) payment_method = 'UPI';
    else if (/(credit card|card)/i.test(lower)) payment_method = 'Credit Card';
    else if (/(cash|roked)/i.test(lower)) payment_method = 'Cash';

    // 6. Date extraction
    // The server usually runs in UTC, so resolve "today" in the user's default zone.
    const timeZone = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'Asia/Kolkata';
    let purchase_date = toLocalDateString(new Date(), timeZone);
    if (lower.includes('yesterday') || lower.includes('kal')) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      purchase_date = toLocalDateString(yesterday, timeZone);
    }

    const result = {
      transaction_type,
      amount,
      currency,
      description: trimmedInput,
      merchant,
      category,
      purchase_date,
      purchase_time: null,
      payment_method,
      essentiality,
      confidence: amount ? 0.90 : 0.40,
      reasoning: `Rule-based financial classification: identified ${category} as ${essentiality}`,
      needs_clarification: amount === null,
      clarification_question: amount === null ? 'Could you specify the amount spent?' : null,
    };

    return NextResponse.json({ data: result, source: 'heuristic' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
