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
import { Money } from '@/components/ui/money';
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
import { cn } from '@/lib/utils';
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

const ESSENTIALITY_COLORS: Record<Essentiality, string> = {
  essential: 'var(--essential)',
  optimizable: 'var(--trim)',
  discretionary: 'var(--optional)',
};

/** Quieter fields for the filter toolbar: no shadow, smaller type. */
const toolbarField = 'h-8 text-[13px] shadow-none';

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
      Add spending
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-10">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="flex flex-col gap-2 lg:flex-row">
          <Skeleton className="h-8 flex-1 rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg lg:w-[30rem]" />
        </div>
        {[0, 1].map((g) => (
          <div key={g} className="space-y-1">
            <Skeleton className="mb-2 h-3.5 w-24" />
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center gap-3 py-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const countLabel = hasFilters
    ? `Showing ${filteredTransactions.length} of ${transactions.length}`
    : `${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}`;

  return (
    <div className="space-y-10">
      <PageHeader
        title="My spending"
        description={
          transactions.length === 0 ? (
            'Everything you spend and receive, in one place.'
          ) : (
            <span className="tabular">
              {countLabel} · <Money amount={totalSpent} size="sm" tone="muted" decimals={false} /> spent
            </span>
          )
        }
        actions={newExpenseLink}
        className="animate-rise"
      />

      {transactions.length === 0 ? (
        <EmptyState
          icon={<ReceiptIndianRupee />}
          title="Nothing here yet"
          description="Add your first expense and it will show up here, grouped by day."
          action={newExpenseLink}
        />
      ) : (
        <div className="space-y-6">
          {/* Toolbar: sits on the sheet, no box */}
          <div
            className="flex flex-col gap-2 lg:flex-row lg:items-center animate-rise"
            style={{ animationDelay: '40ms' }}
          >
            <div className="relative lg:flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input
                type="search"
                placeholder="Search what you bought, the shop or the category"
                aria-label="Search your spending"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(toolbarField, 'pl-8')}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:shrink-0">
              <div className="lg:w-32">
                <Select
                  aria-label="Show"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  className={toolbarField}
                >
                  <option value="all">Everything</option>
                  <option value="expense">Money out</option>
                  <option value="income">Money in</option>
                </Select>
              </div>
              <div className="lg:w-40">
                <Select
                  aria-label="Category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={toolbarField}
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
              </div>
              <div className="lg:w-32">
                <Select
                  aria-label="Type of spending"
                  value={essentialityFilter}
                  onChange={(e) => setEssentialityFilter(e.target.value)}
                  className={toolbarField}
                >
                  <option value="all">Any type</option>
                  <option value="essential">Essential</option>
                  <option value="optimizable">Could trim</option>
                  <option value="discretionary">Optional</option>
                </Select>
              </div>
              <div className="lg:w-44">
                <Select
                  aria-label="Order"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className={toolbarField}
                >
                  <option value="date_desc">Newest first</option>
                  <option value="date_asc">Oldest first</option>
                  <option value="amount_desc">Biggest amount first</option>
                  <option value="amount_asc">Smallest amount first</option>
                </Select>
              </div>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="self-start lg:self-auto">
                Clear
              </Button>
            )}
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
            <div className="space-y-8 animate-rise" style={{ animationDelay: '80ms' }}>
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label ?? 'All entries'}>
                  {group.label && (
                    <div className="sticky top-12 z-10 flex items-baseline justify-between gap-3 bg-card/90 pb-1.5 pt-2 backdrop-blur lg:top-0">
                      <h2 className="text-[13px] text-muted-foreground">{group.label}</h2>
                      <Money
                        amount={group.net}
                        size="sm"
                        className="text-[13px]"
                        sign={group.net > 0 ? 'plus' : 'none'}
                        tone={group.net > 0 ? 'success' : 'muted'}
                      />
                    </div>
                  )}
                  <ul className="-mx-3 divide-y divide-border/70">
                    {group.items.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        category={tx.category ?? categoryById.get(tx.category_id)}
                        onEdit={() => startEdit(tx)}
                        onDelete={() => setDeletingId(tx.id)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
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
          <div className="flex items-center justify-between gap-3 border-y border-border py-3 text-sm">
            <span className="truncate text-foreground">{deletingTx.description}</span>
            <Money
              amount={Number(deletingTx.amount)}
              size="sm"
              className="shrink-0"
              sign={deletingTx.transaction_type === 'income' ? 'plus' : 'none'}
              tone={deletingTx.transaction_type === 'income' ? 'success' : 'default'}
            />
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
    <li className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-foreground/[0.025]">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${kind.color}1f`, color: kind.color }}
        title={kind.label}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm text-foreground" title={tx.original_input ?? undefined}>
            {tx.description}
          </p>
          {tx.entry_method !== 'manual' && (
            <span title={`Captured with ${tx.entry_method === 'ai_voice' ? 'voice' : 'AI text'}`} className="shrink-0">
              <Sparkles className="size-3 text-subtle" aria-label="AI captured" />
            </span>
          )}
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {!isIncome && (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: ESSENTIALITY_COLORS[tx.essentiality] }}
              title={ESSENTIALITY_LABELS[tx.essentiality]}
            >
              <span className="sr-only">{ESSENTIALITY_LABELS[tx.essentiality]}</span>
            </span>
          )}
          <span className="truncate">{meta}</span>
          {!isIncome && (
            <span className="hidden shrink-0 text-subtle sm:pointer-fine:group-hover:inline" aria-hidden>
              · {ESSENTIALITY_LABELS[tx.essentiality]}
            </span>
          )}
        </p>
      </div>

      <Money
        amount={Number(tx.amount)}
        size="sm"
        className="shrink-0"
        sign={isIncome ? 'plus' : 'none'}
        tone={isIncome ? 'success' : 'default'}
      />

      <div className="-mr-1.5 flex shrink-0 items-center transition-opacity sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover:opacity-100 sm:pointer-fine:group-focus-within:opacity-100">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit entry" title="Edit">
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete entry"
          title="Delete"
          className="hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
