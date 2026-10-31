import { cn } from '@/lib/utils';

/** KPI tile: small label, large tabular figure, optional footnote and trailing slot. */
function Stat({
  label,
  value,
  hint,
  icon,
  children,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card', className)}>
      <div className="flex items-center justify-between text-[13px] text-muted-foreground [&_svg]:size-4">
        <span>{label}</span>
        {icon}
      </div>
      <div className="tabular text-2xl font-semibold tracking-[-0.02em] text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

export { Stat };
