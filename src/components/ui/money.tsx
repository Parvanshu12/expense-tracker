import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'text-sm',
  md: 'text-[15px]',
  lg: 'text-xl',
  xl: 'text-[28px] leading-none tracking-[-0.02em]',
  hero: 'font-display text-[56px] leading-[0.95] tracking-[-0.01em] sm:text-[68px]',
} as const;

/**
 * An amount with the paise set smaller and raised (₹53,335⁰⁰), tabular figures,
 * and an optional sign/tone. Use it for every money figure so they all read alike.
 */
function Money({
  amount,
  size = 'md',
  tone = 'default',
  sign = 'none',
  decimals = true,
  currency = 'INR',
  className,
}: {
  amount: number;
  size?: keyof typeof SIZES;
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'brand';
  /** "plus" prefixes positive amounts with +, "minus" always shows −. */
  sign?: 'none' | 'plus' | 'minus';
  decimals?: boolean;
  currency?: string;
  className?: string;
}) {
  const abs = Math.abs(amount);
  const parts = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).formatToParts(abs);
  const fraction = parts.find((p) => p.type === 'fraction')?.value;
  const whole = parts
    .filter((p) => p.type !== 'fraction' && p.type !== 'decimal')
    .map((p) => p.value)
    .join('');
  const prefix = sign === 'minus' || amount < 0 ? '−' : sign === 'plus' && amount > 0 ? '+' : '';

  return (
    <span
      className={cn(
        'tabular inline-flex items-baseline whitespace-nowrap',
        SIZES[size],
        {
          default: 'text-foreground',
          muted: 'text-muted-foreground',
          success: 'text-success',
          warning: 'text-warning',
          danger: 'text-destructive',
          brand: 'text-brand',
        }[tone],
        className
      )}
    >
      {prefix}
      {whole}
      {fraction && (
        <span className={cn('ml-px self-start opacity-50', size === 'hero' ? 'mt-1.5 text-[0.42em]' : 'mt-[0.12em] text-[0.62em]')}>
          {fraction}
        </span>
      )}
    </span>
  );
}

export { Money };
