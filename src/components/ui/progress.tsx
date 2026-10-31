import { cn } from '@/lib/utils';

/** Thin progress bar. Tone carries meaning: success (on track), warning (getting close), danger (over). */
function Progress({
  value,
  tone = 'default',
  className,
}: {
  value: number;
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.07]', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          {
            default: 'bg-brand',
            muted: 'bg-chart-3',
            success: 'bg-success',
            warning: 'bg-warning',
            danger: 'bg-destructive',
          }[tone]
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
