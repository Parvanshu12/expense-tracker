import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { ApiError, handle } from '@/lib/server/http';

/** Removes everything a background import saved. */
export const POST = handle(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const job = await db.prepare('SELECT status FROM import_jobs WHERE id = ? AND user_id = ?').bind(id, user.id).first<{ status: string }>();
  if (!job) throw new ApiError(404, 'Import not found.');
  if (job.status !== 'done') throw new ApiError(409, 'This import is still running.');
  const result = await db.prepare('DELETE FROM transactions WHERE import_job_id = ? AND user_id = ?').bind(id, user.id).run();
  await db
    .prepare(
      `UPDATE import_jobs SET status = 'undone', updated_at = ?,
         events = json_insert(events, '$[#]', json_object('at', ?, 'text', ?)) WHERE id = ?`
    )
    .bind(new Date().toISOString(), new Date().toISOString(), `Undone: removed ${result.meta.changes} entries`, id)
    .run();
  return NextResponse.json({ removed: result.meta.changes });
});
