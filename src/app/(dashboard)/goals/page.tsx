'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Target,
  Plus,
  Calendar,
  PiggyBank,
  CheckCircle2,
  DollarSign,
  X,
  Info,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataService } from '@/lib/data-service';
import { SavingsGoal } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

export default function SavingsGoalsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');

  // Add contribution modal
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(9);

  useEffect(() => {
    const d = new Date();
    setCurrentYear(d.getFullYear());
    setCurrentMonth(d.getMonth());
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const data = await DataService.getGoals();
        setGoals(data);
      } catch (err) {
        console.error(err);
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
      toast.success('Savings goal created!');
      setIsModalOpen(false);
      setName('');
      setTargetAmount('');
      setCurrentAmount('');
      setTargetDate('');
      setDescription('');
    } catch {
      toast.error('Failed to create savings goal');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    try {
      await DataService.deleteGoal(id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
      toast.success('Goal removed.');
    } catch {
      toast.error('Failed to delete goal');
    }
  };

  const handleAddContribution = async () => {
    if (!selectedGoal) return;
    const added = parseFloat(depositAmount);
    if (isNaN(added) || added <= 0) {
      toast.error('Please enter a valid contribution amount.');
      return;
    }

    const newAmount = Number(selectedGoal.current_amount) + added;
    try {
      const updated = await DataService.updateGoal(selectedGoal.id, { current_amount: newAmount });
      setGoals((prev) =>
        prev.map((g) => g.id === selectedGoal.id ? { ...g, current_amount: newAmount } : g)
      );
      toast.success(`Added ${formatCurrency(added)} to "${selectedGoal.name}"!`);
    } catch {
      toast.error('Failed to update goal');
    }
    setSelectedGoal(null);
    setDepositAmount('');
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Savings Goals</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Target funds with deterministic monthly contribution roadmaps
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-indigo-600 text-xs">
          <Plus className="h-4 w-4" />
          Create New Goal
        </Button>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.map((goal) => {
          const target = Number(goal.target_amount);
          const current = Number(goal.current_amount);
          const progress = Math.min(100, Math.round((current / target) * 100));
          const remaining = Math.max(0, target - current);

          // Calculate suggested monthly contribution:
          // remaining / months remaining
          const targetD = new Date(goal.target_date);
          const diffMonths = Math.max(
            1,
            (targetD.getFullYear() - currentYear) * 12 +
              (targetD.getMonth() - currentMonth)
          );
          const suggestedMonthly = remaining > 0 ? Math.round(remaining / diffMonths) : 0;

          return (
            <Card key={goal.id} className="p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                      <Target className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {goal.name}
                      </h3>
                      <span className="text-[11px] text-slate-400">
                        Target Date: {formatDate(goal.target_date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={progress >= 100 ? 'success' : 'secondary'} className="text-[10px]">
                      {progress}%
                    </Badge>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="text-slate-400 hover:text-rose-500 transition-colors p-0.5"
                      title="Remove goal"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {goal.description && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                    {goal.description}
                  </p>
                )}

                {/* Progress bar */}
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">
                      Saved: <strong className="text-slate-900 dark:text-white">{formatCurrency(current)}</strong>
                    </span>
                    <span className="text-slate-400">Target: {formatCurrency(target)}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Remaining & Suggested Monthly */}
                <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Remaining to reach goal:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatCurrency(remaining)}
                    </span>
                  </div>
                  {remaining > 0 && (
                    <div className="flex justify-between text-indigo-600 dark:text-indigo-400 font-medium">
                      <span className="flex items-center gap-1">
                        Suggested Monthly Contribution:
                        <span title="Calculated as: remaining amount / months remaining until target date">
                          <Info className="h-3 w-3 text-slate-400 cursor-help" />
                        </span>
                      </span>
                      <span>{formatCurrency(suggestedMonthly)}/mo</span>
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedGoal(goal)}
                className="w-full text-xs font-semibold gap-1.5"
              >
                <Plus className="h-3.5 w-3.5 text-indigo-600" />
                Record Contribution
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Record Contribution Modal */}
      {selectedGoal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-sm w-full p-6 space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add to {selectedGoal.name}
              </h3>
              <button onClick={() => setSelectedGoal(null)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Contribution Amount (₹ INR)
              </label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedGoal(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="ai" onClick={handleAddContribution}>
                Add Funds
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal to create new savings goal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Create Savings Goal
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Goal Name *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Vacation to Ladakh, New Laptop, Emergency Fund"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Target Amount (₹) *
                  </label>
                  <Input
                    type="number"
                    placeholder="100000"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Already Saved (₹)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={currentAmount}
                    onChange={(e) => setCurrentAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Completion Date *
                </label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Description / Purpose (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 6-month safety buffer in high-yield account"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-500">
                SpendWise will automatically calculate the monthly deposit required based on your target date.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="ai">
                  Save Goal
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
