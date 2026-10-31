# SpendWise: architecture reference

SpendWise is a personal expense tracker for India: INR, Asia/Kolkata time, English and Hinglish. People add spending by chatting, by voice, from bank statements or from photos. The app classifies each purchase as essential, could-trim or optional, tracks budgets and goals, and explains it all in plain words. Everything runs on Cloudflare.

For setup and deployment, see [README.md](./README.md). For the HTTP API, see [docs/API.md](./docs/API.md). For the AI worker, see [workers/spendwise-ai/README.md](./workers/spendwise-ai/README.md).

## 1. System

```
Browser (React 19 client components)
   │  fetch /api/*  (session cookie spendwise_session)
   ▼
spendwise: Next.js 16 on Workers via OpenNext            https://spendwise.dishis.workers.dev
   ├─ D1 "spendwise-db"          (binding DB)            users, sessions, categories, transactions, budgets,
   │                                                     savings_goals, import_jobs
   ├─ R2 "spendwise-statements"  (binding STATEMENTS)    uploaded statements: <userId>/<jobId>/<file>
   ├─ Rate limit                 (binding AUTH_LIMITER)  sign-in / sign-up / email lookup, 10 per minute per IP
   └─ fetch + Bearer CF_AI_WORKER_SECRET, X-Client-Id: <user id or IP>
        ▼
spendwise-ai: AI worker (workers/spendwise-ai)           https://spendwise-ai.dishis.workers.dev
   ├─ Workers AI   Llama 4 Scout 17B (ENTRY_MODEL)       /v1/entry, /v1/statement, /v1/receipt (vision), payee sorting
   │               Llama 3.3 70B fp8-fast (TEXT_MODEL)   /v1/coach (streamed)
   │               Llama 3.1 8B fast (EXTRACT_MODEL)     /v1/extract (single-expense form helper)
   │               Whisper large v3 turbo (SPEECH_MODEL) /v1/transcribe
   │               env.AI.toMarkdown                     PDF / Excel to text
   ├─ Workflow  spendwise-statement-import (STATEMENT_IMPORT)  background imports, started by /v1/jobs/statement
   ├─ D1 (same database) + R2 (same bucket)              read by the Workflow
   └─ Rate limit (RATE_LIMITER)                          30 requests per minute per client id
```

**Why a separate AI worker:**
- The secret-protected AI surface stays small.
- It deploys and is rate-limited on its own, and it can host the long-running Workflow.
- The app keeps working if it is down: the offline parser takes over and the coach gives basic answers.

## 2. Directory map

```
wrangler.jsonc                 App worker: D1, R2, rate limiter, CF_AI_WORKER_URL
open-next.config.ts            OpenNext adapter config
cloudflare-env.d.ts            Generated binding types (npm run cf-typegen)
migrations/                    0001 init + system categories, 0002 main_goals, 0003 user_type, 0004 import_jobs
workers/spendwise-ai/          AI worker + Workflow (own package.json and wrangler.jsonc)
src/
  app/
    page.tsx                   Landing page
    (auth)/login               Single email-first sign-in / sign-up form (+ "Try the demo")
    (auth)/onboarding          Two steps: who you are (user type, income) and goals
    (dashboard)/dashboard      Home: left to spend, pace chart, where it went, budget rings, recent
    (dashboard)/add-expense    The chat: text, voice, photos, statements, drag and drop, questions
    (dashboard)/transactions   "My spending": search, filters, edit
    (dashboard)/timeline       Day-by-day timeline coloured by kind of purchase
    (dashboard)/budgets|goals  Budgets with alerts; savings goals
    (dashboard)/wealth-simulator  Future planner: Simple view (own data) and Advanced calculator
    (dashboard)/insights       "Ask for advice": streamed coach + what-if sliders
    (dashboard)/reports        Weekly / monthly / yearly reports, CSV export
    (dashboard)/settings       Profile, categories, demo reset
    api/…                      See docs/API.md
  components/ui/               Ledger design system: Money, Metric/MetricStrip, Section, PageHeader, Button,
                               Card, Dialog, Segmented, Progress, Input, Select, Skeleton, EmptyState, ...
  components/layout/           Sidebar, header, dashboard shell, SessionProvider (client-side auth guard)
  lib/
    auth-client.ts             Browser helpers: lookupEmail, signIn, signUp, signOut, demo cookie
    data-service.ts            Single data layer: /api/* when signed in, localStorage in the demo
    chat-memory.ts             Chat history + open questions per account in localStorage
    calculations/finance.ts    Money and date maths, budget periods, spendingWarnings (pure, tested)
    calculations/invest.ts     Future planner maths: lump sum, SIP, FD interest, inflation (pure, tested)
    ai/heuristic-parser.ts     Offline extraction fallback (pure, tested)
    ai/statement-parser.ts     Rule-based statement reader (pure, tested; also bundled into the AI worker)
    ai/dedupe.ts               Duplicate matching for imports and photos (pure, tested; also in the worker)
    ai/payee-match.ts          Loose name matching for "map all <name> payments to …" (pure, tested)
    categories/kinds.ts        Purchase "kinds" and colours used by the timeline and charts
    server/                    env, http (errors, rate limit), auth (PBKDF2, sessions), db (row mappers),
                               schemas (zod), ai-worker client, entry-shared, import-jobs
  types/                       Shared TypeScript types (database, entry, finance)
tests/                         node:test suites importing the real TS modules
```

## 3. Data model (D1)

| Table | Notes |
|---|---|
| `users` | email (unique, case-insensitive), PBKDF2 hash, display name, currency, timezone, language, monthly_income, `user_type`, `main_goals` (JSON) |
| `sessions` | SHA-256 of the session token, user id, `expires_at` |
| `categories` | System categories (`user_id` NULL, fixed ids like `cat-food`, `cat-salary`) plus the user's own; `category_type` expense / income |
| `transactions` | amount, type, category, description, merchant, payment method, date/time, `essentiality`, `entry_method`, `original_input`, `ai_extraction` (JSON: questions, options, payee), confidence, `user_corrected_classification`, `review_status` (confirmed / pending_review / rejected), notes, `import_job_id` |
| `budgets` | Overall or per category, period weekly / monthly / quarterly / yearly, alert thresholds |
| `savings_goals` | Target, saved so far, target date |
| `import_jobs` | Background statement imports: status, pages / steps done, counts, `events` (live log JSON), `skipped_rows`, error |

Rules:
- Signed-in mode never falls back to localStorage. API errors are thrown and shown as a toast.
- Every write is validated with zod (`src/lib/server/schemas.ts`). Category ownership and type are checked (`assertCategoryUsable`, and in bulk updates by SQL).
- D1 allows at most 100 bound parameters per query, so bulk reads and updates go in chunks of 90 ids.

## 4. Auth

- **Sign-in form:** there is one form, at `/login`. You enter an email, then `POST /api/auth/lookup` decides the next step: the password step for an existing account, or "create your account" for a new email.
- **Passwords:** PBKDF2-SHA256 with 100k iterations (the Workers maximum) and a 16-byte salt. They're stored as `pbkdf2_sha256$iterations$salt$hash`.
- **Sessions:** a 32-byte random token in the `spendwise_session` cookie (httpOnly, Secure in production, SameSite=Lax, 30 days). D1 stores only SHA-256(token).
- **No middleware:** OpenNext doesn't support Next 16's Node `proxy.ts`. Instead, every API route calls `requireUser()`, and `SessionProvider` redirects the UI to `/login` when `/api/auth/me` returns 401.
- **Demo:** the `spendwise_demo_session` cookie switches `DataService` to localStorage with generated sample data. AI calls still work (rate-limited per IP). Statements are read inline rather than in the background.
- **Not built yet:** password reset, which needs an email sender.

## 5. AI

Models are set in `workers/spendwise-ai/wrangler.jsonc`, and only Cloudflare-hosted (`@cf/…`) models are used.

**Ground rule:** the AI never computes money. Totals, budgets, warnings and projections come from `src/lib/calculations`. Models classify, read and phrase things; code checks what they return.

### Chat entry (`/add-expense`: `POST /api/ai/entry` → `/v1/entry`)

**What goes to the model.** The message, up to 10 waiting items, the recent turns, the profile (type, income, goals) and this month's spending by category.

**What the model returns:**
- `items`: several purchases per message.
- `feedback`: one sentence, with no numbers.
- `answer_category`: when the message explains what the first open question was for. Long explanations count, e.g. "he's my cousin, I pay him my phone EMI" → Financial Obligations.
- `rule_payee` + `rule_category`: for "map all Prince Kumar payments to travel" and "X is my rapido driver".

**How the app handles items:**
- Complete items are saved straight away, with Undo and Edit on each line.
- Items missing an amount, or with a genuinely unclear category, get a question with tap-to-answer options.

**Amount guard (in the worker).** Every amount must match a number the user actually wrote, used once, and closest to that item's words. Anything else becomes a question. This stops models copying one item's amount onto another.

**Rules (in the client).** A rule applies to every matching open question and every saved entry. Matching uses `namesMatch`, which tolerates typos ("price kumar" → Prince Kumar). Matches are marked `user_corrected_classification` so future imports reuse the choice. A category the user names themselves ("traveling" → Travel) wins over the model's pick.

**Never the same question twice.** A typed answer always resolves the open question. If no category can be worked out, the chat says so instead of repeating itself.

**No AI call needed for:** bare amounts, taps on an option, and "skip".

### Warnings

`spendingWarnings` in `finance.ts` is deterministic. It covers:
- budgets at 75 / 90 / 100%
- spending more than earned this month
- goals that the month's leftover can't fund
- single purchases of 25% or more of income

Warnings are shown under saved entries.

### Bank statements

Statements can be dropped, pasted or attached in the chat: PDF, Excel, CSV or TXT, up to 15 MB in the background and 6 MB inline.

**1. Text.** PDF and Excel go through `env.AI.toMarkdown()`, which marks pages; CSV is parsed in the worker.

**2. Rows.** `parseStatementText` reads regular layouts by rule: one date, one ₹ amount, and "Paid to / Received from / Recharge of / Bill payment of …" per row, as in UPI apps such as Navi, PhonePe and Paytm.
- Amounts, dates, times and direction come from the file. The model can't get them wrong.
- If fewer than 90% of the rows with an amount parse, the reader gives up, and Llama 4 Scout reads the statement page by page. In that fallback the amount guard keeps only amounts that appear in the page text.

**3. Left out:** credit-card bill payments and UPI Lite / wallet top-ups, since they would double count.

**4. Payees.** Payees are grouped, and the model only sorts payee names: business / person / unclear, a category, an essentiality and options, 50 payees per call. Earlier answers for a payee are reused without asking.

**5. Questions** are written in code, never by the model:
- one per person, biggest total first
- only when the payee is a person or unclear, and the total is ₹500 or more
- "Keep all as sorted" accepts the rest

**6. Duplicates.** `findDuplicates` skips anything already recorded: same type, amount within ₹1, date within ±3 days, plus shared words or the same confident category.

**Signed-in users: a background Workflow.**
- `POST /api/statements` puts the file in R2, creates an `import_jobs` row, and calls `/v1/jobs/statement`.
- The Workflow's steps: `load job` → `read file` → `sort payees N` (or `read page N` in the AI fallback) → `check duplicates and save`.
- Each step retries on its own, and each one appends a line to `import_jobs.events`.
- The chat's `ImportJobCard` polls `GET /api/statements/:id` every 1.5 s and shows the live log. The import finishes even if the page is closed, and polling resumes after a reload.
- Rows that need an answer are saved as `pending_review`. `GET /api/statements/:id/review` turns them into grouped questions, and answers go through `PATCH /api/transactions/bulk`.
- "Undo import" deletes by `import_job_id`.

**Demo: inline.** `POST /api/ai/statement` → `/v1/statement` uses the same reader. The client de-duplicates and bulk-saves through `POST /api/transactions/import`.

### Photos (`POST /api/ai/receipt` → `/v1/receipt`)

**What can be read.** The browser downsizes the photo to a JPEG of at most 1600px. Llama 4 Scout (vision) reads bills, receipts, payment screenshots, price tags or the item itself.

**One entry per bill.** A bill becomes one entry for the printed final total. The model must name the printed total line, or the app asks for the amount instead.

**Splits.** "With 2 friends" comes back as a head count, and the worker divides.

**Duplicates and storage.** Bills already recorded are not saved twice; "Add anyway" overrides that. Photos are not stored.

### Coach (`/insights`) and Future planner

- **Coach.** It receives figures the app computed, plus the user type and goals, and its replies are streamed. The prompt forbids new arithmetic and personal investment advice.
- **Future planner, Simple view.** It uses the user's own averages over the last 90 days: income, spending, and could-trim + optional spending. It shows the biggest optional purchases of the last 60 days, and what they or a monthly trim could become at example rates (FD 7%, debt fund 8%, index fund 12%, stocks 14%).
- **Planner AI explanation.** The coach explains the figures in 2–4 sentences and may only quote figures it was given.
- **Future planner, Advanced view.** The full calculator, with editable rates.
- Everything is labelled as examples for learning, not financial advice.

### Memory

Both chats are kept in localStorage per account (`chat-memory.ts`), and the last turns are sent as context. Open questions are kept too. Older saved queues are regrouped one per person when they load.

## 6. Financial maths

All financial calculations are deterministic and unit-tested. They live in `src/lib/calculations/finance.ts` and `invest.ts`.

### Cashflow
$$\text{Income} = \sum_{\text{income}} \text{amount},\qquad \text{Expenses} = \sum_{\text{expense}} \text{amount},\qquad \text{Saved} = \text{Income} - \text{Expenses}$$

### Budgets
$$\text{Used (\%)} = \frac{\text{Spent in period}}{\text{Budget}} \times 100$$
On track below 75%, nearly used at 75–90%, critical at 90–100%, over budget at 100% or more. Periods (weekly / monthly / quarterly / yearly) are computed in local time.

### Essentiality
- **Essential:** rent, groceries, utilities, health, basic commute.
- **Could trim** (`optimizable`): needed but reducible, e.g. food delivery, cabs, subscriptions.
- **Optional** (`discretionary`): wants, e.g. entertainment, gadgets, clothes, trips.

### Goals
$$\text{Suggested monthly} = \frac{\text{Target} - \text{Saved}}{\max(1, \text{months to target date})}$$

### Growth (planner)
Monthly compounding, with $r$ the yearly rate, $t$ years, $P$ a lump sum and $PMT$ a monthly amount:
$$FV = P\left(1+\tfrac{r}{12}\right)^{12t} + PMT\cdot\frac{\left(1+\tfrac{r}{12}\right)^{12t}-1}{r/12}$$
In today's money at inflation $i$: $FV_{\text{real}} = FV / (1+i)^t$. Monthly FD-style interest is $P \cdot r / 12$.

## 7. Design: "Ledger"

Drawn from Mercury, Linear, Stripe and Copilot Money:

- **Layout:** a warm paper canvas (`--canvas`) with content on a raised sheet (`--card`, `shadow-sheet`).
- **Few boxes:** sections are separated by whitespace and hairlines, not cards.
- **Type:** Instrument Serif (`font-display`) for page titles and the single hero figure on a page; Geist for everything else.
- **Amounts:** always `<Money>`, with tabular figures and small raised paise. A row of figures is a `MetricStrip`.
- **Colour:** ink (`bg-primary`) for primary buttons, and one signature colour, `--brand` emerald, for progress, active state and positive amounts. Kind colours appear only in data dots, bars and tiles. Status colours are `success`, `warning` and `destructive`; spending types use `--essential`, `--trim` and `--optional`.
- **Charts:** no containers or grid lines, the primary series in `var(--brand)`, comparisons dashed.
- **Light and dark** are both defined in `globals.css`.

## 8. Conventions

1. **Dates.** Never evaluate `new Date()` during render (it causes hydration mismatches); set dates in effects.
   - Build `YYYY-MM-DD` with `toLocalDateString()`, never `toISOString().split('T')[0]`, which gives the previous day before 05:30 IST.
   - Period ranges live in `finance.ts`.
2. **Imports.** `@/` maps to `src/`.
   - Modules the tests import must have no relative runtime imports (type-only imports are fine), so Node can strip types and load them directly.
   - Code shared with the AI worker (`statement-parser`, `dedupe`) must be pure.
3. **Copy.** Keep it friendly and plain, for people who aren't comfortable with technology: no jargon, no emoji, no exclamation spam.
4. **Icons:** lucide-react. **Toasts:** sonner.
5. **Next.js 16.** This version has breaking changes. Read `node_modules/next/dist/docs/` before using an unfamiliar API (see `AGENTS.md`).
