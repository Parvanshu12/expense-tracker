import 'server-only';
import { z } from 'zod';
import { MAIN_GOAL_IDS } from '@/lib/main-goals';
import { USER_TYPE_IDS } from '@/lib/user-types';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'must be HH:MM');
const money = z.number().positive().max(1e11);
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional().transform((v) => (v ? v : null));

export const essentiality = z.enum(['essential', 'optimizable', 'discretionary']);

export const transactionCreate = z.object({
  category_id: z.string().min(1).max(64),
  transaction_type: z.enum(['expense', 'income']),
  amount: money,
  currency: text(8).default('INR'),
  description: text(200).min(1),
  merchant: optionalText(120),
  payment_method: optionalText(40),
  purchase_date: date,
  purchase_time: time.nullable().optional().transform((v) => v ?? null),
  occurred_at: text(40).optional(),
  entry_method: z.enum(['manual', 'ai_text', 'ai_voice']).default('manual'),
  original_input: optionalText(1000),
  ai_extraction: z.record(z.string(), z.unknown()).nullable().optional().transform((v) => v ?? null),
  essentiality: essentiality.default('essential'),
  classification_confidence: z.number().min(0).max(1).nullable().optional().transform((v) => v ?? null),
  classification_reason: optionalText(500),
  user_corrected_classification: z.boolean().default(false),
  review_status: z.enum(['confirmed', 'pending_review', 'rejected']).default('confirmed'),
  notes: optionalText(1000),
});

export const transactionUpdate = z
  .object({
    category_id: z.string().min(1).max(64),
    amount: money,
    description: text(200).min(1),
    merchant: optionalText(120),
    payment_method: optionalText(40),
    purchase_date: date,
    purchase_time: time.nullable(),
    essentiality,
    user_corrected_classification: z.boolean(),
    review_status: z.enum(['confirmed', 'pending_review', 'rejected']),
    notes: optionalText(1000),
  })
  .partial();

export const budgetCreate = z.object({
  category_id: z.string().min(1).max(64).nullable(),
  amount: money,
  period_type: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  start_date: date,
  end_date: date.nullable().optional().transform((v) => v ?? null),
  alert_thresholds: z.array(z.number().int().min(1).max(200)).max(5).default([75, 90, 100]),
});

export const goalCreate = z.object({
  name: text(100).min(1),
  target_amount: money,
  current_amount: z.number().min(0).max(1e11).default(0),
  target_date: date,
  description: optionalText(500),
});

export const goalUpdate = goalCreate.partial();

export const categoryCreate = z.object({
  name: text(40).min(1),
  category_type: z.enum(['expense', 'income']),
  icon: optionalText(40),
});

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const profileUpdate = z
  .object({
    display_name: optionalText(60),
    currency: z.string().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code'),
    timezone: z.string().max(64).refine(isTimeZone, 'is not a known time zone'),
    language: z.enum(['en', 'hinglish']),
    monthly_income: z.number().min(0).max(1e11).nullable(),
    main_goals: z.array(z.enum(MAIN_GOAL_IDS)).max(MAIN_GOAL_IDS.length),
    user_type: z.enum(USER_TYPE_IDS).nullable(),
  })
  .partial();

export const email = z.string().trim().toLowerCase().email('is not a valid email').max(254);
export const password = z.string().min(8, 'must be at least 8 characters').max(128);
