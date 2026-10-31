import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { callAiWorker } from '@/lib/server/ai-worker';
import { handle, parseBody } from '@/lib/server/http';

const requestSchema = z.object({
  // Base64 audio without the data: prefix. ~6 MB of audio max.
  audio: z.string().min(16).max(8 * 1024 * 1024, 'recording is too long'),
});

export const POST = handle(async (request: NextRequest) => {
  const body = await parseBody(request, requestSchema);
  const { response } = await callAiWorker(request, '/v1/transcribe', { audio: body.audio });
  const json = (await response.json()) as { text?: string };
  return NextResponse.json({ text: json.text ?? '' });
});
