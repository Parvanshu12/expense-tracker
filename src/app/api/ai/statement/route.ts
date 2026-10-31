import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { callAiWorker } from '@/lib/server/ai-worker';
import { getEnv } from '@/lib/server/env';
import { getSessionUser } from '@/lib/server/auth';
import { handle, parseBody } from '@/lib/server/http';
import { categoryNames, loadCategories, modelItem, profileSchema, toEntryItem } from '@/lib/server/entry-shared';
import { toLocalDateString } from '@/lib/calculations/finance';
import type { StatementResponse } from '@/types/entry';

const requestSchema = z.object({
  // Base64 without the data: prefix; ~6 MB file max.
  file: z.string().min(16).max(8 * 1024 * 1024, 'file is too large (max about 6 MB)'),
  filename: z.string().max(200).regex(/\.(pdf|csv|txt|xlsx|xls|ods)$/i, 'must be a PDF, Excel or CSV file'),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  profile: profileSchema,
});

const statementItem = modelItem.omit({ ref: true, purchase_date: true }).extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Reads a bank statement with Workers AI and returns transaction drafts. Saving and de-duplication happen on the client. */
export const POST = handle(async (request: NextRequest) => {
  const body = await parseBody(request, requestSchema);
  const env = await getEnv();
  const today = body.today || toLocalDateString(new Date(), 'Asia/Kolkata');
  const user = await getSessionUser(env.DB);
  const categories = await loadCategories(env.DB, user?.id ?? null);

  const { response } = await callAiWorker(request, '/v1/statement', {
    file: body.file,
    filename: body.filename,
    today,
    categories: categoryNames(categories),
    profile: body.profile,
  });
  const json = (await response.json()) as { data: { items: unknown[] }; stats?: { truncated?: boolean } };

  const items = json.data.items.flatMap((raw) => {
    const parsed = statementItem.safeParse(raw);
    if (!parsed.success) return [];
    const { date, ...rest } = parsed.data;
    return [toEntryItem({ ...rest, ref: null, purchase_date: date }, categories, today, new Set())];
  });
  const result: StatementResponse = { items, truncated: Boolean(json.stats?.truncated) };
  return NextResponse.json(result);
});
