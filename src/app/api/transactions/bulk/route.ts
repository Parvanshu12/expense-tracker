import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { transactionUpdate } from '@/lib/server/schemas';

/** D1 allows at most 100 bound parameters per query. */
const IDS_PER_QUERY = 90;

/** Gives many transactions the same category (one answer for every payment to the same person). */
export const PATCH = handle(async (request: NextRequest) => {
  const { db, user } = await requireUser();
  const { ids, changes } = await parseBody(
    request,
    z.object({
      ids: z.array(z.string().min(1).max(64)).min(1).max(1000),
      changes: transactionUpdate.pick({
        category_id: true,
        essentiality: true,
        review_status: true,
        user_corrected_classification: true,
        notes: true,
      }),
    })
  );
  const keys = Object.keys(changes) as (keyof typeof changes)[];
  if (!keys.length) throw new ApiError(400, 'Nothing to change.');
  if (changes.category_id) {
    const ok = await db
      .prepare('SELECT 1 FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)')
      .bind(changes.category_id, user.id)
      .first();
    if (!ok) throw new ApiError(400, 'Unknown category.');
  }

  const values = keys.map((k) => (k === 'user_corrected_classification' ? (changes[k] ? 1 : 0) : changes[k]));
  const now = new Date().toISOString();
  let updated = 0;
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) {
    const chunk = ids.slice(i, i + IDS_PER_QUERY);
    // A category only applies to transactions of its own type (expense / income).
    const result = await db
      .prepare(
        `UPDATE transactions SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ?
         WHERE user_id = ? AND id IN (${chunk.map(() => '?').join(',')})
         ${changes.category_id ? 'AND transaction_type = (SELECT category_type FROM categories WHERE id = ?)' : ''}`
      )
      .bind(...values, now, user.id, ...chunk, ...(changes.category_id ? [changes.category_id] : []))
      .run();
    updated += result.meta.changes;
  }
  return NextResponse.json({ updated });
});
