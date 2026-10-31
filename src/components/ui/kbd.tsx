import { cn } from '@/lib/utils';

function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-current/20 px-1 font-mono text-[10px] font-medium opacity-70',
        className
      )}
    >
      {children}
    </kbd>
  );
}

export { Kbd };
