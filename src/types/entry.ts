import type { Essentiality, TransactionType } from './database';

/** A transaction draft produced from one chat message. */
export interface EntryItem {
  /** Set when this completes an item the client was waiting on. */
  ref: string | null;
  transaction_type: TransactionType;
  amount: number | null;
  description: string;
  merchant: string | null;
  category_id: string;
  category: string;
  purchase_date: string;
  payment_method: string | null;
  essentiality: Essentiality;
  confidence: number;
  /** What the user still has to tell us before this can be saved. */
  needs: 'amount' | 'category' | null;
  /** Present when `needs` is set: what to ask the user. */
  question: string | null;
  /** Tap-to-answer choices (category names) for category questions. */
  options: string[];
}

/** Optional facts that help the AI interpret messages and give fitting feedback. */
export interface EntryProfile {
  userType?: string | null;
  monthlyIncome?: number | null;
  goals?: string[];
}

export interface EntryContext {
  monthSpentByCategory?: Record<string, number>;
  budgets?: { category: string; limit: number; spent: number }[];
}

export interface EntryResponse {
  items: EntryItem[];
  reply: string;
  /** One friendly sentence about what was recorded (no numbers). */
  feedback: string | null;
  source: 'workers-ai' | 'heuristic';
}

export interface StatementResponse {
  items: EntryItem[];
  truncated: boolean;
}

export interface ReceiptResponse {
  items: EntryItem[];
  reply: string;
  feedback: string | null;
  /** One line on what the photo shows. */
  seen: string;
}
