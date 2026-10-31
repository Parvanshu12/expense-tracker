'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field, Label } from '@/components/ui/label';
import { Logo } from '@/components/layout/logo';
import { DataService } from '@/lib/data-service';
import { MAIN_GOALS, type MainGoalId } from '@/lib/main-goals';
import { USER_TYPES, type UserTypeId } from '@/lib/user-types';
import { toLocalDateString } from '@/lib/calculations/finance';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const LANGUAGES = [
  { id: 'en', label: 'English', hint: 'Standard English' },
  { id: 'hinglish', label: 'Hinglish', hint: 'Hindi and English mix' },
];

const STEP_NAMES = ['Basics', 'Money'];

/** Selectable row: a radio for single choices, a checkbox when `multiple`. */
function Choice({
  selected,
  onSelect,
  label,
  hint,
  multiple,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  multiple?: boolean;
}) {
  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors',
        selected ? 'border-brand bg-brand/5' : 'border-border hover:border-foreground/20 hover:bg-foreground/[0.02]'
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center border transition-colors',
          multiple ? 'rounded-[4px]' : 'rounded-full',
          selected ? 'border-brand bg-brand text-brand-foreground' : 'border-input bg-card'
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
  const [mainGoals, setMainGoals] = useState<MainGoalId[]>(['track_expenses']);
  const [goalsTouched, setGoalsTouched] = useState(false);
  const [userType, setUserType] = useState<UserTypeId | null>(null);
  const toggleGoal = (id: MainGoalId) => {
    setGoalsTouched(true);
    setMainGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };
  const chooseUserType = (id: UserTypeId) => {
    setUserType(id);
    // Suggest goals that usually fit, unless the user already picked their own.
    if (!goalsTouched) setMainGoals([...(USER_TYPES.find((t) => t.id === id)?.goals ?? ['track_expenses'])]);
  };
  const incomeLabel =
    userType === 'student'
      ? 'Pocket money or allowance each month'
      : userType === 'business' || userType === 'freelancer'
        ? 'Roughly what you earn in a month'
        : userType === 'retired'
          ? 'Pension or income each month'
          : 'Monthly income';

  const handleFinish = async () => {
    setLoading(true);
    try {
      await DataService.updateProfile({
        display_name: displayName || 'SpendWise User',
        currency,
        timezone,
        language,
        monthly_income: monthlyIncome ? parseFloat(monthlyIncome) : null,
        main_goals: mainGoals,
        user_type: userType,
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

      // An emergency fund is concrete enough to set up as a savings goal straight away.
      if (mainGoals.includes('emergency_fund')) {
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
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <span className="flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">SpendWise</span>
        </span>
        <Link
          href="/dashboard"
          className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip for now
        </Link>
      </header>

      <main className="flex flex-1 justify-center px-5 pt-[6vh] pb-16">
        <div className="w-full max-w-[520px]">
          {/* Step indicator */}
          <div className="animate-rise space-y-2.5">
            <div className="flex gap-1.5" aria-hidden>
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={cn('h-[3px] flex-1 rounded-full transition-colors duration-300', s <= step ? 'bg-brand' : 'bg-foreground/[0.08]')}
                />
              ))}
            </div>
            <p className="tabular text-[13px] text-muted-foreground">
              Step {step} of 2 · {STEP_NAMES[step - 1]}
            </p>
          </div>

          <div key={step} className="animate-rise mt-10" style={{ animationDelay: '40ms' }}>
            {step === 1 ? (
              <>
                <div className="space-y-2">
                  <h1 className="font-display text-[38px] leading-[1.02] tracking-[-0.01em] sm:text-[44px]">The basics</h1>
                  <p className="text-sm text-muted-foreground">How you’d like amounts, dates and replies shown.</p>
                </div>

                <div className="mt-9 space-y-8">
                  <Field label="What should we call you?" htmlFor="display-name">
                    <Input
                      id="display-name"
                      type="text"
                      autoComplete="given-name"
                      placeholder="e.g. Priya"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="h-10"
                    />
                  </Field>

                  <div className="flex flex-col gap-1.5">
                    <Label id="type-label">Which best describes you?</Label>
                    <p className="text-xs text-muted-foreground">So the tips and questions fit your life.</p>
                    <div role="radiogroup" aria-labelledby="type-label" className="mt-1.5 grid gap-2 sm:grid-cols-2">
                      {USER_TYPES.map((t) => (
                        <Choice
                          key={t.id}
                          selected={userType === t.id}
                          onSelect={() => chooseUserType(t.id)}
                          label={t.label}
                          hint={t.hint}
                        />
                      ))}
                    </div>
                  </div>

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
                    <p className="text-xs text-muted-foreground">Used for the interface and the money coach.</p>
                    <div role="radiogroup" aria-labelledby="language-label" className="mt-1.5 grid grid-cols-2 gap-2">
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
                  </div>
                </div>

                <div className="mt-10 flex justify-end border-t border-border pt-6">
                  <Button size="lg" onClick={() => setStep(2)}>
                    Continue
                    <ArrowRight />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h1 className="font-display text-[38px] leading-[1.02] tracking-[-0.01em] sm:text-[44px]">Your money</h1>
                  <p className="text-sm text-muted-foreground">All optional. You can change these any time in Settings.</p>
                </div>

                <div className="mt-9 space-y-8">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={incomeLabel} htmlFor="income" hint="A rough number is fine. It helps us tell how you are doing.">
                      <Input
                        id="income"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="75000"
                        className="tabular h-10"
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
                        className="tabular h-10"
                        value={monthlyBudget}
                        onChange={(e) => setMonthlyBudget(e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label id="goal-label">What would you like help with?</Label>
                    <p className="text-xs text-muted-foreground">Pick as many as you like.</p>
                    <div role="group" aria-labelledby="goal-label" className="mt-1.5 flex flex-col gap-2">
                      {MAIN_GOALS.map((g) => (
                        <Choice
                          key={g.id}
                          multiple
                          selected={mainGoals.includes(g.id)}
                          onSelect={() => toggleGoal(g.id)}
                          label={g.label}
                        />
                      ))}
                    </div>
                    {mainGoals.includes('emergency_fund') && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        We’ll create a savings goal for six months of income.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
                  <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                    <ArrowLeft />
                    Back
                  </Button>
                  <Button size="lg" onClick={handleFinish} loading={loading}>
                    {loading ? 'Saving' : 'Finish setup'}
                    {!loading && <ArrowRight />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
