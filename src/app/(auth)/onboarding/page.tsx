'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Globe, DollarSign, Clock, Wallet, Target, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { DataService } from '@/lib/data-service';
import { toLocalDateString } from '@/lib/calculations/finance';
import { toast } from 'sonner';

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

      toast.success('Your preferences have been saved!');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences');
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#090d16] px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Header Indicator */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome to SpendWise AI
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Let&apos;s personalize your financial workspace.
          </p>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 pt-2">
            <div className={`h-2 rounded-full transition-all ${step === 1 ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-300 dark:bg-slate-700'}`} />
            <div className={`h-2 rounded-full transition-all ${step === 2 ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-300 dark:bg-slate-700'}`} />
          </div>
        </div>

        <Card className="shadow-lg border-slate-200/80 dark:border-slate-800">
          {step === 1 && (
            <div>
              <CardHeader>
                <CardTitle className="text-lg">Step 1: Regional & Display Settings</CardTitle>
                <CardDescription>
                  Configure your primary currency and time localization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    What should we call you?
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Priya or Akshay"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                      Preferred Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="INR">₹ INR (Indian Rupee)</option>
                      <option value="USD">$ USD (US Dollar)</option>
                      <option value="EUR">€ EUR (Euro)</option>
                      <option value="GBP">£ GBP (British Pound)</option>
                      <option value="AED">AED (UAE Dirham)</option>
                      <option value="SGD">S$ SGD (Singapore Dollar)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT +8)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-slate-500" />
                    Preferred AI & Interface Language
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`p-3 rounded-lg border text-left flex items-center justify-between text-xs font-medium transition-all ${
                        language === 'en'
                          ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">English</div>
                        <div className="text-[11px] text-slate-500">Standard English interface</div>
                      </div>
                      {language === 'en' && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setLanguage('hinglish')}
                      className={`p-3 rounded-lg border text-left flex items-center justify-between text-xs font-medium transition-all ${
                        language === 'hinglish'
                          ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">Hinglish</div>
                        <div className="text-[11px] text-slate-500">Natural Hindi + English mix</div>
                      </div>
                      {language === 'hinglish' && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
                    </button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end pt-2">
                <Button onClick={() => setStep(2)} className="gap-2">
                  Next Step
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </div>
          )}

          {step === 2 && (
            <div>
              <CardHeader>
                <CardTitle className="text-lg">Step 2: Financial Goals & Targets (Optional)</CardTitle>
                <CardDescription>
                  All inputs below are strictly optional. You can change them anytime in Settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-slate-500" />
                      Approx Monthly Income (Optional)
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g. 75000"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-500">Used for actual savings calculations</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                      Target Monthly Budget (Optional)
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g. 50000"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-500">Generates 75% & 90% utilization alerts</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-slate-500" />
                    Primary Financial Objective
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'track_expenses', label: 'Understand where my money goes each month' },
                      { id: 'cut_unnecessary', label: 'Identify and reduce unnecessary/optimizable leaks' },
                      { id: 'emergency_fund', label: 'Build a solid 6-month emergency reserve fund' },
                      { id: 'grow_wealth', label: 'Simulate and maximize long-term compound savings' },
                    ].map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setPrimaryGoal(g.id)}
                        className={`p-3 rounded-lg border text-left text-xs font-medium flex items-center justify-between transition-all ${
                          primaryGoal === g.id
                            ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{g.label}</span>
                        {primaryGoal === g.id && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={handleFinish} disabled={loading} className="gap-2 bg-indigo-600">
                  {loading ? 'Saving...' : 'Finish & Go to Dashboard'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
