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
  /** The category for the first waiting item, when the message explains what it was for. */
  answer?: { category_id: string; category: string } | null;
  /** "Map all Prince Kumar payments to travel": file everything to/from this payee under one category. */
  rule?: EntryRule | null;
  source: 'workers-ai' | 'heuristic';
}

export interface EntryRule {
  /** The name as the user wrote it (may have typos; the client matches it loosely). */
  payee: string;
  category_id: string;
  category: string;
  transaction_type: 'expense' | 'income';
}

export interface StatementResponse {
  items: EntryItem[];
  truncated: boolean;
}

/** A background statement import (one Cloudflare Workflow run). */
export interface ImportJob {
  id: string;
  filename: string;
  status: 'queued' | 'reading' | 'extracting' | 'saving' | 'done' | 'failed' | 'undone';
  total_pages: number;
  pages_done: number;
  found: number;
  added: number;
  skipped: number;
  needs_review: number;
  events: { at: string; text: string }[];
  skipped_rows: { description: string; amount: number; date: string; matched: string }[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptResponse {
  items: EntryItem[];
  reply: string;
  feedback: string | null;
  /** One line on what the photo shows. */
  seen: string;
}
