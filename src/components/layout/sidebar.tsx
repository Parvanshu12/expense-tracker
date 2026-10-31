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
  CalendarRange,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/auth-client';
import { Kbd } from '@/components/ui/kbd';
import { useSession } from './session-provider';
import { Logo } from './logo';

export const navigationGroups = [
  {
    label: null,
    items: [
      { name: 'Home', href: '/dashboard', icon: LayoutGrid },
      { name: 'My spending', href: '/transactions', icon: ArrowLeftRight },
      { name: 'Timeline', href: '/timeline', icon: CalendarRange },
    ],
  },
  {
    label: 'Plan ahead',
    items: [
      { name: 'Budgets', href: '/budgets', icon: Gauge },
      { name: 'Savings goals', href: '/goals', icon: Target },
      { name: 'Future planner', href: '/wealth-simulator', icon: LineChart },
    ],
  },
  {
    label: 'Get help',
    items: [
      { name: 'Ask for advice', href: '/insights', icon: Sparkles },
      { name: 'Reports', href: '/reports', icon: FileText },
    ],
  },
];

function NavLink({
  href,
  active,
  icon: Icon,
  children,
  onClick,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
        active
          ? 'bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--border)]'
          : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
      )}
    >
      <Icon className={cn('size-4', active ? 'text-brand' : 'text-subtle group-hover:text-foreground')} />
      {children}
    </Link>
  );
}

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  const name = user?.display_name || (user?.sandbox ? 'Demo user' : user?.email?.split('@')[0]) || 'You';

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] lg:hidden animate-fade-in" onClick={onClose} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-canvas transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:translate-x-0',
          isOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">SpendWise</span>
            {user?.sandbox && (
              <span className="rounded-full bg-foreground/[0.06] px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                Demo
              </span>
            )}
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.05] lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-3 pt-1 pb-3">
          <Link
            href="/add-expense"
            onClick={onClose}
            className="flex h-9 w-full items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-card transition-colors hover:bg-primary/85"
          >
            <Plus className="size-4" />
            Add spending
            <Kbd className="ml-auto border-primary-foreground/25">N</Kbd>
          </Link>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {navigationGroups.map((group, i) => (
            <div key={i} className="space-y-0.5">
              {group.label && <div className="px-2.5 pb-1.5 text-xs text-subtle">{group.label}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  onClick={onClose}
                  active={pathname === item.href || (item.href !== '/dashboard' && Boolean(pathname?.startsWith(item.href)))}
                >
                  {item.name}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="space-y-1 p-3">
          <NavLink href="/settings" icon={Settings} active={pathname === '/settings'} onClick={onClose}>
            Settings
          </NavLink>
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-[11px] font-semibold text-foreground">
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
              className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
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
