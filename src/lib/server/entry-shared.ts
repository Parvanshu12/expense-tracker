import 'server-only';
import { z } from 'zod';
import type { EntryItem } from '@/types/entry';

export type CategoryRow = { id: string; name: string; category_type: 'expense' | 'income' };

export async function loadCategories(db: D1Database, userId: string | null): Promise<CategoryRow[]> {
  const { results } = await db
    .prepare('SELECT id, name, category_type FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY is_system DESC, rowid')
    .bind(userId ?? '')
    .all<CategoryRow>();
  return results;
}

export function categoryNames(categories: CategoryRow[]) {
  return {
    expense: categories.filter((c) => c.category_type === 'expense').map((c) => c.name),
    income: categories.filter((c) => c.category_type === 'income').map((c) => c.name),
  };
}

/** Resolves a model-chosen category name to a real category, falling back to Miscellaneous / Other income. */
export function categoryFor(categories: CategoryRow[], name: string, type: 'expense' | 'income'): CategoryRow {
  const ofType = categories.filter((c) => c.category_type === type);
  return (
    ofType.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
    ofType.find((c) => c.id === (type === 'income' ? 'cat-other-inc' : 'cat-misc')) ??
    ofType[0]
  );
}

export const profileSchema = z
  .object({
    userType: z.string().max(40).nullable().optional(),
    monthlyIncome: z.number().min(0).max(1e11).nullable().optional(),
    goals: z.array(z.string().max(120)).max(10).optional(),
  })
  .optional();

/** One item as the model returns it; validated before anything reaches the client. */
export const modelItem = z.object({
  ref: z.string().nullable().default(null),
  transaction_type: z.enum(['expense', 'income']),
  amount: z.number().positive().nullable(),
  description: z.string().min(1).max(200),
  merchant: z.string().max(120).nullable().default(null),
  category: z.string(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.string().nullable().default(null),
  essentiality: z.enum(['essential', 'optimizable', 'discretionary']),
  confidence: z.number().min(0).max(1).default(0.8),
  needs: z.enum(['amount', 'category']).nullable().default(null),
  question: z.string().max(300).nullable().default(null),
  options: z.array(z.string().max(60)).max(4).default([]),
});

export function toEntryItem(
  item: z.infer<typeof modelItem>,
  categories: CategoryRow[],
  today: string,
  knownRefs: Set<string>
): EntryItem {
  const category = categoryFor(categories, item.category, item.transaction_type);
  const needs = item.amount === null ? 'amount' : item.needs;
  // Options must be real category names of the right type.
  const valid = new Set(categories.filter((c) => c.category_type === item.transaction_type).map((c) => c.name));
  const options = needs === 'category' ? item.options.filter((o) => valid.has(o)) : [];
  return {
    // Only keep refs the client issued; models sometimes invent them.
    ref: item.ref && knownRefs.has(item.ref) ? item.ref : null,
    transaction_type: item.transaction_type,
    amount: item.amount,
    description: item.description,
    merchant: item.merchant,
    category_id: category.id,
    category: category.name,
    purchase_date: item.purchase_date > today ? today : item.purchase_date,
    payment_method: item.payment_method,
    essentiality: item.transaction_type === 'income' ? 'essential' : item.essentiality,
    confidence: item.confidence,
    needs,
    question:
      needs === 'amount'
        ? item.question || `How much was "${item.description}"?`
        : needs === 'category'
          ? item.question || `What was "${item.description}" for?`
          : null,
    options: needs === 'category' && options.length === 0 ? [category.name] : options,
  };
}
