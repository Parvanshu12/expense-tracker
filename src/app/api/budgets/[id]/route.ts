import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, handle } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';

export const DELETE = handle(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const result = await db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  if (!result.meta.changes) throw new ApiError(404, 'Budget not found.');
  return NextResponse.json({ ok: true });
});
