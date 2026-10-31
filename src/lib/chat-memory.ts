'use client';

/**
 * Keeps chat conversations (expense entry and coach) in this browser, per
 * account, so they survive reloads and earlier turns can be sent as context.
 */

const PREFIX = 'spendwise_chat_';

export function chatKey(kind: 'entry' | 'coach', userId: string | undefined): string {
  return `${PREFIX}${kind}_${userId ?? 'anon'}`;
}

export function loadChat<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveChat(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: memory just won't persist.
  }
}

export function clearChat(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
