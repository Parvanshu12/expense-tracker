import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { callAiWorker } from '@/lib/server/ai-worker';
import { getEnv } from '@/lib/server/env';
import { getSessionUser } from '@/lib/server/auth';
import { handle, parseBody } from '@/lib/server/http';
import { categoryNames, loadCategories, modelItem, profileSchema, toEntryItem } from '@/lib/server/entry-shared';
import { toLocalDateString } from '@/lib/calculations/finance';
import type { ReceiptResponse } from '@/types/entry';

const requestSchema = z.object({
  // Base64 without the data: prefix. The client downsizes photos first, so ~3 MB is generous.
  image: z.string().min(100).max(4 * 1024 * 1024, 'photo is too large'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  note: z.string().max(300).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().max(64).optional(),
  profile: profileSchema,
  context: z
    .object({
      monthSpentByCategory: z.record(z.string(), z.number()).optional(),
      budgets: z
        .array(z.object({ category: z.string().max(60), limit: z.number(), spent: z.number() }))
        .max(20)
        .optional(),
    })
    .optional(),
});

const modelResponse = z.object({
  items: z.array(modelItem).max(10),
  reply: z.string().max(600).default(''),
  feedback: z.string().max(300).nullable().default(null),
  seen: z.string().max(300).default(''),
});

/** Reads a photo of a bill, receipt, price tag or item with Workers AI vision. Nothing is written here. */
export const POST = handle(async (request: NextRequest) => {
  const body = await parseBody(request, requestSchema);
  const env = await getEnv();
  const timezone = body.timezone || 'Asia/Kolkata';
  const today = body.today || toLocalDateString(new Date(), timezone);
  const user = await getSessionUser(env.DB);
  const categories = await loadCategories(env.DB, user?.id ?? null);

  const { response } = await callAiWorker(request, '/v1/receipt', {
    image: body.image,
    mimeType: body.mimeType,
    note: body.note,
    today,
    timezone,
    categories: categoryNames(categories),
    profile: body.profile,
    context: body.context,
  });
  const json = (await response.json()) as { data: unknown };
  const data = modelResponse.parse(json.data);
  const result: ReceiptResponse = {
    items: data.items.map((i) => toEntryItem(i, categories, today, new Set())),
    reply: data.reply,
    feedback: data.feedback,
    seen: data.seen,
  };
  return NextResponse.json(result);
});
