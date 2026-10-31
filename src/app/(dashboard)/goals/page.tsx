'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CircleCheck, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { DataService } from '@/lib/data-service';
import { SavingsGoal } from '@/types/database';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { calculateSuggestedMonthlyContribution, toLocalDateString } from '@/lib/calculations/finance';
import { toast } from 'sonner';

export default function SavingsGoalsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<string>('');

  // Create dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Add money dialog
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Stable callbacks: Dialog re-focuses its first control whenever onClose changes.
  const closeCreate = useCallback(() => setIsModalOpen(false), []);
  const closeDeposit = useCallback(() => {
    setSelectedGoal(null);
    setDepositAmount('');
  }, []);
  const closeDelete = useCallback(() => setDeletingId(null), []);

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const data = await DataService.getGoals();
        // `today` is only set after mount, to avoid a hydration mismatch
        setToday(toLocalDateString());
        setGoals(data);
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Could not load savings goals');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(targetAmount);
    const current = currentAmount ? parseFloat(currentAmount) : 0;

    if (isNaN(target) || target <= 0) {
      toast.error('Please enter how much you want to save.');
      return;
    }

    if (!targetDate) {
      toast.error('Please pick the date you want to reach it by.');
      return;
    }

    setSaving(true);
    try {
      const created = await DataService.addGoal({
        user_id: 'current-user',
        name: name.trim(),
        target_amount: target,
        current_amount: current,
        target_date: targetDate,
        description: description.trim() || null,
      });

      setGoals((prev) => [created, ...prev]);
      toast.success('Goal added');
      setIsModalOpen(false);
      setName('');
      setTargetAmount('');
      setCurrentAmount('');
      setTargetDate('');
      setDescription('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the goal');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    setDeleting(true);
    try {
      await DataService.deleteGoal(id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
      toast.success('Goal removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the goal');
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  };

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal) return;
    const added = parseFloat(depositAmount);
    if (isNaN(added) || added <= 0) {
      toast.error('Please enter an amount above zero.');
      return;
    }

    const newAmount = Number(selectedGoal.current_amount) + added;
    setDepositing(true);
    try {
      await DataService.updateGoal(selectedGoal.id, { current_amount: newAmount });
      setGoals((prev) => prev.map((g) => (g.id === selectedGoal.id ? { ...g, current_amount: newAmount } : g)));
      toast.success(`Added ${formatCurrency(added)} to ${selectedGoal.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the money');
    } finally {
      setDepositing(false);
    }
    setSelectedGoal(null);
    setDepositAmount('');
  };

  const newGoalButton = (
    <Button onClick={() => setIsModalOpen(true)}>
      <Plus />
      New goal
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-12">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="divide-y divide-border/70">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-5 py-5">
              <Skeleton className="h-10 w-16" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-1 w-full rounded-full" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="hidden h-8 w-28 rounded-md sm:block" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const deletingGoal = deletingId ? goals.find((g) => g.id === deletingId) : undefined;

  return (
    <div className="space-y-12">
      <PageHeader
        title="Savings goals"
        description="Something you're saving for, and how much to put aside each month to get there."
        actions={newGoalButton}
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title="No savings goals yet"
          description="Add something you're saving for, like a holiday, a new phone or a rainy-day fund. We'll show how much to save each month."
          action={newGoalButton}
        />
      ) : (
        <ul className="-mx-3 divide-y divide-border/70">
          {goals.map((goal, i) => {
            const target = Number(goal.target_amount);
            const current = Number(goal.current_amount);
            const progress = Math.min(100, Math.round((current / target) * 100));
            const remaining = Math.max(0, target - current);
            const reached = remaining === 0;

            const suggestedMonthly = today
              ? calculateSuggestedMonthlyContribution(target, current, goal.target_date, today)
              : 0;

            return (
              <li
                key={goal.id}
                className="group grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-lg px-3 py-5 transition-colors hover:bg-foreground/[0.025] animate-rise sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-6"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div
                  className={cn(
                    'tabular font-display text-[40px] leading-none tracking-[-0.01em] sm:text-[44px]',
                    reached ? 'text-success' : 'text-foreground'
                  )}
                  aria-label={`${progress}% saved`}
                >
                  {progress}
                  <span className="text-[0.5em] text-muted-foreground">%</span>
                </div>

                <div className="min-w-0 space-y-2.5">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-[15px] font-medium tracking-[-0.01em]">{goal.name}</span>
                      {reached && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <CircleCheck className="size-3.5" aria-hidden />
                          Reached
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[13px] text-muted-foreground">
                      <span className="tabular">By {formatDate(goal.target_date)}</span>
                      {goal.description && <> · {goal.description}</>}
                    </p>
                  </div>
                  <Progress value={progress} tone={reached ? 'success' : 'default'} className="h-1" />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                    <span>
                      <Money amount={current} size="sm" decimals={false} /> saved of{' '}
                      <Money amount={target} size="sm" decimals={false} tone="muted" />
                    </span>
                    {reached ? (
                      <span className="text-success">Fully saved</span>
                    ) : (
                      <span>
                        About <Money amount={suggestedMonthly} size="sm" decimals={false} tone="brand" /> a month
                        <span className="text-subtle">
                          {' '}
                          · <Money amount={remaining} size="sm" decimals={false} tone="muted" className="text-subtle" /> to go
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedGoal(goal)}>
                    <Plus />
                    Add money
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeletingId(goal.id)}
                    aria-label={`Delete ${goal.name}`}
                    title="Remove goal"
                    className="hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add money dialog */}
      <Dialog
        open={!!selectedGoal}
        onClose={closeDeposit}
        title="Add money"
        description={
          selectedGoal
            ? `${selectedGoal.name}: you've saved ${formatCurrency(Number(selectedGoal.current_amount))} of ${formatCurrency(
                Number(selectedGoal.target_amount)
              )} so far.`
            : undefined
        }
        className="max-w-sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeDeposit}>
              Cancel
            </Button>
            <Button type="submit" form="add-money-form" loading={depositing}>
              Add money
            </Button>
          </>
        }
      >
        <form id="add-money-form" onSubmit={handleAddContribution}>
          <Field label="How much are you adding? (₹)" htmlFor="deposit-amount">
            <Input
              id="deposit-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="5000"
              className="tabular"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              autoFocus
              required
            />
          </Field>
        </form>
      </Dialog>

      {/* Create dialog */}
      <Dialog
        open={isModalOpen}
        onClose={closeCreate}
        title="New savings goal"
        description="Tell us what you're saving for and by when. We'll work out how much to put aside each month."
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" form="create-goal-form" loading={saving}>
              Add goal
            </Button>
          </>
        }
      >
        <form id="create-goal-form" onSubmit={handleCreateGoal} className="space-y-4">
          <Field label="What are you saving for?" htmlFor="goal-name">
            <Input
              id="goal-name"
              type="text"
              placeholder="Emergency fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount needed (₹)" htmlFor="goal-target">
              <Input
                id="goal-target"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="100000"
                className="tabular"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Already saved (₹)" htmlFor="goal-current">
              <Input
                id="goal-current"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                className="tabular"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Reach it by" htmlFor="goal-date">
            <Input
              id="goal-date"
              type="date"
              min={today || undefined}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Note" htmlFor="goal-note" hint="Optional">
            <Textarea
              id="goal-note"
              rows={2}
              placeholder="Six months of expenses in a savings account"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </form>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deletingId}
        onClose={closeDelete}
        title="Remove this goal?"
        description={
          deletingGoal
            ? `"${deletingGoal.name}" and its progress will be removed. This can't be undone.`
            : "This goal will be removed. This can't be undone."
        }
        footer={
          <>
            <Button variant="outline" onClick={closeDelete}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleting}
              onClick={() => deletingId && handleDeleteGoal(deletingId)}
            >
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
