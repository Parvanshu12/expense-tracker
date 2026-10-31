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
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <header className="relative flex h-14 items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">SpendWise</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-start justify-center px-5 pt-[12vh] pb-16">
        <div className="w-full max-w-[380px] animate-rise">
          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{COPY[step].title}</h1>
            <p className="text-sm text-muted-foreground">{COPY[step].description}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
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
                  className="h-10"
                />
              </Field>
            ) : (
              <button
                type="button"
                onClick={back}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm shadow-card transition-colors hover:bg-accent"
              >
                <span className="truncate">{email}</span>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">Change</span>
              </button>
            )}

            {step === 'create' && (
              <Field label="Your name" htmlFor="name" hint="Optional. Shown in the app only.">
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
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
                    className="h-10 pr-10"
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
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
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
                className="mx-auto flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Use a different email
              </button>
            )}
          </form>

          <div className="my-8 flex items-center gap-3 text-xs text-subtle">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="lg" className="w-full" onClick={startDemo}>
            Try the demo
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            The demo uses sample data saved only in this browser.
          </p>
        </div>
      </main>
    </div>
  );
}
