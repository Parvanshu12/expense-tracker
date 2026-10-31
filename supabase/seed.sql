-- SpendWise AI: System Seed Categories
-- These are default system categories accessible to all authenticated users.

INSERT INTO public.categories (name, category_type, icon, is_system, user_id) VALUES
  -- Expense Categories
  ('Food & Dining', 'expense', 'Utensils', true, NULL),
  ('Groceries', 'expense', 'ShoppingCart', true, NULL),
  ('Transportation', 'expense', 'Car', true, NULL),
  ('Housing & Rent', 'expense', 'Home', true, NULL),
  ('Utilities', 'expense', 'Zap', true, NULL),
  ('Healthcare', 'expense', 'HeartPulse', true, NULL),
  ('Shopping', 'expense', 'ShoppingBag', true, NULL),
  ('Entertainment', 'expense', 'Film', true, NULL),
  ('Education', 'expense', 'GraduationCap', true, NULL),
  ('Travel', 'expense', 'Plane', true, NULL),
  ('Personal Care', 'expense', 'Sparkles', true, NULL),
  ('Subscriptions', 'expense', 'Repeat', true, NULL),
  ('Financial Obligations', 'expense', 'Landmark', true, NULL),
  ('Gifts & Donations', 'expense', 'Gift', true, NULL),
  ('Miscellaneous', 'expense', 'MoreHorizontal', true, NULL),

  -- Income Categories
  ('Salary', 'income', 'Briefcase', true, NULL),
  ('Freelance Income', 'income', 'Laptop', true, NULL),
  ('Business Income', 'income', 'Building2', true, NULL),
  ('Allowance', 'income', 'Coins', true, NULL),
  ('Gifts Received', 'income', 'Gift', true, NULL),
  ('Other Income', 'income', 'Wallet', true, NULL)
ON CONFLICT DO NOTHING;
