// Groups categories into a few "kinds" of purchase, each with a colour.
// This is the one place the otherwise monochrome UI uses hue: the timeline
// legend and the coloured dots on saved expenses.
// Pure and dependency-free (type-only imports) so tests can import it directly.

import type { Category, Transaction } from '../../types/database';

export type PurchaseKind =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'home'
  | 'health'
  | 'shopping'
  | 'fun'
  | 'subscriptions'
  | 'learning'
  | 'money'
  | 'other'
  | 'income';

export interface KindInfo {
  label: string;
  /** Works on both light and dark backgrounds. */
  color: string;
}

export const PURCHASE_KINDS: Record<PurchaseKind, KindInfo> = {
  food: { label: 'Food & dining', color: '#f97316' },
  groceries: { label: 'Groceries', color: '#22c55e' },
  transport: { label: 'Transport', color: '#3b82f6' },
  home: { label: 'Home & bills', color: '#8b5cf6' },
  health: { label: 'Health', color: '#f43f5e' },
  shopping: { label: 'Shopping', color: '#ec4899' },
  fun: { label: 'Fun & travel', color: '#eab308' },
  subscriptions: { label: 'Subscriptions', color: '#06b6d4' },
  learning: { label: 'Learning', color: '#6366f1' },
  money: { label: 'Loans & investing', color: '#64748b' },
  other: { label: 'Other', color: '#a1a1aa' },
  income: { label: 'Income', color: '#10b981' },
};

/** Display order for legends. */
export const KIND_ORDER: PurchaseKind[] = [
  'food',
  'groceries',
  'transport',
  'home',
  'health',
  'shopping',
  'fun',
  'subscriptions',
  'learning',
  'money',
  'other',
  'income',
];

const KIND_BY_CATEGORY_ID: Record<string, PurchaseKind> = {
  'cat-food': 'food',
  'cat-groceries': 'groceries',
  'cat-transport': 'transport',
  'cat-housing': 'home',
  'cat-utilities': 'home',
  'cat-health': 'health',
  'cat-personal': 'health',
  'cat-shopping': 'shopping',
  'cat-gifts': 'shopping',
  'cat-entertainment': 'fun',
  'cat-travel': 'fun',
  'cat-subs': 'subscriptions',
  'cat-education': 'learning',
  'cat-finance': 'money',
  'cat-misc': 'other',
};

/** Best-effort match for custom categories by name. */
const KIND_BY_NAME: [RegExp, PurchaseKind][] = [
  [/food|dining|restaurant|cafe|coffee|lunch|dinner/i, 'food'],
  [/grocer|kirana|vegetable|ration/i, 'groceries'],
  [/transport|travel|cab|fuel|petrol|metro|commute/i, 'transport'],
  [/rent|home|house|utilit|bill|electric|internet|phone/i, 'home'],
  [/health|medic|doctor|pharma|gym|personal/i, 'health'],
  [/shop|cloth|gift|gadget/i, 'shopping'],
  [/entertain|movie|fun|trip|holiday|game/i, 'fun'],
  [/subscri|netflix|spotify|ott/i, 'subscriptions'],
  [/educat|course|book|school|tuition/i, 'learning'],
  [/loan|emi|invest|sip|insur|financ/i, 'money'],
];

export function kindForCategory(category: Pick<Category, 'id' | 'name' | 'category_type'> | null | undefined): PurchaseKind {
  if (!category) return 'other';
  if (category.category_type === 'income') return 'income';
  const byId = KIND_BY_CATEGORY_ID[category.id];
  if (byId) return byId;
  return KIND_BY_NAME.find(([re]) => re.test(category.name))?.[1] ?? 'other';
}

export function kindForTransaction(tx: Pick<Transaction, 'transaction_type' | 'category' | 'category_id'>): PurchaseKind {
  if (tx.transaction_type === 'income') return 'income';
  if (tx.category) return kindForCategory(tx.category);
  return KIND_BY_CATEGORY_ID[tx.category_id] ?? 'other';
}
