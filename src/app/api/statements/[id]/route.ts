import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { ApiError, handle } from '@/lib/server/http';
import { toImportJob } from '@/lib/server/import-jobs';

export const GET = handle(async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { db, user } = await requireUser();
  const { id } = await ctx.params;
  const row = await db.prepare('SELECT * FROM import_jobs WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!row) throw new ApiError(404, 'Import not found.');
  return NextResponse.json({ job: toImportJob(row) });
});
