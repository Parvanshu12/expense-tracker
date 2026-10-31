import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/server/env';
import { isAiConfigured } from '@/lib/server/ai-worker';
import { handle } from '@/lib/server/http';

export const GET = handle(async () => {
  const env = await getEnv();
  return NextResponse.json({ enabled: isAiConfigured(env) });
});
