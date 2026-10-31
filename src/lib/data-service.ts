'use client';

import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { Transaction, Category, Budget, SavingsGoal, Profile } from '@/types/database';
import { isSupabaseConfigured, createClient } from './supabase/client';

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

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createClient>>;

interface LiveSession {
  supabase: SupabaseBrowserClient;
  userId: string;
}

/**
 * Returns the Supabase client and signed-in user when the app runs against a
 * real database, or null in local sandbox mode (Supabase not configured, or a
 * demo-cookie session with nobody signed in).
 *
 * In live mode every DataService call goes to Supabase and throws on failure.
 * It must never fall back to localStorage: that made failed saves look
 * successful while the data only existed in one browser.
 */
async function getLiveSession(): Promise<LiveSession | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  if (!supabase) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return { supabase, userId: user.id };
  if (error && !isAuthSessionMissingError(error)) {
    throw new Error(`Could not verify your session: ${error.message}`);
  }
  return null;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, action: string): T {
  if (result.error) throw new Error(`Could not ${action}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Could not ${action}: no data returned`);
  return result.data;
}

function throwIfError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`Could not ${action}: ${error.message}`);
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

export const DataService = {
  // Profiles
  async getProfile(): Promise<Profile> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase.from('profiles').select('*').eq('id', live.userId).single();
      return unwrap(result, 'load your profile') as Profile;
    }

    return readLocal<Profile>(LOCAL_STORAGE_PROFILE, DEMO_PROFILE);
  },

  async updateProfile(profile: Partial<Profile>): Promise<Profile> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('profiles')
        .update({ ...profile, updated_at: new Date().toISOString() })
        .eq('id', live.userId)
        .select()
        .single();
      return unwrap(result, 'save your profile') as Profile;
    }

    const current = readLocal<Profile>(LOCAL_STORAGE_PROFILE, DEMO_PROFILE);
    const updated = { ...current, ...profile, updated_at: new Date().toISOString() };
    writeLocal(LOCAL_STORAGE_PROFILE, updated);
    return updated;
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase.from('categories').select('*');
      const categories = unwrap(result, 'load categories') as Category[];
      if (categories.length === 0) {
        throw new Error(
          'No categories found in Supabase. Run supabase/setup_complete.sql to seed the system categories.'
        );
      }
      return categories;
    }

    const custom = readLocal<Category[]>(LOCAL_STORAGE_CATEGORIES, []);
    return [...DEFAULT_SYSTEM_CATEGORIES, ...custom];
  },

  async addCategory(cat: Omit<Category, 'id' | 'created_at'>): Promise<Category> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('categories')
        .insert({ ...cat, user_id: live.userId, is_system: false })
        .select()
        .single();
      return unwrap(result, 'add the category') as Category;
    }

    const newCat: Category = {
      ...cat,
      id: newLocalId('cat_custom_'),
      is_system: false,
      created_at: new Date().toISOString(),
    };
    const custom = readLocal<Category[]>(LOCAL_STORAGE_CATEGORIES, []);
    writeLocal(LOCAL_STORAGE_CATEGORIES, [...custom, newCat]);
    return newCat;
  },

  async deleteCategory(id: string): Promise<boolean> {
    const live = await getLiveSession();
    if (live) {
      const { error } = await live.supabase.from('categories').delete().eq('id', id).eq('is_system', false);
      throwIfError(error, 'delete the category');
      return true;
    }

    // Only allow deleting non-system categories
    if (DEFAULT_SYSTEM_CATEGORIES.some((c) => c.id === id)) {
      return false;
    }
    const custom = readLocal<Category[]>(LOCAL_STORAGE_CATEGORIES, []);
    writeLocal(LOCAL_STORAGE_CATEGORIES, custom.filter((c) => c.id !== id));
    return true;
  },

  // Transactions
  async getTransactions(): Promise<Transaction[]> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .order('purchase_date', { ascending: false });
      return unwrap(result, 'load transactions') as Transaction[];
    }

    const txs = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    const cats = await this.getCategories();
    return txs.map((t) => ({
      ...t,
      category: cats.find((c) => c.id === t.category_id) || DEFAULT_SYSTEM_CATEGORIES[0],
    }));
  },

  async addTransaction(tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<Transaction> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('transactions')
        .insert({ ...tx, user_id: live.userId })
        .select('*, category:categories(*)')
        .single();
      return unwrap(result, 'save the transaction') as Transaction;
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

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | null> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('transactions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, category:categories(*)')
        .single();
      return unwrap(result, 'update the transaction') as Transaction;
    }

    const current = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    const updated = current.map((t) =>
      t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
    );
    writeLocal(LOCAL_STORAGE_TRANSACTIONS, updated);
    return updated.find((t) => t.id === id) || null;
  },

  async deleteTransaction(id: string): Promise<boolean> {
    const live = await getLiveSession();
    if (live) {
      const { error } = await live.supabase.from('transactions').delete().eq('id', id);
      throwIfError(error, 'delete the transaction');
      return true;
    }

    const current = readLocal<Transaction[]>(LOCAL_STORAGE_TRANSACTIONS, []);
    writeLocal(LOCAL_STORAGE_TRANSACTIONS, current.filter((t) => t.id !== id));
    return true;
  },

  // Budgets
  async getBudgets(): Promise<Budget[]> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase.from('budgets').select('*, category:categories(*)');
      return unwrap(result, 'load budgets') as Budget[];
    }

    return readLocal<Budget[]>(LOCAL_STORAGE_BUDGETS, []);
  },

  async saveBudget(budget: Omit<Budget, 'id' | 'created_at' | 'updated_at'>): Promise<Budget> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('budgets')
        .insert({ ...budget, user_id: live.userId })
        .select('*, category:categories(*)')
        .single();
      return unwrap(result, 'save the budget') as Budget;
    }

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
    const live = await getLiveSession();
    if (live) {
      const { error } = await live.supabase.from('budgets').delete().eq('id', id);
      throwIfError(error, 'delete the budget');
      return true;
    }

    const current = readLocal<Budget[]>(LOCAL_STORAGE_BUDGETS, []);
    writeLocal(LOCAL_STORAGE_BUDGETS, current.filter((b) => b.id !== id));
    return true;
  },

  // Savings Goals
  async getGoals(): Promise<SavingsGoal[]> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('savings_goals')
        .select('*')
        .order('created_at', { ascending: false });
      return unwrap(result, 'load savings goals') as SavingsGoal[];
    }

    return readLocal<SavingsGoal[]>(LOCAL_STORAGE_GOALS, []);
  },

  async addGoal(goal: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>): Promise<SavingsGoal> {
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('savings_goals')
        .insert({ ...goal, user_id: live.userId })
        .select()
        .single();
      return unwrap(result, 'save the savings goal') as SavingsGoal;
    }

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
    const live = await getLiveSession();
    if (live) {
      const result = await live.supabase
        .from('savings_goals')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      return unwrap(result, 'update the savings goal') as SavingsGoal;
    }

    const current = readLocal<SavingsGoal[]>(LOCAL_STORAGE_GOALS, []);
    const updated = current.map((g) =>
      g.id === id ? { ...g, ...updates, updated_at: new Date().toISOString() } : g
    );
    writeLocal(LOCAL_STORAGE_GOALS, updated);
    return updated.find((g) => g.id === id) || null;
  },

  async deleteGoal(id: string): Promise<boolean> {
    const live = await getLiveSession();
    if (live) {
      const { error } = await live.supabase.from('savings_goals').delete().eq('id', id);
      throwIfError(error, 'delete the savings goal');
      return true;
    }

    const current = readLocal<SavingsGoal[]>(LOCAL_STORAGE_GOALS, []);
    writeLocal(LOCAL_STORAGE_GOALS, current.filter((g) => g.id !== id));
    return true;
  },

  // Seed sample transactions if completely empty in demo mode so the user can see features immediately
  async seedDemoDataIfEmpty(): Promise<void> {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS);
    if (!existing || JSON.parse(existing).length === 0) {
      const sampleTxs: Transaction[] = [
        {
          id: 'demo-1',
          user_id: 'demo-user-1',
          category_id: 'cat-salary',
          transaction_type: 'income',
          amount: 85000,
          currency: 'INR',
          description: 'Monthly Salary Credit',
          merchant: 'Tech Corp India',
          payment_method: 'Direct Bank Transfer',
          purchase_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          purchase_time: '10:00:00',
          occurred_at: new Date().toISOString(),
          entry_method: 'manual',
          original_input: null,
          ai_extraction: null,
          essentiality: 'essential',
          classification_confidence: 1.0,
          classification_reason: 'Regular verified monthly employment income',
          user_corrected_classification: false,
          review_status: 'confirmed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'demo-2',
          user_id: 'demo-user-1',
          category_id: 'cat-housing',
          transaction_type: 'expense',
          amount: 22000,
          currency: 'INR',
          description: 'Apartment Monthly Rent',
          merchant: 'Landlord',
          payment_method: 'UPI',
          purchase_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          purchase_time: '11:30:00',
          occurred_at: new Date().toISOString(),
          entry_method: 'manual',
          original_input: null,
          ai_extraction: null,
          essentiality: 'essential',
          classification_confidence: 0.98,
          classification_reason: 'Basic shelter and housing obligation',
          user_corrected_classification: false,
          review_status: 'confirmed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'demo-3',
          user_id: 'demo-user-1',
          category_id: 'cat-groceries',
          transaction_type: 'expense',
          amount: 3450,
          currency: 'INR',
          description: 'Weekly Supermarket Supplies',
          merchant: 'Nature Basket',
          payment_method: 'Credit Card',
          purchase_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          purchase_time: '17:45:00',
          occurred_at: new Date().toISOString(),
          entry_method: 'ai_text',
          original_input: 'Spent 3450 at Nature Basket for weekly groceries',
          ai_extraction: null,
          essentiality: 'essential',
          classification_confidence: 0.95,
          classification_reason: 'Core sustenance nutrition',
          user_corrected_classification: false,
          review_status: 'confirmed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'demo-4',
          user_id: 'demo-user-1',
          category_id: 'cat-food',
          transaction_type: 'expense',
          amount: 850,
          currency: 'INR',
          description: 'Gourmet Pizza Dinner',
          merchant: 'Swiggy',
          payment_method: 'UPI',
          purchase_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          purchase_time: '20:15:00',
          occurred_at: new Date().toISOString(),
          entry_method: 'ai_voice',
          original_input: 'Order pizza on swiggy for 850',
          ai_extraction: null,
          essentiality: 'optimizable',
          classification_confidence: 0.88,
          classification_reason: 'Restaurant delivery is optimizable compared to home cooking',
          user_corrected_classification: false,
          review_status: 'confirmed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'demo-5',
          user_id: 'demo-user-1',
          category_id: 'cat-entertainment',
          transaction_type: 'expense',
          amount: 1499,
          currency: 'INR',
          description: 'Weekend IMAX Movie & Popcorn',
          merchant: 'PVR Inox',
          payment_method: 'Credit Card',
          purchase_date: new Date().toISOString().split('T')[0],
          purchase_time: '21:00:00',
          occurred_at: new Date().toISOString(),
          entry_method: 'manual',
          original_input: null,
          ai_extraction: null,
          essentiality: 'discretionary',
          classification_confidence: 0.95,
          classification_reason: 'Optional leisure entertainment',
          user_corrected_classification: false,
          review_status: 'confirmed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS, JSON.stringify(sampleTxs));

      // Sample budgets
      const sampleBudgets: Budget[] = [
        {
          id: 'bgt-overall',
          user_id: 'demo-user-1',
          category_id: null,
          amount: 55000,
          period_type: 'monthly',
          start_date: new Date().toISOString().split('T')[0],
          end_date: null,
          alert_thresholds: [75, 90, 100],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'bgt-food',
          user_id: 'demo-user-1',
          category_id: 'cat-food',
          amount: 8000,
          period_type: 'monthly',
          start_date: new Date().toISOString().split('T')[0],
          end_date: null,
          alert_thresholds: [75, 90, 100],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      localStorage.setItem(LOCAL_STORAGE_BUDGETS, JSON.stringify(sampleBudgets));

      // Sample goal
      const sampleGoals: SavingsGoal[] = [
        {
          id: 'goal-emergency',
          user_id: 'demo-user-1',
          name: 'Emergency Fund (6 Months)',
          target_amount: 300000,
          current_amount: 185000,
          target_date: '2027-12-31',
          description: '6 months of essential living expenses safely in liquid reserves',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      localStorage.setItem(LOCAL_STORAGE_GOALS, JSON.stringify(sampleGoals));
    }
  },
};
