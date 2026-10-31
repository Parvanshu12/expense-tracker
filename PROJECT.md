# SpendWise — Architecture reference

Personal expense tracker for India (INR, Asia/Kolkata, English and Hinglish). Note expenses in a sentence or by voice, classify spending as essential / could-trim / optional, track budgets and goals, and ask an AI coach grounded in the app's own figures. Everything runs on Cloudflare.

## 1. System

```
Browser (React 19 client components)
   │  fetch /api/*            (session cookie)
   ▼
spendwise  — Next.js 16 on Workers via OpenNext       https://spendwise.dishis.workers.dev
   ├─ D1  "spendwise-db" (binding DB)                 users, sessions, categories, transactions, budgets, savings_goals
   ├─ Rate limit (binding AUTH_LIMITER)               sign-in / sign-up / email lookup, per IP
   └─ fetch + Bearer CF_AI_WORKER_SECRET
        ▼
spendwise-ai — separate Worker (workers/spendwise-ai) https://spendwise-ai.dishis.workers.dev
   ├─ Workers AI  @cf/meta/llama-3.1-8b-instruct-fast   POST /v1/extract   (JSON mode, ~1.2 s)
   ├─ Workers AI  @cf/meta/llama-3.3-70b-instruct-fp8-fast  POST /v1/coach (streamed plain text)
   ├─ Workers AI  @cf/openai/whisper-large-v3-turbo     POST /v1/transcribe
   └─ Rate limit (binding RATE_LIMITER)               30 req/min per user id or IP
```

Why a separate AI worker: the secret-protected AI surface stays small, can be deployed and rate-limited on its own, and the app keeps working (offline parser, basic coach answers) if it is down.

## 2. Directory map

```
wrangler.jsonc               App worker config: D1, rate limiter, vars
open-next.config.ts          OpenNext adapter config
cloudflare-env.d.ts          Generated binding types (npm run cf-typegen)
migrations/                  D1 schema: 0001 init + categories, 0002 main_goals, 0003 user_type
workers/spendwise-ai/        AI worker (own package.json and wrangler.jsonc)
src/
  app/
    page.tsx                 Landing page
    (auth)/login             Single email-first sign-in / sign-up form
    (auth)/signup            Redirects to /login
    (auth)/onboarding        Two-step setup after sign-up
    (dashboard)/*            App pages (wrapped by SessionProvider + sidebar shell)
    api/auth/*               lookup, login, signup, logout, me
    api/profile|categories|transactions|budgets|goals   CRUD, all scoped to the session user
    api/ai/extract|coach|transcribe|status              Proxies to the AI worker
  components/ui/*            Monochrome design system (Button, Card, Dialog, Segmented, Stat, ...)
  components/layout/*        Sidebar, header, SessionProvider (client-side auth guard)
  lib/
    auth-client.ts           Browser helpers: lookupEmail, signIn, signUp, signOut, sandbox cookie
    data-service.ts          Single data layer: /api/* when signed in, localStorage in demo mode
    calculations/finance.ts  All money and date maths (pure, unit-tested)
    ai/heuristic-parser.ts   Offline extraction fallback (pure, unit-tested)
    server/                  env, http (errors, rate limit), auth (PBKDF2, sessions), db (row mappers), schemas (zod)
  types/                     Shared TypeScript types
tests/calculations.test.mjs  node:test suite importing the real TS modules
```

## 3. Auth

- One form at `/login`: enter email → `POST /api/auth/lookup` → password step (existing account) or "create your account" step (new email).
- Passwords: PBKDF2-SHA256, 100k iterations (the Workers maximum), 16-byte salt, stored as `pbkdf2_sha256$iterations$salt$hash`.
- Sessions: 32-byte random token in the `spendwise_session` cookie (httpOnly, Secure in production, SameSite=Lax, 30 days). D1 stores only SHA-256(token).
- There is no middleware (OpenNext does not support Next 16's Node `proxy.ts`). Every API route calls `requireUser()`; `SessionProvider` redirects the UI to `/login` when `/api/auth/me` returns 401.
- Demo: the `spendwise_demo_session` cookie switches `DataService` to localStorage with generated sample data. No server data is involved.
- Not built yet: password reset (needs an email sender).

## 4. Data rules

- Signed-in mode never falls back to localStorage; any API error is thrown and shown as a toast.
- Server validates every write with zod (`src/lib/server/schemas.ts`) and checks category ownership and type (`assertCategoryUsable`).
- System categories have fixed ids (`cat-food`, `cat-salary`, ...) shared by D1 and demo mode.

## 5. AI

Models (in `workers/spendwise-ai/wrangler.jsonc`): chat entry and statements use **Llama 4 Scout** (picked by benchmark: 9/9 on our test set, ~3 s median), the coach uses Llama 3.3 70B, voice uses Whisper.

- **Chat entry** (`/add-expense`, `POST /api/ai/entry` → `/v1/entry`): one message can hold several purchases. The app sends the message, waiting items, recent turns, the user's profile (type, income, goals) and this month's spending by category. The model returns items plus one short `feedback` sentence (no numbers). Items missing an amount, or whose category is genuinely unclear, come back with `needs` + a question (+ tap-to-answer `options`); everything else is saved straight away with Undo/Edit on each line. Bare amounts and option taps are resolved on the client without an AI call.
- **Amount guard** (worker): every amount must match a number the user actually wrote, used once, closest to that item's words; anything else becomes a question. Stops models copying one item's amount onto another.
- **Warnings** (`spendingWarnings` in `finance.ts`, deterministic): budgets at 75/90/100%, spending more than earned this month, goals the month's leftover can't fund, single purchases ≥25% of income. Shown under saved entries.
- **Bank statements** (paperclip in the chat, `POST /api/ai/statement` → `/v1/statement`): PDF/Excel via `env.AI.toMarkdown()`, CSV parsed in the worker; read in parallel chunks; amounts must appear in the text; card bill payments and own-account transfers are dropped. The client skips rows already recorded (`findDuplicates`: same type, amount ±₹1, date ±3 days, plus shared words or same category), bulk-saves the rest (`POST /api/transactions/import`, D1 batch), and asks about unclear payments one by one. "Undo import" removes the batch. Password-protected PDFs are rejected with instructions.
- **Photos** (camera button in the chat, `POST /api/ai/receipt` → `/v1/receipt`): the browser downsizes the photo to ≤1600px JPEG; Llama 4 Scout (vision) reads bills, receipts, payment screenshots, price tags or the item itself. A bill becomes one entry for the printed final total; the model must name the printed total line ("GRAND TOTAL", "MRP"...) or the app asks for the amount instead. Splits ("with 2 friends") come back as a head count and the worker divides. Any typed text is sent as a caption. Bills already in the ledger are not saved twice (`findDuplicates`), with an "Add anyway" button. Photos are not stored.
- **Coach** (`/insights`): figures computed by the app plus user type and goals; streamed. The prompt forbids new arithmetic and investment advice.
- **Memory**: both chats are kept in localStorage per account (`src/lib/chat-memory.ts`) and the last turns are sent as context.

## 6. Financial maths (`src/lib/calculations/finance.ts`)


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

## 7. Conventions

1. **Dates:** never evaluate `new Date()` during render; set date strings in effects. Build `YYYY-MM-DD` with `toLocalDateString()`, never `toISOString().split('T')[0]` (UTC is the previous day before 05:30 IST). Period ranges live in `finance.ts`.
2. **Design:** semantic tokens only (`bg-background`, `text-muted-foreground`, `border-border`, `var(--chart-1..5)`). The only hue is `destructive`. Figures use the `tabular` class.
3. **Imports:** `@/` → `src/`. Modules imported by the tests must use type-only imports so Node can strip them.
4. **Icons:** lucide-react. **Toasts:** sonner.

## 8. Run, test, deploy

See [README.md](./README.md).
