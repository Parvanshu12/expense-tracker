'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { enterSandbox, fetchCurrentUser, lookupEmail, signIn, signUp } from '@/lib/auth-client';

type Step = 'email' | 'password' | 'create';

const COPY: Record<Step, { title: string; description: string }> = {
  email: { title: 'Sign in or create an account', description: 'Enter your email to continue.' },
  password: { title: 'Welcome back', description: 'Enter your password to sign in.' },
  create: { title: 'Create your account', description: "You're new here. Choose a password to get started." },
};

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  // Only allow same-site relative paths.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Already signed in? Skip the form.
  useEffect(() => {
    fetchCurrentUser()
      .then((user) => user && router.replace(nextPath()))
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    if (step !== 'email') passwordRef.current?.focus();
  }, [step]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (step === 'email') {
        const { exists } = await lookupEmail(email);
        setStep(exists ? 'password' : 'create');
      } else if (step === 'password') {
        await signIn(email, password);
        window.location.href = nextPath();
      } else {
        await signUp(email, password, name.trim() || undefined);
        window.location.href = '/onboarding';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const back = () => {
    setStep('email');
    setPassword('');
    setError(null);
  };

  const startDemo = () => {
    enterSandbox();
    window.location.href = '/dashboard';
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">SpendWise</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-[10vh] pb-16">
        <div className="w-full max-w-[360px] animate-rise">
          <div className="mb-9 space-y-2">
            <h1 className="font-display text-[38px] leading-[1.02] tracking-[-0.01em] text-balance">{COPY[step].title}</h1>
            <p className="text-sm text-muted-foreground">{COPY[step].description}</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {step === 'email' ? (
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 text-[15px]"
                />
              </Field>
            ) : (
              <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3 text-sm">
                <span className="min-w-0 truncate text-foreground">{email}</span>
                <button
                  type="button"
                  onClick={back}
                  className="shrink-0 text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Change
                </button>
              </div>
            )}

            {step === 'create' && (
              <Field label="Your name" htmlFor="name" hint="Optional. Shown in the app only.">
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-[15px]" />
              </Field>
            )}

            {step !== 'email' && (
              <Field
                label={step === 'create' ? 'Choose a password' : 'Password'}
                htmlFor="password"
                hint={step === 'create' ? 'At least 8 characters.' : undefined}
              >
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={step === 'create' ? 'new-password' : 'current-password'}
                    required
                    minLength={step === 'create' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10 text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 text-[13px] text-destructive">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-destructive" />
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {step === 'email' ? 'Continue' : step === 'password' ? 'Sign in' : 'Create account'}
              {!loading && <ArrowRight />}
            </Button>

            {step !== 'email' && (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Use a different email
              </button>
            )}
          </form>

          <div className="mt-10 border-t border-border pt-6">
            <p className="text-sm text-muted-foreground">Just looking around?</p>
            <button
              type="button"
              onClick={startDemo}
              className="group mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground transition-colors hover:text-brand"
            >
              Try the demo
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <p className="mt-1 text-xs text-subtle">Sample data, saved only in this browser.</p>
          </div>
        </div>
      </main>

      <footer className="px-5 pb-6 text-center text-xs text-subtle sm:px-8">
        SpendWise · Personal money, kept simple
      </footer>
    </div>
  );
}
