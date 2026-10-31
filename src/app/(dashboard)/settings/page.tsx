'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/components/layout/session-provider';
import { signOut } from '@/lib/auth-client';
import { DataService } from '@/lib/data-service';
import type { Profile } from '@/types/database';
import { MAIN_GOALS } from '@/lib/main-goals';
import { USER_TYPES } from '@/lib/user-types';
import { cn } from '@/lib/utils';

type ThemeChoice = 'light' | 'dark' | 'system';

interface ProfileForm {
  displayName: string;
  monthlyIncome: string;
}

interface PreferencesForm {
  currency: string;
  timezone: string;
  language: string;
}

const CURRENCIES = [
  { value: 'INR', label: 'INR — Indian rupee' },
  { value: 'USD', label: 'USD — US dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British pound' },
  { value: 'AED', label: 'AED — UAE dirham' },
  { value: 'SGD', label: 'SGD — Singapore dollar' },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
  { value: 'Europe/London', label: 'Europe/London (UK)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hinglish', label: 'Hinglish (Hindi + English)' },
];

const subscribeNoop = () => () => {};

/** True after hydration; false during SSR and the hydration pass. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

function toProfileForm(p: Profile): ProfileForm {
  return { displayName: p.display_name || '', monthlyIncome: p.monthly_income ? String(p.monthly_income) : '' };
}

function toPreferencesForm(p: Profile): PreferencesForm {
  return { currency: p.currency || 'INR', timezone: p.timezone || 'Asia/Kolkata', language: p.language || 'en' };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SW';
  return parts
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function Section({
  title,
  description,
  children,
  delay,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <section
      className="grid animate-rise gap-4 py-8 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-10"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="space-y-1">
        <h2 className="text-[15px] font-medium tracking-[-0.01em] text-foreground">{title}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Hint on the left, save button aligned right, directly under the fields. */
function SaveFooter({ hint, dirty, saving }: { hint?: React.ReactNode; dirty: boolean; saving: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-6">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <Button type="submit" disabled={!dirty} loading={saving}>
        Save changes
      </Button>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="divide-y divide-border border-t border-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-4 py-8 md:grid-cols-[240px_1fr] md:gap-10">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-44" />
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
              <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Who you are and what you want help with; shapes the assistant's questions and tips. */
function SituationCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [userType, setUserType] = useState<string>(profile.user_type ?? '');
  const [goals, setGoals] = useState<string[]>(profile.main_goals ?? []);
  const [saving, setSaving] = useState(false);
  const dirty =
    userType !== (profile.user_type ?? '') || [...goals].sort().join() !== [...(profile.main_goals ?? [])].sort().join();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await DataService.updateProfile({ user_type: userType || null, main_goals: goals });
      onSaved(updated);
      toast.success('Changes saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      <div className="space-y-6">
        <Field label="Which best describes you?" htmlFor="user-type" className="sm:max-w-[calc(50%-0.5rem)]">
          <Select id="user-type" value={userType} onChange={(e) => setUserType(e.target.value)}>
            <option value="">Prefer not to say</option>
            {USER_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[13px] font-medium">What would you like help with?</legend>
          <div className="-mx-2 grid gap-x-4 sm:grid-cols-2">
            {MAIN_GOALS.map((g) => {
              const on = goals.includes(g.id);
              return (
                <label
                  key={g.id}
                  className={cn(
                    'flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-foreground/[0.025]',
                    on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setGoals((prev) => (on ? prev.filter((x) => x !== g.id) : [...prev, g.id]))}
                    className="size-4 shrink-0 accent-[var(--brand)]"
                  />
                  {g.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
      <SaveFooter dirty={dirty} saving={saving} />
    </form>
  );
}

export default function SettingsPage() {
  const { user, refresh } = useSession();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>({ displayName: '', monthlyIncome: '' });
  const [prefsForm, setPrefsForm] = useState<PreferencesForm>({
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    language: 'en',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const prof = await DataService.getProfile();
        if (cancelled) return;
        setSaved(prof);
        setProfileForm(toProfileForm(prof));
        setPrefsForm(toPreferencesForm(prof));
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Could not load your profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const savedProfileForm = saved ? toProfileForm(saved) : null;
  const savedPrefsForm = saved ? toPreferencesForm(saved) : null;
  const profileDirty =
    !savedProfileForm ||
    savedProfileForm.displayName !== profileForm.displayName ||
    savedProfileForm.monthlyIncome !== profileForm.monthlyIncome;
  const prefsDirty =
    !savedPrefsForm ||
    savedPrefsForm.currency !== prefsForm.currency ||
    savedPrefsForm.timezone !== prefsForm.timezone ||
    savedPrefsForm.language !== prefsForm.language;

  async function save(patch: Partial<Profile>, successMessage: string) {
    const updated = await DataService.updateProfile(patch);
    setSaved(updated);
    toast.success(successMessage);
    void refresh();
    return updated;
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const income = profileForm.monthlyIncome.trim();
    const parsedIncome = income ? Number(income) : null;
    if (parsedIncome !== null && (!Number.isFinite(parsedIncome) || parsedIncome < 0)) {
      toast.error('Please enter your monthly income as a number, or leave it empty.');
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await save(
        { display_name: profileForm.displayName.trim() || null, monthly_income: parsedIncome },
        'Your details are saved'
      );
      setProfileForm(toProfileForm(updated));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      const updated = await save(
        { currency: prefsForm.currency, timezone: prefsForm.timezone, language: prefsForm.language },
        'Your preferences are saved'
      );
      setPrefsForm(toPreferencesForm(updated));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
      toast.error('Could not sign out. Please try again.');
    }
  };

  if (loading) return <SettingsSkeleton />;

  const sandbox = Boolean(user?.sandbox);
  const themeValue: ThemeChoice =
    mounted && (theme === 'light' || theme === 'dark' || theme === 'system') ? theme : 'system';

  return (
    <div className="space-y-10">
      <PageHeader title="Settings" description="Your details, how things look, and your account." />

      <div className="divide-y divide-border border-t border-border">
        <Section
          title="About you"
          description="We show your name in the menu. Your income helps us work out how much you're saving."
        >
          <form onSubmit={handleSaveProfile}>
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[13px] font-semibold text-brand">
                  {initials(profileForm.displayName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {profileForm.displayName.trim() || 'Add your name'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {sandbox ? 'Demo account' : user?.email}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name" htmlFor="display-name">
                  <Input
                    id="display-name"
                    autoComplete="name"
                    maxLength={60}
                    placeholder="Your name"
                    value={profileForm.displayName}
                    onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))}
                  />
                </Field>
                <Field
                  label="Money in each month"
                  htmlFor="monthly-income"
                  hint={`Your take-home pay in ${savedPrefsForm?.currency ?? prefsForm.currency}, after tax.`}
                >
                  <Input
                    id="monthly-income"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="85000"
                    className="tabular"
                    value={profileForm.monthlyIncome}
                    onChange={(e) => setProfileForm((f) => ({ ...f, monthlyIncome: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
            <SaveFooter
              hint="You can leave income empty if you'd rather not say."
              dirty={profileDirty}
              saving={savingProfile}
            />
          </form>
        </Section>

        {saved && (
          <Section
            title="Your situation"
            description="Tell us a little about your life so the questions, tips and advice fit you."
            delay={20}
          >
            <SituationCard
              key={saved.updated_at}
              profile={saved}
              onSaved={(p) => {
                setSaved(p);
                void refresh();
              }}
            />
          </Section>
        )}

        <Section
          title="Preferences"
          description="Your currency, your time zone, and the language the assistant talks to you in."
          delay={40}
        >
          <form onSubmit={handleSavePrefs}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency" htmlFor="currency">
                <Select
                  id="currency"
                  value={prefsForm.currency}
                  onChange={(e) => setPrefsForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Time zone" htmlFor="timezone" hint="So expenses land on the right day.">
                <Select
                  id="timezone"
                  value={prefsForm.timezone}
                  onChange={(e) => setPrefsForm((f) => ({ ...f, timezone: e.target.value }))}
                >
                  {TIMEZONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Language" htmlFor="language" className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                <Select
                  id="language"
                  value={prefsForm.language}
                  onChange={(e) => setPrefsForm((f) => ({ ...f, language: e.target.value }))}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <SaveFooter hint="Changes apply everywhere in the app." dirty={prefsDirty} saving={savingPrefs} />
          </form>
        </Section>

        <Section title="Look and feel" description="Pick light or dark, or match your device." delay={80}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="text-[13px] text-muted-foreground">Remembered on this device.</p>
            </div>
            <Segmented<ThemeChoice>
              value={themeValue}
              onChange={setTheme}
              options={[
                { value: 'light', label: <><Sun aria-hidden />Light</> },
                { value: 'dark', label: <><Moon aria-hidden />Dark</> },
                { value: 'system', label: <><Monitor aria-hidden />System</> },
              ]}
            />
          </div>
        </Section>

        <Section
          title="Account"
          description={sandbox ? "You're trying SpendWise with sample data." : 'The email you sign in with.'}
          delay={120}
        >
          {sandbox ? (
            <div className="space-y-6">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">You&apos;re in demo mode</p>
                <p className="text-[13px] text-muted-foreground">
                  Everything here is saved only in this browser. Create a free account to keep your data and use it on
                  any device.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={handleSignOut} loading={signingOut}>
                  <LogOut aria-hidden />
                  Leave demo
                </Button>
                <a
                  href="/login"
                  className={buttonVariants()}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleSignOut();
                  }}
                >
                  Create an account
                </a>
              </div>
            </div>
          ) : (
            <div>
              <Field label="Email" htmlFor="account-email" className="sm:max-w-[calc(50%-0.5rem)]">
                <Input id="account-email" value={user?.email ?? ''} readOnly disabled />
              </Field>
              <div className="flex items-center justify-between gap-3 pt-6">
                <p className="text-xs text-muted-foreground">You&apos;ll need to sign in again on this device.</p>
                <Button variant="outline" onClick={handleSignOut} loading={signingOut}>
                  <LogOut aria-hidden />
                  Sign out
                </Button>
              </div>
            </div>
          )}
        </Section>

        <Section title="Delete account" description="Things that can't be undone." delay={160}>
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Delete your account</p>
            <p className="max-w-lg text-[13px] text-muted-foreground">
              {sandbox
                ? "Demo data lives only in this browser. To remove it for good, clear this site's data in your browser settings."
                : "You can't delete your account from here yet. To remove your account and all of its data for good, please contact support."}
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
