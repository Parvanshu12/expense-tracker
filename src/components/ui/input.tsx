import * as React from 'react';
import { cn } from '@/lib/utils';

export const fieldClasses =
  'flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-card transition-[border-color,box-shadow] placeholder:text-subtle hover:border-foreground/20 focus-visible:outline-none focus-visible:border-foreground/40 focus-visible:ring-4 focus-visible:ring-foreground/[0.06] disabled:cursor-not-allowed disabled:opacity-50';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn(fieldClasses, 'py-2', className)} ref={ref} {...props} />
));
Input.displayName = 'Input';

export { Input };
