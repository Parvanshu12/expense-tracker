'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { SessionProvider } from './session-provider';
import { Logo } from './logo';

function AppLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Logo className="size-8 animate-pulse" />
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SessionProvider fallback={<AppLoading />}>
      <div className="flex min-h-screen bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8 animate-fade-in">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
