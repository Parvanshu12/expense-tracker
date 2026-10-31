'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Edit,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Info,
  Calendar,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import { Transaction, Category, Essentiality } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_SYSTEM_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [essentialityFilter, setEssentialityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

  // Deletion modal state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit modal state
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editEssentiality, setEditEssentiality] = useState<Essentiality>('essential');
  const [editMerchant, setEditMerchant] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setEditDesc(tx.description);
    setEditAmount(tx.amount.toString());
    setEditCategory(tx.category_id);
    setEditDate(tx.purchase_date);
    setEditEssentiality(tx.essentiality);
    setEditMerchant(tx.merchant || '');
    setEditPaymentMethod(tx.payment_method || 'UPI');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction) return;

    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid positive amount.');
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await DataService.updateTransaction(editingTransaction.id, {
        description: editDesc.trim(),
        amount: amt,
        category_id: editCategory,
        purchase_date: editDate,
        essentiality: editEssentiality,
        merchant: editMerchant.trim() || null,
        payment_method: editPaymentMethod || null,
        user_corrected_classification: true,
      });

      if (updated) {
        setTransactions((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...updated, category: categories.find((c) => c.id === updated.category_id) } : t))
        );
        toast.success('Transaction updated successfully');
        setEditingTransaction(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        await DataService.seedDemoDataIfEmpty();
        const txs = await DataService.getTransactions();
        const cats = await DataService.getCategories();
        setTransactions(txs);
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load transactions:', err);
        toast.error(err instanceof Error ? err.message : 'Could not load transactions');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const ok = await DataService.deleteTransaction(id);
      if (ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        toast.success('Transaction deleted');
      } else {
        toast.error('Could not delete transaction');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deletion error');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        // Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesDesc = tx.description.toLowerCase().includes(q);
          const matchesMerchant = (tx.merchant || '').toLowerCase().includes(q);
          const matchesCategory = (tx.category?.name || '').toLowerCase().includes(q);
          if (!matchesDesc && !matchesMerchant && !matchesCategory) return false;
        }

        // Type filter
        if (typeFilter !== 'all' && tx.transaction_type !== typeFilter) return false;

        // Category filter
        if (categoryFilter !== 'all' && tx.category_id !== categoryFilter) return false;

        // Essentiality filter
        if (essentialityFilter !== 'all' && tx.essentiality !== essentialityFilter) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date_desc') return b.purchase_date.localeCompare(a.purchase_date);
        if (sortBy === 'date_asc') return a.purchase_date.localeCompare(b.purchase_date);
        if (sortBy === 'amount_desc') return Number(b.amount) - Number(a.amount);
        if (sortBy === 'amount_asc') return Number(a.amount) - Number(b.amount);
        return 0;
      });
  }, [transactions, searchQuery, typeFilter, categoryFilter, essentialityFilter, sortBy]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search, Filters, and New Action */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search description, merchant, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Type selector */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="expense">Expenses Only</option>
              <option value="income">Income Only</option>
            </select>

            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Essentiality filter */}
            <select
              value={essentialityFilter}
              onChange={(e) => setEssentialityFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">All Essentialities</option>
              <option value="essential">Essential</option>
              <option value="optimizable">Optimizable</option>
              <option value="discretionary">Discretionary</option>
            </select>

            {/* Sort order */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="date_desc">Latest Date</option>
              <option value="date_asc">Oldest Date</option>
              <option value="amount_desc">Highest Amount</option>
              <option value="amount_asc">Lowest Amount</option>
            </select>

            <Link href="/add-expense">
              <Button size="sm" variant="ai" className="h-10 gap-1.5 text-xs font-semibold">
                <Plus className="h-4 w-4" />
                Add Transaction
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Transactions List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Ledger Entries</CardTitle>
            <CardDescription className="text-xs">
              Showing {filteredTransactions.length} of {transactions.length} recorded items
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <p className="text-sm">No transactions match your current filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.transaction_type === 'income'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'
                          : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600'
                      }`}
                    >
                      {tx.transaction_type === 'income' ? (
                        <ArrowUpRight className="h-5 w-5" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5" />
                      )}
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{tx.description}</span>
                        <Badge
                          variant={tx.essentiality as any}
                          className="text-[9px] px-1.5 py-0 h-4 font-normal"
                        >
                          {tx.essentiality}
                        </Badge>
                        {tx.entry_method !== 'manual' && (
                          <span
                            title={`Captured via ${tx.entry_method}`}
                            className="inline-flex items-center text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded-sm"
                          >
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                            AI
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {tx.category?.name || 'Category'}
                        </span>
                        <span>•</span>
                        <span>{formatDate(tx.purchase_date)}</span>
                        {tx.merchant && (
                          <>
                            <span>•</span>
                            <span>{tx.merchant}</span>
                          </>
                        )}
                        {tx.payment_method && (
                          <>
                            <span>•</span>
                            <span className="text-[11px] text-slate-400">{tx.payment_method}</span>
                          </>
                        )}
                      </div>

                      {tx.original_input && (
                        <p className="text-[11px] text-slate-400 italic mt-1 truncate max-w-md">
                          &ldquo;{tx.original_input}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div
                        className={`text-base font-bold ${
                          tx.transaction_type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {tx.transaction_type === 'income' ? '+' : '-'}
                        {formatCurrency(Number(tx.amount))}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {tx.occurred_at ? new Date(tx.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(tx)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        title="Edit transaction"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeletingId(tx.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Delete transaction"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Transaction
              </h3>
              <button onClick={() => setEditingTransaction(null)} className="text-slate-400">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <Input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Amount (₹ INR)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Purchase Date
                  </label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Essentiality
                  </label>
                  <select
                    value={editEssentiality}
                    onChange={(e) => setEditEssentiality(e.target.value as any)}
                    className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    <option value="essential">Essential</option>
                    <option value="optimizable">Optimizable</option>
                    <option value="discretionary">Discretionary</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Merchant (Optional)
                  </label>
                  <Input
                    type="text"
                    value={editMerchant}
                    onChange={(e) => setEditMerchant(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Payment Method
                  </label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Net Banking">Net Banking</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="outline" size="sm" type="button" onClick={() => setEditingTransaction(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant="ai" type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 rounded-full bg-rose-100 dark:bg-rose-950">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Transaction?
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete this transaction from your ledger? This action cannot be undone and will update your period summary and budget metrics.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(deletingId)}
              >
                Confirm Delete
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
