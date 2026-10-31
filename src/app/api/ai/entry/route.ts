import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { callAiWorker } from '@/lib/server/ai-worker';
import { getEnv } from '@/lib/server/env';
import { getSessionUser } from '@/lib/server/auth';
import { ApiError, handle, parseBody } from '@/lib/server/http';
import { categoryNames, loadCategories, modelItem, profileSchema, toEntryItem, type CategoryRow } from '@/lib/server/entry-shared';
import { toLocalDateString } from '@/lib/calculations/finance';
import { parseExpensesHeuristically } from '@/lib/ai/heuristic-parser';
import type { EntryResponse } from '@/types/entry';

const pendingSchema = z.object({
  ref: z.string().min(1).max(40),
  description: z.string().max(200),
  category: z.string().max(60),
  transaction_type: z.enum(['expense', 'income']),
  amount: z.number().positive().nullable().optional(),
  needs: z.enum(['amount', 'category']).optional(),
});

const requestSchema = z.object({
  message: z.string().trim().min(1, 'is required').max(1000),
  pending: z.array(pendingSchema).max(10).default([]),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) }))
    .max(12)
    .default([]),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('INR'),
  profile: profileSchema,
  context: z
    .object({
      monthSpentByCategory: z.record(z.string(), z.number()).optional(),
      budgets: z
        .array(z.object({ category: z.string().max(60), limit: z.number(), spent: z.number() }))
        .max(20)
        .optional(),
    })
    .optional(),
});

/**
 * A category the user named themselves ("...to traveling" -> Travel, "groceries mein" -> Groceries).
 * Only when exactly one category of that type matches, so the user's own word wins over the model's pick.
 */
function namedCategory(message: string, categories: CategoryRow[], type: 'expense' | 'income'): CategoryRow | undefined {
  const words = message.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 4);
  const named = categories.filter(
    (c) =>
      c.category_type === type &&
      c.name
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter((part) => part.length >= 4)
        .some((part) => words.some((w) => w.startsWith(part) || part.startsWith(w)))
  );
  return named.length === 1 ? named[0] : undefined;
}

const modelResponse = z.object({
  items: z.array(modelItem).max(15),
  reply: z.string().max(600).default(''),
  feedback: z.string().max(300).nullable().default(null),
  answer_category: z.string().max(60).nullable().default(null),
  rule_payee: z.string().max(80).nullable().default(null),
  rule_category: z.string().max(60).nullable().default(null),
});

/**
 * Chat entry: turns one message (possibly listing several purchases) into
 * transaction drafts. Complete drafts are saved by the client; drafts missing
 * an amount or a clear category come back with a question. Nothing is written here.
 */
export const POST = handle(async (request: NextRequest) => {
  const body = await parseBody(request, requestSchema);
  const env = await getEnv();
  const timezone = body.timezone || 'Asia/Kolkata';
  const today = body.today || toLocalDateString(new Date(), timezone);
  const user = await getSessionUser(env.DB);
  const categories = await loadCategories(env.DB, user?.id ?? null);
  const pendingRefs = new Set(body.pending.map((p) => p.ref));

  try {
    const { response } = await callAiWorker(request, '/v1/entry', {
      message: body.message,
      pending: body.pending,
      history: body.history,
      today,
      timezone,
      currency: body.currency,
      categories: categoryNames(categories),
      profile: body.profile,
      context: body.context,
    });
    const json = (await response.json()) as { data: unknown };
    const data = modelResponse.parse(json.data);
    const modelCategory = data.rule_payee?.trim()
      ? categories.find((c) => c.name.toLowerCase() === data.rule_category?.toLowerCase())
      : undefined;
    const ruleCategory = modelCategory && (namedCategory(body.message, categories, modelCategory.category_type) ?? modelCategory);
    const waiting = body.pending[0];
    const answerCategory =
      waiting?.needs === 'category' && data.answer_category
        ? (namedCategory(body.message, categories, waiting.transaction_type) ??
          categories.find(
            (c) => c.category_type === waiting.transaction_type && c.name.toLowerCase() === data.answer_category?.toLowerCase()
          ))
        : undefined;
    const result: EntryResponse = {
      answer: answerCategory ? { category_id: answerCategory.id, category: answerCategory.name } : null,
      rule: ruleCategory
        ? {
            payee: data.rule_payee!.trim(),
            category_id: ruleCategory.id,
            category: ruleCategory.name,
            transaction_type: ruleCategory.category_type,
          }
        : null,
      items: data.items.map((i) => toEntryItem(i, categories, today, pendingRefs)),
      reply: data.reply,
      feedback: data.feedback,
      source: 'workers-ai',
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) throw err;
    console.warn('Workers AI entry failed, using offline parser:', err);

    let items = parseExpensesHeuristically(body.message, today, body.currency).map((p) =>
      toEntryItem({ ...p, ref: null, needs: null, question: null, options: [] }, categories, today, pendingRefs)
    );
    // A lone unrecognised amount is most likely the answer to the first open question.
    // The client keeps the full pending draft, so only the ref and amount matter here.
    const lone = items[0];
    if (body.pending.length && items.length === 1 && lone.amount !== null && ['cat-misc', 'cat-other-inc'].includes(lone.category_id)) {
      items = [{ ...lone, ref: body.pending[0].ref, needs: null, question: null }];
    }
    const result: EntryResponse = {
      items,
      reply: items.length ? 'Got it.' : "I couldn't find an amount or a purchase in that. Try something like \"450 for lunch\".",
      feedback: null,
      source: 'heuristic',
    };
    return NextResponse.json(result);
  }
});
