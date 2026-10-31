import { cn } from '@/lib/utils';

/** One figure in a MetricStrip: small label, value, optional footnote. */
function Metric({
  label,
  value,
  hint,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5 py-1 sm:px-5 sm:first:pl-0', className)}>
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground [&_svg]:size-3.5">{label}</div>
      <div className="text-[22px] font-medium leading-none tracking-[-0.02em]">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * A row of figures separated by hairlines instead of boxes (2 columns on
 * phones, up to 4 on wide screens).
 */
function MetricStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-border', className)}>
      {children}
    </div>
  );
}

export { Metric, MetricStrip };
