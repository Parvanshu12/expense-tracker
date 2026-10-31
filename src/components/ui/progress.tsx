import { cn } from '@/lib/utils';

/** Thin progress bar. `tone="danger"` switches to the destructive color (e.g. over budget). */
function Progress({
  value,
  tone = 'default',
  className,
}: {
  value: number;
  tone?: 'default' | 'muted' | 'danger';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          tone === 'danger' ? 'bg-destructive' : tone === 'muted' ? 'bg-chart-3' : 'bg-foreground'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
