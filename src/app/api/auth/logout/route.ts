import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/server/env';
import { handle } from '@/lib/server/http';
import { endSession } from '@/lib/server/auth';

export const POST = handle(async () => {
  const env = await getEnv();
  await endSession(env.DB);
  return NextResponse.json({ ok: true });
});
