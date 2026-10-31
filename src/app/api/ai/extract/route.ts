import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { callAiWorker } from '@/lib/server/ai-worker';
import { getEnv } from '@/lib/server/env';
import { getSessionUser } from '@/lib/server/auth';
import { ApiError, handle, parseBody } from '@/lib/server/http';
import { toLocalDateString } from '@/lib/calculations/finance';
import { parseExpenseHeuristically } from '@/lib/ai/heuristic-parser';

const requestSchema = z.object({
  input: z.string().trim().min(1, 'is required').max(500),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('INR'),
});

// What the model must return; anything off-schema falls back to the offline parser.
const extractionSchema = z.object({
  transaction_type: z.enum(['expense', 'income']),
  amount: z.number().positive().nullable(),
  currency: z.string().default('INR'),
  description: z.string().min(1),
  merchant: z.string().nullable(),
  category: z.string(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchase_time: z.string().nullable(),
  payment_method: z.string().nullable(),
  essentiality: z.enum(['essential', 'optimizable', 'discretionary']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().default(''),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().nullable().default(null),
});

export const POST = handle(async (request: NextRequest) => {
  const body = await parseBody(request, requestSchema);
  const env = await getEnv();
  const timezone = body.timezone || 'Asia/Kolkata';
  const today = body.today || toLocalDateString(new Date(), timezone);

  // Category names the model may choose from: system ones plus the user's own.
  const user = await getSessionUser(env.DB);
  const { results } = await env.DB.prepare(
    'SELECT name, category_type FROM categories WHERE user_id IS NULL OR user_id = ?'
  )
    .bind(user?.id ?? '')
    .all<{ name: string; category_type: 'expense' | 'income' }>();
  const categories = {
    expense: results.filter((c) => c.category_type === 'expense').map((c) => c.name),
    income: results.filter((c) => c.category_type === 'income').map((c) => c.name),
  };

  try {
    const { response } = await callAiWorker(request, '/v1/extract', {
      input: body.input,
      today,
      timezone,
      currency: body.currency,
      categories,
    });
    const json = (await response.json()) as { data: unknown; model?: string };
    const data = extractionSchema.parse(json.data);
    return NextResponse.json({ data, source: 'workers-ai', model: json.model });
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) throw err;
    console.warn('Workers AI extraction failed, using offline parser:', err);
    return NextResponse.json({
      data: parseExpenseHeuristically(body.input, today, body.currency),
      source: 'heuristic',
    });
  }
});
