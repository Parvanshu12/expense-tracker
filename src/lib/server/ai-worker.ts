import 'server-only';
import type { NextRequest } from 'next/server';
import { getEnv } from './env';
import { getSessionUser } from './auth';
import { ApiError, clientIp } from './http';

export function isAiConfigured(env: CloudflareEnv): boolean {
  return Boolean(env.CF_AI_WORKER_URL && env.CF_AI_WORKER_SECRET);
}

/**
 * Calls the spendwise-ai worker (Workers AI). The shared secret never leaves
 * the server. Requests are rate-limited per user, or per IP for demo sessions.
 */
export async function callAiWorker(
  request: NextRequest,
  path: '/v1/extract' | '/v1/entry' | '/v1/statement' | '/v1/receipt' | '/v1/jobs/statement' | '/v1/coach' | '/v1/transcribe',
  body: unknown
): Promise<{ response: Response; env: CloudflareEnv; userId: string | null }> {
  const env = await getEnv();
  if (!isAiConfigured(env)) throw new ApiError(503, 'AI is not configured on this server.');

  const user = await getSessionUser(env.DB);
  const response = await fetch(`${env.CF_AI_WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.CF_AI_WORKER_SECRET}`,
      'x-client-id': user ? `user:${user.id}` : `ip:${clientIp(request)}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status === 429 ? 429 : 502, json.error || 'The AI service is unavailable right now.');
  }
  return { response, env, userId: user?.id ?? null };
}
