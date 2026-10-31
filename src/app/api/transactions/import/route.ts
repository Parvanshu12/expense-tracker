import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { newId, toTransaction, TRANSACTION_SELECT } from '@/lib/server/db';
import { transactionCreate } from '@/lib/server/schemas';

const MAX_ROWS = 500;

/** Saves many transactions in one request (bank statement imports). All or nothing. */
export const POST = handle(async (request: NextRequest) => {
  const { db, user } = await requireUser();
  const { transactions } = await parseBody(
    request,
    z.object({ transactions: z.array(transactionCreate).min(1).max(MAX_ROWS) })
  );

  // Every category must be a system one or the user's own, of the matching type.
  const { results: usable } = await db
    .prepare('SELECT id, category_type FROM categories WHERE user_id IS NULL OR user_id = ?')
    .bind(user.id)
    .all<{ id: string; category_type: string }>();
  const typeById = new Map(usable.map((c) => [c.id, c.category_type]));
  for (const tx of transactions) {
    if (typeById.get(tx.category_id) !== tx.transaction_type) {
      throw new ApiError(400, `Category "${tx.category_id}" can't be used for this ${tx.transaction_type}.`);
    }
  }

  const ids = transactions.map(() => newId());
  const insert = db.prepare(
    `INSERT INTO transactions (id, user_id, category_id, transaction_type, amount, currency, description, merchant,
       payment_method, purchase_date, purchase_time, occurred_at, entry_method, original_input, ai_extraction,
       essentiality, classification_confidence, classification_reason, user_corrected_classification,
       review_status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  await db.batch(
    transactions.map((tx, i) =>
      insert.bind(
        ids[i],
        user.id,
        tx.category_id,
        tx.transaction_type,
        tx.amount,
        tx.currency,
        tx.description,
        tx.merchant,
        tx.payment_method,
        tx.purchase_date,
        tx.purchase_time,
        tx.occurred_at || `${tx.purchase_date}T${tx.purchase_time || '00:00'}:00`,
        tx.entry_method,
        tx.original_input,
        tx.ai_extraction ? JSON.stringify(tx.ai_extraction).slice(0, 8000) : null,
        tx.essentiality,
        tx.classification_confidence,
        tx.classification_reason,
        tx.user_corrected_classification ? 1 : 0,
        tx.review_status,
        tx.notes
      )
    )
  );

  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`${TRANSACTION_SELECT} WHERE t.id IN (${placeholders})`).bind(...ids).all();
  const byId = new Map(results.map((r) => [r.id as string, toTransaction(r)]));
  return NextResponse.json({ transactions: ids.map((id) => byId.get(id)!) }, { status: 201 });
});
