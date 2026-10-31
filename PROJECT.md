# SpendWise AI — Comprehensive Technical & Architecture Reference

> **Purpose of this document:** This file is the single source of truth for **SpendWise AI**. If you are an AI assistant, developer, or engineer taking over this project on a new laptop, workspace, or IDE, reading this document gives you a complete, unambiguous understanding of the system architecture, database design, calculations, authentication flows, fallback mechanisms, and future roadmap.

---

## 1. Executive Summary & Vision

- **Product Name:** SpendWise AI
- **Tagline:** Understand Your Spending. Make Smarter Money Decisions.
- **Goal:** A modern, privacy-first personal expense intelligence web application designed to help individuals track their income and expenses, analyze spending habits into essential vs. discretionary buckets, manage budgets with proactive alert thresholds, record voice/text expenses via AI, and simulate long-term wealth growth under compound interest.
- **Primary Market / Defaults:**
  - **Currency:** INR (₹)
  - **Timezone:** `Asia/Kolkata` (IST)
  - **Languages Supported:** English (`en`) and Hinglish (`hinglish`)
  - **Platform:** Web-first (responsive across desktop, tablet, and mobile browsers).

---

## 2. Technology Stack & Dependencies

| Layer | Technologies | Details |
|---|---|---|
| **Framework** | Next.js 16.4.3 (App Router) | React 19, Turbopack, SSR + Client Components |
| **Language** | TypeScript | Strict type checking (`tsconfig.json`) |
| **Styling & UI** | Tailwind CSS v4, Lucide React, `next-themes` | Light/Dark theme support, fintech SaaS design |
| **Charts & Analytics**| Recharts | Interactive Bar charts, Donut/Pie charts, responsive containers |
| **Database & Auth** | Supabase (PostgreSQL 15+) | Row Level Security (RLS), Supabase Auth, `@supabase/ssr` |
| **AI Integration** | OpenAI API (`gpt-4o-mini`) + Heuristic Parser | Server-side structured extraction, Zod validation, Hinglish support |
| **Data Layer** | Hybrid Data Service (`src/lib/data-service.ts`) | Uses Supabase when a user is signed in, localStorage in sandbox mode; never mixes the two |
| **Testing** | Node.js Test Runner (`node:test`, `node:assert`) | Deterministic unit tests in `tests/calculations.test.mjs` |

---

## 3. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                            │
│  - React 19 / Next.js Client Components ('use client')                 │
│  - SpeechRecognition API (Voice input)                                 │
│  - Recharts Visualizations & Local State                               │
└───────────────────▲──────────────────────────────────▲─────────────────┘
                    │ HTTPS                            │ API calls
                    │                                  │
┌───────────────────▼──────────────────────┐ ┌─────────▼─────────────────┐
│       NEXT.JS SSR & MIDDLEWARE           │ │  API ROUTE: /api/ai/extract  │
│  - src/middleware.ts                     │ │  - Server-side only          │
│  - src/lib/supabase/middleware.ts        │ │  - OpenAI API (if configured)│
│  - Session check & Demo cookie bypass    │ │  - Hinglish heuristic parser │
└───────────────────▲──────────────────────┘ └───────────────────────────┘
                    │
                    │ @supabase/ssr / REST API
                    │
┌───────────────────▼────────────────────────────────────────────────────┐
│                       SUPABASE POSTGRESQL (CLOUD)                       │
│  - Tables: profiles, categories, transactions, budgets, savings_goals  │
│  - Security: Row Level Security (RLS) active on all tables             │
│  - Auto-Profile Trigger: on_auth_user_created                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Complete Project Directory Structure

```
c:\Users\aksha\Documents\Projects\Expense Tracker\
├── .env.local                   # Active credentials (Supabase URL, Anon Key, Service Role, OpenAI)
├── .env.example                 # Example template for setting up credentials
├── .gitignore                   # Ignores node_modules, .next, .env.local
├── package.json                 # Scripts: dev, build, start, lint, test
├── tsconfig.json                # TypeScript compiler configuration (path alias @/* -> ./src/*)
├── PROJECT.md                   # THIS FILE: Exhaustive engineering guide
├── README.md                    # Quickstart guide
├── TODO.md                      # Feature & implementation checklist
├── tests/
│   └── calculations.test.mjs    # Tests for finance.ts (imported directly) plus AI parsing
├── supabase/
│   ├── setup_complete.sql       # COMPLETE MIGRATION SCRIPT (Tables, RLS, Triggers, Seed)
│   ├── seed.sql                 # Default categories seed
│   └── migrations/
│       └── 20261031_000001_initial_schema.sql # Initial schema
└── src/
    ├── middleware.ts            # Entrypoint Next.js middleware (delegates to updateSession)
    ├── app/
    │   ├── layout.tsx           # Root layout: ThemeProvider, Inter font, Toaster
    │   ├── globals.css          # Tailwind CSS v4 variables & fintech design tokens
    │   ├── page.tsx             # Landing portal page
    │   ├── favicon.ico          # Application favicon
    │   │
    │   ├── (auth)/              # Authentication & Onboarding Routes
    │   │   ├── login/page.tsx           # Login with Supabase + sandbox demo bypass
    │   │   ├── signup/page.tsx          # Signup with confirmation detection
    │   │   ├── forgot-password/page.tsx # Password reset request
    │   │   └── onboarding/page.tsx      # 2-step setup wizard (currency, income, goals)
    │   │
    │   ├── (dashboard)/         # Protected Dashboard Routes
    │   │   ├── layout.tsx               # Dashboard wrapper with Sidebar and Header
    │   │   ├── dashboard/page.tsx       # Main overview: 5 KPI cards, cashflow & essentiality charts
    │   │   ├── transactions/page.tsx    # Transaction ledger: search, filter, edit, delete
    │   │   ├── add-expense/page.tsx     # Smart entry: Natural language AI, Voice, Manual
    │   │   ├── budgets/page.tsx         # Budgets: 75/90/100% threshold alerts, create & delete
    │   │   ├── insights/page.tsx        # AI Coach chat, potential vs actual savings sliders
    │   │   ├── reports/page.tsx         # Weekly/Monthly/Annual reports with CSV export & print
    │   │   ├── goals/page.tsx           # Savings goals with suggested monthly roadmaps
    │   │   ├── wealth-simulator/page.tsx# 20-year compound interest wealth simulator
    │   │   └── settings/page.tsx        # Profile, currency, timezone, language, theme, logout
    │   │
    │   └── api/
    │       └── ai/
    │           └── extract/route.ts     # Server-side AI expense extraction endpoint
    │
    ├── components/
    │   ├── theme-provider.tsx   # Next-themes provider wrapper
    │   ├── layout/
    │   │   ├── sidebar.tsx      # Persistent desktop sidebar & slide-out mobile drawer
    │   │   ├── header.tsx       # Dynamic header: breadcrumbs, date selector, user initials
    │   │   └── dashboard-layout.tsx # Responsive shell container
    │   └── ui/
    │       ├── button.tsx       # Button component with fintech & AI variants
    │       ├── card.tsx         # Card, CardHeader, CardTitle, CardContent, CardFooter
    │       ├── input.tsx        # Styled form input
    │       ├── badge.tsx        # Status badge (success, warning, destructive, essentiality)
    │       └── theme-toggle.tsx # Light/Dark theme toggle button
    │
    ├── lib/
    │   ├── utils.ts             # cn(), formatCurrency(INR), formatDate()
    │   ├── data-service.ts      # UNIFIED DATA LAYER: Supabase (signed in) or localStorage (sandbox)
    │   ├── calculations/
    │   │   └── finance.ts       # Deterministic financial math formulas (FV, savings, essentiality)
    │   └── supabase/
    │       ├── client.ts        # Browser Supabase client (createBrowserClient)
    │       ├── server.ts        # Server Supabase client (createServerClient)
    │       └── middleware.ts    # Session refresher & route protection logic
    │
    └── types/
        ├── database.ts          # TypeScript interfaces for all Supabase tables & enum types
        └── finance.ts           # Financial calculation interfaces (Summary, Category, Projection)
```

---

## 5. Database Schema & Supabase Setup

The entire database definition is bundled in `supabase/setup_complete.sql`.

### Core Tables & Relationships

1. **`profiles`**
   - Linked 1:1 to `auth.users(id)` with `ON DELETE CASCADE`.
   - Fields: `id`, `display_name`, `currency` (default `'INR'`), `timezone` (default `'Asia/Kolkata'`), `language` (`'en'` or `'hinglish'`), `monthly_income`, `created_at`, `updated_at`.
   - **Trigger:** `on_auth_user_created` automatically inserts a profile row when a user signs up.

2. **`categories`**
   - System categories (`user_id IS NULL`, `is_system = true`) are visible to all users.
   - User custom categories (`user_id = auth.uid()`, `is_system = false`) are private.
   - Fields: `id`, `user_id`, `name`, `category_type` (`'expense'` | `'income'`), `icon`, `is_system`, `created_at`.

3. **`transactions`**
   - Primary financial ledger table.
   - Fields: `id`, `user_id`, `category_id`, `transaction_type` (`'expense'` | `'income'`), `amount`, `currency`, `description`, `merchant`, `payment_method`, `purchase_date`, `purchase_time`, `occurred_at`, `entry_method` (`'manual'` | `'ai_text'` | `'ai_voice'`), `original_input`, `ai_extraction` (JSONB), `essentiality` (`'essential'` | `'optimizable'` | `'discretionary'`), `classification_confidence`, `classification_reason`, `user_corrected_classification`, `review_status`, `notes`.
   - Row Level Security: `WHERE auth.uid() = user_id`.

4. **`budgets`**
   - Spending ceilings for a specific category or overall (`category_id IS NULL`).
   - Fields: `id`, `user_id`, `category_id`, `amount`, `period_type` (`'monthly'`), `start_date`, `end_date`, `alert_thresholds` (INT array `[75, 90, 100]`).

5. **`savings_goals` & `savings_contributions`**
   - Target funds with deadline and target amounts.
   - Tracks current vs target amount and suggested monthly contributions.

### How to Apply the Migration in Supabase

1. Open your Supabase project dashboard: [https://supabase.com/dashboard/project/fyhghyphjdtkmoutuqsj](https://supabase.com/dashboard/project/fyhghyphjdtkmoutuqsj).
2. Go to **SQL Editor** -> **New query**.
3. Copy the entire content of `supabase/setup_complete.sql` and click **Run**.
4. This creates all tables, triggers, seed data, and Row Level Security policies.

> **Email Confirmation Note:** If email confirmation is enabled in Supabase (`Authentication -> Providers -> Email`), new signups will receive a verification link before they can log in with a password. To disable this during development/testing, toggle off **Confirm email** in Supabase Auth settings.

---

## 6. Authentication & Sandbox Mode

The application provides a seamless dual-mode experience:

1. **Live Supabase Mode:**
   - Active when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are provided.
   - Sessions are managed via encrypted cookies using `@supabase/ssr`.
   - Routes starting with `/dashboard`, `/transactions`, `/add-expense`, etc., require an authenticated Supabase user.
   - With a signed-in user, `DataService` reads and writes Supabase only. Any database error is thrown and shown as a toast; it never falls back to localStorage.

2. **Local Sandbox Mode (Zero-Config Preview):**
   - If the user clicks **"Explore Sandbox Demo"** on `/login` or `/signup`, a browser cookie `spendwise_demo_session=true` is set.
   - Middleware allows instant access to all application routes without requiring a registered account.
   - Data is stored locally in `localStorage` and pre-populated with realistic demo transactions, budgets, and goals so all charts and features can be immediately inspected and used.
   - Signing out cleans up the demo cookie and redirects to `/login`.

---

## 7. Deterministic Financial Math & Calculation Rules

All financial calculations in SpendWise AI are strictly deterministic. **AI is never used to compute financial numbers.**

All calculation formulas are located in `src/lib/calculations/finance.ts`:

### 1. Cashflow & Actual Savings
$$\text{Total Income} = \sum_{\text{income}} \text{amount}$$
$$\text{Total Expenses} = \sum_{\text{expense}} \text{amount}$$
$$\text{Remaining Balance} = \text{Total Income} - \text{Total Expenses}$$
$$\text{Actual Savings} = \text{Total Income} - \text{Total Expenses} \quad (\text{Net cashflow retained})$$

### 2. Budget Utilization & Alert Thresholds
$$\text{Utilization (\%)} = \left(\frac{\text{Period Expenses}}{\text{Budget Limit}}\right) \times 100$$
- **On Track:** $< 75\%$
- **Approaching Limit:** $\ge 75\%$ and $< 90\%$ (Warning badge)
- **Critical Threshold:** $\ge 90\%$ and $< 100\%$ (Destructive alert)
- **Over Budget:** $\ge 100\%$ (Ceiling exceeded)

### 3. Essentiality Breakdown
- **Essential:** Core sustenance (Housing, Groceries, Utilities, Healthcare, Basic transport).
- **Optimizable:** Substitutable or reducible costs (Food delivery, cab surges, premium subscriptions).
- **Discretionary:** Leisure, entertainment, shopping, luxury purchases.

### 4. Suggested Monthly Goal Contribution
$$\text{Remaining Goal Amount} = \text{Target Amount} - \text{Current Saved}$$
$$\text{Suggested Monthly} = \frac{\text{Remaining Goal Amount}}{\max(1, \text{Months to Target Date})}$$

### 5. Future Wealth Compound Growth Formula
For principal $P$, annual rate $r$, compounding frequency $n = 12$ (monthly), contribution $PMT$, and time $t$ years:
$$FV = P \left(1 + \frac{r}{n}\right)^{nt} + PMT \cdot \frac{\left(1 + \frac{r}{n}\right)^{nt} - 1}{\frac{r}{n}}$$
With inflation adjustment at rate $i$:
$$FV_{\text{real}} = \frac{FV}{(1 + i)^t}$$

---

## 8. AI Extraction Pipeline

The AI extraction endpoint lives at `src/app/api/ai/extract/route.ts`.

### Workflow
1. User enters natural language text (e.g., *"Spent ₹450 on coffee at Starbucks with friends"*) or speaks into the microphone (transcribed in real-time by browser `webkitSpeechRecognition`).
2. Client sends payload `{ "input": "..." }` to `/api/ai/extract`.
3. **If `OPENAI_API_KEY` is set:**
   - Calls `gpt-4o-mini` with a structured system prompt.
   - Enforces structured JSON output validated with Zod.
   - Extracts: `amount`, `currency`, `category`, `merchant`, `description`, `transaction_type`, `essentiality`, `confidence`, and `reasoning`.
4. **If `OPENAI_API_KEY` is not set (Heuristic Fallback Engine):**
   - Robust regex and NLP parser recognizes English and Hinglish expressions:
     - Regex captures currency tokens: `₹`, `rs`, `rupees`, `inr`.
     - Keyword matching maps categories (`swiggy`/`zomato` $\to$ Food & Dining, `uber`/`ola`/`cab` $\to$ Transportation, `supermarket`/`groceries` $\to$ Groceries, `salary` $\to$ Salary).
     - Assigns essentiality classification and reasonable confidence score.
5. **Transparency & Confirmation Rule:**
   - The AI extraction is loaded into an editable review form on `/add-expense`.
   - The user can adjust category, amount, date, and essentiality before clicking **"Confirm & Save Transaction"**.
   - **Nothing is ever inserted into the database automatically without explicit user confirmation.**

---

## 9. Key Conventions & Best Practices

1. **Hydration & Date Invariant:**
   - Next.js Turbopack throws hydration mismatch warnings if `new Date()` is evaluated during Client Component render or top-level `useMemo`.
   - Always initialize date strings inside `useEffect` or retrieve timestamps from state.
   - Build `YYYY-MM-DD` strings with `toLocalDateString()` from `@/lib/calculations/finance`, never `toISOString().split('T')[0]`, which uses UTC and gives the previous day before 05:30 IST.
   - Date-range logic (reporting periods, budget periods) lives in `finance.ts` so it is covered by the tests.
2. **Path Alias:**
   - Always use `@/` to import from `src/` (e.g. `@/lib/data-service`, `@/components/ui/button`).
3. **Icons:**
   - All icons are imported from `lucide-react`.
4. **Toasts:**
   - Toasts use `sonner` (`toast.success()`, `toast.error()`, `toast.info()`).

---

## 10. How to Run, Test, and Build

### Development Server
```powershell
npm run dev
```
Runs at [http://localhost:3000](http://localhost:3000).

### Run Unit Tests
```powershell
npm test
```
Executes `tests/calculations.test.mjs`, which imports `src/lib/calculations/finance.ts` directly via Node's TypeScript type stripping (Node 22.18+).

### Production Build
```powershell
npm run build
```
Generates optimized static and dynamic routes. All 18 routes must build with 0 TypeScript errors.

---

## 11. Environment Variable Reference (`.env.local`)

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://fyhghyphjdtkmoutuqsj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI Configuration (Optional - parser works without it)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# Regional Defaults
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_CURRENCY=INR
NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Kolkata
```
