'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Receipt,
  PlusCircle,
  PieChart,
  Sparkles,
  FileBarChart,
  Target,
  TrendingUp,
  Settings,
  X,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const navigationItems = [
  {
    name: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Transactions',
    href: '/transactions',
    icon: Receipt,
  },
  {
    name: 'Add Expense',
    href: '/add-expense',
    icon: PlusCircle,
    badge: 'AI Smart',
  },
  {
    name: 'Budgets',
    href: '/budgets',
    icon: PieChart,
  },
  {
    name: 'AI Insights',
    href: '/insights',
    icon: Sparkles,
    badge: 'Coach',
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: FileBarChart,
  },
  {
    name: 'Savings Goals',
    href: '/goals',
    icon: Target,
  },
  {
    name: 'Wealth Simulator',
    href: '/wealth-simulator',
    icon: TrendingUp,
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Persistent Desktop & Slide-out Mobile Sidebar */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* App Branding */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800/80">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-none">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                SpendWise <span className="text-indigo-600 font-extrabold text-xs px-1.5 py-0.5 rounded-sm bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">AI</span>
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium tracking-tight">Smart Money Intelligence</span>
            </div>
          </Link>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-600 dark:text-slate-300 uppercase">
            Navigation
          </div>
          {navigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      'h-4 w-4 transition-colors',
                      isActive
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                    )}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <Badge
                    variant={item.badge === 'AI Smart' ? 'default' : 'secondary'}
                    className={cn(
                      'text-[10px] px-1.5 py-0 h-4.5',
                      item.badge === 'AI Smart' && 'bg-indigo-600 hover:bg-indigo-600 font-normal',
                      item.badge === 'Coach' && 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-normal'
                    )}
                  >
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom Status / Safe Isolation Badge */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/80">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Row-Level Security</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Your financial records are isolated and encrypted per user account.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
