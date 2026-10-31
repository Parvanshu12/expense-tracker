import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/server/env';
import { ApiError, clientIp, handle, parseBody, rateLimit } from '@/lib/server/http';
import { hashPassword, startSession } from '@/lib/server/auth';
import { newId } from '@/lib/server/db';
import { email, password } from '@/lib/server/schemas';

export const POST = handle(async (request: NextRequest) => {
  const env = await getEnv();
  await rateLimit(env, `signup:${clientIp(request)}`);
  const body = await parseBody(
    request,
    z.object({ email, password, displayName: z.string().trim().max(60).optional() })
  );

  const id = newId();
  try {
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
      .bind(id, body.email, await hashPassword(body.password), body.displayName || null)
      .run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new ApiError(409, 'An account with this email already exists.');
    throw err;
  }

  await startSession(env.DB, id);
  return NextResponse.json({ ok: true }, { status: 201 });
});
