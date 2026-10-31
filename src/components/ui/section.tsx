import { cn } from '@/lib/utils';

/**
 * A titled area of a page with no box around it: heading row, then content.
 * Separate sections with space (and an optional hairline), not containers.
 */
function Section({
  title,
  description,
  action,
  children,
  className,
  divided,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Draw a hairline above the section. */
  divided?: boolean;
}) {
  return (
    <section className={cn('space-y-4', divided && 'border-t border-border pt-8', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            {title && <h2 className="text-[15px] font-medium tracking-[-0.01em] text-foreground">{title}</h2>}
            {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export { Section };
