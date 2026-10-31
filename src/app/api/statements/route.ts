import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { callAiWorker } from '@/lib/server/ai-worker';
import { requireUser } from '@/lib/server/auth';
import { ApiError, handle, parseBody } from '@/lib/server/http';
import { newId } from '@/lib/server/db';
import { toImportJob } from '@/lib/server/import-jobs';

const MAX_BYTES = 15 * 1024 * 1024;

const requestSchema = z.object({
  // Base64 without the data: prefix.
  file: z.string().min(16).max(Math.ceil((MAX_BYTES * 4) / 3) + 16, 'file is too large (max 15 MB)'),
  filename: z.string().max(200).regex(/\.(pdf|csv|txt|xlsx|xls|ods)$/i, 'must be a PDF, Excel or CSV file'),
});

/**
 * Starts a background statement import: the file goes to R2, a job row to D1,
 * and a Cloudflare Workflow does the reading and saving. Returns immediately.
 */
export const POST = handle(async (request: NextRequest) => {
  const { env, db, user } = await requireUser();
  const body = await parseBody(request, requestSchema);
  const bytes = Uint8Array.from(atob(body.file), (c) => c.charCodeAt(0));
  if (bytes.byteLength > MAX_BYTES) throw new ApiError(413, 'That file is too large (max 15 MB).');

  const id = newId();
  const safeName = body.filename.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const key = `${user.id}/${id}/${safeName}`;
  await env.STATEMENTS.put(key, bytes, { customMetadata: { userId: user.id, jobId: id } });
  await db
    .prepare(
      `INSERT INTO import_jobs (id, user_id, filename, r2_key, events)
       VALUES (?, ?, ?, ?, json_array(json_object('at', ?, 'text', ?)))`
    )
    .bind(id, user.id, safeName, key, new Date().toISOString(), `Uploaded ${safeName} (${(bytes.byteLength / 1024).toFixed(0)} KB)`)
    .run();

  try {
    await callAiWorker(request, '/v1/jobs/statement', { jobId: id });
  } catch (err) {
    await db
      .prepare("UPDATE import_jobs SET status = 'failed', error = ? WHERE id = ?")
      .bind(err instanceof Error ? err.message : 'Could not start the import', id)
      .run();
    throw err;
  }

  const row = await db.prepare('SELECT * FROM import_jobs WHERE id = ?').bind(id).first();
  return NextResponse.json({ job: toImportJob(row!) }, { status: 201 });
});

/** Recent imports (to resume progress after the user comes back). */
export const GET = handle(async () => {
  const { db, user } = await requireUser();
  const { results } = await db
    .prepare('SELECT * FROM import_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
    .bind(user.id)
    .all();
  return NextResponse.json({ jobs: results.map(toImportJob) });
});
