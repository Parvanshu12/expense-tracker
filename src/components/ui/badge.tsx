import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-indigo-600 text-white hover:bg-indigo-700',
        secondary:
          'border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
        destructive:
          'border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
        outline: 'text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
        success:
          'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        warning:
          'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        essential:
          'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
        optimizable:
          'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        discretionary:
          'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
