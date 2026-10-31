# SpendWise AI — Personal Finance & Expense Intelligence

[![Next.js](https://img.shields.io/badge/Next.js-16.4.3-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-15%2F15%20Passing-brightgreen?style=flat)]()

> **Understand Your Spending. Make Smarter Money Decisions.**

SpendWise AI is an AI-powered personal expense intelligence platform that helps people understand where their money goes, classify essential vs. discretionary expenditures, set intelligent budgets with proactive alert thresholds, capture expenses via natural language and voice, and model long-term compound wealth growth.

---

## 🚀 Quick Start (Zero Config Demo)

SpendWise AI comes with an out-of-the-box **Local Sandbox Mode**, which means you can run and test every single feature locally without needing any API keys or backend setup!

```bash
# 1. Clone the repository
git clone <repository-url>
cd "Expense Tracker"

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. On the login or signup page, click **"Explore Sandbox Demo"** to immediately jump into a fully populated, interactive dashboard!

---

## 📖 Complete Technical Reference

For developers, AI assistants, and engineers transferring this project to a new laptop, workspace, or IDE:

👉 **Please read [PROJECT.md](./PROJECT.md) for the exhaustive technical reference**, including:
- Complete system architecture and directory map
- Supabase database schema, RLS policies, and SQL setup scripts
- Deterministic financial mathematics & formulas
- Server-side AI natural language and voice extraction pipeline
- Authentication and session fallback mechanics

---

## 🌟 Key Features

1. **Smart Expense Capture:**
   - **Natural Language Parsing:** Type e.g., *"Paid ₹1,400 for electricity bill yesterday"* or *"Spent 350 on Uber cab at 8 PM"*.
   - **Voice Input:** One-tap microphone transcription via browser Web Speech API.
   - **Manual Form:** Structured entry with date, time, category, merchant, and payment method.
   - **Verification Safeguard:** All extractions are presented in an editable review dialog. Nothing is saved without explicit user confirmation.
2. **Essentiality Classification:**
   - Expenses are tagged as **Essential** (housing, groceries, utilities), **Optimizable** (food delivery, cab rides), or **Discretionary** (leisure, entertainment).
3. **Real-time Financial Dashboard:**
   - 5 Top KPI Cards: Total Income, Total Expenses, Remaining Balance, Actual Savings, and Monthly Budget Utilization.
   - Cashflow Trends & Essentiality Donut chart using Recharts.
   - Dynamic reporting period filter: *7 Days, This Month, Last Month, 3 Months, YTD, All Time*.
4. **Active Budgets & Alerts:**
   - Overall monthly spending ceiling and category-specific budgets.
   - Automatic badges at **75%** (Approaching Limit), **90%** (Critical), and **100%+** (Over Budget).
5. **Conversational AI Money Coach:**
   - Chat assistant that answers queries like *"Where did most of my money go?"* or *"How much did I spend on food?"* strictly grounded in verified ledger data.
   - Interactive potential savings sliders demonstrating monthly and annual savings by trimming optional spending.
6. **Financial Reports & CSV Export:**
   - Weekly, Monthly, and Annual summaries with instant CSV download and print-ready CSS styling.
7. **Savings Goals:**
   - Target funds with automated calculation of suggested monthly contributions.
   - One-click contribution deposit tracking and deletion.
8. **20-Year Wealth Projection Simulator:**
   - Educational compound interest simulator with inflation adjustment comparing Conservative (7%), Moderate (10%), and Aggressive (12%) scenarios.
9. **Settings & Themes:**
   - Light and Dark modes.
   - Configurable currency (default: ₹ INR), timezone (`Asia/Kolkata`), and language mode (English / Hinglish).

---

## 🛠️ Database Setup (Supabase)

To connect your own remote Supabase database:

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase project dashboard.
3. Copy and run the complete setup script in `supabase/setup_complete.sql`.
4. Copy your project credentials into `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```

---

## 🧪 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts local Next.js development server at `localhost:3000` |
| `npm test` | Runs the calculation tests against `src/lib/calculations/finance.ts` (Node 22.18+) |
| `npm run build` | Builds the production bundle (verifies 0 TypeScript errors) |
| `npm run start` | Starts the production Next.js server |
| `npm run lint` | Runs Next.js ESLint checks |

---

## 🔒 Security & Privacy

- **Server-Side AI:** OpenAI keys and AI calls never touch the client browser.
- **Row-Level Security (RLS):** All Supabase tables enforce user isolation.
- **Data Integrity:** All calculations are strictly deterministic.

---

## 📄 License

MIT License. Designed and engineered for personal financial empowerment.
