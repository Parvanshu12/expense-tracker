'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  Calendar,
  LogOut,
  User,
  CheckCircle2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { isSupabaseConfigured } from '@/lib/supabase/client';

import { toast } from 'sonner';

interface HeaderProps {
  onMenuClick?: () => void;
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
}

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Financial Overview',
    subtitle: 'Track income, essential vs discretionary expenses, and savings',
  },
  '/transactions': {
    title: 'Transactions Ledger',
    subtitle: 'Filter, search, and manage your categorized financial records',
  },
  '/add-expense': {
    title: 'Smart Expense Entry',
    subtitle: 'Record expenses with natural language, voice capture, or manual entry',
  },
  '/budgets': {
    title: 'Budgets & Limits',
    subtitle: 'Category-specific and monthly spending limits with early alert thresholds',
  },
  '/insights': {
    title: 'AI Spending Insights',
    subtitle: 'Pattern analysis, recurring leaks, and conversational money coach',
  },
  '/reports': {
    title: 'Financial Reports',
    subtitle: 'Comprehensive period breakdowns, essentiality audits, and CSV export',
  },
  '/goals': {
    title: 'Savings Goals',
    subtitle: 'Track target funds with deterministic monthly contribution roadmaps',
  },
  '/wealth-simulator': {
    title: 'Wealth Projection Simulator',
    subtitle: 'Educational scenario modeling for long-term compound growth',
  },
  '/settings': {
    title: 'Preferences & Settings',
    subtitle: 'Manage profile, default currency, timezones, and AI configurations',
  },
  '/onboarding': {
    title: 'Welcome to SpendWise AI',
    subtitle: 'Personalize your currency, timezone, and spending preferences',
  },
};

export function Header({ onMenuClick, selectedPeriod = 'this_month', onPeriodChange }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [supabaseReady, setSupabaseReady] = React.useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = React.useState<boolean>(false);
  const [displayName, setDisplayName] = React.useState<string>('');
  const [userEmail, setUserEmail] = React.useState<string>('');

  React.useEffect(() => {
    setSupabaseReady(isSupabaseConfigured());
    // Load display name from profile
    import('@/lib/data-service').then(({ DataService }) => {
      DataService.getProfile().then((profile) => {
        if (profile?.display_name) setDisplayName(profile.display_name);
      }).catch(() => {});
    });
    // Also try to get the Supabase email
    if (isSupabaseConfigured()) {
      import('@/lib/supabase/client').then(({ createClient }) => {
        const sb = createClient();
        if (sb) {
          sb.auth.getUser().then(({ data }) => {
            if (data?.user?.email) setUserEmail(data.user.email);
          }).catch(() => {});
        }
      });
    }
  }, []);

  const initials = displayName
    ? displayName.split(' ').map((w) => w[0]).join('').toUpperCase().substring(0, 2)
    : 'SW';

  const pageInfo = pageTitles[pathname] || {
    title: 'SpendWise AI',
    subtitle: 'Personal Finance Intelligence',
  };

  const handleSignOut = async () => {
    try {
      // Clear demo session cookie
      document.cookie = 'spendwise_demo_session=; path=/; max-age=0';
      if (isSupabaseConfigured()) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        if (supabase) {
          await supabase.auth.signOut();
        }
      }
      toast.success('Signed out successfully');
      window.location.href = '/login';
    } catch {
      document.cookie = 'spendwise_demo_session=; path=/; max-age=0';
      window.location.href = '/login';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 px-4 md:px-6 backdrop-blur-md">
      {/* Left: Mobile Menu & Page Heading */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden sm:flex flex-col">
          <h1 className="text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            {pageInfo.title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden md:block">
            {pageInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Quick Add Expense Action */}
        {pathname !== '/add-expense' && (
          <Link href="/add-expense">
            <Button size="sm" variant="ai" className="gap-1.5 h-8 px-3 text-xs font-semibold shadow-xs">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Expense</span>
            </Button>
          </Link>
        )}

        {/* Reporting Period Selector (Dashboard/Reports pages) */}
        {(pathname === '/dashboard' || pathname === '/reports') && onPeriodChange && (
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={selectedPeriod}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="bg-transparent font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer text-xs"
            >
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="last_3_months">Last 3 Months</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="this_year">This Year (YTD)</option>
            </select>
          </div>
        )}

        {/* Currency Badge */}
        <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span>₹</span>
          <span>INR</span>
        </div>

        {/* Supabase Connection Status Pill */}
        <div
          title={
            supabaseReady
              ? 'Supabase backend connected with Row Level Security active'
              : 'Supabase credentials not configured in .env.local — running in local sandbox preview mode'
          }
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border"
          style={{
            borderColor: supabaseReady ? '#a7f3d0' : '#fde68a',
            backgroundColor: supabaseReady ? '#ecfdf5' : '#fffbeb',
            color: supabaseReady ? '#065f46' : '#92400e',
          }}
        >
          {supabaseReady ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>Supabase Live</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 text-amber-600" />
              <span>Demo / Sandbox</span>
            </>
          )}
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Profile Dropdown / Sign Out */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 rounded-full border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-indigo-500/20 transition-all"
            aria-label="User profile"
          >
            <div className="h-7 w-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
          </button>

          {showProfileMenu && (
            <div
              className="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 text-xs animate-in fade-in-50 zoom-in-95"
              onClick={() => setShowProfileMenu(false)}
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{displayName || 'SpendWise User'}</p>
                <p className="text-[11px] text-slate-500 truncate">{userEmail || (supabaseReady ? 'Authenticated' : 'Sandbox Mode')}</p>
              </div>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <User className="h-3.5 w-3.5 text-slate-500" />
                Profile & Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
