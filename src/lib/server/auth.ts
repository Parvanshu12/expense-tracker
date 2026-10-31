import 'server-only';
import { cookies } from 'next/headers';
import { getEnv } from './env';
import { ApiError } from './http';

export const SESSION_COOKIE = 'spendwise_session';
const SESSION_DAYS = 30;
// Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  currency: string;
  timezone: string;
  language: string;
  monthly_income: number | null;
  created_at: string;
  updated_at: string;
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

/** Format: pbkdf2_sha256$<iterations>$<salt b64>$<hash b64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterations || !salt || !hash) return false;
  const candidate = await pbkdf2(password, fromBase64(salt), Number(iterations));
  return timingSafeEqual(candidate, fromBase64(hash));
}

async function hashToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

/** Creates a session row and sets the httpOnly cookie on the response. */
export async function startSession(db: D1Database, userId: string): Promise<void> {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) =>
    c === '+' ? '-' : c === '/' ? '_' : ''
  );
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await hashToken(token), userId, expires, now)
    .run();

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expires),
  });
}

export async function endSession(db: D1Database): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await hashToken(token)).run();
  store.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. */
export async function getSessionUser(db: D1Database): Promise<UserRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`
    )
    .bind(await hashToken(token), Date.now())
    .first<UserRow>();
  return row ?? null;
}

/** Env + signed-in user, or a 401. Every data route starts with this. */
export async function requireUser(): Promise<{ env: CloudflareEnv; db: D1Database; user: UserRow }> {
  const env = await getEnv();
  const user = await getSessionUser(env.DB);
  if (!user) throw new ApiError(401, 'Please sign in to continue.');
  return { env, db: env.DB, user };
}
