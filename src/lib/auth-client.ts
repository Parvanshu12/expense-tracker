'use client';

import type { Profile } from '@/types/database';

/** Cookie that marks a local sandbox (demo) session; data then lives in localStorage. */
export const SANDBOX_COOKIE = 'spendwise_demo_session';

export interface SessionUser extends Profile {
  email: string | null;
  sandbox: boolean;
}

export function isSandbox(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c === `${SANDBOX_COOKIE}=true`);
}

export function enterSandbox(): void {
  document.cookie = `${SANDBOX_COOKIE}=true; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

function clearSandbox(): void {
  document.cookie = `${SANDBOX_COOKIE}=; path=/; max-age=0`;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
  return json as T;
}

export function lookupEmail(email: string): Promise<{ exists: boolean }> {
  return post('/api/auth/lookup', { email });
}

export async function signIn(email: string, password: string): Promise<void> {
  await post('/api/auth/login', { email, password });
  clearSandbox();
}

export async function signUp(email: string, password: string, displayName?: string): Promise<void> {
  await post('/api/auth/signup', { email, password, displayName });
  clearSandbox();
}

export async function signOut(): Promise<void> {
  const wasSandbox = isSandbox();
  clearSandbox();
  if (!wasSandbox) await post('/api/auth/logout').catch(() => undefined);
  window.location.href = '/login';
}

/** The signed-in account, or null when there is no valid session. */
export async function fetchCurrentUser(): Promise<Omit<SessionUser, 'sandbox'> | null> {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Could not verify your session');
  const json = (await res.json()) as { user: Omit<SessionUser, 'sandbox'> };
  return json.user;
}
