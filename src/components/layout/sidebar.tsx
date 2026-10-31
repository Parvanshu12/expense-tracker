'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  ArrowLeftRight,
  Plus,
  Gauge,
  Sparkles,
  FileText,
  Target,
  LineChart,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/auth-client';
import { useSession } from './session-provider';
import { Logo } from './logo';

export const navigationGroups = [
  {
    label: null,
    items: [
      { name: 'Overview', href: '/dashboard', icon: LayoutGrid },
      { name: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
      { name: 'Add expense', href: '/add-expense', icon: Plus },
    ],
  },
  {
    label: 'Plan',
    items: [
      { name: 'Budgets', href: '/budgets', icon: Gauge },
      { name: 'Goals', href: '/goals', icon: Target },
      { name: 'Wealth simulator', href: '/wealth-simulator', icon: LineChart },
    ],
  },
  {
    label: 'Understand',
    items: [
      { name: 'AI coach', href: '/insights', icon: Sparkles },
      { name: 'Reports', href: '/reports', icon: FileText },
    ],
  },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  const name = user?.display_name || (user?.sandbox ? 'Demo user' : user?.email?.split('@')[0]) || 'You';

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden animate-fade-in" onClick={onClose} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-background transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">SpendWise</span>
            {user?.sandbox && (
              <span className="rounded border border-border px-1 py-px text-[10px] font-medium text-muted-foreground">
                DEMO
              </span>
            )}
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
          {navigationGroups.map((group, i) => (
            <div key={i} className="space-y-0.5">
              {group.label && (
                <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
                      active
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('size-4', active ? 'text-foreground' : 'text-subtle group-hover:text-foreground')} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-2">
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
              pathname === '/settings'
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <Settings className="size-4 text-subtle" />
            Settings
          </Link>
          <div className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{name}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {user?.sandbox ? 'Stored in this browser' : user?.email}
              </div>
            </div>
            <button
              onClick={() => void signOut()}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
