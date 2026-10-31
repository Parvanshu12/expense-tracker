'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field, Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Logo } from '@/components/layout/logo';
import { DataService } from '@/lib/data-service';
import { toLocalDateString } from '@/lib/calculations/finance';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const LANGUAGES = [
  { id: 'en', label: 'English', hint: 'Standard English' },
  { id: 'hinglish', label: 'Hinglish', hint: 'Hindi and English mix' },
];

const GOALS = [
  { id: 'track_expenses', label: 'Understand where my money goes' },
  { id: 'cut_unnecessary', label: 'Cut spending I don’t need' },
  { id: 'emergency_fund', label: 'Build a 6-month emergency fund' },
  { id: 'grow_wealth', label: 'Grow my long-term savings' },
];

/** Selectable row used for language and goal choices. */
function Choice({
  selected,
  onSelect,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected ? 'border-foreground bg-accent/60' : 'border-border bg-card hover:bg-accent/50'
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-foreground bg-foreground text-background' : 'border-input'
        )}
      >
        {selected && <Check className="size-2.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [language, setLanguage] = useState('en');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [monthlyBudget, setMonthlyBudget] = useState<string>('');
  const [primaryGoal, setPrimaryGoal] = useState<string>('track_expenses');

  const handleFinish = async () => {
    setLoading(true);
    try {
      await DataService.updateProfile({
        display_name: displayName || 'SpendWise User',
        currency,
        timezone,
        language,
        monthly_income: monthlyIncome ? parseFloat(monthlyIncome) : null,
      });

      if (monthlyBudget) {
        await DataService.saveBudget({
          user_id: 'current-user',
          category_id: null, // Overall monthly budget
          amount: parseFloat(monthlyBudget),
          period_type: 'monthly',
          start_date: toLocalDateString(),
          end_date: null,
          alert_thresholds: [75, 90, 100],
        });
      }

      // If user selected emergency fund or specific goal
      if (primaryGoal === 'emergency_fund') {
        await DataService.addGoal({
          user_id: 'current-user',
          name: 'Emergency Reserve Fund',
          target_amount: monthlyIncome ? parseFloat(monthlyIncome) * 6 : 100000,
          current_amount: 0,
          target_date: toLocalDateString(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
          description: '6 months emergency cushion',
        });
      }

      toast.success('You’re all set');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save your preferences');
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10 sm:justify-center sm:py-16">
      <div className="w-full max-w-md">
        <div className="animate-rise flex flex-col items-center text-center">
          <Logo className="size-8 rounded-[9px]" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">Set up SpendWise</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">A few details so your numbers make sense.</p>
        </div>

        {/* Step indicator */}
        <div className="animate-rise mt-8" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground tabular">Step {step} of 2</span>
            <span className="text-muted-foreground">{step === 1 ? 'Basics' : 'Money'}</span>
          </div>
          <div className="mt-2 flex gap-1.5" aria-hidden>
            {[1, 2].map((s) => (
              <div
                key={s}
                className={cn('h-1 flex-1 rounded-full transition-colors', s <= step ? 'bg-foreground' : 'bg-border')}
              />
            ))}
          </div>
        </div>

        <Card className="animate-rise mt-4" style={{ animationDelay: '120ms' }}>
          {step === 1 ? (
            <>
              <CardHeader>
                <CardTitle className="text-base">The basics</CardTitle>
                <CardDescription>How you’d like amounts, dates and replies shown.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="What should we call you?" htmlFor="display-name">
                  <Input
                    id="display-name"
                    type="text"
                    autoComplete="given-name"
                    placeholder="e.g. Priya"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Currency" htmlFor="currency">
                    <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option value="INR">₹ INR, Indian rupee</option>
                      <option value="USD">$ USD, US dollar</option>
                      <option value="EUR">€ EUR, Euro</option>
                      <option value="GBP">£ GBP, British pound</option>
                      <option value="AED">AED, UAE dirham</option>
                      <option value="SGD">S$ SGD, Singapore dollar</option>
                    </Select>
                  </Field>

                  <Field label="Timezone" htmlFor="timezone">
                    <Select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (ET)</option>
                      <option value="Europe/London">Europe/London (UK)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                    </Select>
                  </Field>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label id="language-label">Language</Label>
                  <div role="radiogroup" aria-labelledby="language-label" className="grid grid-cols-2 gap-2">
                    {LANGUAGES.map((l) => (
                      <Choice
                        key={l.id}
                        selected={language === l.id}
                        onSelect={() => setLanguage(l.id)}
                        label={l.label}
                        hint={l.hint}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Used for the interface and the money coach.</p>
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button onClick={() => setStep(2)}>
                  Continue
                  <ArrowRight />
                </Button>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-base">Your money</CardTitle>
                <CardDescription>All optional. You can change these any time in Settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Monthly income" htmlFor="income" hint="Used to work out your savings rate.">
                    <Input
                      id="income"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="75000"
                      className="tabular"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                    />
                  </Field>

                  <Field label="Monthly budget" htmlFor="budget" hint="Alerts at 75%, 90% and 100%.">
                    <Input
                      id="budget"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="50000"
                      className="tabular"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label id="goal-label">Main goal</Label>
                  <div role="radiogroup" aria-labelledby="goal-label" className="flex flex-col gap-2">
                    {GOALS.map((g) => (
                      <Choice
                        key={g.id}
                        selected={primaryGoal === g.id}
                        onSelect={() => setPrimaryGoal(g.id)}
                        label={g.label}
                      />
                    ))}
                  </div>
                  {primaryGoal === 'emergency_fund' && (
                    <p className="text-xs text-muted-foreground">
                      We’ll create a savings goal for six months of income.
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="justify-between">
                <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                  <ArrowLeft />
                  Back
                </Button>
                <Button onClick={handleFinish} loading={loading}>
                  {loading ? 'Saving' : 'Finish setup'}
                  {!loading && <ArrowRight />}
                </Button>
              </CardFooter>
            </>
          )}
        </Card>

        <div className="mt-6 text-center">
          <Link
            href="/dashboard"
            className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip for now
          </Link>
        </div>
      </div>
    </div>
  );
}
