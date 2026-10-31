import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/server/env';
import { ApiError, clientIp, handle, parseBody, rateLimit } from '@/lib/server/http';
import { startSession, verifyPassword, type UserRow } from '@/lib/server/auth';
import { email } from '@/lib/server/schemas';

export const POST = handle(async (request: NextRequest) => {
  const env = await getEnv();
  await rateLimit(env, `login:${clientIp(request)}`);
  const body = await parseBody(request, z.object({ email, password: z.string().min(1).max(128) }));

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(body.email).first<UserRow>();
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    throw new ApiError(401, 'That password is incorrect.');
  }

  await startSession(env.DB, user.id);
  return NextResponse.json({ ok: true });
});
