import { cn } from '@/lib/utils';

/** Brand mark: an emerald tile with a rising stroke. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex size-6 items-center justify-center rounded-[7px] bg-brand text-brand-foreground', className)}
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
        <path d="M3 11.5 6.5 8l2.5 2.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
