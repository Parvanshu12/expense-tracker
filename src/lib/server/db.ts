import 'server-only';
import type { Budget, Category, Profile, SavingsGoal, Transaction } from '@/types/database';
import type { UserRow } from './auth';
import { ApiError } from './http';

type Row = Record<string, unknown>;

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toProfile(user: UserRow): Profile {
  return {
    id: user.id,
    display_name: user.display_name,
    currency: user.currency,
    timezone: user.timezone,
    language: user.language,
    monthly_income: user.monthly_income,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export function toCategory(row: Row): Category {
  return {
    id: row.id as string,
    user_id: (row.user_id as string | null) ?? null,
    name: row.name as string,
    category_type: row.category_type as Category['category_type'],
    icon: (row.icon as string | null) ?? null,
    is_system: Boolean(row.is_system),
    created_at: row.created_at as string,
  };
}

/** Transactions are selected with the category joined under `c_*` columns. */
export const TRANSACTION_SELECT = `
  SELECT t.*, c.id AS c_id, c.user_id AS c_user_id, c.name AS c_name, c.category_type AS c_category_type,
         c.icon AS c_icon, c.is_system AS c_is_system, c.created_at AS c_created_at
  FROM transactions t JOIN categories c ON c.id = t.category_id`;

export function toTransaction(row: Row): Transaction {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    category_id: row.category_id as string,
    category: toCategory({
      id: row.c_id,
      user_id: row.c_user_id,
      name: row.c_name,
      category_type: row.c_category_type,
      icon: row.c_icon,
      is_system: row.c_is_system,
      created_at: row.c_created_at,
    }),
    transaction_type: row.transaction_type as Transaction['transaction_type'],
    amount: Number(row.amount),
    currency: row.currency as string,
    description: row.description as string,
    merchant: (row.merchant as string | null) ?? null,
    payment_method: (row.payment_method as string | null) ?? null,
    purchase_date: row.purchase_date as string,
    purchase_time: (row.purchase_time as string | null) ?? null,
    occurred_at: row.occurred_at as string,
    entry_method: row.entry_method as Transaction['entry_method'],
    original_input: (row.original_input as string | null) ?? null,
    ai_extraction: row.ai_extraction ? JSON.parse(row.ai_extraction as string) : null,
    essentiality: row.essentiality as Transaction['essentiality'],
    classification_confidence: row.classification_confidence === null ? null : Number(row.classification_confidence),
    classification_reason: (row.classification_reason as string | null) ?? null,
    user_corrected_classification: Boolean(row.user_corrected_classification),
    review_status: row.review_status as Transaction['review_status'],
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function toBudget(row: Row): Budget {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    category_id: (row.category_id as string | null) ?? null,
    amount: Number(row.amount),
    period_type: row.period_type as Budget['period_type'],
    start_date: row.start_date as string,
    end_date: (row.end_date as string | null) ?? null,
    alert_thresholds: JSON.parse((row.alert_thresholds as string) || '[75,90,100]'),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function toGoal(row: Row): SavingsGoal {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    target_amount: Number(row.target_amount),
    current_amount: Number(row.current_amount),
    target_date: row.target_date as string,
    description: (row.description as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** A category the user may use: a system one, or one they created. Optionally of a given type. */
export async function assertCategoryUsable(
  db: D1Database,
  userId: string,
  categoryId: string,
  type?: Category['category_type']
): Promise<void> {
  const row = await db
    .prepare('SELECT category_type FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)')
    .bind(categoryId, userId)
    .first<{ category_type: string }>();
  if (!row) throw new ApiError(400, 'That category does not exist.');
  if (type && row.category_type !== type) {
    throw new ApiError(400, `That category is for ${row.category_type}, not ${type}.`);
  }
}

/** Builds `SET a = ?, b = ?` from a partial object of allowed columns. */
export function updateSet(values: Record<string, unknown>): { sql: string; params: unknown[] } {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  return {
    sql: keys.map((k) => `${k} = ?`).join(', '),
    params: keys.map((k) => {
      const v = values[k];
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v !== null && typeof v === 'object') return JSON.stringify(v);
      return v;
    }),
  };
}
