import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { assertCategoryUsable, newId, toTransaction, TRANSACTION_SELECT } from '@/lib/server/db';
import { transactionCreate } from '@/lib/server/schemas';

export const GET = handle(async () => {
  const { db, user } = await requireUser();
  const { results } = await db
    .prepare(`${TRANSACTION_SELECT} WHERE t.user_id = ? ORDER BY t.purchase_date DESC, t.created_at DESC`)
    .bind(user.id)
    .all();
  return NextResponse.json({ transactions: results.map(toTransaction) });
});

export const POST = handle(async (request: NextRequest) => {
  const { db, user } = await requireUser();
  const tx = await parseBody(request, transactionCreate);
  await assertCategoryUsable(db, user.id, tx.category_id, tx.transaction_type);

  const id = newId();
  await db
    .prepare(
      `INSERT INTO transactions (id, user_id, category_id, transaction_type, amount, currency, description, merchant,
         payment_method, purchase_date, purchase_time, occurred_at, entry_method, original_input, ai_extraction,
         essentiality, classification_confidence, classification_reason, user_corrected_classification,
         review_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
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
    .run();

  const row = await db.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).bind(id).first();
  return NextResponse.json({ transaction: toTransaction(row!) }, { status: 201 });
});
