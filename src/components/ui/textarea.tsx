import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClasses } from './input';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClasses, 'h-auto min-h-20 py-2 resize-none', className)} {...props} />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
