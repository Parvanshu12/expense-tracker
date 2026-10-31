import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { assertCategoryUsable, newId, toBudget } from '@/lib/server/db';
import { budgetCreate } from '@/lib/server/schemas';

export const GET = handle(async () => {
  const { db, user } = await requireUser();
  const { results } = await db
    .prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at DESC')
    .bind(user.id)
    .all();
  return NextResponse.json({ budgets: results.map(toBudget) });
});

export const POST = handle(async (request: NextRequest) => {
  const { db, user } = await requireUser();
  const b = await parseBody(request, budgetCreate);
  if (b.category_id) await assertCategoryUsable(db, user.id, b.category_id, 'expense');

  const row = await db
    .prepare(
      `INSERT INTO budgets (id, user_id, category_id, amount, period_type, start_date, end_date, alert_thresholds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(newId(), user.id, b.category_id, b.amount, b.period_type, b.start_date, b.end_date, JSON.stringify(b.alert_thresholds))
    .first();
  return NextResponse.json({ budget: toBudget(row!) }, { status: 201 });
});
