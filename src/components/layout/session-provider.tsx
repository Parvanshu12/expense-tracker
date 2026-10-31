'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { fetchCurrentUser, isSandbox, type SessionUser } from '@/lib/auth-client';
import { DataService } from '@/lib/data-service';

interface SessionContextValue {
  user: SessionUser | null;
  refresh: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue>({ user: null, refresh: async () => {} });

export function useSession() {
  return React.useContext(SessionContext);
}

async function resolveSession(): Promise<SessionUser | null> {
  if (isSandbox()) {
    const profile = await DataService.getProfile();
    return { ...profile, email: null, sandbox: true };
  }
  const current = await fetchCurrentUser().catch(() => null);
  return current ? { ...current, sandbox: false } : null;
}

/**
 * Guards the app: resolves the signed-in user (or sandbox profile) before
 * rendering, and sends anyone without a session to /login. API routes check
 * the session again on every request; this only keeps the UI honest.
 */
export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = React.useState<SessionUser | null>(null);
  // Resolve once on mount; later navigations reuse the session.
  const initialPath = React.useRef(pathname);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await resolveSession();
      if (cancelled) return;
      if (next) setUser(next);
      else router.replace(`/login?next=${encodeURIComponent(initialPath.current || '/dashboard')}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refresh = React.useCallback(async () => {
    const next = await resolveSession();
    if (next) setUser(next);
  }, []);

  return (
    <SessionContext.Provider value={{ user, refresh }}>{user ? children : fallback}</SessionContext.Provider>
  );
}
