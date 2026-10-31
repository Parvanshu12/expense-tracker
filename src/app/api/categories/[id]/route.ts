import { NextResponse } from 'next/server';
import { ApiError, handle } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';

export const DELETE = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const result = await db
    .prepare('DELETE FROM categories WHERE id = ? AND user_id = ? AND is_system = 0')
    .bind(id, user.id)
    .run()
    .catch((err) => {
      if (String(err).includes('FOREIGN KEY')) throw new ApiError(409, 'This category still has transactions.');
      throw err;
    });
  if (!result.meta.changes) throw new ApiError(404, 'Category not found.');
  return NextResponse.json({ ok: true });
});
