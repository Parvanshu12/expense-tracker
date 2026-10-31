'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  ReceiptIndianRupee,
  SearchX,
  Utensils,
  ShoppingCart,
  Car,
  House,
  Zap,
  HeartPulse,
  ShoppingBag,
  Film,
  GraduationCap,
  Plane,
  Repeat,
  Landmark,
  Gift,
  Ellipsis,
  Briefcase,
  Laptop,
  Building2,
  Coins,
  ArrowDownLeft,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService, DEFAULT_SYSTEM_CATEGORIES } from '@/lib/data-service';
import { Transaction, Category, Essentiality } from '@/types/database';
import { toLocalDateString } from '@/lib/calculations/finance';
import { PURCHASE_KINDS, kindForCategory, kindForTransaction } from '@/lib/categories/kinds';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

type TypeFilter = 'all' | 'expense' | 'income';
type SortBy = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const ESSENTIALITY_LABELS: Record<Essentiality, string> = {
  essential: 'Essential',
  optimizable: 'Could trim',
  discretionary: 'Optional',
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  Car,
  Home: House,
  House,
  Zap,
  HeartPulse,
  ShoppingBag,
  Film,
  GraduationCap,
  Plane,
  Sparkles,
  Repeat,
  Landmark,
  Gift,
  MoreHorizontal: Ellipsis,
  Ellipsis,
  Briefcase,
  Laptop,
  Building2,
  Coins,
  Wallet,
};

const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash'];

/** Shifts a YYYY-MM-DD string by whole days (UTC arithmetic, no time zone drift). */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function formatDayHeading(dateStr: string, today: string): string {
  if (today) {
    if (dateStr === today) return 'Today';
    if (dateStr === shiftDate(today, -1)) return 'Yesterday';
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const sameYear = today ? today.slice(0, 4) === dateStr.slice(0, 4) : false;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatSigned(amount: number): string {
  if (amount > 0) return `+${formatCurrency(amount)}`;
  if (amount < 0) return `−${formatCurrency(-amount)}`;
  return formatCurrency(0);
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_SYSTEM_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState('');

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [essentialityFilter, setEssentialityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date_desc');

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit dialog
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editEssentiality, setEditEssentiality] = useState<Essentiality>('essential');
  const [editMerchant, setEditMerchant] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Stable callbacks: Dialog re-focuses its first control whenever onClose changes.
  const closeEdit = useCallback(() => setEditingTransaction(null), []);
  const closeDelete = useCallback(() => setDeletingId(null), []);

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
          prev.map((t) =>
            t.id === updated.id ? { ...updated, category: categories.find((c) => c.id === updated.category_id) } : t
          )
        );
        toast.success('Changes saved');
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
        setToday(toLocalDateString());
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
    setDeleting(true);
    try {
      const ok = await DataService.deleteTransaction(id);
      if (ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        toast.success('Entry deleted');
      } else {
        toast.error('Could not delete this entry');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deletion error');
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  };

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesDesc = tx.description.toLowerCase().includes(q);
          const matchesMerchant = (tx.merchant || '').toLowerCase().includes(q);
          const matchesCategory = (tx.category?.name || '').toLowerCase().includes(q);
          if (!matchesDesc && !matchesMerchant && !matchesCategory) return false;
        }
        if (typeFilter !== 'all' && tx.transaction_type !== typeFilter) return false;
        if (categoryFilter !== 'all' && tx.category_id !== categoryFilter) return false;
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

  // Date sorts are grouped by day; amount sorts render as one flat list.
  const groups = useMemo(() => {
    if (sortBy !== 'date_desc' && sortBy !== 'date_asc') {
      return [{ key: 'all', label: null as string | null, net: 0, items: filteredTransactions }];
    }
    const result: { key: string; label: string | null; net: number; items: Transaction[] }[] = [];
    for (const tx of filteredTransactions) {
      let group = result[result.length - 1];
      if (!group || group.key !== tx.purchase_date) {
        group = { key: tx.purchase_date, label: formatDayHeading(tx.purchase_date, today), net: 0, items: [] };
        result.push(group);
      }
      group.items.push(tx);
      group.net += tx.transaction_type === 'income' ? Number(tx.amount) : -Number(tx.amount);
    }
    return result;
  }, [filteredTransactions, sortBy, today]);

  const totalSpent = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.transaction_type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0),
    [filteredTransactions]
  );

  const hasFilters =
    searchQuery.trim() !== '' || typeFilter !== 'all' || categoryFilter !== 'all' || essentialityFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setEssentialityFilter('all');
  };

  const expenseCategories = categories.filter((c) => c.category_type === 'expense');
  const incomeCategories = categories.filter((c) => c.category_type === 'income');
  const deletingTx = deletingId ? transactions.find((t) => t.id === deletingId) : undefined;

  const newExpenseLink = (
    <Link href="/add-expense" className={buttonVariants()}>
      <Plus />
      Add an expense
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        </div>
        {[0, 1].map((g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Card className="divide-y divide-border">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-9 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    );
  }

  const description =
    transactions.length === 0
      ? 'Everything you spend and receive, in one place.'
      : hasFilters
        ? `Showing ${filteredTransactions.length} of ${transactions.length} entries · ${formatCurrency(totalSpent)} spent`
        : `${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'} · ${formatCurrency(totalSpent)} spent`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My spending"
        description={<span className="tabular">{description}</span>}
        actions={newExpenseLink}
      />

      {transactions.length === 0 ? (
        <EmptyState
          icon={<ReceiptIndianRupee />}
          title="Nothing here yet"
          description="Add your first expense and it will show up here, grouped by day."
          action={newExpenseLink}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="space-y-3 animate-rise">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by what you bought, the shop or the category"
                aria-label="Search your spending"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Show" htmlFor="filter-type">
                <Select
                  id="filter-type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                >
                  <option value="all">Everything</option>
                  <option value="expense">Money out</option>
                  <option value="income">Money in</option>
                </Select>
              </Field>
              <Field label="Category" htmlFor="filter-category">
                <Select
                  id="filter-category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All categories</option>
                  <optgroup label="Expense">
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Money in">
                    {incomeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
              <Field label="Type of spending" htmlFor="filter-essentiality">
                <Select
                  id="filter-essentiality"
                  value={essentialityFilter}
                  onChange={(e) => setEssentialityFilter(e.target.value)}
                >
                  <option value="all">Any type</option>
                  <option value="essential">Essential</option>
                  <option value="optimizable">Could trim</option>
                  <option value="discretionary">Optional</option>
                </Select>
              </Field>
              <Field label="Order" htmlFor="filter-sort">
                <Select id="filter-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                  <option value="date_desc">Newest first</option>
                  <option value="date_asc">Oldest first</option>
                  <option value="amount_desc">Biggest amount first</option>
                  <option value="amount_asc">Smallest amount first</option>
                </Select>
              </Field>
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title="Nothing matches your filters"
              description="Try a different word, or clear the filters to see everything again."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="space-y-6 animate-rise" style={{ animationDelay: '60ms' }}>
              {groups.map((group) => (
                <section key={group.key}>
                  {group.label && (
                    <div className="sticky top-14 z-10 -mx-1 flex items-center justify-between bg-background/85 px-1 py-2 backdrop-blur">
                      <h2 className="text-[13px] font-medium text-foreground">{group.label}</h2>
                      <span
                        className={cn(
                          'tabular text-xs font-medium',
                          group.net > 0 ? 'text-success' : 'text-muted-foreground'
                        )}
                      >
                        {formatSigned(group.net)}
                      </span>
                    </div>
                  )}
                  <Card className="divide-y divide-border overflow-hidden">
                    {group.items.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        category={tx.category ?? categoryById.get(tx.category_id)}
                        onEdit={() => startEdit(tx)}
                        onDelete={() => setDeletingId(tx.id)}
                      />
                    ))}
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Edit dialog */}
      <Dialog
        open={!!editingTransaction}
        onClose={closeEdit}
        title="Edit entry"
        description="Your budgets and reports update straight away."
        className="max-w-lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeEdit}>
              Cancel
            </Button>
            <Button type="submit" form="edit-transaction-form" loading={savingEdit}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-transaction-form" onSubmit={handleSaveEdit} className="space-y-4">
          <Field label="Description" htmlFor="edit-desc">
            <Input id="edit-desc" type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)" htmlFor="edit-amount">
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                className="tabular"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Date" htmlFor="edit-date">
              <Input id="edit-date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
            </Field>
            <Field label="Category" htmlFor="edit-category">
              <Select id="edit-category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                <optgroup label="Expense">
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Money in">
                  {incomeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field label="Type of spending" htmlFor="edit-essentiality">
              <Select
                id="edit-essentiality"
                value={editEssentiality}
                onChange={(e) => setEditEssentiality(e.target.value as Essentiality)}
              >
                <option value="essential">Essential</option>
                <option value="optimizable">Could trim</option>
                <option value="discretionary">Optional</option>
              </Select>
            </Field>
            <Field label="Shop or person" htmlFor="edit-merchant">
              <Input
                id="edit-merchant"
                type="text"
                placeholder="Optional"
                value={editMerchant}
                onChange={(e) => setEditMerchant(e.target.value)}
              />
            </Field>
            <Field label="Payment method" htmlFor="edit-payment">
              <Select id="edit-payment" value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </form>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deletingId}
        onClose={closeDelete}
        title="Delete this entry?"
        description="It will be removed from your spending, budgets and reports. This can't be undone."
        footer={
          <>
            <Button variant="outline" onClick={closeDelete}>
              Cancel
            </Button>
            <Button variant="destructive" loading={deleting} onClick={() => deletingId && handleDelete(deletingId)}>
              Delete
            </Button>
          </>
        }
      >
        {deletingTx && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
            <span className="truncate text-foreground">{deletingTx.description}</span>
            <span
              className={cn(
                'tabular shrink-0 font-medium',
                deletingTx.transaction_type === 'income' ? 'text-success' : 'text-foreground'
              )}
            >
              {deletingTx.transaction_type === 'income' ? '+' : ''}
              {formatCurrency(Number(deletingTx.amount))}
            </span>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function TransactionRow({
  tx,
  category,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  category: Category | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = tx.transaction_type === 'income';
  const Icon = (category?.icon && CATEGORY_ICONS[category.icon]) || (isIncome ? ArrowDownLeft : ReceiptIndianRupee);
  const kind = PURCHASE_KINDS[isIncome ? 'income' : category ? kindForCategory(category) : kindForTransaction(tx)];
  const meta = [tx.merchant, category?.name ?? 'Uncategorized', tx.payment_method].filter(Boolean).join(' · ');

  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${kind.color}1f`, color: kind.color }}
        title={kind.label}
      >
        <Icon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground" title={tx.original_input ?? undefined}>
            {tx.description}
          </p>
          {tx.entry_method !== 'manual' && (
            <span title={`Captured with ${tx.entry_method === 'ai_voice' ? 'voice' : 'AI text'}`} className="shrink-0">
              <Sparkles className="size-3 text-primary" aria-label="AI captured" />
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>

      {!isIncome && (
        <Badge variant={tx.essentiality} className="hidden sm:inline-flex">
          {ESSENTIALITY_LABELS[tx.essentiality]}
        </Badge>
      )}

      <div
        className={cn(
          'tabular w-24 shrink-0 text-right text-sm font-medium sm:w-28',
          isIncome ? 'text-success' : 'text-foreground'
        )}
      >
        {isIncome ? '+' : ''}
        {formatCurrency(Number(tx.amount))}
      </div>

      <div className="-mr-2 flex shrink-0 items-center transition-opacity sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover:opacity-100 sm:pointer-fine:group-focus-within:opacity-100">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit entry" title="Edit">
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete entry"
          title="Delete"
          className="hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
