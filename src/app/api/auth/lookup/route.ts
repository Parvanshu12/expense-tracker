import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/server/env';
import { clientIp, handle, parseBody, rateLimit } from '@/lib/server/http';
import { email } from '@/lib/server/schemas';

/** Step one of the single sign-in form: does this email already have an account? */
export const POST = handle(async (request: NextRequest) => {
  const env = await getEnv();
  await rateLimit(env, `lookup:${clientIp(request)}`);
  const body = await parseBody(request, z.object({ email }));
  const row = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(body.email).first();
  return NextResponse.json({ exists: Boolean(row) });
});
