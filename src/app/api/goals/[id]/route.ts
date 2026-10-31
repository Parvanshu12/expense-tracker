import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { nowIso, toGoal, updateSet } from '@/lib/server/db';
import { goalUpdate } from '@/lib/server/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: NextRequest, ctx: Ctx) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const changes = await parseBody(request, goalUpdate);
  const { sql, params } = updateSet({ ...changes, updated_at: nowIso() });
  const row = await db
    .prepare(`UPDATE savings_goals SET ${sql} WHERE id = ? AND user_id = ? RETURNING *`)
    .bind(...params, id, user.id)
    .first();
  if (!row) throw new ApiError(404, 'Goal not found.');
  return NextResponse.json({ goal: toGoal(row) });
});

export const DELETE = handle(async (_request: NextRequest, ctx: Ctx) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const result = await db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  if (!result.meta.changes) throw new ApiError(404, 'Goal not found.');
  return NextResponse.json({ ok: true });
});
