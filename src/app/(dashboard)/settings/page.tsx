'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/components/layout/session-provider';
import { signOut } from '@/lib/auth-client';
import { DataService } from '@/lib/data-service';
import type { Profile } from '@/types/database';

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
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function SaveFooter({ hint, dirty, saving }: { hint: React.ReactNode; dirty: boolean; saving: boolean }) {
  return (
    <CardFooter className="justify-between gap-3 rounded-b-xl bg-muted/40">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <Button type="submit" size="sm" disabled={!dirty} loading={saving}>
        Save
      </Button>
    </CardFooter>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="divide-y divide-border border-t border-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-4 py-8 md:grid-cols-[240px_1fr] md:gap-10">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
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
      toast.error('Monthly income must be a positive number');
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await save(
        { display_name: profileForm.displayName.trim() || null, monthly_income: parsedIncome },
        'Profile saved'
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
        'Preferences saved'
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
    <div className="space-y-8">
      <PageHeader title="Settings" description="Manage your profile, preferences and account." />

      <div className="divide-y divide-border border-t border-border">
        <Section title="Profile" description="Your name appears in the sidebar. Income is used for savings and budget insights.">
          <Card>
            <form onSubmit={handleSaveProfile}>
              <CardContent className="space-y-5 pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-medium text-background">
                    {initials(profileForm.displayName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {profileForm.displayName.trim() || 'Unnamed'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sandbox ? 'Demo account' : user?.email}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Display name" htmlFor="display-name">
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
                    label="Monthly income"
                    htmlFor="monthly-income"
                    hint={`In ${savedPrefsForm?.currency ?? prefsForm.currency}, after tax.`}
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
              </CardContent>
              <SaveFooter hint="Leave income empty if you'd rather not say." dirty={profileDirty} saving={savingProfile} />
            </form>
          </Card>
        </Section>

        <Section title="Preferences" description="Currency, time zone and the language the assistant replies in." delay={40}>
          <Card>
            <form onSubmit={handleSavePrefs}>
              <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
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
                <Field label="Time zone" htmlFor="timezone" hint="Used to decide which day an expense falls on.">
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
              </CardContent>
              <SaveFooter hint="Applies across the dashboard." dirty={prefsDirty} saving={savingPrefs} />
            </form>
          </Card>
        </Section>

        <Section title="Appearance" description="Choose a theme, or follow your system setting." delay={80}>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="text-[13px] font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">Saved on this device.</p>
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
            </CardContent>
          </Card>
        </Section>

        <Section
          title="Account"
          description={sandbox ? 'You are trying SpendWise in demo mode.' : 'The email you sign in with.'}
          delay={120}
        >
          <Card>
            {sandbox ? (
              <>
                <CardContent className="space-y-1 pt-5">
                  <p className="text-sm font-medium text-foreground">Demo mode</p>
                  <p className="text-[13px] text-muted-foreground">
                    Demo data is stored only in this browser. Create an account to keep your data and use it on
                    any device.
                  </p>
                </CardContent>
                <CardFooter className="flex-wrap justify-end gap-2 rounded-b-xl bg-muted/40">
                  <Button variant="ghost" size="sm" onClick={handleSignOut} loading={signingOut}>
                    <LogOut aria-hidden />
                    Exit demo
                  </Button>
                  <a
                    href="/login"
                    className={buttonVariants({ size: 'sm' })}
                    onClick={(e) => {
                      e.preventDefault();
                      void handleSignOut();
                    }}
                  >
                    Create a real account
                  </a>
                </CardFooter>
              </>
            ) : (
              <>
                <CardContent className="pt-5">
                  <Field label="Email" htmlFor="account-email">
                    <Input id="account-email" value={user?.email ?? ''} readOnly disabled />
                  </Field>
                </CardContent>
                <CardFooter className="justify-between gap-3 rounded-b-xl bg-muted/40">
                  <p className="text-xs text-muted-foreground">Signing out ends this session on this device.</p>
                  <Button variant="outline" size="sm" onClick={handleSignOut} loading={signingOut}>
                    <LogOut aria-hidden />
                    Sign out
                  </Button>
                </CardFooter>
              </>
            )}
          </Card>
        </Section>

        <Section title="Danger zone" description="Irreversible actions." delay={160}>
          <Card className="border-destructive/30">
            <CardContent className="space-y-1 pt-5">
              <p className="text-sm font-medium text-destructive">Delete account</p>
              <p className="text-[13px] text-muted-foreground">
                {sandbox
                  ? "Demo data lives only in this browser. Clearing this site's data in your browser settings removes it permanently."
                  : 'Account deletion is not self-serve yet. To permanently remove your account and all of its data, contact support.'}
              </p>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  );
}
