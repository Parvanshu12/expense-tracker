export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Essentiality = 'essential' | 'optimizable' | 'discretionary';
export type TransactionType = 'expense' | 'income';
export type EntryMethod = 'manual' | 'ai_text' | 'ai_voice';
export type PeriodType = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type CategoryType = 'expense' | 'income';

export interface Profile {
  id: string;
  display_name: string | null;
  currency: string;
  timezone: string;
  language: string;
  monthly_income: number | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null; // null for system categories
  name: string;
  category_type: CategoryType;
  icon: string | null;
  is_system: boolean;
  created_at: string;
}

export interface AiExtractionData {
  transaction_type: TransactionType;
  amount: number | null;
  currency: string;
  description: string;
  merchant: string | null;
  category: string;
  purchase_date: string | null;
  purchase_time: string | null;
  payment_method: string | null;
  essentiality: Essentiality;
  confidence: number;
  reasoning?: string;
  needs_clarification?: boolean;
  clarification_question?: string | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string;
  category?: Category;
  transaction_type: TransactionType;
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  payment_method: string | null;
  purchase_date: string; // YYYY-MM-DD
  purchase_time: string | null; // HH:mm:ss
  occurred_at: string; // ISO timestamptz
  entry_method: EntryMethod;
  original_input: string | null;
  ai_extraction: AiExtractionData | null;
  essentiality: Essentiality;
  classification_confidence: number | null;
  classification_reason: string | null;
  user_corrected_classification: boolean;
  review_status: 'confirmed' | 'pending_review' | 'rejected';
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null; // null for overall monthly budget
  category?: Category;
  amount: number;
  period_type: PeriodType;
  start_date: string;
  end_date: string | null;
  alert_thresholds: number[]; // e.g. [75, 90, 100]
  created_at: string;
  updated_at: string;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavingsContribution {
  id: string;
  user_id: string;
  goal_id: string;
  amount: number;
  contribution_date: string;
  notes: string | null;
  created_at: string;
}

export interface RecurringExpense {
  id: string;
  user_id: string;
  category_id: string;
  category?: Category;
  description: string;
  amount: number;
  currency: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_due_date: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinancialPreference {
  id: string;
  user_id: string;
  preferred_currency: string;
  timezone: string;
  language: string;
  monthly_budget: number | null;
  created_at: string;
  updated_at: string;
}
