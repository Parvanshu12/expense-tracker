import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { newId, toGoal } from '@/lib/server/db';
import { goalCreate } from '@/lib/server/schemas';

export const GET = handle(async () => {
  const { db, user } = await requireUser();
  const { results } = await db
    .prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC')
    .bind(user.id)
    .all();
  return NextResponse.json({ goals: results.map(toGoal) });
});

export const POST = handle(async (request: NextRequest) => {
  const { db, user } = await requireUser();
  const g = await parseBody(request, goalCreate);
  const row = await db
    .prepare(
      `INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, target_date, description)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(newId(), user.id, g.name, g.target_amount, g.current_amount, g.target_date, g.description)
    .first();
  return NextResponse.json({ goal: toGoal(row!) }, { status: 201 });
});
