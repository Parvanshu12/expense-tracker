'use client';

import { Transaction, Category, Budget, SavingsGoal, Profile } from '@/types/database';
import { isSandbox } from './auth-client';
import { toLocalDateString } from './calculations/finance';

export const DEFAULT_SYSTEM_CATEGORIES: Category[] = [
  { id: 'cat-food', user_id: null, name: 'Food & Dining', category_type: 'expense', icon: 'Utensils', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-groceries', user_id: null, name: 'Groceries', category_type: 'expense', icon: 'ShoppingCart', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-transport', user_id: null, name: 'Transportation', category_type: 'expense', icon: 'Car', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-housing', user_id: null, name: 'Housing & Rent', category_type: 'expense', icon: 'Home', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-utilities', user_id: null, name: 'Utilities', category_type: 'expense', icon: 'Zap', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-health', user_id: null, name: 'Healthcare', category_type: 'expense', icon: 'HeartPulse', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-shopping', user_id: null, name: 'Shopping', category_type: 'expense', icon: 'ShoppingBag', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-entertainment', user_id: null, name: 'Entertainment', category_type: 'expense', icon: 'Film', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-education', user_id: null, name: 'Education', category_type: 'expense', icon: 'GraduationCap', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-travel', user_id: null, name: 'Travel', category_type: 'expense', icon: 'Plane', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-personal', user_id: null, name: 'Personal Care', category_type: 'expense', icon: 'Sparkles', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-subs', user_id: null, name: 'Subscriptions', category_type: 'expense', icon: 'Repeat', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-finance', user_id: null, name: 'Financial Obligations', category_type: 'expense', icon: 'Landmark', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-gifts', user_id: null, name: 'Gifts & Donations', category_type: 'expense', icon: 'Gift', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-misc', user_id: null, name: 'Miscellaneous', category_type: 'expense', icon: 'MoreHorizontal', is_system: true, created_at: new Date().toISOString() },

  // Income categories
  { id: 'cat-salary', user_id: null, name: 'Salary', category_type: 'income', icon: 'Briefcase', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-freelance', user_id: null, name: 'Freelance Income', category_type: 'income', icon: 'Laptop', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-business', user_id: null, name: 'Business Income', category_type: 'income', icon: 'Building2', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-allowance', user_id: null, name: 'Allowance', category_type: 'income', icon: 'Coins', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-gifts-rec', user_id: null, name: 'Gifts Received', category_type: 'income', icon: 'Gift', is_system: true, created_at: new Date().toISOString() },
  { id: 'cat-other-inc', user_id: null, name: 'Other Income', category_type: 'income', icon: 'Wallet', is_system: true, created_at: new Date().toISOString() },
];

const LOCAL_STORAGE_TRANSACTIONS = 'spendwise_local_transactions';
const LOCAL_STORAGE_BUDGETS = 'spendwise_local_budgets';
const LOCAL_STORAGE_GOALS = 'spendwise_local_goals';
const LOCAL_STORAGE_PROFILE = 'spendwise_local_profile';
const LOCAL_STORAGE_CATEGORIES = 'spendwise_local_categories';

/**
 * Calls the app's own API (D1 behind it). Any non-2xx response throws with the
 * server's message; a 401 sends the user back to sign in. Signed-in mode never
 * falls back to localStorage, which would make a failed save look successful.
 */
async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as T) : fallback;
}

function writeLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

function newLocalId(prefix: string): string {
  return prefix + Math.random().toString(36).substring(2, 9);
}

const DEMO_PROFILE: Profile = {
  id: 'demo-user-1',
  display_name: 'Akshay',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  language: 'en',
  monthly_income: 85000,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Single data layer for every page. Signed-in users read and write through
 * /api/* (Cloudflare D1); sandbox (demo) sessions use localStorage only.
 */
type DemoEntry = [
  daysAgo: number,
  categoryId: string,
  amount: number,
  description: string,
  merchant: string | null,
  essentiality: Transaction['essentiality'],
  paymentMethod: string,
];

/** About three months of realistic sample activity, relative to `now`, for the demo. */
function buildDemoTransactions(now: Date): Transaction[] {
  const entries: DemoEntry[] = [];
  for (let month = 0; month < 3; month++) {
    const base = month * 30;
    entries.push(
      [base + 2, 'cat-salary', 85000, 'Monthly salary', 'Tech Corp India', 'essential', 'Net Banking'],
      [base + 4, 'cat-housing', 22000, 'Rent', 'Landlord', 'essential', 'UPI'],
      [base + 6, 'cat-utilities', 1450 + month * 90, 'Electricity bill', 'BESCOM', 'essential', 'UPI'],
      [base + 7, 'cat-utilities', 799, 'Broadband', 'Airtel', 'essential', 'UPI'],
      [base + 9, 'cat-subs', 649, 'Netflix', 'Netflix', 'optimizable', 'Credit Card'],
      [base + 9, 'cat-subs', 119, 'Spotify', 'Spotify', 'optimizable', 'Credit Card'],
      [base + 15, 'cat-health', 640 + month * 120, 'Pharmacy', 'Apollo Pharmacy', 'essential', 'UPI'],
      [base + 20, 'cat-finance', 3000, 'SIP investment', 'Zerodha', 'essential', 'Net Banking']
    );
    for (let w = 0; w < 4; w++) {
      const d = base + w * 7;
      entries.push(
        [d + 1, 'cat-groceries', 2100 + ((w + month) % 3) * 380, 'Weekly groceries', w % 2 ? 'Blinkit' : 'Nature Basket', 'essential', 'UPI'],
        [d + 3, 'cat-food', 380 + ((w * 3 + month) % 4) * 110, 'Dinner delivery', w % 2 ? 'Zomato' : 'Swiggy', 'optimizable', 'UPI'],
        [d + 5, 'cat-transport', 240 + ((w + month) % 3) * 90, 'Cab to office', 'Uber', 'optimizable', 'UPI'],
        [d + 2, 'cat-transport', 1200, 'Petrol', 'Indian Oil', 'essential', 'Debit Card']
      );
    }
    entries.push(
      [base + 12, 'cat-entertainment', 1499 - month * 200, 'Movie night', 'PVR Inox', 'discretionary', 'Credit Card'],
      [base + 18, 'cat-shopping', 2799 + month * 650, month === 1 ? 'Running shoes' : 'Clothes', month === 1 ? 'Nike' : 'Myntra', 'discretionary', 'Credit Card'],
      [base + 23, 'cat-food', 1850, 'Dinner with friends', 'Toit', 'discretionary', 'Credit Card'],
      [base + 26, 'cat-personal', 600, 'Haircut', 'Looks Salon', 'optimizable', 'UPI']
    );
  }
  entries.push([0, 'cat-food', 180, 'Coffee', 'Third Wave Coffee', 'optimizable', 'UPI']);
  entries.push([1, 'cat-freelance', 12000, 'Logo design project', 'Freelance client', 'essential', 'Net Banking']);

  const stamp = now.toISOString();
  return entries
    .map(([daysAgo, categoryId, amount, description, merchant, essentiality, paymentMethod], i): Transaction => {
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      const income = categoryId === 'cat-salary' || categoryId === 'cat-freelance';
      const purchaseDate = toLocalDateString(date);
      return {
        id: `demo-${i}`,
        user_id: 'demo-user-1',
        category_id: categoryId,
        transaction_type: income ? 'income' : 'expense',
        amount,
        currency: 'INR',
        description,
        merchant,
        payment_method: paymentMethod,
        purchase_date: purchaseDate,
        purchase_time: null,
        occurred_at: `${purchaseDate}T12:00:00`,
        entry_method: i % 5 === 0 ? 'ai_text' : 'manual',
        original_input: null,
        ai_extraction: null,
        essentiality,
        classification_confidence: null,
        classification_reason: null,
        user_corrected_classification: false,
        review_status: 'confirmed',
        created_at: stamp,
        updated_at: stamp,
      };
    })
    .filter((t) => t.purchase_date <= toLocalDateString(now))
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
}

export const DataService = {
  // Profiles
  async getProfile(): Promise<Profile> {
    if (!isSandbox()) return (await api<{ profile: Profile }>('/api/profile')).profile;
    return readLocal<Profile>(LOCAL_STORAGE_PROFILE, DEMO_PROFILE);
  },

  async updateProfile(profile: Partial<Profile>): Promise<Profile> {
    if (!isSandbox()) {
      return (await api<{ profile: Profile }>('/api/profile', { method: 'PATCH', body: profile })).profile;
    }
    const current = readLocal<Profile>(LOCAL_STORAGE_PROFILE, DEMO_PROFILE);
    const updated = { ...current, ...profile, updated_at: new Date().toISOString() };
    writeLocal(LOCAL_STORAGE_PROFILE, updated);
    return updated;
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    if (!isSandbox()) return (await api<{ categories: Category[] }>('/api/categories')).categories;
    const custom = readLocal<Category[]>(LOCAL_STORAGE_CATEGORIES, []);
    return [...DEFAULT_SYSTEM_CATEGORIES, ...custom];
  },

  async addCategory(cat: Omit<Category, 'id' | 'created_at'>): Promise<Category> {
    if (!isSandbox()) {
      return (await api<{ category: Category }>('/api/categories', { method: 'POST', body: cat })).category;
    }
    const newCat: Category = { ...cat, id: newLocalId('cat_custom_'), is_system: false, created_at: new Date().toISOString() };
    const custom = readLocal<Category[]>(LOCAL_STORAGE_CATEGORIES, []);
    writeLocal(LOCAL_STORAGE_CATEGORIES, [...custom, newCat]);
    return newCat;
  },

  async deleteCategory(id: string): Promise<boolean> {
    if (!isSandbox()) {
      await api(`/api/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    }
    // Only allow deleting non-system categories
    if (DEFAULT_SYSTEM_CATEGORIES.some((c) => c.id === id)) return false;
    const custom = readLocal<Category[]>(LOCAL_STORAGE_CATEGORIES, []);
    writeLocal(LOCAL_STORAGE_CATEGORIES, custom.filter((c) => c.id !== id));
    return true;
  },

  // Transactions
  async getTransactions(): Promise<Transaction[]> {
    if (!isSandbox()) return (await api<{ transactions: Transaction[] }>('/api/transactions')).transactions;
    const txs = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    const cats = await this.getCategories();
    return txs.map((t) => ({
      ...t,
      category: cats.find((c) => c.id === t.category_id) || DEFAULT_SYSTEM_CATEGORIES[0],
    }));
  },

  async addTransaction(tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<Transaction> {
    if (!isSandbox()) {
      return (await api<{ transaction: Transaction }>('/api/transactions', { method: 'POST', body: tx })).transaction;
    }
    const newTx: Transaction = {
      ...tx,
      id: newLocalId('tx_'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const current = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    writeLocal(LOCAL_STORAGE_TRANSACTIONS, [newTx, ...current]);
    return newTx;
  },

  /** Saves many transactions at once (e.g. a bank statement import), in order. */
  async addTransactions(txs: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]): Promise<Transaction[]> {
    if (txs.length === 0) return [];
    if (!isSandbox()) {
      return (await api<{ transactions: Transaction[] }>('/api/transactions/import', { method: 'POST', body: { transactions: txs } }))
        .transactions;
    }
    const stamp = new Date().toISOString();
    const created: Transaction[] = txs.map((tx) => ({ ...tx, id: newLocalId('tx_'), created_at: stamp, updated_at: stamp }));
    const current = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    writeLocal(LOCAL_STORAGE_TRANSACTIONS, [...created, ...current]);
    return created;
  },

  /** Same change to many transactions (e.g. one answer for every payment to a person). */
  async updateTransactions(
    ids: string[],
    changes: Pick<Partial<Transaction>, 'category_id' | 'essentiality' | 'review_status' | 'user_corrected_classification' | 'notes'>
  ): Promise<void> {
    if (ids.length === 0) return;
    if (!isSandbox()) {
      await api('/api/transactions/bulk', { method: 'PATCH', body: { ids, changes } });
      return;
    }
    const wanted = new Set(ids);
    const stamp = new Date().toISOString();
    const current = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    writeLocal(
      LOCAL_STORAGE_TRANSACTIONS,
      current.map((t) => (wanted.has(t.id) ? { ...t, ...changes, updated_at: stamp } : t))
    );
  },

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | null> {
    if (!isSandbox()) {
      return (
        await api<{ transaction: Transaction }>(`/api/transactions/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: updates,
        })
      ).transaction;
    }
    const current = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    const updated = current.map((t) => (t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t));
    writeLocal(LOCAL_STORAGE_TRANSACTIONS, updated);
    return updated.find((t) => t.id === id) || null;
  },

  async deleteTransaction(id: string): Promise<boolean> {
    if (!isSandbox()) {
      await api(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    }
    const current = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    writeLocal(LOCAL_STORAGE_TRANSACTIONS, current.filter((t) => t.id !== id));
    return true;
  },

  // Budgets
  async getBudgets(): Promise<Budget[]> {
    if (!isSandbox()) return (await api<{ budgets: Budget[] }>('/api/budgets')).budgets;
    return readLocal<Budget[]>(LOCAL_STORAGE_BUDGETS, []);
  },

  async saveBudget(budget: Omit<Budget, 'id' | 'created_at' | 'updated_at'>): Promise<Budget> {
    if (!isSandbox()) return (await api<{ budget: Budget }>('/api/budgets', { method: 'POST', body: budget })).budget;
    const newBudget: Budget = {
      ...budget,
      id: newLocalId('bgt_'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const current = readLocal<Budget[]>(LOCAL_STORAGE_BUDGETS, []);
    writeLocal(LOCAL_STORAGE_BUDGETS, [newBudget, ...current]);
    return newBudget;
  },

  async deleteBudget(id: string): Promise<boolean> {
    if (!isSandbox()) {
      await api(`/api/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    }
    const current = readLocal<Budget[]>(LOCAL_STORAGE_BUDGETS, []);
    writeLocal(LOCAL_STORAGE_BUDGETS, current.filter((b) => b.id !== id));
    return true;
  },

  // Savings Goals
  async getGoals(): Promise<SavingsGoal[]> {
    if (!isSandbox()) return (await api<{ goals: SavingsGoal[] }>('/api/goals')).goals;
    return readLocal<SavingsGoal[]>(LOCAL_STORAGE_GOALS, []);
  },

  async addGoal(goal: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>): Promise<SavingsGoal> {
    if (!isSandbox()) return (await api<{ goal: SavingsGoal }>('/api/goals', { method: 'POST', body: goal })).goal;
    const newGoal: SavingsGoal = {
      ...goal,
      id: newLocalId('goal_'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const current = readLocal<SavingsGoal[]>(LOCAL_STORAGE_GOALS, []);
    writeLocal(LOCAL_STORAGE_GOALS, [newGoal, ...current]);
    return newGoal;
  },

  async updateGoal(id: string, updates: Partial<SavingsGoal>): Promise<SavingsGoal | null> {
    if (!isSandbox()) {
      return (
        await api<{ goal: SavingsGoal }>(`/api/goals/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates })
      ).goal;
    }
    const current = readLocal<SavingsGoal[]>(LOCAL_STORAGE_GOALS, []);
    const updated = current.map((g) => (g.id === id ? { ...g, ...updates, updated_at: new Date().toISOString() } : g));
    writeLocal(LOCAL_STORAGE_GOALS, updated);
    return updated.find((g) => g.id === id) || null;
  },

  async deleteGoal(id: string): Promise<boolean> {
    if (!isSandbox()) {
      await api(`/api/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    }
    const current = readLocal<SavingsGoal[]>(LOCAL_STORAGE_GOALS, []);
    writeLocal(LOCAL_STORAGE_GOALS, current.filter((g) => g.id !== id));
    return true;
  },

  // Seed sample transactions if completely empty in demo mode so the user can see features immediately
  async seedDemoDataIfEmpty(): Promise<void> {
    if (typeof window === 'undefined' || !isSandbox()) return;
    const existing = localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS);
    if (!existing || JSON.parse(existing).length === 0) {
      const sampleTxs = buildDemoTransactions(new Date());
      localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS, JSON.stringify(sampleTxs));

      const stamp = new Date().toISOString();
      const today = toLocalDateString();
      const budget = (id: string, categoryId: string | null, amount: number): Budget => ({
        id,
        user_id: 'demo-user-1',
        category_id: categoryId,
        amount,
        period_type: 'monthly',
        start_date: today,
        end_date: null,
        alert_thresholds: [75, 90, 100],
        created_at: stamp,
        updated_at: stamp,
      });
      const sampleBudgets: Budget[] = [
        budget('bgt-overall', null, 55000),
        budget('bgt-food', 'cat-food', 6000),
        budget('bgt-transport', 'cat-transport', 5500),
        budget('bgt-shopping', 'cat-shopping', 4000),
      ];
      localStorage.setItem(LOCAL_STORAGE_BUDGETS, JSON.stringify(sampleBudgets));

      const goal = (id: string, name: string, target: number, current: number, monthsAhead: number, description: string): SavingsGoal => {
        const due = new Date();
        due.setMonth(due.getMonth() + monthsAhead);
        return {
          id,
          user_id: 'demo-user-1',
          name,
          target_amount: target,
          current_amount: current,
          target_date: toLocalDateString(due),
          description,
          created_at: stamp,
          updated_at: stamp,
        };
      };
      const sampleGoals: SavingsGoal[] = [
        goal('goal-emergency', 'Emergency fund', 300000, 185000, 14, 'Six months of essential expenses'),
        goal('goal-laptop', 'New laptop', 120000, 42000, 6, 'For freelance work'),
        goal('goal-trip', 'Goa trip', 40000, 40000, 2, 'With college friends'),
      ];
      localStorage.setItem(LOCAL_STORAGE_GOALS, JSON.stringify(sampleGoals));
    }
  },
};
