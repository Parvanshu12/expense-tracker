'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService } from '@/lib/data-service';
import { SavingsGoal } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils';
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
      toast.error('Please enter a valid target amount.');
      return;
    }

    if (!targetDate) {
      toast.error('Please select a target completion date.');
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
      toast.success('Goal created');
      setIsModalOpen(false);
      setName('');
      setTargetAmount('');
      setCurrentAmount('');
      setTargetDate('');
      setDescription('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create savings goal');
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
      toast.error(err instanceof Error ? err.message : 'Failed to delete goal');
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
      toast.error('Please enter a valid contribution amount.');
      return;
    }

    const newAmount = Number(selectedGoal.current_amount) + added;
    setDepositing(true);
    try {
      await DataService.updateGoal(selectedGoal.id, { current_amount: newAmount });
      setGoals((prev) => prev.map((g) => (g.id === selectedGoal.id ? { ...g, current_amount: newAmount } : g)));
      toast.success(`Added ${formatCurrency(added)} to ${selectedGoal.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update goal');
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
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-1 w-full rounded-full" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
              <Skeleton className="h-8 w-full rounded-md" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const deletingGoal = deletingId ? goals.find((g) => g.id === deletingId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="Savings targets with a suggested monthly amount to reach each one on time."
        actions={newGoalButton}
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No goals yet"
          description="Add a target, like an emergency fund or a trip, and track progress toward it."
          action={newGoalButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Card
                key={goal.id}
                className="flex flex-col animate-rise"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <CardHeader className="flex-row items-start justify-between gap-3 pb-4">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="truncate">{goal.name}</CardTitle>
                    <CardDescription className="tabular">By {formatDate(goal.target_date)}</CardDescription>
                  </div>
                  <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1">
                    {reached && <Badge variant="outline">Reached</Badge>}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeletingId(goal.id)}
                      aria-label={`Delete ${goal.name}`}
                      title="Delete goal"
                      className="hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4">
                  {goal.description && (
                    <p className="line-clamp-2 text-[13px] text-muted-foreground">{goal.description}</p>
                  )}

                  <div className="mt-auto space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tabular text-3xl font-semibold tracking-[-0.03em] text-foreground">
                        {progress}%
                      </span>
                      <span className="tabular truncate text-xs text-muted-foreground">
                        {formatCurrency(current)} of {formatCurrency(target)}
                      </span>
                    </div>
                    <Progress value={progress} className="h-1" />
                  </div>

                  <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                    <div className="space-y-0.5">
                      <dt className="text-xs text-muted-foreground">Remaining</dt>
                      <dd className="tabular text-sm font-medium text-foreground">{formatCurrency(remaining)}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt
                        className="text-xs text-muted-foreground"
                        title="Remaining amount divided by the months left until the target date"
                      >
                        Suggested monthly
                      </dt>
                      <dd className="tabular text-sm font-medium text-foreground">
                        {reached ? '—' : `${formatCurrency(suggestedMonthly)}/mo`}
                      </dd>
                    </div>
                  </dl>
                </CardContent>

                <CardFooter>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedGoal(goal)}>
                    <Plus />
                    Add money
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add money dialog */}
      <Dialog
        open={!!selectedGoal}
        onClose={closeDeposit}
        title="Add money"
        description={
          selectedGoal
            ? `${selectedGoal.name}: ${formatCurrency(Number(selectedGoal.current_amount))} of ${formatCurrency(
                Number(selectedGoal.target_amount)
              )} saved.`
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
          <Field label="Amount (₹)" htmlFor="deposit-amount">
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
        title="New goal"
        description="We'll work out how much to set aside each month."
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" form="create-goal-form" loading={saving}>
              Create goal
            </Button>
          </>
        }
      >
        <form id="create-goal-form" onSubmit={handleCreateGoal} className="space-y-4">
          <Field label="Name" htmlFor="goal-name">
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
            <Field label="Target (₹)" htmlFor="goal-target">
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

          <Field label="Target date" htmlFor="goal-date">
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
        title="Delete goal?"
        description={
          deletingGoal
            ? `"${deletingGoal.name}" and its saved progress will be removed. This can't be undone.`
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
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
