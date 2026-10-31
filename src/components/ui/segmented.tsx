'use client';

import { cn } from '@/lib/utils';

/** Pill-style segmented control for small option sets (periods, modes, tabs). */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'default',
  variant = 'pill',
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: 'default' | 'sm';
  /** "underline" reads as page tabs (Mercury/Stripe style); "pill" as a compact toggle. */
  variant?: 'pill' | 'underline';
}) {
  if (variant === 'underline') {
    return (
      <div role="tablist" className={cn('flex items-center gap-5 border-b border-border', className)}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 text-[13px] font-medium transition-colors [&_svg]:size-3.5',
                active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div
      role="tablist"
      className={cn('inline-flex items-center gap-0.5 rounded-full bg-foreground/[0.05] p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all [&_svg]:size-3.5',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              active
                ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented };
