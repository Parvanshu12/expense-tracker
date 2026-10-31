'use client';

import { Transaction, Category, Budget, SavingsGoal, Profile, Essentiality } from '@/types/database';
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

export const DataService = {
  // Profiles
  async getProfile(): Promise<Profile> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          if (data) return data as Profile;
        }
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_PROFILE);
      if (stored) return JSON.parse(stored);
    }

    return {
      id: 'demo-user-1',
      display_name: 'Akshay',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      language: 'en',
      monthly_income: 85000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  async updateProfile(profile: Partial<Profile>): Promise<Profile> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('profiles')
            .update({ ...profile, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .select()
            .single();
          if (!error && data) return data as Profile;
        }
      }
    }

    const current = await this.getProfile();
    const updated = { ...current, ...profile, updated_at: new Date().toISOString() };
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PROFILE, JSON.stringify(updated));
    }
    return updated;
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data } = await supabase.from('categories').select('*');
        if (data && data.length > 0) return data as Category[];
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_CATEGORIES);
      if (stored) {
        const custom: Category[] = JSON.parse(stored);
        return [...DEFAULT_SYSTEM_CATEGORIES, ...custom];
      }
    }

    return DEFAULT_SYSTEM_CATEGORIES;
  },

  async addCategory(cat: Omit<Category, 'id' | 'created_at'>): Promise<Category> {
    const newCat: Category = {
      ...cat,
      id: 'cat_custom_' + Math.random().toString(36).substring(2, 9),
      is_system: false,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('categories')
            .insert({ ...cat, user_id: user.id, is_system: false })
            .select()
            .single();
          if (!error && data) return data as Category;
        }
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_CATEGORIES);
      const custom: Category[] = stored ? JSON.parse(stored) : [];
      const updated = [...custom, newCat];
      localStorage.setItem(LOCAL_STORAGE_CATEGORIES, JSON.stringify(updated));
    }

    return newCat;
  },

  async deleteCategory(id: string): Promise<boolean> {
    // Only allow deleting non-system categories
    if (DEFAULT_SYSTEM_CATEGORIES.some((c) => c.id === id)) {
      return false;
    }

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { error } = await supabase.from('categories').delete().eq('id', id).eq('is_system', false);
        if (!error) return true;
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_CATEGORIES);
      if (stored) {
        const custom: Category[] = JSON.parse(stored);
        const filtered = custom.filter((c) => c.id !== id);
        localStorage.setItem(LOCAL_STORAGE_CATEGORIES, JSON.stringify(filtered));
        return true;
      }
    }
    return false;
  },

  // Transactions
  async getTransactions(): Promise<Transaction[]> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*, category:categories(*)')
          .order('purchase_date', { ascending: false });
        if (!error && data) return data as Transaction[];
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_TRANSACTIONS);
      if (stored) {
        const txs: Transaction[] = JSON.parse(stored);
        // Map category objects
        const cats = await this.getCategories();
        return txs.map(t => ({
          ...t,
          category: cats.find(c => c.id === t.category_id) || DEFAULT_SYSTEM_CATEGORIES[0],
        }));
      }
    }

    return [];
  },

  async addTransaction(tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<Transaction> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('transactions')
            .insert({
              ...tx,
              user_id: user.id,
            })
            .select('*, category:categories(*)')
            .single();

          if (!error && data) return data as Transaction;
        }
      }
    }

    // Local sandbox mode
    const newTx: Transaction = {
      ...tx,
      id: 'tx_' + Math.random().toString(36).substring(2, 9),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      const current = await this.getTransactions();
      const updated = [newTx, ...current];
      localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS, JSON.stringify(updated));
    }

    return newTx;
  },

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | null> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('transactions')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('*, category:categories(*)')
          .single();
        if (!error && data) return data as Transaction;
      }
    }

    if (typeof window !== 'undefined') {
      const current = await this.getTransactions();
      const updated = current.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            ...updates,
            updated_at: new Date().toISOString(),
          };
        }
        return t;
      });
      localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS, JSON.stringify(updated));
      return updated.find((t) => t.id === id) || null;
    }
    return null;
  },

  async deleteTransaction(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (!error) return true;
      }
    }

    if (typeof window !== 'undefined') {
      const current = await this.getTransactions();
      const filtered = current.filter(t => t.id !== id);
      localStorage.setItem(LOCAL_STORAGE_TRANSACTIONS, JSON.stringify(filtered));
      return true;
    }

    return false;
  },

  // Budgets
  async getBudgets(): Promise<Budget[]> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data } = await supabase.from('budgets').select('*, category:categories(*)');
        if (data) return data as Budget[];
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_BUDGETS);
      if (stored) return JSON.parse(stored);
    }

    return [];
  },

  async saveBudget(budget: Omit<Budget, 'id' | 'created_at' | 'updated_at'>): Promise<Budget> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('budgets')
            .insert({ ...budget, user_id: user.id })
            .select('*, category:categories(*)')
            .single();
          if (!error && data) return data as Budget;
        }
      }
    }

    // Local sandbox mode
    const newBudget: Budget = {
      ...budget,
      id: 'bgt_' + Math.random().toString(36).substring(2, 9),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      const current = await this.getBudgets();
      const updated = [newBudget, ...current];
      localStorage.setItem(LOCAL_STORAGE_BUDGETS, JSON.stringify(updated));
    }

    return newBudget;
  },

  async deleteBudget(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { error } = await supabase.from('budgets').delete().eq('id', id);
        if (!error) return true;
      }
    }

    if (typeof window !== 'undefined') {
      const current = await this.getBudgets();
      const filtered = current.filter((b) => b.id !== id);
      localStorage.setItem(LOCAL_STORAGE_BUDGETS, JSON.stringify(filtered));
      return true;
    }
    return false;
  },

  async updateGoal(id: string, updates: Partial<SavingsGoal>): Promise<SavingsGoal | null> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('savings_goals')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (!error && data) return data as SavingsGoal;
      }
    }

    if (typeof window !== 'undefined') {
      const current = await this.getGoals();
      const updated = current.map((g) =>
        g.id === id ? { ...g, ...updates, updated_at: new Date().toISOString() } : g
      );
      localStorage.setItem(LOCAL_STORAGE_GOALS, JSON.stringify(updated));
      return updated.find((g) => g.id === id) || null;
    }
    return null;
  },

  async deleteGoal(id: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { error } = await supabase.from('savings_goals').delete().eq('id', id);
        if (!error) return true;
      }
    }

    if (typeof window !== 'undefined') {
      const current = await this.getGoals();
      const filtered = current.filter((g) => g.id !== id);
      localStorage.setItem(LOCAL_STORAGE_GOALS, JSON.stringify(filtered));
      return true;
    }
    return false;
  },

  // Savings Goals
  async getGoals(): Promise<SavingsGoal[]> {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      if (supabase) {
        const { data } = await supabase.from('savings_goals').select('*');
        if (data) return data as SavingsGoal[];
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_GOALS);
      if (stored) return JSON.parse(stored);
    }

    return [];
  },

  async addGoal(goal: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>): Promise<SavingsGoal> {
    const newGoal: SavingsGoal = {
      ...goal,
      id: 'goal_' + Math.random().toString(36).substring(2, 9),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      const current = await this.getGoals();
      const updated = [newGoal, ...current];
      localStorage.setItem(LOCAL_STORAGE_GOALS, JSON.stringify(updated));
    }

    return newGoal;
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
