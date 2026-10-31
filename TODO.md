# SpendWise AI — Development Roadmap & TODO

## Status Overview
- [x] **Phase 1: Project Foundation & Layout**
  - [x] Initialize Next.js 16+ (App Router, TypeScript, Tailwind CSS, Lucide icons, component library).
  - [x] Set up fintech design system (light/dark theme, typography, color tokens).
  - [x] Implement persistent responsive navigation (Desktop sidebar, Mobile navigation, Header).
  - [x] Scaffold core routes: Dashboard, Transactions, Add Expense, Budgets, AI Insights, Reports, Goals, Wealth Simulator, Settings, Auth.
  - [x] Set up Supabase SSR architecture (`@supabase/ssr`), `.env.example`, `.env.local`, and PostgreSQL migration schemas with RLS.
  - [x] Documentation & README for running locally and connecting Supabase.

- [x] **Phase 2: Authentication & User Profiles**
  - [x] Supabase Auth (Sign Up, Login, Forgot Password, Session management).
  - [x] Onboarding flow (Display name, INR currency default, Asia/Kolkata timezone, optional income/budget).
  - [x] User profile and financial preferences storage with RLS policies.
  - [x] Seamless local sandbox fallback mode for immediate development and testing without remote credentials.

- [x] **Phase 3: Core Transaction Management**
  - [x] Manual transaction entry (Income/Expense, categories, tags, payment methods, timestamps).
  - [x] System & custom user categories with ownership checks.
  - [x] Transaction ledger with search, multi-filter (type, category, essentiality), and date/amount sorting.
  - [x] Delete with confirmation dialog and ledger synchronization.

- [x] **Phase 4: Smart AI & Voice Expense Capture**
  - [x] Server-side AI extraction endpoint (`/api/ai/extract` with OpenAI structured JSON schema + deterministic heuristic rule parser fallback).
  - [x] Natural language parser (extracting amount, merchant, category, essentiality, confidence).
  - [x] Browser Web Speech API integration for one-tap voice transcription with graceful fallback.
  - [x] Interactive review & confirmation drawer before saving (preserves raw input vs. confirmed data).

- [x] **Phase 5: Dashboard Analytics & Budget Management**
  - [x] Financial KPIs (Total Income, Total Expenses, Remaining Balance, Actual Savings, Budget Utilization).
  - [x] Recharts visualizations (Spending trends, Income vs Expense, Category breakdown, Essentiality breakdown).
  - [x] Budget builder (Overall & category-specific) with 75%, 90%, 100% threshold alert badges.

- [x] **Phase 6: AI Spending Insights, Coach & Reports**
  - [x] Deterministic mathematical analysis engine + qualitative AI narrative generator.
  - [x] Interactive AI spending coach chat interface (RAG over user's aggregate spending).
  - [x] Reports generator (Weekly, Monthly, Annual) with CSV export and print styling.

- [x] **Phase 7: Savings Goals & Wealth Simulator**
  - [x] Savings goals tracker (Emergency fund, purchases, target dates, progress bar, suggested monthly contributions).
  - [x] Actual savings vs. Potential savings scenario calculator.
  - [x] Educational compound interest wealth projection simulator (5–20 yrs, chart comparisons, disclaimers).

- [x] **Phase 8: Quality Assurance, Security & Deployment**
  - [x] Unit & calculation tests (math formulas, date/timezone handling, RLS isolation verification).
  - [x] Production build validation (`npm run build`), zero TypeScript/lint errors.
