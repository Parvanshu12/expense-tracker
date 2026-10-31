import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { assertCategoryUsable, nowIso, toTransaction, TRANSACTION_SELECT, updateSet } from '@/lib/server/db';
import { transactionUpdate } from '@/lib/server/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: NextRequest, ctx: Ctx) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const changes = await parseBody(request, transactionUpdate);

  const existing = await db
    .prepare('SELECT transaction_type FROM transactions WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<{ transaction_type: 'expense' | 'income' }>();
  if (!existing) throw new ApiError(404, 'Transaction not found.');
  if (changes.category_id) await assertCategoryUsable(db, user.id, changes.category_id, existing.transaction_type);

  const { sql, params } = updateSet({ ...changes, updated_at: nowIso() });
  await db.prepare(`UPDATE transactions SET ${sql} WHERE id = ? AND user_id = ?`).bind(...params, id, user.id).run();

  const row = await db.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).bind(id).first();
  return NextResponse.json({ transaction: toTransaction(row!) });
});

export const DELETE = handle(async (_request: NextRequest, ctx: Ctx) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const result = await db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  if (!result.meta.changes) throw new ApiError(404, 'Transaction not found.');
  return NextResponse.json({ ok: true });
});
