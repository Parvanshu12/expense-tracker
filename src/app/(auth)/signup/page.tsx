'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Lock, Mail, User, ArrowRight, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { toast } from 'sonner';

export default function SignUpPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        document.cookie = 'spendwise_demo_session=true; path=/; max-age=86400';
        toast.success('Account created in sandbox! Proceeding to onboarding.');
        window.location.href = '/onboarding?name=' + encodeURIComponent(displayName);
        return;
      }

      const supabase = createClient();
      if (!supabase) {
        throw new Error('Supabase client could not be initialized');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            language: 'en',
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        toast.error(error.message);
        return;
      }

      if (data?.session) {
        // Email confirmation is disabled in Supabase, session is active immediately!
        document.cookie = 'spendwise_demo_session=; path=/; max-age=0';
        toast.success('Registration successful! Setting up your preferences.');
        window.location.href = '/onboarding';
      } else if (data?.user) {
        // Email confirmation is enabled in Supabase project settings
        setEmailSent(true);
        toast.info('Account created! A confirmation email has been sent.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleContinueSandbox = () => {
    document.cookie = 'spendwise_demo_session=true; path=/; max-age=86400';
    window.location.href = '/onboarding?name=' + encodeURIComponent(displayName);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#090d16] px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Create your account
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Start tracking, analyzing, and optimizing your spending with AI
          </p>
        </div>

        <Card className="shadow-lg border-slate-200/80 dark:border-slate-800">
          {emailSent ? (
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Check your email
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                We sent a confirmation link to <strong className="text-slate-700 dark:text-slate-200">{email}</strong>. Click the link in your email to activate your account.
              </p>
              <div className="pt-2 space-y-2">
                <Button
                  onClick={handleContinueSandbox}
                  variant="ai"
                  size="sm"
                  className="w-full text-xs"
                >
                  Continue to Onboarding in Sandbox Mode
                </Button>
                <Link href="/login" className="block">
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    Return to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSignUp}>
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Join SpendWise AI</CardTitle>
                <CardDescription>
                  Free personal financial intelligence. No financial details required.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    Display Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-500" />
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="name@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-slate-500" />
                    Password
                  </label>
                  <Input
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-slate-500" />
                    Confirm Password
                  </label>
                  <Input
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2.5 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Zero spam. Your financial data is protected by Row Level Security.</span>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full gap-2 font-medium"
                >
                  {loading ? 'Creating Account...' : 'Continue to Onboarding'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
              <CardFooter className="flex flex-col space-y-3 pt-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleContinueSandbox}
                  className="w-full text-xs"
                >
                  Skip to Sandbox Onboarding
                </Button>

                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  Already have an account?{' '}
                  <Link
                    href="/login"
                    className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Sign in
                  </Link>
                </p>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
