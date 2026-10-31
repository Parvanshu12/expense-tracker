'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsEmailUnconfirmed(false);
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        document.cookie = 'spendwise_demo_session=true; path=/; max-age=86400';
        toast.success('Signed in using local sandbox mode');
        window.location.href = '/dashboard';
        return;
      }

      const supabase = createClient();
      if (!supabase) {
        throw new Error('Supabase client could not be initialized');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setIsEmailUnconfirmed(true);
          setErrorMessage('Your email has not been confirmed yet. Please check your inbox for the Supabase confirmation link, or disable "Confirm email" in Supabase Auth settings.');
        } else {
          setErrorMessage(error.message);
        }
        toast.error(error.message);
        return;
      }

      if (data?.user) {
        // Clear any demo cookie
        document.cookie = 'spendwise_demo_session=; path=/; max-age=0';
        toast.success('Welcome back!');
        window.location.href = '/dashboard';
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = () => {
    document.cookie = 'spendwise_demo_session=true; path=/; max-age=86400';
    toast.success('Entering sandbox session');
    window.location.href = '/dashboard';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#090d16] px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign in to SpendWise AI
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Understand your spending and make smarter money decisions.
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg border-slate-200/80 dark:border-slate-800">
          <form onSubmit={handleLogin}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Account Login</CardTitle>
              <CardDescription>
                Enter your credentials to access your financial dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {errorMessage && (
                <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{errorMessage}</span>
                  </div>
                  {isEmailUnconfirmed && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDemoSignIn}
                      className="w-full text-xs mt-2"
                    >
                      Bypass & Enter via Sandbox Mode
                    </Button>
                  )}
                </div>
              )}

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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-slate-500" />
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 font-medium"
              >
                {loading ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3 pt-0">
              <div className="relative w-full text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <span className="relative bg-white dark:bg-slate-900 px-2 text-[11px] text-slate-500 uppercase">
                  Quick Access
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleDemoSignIn}
                className="w-full text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Explore Sandbox Demo (No signup required)
              </Button>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Don&apos;t have an account?{' '}
                <Link
                  href="/signup"
                  className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Create one now
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
