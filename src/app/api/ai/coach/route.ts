import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { callAiWorker } from '@/lib/server/ai-worker';
import { handle, parseBody } from '@/lib/server/http';

const requestSchema = z.object({
  question: z.string().trim().min(1, 'is required').max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(12)
    .default([]),
  language: z.enum(['en', 'hinglish']).default('en'),
  // Figures the app computed; kept small so the prompt stays cheap.
  context: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length < 6000, 'is too large'),
});

/** Streams the coach's reply as plain text chunks. */
export const POST = handle(async (request: NextRequest) => {
  const body = await parseBody(request, requestSchema);
  const { response } = await callAiWorker(request, '/v1/coach', body);
  return new Response(response.body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
});
