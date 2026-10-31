'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { navigationGroups } from './sidebar';

const extraTitles: Record<string, string> = { '/settings': 'Settings', '/add-expense': 'Add spending' };

function titleFor(pathname: string | null): string {
  if (!pathname) return '';
  if (extraTitles[pathname]) return extraTitles[pathname];
  for (const group of navigationGroups) {
    const item = group.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    if (item) return item.name;
  }
  return '';
}

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  // "N" anywhere (outside a text field) opens the quick expense entry.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      router.push('/add-expense');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
        <span className="truncate text-[13px] text-muted-foreground">
          SpendWise <span className="px-1 text-subtle">/</span>
          <span className="text-foreground">{titleFor(pathname)}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {pathname !== '/add-expense' && (
          <Link href="/add-expense">
            <Button size="sm" className="gap-1.5">
              <Plus />
              <span className="hidden sm:inline">Add spending</span>
              <Kbd className="ml-0.5 hidden sm:inline-flex">N</Kbd>
            </Button>
          </Link>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
