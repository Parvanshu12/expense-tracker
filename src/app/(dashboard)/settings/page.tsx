'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Globe,
  DollarSign,
  Clock,
  Sparkles,
  ShieldCheck,
  LogOut,
  Save,
  CheckCircle2,
  Database,
  Moon,
  Sun,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataService } from '@/lib/data-service';
import { Profile } from '@/types/database';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/client';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(false);

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [language, setLanguage] = useState('en');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const prof = await DataService.getProfile();
        if (prof) {
          setDisplayName(prof.display_name || '');
          setCurrency(prof.currency || 'INR');
          setTimezone(prof.timezone || 'Asia/Kolkata');
          setLanguage(prof.language || 'en');
          if (prof.monthly_income) setMonthlyIncome(prof.monthly_income.toString());
        }
        setSupabaseReady(isSupabaseConfigured());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await DataService.updateProfile({
        display_name: displayName,
        currency,
        timezone,
        language,
        monthly_income: monthlyIncome ? parseFloat(monthlyIncome) : null,
      });
      toast.success('Preferences updated successfully!');
    } catch {
      toast.error('Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      // Clear demo session cookie first
      document.cookie = 'spendwise_demo_session=; path=/; max-age=0';
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        if (supabase) await supabase.auth.signOut();
      }
      toast.success('Signed out');
      window.location.href = '/login';
    } catch {
      document.cookie = 'spendwise_demo_session=; path=/; max-age=0';
      window.location.href = '/login';
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile & Regional Settings */}
      <Card>
        <form onSubmit={handleSavePreferences}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-600" />
                  Profile & Localization Preferences
                </CardTitle>
                <CardDescription className="text-xs">
                  Customize your name, reporting currency, and timezone
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {language === 'hinglish' ? 'Hinglish Mode' : 'English Mode'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar Preview */}
            <div className="flex items-center gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="h-12 w-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-base font-bold">
                {displayName
                  ? displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().substring(0, 2)
                  : 'SW'}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{displayName || 'SpendWise User'}</p>
                <p className="text-xs text-slate-500">Update your display name to personalize the app</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Display Name
                </label>
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Monthly Baseline Income (₹ INR)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 85000"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                  Primary Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
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
                  className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-slate-500" />
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="en">English (Default)</option>
                  <option value="hinglish">Hinglish (Hindi + English)</option>
                </select>
              </div>
            </div>

            {/* Theme switcher */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Interface Theme
              </label>
              <div className="grid grid-cols-3 gap-3 max-w-sm">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    theme === 'light'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 text-indigo-600'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    theme === 'dark'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 text-indigo-400'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    theme === 'system'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 text-indigo-400'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>System</span>
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-4">
            <span className="text-[11px] text-slate-500">
              Changes reflect immediately on your dashboard.
            </span>
            <Button type="submit" variant="ai" disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Backend & Security Infrastructure Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-600" />
            Database & Authentication Status
          </CardTitle>
          <CardDescription className="text-xs">
            Review Supabase integration and Row Level Security isolation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div
                className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                  supabaseReady ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                {supabaseReady ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {supabaseReady ? 'Supabase Backend Connected' : 'Local Sandbox Mode Active'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {supabaseReady
                    ? 'Row Level Security active with PostgreSQL database'
                    : 'Configure NEXT_PUBLIC_SUPABASE_URL & ANON_KEY in .env.local to sync with remote Supabase'}
                </div>
              </div>
            </div>
            <Badge variant={supabaseReady ? 'success' : 'warning'} className="text-[10px]">
              {supabaseReady ? 'Live' : 'Sandbox Preview'}
            </Badge>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Security Architecture
            </div>
            <p className="text-[11px] leading-relaxed">
              All transactions, categories, budgets, and goals are strictly isolated per user account. Database migrations are stored in <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">supabase/migrations/</code>.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-4">
          <Button variant="destructive" size="sm" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-3.5 w-3.5" />
            Sign Out of Account
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
