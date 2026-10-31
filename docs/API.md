# SpendWise HTTP API

These are the routes under `/api`, served by the Next.js app on Cloudflare Workers.

## Basics

- **Format.** Requests and responses are JSON, except where noted. Errors are `{ "error": "message" }` with a 4xx or 5xx status.
- **Validation.** Every body is checked with zod (`src/lib/server/schemas.ts`), and validation errors are 400s.
- **Session.** The browser sends the `spendwise_session` cookie (httpOnly) automatically. Routes marked **auth** return 401 without a valid session. Every query is scoped to the signed-in user.
- **Demo users** have no server data. Their data lives in localStorage, and only the `/api/ai/*` routes are used, rate-limited per IP.
- **Limits.**
  - Sign-in routes: 10 requests per minute per IP (`AUTH_LIMITER`).
  - AI routes: 30 per minute per user or IP, enforced by the AI worker. They return 429 when exceeded.
- **Field types:**
  - Amounts are positive numbers in rupees.
  - Dates are `YYYY-MM-DD` and times are `HH:MM`, both in the user's local time.
  - `essentiality` is `essential`, `optimizable` (could trim) or `discretionary` (optional).

## Auth

| Method and path | Body | Returns |
|---|---|---|
| `POST /api/auth/lookup` | `{ email }` | `{ exists: boolean }`. Step one of the single sign-in form |
| `POST /api/auth/login` | `{ email, password }` | `{ ok: true }` and sets the session cookie |
| `POST /api/auth/signup` | `{ email, password (8–128 chars), displayName? }` | `{ ok: true }` (201) and sets the session cookie |
| `POST /api/auth/logout` | – | Clears the session |
| `GET /api/auth/me` | – | `{ user }` (profile plus email) or 401 |

## Profile and categories (auth)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/profile` | – | `{ profile }` |
| `PATCH /api/profile` | Any of: `display_name`, `currency`, `timezone`, `language` (`en` / `hinglish`), `monthly_income`, `main_goals[]`, `user_type` (`salaried`, `business`, `freelancer`, `student`, `homemaker`, `retired`) | `{ profile }` |
| `GET /api/categories` | – | `{ categories }`: system plus your own |
| `POST /api/categories` | `{ name, category_type, icon? }` | `{ category }` |
| `DELETE /api/categories/:id` | – | Your own categories only |

## Transactions (auth)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/transactions` | – | `{ transactions }`, newest first (by date, then created), with `category` joined |
| `POST /api/transactions` | A transaction (below) | `{ transaction }` |
| `POST /api/transactions/import` | `{ transactions: [...] }` (1–500) | `{ transactions }` in the same order. All or nothing; each category must exist and match the type |
| `PATCH /api/transactions/:id` | Any of: `category_id`, `amount`, `description`, `merchant`, `payment_method`, `purchase_date`, `purchase_time`, `essentiality`, `user_corrected_classification`, `review_status`, `notes` | `{ transaction }` |
| `PATCH /api/transactions/bulk` | `{ ids: [...] (1–1000), changes: { category_id?, essentiality?, review_status?, user_corrected_classification?, notes? } }` | `{ updated }`. A category only applies to entries of its own type |
| `DELETE /api/transactions/:id` | – | |

A transaction body has these fields:

| Field | Required? | Default |
|---|---|---|
| `category_id` | required | |
| `transaction_type` (`expense` / `income`) | required | |
| `amount` | required | |
| `description` | required | |
| `purchase_date` | required | |
| `currency` | optional | `INR` |
| `merchant` | optional | |
| `payment_method` | optional | |
| `purchase_time` | optional | |
| `entry_method` (`manual` / `ai_text` / `ai_voice`) | optional | |
| `original_input` | optional | |
| `ai_extraction` | optional | |
| `essentiality` | optional | |
| `classification_confidence` | optional | |
| `classification_reason` | optional | |
| `user_corrected_classification` | optional | |
| `review_status` (`confirmed` / `pending_review` / `rejected`) | optional | |
| `notes` | optional | |

When you choose a category yourself, `user_corrected_classification: true` is stored, and later statement imports reuse that choice for the same payee.

## Budgets and goals (auth)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/budgets` | – | `{ budgets }` |
| `POST /api/budgets` | `{ category_id (null for overall), amount, period_type (weekly / monthly / quarterly / yearly), start_date, end_date?, alert_thresholds? ([75, 90, 100]) }` | `{ budget }` |
| `DELETE /api/budgets/:id` | – | |
| `GET /api/goals` | – | `{ goals }` |
| `POST /api/goals` | `{ name, target_amount, current_amount?, target_date, description? }` | `{ goal }` |
| `PATCH /api/goals/:id` | Any goal field | `{ goal }` |
| `DELETE /api/goals/:id` | – | |

## Background statement imports (auth)

| Method and path | Body | Returns |
|---|---|---|
| `POST /api/statements` | `{ file: base64, filename }`: .pdf .csv .txt .xlsx .xls .ods, ≤15 MB | `{ job }`. Stores the file in R2 and starts the Workflow |
| `GET /api/statements` | – | `{ jobs }`: the last 10 |
| `GET /api/statements/:id` | – | `{ job }`. Poll this every ~1.5 s for live progress |
| `GET /api/statements/:id/review` | – | `{ transactions }`: entries saved as `pending_review`, with `ai_extraction.{question, options, payee}` |
| `POST /api/statements/:id/undo` | – | `{ removed }`. Deletes everything that import saved |

A `job` looks like this:

```json
{
  "id": "…", "filename": "statement.pdf",
  "status": "queued | reading | extracting | saving | done | failed | undone",
  "total_pages": 5, "pages_done": 2,
  "found": 545, "added": 530, "skipped": 8, "needs_review": 141,
  "events": [{ "at": "2026-10-31T10:20:16Z", "text": "Found 545 transactions on 78 pages, …" }],
  "skipped_rows": [{ "description": "…", "amount": 921.6, "date": "2026-10-29", "matched": "Zomato dinner" }],
  "error": null, "created_at": "…", "updated_at": "…"
}
```

The meaning of `total_pages` and `pages_done` depends on how the file is read:
- **Rule-based read** (the usual case): they count payee-sorting steps.
- **AI fallback:** they count pages.

## AI (signed in or demo)

These routes call the AI worker. Nothing is written to the database here: the client saves what comes back. When the AI worker is unavailable, entry and extract fall back to the offline parser (`source: "heuristic"`) and the coach gives a basic answer.

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/ai/status` | – | `{ enabled }`: whether the AI worker is configured |
| `POST /api/ai/entry` | `{ message, pending?: [{ ref, description, category, transaction_type, amount?, needs? }] (≤10), history? (≤12 turns), today?, timezone?, currency?, profile?, context? }` | `EntryResponse` (below) |
| `POST /api/ai/receipt` | `{ image: base64 (≤4 MB), mimeType, note?, today?, timezone?, profile?, context? }` | `{ items, reply, feedback, seen, source }` |
| `POST /api/ai/statement` | `{ file: base64, filename, today?, profile? }` (≤6 MB, inline, used by the demo) | `{ items, truncated }` |
| `POST /api/ai/coach` | `{ question (≤500), history?, language?, context }` (`context` is figures the app computed, < 6 KB) | Streamed `text/plain` |
| `POST /api/ai/transcribe` | `{ audio: base64, language? }` | `{ text }` |
| `POST /api/ai/extract` | `{ input, ... }` | `{ data, source, model }`: one extracted transaction (form helper) |

`EntryResponse` looks like this:

```json
{
  "items": [{
    "ref": null, "transaction_type": "expense", "amount": 450, "description": "Lunch",
    "merchant": "Swiggy", "category_id": "cat-food", "category": "Food & Dining",
    "purchase_date": "2026-10-31", "payment_method": "UPI", "essentiality": "optimizable",
    "confidence": 0.9, "needs": null, "question": null, "options": []
  }],
  "answer": { "category_id": "cat-finance", "category": "Financial Obligations" },
  "rule": { "payee": "price kumar", "category_id": "cat-travel", "category": "Travel", "transaction_type": "expense" },
  "reply": "Got it.",
  "feedback": "Lunch out is fine now and then; packing it twice a week would stretch the food budget.",
  "source": "workers-ai"
}
```

- **`needs`.** Set to `"amount"` or `"category"` when the item can't be saved yet. `question` and `options` then say what to ask.
- **`answer`.** Present when the message explains what the first waiting item was for.
- **`rule`.** Present for "map all X payments to Y". The client applies it to every matching open question and saved entry.
