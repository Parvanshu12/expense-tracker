import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { handle } from '@/lib/server/http';
import { toTransaction, TRANSACTION_SELECT } from '@/lib/server/db';

/** Entries from this import that still need the user's answer (category unclear). */
export const GET = handle(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const { results } = await db
    .prepare(
      `${TRANSACTION_SELECT} WHERE t.user_id = ? AND t.import_job_id = ? AND t.review_status = 'pending_review'
       ORDER BY t.purchase_date`
    )
    .bind(user.id, id)
    .all();
  return NextResponse.json({ transactions: results.map(toTransaction) });
});
