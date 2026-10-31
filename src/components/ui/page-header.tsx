import { cn } from '@/lib/utils';

/** Page title in the display serif, a one-line description, actions on the right. */
function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small line above the title, e.g. a date. */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="text-[13px] text-muted-foreground">{eyebrow}</p>}
        <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.01em] text-foreground sm:text-[40px]">{title}</h1>
        {description && <p className="max-w-xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export { PageHeader };
