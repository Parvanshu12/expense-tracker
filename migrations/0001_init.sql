-- SpendWise schema for Cloudflare D1 (SQLite).
-- Money is stored as REAL rupees with 2 decimals, dates as ISO strings.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hinglish')),
  monthly_income REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- `id` is the SHA-256 of the cookie token, so a leaked table can't be replayed.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- System categories have user_id NULL and fixed ids shared with sandbox mode.
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('expense', 'income')),
  icon TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_categories_user ON categories(user_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income')),
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  description TEXT NOT NULL,
  merchant TEXT,
  payment_method TEXT,
  purchase_date TEXT NOT NULL,
  purchase_time TEXT,
  occurred_at TEXT NOT NULL,
  entry_method TEXT NOT NULL DEFAULT 'manual' CHECK (entry_method IN ('manual', 'ai_text', 'ai_voice')),
  original_input TEXT,
  ai_extraction TEXT,
  essentiality TEXT NOT NULL DEFAULT 'essential' CHECK (essentiality IN ('essential', 'optimizable', 'discretionary')),
  classification_confidence REAL,
  classification_reason TEXT,
  user_corrected_classification INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (review_status IN ('confirmed', 'pending_review', 'rejected')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, purchase_date DESC);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  alert_thresholds TEXT NOT NULL DEFAULT '[75,90,100]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_budgets_user ON budgets(user_id);

CREATE TABLE savings_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL CHECK (target_amount > 0),
  current_amount REAL NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_goals_user ON savings_goals(user_id);

INSERT INTO categories (id, user_id, name, category_type, icon, is_system) VALUES
  ('cat-food', NULL, 'Food & Dining', 'expense', 'Utensils', 1),
  ('cat-groceries', NULL, 'Groceries', 'expense', 'ShoppingCart', 1),
  ('cat-transport', NULL, 'Transportation', 'expense', 'Car', 1),
  ('cat-housing', NULL, 'Housing & Rent', 'expense', 'Home', 1),
  ('cat-utilities', NULL, 'Utilities', 'expense', 'Zap', 1),
  ('cat-health', NULL, 'Healthcare', 'expense', 'HeartPulse', 1),
  ('cat-shopping', NULL, 'Shopping', 'expense', 'ShoppingBag', 1),
  ('cat-entertainment', NULL, 'Entertainment', 'expense', 'Film', 1),
  ('cat-education', NULL, 'Education', 'expense', 'GraduationCap', 1),
  ('cat-travel', NULL, 'Travel', 'expense', 'Plane', 1),
  ('cat-personal', NULL, 'Personal Care', 'expense', 'Sparkles', 1),
  ('cat-subs', NULL, 'Subscriptions', 'expense', 'Repeat', 1),
  ('cat-finance', NULL, 'Financial Obligations', 'expense', 'Landmark', 1),
  ('cat-gifts', NULL, 'Gifts & Donations', 'expense', 'Gift', 1),
  ('cat-misc', NULL, 'Miscellaneous', 'expense', 'MoreHorizontal', 1),
  ('cat-salary', NULL, 'Salary', 'income', 'Briefcase', 1),
  ('cat-freelance', NULL, 'Freelance Income', 'income', 'Laptop', 1),
  ('cat-business', NULL, 'Business Income', 'income', 'Building2', 1),
  ('cat-allowance', NULL, 'Allowance', 'income', 'Coins', 1),
  ('cat-gifts-rec', NULL, 'Gifts Received', 'income', 'Gift', 1),
  ('cat-other-inc', NULL, 'Other Income', 'income', 'Wallet', 1);
