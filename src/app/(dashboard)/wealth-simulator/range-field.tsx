'use client';

import { Label } from '@/components/ui/label';

/** A labelled slider with its current value on the right. */
export function RangeField({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
  minLabel,
  maxLabel,
}: {
  id: string;
  label: React.ReactNode;
  value: number;
  display: React.ReactNode;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: React.ReactNode;
  minLabel?: React.ReactNode;
  maxLabel?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="tabular text-[13px] font-medium text-foreground">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer"
        style={{ accentColor: 'var(--brand)' }}
      />
      <div className="tabular flex justify-between text-xs text-subtle">
        <span>{minLabel ?? min}</span>
        <span>{maxLabel ?? max}</span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
