import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
        // Status levels, distinguished by weight rather than hue.
        success: 'border-border bg-card text-foreground',
        warning: 'border-foreground/25 bg-secondary text-foreground',
        // Essentiality: solid -> soft -> outlined.
        essential: 'border-transparent bg-foreground text-background',
        optimizable: 'border-transparent bg-secondary text-foreground',
        discretionary: 'border-dashed border-foreground/35 text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'secondary' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
