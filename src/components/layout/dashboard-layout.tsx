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
      {/* Sidebar sits on the paper canvas; content lives on one raised sheet. */}
      <div className="flex min-h-screen bg-canvas">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:p-2 lg:pl-0">
          <div className="flex min-h-screen flex-1 flex-col bg-card lg:min-h-0 lg:overflow-hidden lg:rounded-[14px] lg:shadow-sheet">
            <Header onMenuClick={() => setSidebarOpen(true)} />
            <main id="app-scroll" className="flex-1 lg:overflow-y-auto">
              <div className="mx-auto w-full max-w-[1080px] px-5 py-8 md:px-10 md:py-10 animate-fade-in">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}
