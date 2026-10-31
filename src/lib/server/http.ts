import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Wraps a route handler: ApiError -> its status, Zod errors -> 400, anything else -> 500. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        const field = issue?.path.join('.') || 'request';
        return NextResponse.json({ error: `Invalid ${field}: ${issue?.message ?? 'bad value'}` }, { status: 400 });
      }
      console.error('Unhandled API error', err);
      return NextResponse.json({ error: 'Something went wrong on our side. Please try again.' }, { status: 500 });
    }
  };
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be JSON');
  }
  return schema.parse(body);
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local'
  );
}

/** Applies the AUTH_LIMITER binding; throws 429 when exceeded. */
export async function rateLimit(env: CloudflareEnv, key: string): Promise<void> {
  const { success } = await env.AUTH_LIMITER.limit({ key });
  if (!success) throw new ApiError(429, 'Too many attempts. Please wait a minute and try again.');
}
